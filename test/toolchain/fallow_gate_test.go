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

// The fallow gate is three artifacts that have to agree -- a pinned dependency, a hook that runs
// that exact binary, and a baseline written by it. Each is editable on its own, and every way they
// can drift apart ends the same way: a hook that still reports Passed while gating something other
// than what anybody agreed to.

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// repoRelative resolves a path against the repository root.
func repoRelative(t *testing.T, parts ...string) string {
	t.Helper()

	return filepath.Join(append([]string{toolgate.RepoRoot(t)}, parts...)...)
}

// pinnedFallowVersion returns the version web/package.json pins, failing when it is a range.
//
// A range is the same problem as reading the binary off PATH, one step removed: two checkouts
// install different analyzers and disagree about what the baseline means.
func pinnedFallowVersion(t *testing.T) string {
	t.Helper()

	var manifest struct {
		DevDependencies map[string]string `json:"devDependencies"`
	}

	err := json.Unmarshal([]byte(readRepoFile(t, "web", "package.json")), &manifest)
	if err != nil {
		t.Fatalf("parse web/package.json: %v", err)
	}

	version, ok := manifest.DevDependencies["fallow"]
	if !ok {
		t.Fatal("web/package.json does not list fallow as a devDependency, so the hook has no " +
			"binary of its own to run")
	}

	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(version) {
		t.Fatalf("fallow is pinned as %q rather than an exact version: a range lets two checkouts "+
			"run different analyzers against the same baseline", version)
	}

	return version
}

// TestFallowHookRunsThePinnedBinary pins how the hook invokes fallow. Running it off PATH is the
// failure this guards: the analysis would then depend on whatever version a machine happens to
// have installed, and report findings the committed baseline was never written against.
func TestFallowHookRunsThePinnedBinary(t *testing.T) {
	t.Parallel()

	// A plain multi-line YAML scalar folds its line breaks into spaces, so this is one line.
	entry, ok := fallowHook(t)["entry"].(string)
	if !ok {
		t.Fatalf("the web-fallow hook has no entry")
	}

	wants := []struct {
		fragment string
		why      string
	}{
		{
			fragment: "npm --prefix web exec --no -- fallow",
			why: "the binary must come from web/node_modules/.bin through npm, never from PATH; " +
				"--no also refuses to silently fetch a missing package",
		},
		{
			fragment: "--skip dupes --skip health",
			why: "dead code is what this gate covers, and the default command is the one where " +
				"--fail-on-regression fires at all",
		},
		{
			fragment: "--baseline " + baselineFile,
			why:      "the findings a commit may still carry have to be the committed, reviewed ones",
		},
		{
			fragment: "--fail-on-regression",
			why:      "the count gate beside the findings one",
		},
		{
			fragment: "--regression-baseline " + regressionBaselineFile,
			why:      "the counts it compares against have to be the committed ones",
		},
	}

	for _, want := range wants {
		if !strings.Contains(entry, want.fragment) {
			t.Errorf("the fallow hook entry does not carry %q: %s\nentry: %s",
				want.fragment, want.why, entry)
		}
	}
}

const (
	// baselineFile holds the findings themselves, so a new finding fails even when it replaces
	// one the baseline already carried.
	baselineFile = ".fallow-baseline.json"
	// regressionBaselineFile holds per-issue-type counts, which is the gate that catches a count
	// growing in a kind the findings baseline no longer matches exactly.
	regressionBaselineFile = ".fallow-regression-baseline.json"
	// commandTimeout bounds one npm or fallow invocation.
	commandTimeout = 5 * time.Minute
)

// TestFallowBaselineMatchesThePinnedVersion pins that the committed baseline was written by the
// version the hook runs. Fallow's findings change between releases, so a baseline from an older
// one either forgives issues nobody reviewed or fails a tree nobody changed.
func TestFallowBaselineMatchesThePinnedVersion(t *testing.T) {
	t.Parallel()

	// Decoded as a map rather than a struct: the key is fallow's, in fallow's spelling, and a
	// tagged field would only invite this repository's naming conventions to correct it.
	var baseline map[string]any

	err := json.Unmarshal([]byte(readRepoFile(t, regressionBaselineFile)), &baseline)
	if err != nil {
		t.Fatalf("parse %s: %v", regressionBaselineFile, err)
	}

	writtenBy, ok := baseline["fallow_version"].(string)
	if !ok {
		t.Fatalf("%s does not record the fallow version that wrote it", regressionBaselineFile)
	}

	pinned := pinnedFallowVersion(t)
	if writtenBy != pinned {
		t.Errorf(
			"%s was written by fallow %s but the hook runs %s; regenerate both baselines with "+
				"the commands in the web-fallow hook's comment",
			regressionBaselineFile,
			writtenBy,
			pinned,
		)
	}
}

