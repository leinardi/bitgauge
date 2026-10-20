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

package docs_test

import (
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/docs"
	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// excludedTrees are Markdown the project does not author: the vendored skills (pinned upstream in
// skills-lock.json) and the design export (never hand-edited). The parts of the export that
// docs/features symlinks to are still checked, under their docs/features path.
var excludedTrees = []string{
	".agents/skills/fallow/",
	".agents/skills/vue-best-practices/",
	".agents/skills/vue-router-best-practices/",
	".agents/skills/vue-testing-best-practices/",
	"docs/design_system/",
}

// featuresDir is the product and technical contract the wire facts are checked in.
const featuresDir = "docs/features"

// TestRelativeLinksResolve checks every relative link and fragment in the project's Markdown.
func TestRelativeLinksResolve(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	checker := docs.NewChecker(root)

	for _, rel := range markdownFiles(t, root) {
		problems, err := checker.CheckFile(rel)
		if err != nil {
			t.Fatal(err)
		}

		for _, problem := range problems {
			t.Error(problem)
		}
	}
}

// TestNativeAPIPaths checks that the contract names no /api/v1 path beyond the six native ones.
func TestNativeAPIPaths(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	found := 0

	for _, rel := range featureFiles(t, root) {
		unknownPaths, count := docs.APIPaths(read(t, root, rel))
		found += count

		for _, unknown := range unknownPaths {
			t.Errorf(
				"%s names %s, which is not one of the native endpoints %v",
				rel,
				unknown,
				docs.NativeEndpoints,
			)
		}
	}

	if found == 0 {
		t.Errorf("no /api/v1 path found in %s: the check would pass on nothing", featuresDir)
	}
}

// TestUploadTelemetryShape checks every upload telemetry object the contract shows against the
// one key set wire-protocol.md section 4 defines.
func TestUploadTelemetryShape(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	want := slices.Clone(docs.UploadKeys)
	sort.Strings(want)

	found := 0

	for _, rel := range featureFiles(t, root) {
		for _, keys := range docs.UploadObjects(read(t, root, rel)) {
			found++

			if !slices.Equal(keys, want) {
				t.Errorf("%s shows upload telemetry with keys %v, want exactly %v", rel, keys, want)
			}
		}
	}

	if found == 0 {
		t.Error("no upload telemetry object found: the check would pass on nothing")
	}
}

// TestFactsAgree checks the numbers in docs.Facts wherever the contract states them.
func TestFactsAgree(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	files := featureFiles(t, root)

	for _, fact := range docs.Facts {
		found := 0

		for _, rel := range files {
			mismatches, count := docs.CheckFact(fact, read(t, root, rel))
			found += count

			for _, mismatch := range mismatches {
				t.Errorf(
					"%s:%d: %s is %s, want %s",
					rel,
					mismatch.Line,
					fact.Name,
					mismatch.Got,
					fact.Want,
				)
			}
		}

		if found == 0 {
			t.Errorf("%s (%s) is stated nowhere in %s: reword the pattern, not the check away",
				fact.Name, fact.Pattern, featuresDir)
		}
	}
}

// TestCheckerFindsBrokenLinks proves the link check is not blind, on a scratch tree.
func TestCheckerFindsBrokenLinks(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFixture(t, dir, "a.md", strings.Join([]string{
		"# Title",
		"## 1. Section — `GET /x`",
		"[ok](b.md#heading-two) [ok](#1-section--get-x) [ok](https://example.com/missing)",
		"[broken file](missing.md) [broken anchor](b.md#nope) `[in code](missing-too.md)`",
		"```text",
		"[in a fence](missing-three.md)",
		"```",
	}, "\n"))
	writeFixture(t, dir, "b.md", "# Heading Two\n")

	problems, err := docs.NewChecker(dir).CheckFile("a.md")
	if err != nil {
		t.Fatal(err)
	}

	got := make([]string, 0, len(problems))
	for _, problem := range problems {
		got = append(got, problem.String())
	}

	want := []string{
		`a.md:4: link "missing.md": missing.md does not exist`,
		`a.md:4: link "b.md#nope": b.md has no heading or anchor #nope`,
	}
	if !slices.Equal(got, want) {
		t.Errorf("problems = %q, want %q", got, want)
	}
}

// TestSlug pins the GitHub slug rules the anchors follow.
func TestSlug(t *testing.T) {
	t.Parallel()

	for heading, want := range map[string]string{
		"1. Test (Home) — `/`":                        "1-test-home--",
		"5. `GET /api/v1/info`":                       "5-get-apiv1info",
		"5.1 Implementation":                          "51-implementation",
		"Why the Build Happens Before the Tag":        "why-the-build-happens-before-the-tag",
		"11.2 Path A fallback — HTTP probe":           "112-path-a-fallback--http-probe",
		"5. History Module (`idb`)":                   "5-history-module-idb",
		"**Bold** and _emphasis_ with snake_case":     "bold-and-emphasis-with-snake_case",
		"[Linked](other.md) heading":                  "linked-heading",
		"2.2 Stateless Server":                        "22-stateless-server",
		"Tags, Moves and `X.Y.Z`":                     "tags-moves-and-xyz",
		"Ünïcode Lëtters Stay":                        "ünïcode-lëtters-stay",
		"Required Checks and Fork Pull Requests":      "required-checks-and-fork-pull-requests",
		"6. `compat.networkquality.max_upload_bytes`": "6-compatnetworkqualitymax_upload_bytes",
	} {
		if got := docs.Slug(heading); got != want {
			t.Errorf("Slug(%q) = %q, want %q", heading, got, want)
		}
	}
}

// TestUploadObjectsShorthand covers the {a, b[], c} form of the architecture diagram.
func TestUploadObjectsShorthand(t *testing.T) {
	t.Parallel()

	objects := docs.UploadObjects(
		"200 {epoch, bucketMs, buckets[], bytes} and {\"bucketMs\": 100, \"values\": []}",
	)
	if len(objects) != 1 ||
		!slices.Equal(objects[0], []string{"bucketMs", "buckets", "bytes", "epoch"}) {
		t.Errorf(
			"UploadObjects = %v, want one object with bucketMs, buckets, bytes, epoch",
			objects,
		)
	}
}

// markdownFiles returns the tracked Markdown outside excludedTrees, plus whatever docs/features
// reaches through symlinks, as slash-separated paths relative to root.
func markdownFiles(t *testing.T, root string) []string {
	t.Helper()

	cmd := exec.CommandContext(t.Context(), "git", "ls-files", "-z", "--", "*.md")
	cmd.Dir = root

	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git ls-files: %v", err)
	}

	seen := map[string]bool{}

	for rel := range strings.SplitSeq(strings.TrimRight(string(out), "\x00"), "\x00") {
		if rel != "" && !excluded(rel) {
			seen[rel] = true
		}
	}

	for _, rel := range featureFiles(t, root) {
		seen[rel] = true
	}

	files := make([]string, 0, len(seen))
	for rel := range seen {
		files = append(files, rel)
	}

	sort.Strings(files)

	return files
}

