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
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
	"github.com/leinardi/bitgauge/test/toolchain"
)

// The release tools' pins (the plan's version table); release.yaml and rebuild.yaml carry them once
// the Release stage is active.
const (
	svuPin   = "v3.4.1"
	trivyPin = "v0.75.0"
)

// pinSource is one place a version is written: a file and the pattern whose first group is the
// version there. Optional sources may be absent; every match of a present one counts.
type pinSource struct {
	file     string
	pattern  *regexp.Regexp
	optional bool
}

var (
	nodeImage  = regexp.MustCompile(`dhi\.io/node:(\d+)-`)
	golangLine = regexp.MustCompile(`dhi\.io/golang:(\d+\.\d+)-`)
	nodeMajor  = regexp.MustCompile(`^\d+$`)
	exactTag   = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
)

// The actions whose inputs carry a shared pin.
const (
	setupNode     = "actions/setup-node"
	setupGo       = "actions/setup-go"
	golangciLintA = "golangci/golangci-lint-action"
	// nodeVersionInput keys the node-version values of every step, setup-node's and others'.
	nodeVersionInput = "node-version"
)

// TestActionStepsArePinned: no setup-node, setup-go or golangci-lint-action step under .github
// leaves its version to the action's default, a range or a file the other pins do not see.
func TestActionStepsArePinned(t *testing.T) {
	t.Parallel()

	_, problems := actionPins(githubActionSteps(t))
	for _, problem := range problems {
		t.Error(problem)
	}
}

// TestNodeLineIsOneValue: the Node major is one value everywhere it is written (the plan's
// workflow rules): the build stage image, its documentation, the Node types, an engines field or
// a version file if one appears, and every setup-node step, each of which must write it.
func TestNodeLineIsOneValue(t *testing.T) {
	t.Parallel()

	steps, _ := actionPins(githubActionSteps(t))

	expectOneValue(t, "Node line", []pinSource{
		{file: "deployments/docker/Dockerfile", pattern: nodeImage},
		{file: "docs/features/technical-stack/build-packaging.md", pattern: nodeImage},
		{file: "web/package.json", pattern: regexp.MustCompile(`"@types/node":\s*"[\^~]?(\d+)\.`)},
		{
			file:     "web/package.json",
			pattern:  regexp.MustCompile(`"node":\s*"[\^~>=]*(\d+)`),
			optional: true,
		},
		{file: ".nvmrc", pattern: regexp.MustCompile(`^v?(\d+)`), optional: true},
		{file: ".node-version", pattern: regexp.MustCompile(`^v?(\d+)`), optional: true},
	}, steps[nodeVersionInput])
}

// TestGoLineIsOneValue: .go-version, the go directive, the build stage image and its documentation
// name the same Go line, and every setup-go step reads it from .go-version instead of writing it.
func TestGoLineIsOneValue(t *testing.T) {
	t.Parallel()

	expectOneValue(t, "Go line", []pinSource{
		{file: ".go-version", pattern: regexp.MustCompile(`^(\d+\.\d+)\s*$`)},
		{file: "go.mod", pattern: regexp.MustCompile(`(?m)^go (\d+\.\d+)(?:\.\d+)?$`)},
		{file: "deployments/docker/Dockerfile", pattern: golangLine},
		{file: "docs/features/technical-stack/build-packaging.md", pattern: golangLine},
	}, nil)
}

// TestGolangciLintIsOneVersion: every golangci-lint-action step installs, by an exact version, the
// golangci-lint the pre-commit hook pins.
func TestGolangciLintIsOneVersion(t *testing.T) {
	t.Parallel()

	steps, _ := actionPins(githubActionSteps(t))

	expectOneValue(t, "golangci-lint", []pinSource{
		{
			file: ".pre-commit-config.yaml",
			pattern: regexp.MustCompile(
				`repo: https://github\.com/golangci/golangci-lint\s+rev:\s*(v[\d.]+)`,
			),
		},
	}, steps[golangciLintA])
}

// TestExactWebPins: the tools whose version other files must match are pinned exactly in
// web/package.json, without a range.
func TestExactWebPins(t *testing.T) {
	t.Parallel()

	var manifest struct {
		DevDependencies map[string]string `json:"devDependencies"`
	}

	err := json.Unmarshal([]byte(readRepoFile(t, "web", "package.json")), &manifest)
	if err != nil {
		t.Fatal(err)
	}

	exact := regexp.MustCompile(`^\d+\.\d+\.\d+$`)

	for _, name := range []string{"@playwright/test", "fallow"} {
		version, found := manifest.DevDependencies[name]
		if !found || !exact.MatchString(version) {
			t.Errorf("web/package.json pins %s as %q; want an exact version", name, version)
		}
	}
}

