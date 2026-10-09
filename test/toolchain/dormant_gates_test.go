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
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
	"github.com/leinardi/bitgauge/test/toolchain"
)

// TestGatesFollowTheRegistry is the activation check on this repository: every active gate has its
// hooks, jobs and steps, and no dormant gate has any.
func TestGatesFollowTheRegistry(t *testing.T) {
	t.Parallel()

	violations, err := toolchain.Check(toolgate.RepoRoot(t))
	if err != nil {
		t.Fatal(err)
	}

	for _, violation := range violations {
		t.Error(violation)
	}
}

// TestRegistryShape keeps the table usable: unique names, After pointing backwards, and every gate
// with something to wait for and something to bring.
func TestRegistryShape(t *testing.T) {
	t.Parallel()

	seen := make([]string, 0, len(toolchain.Gates))

	for _, gate := range toolchain.Gates {
		if slices.Contains(seen, gate.Name) {
			t.Errorf("gate %q is listed twice", gate.Name)
		}

		for _, after := range gate.After {
			if !slices.Contains(seen, after) {
				t.Errorf("gate %q comes after %q, which is not listed before it", gate.Name, after)
			}
		}

		seen = append(seen, gate.Name)

		if len(gate.Files)+len(gate.StatusRows)+len(gate.Docs)+len(gate.After) == 0 {
			t.Errorf("gate %q has no prerequisite", gate.Name)
		}

		if len(gate.Hooks)+len(gate.CIJobs)+len(gate.CISteps)+len(gate.WebSteps)+
			len(gate.Workflows)+len(gate.WorkflowJobs) == 0 {
			t.Errorf("gate %q requires nothing", gate.Name)
		}
	}
}

// fixture is a scratch repository with every gate dormant: the files the registry reads and none of
// the prerequisites.
type fixture struct {
	t    *testing.T
	root string
}

const fixtureStatus = `| Feature area | Status | Code pointers |
| --- | --- | --- |
| Single binary, embedded SPA, base path | %s |  |
| Native API: download, upload | %s |  |
| Engine: headline, peak, confidence and notices, result object | %s |  |
| UI: Test screen, About | %s |  |
`

const fixtureHooks = `repos:
  - repo: local
    hooks:
      - id: package-map
`

func newFixture(t *testing.T) *fixture {
	t.Helper()

	f := &fixture{t: t, root: t.TempDir()}
	f.status("Spec'd (v0.1)")
	f.write(".pre-commit-config.yaml", fixtureHooks)
	f.write(".fallowrc.json", `{"rules": {}}`)
	f.write("docs/features/ui/screens.md", "- **Download JSON** of the finished result.\n")

	return f
}

func (f *fixture) write(name, content string) {
	f.t.Helper()

	file := filepath.Join(f.root, filepath.FromSlash(name))

	err := os.MkdirAll(filepath.Dir(file), 0o750)
	if err != nil {
		f.t.Fatal(err)
	}

	err = os.WriteFile(file, []byte(content), 0o600)
	if err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) status(state string) {
	f.t.Helper()
	f.write("docs/STATUS.md", strings.ReplaceAll(fixtureStatus, "%s", state))
}

func (f *fixture) hooks(ids ...string) {
	f.t.Helper()

	var config strings.Builder

	config.WriteString(fixtureHooks)

	for _, id := range ids {
		config.WriteString("      - id: " + id + "\n")
	}

	f.write(".pre-commit-config.yaml", config.String())
}

// webWorkflow writes web.yaml with the setup steps and the given ones, and the ci.yaml web job.
func (f *fixture) webWorkflow(steps ...string) {
	f.t.Helper()
	f.webWorkflowWithJobs("", steps...)
}