// TestFallowHookAlwaysRuns pins that the gate is not conditioned on a file list. pre-commit drops
// deleted paths from the staged files it matches, so a hook selected by a pattern would sit out the
// one commit that removes the baseline it reads.
func TestFallowHookAlwaysRuns(t *testing.T) {
	t.Parallel()

	hook := fallowHook(t)
	if hook["always_run"] != true {
		t.Errorf("the fallow hook does not set always_run, so deleting its baseline would go "+
			"ungated: %v", hook)
	}

	// always_run makes a hook eligible at every installed stage, and commit-msg is one of them.
	stages, _ := hook["stages"].([]any)
	if len(stages) != 1 || stages[0] != "pre-commit" {
		t.Errorf("the fallow hook runs at stages %v, want only pre-commit", hook["stages"])
	}
}

// TestFallowGateRunsThePinnedBinaryFromTheWorkspace runs the hook's own invocation and checks
// which fallow answers. The pin, the hook and the baselines only mean anything if the binary that
// reads them is the installed one; npm resolving something else would leave every other assertion
// in this file true and the gate meaningless.
func TestFallowGateRunsThePinnedBinaryFromTheWorkspace(t *testing.T) {
	t.Parallel()

	binary := requireInstalledFallow(t)

	pinned := pinnedFallowVersion(t)

	local := runCommand(t, repoRelative(t), binary, "--version")
	if !strings.Contains(local, pinned) {
		t.Errorf("web/node_modules/.bin/fallow reports %q, want the pinned %s", local, pinned)
	}

	throughNPM := runCommand(t, repoRelative(t),
		"npm", "--prefix", "web", "exec", "--no", "--", "fallow", "--version")
	if !strings.Contains(throughNPM, pinned) {
		t.Errorf("the hook's invocation reports %q, want the pinned %s: npm resolved some other "+
			"fallow than the workspace's", throughNPM, pinned)
	}
}

// TestFallowGateForgivesOnlyWhatTheBaselineCarries runs the gate over a scratch project rather
// than this repository, because the behavior under test is the rule, not today's findings: a
// project has to be able to gain a finding without anybody having to accept it here.
//
// The three states are the whole contract. Ungated, a finding fails; once it is in the committed
// baseline, the same tree passes; a second finding, which nobody reviewed, fails again.
func TestFallowGateForgivesOnlyWhatTheBaselineCarries(t *testing.T) {
	t.Parallel()

	requireInstalledFallow(t)

	project := scratchProject(t, "error")
	baseline := filepath.Join(project, "baseline.json")
	regression := filepath.Join(project, "regression.json")

	output, err := runGateIn(t, project, baseline, regression)
	if err == nil {
		t.Fatalf("the gate accepted an unreachable file with no baseline at all:\n%s", output)
	}

	saveBaselines(t, project, baseline, regression)

	output, err = runGateIn(t, project, baseline, regression)
	if err != nil {
		t.Fatalf("the gate refuses a finding its own baseline carries: %v\n%s", err, output)
	}

	writeFile(t, filepath.Join(project, "src", "second-orphan.ts"), "export const second = 3\n")

	output, err = runGateIn(t, project, baseline, regression)
	if err == nil {
		t.Fatalf("the gate accepted a finding no baseline carries:\n%s", output)
	}
}

// TestFallowGateFailsWhenTheIssueCountGrows pins the second half of the hook's command, on a
// project whose findings are warnings. Nothing there fails a run on its own, so the refusal can
// only come from --fail-on-regression -- and without this case the flag could be dropped from the
// hook with every other test in this file still passing.
func TestFallowGateFailsWhenTheIssueCountGrows(t *testing.T) {
	t.Parallel()

	requireInstalledFallow(t)

	project := scratchProject(t, "warn")
	baseline := filepath.Join(project, "baseline.json")
	regression := filepath.Join(project, "regression.json")

	saveBaselines(t, project, baseline, regression)

	output, err := runGateIn(t, project, baseline, regression)
	if err != nil {
		t.Fatalf("the gate refuses the project its own baselines describe: %v\n%s", err, output)
	}

	// Counts taken without the findings baseline, so there is a number to exceed: with it applied
	// the total is zero by construction, which is exactly why the committed pair is saved that way.
	raw := filepath.Join(project, "raw-regression.json")
	saveBaseline(t, project, "--save-regression-baseline", raw)

	// Without the findings baseline, which would refuse the count growth on its own account,
	// nothing but --fail-on-regression can fail this run: the project's findings are warnings.
	lowered := withLoweredCount(t, raw, filepath.Join(project, "lowered.json"))

	output, err = runFallow(t, project,
		"--fail-on-regression", "--regression-baseline", lowered)
	if err == nil {
		t.Fatalf("the gate accepted an issue count above its regression baseline:\n%s", output)
	}

	// The same run without the flag has to pass, or the refusal above would prove nothing about
	// --fail-on-regression: it would just be fallow reporting a finding it always reports.
	output, err = runFallow(t, project)
	if err != nil {
		t.Fatalf("the project fails even without the regression gate, so the case above says "+
			"nothing about it: %v\n%s", err, output)
	}
}

