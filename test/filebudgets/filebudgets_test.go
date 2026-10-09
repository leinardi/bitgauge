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

// Package filebudgets_test drives scripts/check-file-budgets.sh against scratch trees.
//
// The scratch trees declare a ceiling of their own -- ten lines -- so a fixture is a handful of
// lines rather than hundreds. The number is data in the budget file, so a small one exercises the
// same code the repository's own ceiling does, and one test at the end runs the script over this
// repository to pin that the committed budgets still describe it.
package filebudgets_test

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

const budgetFile = ".file-budgets"

// scratchCeiling keeps the fixtures small. The repository's own ceiling lives in its budget file.
const scratchCeiling = 10

const commandTimeout = 2 * time.Minute

// TestFileBudgets covers the five cases the budgets exist for. Each one is a way a file's size can
// drift away from the number committed for it, and all five have to fail except the one that is
// the whole point: a budget lowered to match a file that got shorter.
func TestFileBudgets(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		lines   int
		budget  int
		wantErr bool
		want    string
	}{
		{
			name:    "a budgeted file that grew fails",
			lines:   12,
			budget:  11,
			wantErr: true,
			want:    "may only shrink",
		},
		{
			name:    "a budgeted file that shrank fails while its budget is stale",
			lines:   11,
			budget:  12,
			wantErr: true,
			want:    "budget still claims 12",
		},
		{
			name:   "the lowered budget passes",
			lines:  11,
			budget: 11,
		},
		{
			name:    "a budgeted file that reached the ceiling has to lose its exemption",
			lines:   9,
			budget:  12,
			wantErr: true,
			want:    "delete its budget entry",
		},
		{
			// budget 0 means the file is not listed at all.
			name:    "a new oversized file with no entry fails",
			lines:   12,
			budget:  0,
			wantErr: true,
			want:    "does not exempt it",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			writeSource(t, dir, "web/src/pages/BigPage.vue", testCase.lines)

			var entries []string
			if testCase.budget > 0 {
				entries = append(entries, entry("web/src/pages/BigPage.vue", testCase.budget))
			}

			writeBudgets(t, dir, entries...)

			output, err := runBudgets(t, dir)

			if testCase.wantErr && err == nil {
				t.Fatalf("the check passed but should not have:\n%s", output)
			}

			if !testCase.wantErr && err != nil {
				t.Fatalf("the check failed but should not have: %v\n%s", err, output)
			}

			if testCase.want != "" && !strings.Contains(output, testCase.want) {
				t.Errorf("the failure does not say what to do about it, wanted %q:\n%s",
					testCase.want, output)
			}
		})
	}
}

// TestFileBudgetsLeavesGeneratedAndTestCodeAlone pins the scope. A ceiling on a file nobody here
// wrote by hand would move whenever it is regenerated, and a long test file is long for reasons
// that are not the ones this ceiling is about.
func TestFileBudgetsLeavesGeneratedAndTestCodeAlone(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	for _, path := range []string{
		"web/src/api/types.gen.ts",
		"web/src/components/ui/button/Button.vue",
		"web/src/test/harness.ts",
		"web/src/components/Gauge.test.ts",
		"web/src/lib/format.spec.ts",
	} {
		writeSource(t, dir, path, 40)
	}

	writeBudgets(t, dir)

	output, err := runBudgets(t, dir)
	if err != nil {
		t.Fatalf("the check fails on files it does not govern: %v\n%s", err, output)
	}
}

// TestFileBudgetsUpdateOnlyLowersAndDeletes pins the direction. A budget that could be raised by
// running a command is not a ratchet at all -- the file would grow and the command would bless it.
func TestFileBudgetsUpdateOnlyLowersAndDeletes(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSource(t, dir, "web/src/pages/Shrunk.vue", 11)
	writeSource(t, dir, "web/src/pages/Finished.vue", 8)
	writeBudgets(t, dir,
		entry("web/src/pages/Shrunk.vue", 14),
		entry("web/src/pages/Finished.vue", 13),
	)

	output, err := runBudgets(t, dir, "--update")
	if err != nil {
		t.Fatalf("--update failed: %v\n%s", err, output)
	}

	budgets := readFile(t, filepath.Join(dir, budgetFile))

	if !strings.Contains(budgets, entry("web/src/pages/Shrunk.vue", 11)) {
		t.Errorf("--update did not lower the stale budget:\n%s", budgets)
	}

	if strings.Contains(budgets, "Finished.vue") {
		t.Errorf("--update kept an entry for a file that reached the ceiling:\n%s", budgets)
	}

	output, err = runBudgets(t, dir)
	if err != nil {
		t.Fatalf("the check still fails after --update: %v\n%s", err, output)
	}
}