// webWorkflowWithJobs is webWorkflow with more ci.yaml jobs, written under jobs:.
func (f *fixture) webWorkflowWithJobs(ciJobs string, steps ...string) {
	f.t.Helper()

	var web strings.Builder

	web.WriteString("on: workflow_call\njobs:\n  web:\n    runs-on: ubuntu-latest\n    steps:\n")

	for _, step := range append([]string{"setup", "cache-restore"}, append(steps, "cache-save")...) {
		web.WriteString("      - id: " + step + "\n        run: make " + step + "\n")
	}

	f.write(".github/workflows/web.yaml", web.String())
	f.write(
		".github/workflows/ci.yaml",
		"on: pull_request\njobs:\n  web:\n    uses: ./.github/workflows/web.yaml\n"+ciJobs,
	)
}

func (f *fixture) check() []string {
	f.t.Helper()

	violations, err := toolchain.Check(f.root)
	if err != nil {
		f.t.Fatal(err)
	}

	return violations
}

// expect fails unless the violations are exactly the wanted ones, each found by a substring.
func (f *fixture) expect(want ...string) {
	f.t.Helper()

	got := f.check()
	if len(got) != len(want) {
		f.t.Fatalf(
			"want %d violations %q, got %d:\n%s",
			len(want),
			want,
			len(got),
			strings.Join(got, "\n"),
		)
	}

	for _, needle := range want {
		if !slices.ContainsFunc(got, func(v string) bool { return strings.Contains(v, needle) }) {
			f.t.Errorf("no violation mentions %q:\n%s", needle, strings.Join(got, "\n"))
		}
	}
}

func TestDormantFixturePasses(t *testing.T) {
	t.Parallel()

	newFixture(t).expect()
}

// TestPrematureHookFails: a gate's hook before its prerequisite is a false pass.
func TestPrematureHookFails(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.hooks("frontend-eslint")
	f.expect(
		"frontend lint and typecheck is dormant but pre-commit hook frontend-eslint already exists",
	)
}

// TestMissingActivatedHookFails: the first hand-written source file activates the lint gate, and
// its hooks and web.yaml must come with it.
func TestMissingActivatedHookFails(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.write("web/src/engine/clock.ts", "export {}\n")
	f.expect(
		"pre-commit hook frontend-eslint is missing",
		"pre-commit hook frontend-typecheck is missing",
		"web.yaml step lint is missing",
		"web.yaml step typecheck is missing",
		"web.yaml exists: false, but a web gate is active: true",
	)

	f.hooks("frontend-eslint", "frontend-typecheck")
	f.webWorkflow("lint", "typecheck")
	f.expect()

	// The first engine module brings lint and typecheck, not the build.
	f.webWorkflow("lint", "typecheck", "build")
	f.expect("web build is dormant but web.yaml step build already exists")

	f.webWorkflow("lint", "typecheck", "deploy")
	f.expect("web.yaml step deploy belongs to no gate")

	f.write(".fallowrc.json", `{"ignoreDependencies": ["vue"]}`)
	f.webWorkflow("lint", "typecheck")
	f.expect(".fallowrc.json still ignores vue")
}

// TestGeneratedSourcesDoNotActivate: the generated API types and the vendored shadcn-vue components
// are not hand-written source.
func TestGeneratedSourcesDoNotActivate(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.write("web/src/api/types.gen.ts", "export {}\n")
	f.write("web/src/components/ui/button/Button.vue", "<template />\n")
	f.write("web/src/components/ui/button/index.ts", "export {}\n")
	f.expect()

	active, err := toolchain.Active(f.root, "frontend lint and typecheck")
	if err != nil || active {
		t.Errorf("generated sources activated the lint gate: %v, %v", active, err)
	}
}

const fixtureGoBuild = `  build:
    runs-on: ubuntu-latest
    steps:
      - id: go-build
        run: make go-build
`

