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

// Package toolchain holds the staged activation registry of the dormant gates: what each gate
// waits for, and the hooks, CI jobs and workflow steps it brings once it activates. A gate with
// unmet prerequisites must have none of them (a premature gate passes on nothing), and a gate
// whose prerequisites are met must have all of them. The meta-tests of this directory enforce it.
package toolchain

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Gate is one stage of the activation registry.
type Gate struct {
	Name string
	// After names gates whose prerequisites are this gate's too.
	After []string
	// Files are path globs, relative to the repository root, each of which must match a file.
	Files []Glob
	// StatusRows are docs/STATUS.md rows, by the start of their feature cell, that must no longer
	// read Spec'd.
	StatusRows []string
	// Docs are texts the specification must hold.
	Docs []DocText

	// Hooks are .pre-commit-config.yaml hook IDs.
	Hooks []string
	// CIJobs are ci.yaml job IDs; CIResultNeeds the jobs the ci-result aggregate must need.
	CIJobs        []string
	CIResultNeeds []string
	// CISteps are step IDs that some ci.yaml job carries.
	CISteps []string
	// CIRuns are commands a ci.yaml job runs.
	CIRuns []JobRun
	// WebSteps are web.yaml step IDs.
	WebSteps []string
	// Workflows are files under .github/workflows.
	Workflows []string
	// WorkflowJobs are jobs of a workflow other than ci.yaml.
	WorkflowJobs []WorkflowJob
	// FallowNoIgnoredDependencies requires .fallowrc.json to ignore no dependency once active.
	FallowNoIgnoredDependencies bool
}

// Glob is a path glob: * matches within a segment, **/ any number of segments, {a,b} either. A
// file that also matches one of Exclude does not count.
type Glob struct {
	Pattern string
	Exclude []string
}

// DocText is a text a specification file must contain.
type DocText struct {
	File string
	Text string
}

// JobRun is a command, by a substring of its run line, that a job must run.
type JobRun struct {
	Job      string
	Contains string
}

// WorkflowJob is one job of a workflow file.
type WorkflowJob struct {
	Workflow string
	Job      string
}

// The gate names other packages refer to.
const (
	GateImage    = "image and image tests"
	GateHarness  = "accuracy harness"
	GateRelease  = "release"
	gateWebBuild = "web build"
)

// jobImage is the ci.yaml job, and the scheduled-scan.yaml job, that builds and scans the image.
const jobImage = "image"

// webSetupSteps are the steps web.yaml is created with by whichever web gate activates first.
var webSetupSteps = []string{"setup", "cache-restore", "cache-save"}

// Gates is the registry, in activation order: a gate is listed after every gate it names in After.
var Gates = []Gate{
	{
		Name:     "API types",
		Files:    []Glob{{Pattern: "api/openapi.yaml"}},
		Hooks:    []string{"api-types-generate"},
		WebSteps: []string{"types-drift"},
	},
	{
		Name: "frontend lint and typecheck",
		Files: []Glob{{
			Pattern: "web/src/**/*.{ts,vue}",
			Exclude: []string{"web/src/api/types.gen.ts", "web/src/components/ui/**/*"},
		}},
		Hooks:                       []string{"frontend-eslint", "frontend-typecheck"},
		WebSteps:                    []string{"lint", "typecheck"},
		FallowNoIgnoredDependencies: true,
	},
	{
		Name:     "frontend unit tests",
		Files:    []Glob{{Pattern: "web/src/**/*.test.ts"}},
		Hooks:    []string{"frontend-test"},
		WebSteps: []string{"unit-test"},
	},
	{
		Name:     gateWebBuild,
		Files:    []Glob{{Pattern: "web/index.html"}, {Pattern: "web/src/main.ts"}},
		WebSteps: []string{"build", "dist-urls", "chunk-size"},
	},
	{
		Name:    "binary build",
		Files:   []Glob{{Pattern: "cmd/bitgauge/main.go"}},
		CISteps: []string{"go-build"},
	},
	{
		Name: GateImage,
		// The image's web stage runs vite build, so it needs the runnable SPA as well as embed.go.
		After: []string{"binary build", gateWebBuild},
		Files: []Glob{{Pattern: "web/embed.go"}},
		StatusRows: []string{
			"Single binary, embedded SPA",
			"Native API:",
		},
		CIJobs:        []string{"credentials", jobImage},
		CIResultNeeds: []string{"credentials", jobImage},
		CIRuns:        []JobRun{{Job: jobImage, Contains: "make go-test-image"}},
	},
	{
		Name:          "E2E",
		After:         []string{GateImage},
		Files:         []Glob{{Pattern: "web/e2e/**/*.spec.ts"}},
		CIJobs:        []string{"e2e"},
		CIResultNeeds: []string{"e2e"},
	},
	{
		Name:  GateHarness,
		After: []string{GateImage},
		StatusRows: []string{
			"Engine: headline, peak, confidence and notices, result object",
			"UI: Test screen",
		},
		// The result-extraction path (decisions.md section 36): the Test screen's single-result
		// Download JSON, which web/harness/run.spec.ts clicks.
		Docs: []DocText{{
			File: "docs/features/ui/screens.md",
			Text: "**Download JSON** of the finished result",
		}},
		CIJobs:        []string{"harness"},
		CIResultNeeds: []string{"harness"},
		Workflows:     []string{"harness.yaml"},
	},
	{
		Name:         GateRelease,
		After:        []string{GateImage, gateWebBuild},
		Workflows:    []string{"release.yaml"},
		WorkflowJobs: []WorkflowJob{{Workflow: "scheduled-scan.yaml", Job: jobImage}},
	},
}

