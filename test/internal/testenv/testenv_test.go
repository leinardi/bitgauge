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

package testenv

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"math"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeDocker answers docker commands from a table and records every command it was given, so the
// rules are tested without a daemon. An unknown command answers with no output.
type fakeDocker struct {
	mu       sync.Mutex
	answers  map[string]string
	commands []string
}

func (f *fakeDocker) Run(_ context.Context, args ...string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	command := strings.Join(args, " ")
	f.commands = append(f.commands, command)

	return f.answers[command], nil
}

func (f *fakeDocker) ran(prefix string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	var matched []string

	for _, command := range f.commands {
		if strings.HasPrefix(command, prefix) {
			matched = append(matched, command)
		}
	}

	return matched
}

func quietLogger() *slog.Logger {
	return NewLogger(io.Discard)
}

func TestGenerateEnvID(t *testing.T) {
	t.Parallel()

	first, err := GenerateEnvID()
	if err != nil {
		t.Fatal(err)
	}

	second, err := GenerateEnvID()
	if err != nil {
		t.Fatal(err)
	}

	if len(first) != 8 || strings.Trim(first, "0123456789abcdef") != "" {
		t.Errorf("env ID %q is not 8 hex characters", first)
	}

	if first == second {
		t.Errorf("two env IDs are both %q", first)
	}

	if got := ResourceName(first, "bitgauge"); got != "bitgauge-test-"+first+"-bitgauge" {
		t.Errorf("ResourceName = %q", got)
	}
}

func TestParseOwner(t *testing.T) {
	t.Parallel()

	owner, err := ParseOwner("host:with:colons:4242")
	if err != nil || owner != (Owner{Host: "host:with:colons", PID: 4242}) {
		t.Errorf("ParseOwner = %+v, %v", owner, err)
	}

	if owner.String() != "host:with:colons:4242" {
		t.Errorf("String = %q", owner.String())
	}

	for _, bad := range []string{"", "host", ":42", "host:", "host:abc", "host:0", "host:-1"} {
		_, err = ParseOwner(bad)
		if err == nil {
			t.Errorf("ParseOwner(%q) succeeded", bad)
		}
	}
}

// TestEveryCreatedResourceIsLabeled pins that nothing an environment creates escapes its labels:
// an unlabeled resource is one no cleanup or sweep can ever find.
func TestEveryCreatedResourceIsLabeled(t *testing.T) {
	t.Parallel()

	runner := &fakeDocker{}
	env := upEnv(t, runner, Spec{EnvID: "abcd1234"})

	for _, command := range [][]string{
		{"run", "-d", "image"},
		{"create", "image"},
		{"container", "run", "image"},
		{"container", "create", "image"},
		{"network", "create", "--internal", "net"},
		{"volume", "create", "vol"},
	} {
		_, err := env.Docker(t.Context(), command...)
		if err != nil {
			t.Fatal(err)
		}
	}

	_, err := env.Docker(t.Context(), "exec", "container", "true")
	if err != nil {
		t.Fatal(err)
	}

	for _, command := range runner.commands {
		labeled := strings.Contains(command, "--label "+LabelEnvID+"=abcd1234") &&
			strings.Contains(command, "--label "+LabelOwner+"=") &&
			strings.Contains(command, "--label "+LabelStarted+"=")

		if strings.HasPrefix(command, "exec ") {
			if strings.Contains(command, "--label") {
				t.Errorf("a command that creates nothing was labeled: %s", command)
			}

			continue
		}

		if !labeled {
			t.Errorf("created without the environment's labels: %s", command)
		}
	}

	if got := runner.commands[0]; !strings.HasPrefix(got, "run --label ") ||
		!strings.HasSuffix(got, " -d image") {
		t.Errorf("the labels are not inserted after the subcommand: %s", got)
	}
}

// TestDownRemovesOnlyItsOwnEnvironment pins the scope of normal cleanup.
func TestDownRemovesOnlyItsOwnEnvironment(t *testing.T) {
	t.Parallel()

	runner := &fakeDocker{answers: map[string]string{
		"ps -aq --filter " + LabelFilter("mine0000"):        "c1\nc2\n",
		"network ls -q --filter " + LabelFilter("mine0000"): "n1\n",
	}}
	provider := NewDockerProvider(runner)
	env := upEnv(t, runner, Spec{EnvID: "mine0000"})

	err := provider.Down(t.Context(), env, false)
	if err != nil {
		t.Fatal(err)
	}

	for _, list := range runner.ran("") {
		if strings.Contains(list, "--filter") && !strings.Contains(list, LabelFilter("mine0000")) {
			t.Errorf("Down listed beyond its own envid: %s", list)
		}
	}

	if got := runner.ran("rm "); !slices.Equal(got, []string{"rm -f -v c1 c2"}) {
		t.Errorf("container removals = %q", got)
	}

	if got := runner.ran("network rm "); !slices.Equal(got, []string{"network rm n1"}) {
		t.Errorf("network removals = %q", got)
	}

	if got := runner.ran("volume rm "); len(got) != 0 {
		t.Errorf("removed volumes that were not listed: %q", got)
	}
}

