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

// Package licenseheaders_test drives scripts/check-license-headers.sh: on this repository, and on
// scratch repositories that hold each kind of file it must reject or let through.
package licenseheaders_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/test/internal/gitenv"
	"github.com/leinardi/bitgauge/test/internal/toolgate"
)

const scriptPath = "scripts/check-license-headers.sh"

const goHeader = `/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

package x
`

// onlyHeader is the GPL-3.0-only wording: version 3 and nothing later.
const onlyHeader = `/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 */

package x
`

const shellHeader = `#!/usr/bin/env bash
#
# This file is part of BitGauge.
#
# Copyright (c) 2026 Roberto Leinardi
#
# BitGauge is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
echo ok
`

// rustHeader is goHeader in a Rust file: the same block comment.
const rustHeader = `/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
`

// provenance is the one accepted shape of the line an adapted file carries after its header.
const provenance = "// Adapted from swarm-scheduler-exporter/meta/src/repo.rs at 722b8a3, MIT, " +
	"Copyright (c) 2026 Roberto Leinardi\n"

// tomlHeader is the shell header without the shebang, as the Rust workspace's TOML files carry it.
const tomlHeader = "#\n# This file is part of BitGauge.\n#\n# Copyright (c) 2026 Roberto Leinardi\n#\n" +
	"# it under the terms of the GNU General Public License as published by\n" +
	"# the Free Software Foundation, either version 3 of the License, or\n" +
	"# (at your option) any later version.\n"

const makefile = "MK_COMMON_FILES := docker.mk help.mk\n"

// makefileWithHeader is the scratch repositories' Makefile, which the check governs too.
const makefileWithHeader = "#\n# This file is part of BitGauge.\n#\n# Copyright (c) 2026 Roberto Leinardi\n#\n" +
	"# it under the terms of the GNU General Public License as published by\n" +
	"# the Free Software Foundation, either version 3 of the License, or\n" +
	"# (at your option) any later version.\n" + makefile

// untrackedPrefix marks scratch files that are written but never added: the check reads tracked
// files only.
const untrackedPrefix = "untracked/"

// TestRepositoryHeaders runs the check on this repository.
func TestRepositoryHeaders(t *testing.T) {
	t.Parallel()

	root := toolgate.RepoRoot(t)
	readScript(t, root)
	readTrackedFiles(t, root)

	// The repository's own git environment is the right one here: under the commit hook it names
	// the index being committed.
	cmd := exec.CommandContext(t.Context(), scriptPath)
	cmd.Dir = root

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Errorf("the repository fails its own license header check: %v\n%s", err, out)
	}
}

// TestHeaderCases runs the check on scratch repositories, one file kind at a time.
func TestHeaderCases(t *testing.T) {
	t.Parallel()

	script := readScript(t, toolgate.RepoRoot(t))

	for name, test := range map[string]struct {
		files map[string]string
		pass  bool
	}{
		"go file with the header":        {map[string]string{"internal/x/x.go": goHeader}, true},
		"go file without a header":       {map[string]string{"internal/x/x.go": "package x\n"}, false},
		"go file with GPL-3.0-only":      {map[string]string{"internal/x/x.go": onlyHeader}, false},
		"another project's header":       {map[string]string{"internal/x/x.go": strings.ReplaceAll(goHeader, "BitGauge", "Runhold")}, false},
		"shell script with the header":   {map[string]string{"scripts/a.sh": shellHeader}, true},
		"shell script without a header":  {map[string]string{"scripts/a.sh": "#!/usr/bin/env bash\necho\n"}, false},
		"typescript without a header":    {map[string]string{"web/src/engine/clock.ts": "export {}\n"}, false},
		"vue without a header":           {map[string]string{"web/src/App.vue": "<template></template>\n"}, false},
		"dockerfile without a header":    {map[string]string{"deployments/docker/Dockerfile": "FROM scratch\n"}, false},
		"local make fragment, no header": {map[string]string{".mk/verify.mk": "x:\n"}, false},
		"rust file with the header":      {map[string]string{"src/lib.rs": rustHeader + "//! x\n"}, true},
		"rust file without a header":     {map[string]string{"src/lib.rs": "//! x\n"}, false},
		"rust file, exact provenance":    {map[string]string{"meta/src/repo.rs": rustHeader + provenance}, true},
		"rust file, provenance no commit": {
			map[string]string{"meta/src/repo.rs": rustHeader + "// Adapted from swarm-scheduler-exporter/meta/src/repo.rs, MIT\n"},
			false,
		},
		"rust file, provenance no license": {
			map[string]string{"meta/src/repo.rs": rustHeader + strings.Replace(provenance, " MIT,", "", 1)},
			false,
		},
		"toml provenance in its own marker": {
			map[string]string{"Cargo.toml": tomlHeader + strings.Replace(provenance, "//", "#", 1)},
			true,
		},
		"cargo manifest without a header": {map[string]string{"meta/Cargo.toml": "[package]\n"}, false},
		"clippy config without a header":  {map[string]string{"clippy.toml": "msrv = \"1\"\n"}, false},
		// The Go side did not move: an unadapted Go file still passes on its header alone.
		"go file without provenance": {map[string]string{"internal/x/x.go": goHeader}, true},
		"makefile without a header":  {map[string]string{"Makefile": makefile}, false},
		// goHeader's last required line is its ninth: 16 lines before it put it on line 25, the
		// last line of the window, and one more pushes it out.
		"header ending on the last line of the window": {
			map[string]string{"internal/x/x.go": strings.Repeat("// filler\n", 16) + goHeader},
			true,
		},
		"header ending one line past the window": {
			map[string]string{"internal/x/x.go": strings.Repeat("// filler\n", 17) + goHeader},
			false,
		},
		"untracked file without a header": {map[string]string{untrackedPrefix + "scratch.go": "package x\n"}, true},
		"bitgauge-authored skill script":  {map[string]string{".agents/skills/server-invariants/x.sh": "echo\n"}, false},
		"upstream make fragment":          {map[string]string{".mk/docker.mk": "x:\n", ".mk/help.mk": "y:\n"}, true},
		"bootstrap script":                {map[string]string{"scripts/bootstrap-mk-common.sh": "#!/bin/sh\n"}, true},
		"generated api types":             {map[string]string{"web/src/api/types.gen.ts": "export {}\n"}, true},
		"shadcn component":                {map[string]string{"web/src/components/ui/button/Button.vue": "<template/>\n"}, true},
		"vendored skill":                  {map[string]string{".agents/skills/fallow/x.sh": "echo\n"}, true},
		"design export":                   {map[string]string{"docs/design_system/x.js": "x\n"}, true},
		"markdown and yaml":               {map[string]string{"README.md": "# x\n", "a.yaml": "a: 1\n"}, true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			dir := scratchRepo(t, script, test.files)

			out, err := runIn(t, dir)
			if test.pass && err != nil {
				t.Errorf("rejected, want accepted: %v\n%s", err, out)
			}

			if !test.pass && err == nil {
				t.Errorf("accepted, want rejected:\n%s", out)
			}
		})
	}
}