// TestReleaseToolPins: svu and Trivy are pinned in release.yaml and rebuild.yaml once the Release
// stage is active; before it, both files are absent.
func TestReleaseToolPins(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)

	active, err := toolchain.Active(root, toolchain.GateRelease)
	if err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"release.yaml", "rebuild.yaml"} {
		file := filepath.Join(".github", "workflows", name)

		content, readErr := os.ReadFile(filepath.Join(root, file))
		if !active {
			if readErr == nil {
				t.Errorf("%s exists before the Release stage is active", file)
			}

			continue
		}

		if readErr != nil {
			t.Errorf("the Release stage is active but %s cannot be read: %v", file, readErr)

			continue
		}

		for tool, pin := range map[string]string{"svu": svuPin, "trivy": trivyPin} {
			if !pinnedOnLine(string(content), tool, pin) {
				t.Errorf("%s does not pin %s at %s", file, tool, pin)
			}
		}
	}
}

// TestActionPinRules is the negative control of the action rules, which see nothing until the
// workflows exist: pinned steps give their values, and each unpinned form is a problem.
func TestActionPinRules(t *testing.T) {
	t.Parallel()

	steps, err := parseActionSteps("sample.yaml", []byte(`jobs:
  lint:
    steps:
      - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567 # v7.1.0
        with:
          node-version: "24"
      - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567 # v7.0.0
        with:
          go-version-file: .go-version
      - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567 # v9.3.0
        with:
          install-only: true
          version: v2.14.0
`))
	if err != nil {
		t.Fatal(err)
	}

	values, problems := actionPins(steps)
	if len(problems) != 0 ||
		!slices.Equal(values[nodeVersionInput], []pinValue{{"24", "sample.yaml"}}) ||
		!slices.Equal(values[golangciLintA], []pinValue{{"v2.14.0", "sample.yaml"}}) {
		t.Errorf("pinned steps: %v, %v", values, problems)
	}

	steps, err = parseActionSteps("action.yml", []byte(`runs:
  using: composite
  steps:
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
      with:
        node-version: lts/*
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
      with:
        node-version-file: .nvmrc
    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567
    - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567
      with:
        go-version: "1.26"
    - uses: actions/setup-go@0123456789abcdef0123456789abcdef01234567
    - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567
      with:
        install-only: true
    - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567
      with:
        version: latest
    - uses: some/other-action@0123456789abcdef0123456789abcdef01234567
      with:
        go-version: "1.27"
`))
	if err != nil {
		t.Fatal(err)
	}

	values, problems = actionPins(steps)
	if len(problems) != 9 || len(values) != 0 {
		t.Errorf("unpinned steps: want 9 problems and no values, got %v and %q", values, problems)
	}

	// A reusable workflow's node-version input is the Node line too, and so must agree with it.
	steps, err = parseActionSteps("ci.yaml", []byte(`jobs:
  web:
    uses: ./.github/workflows/web.yaml
    with:
      node-version: "22"
  build:
    uses: ./.github/workflows/build.yaml
    with:
      node-version: lts/*
`))
	if err != nil {
		t.Fatal(err)
	}

	values, problems = actionPins(steps)
	if !slices.Equal(values[nodeVersionInput], []pinValue{{"22", "ci.yaml"}}) ||
		len(problems) != 1 {
		t.Errorf("reusable workflow inputs: %v, %q", values, problems)
	}
}

func TestPinnedOnLine(t *testing.T) {
	t.Parallel()

	content := "run: go run github.com/caarlos0/svu/v3@v3.4.1 next\nwith:\n  version: v0.75.0 # trivy\n"
	if !pinnedOnLine(content, "svu", svuPin) || !pinnedOnLine(content, "trivy", trivyPin) {
		t.Error("pins written on the tool's line were not found")
	}

	if pinnedOnLine("svu: latest\nversion: v3.4.1\n", "svu", svuPin) {
		t.Error("a pin away from the tool's line was counted")
	}
}

// pinnedOnLine reports whether a line names the tool, in any case, together with the pin.
func pinnedOnLine(content, tool, pin string) bool {
	for line := range strings.SplitSeq(content, "\n") {
		if strings.Contains(strings.ToLower(line), tool) && strings.Contains(line, pin) {
			return true
		}
	}

	return false
}

// githubYAML lists every YAML file under .github, relative to the repository root.
func githubYAML(t *testing.T) []string {
	t.Helper()

	root := toolgate.RepoRoot(t)

	var files []string

	err := filepath.WalkDir(
		filepath.Join(root, ".github"),
		func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}

			if !entry.IsDir() &&
				(strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")) {
				rel, relErr := filepath.Rel(root, path)
				if relErr != nil {
					return fmt.Errorf("relative path of %s: %w", path, relErr)
				}

				files = append(files, filepath.ToSlash(rel))
			}

			return nil
		},
	)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}

	return files
}

