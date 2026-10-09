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

// Package gitenv gives meta-tests an environment for git commands that cannot reach the
// repository being committed.
//
// The Go tests also run inside a pre-commit hook, and git exports its own location to hooks:
// GIT_INDEX_FILE always, GIT_DIR and others in some setups, absolute in a linked worktree. A git
// command run in a scratch repository with that environment acts on the real one instead -- a git
// add there writes into the index of the commit being made. Isolated strips those variables and
// the user's own configuration, so a scratch repository is only ever itself.
package gitenv

import (
	"os"
	"slices"
	"strings"
)

// repositoryVars point git at a repository other than the working directory's.
var repositoryVars = []string{
	"GIT_DIR",
	"GIT_INDEX_FILE",
	"GIT_WORK_TREE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_PREFIX",
	"GIT_NAMESPACE",
	"GIT_CEILING_DIRECTORIES",
}

// Isolated returns the process environment without the variables that redirect git, without the
// user's global and system configuration, and with extra appended.
func Isolated(extra ...string) []string {
	env := make([]string, 0, len(os.Environ())+len(extra)+2)

	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		if slices.Contains(repositoryVars, name) || strings.HasPrefix(name, "GIT_CONFIG") {
			continue
		}

		env = append(env, entry)
	}

	env = append(env, "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")

	return append(env, extra...)
}
