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

// Package toolchain_test pins the repository's tooling: the npm install policy, the engine boundary
// and the file-budget ceiling in the ESLint configuration, the dependency audit, the fallow
// dead-code gate, the staged gate registry, the shared version pins, Docker staying out of untagged
// tests, and the absence of flags that make a gate pass on nothing.
package toolchain_test

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

// readRepoFile reads a file by its path segments relative to the repository root.
func readRepoFile(t *testing.T, segments ...string) string {
	t.Helper()

	path := filepath.Join(append([]string{toolgate.RepoRoot(t)}, segments...)...)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", filepath.Join(segments...), err)
	}

	return string(data)
}

// preCommitHook is one hook's mapping as written; its keys are pre-commit's own snake_case names.
type preCommitHook map[string]any

// preCommitHooks parses .pre-commit-config.yaml and returns its hooks by id; an id with aliases
// (the actionlint and shellcheck variants) appears more than once.
func preCommitHooks(t *testing.T) map[string][]preCommitHook {
	t.Helper()

	var config struct {
		Repos []struct {
			Hooks []preCommitHook `yaml:"hooks"`
		} `yaml:"repos"`
	}

	err := yaml.Unmarshal([]byte(readRepoFile(t, ".pre-commit-config.yaml")), &config)
	if err != nil {
		t.Fatalf("parse .pre-commit-config.yaml: %v", err)
	}

	hooks := map[string][]preCommitHook{}

	for _, repo := range config.Repos {
		for _, hook := range repo.Hooks {
			id, _ := hook["id"].(string)
			hooks[id] = append(hooks[id], hook)
		}
	}

	return hooks
}

// readWebSources reads every file of the web workspace that a frontend tool analyses: the
// manifest, the configuration files and the src, e2e and harness trees. A tool run through exec is
// invisible to the test cache, and reading its inputs here is what makes an edit to them
// invalidate a cached pass.
func readWebSources(t *testing.T) {
	t.Helper()

	web, err := os.OpenRoot(filepath.Join(toolgate.RepoRoot(t), "web"))
	if err != nil {
		t.Fatalf("open web/: %v", err)
	}

	defer web.Close()

	tree := web.FS()

	files, err := fs.Glob(tree, "*.*")
	if err != nil {
		t.Fatalf("list web/: %v", err)
	}

	for _, file := range files {
		_, err = fs.ReadFile(tree, file)
		if err != nil {
			t.Fatalf("read web/%s: %v", file, err)
		}
	}

	for _, dir := range []string{"src", "e2e", "harness"} {
		err = fs.WalkDir(tree, dir, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil || entry.IsDir() {
				return walkErr
			}

			_, readErr := fs.ReadFile(tree, path)
			if readErr != nil {
				return fmt.Errorf("read %s: %w", path, readErr)
			}

			return nil
		})
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("read web/%s: %v", dir, err)
		}
	}
}