// actionStep is one step, in a workflow or a composite action, that uses an action.
type actionStep struct {
	file string
	// action is the uses: value without its @ref.
	action string
	with   map[string]string
}

// pinValue is one version found and where.
type pinValue struct {
	value string
	file  string
}

// githubActionSteps parses every YAML file under .github for steps that use an action.
func githubActionSteps(t *testing.T) []actionStep {
	t.Helper()

	var steps []actionStep

	for _, file := range githubYAML(t) {
		parsed, err := parseActionSteps(file, []byte(readRepoFile(t, filepath.FromSlash(file))))
		if err != nil {
			t.Fatal(err)
		}

		steps = append(steps, parsed...)
	}

	return steps
}

// parseActionSteps finds every mapping with a uses: key anywhere in the document, so job steps and
// composite action steps alike.
func parseActionSteps(file string, content []byte) ([]actionStep, error) {
	var document any

	err := yaml.Unmarshal(content, &document)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", file, err)
	}

	var steps []actionStep

	var walk func(node any)

	walk = func(node any) {
		switch value := node.(type) {
		case map[string]any:
			if uses, ok := value["uses"].(string); ok {
				step := actionStep{
					file:   file,
					action: strings.SplitN(uses, "@", 2)[0],
					with:   map[string]string{},
				}

				inputs, _ := value["with"].(map[string]any)
				for key, input := range inputs {
					step.with[key] = fmt.Sprint(input)
				}

				steps = append(steps, step)
			}

			for _, child := range value {
				walk(child)
			}
		case []any:
			for _, child := range value {
				walk(child)
			}
		}
	}

	walk(document)

	return steps, nil
}

// actionPins applies the pin rules to steps: any node-version input, whatever the action or the
// reusable workflow that takes it, is a literal Node major, and setup-node must have one; no step
// writes a go-version, and setup-go reads .go-version; golangci-lint-action installs an exact
// version. It returns the pinned values by input, and a problem for every step that breaks a rule.
func actionPins(steps []actionStep) (values map[string][]pinValue, problems []string) {
	values = map[string][]pinValue{}

	for _, step := range steps {
		if version, ok := step.with["node-version"]; ok || step.action == setupNode {
			if !nodeMajor.MatchString(version) {
				problems = append(problems, fmt.Sprintf(
					"%s: %s must get node-version as a literal Node major, got %q",
					step.file, step.action, version))
			} else {
				values[nodeVersionInput] = append(
					values[nodeVersionInput],
					pinValue{version, step.file},
				)
			}
		}

		if step.with["go-version"] != "" {
			problems = append(problems, fmt.Sprintf(
				"%s: %s gets go-version %q; the Go line comes from .go-version",
				step.file, step.action, step.with["go-version"]))
		}

		if step.action == setupGo && step.with["go-version-file"] != ".go-version" {
			problems = append(
				problems,
				step.file+": setup-go must read go-version-file: .go-version",
			)
		}

		if step.action == golangciLintA {
			version := step.with["version"]
			if !exactTag.MatchString(version) {
				problems = append(problems, fmt.Sprintf(
					"%s: golangci-lint-action must install an exact version, got %q",
					step.file, version))

				continue
			}

			values[golangciLintA] = append(values[golangciLintA], pinValue{version, step.file})
		}
	}

	return values, problems
}

// expectOneValue fails unless every required source has the pin and all found values, the extra
// ones included, agree.
func expectOneValue(t *testing.T, what string, sources []pinSource, extra []pinValue) {
	t.Helper()

	root := toolgate.RepoRoot(t)
	found := map[string][]string{}

	for _, value := range extra {
		found[value.value] = append(found[value.value], value.file)
	}

	for _, source := range sources {
		content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(source.file)))
		if err != nil {
			if !source.optional {
				t.Errorf("%s: %v", what, err)
			}

			continue
		}

		matches := source.pattern.FindAllStringSubmatch(string(content), -1)
		if len(matches) == 0 && !source.optional {
			t.Errorf("%s: %s does not write it (%s)", what, source.file, source.pattern)
		}

		for _, match := range matches {
			found[match[1]] = append(found[match[1]], source.file)
		}
	}

	if len(found) > 1 {
		values := slices.Sorted(func(yield func(string) bool) {
			for value, files := range found {
				if !yield(value + " in " + strings.Join(slices.Compact(files), ", ")) {
					return
				}
			}
		})
		t.Errorf("%s is not one value: %s", what, strings.Join(values, "; "))
	}
}
