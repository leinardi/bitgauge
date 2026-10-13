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

// Package distdemo_test drives scripts/check-dist-demo-free.sh against scratch dists: a clean one
// passes, and each sentinel, a missing dist and an empty one fail. A dist holding the demo's own
// sources fails too, so a sentinel that no longer matches the demo is noticed.
package distdemo_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const commandTimeout = time.Minute

// repoFile is a path relative to the repository root, from this package's directory.
func repoFile(t *testing.T, rel string) string {
	t.Helper()

	path, err := filepath.Abs(filepath.Join("..", "..", rel))
	if err != nil {
		t.Fatalf("resolve %s: %v", rel, err)
	}

	return path
}

// writeDist writes a scratch dist from relative paths to contents and returns its directory.
func writeDist(t *testing.T, files map[string]string) string {
	t.Helper()

	dir := filepath.Join(t.TempDir(), "dist")

	err := os.MkdirAll(dir, 0o750)
	if err != nil {
		t.Fatalf("create the dist: %v", err)
	}

	for rel, content := range files {
		path := filepath.Join(dir, rel)

		err = os.MkdirAll(filepath.Dir(path), 0o750)
		if err != nil {
			t.Fatalf("create %s: %v", filepath.Dir(path), err)
		}

		err = os.WriteFile(path, []byte(content), 0o600)
		if err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}

	return dir
}

// runCheck runs the script on dist from a scratch directory.
func runCheck(t *testing.T, dist string) (string, error) {
	t.Helper()

	script := repoFile(t, "scripts/check-dist-demo-free.sh")

	// Reading the script makes it part of the test cache key; a program run only through exec is
	// not, and an edit would otherwise replay a cached pass.
	_, err := os.ReadFile(script)
	if err != nil {
		t.Fatalf("read %s: %v", script, err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, script, dist)
	cmd.Dir = t.TempDir()

	output, err := cmd.CombinedOutput()

	return string(output), err
}

// TestDistDemoFree covers what passes and, as negative controls, each sentinel and an empty dist.
func TestDistDemoFree(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{
			name: "a production dist passes",
			files: map[string]string{
				"index.html":             `<!doctype html><meta name="bitgauge-base-path" content="/">`,
				"assets/index-a1b2.js":   `const theme="bitgauge-theme";new Worker(new URL("worker-e5f6.js",import.meta.url))`,
				"assets/worker-e5f6.js":  `self.onmessage=()=>{}`,
				"assets/demo-notes.txt":  `a demonstration`,
				"favicon-16.png":         "\x89PNG\r\n\x1a\n\x00\x00\xff",
				"assets/index-c3d4.css":  `.demo-free{}`,
				"assets/NotAvailable.js": `x="Basement"`,
			},
		},
		{
			name: "the panel's storage key fails",
			files: map[string]string{
				"assets/DemoPanel-a1b2.js": `localStorage.getItem("bitgauge-demo")`,
			},
			want: "assets/DemoPanel-a1b2.js: contains the demo sentinel bitgauge-demo",
		},
		{
			name:  "the scenario table fails",
			files: map[string]string{"assets/index-a1b2.js": `const DEMO_SCENARIOS={}`},
			want:  "contains the demo sentinel DEMO_SCENARIOS",
		},
		{
			name:  "the fixture server fails",
			files: map[string]string{"assets/worker-e5f6.js": `{name:"Basement NAS"}`},
			want:  "assets/worker-e5f6.js: contains the demo sentinel Basement NAS",
		},
		{
			name: "the demo Worker's path fails",
			files: map[string]string{
				"assets/index-a1b2.js.map": `{"sources":["../src/demo/worker.ts"]}`,
			},
			want: "contains the demo sentinel demo/worker",
		},
		{
			name:  "a sentinel inside a binary file fails",
			files: map[string]string{"assets/blob.bin": "\x00\xffBasement NAS\x00"},
			want:  "assets/blob.bin: contains the demo sentinel Basement NAS",
		},
		{
			name:  "an empty dist fails",
			files: map[string]string{},
			want:  "holds no file",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			output, err := runCheck(t, writeDist(t, testCase.files))

			if testCase.want == "" {
				if err != nil {
					t.Fatalf("the check failed but should not have: %v\n%s", err, output)
				}

				return
			}

			if err == nil {
				t.Fatalf("the check passed but should not have:\n%s", output)
			}

			if !strings.Contains(output, testCase.want) {
				t.Errorf(
					"the failure does not name the sentinel, wanted %q:\n%s",
					testCase.want,
					output,
				)
			}
		})
	}
}

// TestDistDemoFreeWithoutADist pins that a missing dist fails rather than passing on nothing.
func TestDistDemoFreeWithoutADist(t *testing.T) {
	t.Parallel()

	output, err := runCheck(t, filepath.Join(t.TempDir(), "missing"))
	if err == nil || !strings.Contains(output, "no dist at") {
		t.Fatalf("a missing dist did not fail: %v\n%s", err, output)
	}
}

// TestDistDemoFreeCatchesTheDemoSources runs the check on the demo's own panel and fixtures: the
// sentinels must still name what the demo is made of, or a demo build could pass.
func TestDistDemoFreeCatchesTheDemoSources(t *testing.T) {
	t.Parallel()

	files := map[string]string{}

	for _, rel := range []string{"web/src/demo/DemoPanel.vue", "web/src/demo/fixtures.ts", "web/src/demo/scenarios.ts"} {
		content, err := os.ReadFile(repoFile(t, rel))
		if err != nil {
			t.Fatalf("read %s: %v", rel, err)
		}

		files[filepath.Base(rel)] = string(content)
	}

	output, err := runCheck(t, writeDist(t, files))
	if err == nil {
		t.Fatalf("the demo's sources passed the check:\n%s", output)
	}

	for _, want := range []string{
		"DemoPanel.vue: contains the demo sentinel bitgauge-demo",
		"fixtures.ts: contains the demo sentinel Basement NAS",
		"scenarios.ts: contains the demo sentinel DEMO_SCENARIOS",
	} {
		if !strings.Contains(output, want) {
			t.Errorf("the check did not report %q:\n%s", want, output)
		}
	}
}