var (
	errStatusRow   = errors.New("docs/STATUS.md has no row for a gate prerequisite")
	errUnknownGate = errors.New("unknown gate")
)

// Unmet lists the prerequisites of a gate, its After gates' included, that the tree under root
// does not meet. An error means they could not be established.
func Unmet(root, gate string) ([]string, error) {
	index := slices.IndexFunc(Gates, func(g Gate) bool { return g.Name == gate })
	if index < 0 {
		return nil, fmt.Errorf("%w %q", errUnknownGate, gate)
	}

	var unmet []string

	for _, name := range Gates[index].After {
		after, err := Unmet(root, name)
		if err != nil {
			return nil, err
		}

		unmet = append(unmet, after...)
	}

	own, err := Gates[index].unmet(root)
	if err != nil {
		return nil, err
	}

	return append(unmet, own...), nil
}

// Check returns every way the tree under root disagrees with the registry: a requirement missing
// from an active gate, a requirement present before its gate is active, and web.yaml steps outside
// the eligible set.
func Check(root string) ([]string, error) {
	repo, err := readRepoState(root)
	if err != nil {
		return nil, err
	}

	var violations []string

	active := map[string]bool{}
	eligibleWebSteps := map[string]bool{}

	for index := range Gates {
		gate := &Gates[index]

		unmet, unmetErr := Unmet(root, gate.Name)
		if unmetErr != nil {
			return nil, unmetErr
		}

		active[gate.Name] = len(unmet) == 0

		for _, step := range gate.WebSteps {
			eligibleWebSteps[step] = active[gate.Name]
		}

		violations = append(violations, gate.check(repo, active[gate.Name])...)
	}

	violations = append(violations, repo.checkWebWorkflow(eligibleWebSteps)...)

	return violations, nil
}

// Active reports whether a gate's prerequisites are all met in the tree under root.
func Active(root, gate string) (bool, error) {
	unmet, err := Unmet(root, gate)
	if err != nil {
		return false, err
	}

	return len(unmet) == 0, nil
}

func (g *Gate) unmet(root string) ([]string, error) {
	var unmet []string

	for _, glob := range g.Files {
		found, err := glob.matchesAny(root)
		if err != nil {
			return nil, err
		}

		if !found {
			unmet = append(unmet, "no file matches "+glob.Pattern)
		}
	}

	if len(g.StatusRows) > 0 {
		status, err := os.ReadFile(filepath.Join(root, "docs", "STATUS.md"))
		if err != nil {
			return nil, fmt.Errorf("read docs/STATUS.md: %w", err)
		}

		for _, row := range g.StatusRows {
			state, found := statusOf(string(status), row)
			if !found {
				return nil, fmt.Errorf("%w: %q", errStatusRow, row)
			}

			if strings.HasPrefix(state, "Spec'd") {
				unmet = append(unmet, "STATUS row \""+row+"…\" is "+state)
			}
		}
	}

	for _, doc := range g.Docs {
		content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(doc.File)))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", doc.File, err)
		}

		if !strings.Contains(string(content), doc.Text) {
			unmet = append(unmet, doc.File+" does not specify "+doc.Text)
		}
	}

	return unmet, nil
}

// check compares one gate's requirements with what the repository carries.
func (g *Gate) check(repo *repoState, active bool) []string {
	var violations []string

	for _, req := range g.requirements(repo) {
		switch {
		case active && !req.present:
			violations = append(violations, g.Name+" is active but "+req.what+" is missing")
		case !active && req.present:
			violations = append(violations, g.Name+" is dormant but "+req.what+" already exists")
		}
	}

	if g.FallowNoIgnoredDependencies && active && len(repo.fallowIgnoredDependencies) > 0 {
		violations = append(
			violations,
			g.Name+" is active but .fallowrc.json still ignores "+
				strings.Join(repo.fallowIgnoredDependencies, ", "),
		)
	}

	return violations
}

