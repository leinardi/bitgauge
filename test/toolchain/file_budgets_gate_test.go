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
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// budgetFile is the committed ceiling and exemption list, at the repository root.
const budgetFile = ".file-budgets"

// TestFileBudgetsHookReadsTheWholeTree pins how the hook is wired. It scans the tree rather than a
// file list, which is the only way an entry for a file the commit deletes can be noticed, and
// pre-commit hands a hook no deleted paths at all.
func TestFileBudgetsHookReadsTheWholeTree(t *testing.T) {
	t.Parallel()

	hooks := preCommitHooks(t)["check-file-budgets"]
	if len(hooks) != 1 {
		t.Fatalf(".pre-commit-config.yaml has %d check-file-budgets hooks, want one", len(hooks))
	}

	hook := hooks[0]

	for _, want := range []struct {
		key   string
		value any
		why   string
	}{
		{"entry", "scripts/check-file-budgets.sh", "the hook has to run the script that holds the budgets"},
		{"pass_filenames", false, "the script scans the tree; a file list would be read as arguments"},
		{"always_run", true, "a commit that only deletes a budgeted file must still reach the hook"},
	} {
		if hook[want.key] != want.value {
			t.Errorf("the check-file-budgets hook has %s: %v, want %v: %s",
				want.key, hook[want.key], want.value, want.why)
		}
	}

	stages, _ := hook["stages"].([]any)
	if !slices.Equal(stages, []any{"pre-commit"}) {
		t.Errorf("the check-file-budgets hook runs at stages %v, want [pre-commit]: always_run "+
			"makes a hook eligible at commit-msg too, where it means nothing", hook["stages"])
	}
}

// TestEslintTakesItsCeilingFromTheBudgetFile pins the single source of truth. Two copies of the
// ceiling, or two copies of the exemption list, drift apart silently: the number nobody edited
// wins in one mechanism and loses in the other, and the file budgets stop meaning anything.
func TestEslintTakesItsCeilingFromTheBudgetFile(t *testing.T) {
	t.Parallel()

	config := readRepoFile(t, "web", "eslint.config.ts")

	if !strings.Contains(config, "'../.file-budgets'") {
		t.Fatalf("web/eslint.config.ts does not read %s, so the ceiling exists twice", budgetFile)
	}

	if !strings.Contains(config, "max: maxLines") {
		t.Error("web/eslint.config.ts does not take max-lines from the budget file's ceiling")
	}

	if !strings.Contains(config, "...budgetedFiles") {
		t.Error("web/eslint.config.ts does not exempt the files the budget file lists")
	}

	// Counted the same way on both sides, or a file passes one mechanism and fails the other for
	// reasons nobody can see in its source.
	for _, option := range []string{"skipBlankLines: false", "skipComments: false"} {
		if !strings.Contains(config, option) {
			t.Errorf("web/eslint.config.ts does not set %q, so it counts lines differently from "+
				"scripts/check-file-budgets.sh", option)
		}
	}
}

// TestEslintEnforcesTheCeiling is the behavioral half: the config could stop applying the rule and
// every string assertion above would still pass. Both extensions are probed, because a rule that
// quietly failed to reach a .vue -- counting only its script block, or not firing on it at all --
// would be a ceiling in name only.
//
// The probes are linted through standard input under a filename that never exists on disk. An
// oversized file written into web/src would be seen by anything else reading the tree at that
// moment, the repository's own budget check included, and a killed test run would leave it there.
func TestEslintEnforcesTheCeiling(t *testing.T) {
	t.Parallel()

	eslint := toolgate.Lookup(t, toolgate.ESLint)
	readWebSources(t)

	ceiling := committedCeiling(t)

	for _, probe := range []struct {
		name     string
		filename string
		source   func(lines int) string
	}{
		{name: "typescript", filename: "src/lib/ceiling-probe.ts", source: typescriptOfLength},
		{name: "component", filename: "src/components/CeilingProbe.vue", source: componentOfLength},
	} {
		t.Run(probe.name, func(t *testing.T) {
			t.Parallel()

			output, err := lintSource(t, eslint, probe.filename, probe.source(ceiling+1))
			if err == nil {
				t.Fatalf("%d lines passed a ceiling of %d:\n%s", ceiling+1, ceiling, output)
			}

			if !strings.Contains(output, "max-lines") {
				t.Fatalf("the file failed for some reason other than its length:\n%s", output)
			}

			// One line shorter has to pass, or the ceiling is not the number it says it is.
			output, err = lintSource(t, eslint, probe.filename, probe.source(ceiling))
			if err != nil {
				t.Fatalf("exactly %d lines failed the ceiling: %v\n%s", ceiling, err, output)
			}
		})
	}
}

