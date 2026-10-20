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
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// vacuousFlags turn a gate with nothing to check, or a failing one, into a pass; none of these may
// appear where gates are defined.
var vacuousFlags = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"--passWithNoTests", regexp.MustCompile(`--pass-?[Ww]ith-?[Nn]o-?[Tt]ests`)},
	{"--no-error-on-unmatched-pattern", regexp.MustCompile(`--no-error-on-unmatched-pattern`)},
	{"|| true", regexp.MustCompile(`\|\|\s*(true\b|:(\s|;|$)|exit\s+0\b)`)},
	{"make's - recipe prefix", regexp.MustCompile(`^\t[@+]*-`)},
	{".IGNORE", regexp.MustCompile(`^\.IGNORE\b`)},
	{
		"make --ignore-errors",
		regexp.MustCompile(`\$\(MAKE\).*\s(-[a-zA-Z]*i[a-zA-Z]*|--ignore-errors)\b`),
	},
	{"continue-on-error", regexp.MustCompile(`continue-on-error`)},
	{
		"if: false",
		regexp.MustCompile(`\bif:\s*(["']?false["']?\s*$|["']?\$\{\{\s*false\s*\}\}["']?)`),
	},
}

// TestNoVacuousFlags scans the files that define gates: the make fragments, the web scripts, the
// pre-commit configuration and every YAML file under .github, the workflows included.
func TestNoVacuousFlags(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)

	fragments := glob(t, root, ".mk", ".mk")
	if len(fragments) == 0 {
		t.Fatal("no make fragments found under .mk/; the scan would check nothing")
	}

	// The workflows, and any composite action or other YAML GitHub reads, under .github.
	workflows := githubYAML(t)

	files := make([]string, 0, 3+len(fragments)+len(workflows))
	files = append(files, "Makefile", "web/package.json", ".pre-commit-config.yaml")
	files = append(files, fragments...)
	files = append(files, workflows...)

	for _, rel := range files {
		content := readRepoFile(t, rel)

		for _, hit := range vacuousHits(content) {
			t.Errorf("%s:%s", rel, hit)
		}
	}
}

// TestVacuousFlagsAreRecognized is the negative control: each flag, written as a gate would carry
// it, is found.
func TestVacuousFlagsAreRecognized(t *testing.T) {
	t.Parallel()

	for _, sample := range []string{
		`"test": "vitest run --passWithNoTests"`,
		`"lint": "eslint src --no-error-on-unmatched-pattern"`,
		"\tnpm --prefix web run lint || true",
		"\tgo vet ./... ||:",
		"\tgo vet ./... || exit 0",
		"\t-npm --prefix web run lint",
		"\t@-go vet ./...",
		".IGNORE: web-lint",
		"\t$(MAKE) -i go-test",
		"\t$(MAKE) --ignore-errors go-test",
		"        continue-on-error: true",
		"    if: false",
		"    if: ${{ false }}",
		"    if: 'false'",
		"    if: \"${{ false }}\"",
	} {
		if len(vacuousHits(sample)) == 0 {
			t.Errorf("no vacuous flag found in %q", sample)
		}
	}
}

func vacuousHits(content string) []string {
	var hits []string

	for index, line := range strings.Split(content, "\n") {
		for _, flag := range vacuousFlags {
			if flag.pattern.MatchString(line) {
				hits = append(
					hits,
					strconv.Itoa(index+1)+": "+flag.name+": "+strings.TrimSpace(line),
				)
			}
		}
	}

	return hits
}

// glob lists the files directly in dir (relative to root) with one of the suffixes, as paths
// relative to root; a missing directory lists nothing.
func glob(t *testing.T, root, dir string, suffixes ...string) []string {
	t.Helper()

	entries, err := os.ReadDir(filepath.Join(root, dir))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}

		t.Fatalf("list %s: %v", dir, err)
	}

	var files []string

	for _, entry := range entries {
		if entry.Type()&fs.ModeType != 0 {
			continue
		}

		for _, suffix := range suffixes {
			if strings.HasSuffix(entry.Name(), suffix) {
				files = append(files, filepath.Join(dir, entry.Name()))
			}
		}
	}

	return files
}