// TestFileBudgetsUpdateRefusesToRaiseABudget pins the other half of that direction: a file that
// grew has to be shortened, and no mode of this script will record the larger number for it.
func TestFileBudgetsUpdateRefusesToRaiseABudget(t *testing.T) {
	t.Parallel()

	for _, mode := range []string{"--update", "--adopt"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			writeSource(t, dir, "web/src/pages/Grown.vue", 15)
			writeBudgets(t, dir, entry("web/src/pages/Grown.vue", 12))

			before := readFile(t, filepath.Join(dir, budgetFile))

			output, err := runBudgets(t, dir, mode)
			if err == nil {
				t.Fatalf("%s raised a budget instead of refusing:\n%s", mode, output)
			}

			if readFile(t, filepath.Join(dir, budgetFile)) != before {
				t.Errorf("%s rewrote the budget file while refusing:\n%s", mode, output)
			}
		})
	}
}

// TestFileBudgetsUpdateDoesNotAdoptANewOffender separates the two modes. --update is the routine
// one, run after shortening a file; it must not quietly legalize a new oversized file on the way.
func TestFileBudgetsUpdateDoesNotAdoptANewOffender(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSource(t, dir, "web/src/pages/NewAndLong.vue", 12)
	writeBudgets(t, dir)

	output, err := runBudgets(t, dir, "--update")
	if err != nil {
		t.Fatalf("--update failed: %v\n%s", err, output)
	}

	if strings.Contains(readFile(t, filepath.Join(dir, budgetFile)), "NewAndLong.vue") {
		t.Fatalf(
			"--update adopted a new oversized file:\n%s",
			readFile(t, filepath.Join(dir, budgetFile)),
		)
	}

	output, err = runBudgets(t, dir)
	if err == nil {
		t.Errorf("the new oversized file still passes the check:\n%s", output)
	}
}

// TestFileBudgetsAdoptRecordsANewOffender covers how the committed file was first written, and the
// deliberate exemption that a reviewer reads as a diff.
func TestFileBudgetsAdoptRecordsANewOffender(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSource(t, dir, "web/src/pages/NewAndLong.vue", 12)
	writeBudgets(t, dir)

	output, err := runBudgets(t, dir, "--adopt")
	if err != nil {
		t.Fatalf("--adopt failed: %v\n%s", err, output)
	}

	if !strings.Contains(readFile(t, filepath.Join(dir, budgetFile)),
		entry("web/src/pages/NewAndLong.vue", 12)) {
		t.Fatalf("--adopt recorded nothing:\n%s", readFile(t, filepath.Join(dir, budgetFile)))
	}

	output, err = runBudgets(t, dir)
	if err != nil {
		t.Errorf("the check fails after --adopt: %v\n%s", err, output)
	}
}

// TestFileBudgetsRejectsAnEntryWithNoFile pins that the budget file has to describe the tree. A
// leftover entry is a budget nobody is being held to, and it hides a file that was renamed.
func TestFileBudgetsRejectsAnEntryWithNoFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeBudgets(t, dir, entry("web/src/pages/Gone.vue", 12))

	output, err := runBudgets(t, dir)
	if err == nil {
		t.Fatalf("an entry for a file that does not exist passed:\n%s", output)
	}

	if !strings.Contains(output, "not a file this ceiling governs") {
		t.Errorf("the failure does not name the reason:\n%s", output)
	}
}

// TestFileBudgetsFindsABudgetedFileInALongTree pins that a budgeted file that exists is found
// however many files come after it. Searching the scanned list through a pipe into grep -q let
// grep exit on the match while the writer was still writing, and pipefail turned the writer's
// SIGPIPE into "not a file this ceiling governs" -- only sometimes, and more often the longer the
// tree. The names are long so the list outgrows the pipe on every run without thousands of files.
func TestFileBudgetsFindsABudgetedFileInALongTree(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSource(t, dir, "web/src/a/Big.vue", 12)

	padding := strings.Repeat("x", 200)
	for index := range 500 {
		writeSource(t, dir, "web/src/b/"+padding+strconv.Itoa(index)+".vue", 1)
	}

	writeBudgets(t, dir, entry("web/src/a/Big.vue", 12))

	output, err := runBudgets(t, dir)
	if err != nil {
		t.Fatalf("a budgeted file that exists was not found: %v\n%s", err, output)
	}
}

