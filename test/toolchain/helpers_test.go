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
// in the ESLint configuration, and the absence of flags that make a gate pass on nothing.
package toolchain_test

import (
	"os"
	"path/filepath"
	"testing"

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