// runFallow runs the pinned binary against one project, with the hook's analysis scope, and
// returns its output and exit status. Callers decide what the status should be: some of these
// cases are about being refused.
func runFallow(t *testing.T, project string, args ...string) (string, error) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	full := append([]string{"--quiet", "--skip", "dupes", "--skip", "health"}, args...)

	binary := requireInstalledFallow(t)

	cmd := exec.CommandContext(ctx, binary, full...)
	cmd.Dir = project

	output, err := cmd.CombinedOutput()

	return string(output), err
}

// saveBaseline runs one of the baseline-writing invocations, where fallow exits 1 for having found
// something and only another status means it could not do the job.
func saveBaseline(t *testing.T, project string, args ...string) {
	t.Helper()

	output, err := runFallow(t, project, args...)

	var exitErr *exec.ExitError
	if err != nil && (!errors.As(err, &exitErr) || exitErr.ExitCode() != 1) {
		t.Fatalf("fallow %s: %v\n%s", strings.Join(args, " "), err, output)
	}
}

// scratchProject writes a minimal TypeScript project whose src/orphan.ts nothing reaches, and
// returns its directory. severity decides whether that finding fails a run on its own, which is
// what separates the two gates the hook carries.
func scratchProject(t *testing.T, severity string) string {
	t.Helper()

	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "package.json"),
		"{\n  \"name\": \"scratch\",\n  \"version\": \"1.0.0\",\n  \"main\": \"src/index.ts\"\n}\n")
	writeFile(t, filepath.Join(dir, ".fallowrc.json"),
		"{\n  \"rules\": {\n    \"unused-files\": \""+severity+"\"\n  }\n}\n")
	writeFile(t, filepath.Join(dir, "src", "index.ts"), "export const used = 1\n")
	writeFile(t, filepath.Join(dir, "src", "orphan.ts"), "export const orphan = 2\n")

	return dir
}

// findingFreeProject writes a project fallow has nothing to say about, so a refusal can only come
// from the gate's own plumbing.
func findingFreeProject(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "package.json"),
		"{\n  \"name\": \"clean\",\n  \"version\": \"1.0.0\",\n  \"main\": \"src/index.ts\"\n}\n")
	writeFile(t, filepath.Join(dir, "src", "index.ts"), "export const used = 1\n")

	return dir
}

// saveBaselines writes both of the gate's baselines for a project, the way an operator accepting a
// finding would -- and the way this repository's own baselines were written.
//
// The counts baseline is saved with the findings baseline already applied, so it records what is
// left over rather than what was just accepted. That is what makes the count gate say something:
// against a total taken before the findings were forgiven it could only ever be satisfied.
func saveBaselines(t *testing.T, project, baseline, regression string) {
	t.Helper()

	saveBaseline(t, project, "--save-baseline", baseline)
	saveBaseline(t, project, "--baseline", baseline, "--save-regression-baseline", regression)
}

// TestFallowGateAcceptsTheCommittedBaselines is the other half: the same command with the real
// baselines must pass, or the gate would be refusing every commit rather than gating anything.
func TestFallowGateAcceptsTheCommittedBaselines(t *testing.T) {
	t.Parallel()

	requireInstalledFallow(t)

	// fallow reads all of this through exec, which the test cache cannot see; reading it here makes
	// an edit to any of it invalidate a cached pass.
	for _, file := range []string{".fallowrc.json", baselineFile, regressionBaselineFile} {
		readRepoFile(t, file)
	}

	readWebSources(t)

	output, err := runGateIn(t, repoRelative(t),
		repoRelative(t, baselineFile), repoRelative(t, regressionBaselineFile))
	if err != nil {
		t.Fatalf("the working tree carries a dead-code finding no committed baseline covers, so "+
			"the hook refuses every commit until it is fixed or reviewed into the baselines: "+
			"%v\n%s", err, output)
	}
}

