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

// Package toolgate finds the external tools that the behavioral meta-tests drive.
//
// A behavioral test that skips when its tool is missing passes in exactly the place it is meant to
// guard: CI. So a missing tool is a skip on a developer machine and a failure wherever
// BITGAUGE_REQUIRE_TOOLS=1 is set, which the repo-gates CI job does. The tools are a closed list:
// Docker is deliberately not on it, because every Docker-dependent test sits behind the image or
// harness build tag and never runs untagged.
package toolgate

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
)

// RequireEnv is the variable that turns a missing tool from a skip into a failure.
const RequireEnv = "BITGAUGE_REQUIRE_TOOLS"

// Tool names the behavioral tests may gate on.
const (
	GolangciLint = "golangci-lint"
	ESLint       = "eslint"
	Fallow       = "fallow"
)

// Tools is the closed list of tools a meta-test may be gated on.
var Tools = []string{GolangciLint, ESLint, Fallow}

// errNotInstalled reports a web tool missing from web/node_modules.
var errNotInstalled = errors.New("not installed; run npm ci in web/")

// webTools are installed by npm ci in web/ rather than found on PATH.
var webTools = []string{ESLint, Fallow}

// Lookup returns the path of tool, or skips the test when it is missing locally and fails it when
// RequireEnv is set to 1. A tool outside Tools fails the test: widening the list is a decision, not
// a side effect of a new test.
func Lookup(t *testing.T, tool string) string {
	t.Helper()

	if !slices.Contains(Tools, tool) {
		t.Fatalf("toolgate: %q is not one of the gated tools %v", tool, Tools)
	}

	path, err := find(tool)
	if err == nil {
		return path
	}

	if os.Getenv(RequireEnv) == "1" {
		t.Fatalf("%s is required (%s=1) but was not found: %v", tool, RequireEnv, err)
	}

	t.Skipf("%s not found (%v); set %s=1 to make this a failure", tool, err, RequireEnv)

	return ""
}

// RepoRoot returns the repository root, found as the nearest ancestor of the working directory
// that holds go.mod.
func RepoRoot(t *testing.T) string {
	t.Helper()

	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("toolgate: working directory: %v", err)
	}

	for {
		_, statErr := os.Stat(filepath.Join(dir, "go.mod"))
		if statErr == nil {
			return dir
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("toolgate: no go.mod above the working directory")
		}

		dir = parent
	}
}

func find(tool string) (string, error) {
	if !slices.Contains(webTools, tool) {
		path, err := exec.LookPath(tool)
		if err != nil {
			return "", fmt.Errorf("look up %s on PATH: %w", tool, err)
		}

		return path, nil
	}

	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("working directory: %w", err)
	}

	for {
		candidate := filepath.Join(dir, "web", "node_modules", ".bin", tool)

		_, statErr := os.Stat(candidate)
		if statErr == nil {
			return candidate, nil
		}

		if !errors.Is(statErr, fs.ErrNotExist) {
			return "", fmt.Errorf("stat %s: %w", candidate, statErr)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("web/node_modules/.bin/%s: %w", tool, errNotInstalled)
		}

		dir = parent
	}
}