// TestEslintExemptsWhatTheScriptExempts pins the other side of the same wiring: every file the
// budget file lists, and every kind of file scripts/check-file-budgets.sh leaves out of scope
// (generated, vendored and test code), is linted with source over the ceiling, and a run that
// reported max-lines would mean ESLint holds a file to a ceiling the script does not.
func TestEslintExemptsWhatTheScriptExempts(t *testing.T) {
	t.Parallel()

	eslint := toolgate.Lookup(t, toolgate.ESLint)
	readWebSources(t)

	ceiling := committedCeiling(t)

	outOfScope := []string{
		"web/src/api/types.gen.ts",
		"web/src/components/ui/button/Button.vue",
		"web/src/test/render.ts",
		"web/src/lib/ceiling-probe.test.ts",
		"web/src/lib/ceiling-probe.spec.ts",
	}

	for _, path := range slices.Concat(outOfScope, budgetedPaths(t)) {
		t.Run(path, func(t *testing.T) {
			t.Parallel()

			source := typescriptOfLength
			if strings.HasSuffix(path, ".vue") {
				source = componentOfLength
			}

			output, _ := lintSource(t, eslint, strings.TrimPrefix(path, "web/"), source(ceiling+1))
			if strings.Contains(output, "max-lines") {
				t.Errorf("%s is out of the ceiling's scope but ESLint still holds it to it:\n%s",
					path, output)
			}
		})
	}
}

// typescriptOfLength returns a lint-clean TypeScript module of exactly the requested line count.
func typescriptOfLength(lines int) string {
	return "export const probe = 1\n" + strings.Repeat("// filler\n", lines-1)
}

// componentOfLength returns a lint-clean single-file component of exactly the requested line
// count. The template holds no text, so the i18n rules have nothing to say about it.
func componentOfLength(lines int) string {
	head := []string{
		"<template>",
		"  <div />",
		"</template>",
		"",
		`<script setup lang="ts">`,
	}
	tail := []string{"</script>"}

	body := strings.Repeat("// filler\n", lines-len(head)-len(tail))

	return strings.Join(head, "\n") + "\n" + body + strings.Join(tail, "\n") + "\n"
}

// committedCeiling returns the ceiling the budget file declares, read as the script reads it.
func committedCeiling(t *testing.T) int {
	t.Helper()

	found := regexp.MustCompile(`(?m)^\s*#\s+ceiling\s+(\d+)\s*$`).
		FindStringSubmatch(readRepoFile(t, budgetFile))
	if found == nil {
		t.Fatalf("%s declares no ceiling", budgetFile)
	}

	ceiling, err := strconv.Atoi(found[1])
	if err != nil {
		t.Fatalf("the ceiling in %s is not a number: %v", budgetFile, err)
	}

	return ceiling
}

// budgetedPaths returns the repository-relative paths the budget file exempts.
func budgetedPaths(t *testing.T) []string {
	t.Helper()

	var paths []string

	for line := range strings.SplitSeq(readRepoFile(t, budgetFile), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		path, _, found := strings.Cut(line, "\t")
		if !found {
			t.Fatalf("%s carries a line that is not an entry: %q", budgetFile, line)
		}

		paths = append(paths, path)
	}

	return paths
}

// lintSource lints source text as though it were the named file inside the web workspace. ESLint
// resolves the flat config from that name, so the rules are the ones that path would really get,
// while nothing is written to the tree. The cache the npm script uses is off: the same name
// carries different text between runs.
func lintSource(t *testing.T, eslint, filename, source string) (string, error) {
	t.Helper()

	cmd := exec.CommandContext(
		t.Context(),
		eslint,
		"--no-cache",
		"--stdin",
		"--stdin-filename",
		filename,
	)
	cmd.Dir = filepath.Join(toolgate.RepoRoot(t), "web")
	cmd.Stdin = strings.NewReader(source)

	output, err := cmd.CombinedOutput()

	return string(output), err
}