// TestDownKeepsAFailedEnvironmentOnlyWhenAsked pins keep-on-failure: kept environments get a
// keep=true marker and lose nothing; a failure without the flag is cleaned up like a pass.
func TestDownKeepsAFailedEnvironmentOnlyWhenAsked(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name       string
		keep       bool
		failed     bool
		wantKept   bool
		wantRemove bool
	}{
		{"failed and kept", true, true, true, false},
		{"failed, not asked to keep", false, true, false, true},
		{"passed with keep set", true, false, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			runner := &fakeDocker{answers: map[string]string{
				"ps -aq --filter " + LabelFilter("env00000"): "c1\n",
			}}
			env := upEnv(t, runner, Spec{EnvID: "env00000", KeepOnFailure: test.keep})

			err := NewDockerProvider(runner).Down(t.Context(), env, test.failed)
			if err != nil {
				t.Fatal(err)
			}

			marker := runner.ran("network create --label " + LabelEnvID + "=env00000")
			kept := len(marker) == 1 && strings.Contains(marker[0], "--label "+LabelKeep+"=true") &&
				strings.HasSuffix(marker[0], ResourceName("env00000", "keep"))

			if kept != test.wantKept {
				t.Errorf(
					"keep marker created = %v, want %v: %q",
					kept,
					test.wantKept,
					runner.commands,
				)
			}

			if removed := len(runner.ran("rm ")) > 0; removed != test.wantRemove {
				t.Errorf("removed = %v, want %v: %q", removed, test.wantRemove, runner.commands)
			}
		})
	}
}

// TestSweepRules covers every way an environment is spared, and the one way it is removed.
func TestSweepRules(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	old := now.Add(-7 * time.Hour).Format(time.RFC3339)
	young := now.Add(-5 * time.Hour).Format(time.RFC3339)

	rules := SweepRules{
		Now:        now,
		StaleAfter: DefaultStaleAfter,
		Host:       "here",
		Self:       "self0000",
		Alive:      func(pid int) bool { return pid == 100 },
	}

	for _, test := range []struct {
		name   string
		env    Found
		remove bool
	}{
		{"stale and its owner is gone", Found{ID: "a", Owner: "here:200", Started: old}, true},
		{"the current environment", Found{ID: "self0000", Owner: "here:200", Started: old}, false},
		{"kept after a failure", Found{ID: "a", Owner: "here:200", Started: old, Keep: true}, false},
		{"younger than the window", Found{ID: "a", Owner: "here:200", Started: young}, false},
		{"owner still running", Found{ID: "a", Owner: "here:100", Started: old}, false},
		{"owned by another host", Found{ID: "a", Owner: "there:200", Started: old}, false},
		{"unreadable owner", Found{ID: "a", Owner: "nonsense", Started: old}, false},
		{"unreadable start", Found{ID: "a", Owner: "here:200", Started: "yesterday"}, false},
		{"no start at all", Found{ID: "a", Owner: "here:200"}, false},
	} {
		verdict := rules.Decide(test.env)
		if verdict.Remove != test.remove || verdict.Reason == "" {
			t.Errorf(
				"%s: remove = %v (%s), want %v",
				test.name,
				verdict.Remove,
				verdict.Reason,
				test.remove,
			)
		}
	}
}

// TestSweepRemovesOnlyTheAbandoned drives a whole sweep over a daemon holding three environments.
func TestSweepRemovesOnlyTheAbandoned(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	old := now.Add(-24 * time.Hour).Format(time.RFC3339)
	row := func(id, owner, keep string) string { return strings.Join([]string{id, owner, old, keep}, "|") }

	format := fmt.Sprintf(`{{.Label %q}}|{{.Label %q}}|{{.Label %q}}|{{.Label %q}}`,
		LabelEnvID, LabelOwner, LabelStarted, LabelKeep)
	filter := "label=" + LabelEnvID

	runner := &fakeDocker{answers: map[string]string{
		"ps -a --filter " + filter + " --format " + format: row("dead0000", "here:200", "") + "\n" +
			row("kept0000", "here:200", "") + "\n" + row("live0000", "here:100", "") + "\n",
		"network ls --filter " + filter + " --format " + format: row(
			"kept0000",
			"here:200",
			"true",
		) + "\n",
		"ps -aq --filter " + LabelFilter("dead0000"): "c-dead\n",
	}}

	rules := SweepRules{
		Now:        now,
		StaleAfter: DefaultStaleAfter,
		Host:       "here",
		Alive:      func(pid int) bool { return pid == 100 },
	}

	verdicts, err := Sweep(t.Context(), runner, rules)
	if err != nil {
		t.Fatal(err)
	}

	removed := map[string]bool{}
	for _, verdict := range verdicts {
		removed[verdict.Env.ID] = verdict.Remove
	}

	if !maps(removed, map[string]bool{"dead0000": true, "kept0000": false, "live0000": false}) {
		t.Errorf("verdicts = %+v", verdicts)
	}

	if got := runner.ran("rm "); !slices.Equal(got, []string{"rm -f -v c-dead"}) {
		t.Errorf("removals = %q", got)
	}

	for _, list := range runner.ran("ps -aq") {
		if !strings.Contains(list, LabelFilter("dead0000")) {
			t.Errorf("the sweep listed resources of an environment it spared: %s", list)
		}
	}
}

