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

// Package chunksize_test drives scripts/check-chunk-size.sh against scratch dists and budgets.
package chunksize_test

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

func repoFile(t *testing.T, rel string) string {
	t.Helper()

	path, err := filepath.Abs(filepath.Join("..", "..", rel))
	if err != nil {
		t.Fatalf("resolve %s: %v", rel, err)
	}

	return path
}

func write(t *testing.T, path, content string) {
	t.Helper()

	err := os.MkdirAll(filepath.Dir(path), 0o750)
	if err != nil {
		t.Fatalf("create %s: %v", filepath.Dir(path), err)
	}

	err = os.WriteFile(path, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// runCheck writes a dist with chunks (file name to size in bytes) and a budget file, and runs the
// script on them.
func runCheck(t *testing.T, chunks map[string]int, budget string) (string, error) {
	t.Helper()

	dir := t.TempDir()
	dist := filepath.Join(dir, "dist")
	write(t, filepath.Join(dist, "index.html"), "<!doctype html>")

	for name, size := range chunks {
		write(t, filepath.Join(dist, "assets", name), strings.Repeat("x", size))
	}

	budgetFile := filepath.Join(dir, ".chunk-budget")
	write(t, budgetFile, budget)

	script := repoFile(t, "scripts/check-chunk-size.sh")

	// Reading the script makes it part of the test cache key.
	_, err := os.ReadFile(script)
	if err != nil {
		t.Fatalf("read the script: %v", err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, script, dist)
	cmd.Dir = dir

	cmd.Env = append(os.Environ(), "CHUNK_BUDGET="+budgetFile)

	output, err := cmd.CombinedOutput()

	return string(output), err
}

// TestChunkSize covers the budget held and, as negative controls, each way the check must fail.
func TestChunkSize(t *testing.T) {
	t.Parallel()

	const budget = "# a comment\n1000\n"

	cases := []struct {
		name   string
		chunks map[string]int
		budget string
		want   string
	}{
		{
			name:   "a chunk within the budget passes",
			chunks: map[string]int{"worker-a1b2.js": 1000, "index-c3d4.js": 5000},
			budget: budget,
		},
		{
			name:   "a chunk over the budget fails",
			chunks: map[string]int{"worker-a1b2.js": 1001},
			budget: budget,
			want:   "is 1001 bytes, over the budget of 1000",
		},
		{
			name:   "a dist without a Worker chunk fails",
			chunks: map[string]int{"index-c3d4.js": 10},
			budget: budget,
			want:   "no Worker chunk",
		},
		{
			name:   "a dist without assets fails",
			chunks: map[string]int{},
			budget: budget,
			want:   "no Worker chunk",
		},
		{
			name:   "two Worker chunks fail",
			chunks: map[string]int{"worker-a1b2.js": 10, "worker-e5f6.js": 10},
			budget: budget,
			want:   "2 Worker chunks",
		},
		{
			name:   "a budget that is not a number fails",
			chunks: map[string]int{"worker-a1b2.js": 10},
			budget: "128 KiB\n",
			want:   "not a number of bytes",
		},
		{
			name:   "an empty budget fails",
			chunks: map[string]int{"worker-a1b2.js": 10},
			budget: "# nothing\n",
			want:   "holds no number",
		},
		{
			name:   "two budgets fail",
			chunks: map[string]int{"worker-a1b2.js": 10},
			budget: "1000\n2000\n",
			want:   "more than one number",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			output, err := runCheck(t, testCase.chunks, testCase.budget)

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
				t.Errorf("the failure does not say why, wanted %q:\n%s", testCase.want, output)
			}
		})
	}
}
