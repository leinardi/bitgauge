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
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/testenv"
)

// envContinuousMinutes is how long the check samples, which .mk/harness.mk passes in.
const envContinuousMinutes = "HARNESS_CONTINUOUS_MINUTES"

// TestHarnessContinuous is make harness-continuous, the manual Continuous memory check of
// testing.md section 5: a Continuous download on ContinuousProfile in Chromium, on a fresh
// topology, whose Worker heap samples are judged by JudgeHeap and written to the report under
// dist/harness. A run that fails, or could not complete, fails it.
func TestHarnessContinuous(t *testing.T) {
	minutes, err := ContinuousMinutes(os.Getenv(envContinuousMinutes))
	if err != nil {
		t.Fatal(err)
	}

	tier, err := Lookup(TierCI)
	if err != nil {
		t.Fatal(err)
	}

	spec, err := Select(&tier, ContinuousProfile, ContinuousBrowser)
	if err != nil {
		t.Fatal(err)
	}

	profile := &spec.Profiles[0]
	toolsImage, image, started := buildImages(t)
	reportEnv := generateEnvID(t)
	dir := reportDir(
		t,
		ContinuousDir(filepath.Join(repoRoot, "dist", "harness"), started, reportEnv),
	)
	report := NewContinuousReport(minutes, reportEnv, started)

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
	}

	t.Run(profile.Name+"/"+ContinuousBrowser, func(t *testing.T) {
		provider, err := testenv.New()
		if err != nil {
			t.Fatal(err)
		}

		envSpec := testenv.SpecFromEnv()
		envSpec.KeepOnFailure = os.Getenv(envKeepOnFailure) == "1"

		env, err := provider.Up(t.Context(), envSpec)
		if err != nil {
			t.Fatal(err)
		}

		env.Cleanup(t, provider)

		report.RunEnvID = env.ID

		err = measureContinuous(t.Context(), env, cfg, profile, minutes, report)
		if err != nil {
			report.Error = err.Error()
		}

		report.Judge(os.ReadFile(filepath.Join(dir, ContinuousExport())))

		if report.Status != StatusPass {
			t.Error(report.Verdict)
		}
	})
}

// measureContinuous brings up the profile's topology, its shaper self-tested, runs the browser
// driver for the minutes given, and reads netguard's counters whatever happened once BitGauge
// could have started.
func measureContinuous(
	ctx context.Context,
	env *testenv.Env,
	cfg Config,
	profile *Profile,
	minutes int,
	report *ContinuousReport,
) error {
	topology, err := Up(ctx, env, cfg, profile)
	if topology == nil {
		return err
	}

	report.SelfTest = topology.SelfTest()

	if err == nil {
		err = topology.Continuous(ctx, minutes)
	}

	counters, countersErr := topology.Guard().Counters(ctx)
	if countersErr != nil {
		return errors.Join(err, fmt.Errorf("read the netguard counters: %w", countersErr))
	}

	report.Egress = counters

	if !counters.Zero() {
		err = errors.Join(err, fmt.Errorf("%w: %v", errEgress, counters))
	}

	return err
}
