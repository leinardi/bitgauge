/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

// Package testenv gives the Docker-based tests -- test/image and the accuracy harness runners --
// isolated, labeled environments driven through the docker CLI (testing.md section 5.1).
//
// Every resource an environment creates carries four labels: its envid, its owner (hostname and
// PID of the go test process), when it started, and, on the marker of an environment kept after a
// failure, keep=true. Cleanup is scoped by them: Down removes only the current envid, and the
// stale sweep removes another envid only when it is provably abandoned (see Sweep).
//
// The package is untagged so its rules are unit-tested in every go test run; nothing here starts
// a container unless a tagged test asks it to.
package testenv

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	// EnvProvider selects the provider; docker is the only one.
	EnvProvider = "BITGAUGE_TEST_PROVIDER"
	// EnvKeepOnFailure keeps a failed environment's resources for inspection when set to 1.
	EnvKeepOnFailure = "BITGAUGE_TEST_KEEP_ON_FAILURE"

	providerDocker = "docker"
	keepMarker     = "keep"
	downTimeout    = 2 * time.Minute

	// docker CLI words used by more than one command.
	dockerLabel   = "--label"
	dockerFilter  = "--filter"
	dockerList    = "ls"
	dockerNetwork = "network"
	dockerVolume  = "volume"
	dockerRemove  = "rm"
	dockerFormat  = "--format"
)

var (
	errUnknownProvider = errors.New("unknown test provider")
	errDocker          = errors.New("docker command failed")
)

// Runner runs one docker CLI command and returns its standard output.
type Runner interface {
	Run(ctx context.Context, args ...string) (string, error)
}

// DockerCLI runs the docker binary found on PATH.
type DockerCLI struct {
	Logger *slog.Logger
}

// Run runs docker with args. The arguments are logged redacted; the output is not logged at all.
func (d DockerCLI) Run(ctx context.Context, args ...string) (string, error) {
	if d.Logger != nil {
		d.Logger.DebugContext(ctx, "docker", slog.Any("args", args))
	}

	var stdout, stderr bytes.Buffer

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf(
			"%w: docker %s: %w: %s",
			errDocker,
			strings.Join(RedactArgs(args), " "),
			err,
			strings.TrimSpace(stderr.String()),
		)
	}

	return stdout.String(), nil
}

// Spec configures one environment.
type Spec struct {
	// EnvID is generated when empty.
	EnvID string
	// KeepOnFailure keeps the resources of a failed environment, marked keep=true.
	KeepOnFailure bool
	// Logger defaults to a redacting logger on stderr.
	Logger *slog.Logger
}

// SpecFromEnv returns a Spec with KeepOnFailure read from BITGAUGE_TEST_KEEP_ON_FAILURE.
func SpecFromEnv() Spec {
	return Spec{KeepOnFailure: os.Getenv(EnvKeepOnFailure) == "1"}
}

// Env is one live environment.
type Env struct {
	ID            string
	Owner         Owner
	Started       time.Time
	KeepOnFailure bool
	Logger        *slog.Logger
	runner        Runner
}

// Provider brings environments up and down.
type Provider interface {
	Name() string
	Up(ctx context.Context, spec Spec) (*Env, error)
	Down(ctx context.Context, env *Env, failed bool) error
}

// New returns the provider selected by BITGAUGE_TEST_PROVIDER; docker is the default and the only
// one.
//
//nolint:ireturn // the factory exists to hide which provider was picked.
func New() (Provider, error) {
	name := os.Getenv(EnvProvider)
	if name == "" || name == providerDocker {
		return NewDockerProvider(DockerCLI{Logger: NewLogger(os.Stderr)}), nil
	}

	return nil, fmt.Errorf("%w %q; supported: %s", errUnknownProvider, name, providerDocker)
}

// DockerProvider creates environments on the local Docker daemon through the CLI.
type DockerProvider struct {
	runner Runner
	now    func() time.Time
}

// NewDockerProvider returns a provider that runs docker commands through runner.
func NewDockerProvider(runner Runner) *DockerProvider {
	return &DockerProvider{runner: runner, now: time.Now}
}

// Name returns "docker".
func (*DockerProvider) Name() string { return providerDocker }

// Up registers a new environment. It creates nothing: resources are created by the test through
// Env.Docker, which labels them.
func (p *DockerProvider) Up(_ context.Context, spec Spec) (*Env, error) {
	envID := spec.EnvID
	if envID == "" {
		generated, err := GenerateEnvID()
		if err != nil {
			return nil, err
		}

		envID = generated
	}

	owner, err := CurrentOwner()
	if err != nil {
		return nil, err
	}

	logger := spec.Logger
	if logger == nil {
		logger = NewLogger(os.Stderr)
	}

	return &Env{
		ID:            envID,
		Owner:         owner,
		Started:       p.now().UTC().Truncate(time.Second),
		KeepOnFailure: spec.KeepOnFailure,
		Logger:        logger.With(slog.String("envid", envID)),
		runner:        p.runner,
	}, nil
}

