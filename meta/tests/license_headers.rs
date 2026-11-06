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

//! `scripts/check-license-headers.sh` keeps every governed source file under the BitGauge
//! GPL-3.0-or-later header, with an exact provenance line on adapted files. It runs here on this
//! repository, and on scratch repositories that each hold one kind of file the script must reject
//! or let through, so an edit that blinds the script to a file kind fails here.
//!
//! The harness is rust-common's `repo_meta::scratch::HeaderHarness`: the scratch repositories run
//! git and the script with an isolated environment (under the commit hook git exports the
//! location of the repository being committed, `GIT_INDEX_FILE` and others, and a `git add` in a
//! scratch repository with that environment would write into the real index), and the cases run
//! in parallel. The cases are BitGauge's.

use repo_meta::report;
use repo_meta::scratch::{HeaderCase, HeaderHarness};

const GO_HEADER: &str = "/*
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
";

/// The GPL-3.0-only wording: version 3 and nothing later.
const ONLY_HEADER: &str = "/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 */

package x
";

const SHELL_HEADER: &str = "#!/usr/bin/env bash
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
";

/// `GO_HEADER` in a Rust file: the same block comment.
const RUST_HEADER: &str = "/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
";

/// The one accepted shape of the line an adapted file carries after its header.
const PROVENANCE: &str = concat!(
    "// Adapted from swarm-scheduler-exporter/meta/src/repo.rs at 722b8a3, MIT, ",
    "Copyright (c) 2026 Roberto Leinardi\n"
);

/// The shell header without the shebang, as the Rust workspace's TOML files carry it.
const TOML_HEADER: &str = concat!(
    "#\n# This file is part of BitGauge.\n#\n# Copyright (c) 2026 Roberto Leinardi\n#\n",
    "# it under the terms of the GNU General Public License as published by\n",
    "# the Free Software Foundation, either version 3 of the License, or\n",
    "# (at your option) any later version.\n"
);

const MAKEFILE: &str = "MK_COMMON_FILES := docker.mk help.mk\n";

/// The scratch repositories' Makefile, which the check governs too.
const MAKEFILE_WITH_HEADER: &str = concat!(
    "#\n# This file is part of BitGauge.\n#\n# Copyright (c) 2026 Roberto Leinardi\n#\n",
    "# it under the terms of the GNU General Public License as published by\n",
    "# the Free Software Foundation, either version 3 of the License, or\n",
    "# (at your option) any later version.\n",
    "MK_COMMON_FILES := docker.mk help.mk\n"
);

/// The checker, with the Makefile every scratch repository holds unless a case brings its own;
/// files under `untracked/` are written but never added, since the check reads tracked files only.
const HARNESS: HeaderHarness<'static> = HeaderHarness {
    script: "scripts/check-license-headers.sh",
    base_files: &[("Makefile", MAKEFILE_WITH_HEADER)],
    untracked_prefix: "untracked/",
};

fn case(name: &str, files: &[(&str, &str)], pass: bool) -> HeaderCase {
    HeaderCase::new(name, files, pass)
}

/// The first half of the Go case table, split only to keep each function short.
fn cases() -> Vec<HeaderCase> {
    let go = "internal/x/x.go";
    vec![
        case("go file with the header", &[(go, GO_HEADER)], true),
        case("go file without a header", &[(go, "package x\n")], false),
        case("go file with GPL-3.0-only", &[(go, ONLY_HEADER)], false),
        case(
            "another project's header",
            &[(go, &GO_HEADER.replace("BitGauge", "Runhold"))],
            false,
        ),
        case(
            "shell script with the header",
            &[("scripts/a.sh", SHELL_HEADER)],
            true,
        ),
        case(
            "shell script without a header",
            &[("scripts/a.sh", "#!/usr/bin/env bash\necho\n")],
            false,
        ),
        case(
            "typescript without a header",
            &[("web/src/engine/clock.ts", "export {}\n")],
            false,
        ),
        case(
            "vue without a header",
            &[("web/src/App.vue", "<template></template>\n")],
            false,
        ),
        case(
            "dockerfile without a header",
            &[("deployments/docker/Dockerfile", "FROM scratch\n")],
            false,
        ),
        case(
            "local make fragment, no header",
            &[(".mk/verify.mk", "x:\n")],
            false,
        ),
        case(
            "rust file with the header",
            &[("src/lib.rs", &format!("{RUST_HEADER}//! x\n"))],
            true,
        ),
        case(
            "rust file without a header",
            &[("src/lib.rs", "//! x\n")],
            false,
        ),
        case(
            "rust file, exact provenance",
            &[("meta/src/repo.rs", &format!("{RUST_HEADER}{PROVENANCE}"))],
            true,
        ),
        case(
            "rust file, provenance no commit",
            &[(
                "meta/src/repo.rs",
                &format!(
                    "{RUST_HEADER}// Adapted from swarm-scheduler-exporter/meta/src/repo.rs, MIT\n"
                ),
            )],
            false,
        ),
        case(
            "rust file, provenance no license",
            &[(
                "meta/src/repo.rs",
                &format!("{RUST_HEADER}{}", PROVENANCE.replacen(" MIT,", "", 1)),
            )],
            false,
        ),
        case(
            "toml provenance in its own marker",
            &[(
                "Cargo.toml",
                &format!("{TOML_HEADER}{}", PROVENANCE.replacen("//", "#", 1)),
            )],
            true,
        ),
    ]
}