// featureFiles walks docs/features following symlinks, so pages that live in the design export
// are checked under the path readers use.
func featureFiles(t *testing.T, root string) []string {
	t.Helper()

	var files []string

	walk(t, root, featuresDir, &files)
	sort.Strings(files)

	return files
}

func walk(t *testing.T, root, rel string, files *[]string) {
	t.Helper()

	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}

	for _, entry := range entries {
		child := path.Join(rel, entry.Name())

		info, err := os.Stat(filepath.Join(root, filepath.FromSlash(child)))
		if err != nil {
			t.Errorf("%s: %v", child, err)

			continue
		}

		switch {
		case info.IsDir():
			walk(t, root, child, files)
		case info.Mode().IsRegular() && strings.HasSuffix(child, ".md"):
			*files = append(*files, child)
		case entry.Type()&fs.ModeSymlink != 0 && !info.IsDir():
			// A symlink to a non-Markdown file: nothing to check.
		}
	}
}

func excluded(rel string) bool {
	for _, tree := range excludedTrees {
		if strings.HasPrefix(rel, tree) {
			return true
		}
	}

	return false
}

func read(t *testing.T, root, rel string) string {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}

	return string(data)
}

func writeFixture(t *testing.T, dir, name, content string) {
	t.Helper()

	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("open %s: %v", dir, err)
	}

	defer func() { _ = root.Close() }()

	err = root.WriteFile(name, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}
