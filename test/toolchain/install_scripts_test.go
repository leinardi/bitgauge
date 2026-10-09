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
	"maps"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// TestNpmInstallFailsOnUnreviewedScripts pins the setting that turns an unreviewed dependency
// install script from a warning into a failed install. Without it the decision recorded under
// allowScripts is advisory, and the next script nobody looked at scrolls past as one more warning.
func TestNpmInstallFailsOnUnreviewedScripts(t *testing.T) {
	t.Parallel()

	npmrc := readRepoFile(t, "web", ".npmrc")

	if !regexp.MustCompile(`(?m)^strict-allow-scripts\s*=\s*true\s*$`).MatchString(npmrc) {
		t.Errorf("web/.npmrc does not set strict-allow-scripts=true:\n%s", npmrc)
	}
}

// TestEveryLockedInstallScriptIsReviewed holds web/package.json's allowScripts to exactly the
// packages the lockfile says carry an install script, on every platform.
//
// npm's own strict check only sees what this machine installs, so a platform-specific optional
// dependency with a script -- fsevents on macOS -- passes CI on Linux and then refuses
// `npm install` on the first Mac to try it. The lockfile records hasInstallScript for every
// platform at once, which is what makes this the place to catch it.
//
// An entry is either the bare name, which covers every version, or name@version for the exact
// version locked. npm also accepts ranges; a test that cannot evaluate one would have to guess, so
// it refuses them instead.
func TestEveryLockedInstallScriptIsReviewed(t *testing.T) {
	t.Parallel()

	var manifest struct {
		AllowScripts map[string]bool `json:"allowScripts"`
	}

	err := json.Unmarshal([]byte(readRepoFile(t, "web", "package.json")), &manifest)
	if err != nil {
		t.Fatalf("parse web/package.json: %v", err)
	}

	var lockfile struct {
		Packages map[string]struct {
			Version          string `json:"version"`
			HasInstallScript bool   `json:"hasInstallScript"`
		} `json:"packages"`
	}

	err = json.Unmarshal([]byte(readRepoFile(t, "web", "package-lock.json")), &lockfile)
	if err != nil {
		t.Fatalf("parse web/package-lock.json: %v", err)
	}

	used := map[string]bool{}

	for path, pkg := range lockfile.Packages {
		// The root entry is the project itself, whose own scripts allowScripts does not govern.
		if !pkg.HasInstallScript || path == "" {
			continue
		}

		// A nested copy sits at node_modules/a/node_modules/b; the name is the last segment, which
		// keeps a scope intact.
		// A workspace or link entry has no node_modules/ in its key; it is a local folder, named by
		// its path, and needs an allowScripts entry like any other.
		name := path
		if index := strings.LastIndex(path, "node_modules/"); index >= 0 {
			name = path[index+len("node_modules/"):]
		}

		switch {
		case hasKey(manifest.AllowScripts, name):
			used[name] = true
		case hasKey(manifest.AllowScripts, name+"@"+pkg.Version):
			used[name+"@"+pkg.Version] = true
		default:
			t.Errorf("%s@%s has an install script and no allowScripts entry in web/package.json: "+
				"review it, then record the decision with npm install-scripts approve|deny %s",
				name, pkg.Version, name)
		}
	}

	for _, entry := range slices.Sorted(maps.Keys(manifest.AllowScripts)) {
		if !used[entry] {
			t.Errorf("allowScripts entry %q in web/package.json matches no locked package with an "+
				"install script: drop it (npm install-scripts prune), or name the package bare or "+
				"at its exact locked version", entry)
		}
	}
}

func hasKey(entries map[string]bool, key string) bool {
	_, ok := entries[key]

	return ok
}
