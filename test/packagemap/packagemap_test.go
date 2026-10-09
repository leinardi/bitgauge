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

// Package packagemap_test drives scripts/check-package-map.sh against scratch modules, and once
// against this repository so a package added without a row fails a Go test too.
package packagemap_test

import (
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

const (
	docFile    = "PACKAGES.md"
	scriptPath = "scripts/check-package-map.sh"
)

const commandTimeout = 2 * time.Minute

// TestPackageMap covers what the map is for: every package has a row, and a row ahead of its
// package is a plan rather than an error.
func TestPackageMap(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		packages []string
		rows     []string
		wantErr  bool
		want     string
	}{
		{
			name:     "a row for every package passes",
			packages: []string{"internal/alpha", "cmd/beta"},
			rows:     []string{"internal/alpha", "cmd/beta"},
		},
		{
			name:     "a subtree row covers the packages under it",
			packages: []string{"internal/compat/gamma", "internal/compat/delta"},
			rows:     []string{"internal/compat/*"},
		},
		{
			name:     "a package with no row fails",
			packages: []string{"internal/alpha", "internal/beta/gamma"},
			rows:     []string{"internal/alpha"},
			wantErr:  true,
			want:     "internal/beta/gamma: no row",
		},
		{
			name:     "a package outside internal needs a row too",
			packages: []string{"internal/alpha", "web"},
			rows:     []string{"internal/alpha"},
			wantErr:  true,
			want:     "web: no row",
		},
		{
			name:     "a row ahead of its package is planned, not a failure",
			packages: []string{"internal/alpha"},
			rows:     []string{"internal/alpha", "internal/beta"},
			want:     "internal/beta: planned, not implemented",
		},
		{
			name:     "a module with no package yet passes every planned row",
			packages: nil,
			rows:     []string{"internal/alpha", "cmd/beta"},
			want:     "cmd/beta: planned, not implemented",
		},
		{
			name:     "the test tree is not mapped",
			packages: []string{"internal/alpha", "test/boundary", "test/internal/toolgate"},
			rows:     []string{"internal/alpha"},
		},
		{
			// A subtree row does not stand in for the package at its own root.
			name:     "a subtree row does not cover its own root package",
			packages: []string{"internal/beta", "internal/beta/gamma"},
			rows:     []string{"internal/beta/*"},
			wantErr:  true,
			want:     "internal/beta: no row",
		},
		{
			// The scratch go.mod has no ignore directive, so this is the script's own exclusion.
			name:     "go source shipped inside node_modules is not mapped",
			packages: []string{"internal/alpha", "web/node_modules/flatted/golang/pkg/flatted"},
			rows:     []string{"internal/alpha"},
		},
		{
			// test/ is excluded as a tree, not as a prefix: a product package called testing is not.
			name:     "a package merely starting with test is mapped",
			packages: []string{"internal/alpha", "testing"},
			rows:     []string{"internal/alpha"},
			wantErr:  true,
			want:     "testing: no row",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			dir := scratchModule(t, testCase.packages, testCase.rows)

			output, err := runChecker(t, dir)

			if testCase.wantErr && err == nil {
				t.Fatalf("the check passed but should not have:\n%s", output)
			}

			if !testCase.wantErr && err != nil {
				t.Fatalf("the check failed but should not have: %v\n%s", err, output)
			}

			if testCase.want != "" && !strings.Contains(output, testCase.want) {
				t.Errorf("the output does not name %q:\n%s", testCase.want, output)
			}
		})
	}
}

// TestPackageMapSeesTaggedPackages pins the build tags: a package that only builds under the image
// or harness tag is still a package, and still needs a row.
func TestPackageMapSeesTaggedPackages(t *testing.T) {
	t.Parallel()

	for _, tag := range []string{"image", "harness"} {
		t.Run(tag, func(t *testing.T) {
			t.Parallel()

			dir := scratchModule(t, []string{"internal/alpha"}, []string{"internal/alpha"})
			writeFile(t, dir, filepath.Join("internal", "tagged", "tagged.go"),
				"//go:build "+tag+"\n\npackage tagged\n")

			output, err := runChecker(t, dir)
			if err == nil || !strings.Contains(output, "internal/tagged: no row") {
				t.Errorf("a package behind the %s tag was not seen: %v\n%s", tag, err, output)
			}
		})
	}
}

// TestPackageMapNeedsItsMarkers pins that a document without the markers fails rather than
// quietly checking an empty table and passing.
func TestPackageMapNeedsItsMarkers(t *testing.T) {
	t.Parallel()

	dir := scratchModule(t, []string{"internal/alpha"}, []string{"internal/alpha"})
	writeFile(t, dir, docFile, "# no markers here\n")

	output, err := runChecker(t, dir)
	if err == nil {
		t.Fatalf("a document with no markers passed:\n%s", output)
	}
}

// TestPackageMapNeedsRowsBetweenItsMarkers pins the likelier accident than losing the markers:
// rewriting the section and leaving them around an empty table. An empty map must fail rather than
// agree with everything.
func TestPackageMapNeedsRowsBetweenItsMarkers(t *testing.T) {
	t.Parallel()

	dir := scratchModule(t, []string{"internal/alpha"}, nil)

	output, err := runChecker(t, dir)
	if err == nil {
		t.Fatalf("an empty map passed:\n%s", output)
	}

	if !strings.Contains(output, "no rows between its markers") {
		t.Errorf("the failure does not name the empty table:\n%s", output)
	}
}

