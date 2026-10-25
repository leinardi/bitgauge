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
	"os"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/netguard"
	"github.com/leinardi/bitgauge/test/internal/testenv"
)

const envPreflight = "HARNESS_PREFLIGHT"

// TestPreflight is make harness-preflight: the checks every runner makes before BitGauge's image
// builds, against the daemon DOCKER_HOST names, building only the tools image. Accounting and
// shaping are separate subtests, each its own probe, so a daemon can pass one and fail the other.
func TestPreflight(t *testing.T) {
	accounting, shaping, err := PreflightChecks(os.Getenv(envPreflight))
	if err != nil {
		t.Fatal(err)
	}

	runner := dockerCLI()

	toolsImage, err := netguard.BuildToolsImage(t.Context(), runner, repoRoot)
	if err != nil {
		t.Fatal(err)
	}

	provider, err := testenv.New()
	if err != nil {
		t.Fatal(err)
	}

	if accounting {
		t.Run(PreflightAccounting, func(t *testing.T) {
			err := CheckDaemonCgroups(t.Context(), runner)
			if err != nil {
				t.Fatal(err)
			}

			err = Preflight(
				t.Context(),
				testenvProbe(provider),
				PreflightOptions{ToolsImage: toolsImage, Cgroups: true},
			)
			if err != nil {
				t.Fatal(err)
			}
		})
	}

	if shaping {
		t.Run(PreflightShaping, func(t *testing.T) {
			tier, err := Lookup(TierCI)
			if err != nil {
				t.Fatal(err)
			}

			profile := FirstShaped(&tier, false)
			if profile == nil {
				t.Fatal("the CI tier shapes no profile")
			}

			err = Preflight(t.Context(), testenvProbe(provider), PreflightOptions{
				ToolsImage: toolsImage, Shaped: profile,
			})
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}