/// The rest of the Go case table: the remaining governed files, the window, and the exemptions.
fn more_cases() -> Vec<HeaderCase> {
    let go = "internal/x/x.go";
    vec![
        case(
            "cargo manifest without a header",
            &[("meta/Cargo.toml", "[package]\n")],
            false,
        ),
        case(
            "clippy config without a header",
            &[("clippy.toml", "msrv = \"1\"\n")],
            false,
        ),
        // The Go side did not move: an unadapted Go file still passes on its header alone.
        case("go file without provenance", &[(go, GO_HEADER)], true),
        case(
            "makefile without a header",
            &[("Makefile", MAKEFILE)],
            false,
        ),
        // GO_HEADER's last required line is its ninth: 16 lines before it put it on line 25, the
        // last line of the window, and one more pushes it out.
        case(
            "header ending on the last line of the window",
            &[(go, &format!("{}{GO_HEADER}", "// filler\n".repeat(16)))],
            true,
        ),
        case(
            "header ending one line past the window",
            &[(go, &format!("{}{GO_HEADER}", "// filler\n".repeat(17)))],
            false,
        ),
        case(
            "untracked file without a header",
            &[("untracked/scratch.go", "package x\n")],
            true,
        ),
        case(
            "bitgauge-authored skill script",
            &[(".agents/skills/server-invariants/x.sh", "echo\n")],
            false,
        ),
        case(
            "upstream make fragment",
            &[(".mk/docker.mk", "x:\n"), (".mk/help.mk", "y:\n")],
            true,
        ),
        case(
            "bootstrap script",
            &[("scripts/bootstrap-mk-common.sh", "#!/bin/sh\n")],
            true,
        ),
        case(
            "generated api types",
            &[("web/src/api/types.gen.ts", "export {}\n")],
            true,
        ),
        case(
            "shadcn component",
            &[("web/src/components/ui/button/Button.vue", "<template/>\n")],
            true,
        ),
        case(
            "vendored skill",
            &[(".agents/skills/fallow/x.sh", "echo\n")],
            true,
        ),
        case("design export", &[("docs/design_system/x.js", "x\n")], true),
        case(
            "markdown and yaml",
            &[("README.md", "# x\n"), ("a.yaml", "a: 1\n")],
            true,
        ),
    ]
}

/// Go: `TestRepositoryHeaders`. The repository passes its own license header check, run with
/// the repository's own git environment: under the commit hook it names the index being
/// committed.
#[test]
fn repository_headers() {
    let problems = HARNESS.check_repository(&meta::repo());
    assert!(problems.is_empty(), "{}", report(&problems));
}

/// Go: `TestHeaderCases`. The check, run on scratch repositories one file kind at a time,
/// rejects each missing, foreign or misplaced header and malformed provenance line, and lets
/// through each exempt, untracked or ungoverned file.
#[test]
fn header_cases() {
    let mut all = cases();
    all.extend(more_cases());
    let problems = HARNESS.run_cases(&meta::repo(), &all);
    assert!(problems.is_empty(), "{}", report(&problems));
}
