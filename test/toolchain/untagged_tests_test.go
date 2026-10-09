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
	"fmt"
	"go/ast"
	"go/build/constraint"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// dockerPackages may only be imported behind the image or harness build tag: they drive Docker.
var dockerPackages = []string{
	"github.com/leinardi/bitgauge/test/internal/testenv",
	"github.com/leinardi/bitgauge/test/internal/netguard",
}

// testFile is one parsed _test.go file of the repository.
type testFile struct {
	rel    string
	file   *ast.File
	tagged bool
}

// TestUntaggedTestsAvoidDocker keeps Docker out of the untagged go test run that repo-gates makes:
// no untagged test file imports the Docker-driving packages or runs docker itself. Docker tests sit
// behind the image or harness tag and run only in their activated CI jobs.
func TestUntaggedTestsAvoidDocker(t *testing.T) {
	t.Parallel()

	files := parseTestFiles(t)
	untagged := 0

	for _, file := range files {
		if file.tagged {
			continue
		}

		untagged++

		for _, spec := range file.file.Imports {
			imported, _ := strconv.Unquote(spec.Path.Value)
			if slices.Contains(dockerPackages, imported) {
				t.Errorf("%s is untagged and imports %s", file.rel, imported)
			}
		}

		for _, call := range execCalls(file.file, "Command", "CommandContext") {
			if slices.ContainsFunc(call.Args, isLiteral("docker")) {
				t.Errorf("%s is untagged and runs docker", file.rel)
			}
		}

		// testenv's own tests use it from inside the package, without importing it; and a constant
		// would hide the literal from the exec check above.
		ast.Inspect(file.file, func(node ast.Node) bool {
			switch value := node.(type) {
			case *ast.Ident:
				if value.Name == "DockerCLI" {
					t.Errorf("%s is untagged and uses testenv's DockerCLI", file.rel)
				}
			case *ast.ValueSpec:
				if slices.ContainsFunc(value.Values, isLiteral("docker")) {
					t.Errorf(
						"%s is untagged and names the docker binary in a declaration",
						file.rel,
					)
				}
			}

			return true
		})
	}

	if untagged == 0 {
		t.Fatal("no untagged test file found; the check would pass on nothing")
	}
}

// TestToolGateListIsClosed keeps the tools a meta-test may skip on to golangci-lint, eslint and
// fallow: toolgate's list is exactly those, every gated test names one of its constants, and no
// test looks a tool up on its own, which would be a skip CI cannot turn into a failure.
func TestToolGateListIsClosed(t *testing.T) {
	t.Parallel()

	tools := slices.Sorted(slices.Values(toolgate.Tools))
	if !slices.Equal(tools, []string{"eslint", "fallow", "golangci-lint"}) {
		t.Errorf("toolgate.Tools = %v, want exactly eslint, fallow and golangci-lint", tools)
	}

	for _, file := range parseTestFiles(t) {
		if len(execCalls(file.file, "LookPath")) > 0 {
			t.Errorf("%s looks a tool up itself; gate it through toolgate.Lookup", file.rel)
		}

		ast.Inspect(file.file, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok || !isSelector(call.Fun, "toolgate", "Lookup") || len(call.Args) != 2 {
				return true
			}

			if selector, isSel := call.Args[1].(*ast.SelectorExpr); !isSel ||
				!isIdent(selector.X, "toolgate") {
				t.Errorf("%s gates on a tool that is not a toolgate constant", file.rel)
			}

			return true
		})
	}
}