type requirement struct {
	what    string
	present bool
}

// requirements lists what the gate brings, each with whether the repository has it.
func (g *Gate) requirements(repo *repoState) []requirement {
	var reqs []requirement

	add := func(what string, present bool) {
		reqs = append(reqs, requirement{what: what, present: present})
	}

	for _, hook := range g.Hooks {
		add("pre-commit hook "+hook, repo.hooks[hook])
	}

	for _, ciJob := range g.CIJobs {
		_, present := repo.ciJobs[ciJob]
		add("ci.yaml job "+ciJob, present)
	}

	for _, need := range g.CIResultNeeds {
		add("ci-result's need of "+need, slices.Contains(repo.ciJobs["ci-result"].Needs, need))
	}

	for _, step := range g.CISteps {
		add("ci.yaml step "+step, repo.ciHasStep(step))
	}

	for _, run := range g.CIRuns {
		add("ci.yaml job "+run.Job+" running "+run.Contains, repo.ciJobRuns(run))
	}

	for _, step := range g.WebSteps {
		add("web.yaml step "+step, slices.Contains(repo.webSteps, step))
	}

	for _, file := range g.Workflows {
		_, present := repo.workflows[file]
		add("workflow "+file, present)
	}

	for _, wfJob := range g.WorkflowJobs {
		_, present := repo.workflows[wfJob.Workflow].Jobs[wfJob.Job]
		add(wfJob.Workflow+" job "+wfJob.Job, present)
	}

	return reqs
}

// workflow is the part of a GitHub Actions workflow the registry reads.
type workflow struct {
	Jobs map[string]job `yaml:"jobs"`
}

type job struct {
	Needs stringList `yaml:"needs"`
	Uses  string     `yaml:"uses"`
	Steps []struct {
		ID  string `yaml:"id"`
		Run string `yaml:"run"`
	} `yaml:"steps"`
}

// stringList reads a YAML value that is one string or a list of them, as needs: is.
type stringList []string

// UnmarshalYAML accepts a scalar or a sequence.
func (s *stringList) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		*s = stringList{node.Value}

		return nil
	}

	var list []string

	err := node.Decode(&list)
	if err != nil {
		return fmt.Errorf("decode a string list: %w", err)
	}

	*s = list

	return nil
}

type repoState struct {
	hooks                     map[string]bool
	workflows                 map[string]workflow
	ciJobs                    map[string]job
	webSteps                  []string
	webWorkflow               bool
	fallowIgnoredDependencies []string
}

func readRepoState(root string) (*repoState, error) {
	repo := &repoState{}

	var err error

	repo.hooks, err = readHooks(root)
	if err != nil {
		return nil, err
	}

	repo.workflows, err = readWorkflows(root)
	if err != nil {
		return nil, err
	}

	repo.ciJobs = repo.workflows["ci.yaml"].Jobs

	var web workflow

	web, repo.webWorkflow = repo.workflows["web.yaml"]
	for _, webJob := range web.Jobs {
		for _, step := range webJob.Steps {
			if step.ID != "" {
				repo.webSteps = append(repo.webSteps, step.ID)
			}
		}
	}

	var fallow struct {
		IgnoreDependencies []string `json:"ignoreDependencies"`
	}

	data, err := os.ReadFile(filepath.Join(root, ".fallowrc.json"))
	if err != nil {
		return nil, fmt.Errorf("read .fallowrc.json: %w", err)
	}

	err = json.Unmarshal(data, &fallow)
	if err != nil {
		return nil, fmt.Errorf("parse .fallowrc.json: %w", err)
	}

	repo.fallowIgnoredDependencies = fallow.IgnoreDependencies

	return repo, nil
}

func readHooks(root string) (map[string]bool, error) {
	var preCommit struct {
		Repos []struct {
			Hooks []struct {
				ID string `yaml:"id"`
			} `yaml:"hooks"`
		} `yaml:"repos"`
	}

	err := readYAML(filepath.Join(root, ".pre-commit-config.yaml"), &preCommit)
	if err != nil {
		return nil, err
	}

	hooks := map[string]bool{}

	for _, hookRepo := range preCommit.Repos {
		for _, hook := range hookRepo.Hooks {
			hooks[hook.ID] = true
		}
	}

	return hooks, nil
}

func readWorkflows(root string) (map[string]workflow, error) {
	dir := filepath.Join(root, ".github", "workflows")

	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("list .github/workflows: %w", err)
	}

	workflows := map[string]workflow{}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		var parsed workflow

		err = readYAML(filepath.Join(dir, name), &parsed)
		if err != nil {
			return nil, err
		}

		workflows[name] = parsed
	}

	return workflows, nil
}