// Down removes the environment's resources, and only those. A failed environment with
// KeepOnFailure set is kept instead: a keep=true marker is created, so the stale sweep leaves it
// alone, and its envid is logged for inspection.
func (p *DockerProvider) Down(ctx context.Context, env *Env, failed bool) error {
	if failed && env.KeepOnFailure {
		_, err := env.Docker(
			ctx,
			dockerNetwork,
			"create",
			"--internal",
			dockerLabel,
			LabelKeep+"=true",
			ResourceName(env.ID, keepMarker),
		)
		if err != nil {
			return fmt.Errorf("mark %s kept: %w", env.ID, err)
		}

		env.Logger.WarnContext(
			ctx,
			"kept the failed environment for inspection; the stale sweep leaves it alone",
			slog.String("filter", LabelFilter(env.ID)),
		)

		return nil
	}

	return RemoveEnv(ctx, p.runner, env.ID)
}

// Labels returns the --label arguments every resource of the environment carries.
func (e *Env) Labels() []string {
	return []string{
		dockerLabel, LabelEnvID + "=" + e.ID,
		dockerLabel, LabelOwner + "=" + e.Owner.String(),
		dockerLabel, LabelStarted + "=" + e.Started.Format(time.RFC3339),
	}
}

// Name returns the name of one resource of the environment.
func (e *Env) Name(base string) string {
	return ResourceName(e.ID, base)
}

// Docker runs a docker command. For a command that creates a container, network or volume, the
// environment's labels are inserted after the subcommand, so nothing it creates is unlabeled.
func (e *Env) Docker(ctx context.Context, args ...string) (string, error) {
	out, err := e.runner.Run(ctx, withLabels(args, e.Labels())...)
	if err != nil {
		return "", fmt.Errorf("environment %s: %w", e.ID, err)
	}

	return out, nil
}

// CleanupT is the part of testing.TB that Cleanup needs.
type CleanupT interface {
	Cleanup(fn func())
	Failed() bool
	Errorf(format string, args ...any)
}

// Cleanup registers Down with the test, so the environment goes when the test ends, kept or not
// depending on whether it failed. The test's own context is already canceled by then, so Down
// gets a fresh one.
func (e *Env) Cleanup(test CleanupT, provider Provider) {
	test.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), downTimeout)
		defer cancel()

		err := provider.Down(ctx, e, test.Failed())
		if err != nil {
			test.Errorf("tear down environment %s: %v", e.ID, err)
		}
	})
}

// creating are the docker subcommands that create a labeled resource, with the number of words
// that name the subcommand.
var creating = map[string]int{
	"run":              1,
	"create":           1,
	"container run":    2,
	"container create": 2,
	"network create":   2,
	"volume create":    2,
}

func withLabels(args, labels []string) []string {
	for subcommand, words := range creating {
		if len(args) < words || strings.Join(args[:words], " ") != subcommand {
			continue
		}

		labeled := make([]string, 0, len(args)+len(labels))
		labeled = append(labeled, args[:words]...)
		labeled = append(labeled, labels...)

		return append(labeled, args[words:]...)
	}

	return args
}

// RemoveEnv removes every container, network and volume labeled with envID, containers first so
// the networks and volumes they hold are free.
func RemoveEnv(ctx context.Context, runner Runner, envID string) error {
	filter := LabelFilter(envID)

	for _, kind := range []struct {
		list   []string
		remove []string
	}{
		{[]string{"ps", "-aq", dockerFilter, filter}, []string{dockerRemove, "-f", "-v"}},
		{[]string{dockerNetwork, dockerList, "-q", dockerFilter, filter}, []string{dockerNetwork, dockerRemove}},
		{[]string{dockerVolume, dockerList, "-q", dockerFilter, filter}, []string{dockerVolume, dockerRemove, "-f"}},
	} {
		out, err := runner.Run(ctx, kind.list...)
		if err != nil {
			return fmt.Errorf("list resources of %s: %w", envID, err)
		}

		ids := strings.Fields(out)
		if len(ids) == 0 {
			continue
		}

		_, err = runner.Run(ctx, append(kind.remove, ids...)...)
		if err != nil {
			return fmt.Errorf("remove resources of %s: %w", envID, err)
		}
	}

	return nil
}
