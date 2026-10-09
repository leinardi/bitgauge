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
	"regexp"
	"strings"
	"testing"
)

// auditDepsFragment is the make fragment that defines the dependency audit.
const auditDepsFragment = ".mk/audit-deps.mk"

// TestAuditGovulncheckIsPinned pins that the scanner is fetched at a fixed version. An unpinned
// go run @latest would make two runs of the same commit mean different things, and would fetch
// whatever the proxy serves on the day a release is cut.
func TestAuditGovulncheckIsPinned(t *testing.T) {
	t.Parallel()

	fragment := readRepoFile(t, auditDepsFragment)

	if !strings.Contains(fragment, "GOVULNCHECK_VERSION ?= v1.8.0\n") {
		t.Errorf("%s does not pin GOVULNCHECK_VERSION to v1.8.0:\n%s", auditDepsFragment, fragment)
	}

	if strings.Contains(fragment, "@latest") {
		t.Errorf("%s fetches something @latest", auditDepsFragment)
	}

	if !strings.Contains(fragment, "golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION)\n") {
		t.Errorf(
			"%s does not run govulncheck at the pinned version:\n%s",
			auditDepsFragment,
			fragment,
		)
	}
}

// TestAuditCoversBothEcosystems pins that one command scans everything this repository depends on,
// and what each half runs.
func TestAuditCoversBothEcosystems(t *testing.T) {
	t.Parallel()

	fragment := readRepoFile(t, auditDepsFragment)

	prerequisites := regexp.MustCompile(`(?m)^audit-deps:([^#\n]*)`).FindStringSubmatch(fragment)
	if prerequisites == nil {
		t.Fatalf("%s defines no audit-deps target", auditDepsFragment)
	}

	if got := strings.Fields(
		prerequisites[1],
	); strings.Join(
		got,
		" ",
	) != "audit-deps-go audit-deps-web" {
		t.Errorf("audit-deps runs %v, want exactly audit-deps-go and audit-deps-web", got)
	}

	for target, want := range map[string]string{
		// Every package, tests included: govulncheck only sees what it is pointed at, and today the
		// only Go dependency is reached from tests alone.
		"audit-deps-go":  "\t$(GO) run $(GOVULNCHECK) -test ./...",
		"audit-deps-web": "\tnpm --prefix \"$(WEB_DIR)\" audit --audit-level=$(NPM_AUDIT_LEVEL)",
	} {
		if recipe := makeRecipe(t, fragment, target); recipe != want {
			t.Errorf("the %s recipe is\n%s\nwant\n%s", target, recipe, want)
		}
	}

	if !strings.Contains(fragment, "NPM_AUDIT_LEVEL ?= high\n") {
		t.Errorf("%s does not fail npm audit at high", auditDepsFragment)
	}

	if !strings.Contains(readRepoFile(t, "Makefile"), " audit-deps.mk") {
		t.Errorf("the Makefile does not include %s, so the targets do not exist", auditDepsFragment)
	}
}

// TestAuditHooksFireOnDependencyChanges pins what the commit hooks watch. They are the cheap half of
// the audit: they run on a dependency change and on nothing else, which is also why they cannot
// replace the deliberate make audit-deps.
func TestAuditHooksFireOnDependencyChanges(t *testing.T) {
	t.Parallel()

	hooks := preCommitHooks(t)

	for id, files := range map[string]string{
		"audit-deps-go":  `^go\.(mod|sum)$`,
		"audit-deps-web": `^web/package(-lock)?\.json$`,
	} {
		if len(hooks[id]) != 1 {
			t.Errorf(
				".pre-commit-config.yaml defines the %s hook %d times, want once",
				id,
				len(hooks[id]),
			)

			continue
		}

		hook := hooks[id][0]

		if hook["entry"] != "make "+id {
			t.Errorf("the %s hook runs %v, want make %s", id, hook["entry"], id)
		}

		if hook["files"] != files {
			t.Errorf("the %s hook watches %v, want %q", id, hook["files"], files)
		}

		// The trigger is the only thing keeping a network scan off every commit, and a file list
		// passed to make would be read as targets.
		if hook["always_run"] == true {
			t.Errorf("the %s hook always runs", id)
		}

		if hook["pass_filenames"] != false {
			t.Errorf("the %s hook passes filenames to make", id)
		}
	}
}

// makeRecipe returns the recipe lines of one target: the tab-indented lines after its rule line.
func makeRecipe(t *testing.T, fragment, target string) string {
	t.Helper()

	_, rest, found := strings.Cut("\n"+fragment, "\n"+target+":")
	if !found {
		t.Fatalf("%s defines no %s target", auditDepsFragment, target)
	}

	var recipe []string

	for _, line := range strings.Split(rest, "\n")[1:] {
		if !strings.HasPrefix(line, "\t") {
			break
		}

		recipe = append(recipe, line)
	}

	return strings.Join(recipe, "\n")
}