// TestImageWaitsForStatus: the binary and embed.go are not enough while the STATUS rows read
// Spec'd or the SPA cannot be built; once both hold, the image jobs, the ci-result needs and the
// image test in CI are due, and the harness's and the release's requirements with them.
func TestImageWaitsForStatus(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.write("cmd/bitgauge/main.go", "package main\n")
	f.write("web/embed.go", "package web\n")
	f.write(".github/workflows/ci.yaml", "on: pull_request\njobs:\n"+fixtureGoBuild)
	f.expect()

	active, err := toolchain.Active(f.root, toolchain.GateImage)
	if err != nil || active {
		t.Errorf("the image gate is active with Spec'd rows: %v, %v", active, err)
	}

	// The rows alone do not do it: the image's web stage needs a runnable SPA.
	f.status("Implemented (v0.1)")
	f.expect()

	unmet, err := toolchain.Unmet(f.root, toolchain.GateHarness)
	if err != nil || !slices.Contains(unmet, "no file matches web/index.html") {
		t.Errorf("the harness does not wait for web/index.html: %q, %v", unmet, err)
	}

	f.write("web/index.html", "<!doctype html>\n")
	f.write("web/src/main.ts", "export {}\n")
	f.hooks("frontend-eslint", "frontend-typecheck")
	f.webWorkflowWithJobs(fixtureGoBuild, "lint", "typecheck", "build", "dist-urls", "chunk-size")
	f.expect(
		"ci.yaml job credentials is missing",
		"ci.yaml job image is missing",
		"ci-result's need of credentials is missing",
		"ci-result's need of image is missing",
		"ci.yaml job image running make go-test-image is missing",
		// The harness's own rows moved too, and the extraction path is specified.
		"ci.yaml job harness is missing",
		"ci-result's need of harness is missing",
		"workflow harness.yaml is missing",
		// Image and web build together are the Release stage.
		"workflow release.yaml is missing",
		"workflow rebuild.yaml is missing",
		"scheduled-scan.yaml job image is missing",
	)

	// Without its specified extraction path, the harness is dormant again.
	f.write("docs/features/ui/screens.md", "- **Export** of the finished result.\n")

	unmet, err = toolchain.Unmet(f.root, toolchain.GateHarness)
	if err != nil || len(unmet) != 1 || !strings.Contains(unmet[0], "does not specify") {
		t.Errorf("the harness without its extraction path: %q, %v", unmet, err)
	}
}

// TestGateDocsAreSpecified: every text a gate waits for is in the specification today, so a
// rewording fails here instead of silently keeping a gate dormant.
func TestGateDocsAreSpecified(t *testing.T) {
	t.Parallel()

	for _, gate := range toolchain.Gates {
		for _, doc := range gate.Docs {
			if !strings.Contains(readRepoFile(t, filepath.FromSlash(doc.File)), doc.Text) {
				t.Errorf(
					"gate %q waits for %q, which %s does not say",
					gate.Name,
					doc.Text,
					doc.File,
				)
			}
		}
	}
}

// TestReleaseWaitsForImageAndWebBuild: the release workflows are premature until both gates are
// active.
func TestReleaseWaitsForImageAndWebBuild(t *testing.T) {
	t.Parallel()

	f := newFixture(t)
	f.write(".github/workflows/release.yaml", "on: workflow_dispatch\njobs: {}\n")
	f.write(".github/workflows/scheduled-scan.yaml", `on: workflow_dispatch
jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - run: trivy image
`)
	f.expect(
		"release is dormant but workflow release.yaml already exists",
		"release is dormant but scheduled-scan.yaml job image already exists",
	)

	unmet, err := toolchain.Unmet(f.root, toolchain.GateRelease)
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{"cmd/bitgauge/main.go", "web/embed.go", "web/index.html", "web/src/main.ts"} {
		if !slices.ContainsFunc(unmet, func(u string) bool { return strings.HasSuffix(u, want) }) {
			t.Errorf("the release gate does not wait for %s: %q", want, unmet)
		}
	}
}

func TestUnmetErrors(t *testing.T) {
	t.Parallel()

	f := newFixture(t)

	_, err := toolchain.Unmet(f.root, "nightly")
	if err == nil {
		t.Error("an unknown gate was evaluated")
	}

	f.write("docs/STATUS.md", "| Other | Implemented |  |\n")

	_, err = toolchain.Unmet(f.root, toolchain.GateImage)
	if err == nil {
		t.Error("a STATUS.md without the gate's rows was read as an answer")
	}
}
