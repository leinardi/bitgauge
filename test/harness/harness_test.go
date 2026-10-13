//go:build harness

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

package harness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/netguard"
	"github.com/leinardi/bitgauge/test/internal/testenv"
)

// The variables .mk/harness.mk passes in.
const (
	envTier          = "HARNESS_TIER"
	envProfiles      = "HARNESS_PROFILES"
	envBrowsers      = "HARNESS_BROWSERS"
	envKeepOnFailure = "HARNESS_KEEP_ON_FAILURE"
	envShape         = "HARNESS_SHAPE"
	envSweepAll      = "HARNESS_SWEEP_ALL_CONFIRM"
)

var (
	repoRoot  = filepath.Join("..", "..")
	errEgress = errors.New("packets tried to leave BitGauge's namespace")
)

// TestMain sweeps environments earlier runs abandoned, under testenv's rules, before any test.
func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	rules, err := testenv.DefaultRules("")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)

		return 1
	}

	_, err = testenv.Sweep(context.Background(), dockerCLI(), rules)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stale sweep:", err)

		return 1
	}

	return m.Run()
}

// TestHarness runs one tier: each profile, in each browser, on a fresh topology, judges each run
// against testing.md section 5 (re-running an inconclusive one once), and writes the report under
// dist/harness. Any final run that failed, failed its tolerances or stayed inconclusive fails it.
func TestHarness(t *testing.T) {
	unmet, err := Unmet(repoRoot)
	if err != nil {
		t.Fatal(err)
	}

	if len(unmet) > 0 {
		t.Fatalf("the harness is dormant; unmet prerequisites:\n- %s", strings.Join(unmet, "\n- "))
	}

	spec := selectedTier(t)
	ctx := t.Context()
	runner := dockerCLI()

	toolsImage, err := netguard.BuildToolsImage(ctx, runner, repoRoot)
	if err != nil {
		t.Fatal(err)
	}

	started := time.Now()
	image := "bitgauge-harness:" + started.UTC().Format("20060102T150405")

	_, err = runner.Run(ctx, "buildx", "build", "--load", "--tag", image,
		"--file", filepath.Join(repoRoot, "deployments", "docker", "Dockerfile"), repoRoot)
	if err != nil {
		t.Fatal(err)
	}

	// Unlabeled, so no environment cleanup or sweep would ever take it.
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		_, rmErr := runner.Run(cleanupCtx, "image", "rm", "--force", image)
		if rmErr != nil {
			t.Errorf("remove %s: %v", image, rmErr)
		}
	})

	// The invocation's own identifier, naming the report directory; each run's environment has
	// its own, recorded with the run.
	reportEnv, err := testenv.GenerateEnvID()
	if err != nil {
		t.Fatal(err)
	}

	dir, err := filepath.Abs(
		Dir(filepath.Join(repoRoot, "dist", "harness"), spec.Tier, started, reportEnv),
	)
	if err != nil {
		t.Fatal(err)
	}

	// Created now, as the user running the test: the client bind-mounts it and writes as that
	// user, and a missing bind source would be created root-owned by the daemon.
	for _, sub := range []string{"exports", "playwright"} {
		err = os.MkdirAll(filepath.Join(dir, sub), dirMode)
		if err != nil {
			t.Fatal(err)
		}
	}

	report := NewReport(&spec, reportEnv, started)

	defer func() {
		report.Finished = time.Now()

		writeErr := report.Write(dir)
		if writeErr != nil {
			t.Error(writeErr)
		}

		t.Logf("report: %s", dir)
	}()

	cfg := Config{
		ToolsImage: toolsImage, BitGaugeImage: image, RepoRoot: absolute(t, repoRoot), OutDir: dir,
		Unshaped: os.Getenv(envShape) == "none",
	}

	for index := range spec.Profiles {
		profile := &spec.Profiles[index]

		for _, browser := range spec.Browsers {
			for attempt := 1; ; attempt++ {
				run := runProfile(t, cfg, profile, browser)
				run.Attempt = attempt
				run.Rerun = ShouldRerun(&run, attempt)
				report.Runs = append(report.Runs, run)

				if run.Rerun {
					continue
				}

				if run.Failing() {
					t.Errorf("%s in %s: %s %s", profile.Name, browser, run.Verdict, run.Error)
				}

				break
			}
		}
	}
}

// runProfile measures and judges one profile in one browser on its own environment, which goes
// when the subtest ends -- kept, marked keep=true, when it failed and HARNESS_KEEP_ON_FAILURE=1. A
// run that fails its tolerances fails the subtest, so its environment can be kept to look into;
// an inconclusive one does not, since its re-run may still pass.
func runProfile(t *testing.T, cfg Config, profile *Profile, browser string) Run {
	t.Helper()

	run := Run{
		Profile: profile.Name,
		Browser: browser,
		Status:  StatusFailed,
		Shaped:  profile.Shaped && !cfg.Unshaped,
	}

	t.Run(profile.Name+"/"+browser, func(t *testing.T) {
		provider, err := testenv.New()
		if err != nil {
			t.Fatal(err)
		}

		spec := testenv.SpecFromEnv()
		spec.KeepOnFailure = os.Getenv(envKeepOnFailure) == "1"

		env, err := provider.Up(t.Context(), spec)
		if err != nil {
			t.Fatal(err)
		}

		env.Cleanup(t, provider)

		run.EnvID = env.ID

		err = measure(t.Context(), env, cfg, profile, browser, &run)
		if err != nil {
			run.Error = err.Error()
			t.Error(err)
		} else {
			run.Status = StatusRecorded
		}

		run.Judge(profile)

		if run.Status == StatusFail {
			t.Error(run.Verdict)
		}
	})

	return run
}