// TestFileBudgetsWithoutAWebSource pins the skeleton case: before web/src exists there is nothing
// to govern, so the check passes on the empty set -- but the ceiling is still read, and an entry
// still has to name a governed file.
func TestFileBudgetsWithoutAWebSource(t *testing.T) {
	t.Parallel()

	t.Run("no entries passes", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		writeBudgets(t, dir)

		output, err := runBudgets(t, dir)
		if err != nil {
			t.Fatalf("the check fails on a tree with no web/src: %v\n%s", err, output)
		}
	})

	t.Run("an entry fails", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		writeBudgets(t, dir, entry("web/src/pages/Test.vue", 12))

		output, err := runBudgets(t, dir)
		if err == nil || !strings.Contains(output, "not a file this ceiling governs") {
			t.Fatalf("an entry passed with no web/src: %v\n%s", err, output)
		}
	})

	t.Run("prose that starts a line with ceiling is not the ceiling", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		writeFile(t, dir, budgetFile, "# held under the\n# ceiling below.\n# ceiling 10\n")
		writeSource(t, dir, "web/src/pages/Test.vue", 12)

		output, err := runBudgets(t, dir)
		if err == nil || !strings.Contains(output, "over the ceiling of 10") {
			t.Fatalf("the ceiling was not read from its declaration: %v\n%s", err, output)
		}
	})

	t.Run("no ceiling fails", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		writeFile(t, dir, budgetFile, "# scratch budgets with no ceiling\n")

		output, err := runBudgets(t, dir)
		if err == nil || !strings.Contains(output, "declares no") {
			t.Fatalf("a budget file with no ceiling passed: %v\n%s", err, output)
		}
	})
}

// TestFileBudgetsWithoutABudgetFile pins that a missing budget file is a failure rather than a
// green run over nothing.
func TestFileBudgetsWithoutABudgetFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSource(t, dir, "web/src/pages/BigPage.vue", 12)

	output, err := runBudgets(t, dir)
	if err == nil {
		t.Fatalf("the check passed with no budget file at all:\n%s", output)
	}
}

// TestRepositoryMatchesItsBudgets runs the script over this repository, which is what the commit
// hook does. It is here so that a frontend edit that outgrows a budget fails a Go test too, rather
// than waiting for the hook.
func TestRepositoryMatchesItsBudgets(t *testing.T) {
	t.Parallel()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve the repository root: %v", err)
	}

	if !strings.Contains(readFile(t, filepath.Join(root, budgetFile)), "\n# ceiling 400\n") {
		t.Errorf("%s does not declare the 400-line ceiling", budgetFile)
	}

	readGovernedTree(t, root)

	output, runErr := runBudgets(t, root)
	if runErr != nil {
		t.Fatalf("the repository disagrees with %s: %v\n%s", budgetFile, runErr, output)
	}
}

// readGovernedTree reads every file under web/src. The script reads the tree through exec, which the
// test cache cannot see; reading it here makes a frontend edit invalidate a cached pass.
func readGovernedTree(t *testing.T, root string) {
	t.Helper()

	source, err := os.OpenRoot(filepath.Join(root, "web", "src"))
	if errors.Is(err, fs.ErrNotExist) {
		return
	}

	if err != nil {
		t.Fatalf("open web/src: %v", err)
	}

	defer source.Close()

	tree := source.FS()

	err = fs.WalkDir(tree, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}

		_, readErr := fs.ReadFile(tree, path)
		if readErr != nil {
			return fmt.Errorf("read %s: %w", path, readErr)
		}

		return nil
	})
	if err != nil {
		t.Fatalf("read web/src: %v", err)
	}
}

// entry formats one budget line the way the file stores it.
func entry(path string, lines int) string {
	return path + "\t" + strconv.Itoa(lines)
}

// writeBudgets writes a scratch budget file declaring the scratch ceiling.
func writeBudgets(t *testing.T, dir string, entries ...string) {
	t.Helper()

	content := "# scratch budgets\n# ceiling " + strconv.Itoa(scratchCeiling) + "\n"
	if len(entries) > 0 {
		content += strings.Join(entries, "\n") + "\n"
	}

	writeFile(t, dir, budgetFile, content)
}

// writeSource writes a source file of exactly the requested number of lines.
func writeSource(t *testing.T, dir, name string, lines int) {
	t.Helper()

	writeFile(t, dir, name, strings.Repeat("// line\n", lines))
}

// writeFile writes one file inside the scratch tree, creating the directories above it.
func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()

	path := filepath.Join(dir, name)

	err := os.MkdirAll(filepath.Dir(path), 0o750)
	if err != nil {
		t.Fatalf("create the directory for %s: %v", name, err)
	}

	err = os.WriteFile(path, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

// readFile reads one file back.
func readFile(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	return string(content)
}

// runBudgets runs the script inside a tree and returns its combined output.
func runBudgets(t *testing.T, dir string, args ...string) (string, error) {
	t.Helper()

	script, err := filepath.Abs(filepath.Join("..", "..", "scripts", "check-file-budgets.sh"))
	if err != nil {
		t.Fatalf("resolve the script path: %v", err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	// Reading the script makes it part of the test cache key; a program run only through exec is
	// not, and an edited script would otherwise replay a cached pass.
	_, err = os.ReadFile(script)
	if err != nil {
		t.Fatalf("read the script: %v", err)
	}

	cmd := exec.CommandContext(ctx, script, args...)
	cmd.Dir = dir

	output, runErr := cmd.CombinedOutput()

	return string(output), runErr
}
