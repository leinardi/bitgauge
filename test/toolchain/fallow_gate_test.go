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

package toolchain_test

import (
	"encoding/json"
	"regexp"
	"testing"
)

// regressionBaselineFile holds fallow's per-issue-type counts and the version that wrote them.
const regressionBaselineFile = ".fallow-regression-baseline.json"

// pinnedFallowVersion returns the version web/package.json pins, failing when it is a range.
//
// A range is the same problem as reading the binary off PATH, one step removed: two checkouts
// install different analyzers and disagree about what the baseline means.
func pinnedFallowVersion(t *testing.T) string {
	t.Helper()

	var manifest struct {
		DevDependencies map[string]string `json:"devDependencies"`
	}

	err := json.Unmarshal([]byte(readRepoFile(t, "web", "package.json")), &manifest)
	if err != nil {
		t.Fatalf("parse web/package.json: %v", err)
	}

	version, ok := manifest.DevDependencies["fallow"]
	if !ok {
		t.Fatal("web/package.json does not list fallow as a devDependency, so the hook has no " +
			"binary of its own to run")
	}

	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(version) {
		t.Fatalf("fallow is pinned as %q rather than an exact version: a range lets two checkouts "+
			"run different analyzers against the same baseline", version)
	}

	return version
}

// TestFallowBaselineMatchesThePinnedVersion pins that the committed baseline was written by the
// version the hook runs. Fallow's findings change between releases, so a baseline from an older
// one either forgives issues nobody reviewed or fails a tree nobody changed.
func TestFallowBaselineMatchesThePinnedVersion(t *testing.T) {
	t.Parallel()

	// Decoded as a map rather than a struct: the key is fallow's, in fallow's spelling, and a
	// tagged field would only invite this repository's naming conventions to correct it.
	var baseline map[string]any

	err := json.Unmarshal([]byte(readRepoFile(t, regressionBaselineFile)), &baseline)
	if err != nil {
		t.Fatalf("parse %s: %v", regressionBaselineFile, err)
	}

	writtenBy, ok := baseline["fallow_version"].(string)
	if !ok {
		t.Fatalf("%s does not record the fallow version that wrote it", regressionBaselineFile)
	}

	pinned := pinnedFallowVersion(t)
	if writtenBy != pinned {
		t.Errorf(
			"%s was written by fallow %s but the hook runs %s; regenerate both baselines with "+
				"the commands in the web-fallow hook's comment",
			regressionBaselineFile,
			writtenBy,
			pinned,
		)
	}
}