// TestFallowGateFailsOnAMissingBaseline pins that a deleted baseline is loud. Together with
// always_run, that is what keeps the gate from being switched off by removing a file.
//
// The project has no findings at all and baselines of its own, so the run would pass but for the
// path that is not there: the refusal cannot be a finding in disguise.
func TestFallowGateFailsOnAMissingBaseline(t *testing.T) {
	t.Parallel()

	requireInstalledFallow(t)

	project := findingFreeProject(t)
	baseline := filepath.Join(project, "baseline.json")
	regression := filepath.Join(project, "regression.json")

	saveBaselines(t, project, baseline, regression)

	output, err := runGateIn(t, project, baseline, regression)
	if err != nil {
		t.Fatalf("a project with nothing to report does not pass its own gate: %v\n%s", err, output)
	}

	missing := filepath.Join(project, "gone.json")

	output, err = runGateIn(t, project, missing, regression)
	if err == nil {
		t.Fatalf("the gate ran without its findings baseline instead of failing:\n%s", output)
	}

	if !strings.Contains(output, "baseline") {
		t.Errorf("the refusal does not name the baseline it could not read:\n%s", output)
	}
}

// withLoweredCount writes a copy of a regression baseline whose issue total is one lower, and
// returns its path. That is what a tree with one issue more than the baseline looks like to the
// count gate, without having to author a finding of a particular kind.
func withLoweredCount(t *testing.T, source, destination string) string {
	t.Helper()

	baseline := map[string]any{}

	content, err := os.ReadFile(source)
	if err != nil {
		t.Fatalf("read %s: %v", source, err)
	}

	err = json.Unmarshal(content, &baseline)
	if err != nil {
		t.Fatalf("parse %s: %v", source, err)
	}

	counts, ok := baseline["check"].(map[string]any)
	if !ok {
		t.Fatalf("%s has no check counts to lower", source)
	}

	total, ok := counts["total_issues"].(float64)
	if !ok || total < 1 {
		t.Fatalf("%s records no issues, so lowering its total proves nothing", source)
	}

	// Every count goes down, not just the total: the gate reads the per-kind numbers, and a total
	// that disagreed with them would be a baseline no run of fallow could ever have written.
	for key, value := range counts {
		count, isNumber := value.(float64)
		if isNumber && count >= 1 {
			counts[key] = count - 1
		}
	}

	encoded, err := json.Marshal(baseline)
	if err != nil {
		t.Fatalf("encode %s: %v", destination, err)
	}

	writeFile(t, destination, string(encoded))

	return destination
}

// writeFile writes one file, creating the directories above it.
func writeFile(t *testing.T, path, content string) {
	t.Helper()

	err := os.MkdirAll(filepath.Dir(path), 0o750)
	if err != nil {
		t.Fatalf("create the directory for %s: %v", path, err)
	}

	err = os.WriteFile(path, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// gateArguments is the hook's command after the binary name, with the project and baselines left
// to the caller. Kept in one place so a test cannot drift from the hook it is meant to exercise.
func gateArguments(baseline, regressionBaseline string) []string {
	return []string{
		"--quiet", "--skip", "dupes", "--skip", "health",
		"--baseline", baseline,
		"--fail-on-regression", "--regression-baseline", regressionBaseline,
	}
}

// runGateIn runs the hook's command against one project and returns its output and whether it
// refused. It goes through npm exactly as the hook does, so the invocation itself is under test.
func runGateIn(t *testing.T, project, baseline, regressionBaseline string) (string, error) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	// Run inside the project, with an absolute --prefix: that is how the hook reaches the pinned
	// binary, and it is also what lets a scratch project's own configuration apply.
	args := append([]string{"--prefix", repoRelative(t, "web"), "exec", "--no", "--", "fallow"},
		gateArguments(baseline, regressionBaseline)...)

	cmd := exec.CommandContext(ctx, "npm", args...)
	cmd.Dir = project

	output, err := cmd.CombinedOutput()

	return string(output), err
}

// runCommand runs one command in dir and returns its combined output, failing the test if it does
// not succeed.
func runCommand(t *testing.T, dir, name string, args ...string) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir

	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %s: %v\n%s", name, strings.Join(args, " "), err, output)
	}

	return string(output)
}

// requireInstalledFallow resolves the pinned binary from the workspace. Without it the behavioral
// runs cannot say anything about the gate, so a missing install is a skip locally and a failure
// where BITGAUGE_REQUIRE_TOOLS=1 is set.
func requireInstalledFallow(t *testing.T) string {
	t.Helper()

	return toolgate.Lookup(t, toolgate.Fallow)
}

// fallowHook returns the web-fallow hook's mapping.
func fallowHook(t *testing.T) preCommitHook {
	t.Helper()

	hooks := preCommitHooks(t)["web-fallow"]
	if len(hooks) != 1 {
		t.Fatalf(
			".pre-commit-config.yaml defines the web-fallow hook %d times, want once",
			len(hooks),
		)
	}

	return hooks[0]
}
