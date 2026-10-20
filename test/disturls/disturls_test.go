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

// Package disturls_test drives scripts/check-dist-urls.sh against scratch dists, each with the
// repository's own allowlist.
package disturls_test

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

// runCheck runs the script on dist with the repository's allowlist, from a scratch directory.
func runCheck(t *testing.T, dist string) (string, error) {
	t.Helper()

	script := repoFile(t, "scripts/check-dist-urls.sh")

	// Reading the script and the allowlist makes them part of the test cache key; a program run
	// only through exec is not, and an edit would otherwise replay a cached pass.
	for _, path := range []string{script, repoFile(t, ".dist-url-allowlist")} {
		_, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
	}

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, script, dist)
	cmd.Dir = t.TempDir()
	cmd.Env = append(os.Environ(), "DIST_URL_ALLOWLIST="+repoFile(t, ".dist-url-allowlist"))

	output, err := cmd.CombinedOutput()

	return string(output), err
}

// TestDistURLs covers what passes and, as negative controls, each kind of URL that must fail.
func TestDistURLs(t *testing.T) {
	t.Parallel()

	const page = `<!doctype html><html><head><link rel="icon" href="favicon.svg"></head></html>`

	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{
			name: "the namespaces, the license header and the repository pass",
			files: map[string]string{
				"index.html":            page,
				"favicon.svg":           `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`,
				"assets/index-a1b2.js":  `/* along with BitGauge.  If not, see <http://www.gnu.org/licenses/>. */ const s="https://github.com/leinardi/bitgauge";`,
				"assets/about-c3d4.js":  `a="https://github.com/leinardi/bitgauge/blob/main/docs/features/deployment-example.md#2-proxy",b="https://github.com/leinardi/bitgauge?tab=readme".`,
				"assets/worker-e5f6.js": `self.onmessage=()=>{}`,
			},
		},
		{
			name: "a CDN fails",
			files: map[string]string{
				"index.html": `<script src="https://cdn.example.com/vue.js"></script>`,
			},
			want: "index.html: https://cdn.example.com/vue.js is not on the dist URL allowlist",
		},
		{
			name: "a longer name than the repository fails",
			files: map[string]string{
				"assets/index-a1b2.js": `x="https://github.com/leinardi/bitgauge-fork/x"`,
			},
			want: "https://github.com/leinardi/bitgauge-fork/x is not on the dist URL allowlist",
		},
		{
			name: "another path on an allowed host fails",
			files: map[string]string{
				"assets/index-a1b2.js": `x="http://www.w3.org/2000/svg/other",y="https://github.com/other"`,
			},
			want: "http://www.w3.org/2000/svg/other is not on the dist URL allowlist",
		},
		{
			name: "a WebSocket URL fails",
			files: map[string]string{
				"assets/worker-e5f6.js": "new WebSocket(`wss://telemetry.example/ws`)",
			},
			want: "wss://telemetry.example/ws is not on the dist URL allowlist",
		},
		{
			name: "a URL inside a binary file fails",
			files: map[string]string{
				"favicon-16.png": "\x89PNG\r\n\x1a\n\x00\x00caBX\x00http://c2pa.org/manifest\x00\xff",
			},
			want: "favicon-16.png: http://c2pa.org/manifest is not on the dist URL allowlist",
		},
		{
			name: "a scheme in upper case fails",
			files: map[string]string{
				"index.html": `<script src="HTTPS://cdn.example.com/vue.js"></script>`,
			},
			want: "https://cdn.example.com/vue.js is not on the dist URL allowlist",
		},
		{
			name:  "an IPv6 host fails",
			files: map[string]string{"assets/index-a1b2.js": `x="https://[2001:db8::1]/x"`},
			want:  "https://[2001:db8::1]/x is not on the dist URL allowlist",
		},
		{
			name: "a non-ASCII host fails",
			files: map[string]string{
				"assets/index-a1b2.js": `x="https://` + "\xc3\xa9" + `vil.example/x"`,
			},
			want: "a URL with characters outside ASCII is not on the dist URL allowlist",
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
				t.Errorf("the failure does not name the URL, wanted %q:\n%s", testCase.want, output)
			}
		})
	}
}

// TestDistURLsWithoutADist pins that a missing dist fails rather than passing on nothing.
func TestDistURLsWithoutADist(t *testing.T) {
	t.Parallel()

	output, err := runCheck(t, filepath.Join(t.TempDir(), "missing"))
	if err == nil || !strings.Contains(output, "no dist at") {
		t.Fatalf("a missing dist did not fail: %v\n%s", err, output)
	}
}
