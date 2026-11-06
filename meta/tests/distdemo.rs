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

//! Drives `scripts/check-dist-demo-free.sh` against scratch dists: a clean one passes, and each
//! demo sentinel, a missing dist and an empty one fail. A dist holding the demo's own sources
//! fails too, so a sentinel that no longer matches the demo is noticed: the script is what keeps
//! the demo out of a production build, and it is only as good as its sentinels.

use std::path::{Path, PathBuf};
use std::process::ExitStatus;

use meta::script;
use tempfile::TempDir;

/// The script under test, relative to the root.
const SCRIPT: &str = "scripts/check-dist-demo-free.sh";

fn scratch() -> TempDir {
    TempDir::new().unwrap_or_else(|error| panic!("create a scratch directory: {error}"))
}

/// Writes a scratch dist from relative paths to contents and returns its directory, which lives
/// as long as the returned guard.
fn write_dist(files: &[(&str, &[u8])]) -> (TempDir, PathBuf) {
    let scratch = scratch();
    let dir = scratch.path().join("dist");
    std::fs::create_dir_all(&dir).unwrap_or_else(|error| panic!("create the dist: {error}"));
    script::write_files(&dir, files);
    (scratch, dir)
}

/// Runs the script on `dist` from a scratch directory and returns its output and exit status
/// ([`script::run`]).
fn run_check(dist: &Path) -> (String, ExitStatus) {
    let workdir = scratch();
    script::run(SCRIPT, |command| {
        command.arg(dist).current_dir(workdir.path());
    })
}

/// One scratch dist and what the check must say about it.
struct Case {
    name: &'static str,
    files: &'static [(&'static str, &'static [u8])],
    /// What the failure must contain; `None` for a dist that must pass.
    want: Option<&'static str>,
}

const CASES: &[Case] = &[
    Case {
        name: "a production dist passes",
        files: &[
            (
                "index.html",
                br#"<!doctype html><meta name="bitgauge-base-path" content="/">"#,
            ),
            (
                "assets/index-a1b2.js",
                br#"const theme="bitgauge-theme";new Worker(new URL("worker-e5f6.js",import.meta.url))"#,
            ),
            ("assets/worker-e5f6.js", b"self.onmessage=()=>{}"),
            ("assets/demo-notes.txt", b"a demonstration"),
            ("favicon-16.png", b"\x89PNG\r\n\x1a\n\x00\x00\xff"),
            ("assets/index-c3d4.css", b".demo-free{}"),
            ("assets/NotAvailable.js", br#"x="Basement""#),
        ],
        want: None,
    },
    Case {
        name: "the panel's storage key fails",
        files: &[(
            "assets/DemoPanel-a1b2.js",
            br#"localStorage.getItem("bitgauge-demo")"#,
        )],
        want: Some("assets/DemoPanel-a1b2.js: contains the demo sentinel bitgauge-demo"),
    },
    Case {
        name: "the scenario table fails",
        files: &[("assets/index-a1b2.js", b"const DEMO_SCENARIOS={}")],
        want: Some("contains the demo sentinel DEMO_SCENARIOS"),
    },
    Case {
        name: "the fixture server fails",
        files: &[("assets/worker-e5f6.js", br#"{name:"Basement NAS"}"#)],
        want: Some("assets/worker-e5f6.js: contains the demo sentinel Basement NAS"),
    },
    Case {
        name: "the demo Worker's path fails",
        files: &[(
            "assets/index-a1b2.js.map",
            br#"{"sources":["../src/demo/worker.ts"]}"#,
        )],
        want: Some("contains the demo sentinel demo/worker"),
    },
    Case {
        name: "a sentinel inside a binary file fails",
        files: &[("assets/blob.bin", b"\x00\xffBasement NAS\x00")],
        want: Some("assets/blob.bin: contains the demo sentinel Basement NAS"),
    },
    Case {
        name: "an empty dist fails",
        files: &[],
        want: Some("holds no file"),
    },
];

/// Go: `TestDistDemoFree` covers what passes and, as negative controls, each sentinel and an
/// empty dist. Every case runs and every failure is reported, as Go's subtests are.
#[test]
fn dist_demo_free() {
    let mut failures = Vec::new();
    for case in CASES {
        let (_dist_guard, dist) = write_dist(case.files);
        let (output, status) = run_check(&dist);
        match case.want {
            None if !status.success() => failures.push(format!(
                "{}: the check failed but should not have: {status}\n{output}",
                case.name
            )),
            Some(_) if status.success() => failures.push(format!(
                "{}: the check passed but should not have:\n{output}",
                case.name
            )),
            Some(want) if !output.contains(want) => failures.push(format!(
                "{}: the failure does not name the sentinel, wanted {want:?}:\n{output}",
                case.name
            )),
            None | Some(_) => {}
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Go: `TestDistDemoFreeWithoutADist` pins that a missing dist fails rather than passing on
/// nothing.
#[test]
fn dist_demo_free_without_a_dist() {
    let scratch = scratch();
    let (output, status) = run_check(&scratch.path().join("missing"));
    assert!(
        !status.success() && output.contains("no dist at"),
        "a missing dist did not fail: {status}\n{output}"
    );
}

/// Go: `TestDistDemoFreeCatchesTheDemoSources` runs the check on the demo's own panel, its
/// stored choice, its fixtures and its scenarios: the sentinels must still name what the demo is
/// made of, or a demo build could pass.
#[test]
fn dist_demo_free_catches_the_demo_sources() {
    let sources = [
        "web/src/demo/DemoPanel.vue",
        "web/src/demo/choice.ts",
        "web/src/demo/fixtures.ts",
        "web/src/demo/scenarios.ts",
    ]
    .map(|relative| {
        let name = relative.rsplit('/').next().unwrap_or(relative);
        let content = std::fs::read(meta::repo().path(relative))
            .unwrap_or_else(|error| panic!("read {relative}: {error}"));
        (name, content)
    });
    let files = sources
        .iter()
        .map(|(name, content)| (*name, content.as_slice()))
        .collect::<Vec<_>>();
    let (_dist_guard, dist) = write_dist(&files);
    let (output, status) = run_check(&dist);
    assert!(
        !status.success(),
        "the demo's sources passed the check:\n{output}"
    );
    let missing = [
        "DemoPanel.vue: contains the demo sentinel DEMO_SCENARIOS",
        "choice.ts: contains the demo sentinel bitgauge-demo",
        "fixtures.ts: contains the demo sentinel Basement NAS",
        "scenarios.ts: contains the demo sentinel DEMO_SCENARIOS",
    ]
    .into_iter()
    .filter(|want| !output.contains(want))
    .collect::<Vec<_>>();
    assert!(
        missing.is_empty(),
        "the check did not report {missing:?}:\n{output}"
    );
}