// TestRemoveAllTakesEveryEnvironment pins the one removal that ignores the rules: kept and live
// environments go too.
func TestRemoveAllTakesEveryEnvironment(t *testing.T) {
	t.Parallel()

	format := fmt.Sprintf(`{{.Label %q}}|{{.Label %q}}|{{.Label %q}}|{{.Label %q}}`,
		LabelEnvID, LabelOwner, LabelStarted, LabelKeep)
	filter := "label=" + LabelEnvID

	runner := &fakeDocker{answers: map[string]string{
		"ps -a --filter " + filter + " --format " + format:      "live0000|here:1|2026-10-09T12:00:00Z|\n",
		"network ls --filter " + filter + " --format " + format: "kept0000|here:1|2026-10-09T12:00:00Z|true\n",
		"ps -aq --filter " + LabelFilter("live0000"):            "c-live\n",
		"network ls -q --filter " + LabelFilter("kept0000"):     "n-kept\n",
	}}

	removed, err := RemoveAll(t.Context(), runner)
	if err != nil {
		t.Fatal(err)
	}

	if len(removed) != 2 {
		t.Errorf("removed %+v, want both environments", removed)
	}

	if got := append(
		runner.ran("rm "),
		runner.ran("network rm ")...); !slices.Equal(
		got,
		[]string{"rm -f -v c-live", "network rm n-kept"},
	) {
		t.Errorf("removals = %q", got)
	}
}

func maps(got, want map[string]bool) bool {
	if len(got) != len(want) {
		return false
	}

	for key, value := range want {
		if found, ok := got[key]; !ok || found != value {
			return false
		}
	}

	return true
}

// TestStaleAfterFromEnv cannot run in parallel: it sets the variable it reads.
func TestStaleAfterFromEnv(t *testing.T) {
	t.Setenv(EnvStaleAfter, "")

	got, err := StaleAfterFromEnv()
	if err != nil || got != DefaultStaleAfter {
		t.Errorf("default = %v, %v", got, err)
	}

	t.Setenv(EnvStaleAfter, "90m")

	got, err = StaleAfterFromEnv()
	if err != nil || got != 90*time.Minute {
		t.Errorf("90m = %v, %v", got, err)
	}

	for _, bad := range []string{"6", "soon", "-1h", "0s"} {
		t.Setenv(EnvStaleAfter, bad)

		_, err = StaleAfterFromEnv()
		if err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestProcessAlive(t *testing.T) {
	t.Parallel()

	if !ProcessAlive(os.Getpid()) {
		t.Error("this process is not alive")
	}

	// Far above any pid_max, so no process can hold it.
	if ProcessAlive(math.MaxInt32) {
		t.Error("an impossible PID is alive")
	}
}

// TestLoggerRedacts pins that a secret never reaches the log, however it is handed over.
func TestLoggerRedacts(t *testing.T) {
	t.Parallel()

	var out bytes.Buffer

	logger := NewLogger(&out).With(slog.Any("token", Secret("with-attrs")))
	logger.Info(
		"run",
		slog.String("secret", "plain-secret"),
		slog.Any("password", Secret("typed-secret")),
		slog.Any(
			"args",
			[]string{
				"run",
				"-e",
				"TOKEN=env-secret",
				"--env=KEY=env-eq-secret",
				"--build-arg",
				"ARG=build-secret",
				"image",
			},
		),
	)

	logged := out.String()

	for _, secret := range []string{"with-attrs", "plain-secret", "typed-secret", "env-secret", "env-eq-secret", "build-secret"} {
		if strings.Contains(logged, secret) {
			t.Errorf("%q reached the log:\n%s", secret, logged)
		}
	}

	for _, kept := range []string{"TOKEN=[redacted]", "KEY=[redacted]", "ARG=[redacted]", "image"} {
		if !strings.Contains(logged, kept) {
			t.Errorf(
				"%q is missing from the log, which should still say what was set:\n%s",
				kept,
				logged,
			)
		}
	}

	if got := fmt.Sprintf(
		"%v %s %#v",
		Secret("x"),
		Secret("x"),
		Secret("x"),
	); strings.Contains(
		got,
		"x",
	) {
		t.Errorf("fmt printed a Secret: %s", got)
	}
}

func TestNewSelectsDocker(t *testing.T) {
	t.Setenv(EnvProvider, "")

	provider, err := New()
	if err != nil || provider.Name() != "docker" {
		t.Errorf("default provider = %v, %v", provider, err)
	}

	t.Setenv(EnvProvider, "multipass")

	_, err = New()
	if err == nil {
		t.Error("an unknown provider was accepted")
	}
}

func upEnv(t *testing.T, runner Runner, spec Spec) *Env {
	t.Helper()

	spec.Logger = quietLogger()

	env, err := NewDockerProvider(runner).Up(t.Context(), spec)
	if err != nil {
		t.Fatal(err)
	}

	return env
}