func measure(
	ctx context.Context,
	env *testenv.Env,
	cfg Config,
	profile *Profile,
	browser string,
	run *Run,
) error {
	topology, err := Up(ctx, env, cfg, profile)
	if topology == nil {
		// Netguard never started, so nothing ran that it would have watched.
		return err
	}

	run.SelfTest = topology.SelfTest()

	if err == nil {
		err = observe(ctx, cfg, topology, browser, run)
	}

	// Whatever happened once BitGauge could have started, its namespace's counters are read.
	return errors.Join(err, readEgress(ctx, topology, run))
}

// observe is one run on a ready topology: the iperf3 reference before, the browser with the ping
// and the client's counters, the iperf3 reference after, and the export.
func observe(ctx context.Context, cfg Config, topology *Topology, browser string, run *Run) error {
	reference := ReferenceDuration(topology.profile.Preset)

	var err error

	run.ReferenceBefore, err = topology.Iperf3(ctx, reference)
	if err != nil {
		return err
	}

	cpuBefore, _, err := topology.ClientCounters(ctx)
	if err != nil {
		return err
	}

	browseStarted := time.Now()
	export, ping, browseErr := topology.Browse(ctx, browser)
	browseSeconds := time.Since(browseStarted).Seconds()
	run.Ping = ping

	cpuAfter, peak, usageErr := topology.ClientCounters(ctx)
	if usageErr == nil {
		run.ClientUsage = &Usage{
			CPUSeconds:      float64(cpuAfter-cpuBefore) / usecPerSecond,
			WallSeconds:     browseSeconds,
			PeakMemoryBytes: peak,
		}
	}

	var afterErr error

	run.ReferenceAfter, afterErr = topology.Iperf3(ctx, reference)

	err = errors.Join(browseErr, usageErr, afterErr)
	if err != nil {
		return err
	}

	run.Export = export

	data, err := os.ReadFile(filepath.Join(cfg.OutDir, export))
	if err != nil {
		return fmt.Errorf("read the export: %w", err)
	}

	summary, err := SummarizeExport(data)
	if err != nil {
		return err
	}

	run.Result = &summary

	return nil
}

// readEgress records the guard's counters, and fails the run when any is not zero.
func readEgress(ctx context.Context, topology *Topology, run *Run) error {
	counters, err := topology.Guard().Counters(ctx)
	if err != nil {
		return fmt.Errorf("read the netguard counters: %w", err)
	}

	run.Egress = counters

	if !counters.Zero() {
		return fmt.Errorf("%w: %v", errEgress, counters)
	}

	return nil
}

// TestCounterNamesFollowNetguard holds the evaluator's counter names to netguard's own.
func TestCounterNamesFollowNetguard(t *testing.T) {
	t.Parallel()

	want := []string{netguard.Egress, netguard.DNS, netguard.Loopback}
	if !slices.Equal(CounterNames, want) {
		t.Errorf("CounterNames = %v, netguard counts %v", CounterNames, want)
	}
}

// TestSweep is make harness-sweep: the stale sweep, under the same rules TestMain applies, listing
// what it kept and why.
func TestSweep(t *testing.T) {
	rules, err := testenv.DefaultRules("")
	if err != nil {
		t.Fatal(err)
	}

	verdicts, err := testenv.Sweep(t.Context(), dockerCLI(), rules)
	if err != nil {
		t.Fatal(err)
	}

	for _, verdict := range verdicts {
		action := "kept"
		if verdict.Remove {
			action = "removed"
		}

		t.Logf("%s %s: %s", action, verdict.Env.ID, verdict.Reason)
	}
}

// TestSweepAll is make harness-sweep-all CONFIRM=1: every environment, kept or live, goes. It does
// nothing unless the make target passed the confirmation through.
func TestSweepAll(t *testing.T) {
	if os.Getenv(envSweepAll) != "1" {
		t.Skipf(
			"removes every harness environment; run it through make harness-sweep-all CONFIRM=1",
		)
	}

	removed, err := testenv.RemoveAll(t.Context(), dockerCLI())
	if err != nil {
		t.Fatal(err)
	}

	for _, env := range removed {
		t.Logf(
			"removed %s (owner %s, started %s, kept %v)",
			env.ID,
			env.Owner,
			env.Started,
			env.Keep,
		)
	}
}

func selectedTier(t *testing.T) TierSpec {
	t.Helper()

	tier := Tier(os.Getenv(envTier))
	if tier == "" {
		tier = TierCI
	}

	spec, err := Lookup(tier)
	if err != nil {
		t.Fatal(err)
	}

	spec, err = Select(&spec, os.Getenv(envProfiles), os.Getenv(envBrowsers))
	if err != nil {
		t.Fatal(err)
	}

	return spec
}

func dockerCLI() testenv.DockerCLI {
	return testenv.DockerCLI{Logger: testenv.NewLogger(os.Stderr)}
}

func absolute(t *testing.T, path string) string {
	t.Helper()

	abs, err := filepath.Abs(path)
	if err != nil {
		t.Fatal(err)
	}

	return abs
}
