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

package boundary_test

import (
	"os/exec"
	"slices"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

const compatPackages = "github.com/leinardi/bitgauge/internal/compat"

// TestBuildingBlocksDoNotImportTheLayers keeps the dependencies pointing inwards (backend.md
// section 1): the compatibility layers use the shared building blocks, never the reverse. No
// lint rule enforces the direction, so the module's own dependency graph is read.
func TestBuildingBlocksDoNotImportTheLayers(t *testing.T) {
	t.Parallel()

	command := exec.CommandContext(t.Context(), "go", "list", "-deps",
		"./internal/handlers/...", "./internal/clientip/...", "./internal/ratelimit/...")
	command.Dir = toolgate.RepoRoot(t)

	output, err := command.Output()
	if err != nil {
		t.Fatalf("go list: %v", err)
	}

	// The list holds the listed packages themselves, so an empty or wrong one cannot pass.
	deps := strings.Fields(string(output))
	if !slices.Contains(deps, "github.com/leinardi/bitgauge/internal/handlers") {
		t.Fatalf("go list did not list internal/handlers: %v", deps)
	}

	for _, dep := range deps {
		if dep == compatPackages || strings.HasPrefix(dep, compatPackages+"/") {
			t.Errorf("a building block depends on %s", dep)
		}
	}
}
