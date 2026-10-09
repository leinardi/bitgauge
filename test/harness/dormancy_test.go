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

package harness

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// envCheckActive makes TestHarnessActive enforce the prerequisites: .mk/harness.mk sets it before
// any runner starts, so a dormant harness fails there, loudly, before a container exists.
const envCheckActive = "HARNESS_CHECK_ACTIVE"

// TestHarnessActive fails, listing what is missing, while the harness is dormant. Outside the
// runners it only checks that the prerequisites can be established on this tree.
func TestHarnessActive(t *testing.T) {
	t.Parallel()

	unmet, err := Unmet(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	if os.Getenv(envCheckActive) == "1" && len(unmet) > 0 {
		t.Fatalf("the harness is dormant; unmet prerequisites:\n- %s", strings.Join(unmet, "\n- "))
	}
}

func TestUnmet(t *testing.T) {
	t.Parallel()

	const (
		specd       = "Spec'd (v0.1)"
		implemented = "Implemented (v0.1)"
	)

	tree := func(t *testing.T, state, screens string, files ...string) string {
		t.Helper()

		root := t.TempDir()
		write := func(name, content string) {
			path := filepath.Join(root, filepath.FromSlash(name))

			err := os.MkdirAll(filepath.Dir(path), 0o750)
			if err != nil {
				t.Fatal(err)
			}

			err = os.WriteFile(path, []byte(content), 0o600)
			if err != nil {
				t.Fatal(err)
			}
		}

		var status strings.Builder

		status.WriteString("| Feature area | Status | Code pointers |\n| --- | --- | --- |\n")

		for _, row := range prerequisiteRows {
			status.WriteString("| " + row + " and more | " + state + " |  |\n")
		}

		write("docs/STATUS.md", status.String())
		write("docs/features/ui/screens.md", screens)

		for _, file := range files {
			write(file, "")
		}

		return root
	}

	screens := "- " + extractionPath + ": the single result object.\n"

	unmet, err := Unmet(tree(t, specd, ""))
	if err != nil {
		t.Fatal(err)
	}

	if len(unmet) != len(prerequisiteFiles)+len(prerequisiteRows)+1 {
		t.Errorf(
			"an empty tree misses %d prerequisites:\n%s",
			len(unmet),
			strings.Join(unmet, "\n"),
		)
	}

	unmet, err = Unmet(tree(t, implemented, screens, prerequisiteFiles...))
	if err != nil || len(unmet) != 0 {
		t.Errorf("a complete tree is dormant: %v, %v", unmet, err)
	}

	unmet, err = Unmet(tree(t, implemented, screens, prerequisiteFiles[1:]...))
	if err != nil || len(unmet) != 1 || !strings.HasPrefix(unmet[0], prerequisiteFiles[0]) {
		t.Errorf("a tree without %s: %v, %v", prerequisiteFiles[0], unmet, err)
	}

	unmet, err = Unmet(tree(t, specd, screens, prerequisiteFiles...))
	if err != nil || len(unmet) != len(prerequisiteRows) {
		t.Errorf("a tree with every row Spec'd: %v, %v", unmet, err)
	}

	root := tree(t, implemented, screens, prerequisiteFiles...)

	err = os.WriteFile(
		filepath.Join(root, "docs", "STATUS.md"),
		[]byte("| Other | Implemented |  |\n"),
		0o600,
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = Unmet(root)
	if err == nil {
		t.Error("a STATUS.md without the prerequisite rows was read as an answer")
	}
}

// TestExtractionPathSpecified keeps the Download JSON the driver clicks specified in screens.md;
// TestHarnessActive already fails when a prerequisite row leaves docs/STATUS.md.
func TestExtractionPathSpecified(t *testing.T) {
	t.Parallel()

	screens := readFile(t, filepath.Join("..", "..", "docs", "features", "ui", "screens.md"))
	if !strings.Contains(screens, extractionPath) {
		t.Errorf("screens.md does not specify %q", extractionPath)
	}
}