func (r *repoState) ciHasStep(id string) bool {
	for _, ciJob := range r.ciJobs {
		for _, step := range ciJob.Steps {
			if step.ID == id {
				return true
			}
		}
	}

	return false
}

func (r *repoState) ciJobRuns(run JobRun) bool {
	for _, step := range r.ciJobs[run.Job].Steps {
		if strings.Contains(step.Run, run.Contains) {
			return true
		}
	}

	return false
}

// checkWebWorkflow holds web.yaml to the eligible set exactly: it exists only once a web gate is
// active, with the setup steps and the active gates' steps and nothing else, and the ci.yaml web
// job calls it exactly when it exists.
func (r *repoState) checkWebWorkflow(eligible map[string]bool) []string {
	anyActive := false

	for _, isActive := range eligible {
		anyActive = anyActive || isActive
	}

	var violations []string

	if r.webWorkflow != anyActive {
		violations = append(violations, fmt.Sprintf(
			"web.yaml exists: %v, but a web gate is active: %v", r.webWorkflow, anyActive))
	}

	webJob, hasWebJob := r.ciJobs["web"]
	if hasWebJob != r.webWorkflow {
		violations = append(violations, fmt.Sprintf(
			"the ci.yaml web job exists: %v, but web.yaml exists: %v", hasWebJob, r.webWorkflow))
	}

	if hasWebJob && webJob.Uses != "./.github/workflows/web.yaml" {
		violations = append(
			violations,
			"the ci.yaml web job does not call ./.github/workflows/web.yaml",
		)
	}

	if !r.webWorkflow {
		return violations
	}

	for _, step := range webSetupSteps {
		if !slices.Contains(r.webSteps, step) {
			violations = append(violations, "web.yaml lacks its setup step "+step)
		}
	}

	for _, step := range r.webSteps {
		if _, known := eligible[step]; !known && !slices.Contains(webSetupSteps, step) {
			violations = append(violations, "web.yaml step "+step+" belongs to no gate")
		}
	}

	return violations
}

func readYAML(file string, into any) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("read %s: %w", file, err)
	}

	err = yaml.Unmarshal(data, into)
	if err != nil {
		return fmt.Errorf("parse %s: %w", file, err)
	}

	return nil
}

// matchesAny reports whether any file under root matches the glob and none of its exclusions.
func (g *Glob) matchesAny(root string) (bool, error) {
	pattern := globRegexp(g.Pattern)

	excludes := make([]*regexp.Regexp, 0, len(g.Exclude))
	for _, exclude := range g.Exclude {
		excludes = append(excludes, globRegexp(exclude))
	}

	// Walk from the deepest directory the pattern names literally.
	base := g.Pattern
	if index := strings.IndexAny(base, "*{"); index >= 0 {
		base = path.Dir(base[:index+1])
	}

	found := false

	err := filepath.WalkDir(
		filepath.Join(root, filepath.FromSlash(base)),
		func(file string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			if entry.IsDir() {
				return nil
			}

			rel, err := filepath.Rel(root, file)
			if err != nil {
				return fmt.Errorf("relative path of %s: %w", file, err)
			}

			rel = filepath.ToSlash(rel)
			if !pattern.MatchString(rel) ||
				slices.ContainsFunc(
					excludes,
					func(e *regexp.Regexp) bool { return e.MatchString(rel) },
				) {
				return nil
			}

			found = true

			return fs.SkipAll
		},
	)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, fmt.Errorf("match %s: %w", g.Pattern, err)
	}

	return found, nil
}

// globRegexp turns a glob into an anchored regular expression.
func globRegexp(glob string) *regexp.Regexp {
	var out strings.Builder

	out.WriteString("^")

	for index := 0; index < len(glob); index++ {
		switch char := glob[index]; {
		case strings.HasPrefix(glob[index:], "**/"):
			out.WriteString("(?:.*/)?")

			index += len("**/") - 1
		case char == '*':
			out.WriteString("[^/]*")
		case char == '{':
			out.WriteString("(?:")
		case char == '}':
			out.WriteString(")")
		case char == ',':
			out.WriteString("|")
		default:
			out.WriteString(regexp.QuoteMeta(string(char)))
		}
	}

	out.WriteString("$")

	return regexp.MustCompile(out.String())
}

// statusOf returns the Status cell of the STATUS.md row whose feature cell starts with prefix.
func statusOf(status, prefix string) (string, bool) {
	for line := range strings.SplitSeq(status, "\n") {
		cells := strings.Split(line, "|")
		if len(cells) < 3 || !strings.HasPrefix(strings.TrimSpace(cells[1]), prefix) {
			continue
		}

		return strings.TrimSpace(cells[2]), true
	}

	return "", false
}
