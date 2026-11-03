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
//! The scratch repositories run git with an isolated environment: under the commit hook git
//! exports the location of the repository being committed (`GIT_INDEX_FILE` and others), and a
//! `git add` in a scratch repository with that environment would write into the real index.

use std::env;
use std::fs;
use std::num::NonZeroUsize;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

use meta::repo;

const SCRIPT_PATH: &str = "scripts/check-license-headers.sh";

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

/// Marks scratch files that are written but never added: the check reads tracked files only.
const UNTRACKED_PREFIX: &str = "untracked/";

/// The variables that point git at a repository other than the working directory's.
const REPOSITORY_VARS: [&str; 9] = [
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_WORK_TREE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_NAMESPACE",
    "GIT_CEILING_DIRECTORIES",
];

/// A scratch-repository case: its name, its files, and whether the check must accept it.
struct Case {
    name: &'static str,
    files: Vec<(&'static str, String)>,
    pass: bool,
}

fn case(name: &'static str, files: &[(&'static str, &str)], pass: bool) -> Case {
    Case {
        name,
        files: files
            .iter()
            .map(|(path, content)| (*path, (*content).to_owned()))
            .collect(),
        pass,
    }
}

/// The first half of the Go case table, split only to keep each function short.
fn cases() -> Vec<Case> {
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
fn more_cases() -> Vec<Case> {
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

/// `command` without the variables that redirect git and without the user's global and system
/// configuration.
fn isolated(command: &mut Command) -> &mut Command {
    for (name, _) in env::vars_os() {
        let name = name.to_string_lossy();
        if REPOSITORY_VARS.contains(&name.as_ref()) || name.starts_with("GIT_CONFIG") {
            command.env_remove(name.as_ref());
        }
    }
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
}

fn combined(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn git(directory: &Path, args: &[&str]) {
    let output = isolated(Command::new("git").args(args).current_dir(directory))
        .output()
        .unwrap_or_else(|error| panic!("run git {args:?}: {error}"));
    assert!(
        output.status.success(),
        "git {args:?}: {}\n{}",
        output.status,
        combined(&output)
    );
}

/// Creates a git repository at `directory` holding the checker, a Makefile and `files`.
fn scratch_repo(directory: &Path, script: &str, files: &[(&str, String)]) {
    let mut all: Vec<(&str, &str)> = files
        .iter()
        .map(|(path, content)| (*path, content.as_str()))
        .collect();
    all.push((SCRIPT_PATH, script));
    if !files.iter().any(|(path, _)| *path == "Makefile") {
        all.push(("Makefile", MAKEFILE_WITH_HEADER));
    }
    for (name, content) in &all {
        let target = directory.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .unwrap_or_else(|error| panic!("create the directory of {name}: {error}"));
        }
        fs::write(&target, content).unwrap_or_else(|error| panic!("write {name}: {error}"));
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600))
            .unwrap_or_else(|error| panic!("set the mode of {name}: {error}"));
    }
    fs::set_permissions(
        directory.join(SCRIPT_PATH),
        fs::Permissions::from_mode(0o700),
    )
    .unwrap_or_else(|error| panic!("make the checker executable: {error}"));
    git(directory, &["init", "--quiet"]);
    for (name, _) in &all {
        if !name.starts_with(UNTRACKED_PREFIX) {
            git(directory, &["add", "--", name]);
        }
    }
}

/// What is wrong with the check's verdict on `case`, if anything.
fn case_problem(script: &str, case: &Case) -> Option<String> {
    let directory =
        tempfile::tempdir().unwrap_or_else(|error| panic!("create a scratch directory: {error}"));
    scratch_repo(directory.path(), script, &case.files);
    let output =
        isolated(Command::new(directory.path().join(SCRIPT_PATH)).current_dir(directory.path()))
            .output()
            .unwrap_or_else(|error| panic!("run the checker: {error}"));
    let accepted = output.status.success();
    if case.pass && !accepted {
        return Some(format!(
            "{}: rejected, want accepted: {}\n{}",
            case.name,
            output.status,
            combined(&output)
        ));
    }
    if !case.pass && accepted {
        return Some(format!(
            "{}: accepted, want rejected:\n{}",
            case.name,
            combined(&output)
        ));
    }
    None
}

/// Runs `run` on every item, on as many threads as the machine has cores, in item order.
fn parallel_map<T: Sync, R: Send>(items: &[T], run: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let workers = thread::available_parallelism()
        .map_or(1, NonZeroUsize::get)
        .min(items.len());
    let mut results: Vec<(usize, R)> = thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let mut done = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(item) = items.get(index) else {
                            return done;
                        };
                        done.push((index, run(item)));
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|payload| std::panic::resume_unwind(payload))
            })
            .collect()
    });
    results.sort_by_key(|(index, _)| *index);
    results.into_iter().map(|(_, result)| result).collect()
}

/// Go: `TestRepositoryHeaders`. The repository passes its own license header check, run with
/// the repository's own git environment: under the commit hook it names the index being
/// committed.
#[test]
fn repository_headers() {
    let output = Command::new(repo::path(SCRIPT_PATH))
        .current_dir(repo::root())
        .output()
        .unwrap_or_else(|error| panic!("run the checker: {error}"));
    assert!(
        output.status.success(),
        "the repository fails its own license header check: {}\n{}",
        output.status,
        combined(&output)
    );
}

/// Go: `TestHeaderCases`. The check, run on scratch repositories one file kind at a time,
/// rejects each missing, foreign or misplaced header and malformed provenance line, and lets
/// through each exempt, untracked or ungoverned file.
#[test]
fn header_cases() {
    let script = repo::read(SCRIPT_PATH);
    let mut all = cases();
    all.extend(more_cases());
    let problems: Vec<String> = parallel_map(&all, |case| case_problem(&script, case))
        .into_iter()
        .flatten()
        .collect();
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}