// TestPackageMapNeedsBackquotedPaths pins that a first cell without backquotes is not read as a
// row, so the package it names is reported as unmapped -- closed rather than silently accepted.
func TestPackageMapNeedsBackquotedPaths(t *testing.T) {
	t.Parallel()

	dir := scratchModule(t, []string{"internal/alpha", "internal/beta"}, nil)
	writeFile(t, dir, docFile, strings.Join([]string{
		"<!-- package-map start -->",
		"",
		"| Package | Responsibility |",
		"| --- | --- |",
		"| internal/alpha | no backquotes |",
		"| `internal/beta` | a row as this table writes them |",
		"",
		"<!-- package-map end -->",
		"",
	}, "\n"))

	output, err := runChecker(t, dir)
	if err == nil {
		t.Fatalf("a row without backquotes was accepted as a row:\n%s", output)
	}

	if !strings.Contains(output, "internal/alpha: no row") {
		t.Errorf("the failure does not name the package left unmapped:\n%s", output)
	}
}

// TestPackageMapFailsWhenGoListFails pins that a module go cannot list fails rather than reading
// as a module with no packages, which this check would accept.
func TestPackageMapFailsWhenGoListFails(t *testing.T) {
	t.Parallel()

	dir := scratchModule(t, []string{"internal/alpha"}, []string{"internal/alpha"})
	writeFile(t, dir, filepath.Join("internal", "alpha", "broken.go"), "package other\n")

	output, err := runChecker(t, dir)
	if err == nil || !strings.Contains(output, "go list failed") {
		t.Fatalf("a module go list cannot load passed: %v\n%s", err, output)
	}
}

// TestRepositoryPackageMapIsCurrent runs the checker over this repository, which is what the hook
// does, so a package added without a row in backend.md fails make go-test too.
func TestRepositoryPackageMapIsCurrent(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	touchInputs(t, root)

	output, err := runChecker(t, root, "")
	if err != nil {
		t.Fatalf("the package map and the module disagree: %v\n%s", err, output)
	}
}

// touchInputs reads the map and lists every directory of the module, so that a new package or an
// edited map is part of the test cache key: the script reads both only through exec, which the
// cache does not see, and a stale pass would otherwise be replayed.
func touchInputs(t *testing.T, root string) {
	t.Helper()

	_, err := os.ReadFile(filepath.Join(root, "docs", "features", "technical-stack", "backend.md"))
	if err != nil {
		t.Fatalf("read the package map: %v", err)
	}

	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		name := entry.Name()
		if entry.IsDir() && path != root &&
			(strings.HasPrefix(name, ".") || name == "node_modules" || name == "testdata") {
			return filepath.SkipDir
		}

		// Walking reads every directory listing, which is what records a new package's files.
		return nil
	})
	if err != nil {
		t.Fatalf("list the module: %v", err)
	}
}

// scratchModule builds a module with one Go package per named path, and a document carrying the map
// between its markers.
func scratchModule(t *testing.T, packages, rows []string) string {
	t.Helper()

	dir := t.TempDir()

	writeFile(t, dir, "go.mod", "module example.com/scratch\n\ngo 1.26\n")

	for _, path := range packages {
		name := filepath.Base(path)
		writeFile(t, dir, filepath.Join(path, name+".go"), "package "+name+"\n")
	}

	const framing = 7 // four header lines, and three closing the document

	table := make([]string, 0, len(rows)+framing)
	table = append(table,
		"<!-- package-map start -->",
		"",
		"| Package | Responsibility |",
		"| --- | --- |",
	)

	for _, row := range rows {
		table = append(table, "| `"+row+"` | scratch |")
	}

	table = append(table, "", "<!-- package-map end -->", "")

	writeFile(t, dir, docFile, strings.Join(table, "\n"))

	return dir
}

// writeFile writes one file inside the scratch module, creating the directories above it.
func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()

	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("open %s: %v", dir, err)
	}

	defer func() { _ = root.Close() }()

	err = root.MkdirAll(filepath.Dir(name), 0o750)
	if err != nil {
		t.Fatalf("create the directory for %s: %v", name, err)
	}

	err = root.WriteFile(name, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

// runChecker runs the repository's script inside dir against document (the scratch one by default,
// the script's own default when ""), and returns its combined output.
func runChecker(t *testing.T, dir string, document ...string) (string, error) {
	t.Helper()

	root := toolgate.RepoRoot(t)
	script := filepath.Join(root, scriptPath)

	// Reading the script makes it part of the test cache key; a program run only through exec is
	// not, and an edited script would otherwise replay a cached pass.
	_, err := os.ReadFile(script)
	if err != nil {
		t.Fatalf("read the script: %v", err)
	}

	target := docFile
	if len(document) > 0 {
		target = document[0]
	}

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, script)
	cmd.Dir = dir

	cmd.Env = os.Environ()
	if target != "" {
		cmd.Env = append(cmd.Env, "PACKAGE_MAP_DOC="+target)
	}

	output, runErr := cmd.CombinedOutput()

	return string(output), runErr
}
