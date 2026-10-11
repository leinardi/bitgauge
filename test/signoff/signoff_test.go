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

// Package signoff_test drives scripts/check-signoff.sh, the commit-msg hook that enforces the
// Developer Certificate of Origin, against commit messages as git hands them to the hook.
package signoff_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/gitenv"
	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

const (
	scriptPath  = "scripts/check-signoff.sh"
	authorName  = "Ada Example"
	authorEmail = "ada@example.com"
	signedOff   = "Signed-off-by: " + authorName + " <" + authorEmail + ">"
)

// verboseTail is what git commit -v appends below the message: the scissors line and the diff,
// whose "--- a/" line would otherwise be taken for the start of a patch.
const verboseTail = `# Please enter the commit message for your changes. Lines starting
# with '#' will be ignored, and an empty message aborts the commit.
# ------------------------ >8 ------------------------
# Do not modify or remove the line above.
# Everything below it will be ignored.
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
`

func TestCheckSignoff(t *testing.T) {
	t.Parallel()

	for name, test := range map[string]struct {
		message string
		pass    bool
	}{
		"signed off by the author":   {"docs(x): change\n\nBody.\n\n" + signedOff + "\n", true},
		"no trailer":                 {"docs(x): change\n\nBody.\n", false},
		"signed off by someone else": {"docs(x): change\n\nSigned-off-by: Bob <bob@example.com>\n", false},
		"trailer only in the body":   {"docs(x): change\n\n" + signedOff + " said so\n\nMore.\n", false},
		"verbose commit, signed off": {"docs(x): change\n\n" + signedOff + "\n" + verboseTail, true},
		"verbose commit, unsigned":   {"docs(x): change\n\nBody.\n" + verboseTail, false},
		"verbose commit, sign-off only in the diff": {
			"docs(x): change\n" + verboseTail + "+" + signedOff + "\n",
			false,
		},
		"commented-out sign-off": {"docs(x): change\n\n# " + signedOff + "\n", false},
		"verbose commit, other comment character": {
			"docs(x): change\n\n" + signedOff + "\n" + strings.ReplaceAll(verboseTail, "# ", "; "),
			true,
		},
		"merge commit":  {"Merge branch 'main' into feature\n", true},
		"fixup commit":  {"fixup! docs(x): change\n", true},
		"squash commit": {"squash! docs(x): change\n", true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			out, err := run(t, test.message, false)
			if test.pass && err != nil {
				t.Errorf("rejected, want accepted: %v\n%s", err, out)
			}

			if !test.pass && err == nil {
				t.Errorf("accepted, want rejected:\n%s", test.message)
			}
		})
	}
}

// TestCheckSignoffStrict is the mode CI's signoff job runs: the commits are about to land as they
// are, so no subject is exempt.
func TestCheckSignoffStrict(t *testing.T) {
	t.Parallel()

	for name, test := range map[string]struct {
		message string
		pass    bool
	}{
		"signed off by the author": {"docs(x): change\n\n" + signedOff + "\n", true},
		"no trailer":               {"docs(x): change\n", false},
		"signed-off fixup commit":  {"fixup! docs(x): change\n\n" + signedOff + "\n", false},
		"squash commit":            {"squash! docs(x): change\n", false},
		"amend commit":             {"amend! docs(x): change\n", false},
		"unsigned Merge subject":   {"Merge branch 'main' into feature\n", false},
		"signed-off Merge subject": {"Merge branch 'main' into feature\n\n" + signedOff + "\n", true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			out, err := run(t, test.message, true)
			if test.pass && err != nil {
				t.Errorf("rejected, want accepted: %v\n%s", err, out)
			}

			if !test.pass && err == nil {
				t.Errorf("accepted, want rejected:\n%s", test.message)
			}
		})
	}
}

func TestCheckSignoffUsage(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)

	_, err := os.ReadFile(filepath.Join(root, scriptPath))
	if err != nil {
		t.Fatalf("read the hook: %v", err)
	}

	for _, args := range [][]string{nil, {"--strict"}, {"--lenient", "/dev/null"}} {
		cmd := exec.CommandContext(t.Context(), scriptPath, args...)
		cmd.Dir = root

		out, err := cmd.CombinedOutput()
		if err == nil || !strings.Contains(string(out), "Usage:") {
			t.Errorf("arguments %q must fail with usage, got err=%v:\n%s", args, err, out)
		}
	}
}

func run(t *testing.T, message string, strict bool) (string, error) {
	t.Helper()

	// The hook reads its message file once, so /dev/stdin stands in for COMMIT_EDITMSG. A relative
	// command path is resolved against Dir, so the hook runs from the repository root exactly as
	// pre-commit runs it.
	root := toolgate.RepoRoot(t)

	// Reading the script makes it part of the test cache key; a program run only through exec is
	// not, and an edited hook would otherwise replay a cached pass.
	_, err := os.ReadFile(filepath.Join(root, scriptPath))
	if err != nil {
		t.Fatalf("read the hook: %v", err)
	}

	cmd := exec.CommandContext(t.Context(), scriptPath, "/dev/stdin")
	if strict {
		cmd = exec.CommandContext(t.Context(), scriptPath, "--strict", "/dev/stdin")
	}

	cmd.Dir = root
	cmd.Stdin = strings.NewReader(message)

	cmd.Env = gitenv.Isolated("GIT_AUTHOR_NAME="+authorName, "GIT_AUTHOR_EMAIL="+authorEmail)

	out, err := cmd.CombinedOutput()

	return string(out), err
}