// readTrackedFiles reads the index and every tracked file, so a change to any of them is part of
// the test cache key and a cached pass is not replayed after a headerless file is added.
func readTrackedFiles(t *testing.T, root string) {
	t.Helper()

	for _, args := range [][]string{{"rev-parse", "--git-path", "index"}, {"ls-files"}} {
		cmd := exec.CommandContext(t.Context(), "git", args...)
		cmd.Dir = root

		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("git %v: %v", args, err)
		}

		for name := range strings.SplitSeq(strings.TrimSpace(string(out)), "\n") {
			if !filepath.IsAbs(name) {
				name = filepath.Join(root, name)
			}

			_, _ = os.ReadFile(
				name,
			) // a deleted tracked file is the script's concern, not this one's
		}
	}
}

// readScript reads the checker, which also makes it part of the test cache key: a program run only
// through exec is not, and an edited script would otherwise replay a cached pass.
func readScript(t *testing.T, root string) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(root, scriptPath))
	if err != nil {
		t.Fatalf("read the checker: %v", err)
	}

	return data
}

// scratchRepo creates a git repository holding the checker, a Makefile and files.
func scratchRepo(t *testing.T, script []byte, files map[string]string) string {
	t.Helper()

	dir := t.TempDir()

	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatalf("open %s: %v", dir, err)
	}

	defer func() { _ = root.Close() }()

	files[scriptPath] = string(script)
	if _, ok := files["Makefile"]; !ok {
		files["Makefile"] = makefileWithHeader
	}

	for name, content := range files {
		err = root.MkdirAll(filepath.Dir(name), 0o750)
		if err != nil {
			t.Fatalf("create the directory of %s: %v", name, err)
		}

		err = root.WriteFile(name, []byte(content), 0o600)
		if err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	err = root.Chmod(scriptPath, 0o700)
	if err != nil {
		t.Fatalf("make the checker executable: %v", err)
	}

	git(t, dir, "init", "--quiet")

	for name := range files {
		if !strings.HasPrefix(name, untrackedPrefix) {
			git(t, dir, "add", "--", name)
		}
	}

	return dir
}

// runIn runs the checker kept at scriptPath inside the repository at dir.
func runIn(t *testing.T, dir string) (string, error) {
	t.Helper()

	// A relative command path is resolved against Dir.
	cmd := exec.CommandContext(t.Context(), scriptPath)
	cmd.Dir = dir
	cmd.Env = gitenv.Isolated()

	out, err := cmd.CombinedOutput()

	return string(out), err
}

func git(t *testing.T, dir string, args ...string) {
	t.Helper()

	cmd := exec.CommandContext(t.Context(), "git", args...)
	cmd.Dir = dir
	cmd.Env = gitenv.Isolated()

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}