// TestDockerCheckRecognizesItsTargets is the negative control of the two checks above.
func TestDockerCheckRecognizesItsTargets(t *testing.T) {
	t.Parallel()

	file, err := parser.ParseFile(token.NewFileSet(), "sample_test.go", `package sample
import osexec "os/exec"
func run() { _ = osexec.Command("docker", "ps"); _, _ = osexec.LookPath("node") }
`, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}

	if calls := execCalls(file, "Command", "CommandContext"); len(calls) != 1 ||
		!slices.ContainsFunc(calls[0].Args, isLiteral("docker")) {
		t.Error("exec.Command(\"docker\", ...) was not recognized")
	}

	if len(execCalls(file, "LookPath")) != 1 {
		t.Error("exec.LookPath was not recognized")
	}

	for constraintLine, tagged := range map[string]bool{
		"//go:build harness":                   true,
		"//go:build image || harness":          true,
		"//go:build image && linux":            true,
		"//go:build linux":                     false,
		"//go:build !windows":                  false,
		"//go:build !image":                    false,
		"//go:build harness || linux":          false,
		"//go:build (image || harness) && !js": true,
	} {
		sample, parseErr := parser.ParseFile(token.NewFileSet(), "sample_test.go",
			constraintLine+"\n\npackage sample\n", parser.ParseComments)
		if parseErr != nil {
			t.Fatal(parseErr)
		}

		if hasBuildTag(sample) != tagged {
			t.Errorf("%q: read as tagged %v, want %v", constraintLine, !tagged, tagged)
		}
	}

	if hasBuildTag(file) {
		t.Error("a file without a //go:build line was read as tagged")
	}
}

func parseTestFiles(t *testing.T) []testFile {
	t.Helper()

	root := toolgate.RepoRoot(t)
	fset := token.NewFileSet()

	var files []testFile

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "node_modules", "dist":
				return filepath.SkipDir
			}

			return nil
		}

		if !strings.HasSuffix(path, "_test.go") {
			return nil
		}

		file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return fmt.Errorf("parse: %w", err)
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return fmt.Errorf("relative path of %s: %w", path, err)
		}

		files = append(
			files,
			testFile{rel: filepath.ToSlash(rel), file: file, tagged: hasBuildTag(file)},
		)

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return files
}

// dockerTags are the build tags that Docker-dependent tests sit behind.
var dockerTags = []string{"image", "harness"}

// hasBuildTag reports whether the file builds only with the image or harness tag: its //go:build
// constraint is false under every assignment of its other tags once those two are false. A file
// with no constraint, or one such as linux or !windows, is compiled by untagged go test somewhere.
func hasBuildTag(file *ast.File) bool {
	for _, group := range file.Comments {
		if group.Pos() > file.Package {
			break
		}

		for _, comment := range group.List {
			if !constraint.IsGoBuild(comment.Text) {
				continue
			}

			expr, err := constraint.Parse(comment.Text)
			if err != nil {
				return false
			}

			return !satisfiableWithoutDocker(expr)
		}
	}

	return false
}

func satisfiableWithoutDocker(expr constraint.Expr) bool {
	var others []string

	expr.Eval(func(tag string) bool {
		if !slices.Contains(dockerTags, tag) && !slices.Contains(others, tag) {
			others = append(others, tag)
		}

		return false
	})

	for assignment := range 1 << len(others) {
		if expr.Eval(func(tag string) bool {
			index := slices.Index(others, tag)

			return index >= 0 && assignment&(1<<index) != 0
		}) {
			return true
		}
	}

	return false
}

// execCalls returns the calls to os/exec functions with the given names, under whatever name the
// file imports os/exec.
func execCalls(file *ast.File, names ...string) []*ast.CallExpr {
	local := ""

	for _, spec := range file.Imports {
		if spec.Path.Value != `"os/exec"` {
			continue
		}

		local = "exec"
		if spec.Name != nil {
			local = spec.Name.Name
		}
	}

	if local == "" {
		return nil
	}

	var calls []*ast.CallExpr

	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}

		for _, name := range names {
			if isSelector(call.Fun, local, name) {
				calls = append(calls, call)
			}
		}

		return true
	})

	return calls
}

func isSelector(expr ast.Expr, pkg, name string) bool {
	selector, ok := expr.(*ast.SelectorExpr)

	return ok && selector.Sel.Name == name && isIdent(selector.X, pkg)
}

func isIdent(expr ast.Expr, name string) bool {
	ident, ok := expr.(*ast.Ident)

	return ok && ident.Name == name
}

func isLiteral(value string) func(ast.Expr) bool {
	return func(expr ast.Expr) bool {
		literal, ok := expr.(*ast.BasicLit)
		if !ok || literal.Kind != token.STRING {
			return false
		}

		unquoted, err := strconv.Unquote(literal.Value)

		return err == nil && unquoted == value
	}
}
