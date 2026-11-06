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

//! Drives `scripts/check-dist-urls.sh` against scratch dists, each with the repository's own
//! allowlist: a dist that names only allowed URLs passes, and each kind of URL that must not ship
//! (a CDN, a longer repository name, another path on an allowed host, a WebSocket, a URL inside a
//! binary file, an upper-case scheme, an IPv6 or non-ASCII host), an empty dist and a missing one
//! fail. The script is the gate on the built SPA's URLs, so its refusals are pinned here.

use std::path::{Path, PathBuf};
use std::process::ExitStatus;

use meta::script;
use tempfile::TempDir;

/// The script under test, relative to the root.
const SCRIPT: &str = "scripts/check-dist-urls.sh";

/// The allowlist the script is run with, relative to the root.
const ALLOWLIST: &str = ".dist-url-allowlist";

/// The page of the passing dist: its only reference is a relative one.
const PAGE: &[u8] =
    br#"<!doctype html><html><head><link rel="icon" href="favicon.svg"></head></html>"#;

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

/// Runs the script on `dist` with the repository's allowlist, from a scratch directory, and
/// returns its output and exit status ([`script::run`]).
fn run_check(dist: &Path) -> (String, ExitStatus) {
    let allowlist = meta::repo().path(ALLOWLIST);
    // A missing allowlist would fail every case for the wrong reason.
    std::fs::read(&allowlist).unwrap_or_else(|error| panic!("read {ALLOWLIST}: {error}"));
    let workdir = scratch();
    script::run(SCRIPT, |command| {
        command
            .arg(dist)
            .current_dir(workdir.path())
            .env("DIST_URL_ALLOWLIST", &allowlist);
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
        name: "the namespaces, the license header and the repository pass",
        files: &[
            ("index.html", PAGE),
            (
                "favicon.svg",
                br#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>"#,
            ),
            (
                "assets/index-a1b2.js",
                br#"/* along with BitGauge.  If not, see <http://www.gnu.org/licenses/>. */ const s="https://github.com/leinardi/bitgauge";"#,
            ),
            (
                "assets/about-c3d4.js",
                br#"a="https://github.com/leinardi/bitgauge/blob/main/docs/features/deployment-example.md#2-proxy",b="https://github.com/leinardi/bitgauge?tab=readme"."#,
            ),
            ("assets/worker-e5f6.js", b"self.onmessage=()=>{}"),
        ],
        want: None,
    },
    Case {
        name: "a CDN fails",
        files: &[(
            "index.html",
            br#"<script src="https://cdn.example.com/vue.js"></script>"#,
        )],
        want: Some("index.html: https://cdn.example.com/vue.js is not on the dist URL allowlist"),
    },
    Case {
        name: "a longer name than the repository fails",
        files: &[(
            "assets/index-a1b2.js",
            br#"x="https://github.com/leinardi/bitgauge-fork/x""#,
        )],
        want: Some("https://github.com/leinardi/bitgauge-fork/x is not on the dist URL allowlist"),
    },
    Case {
        name: "another path on an allowed host fails",
        files: &[(
            "assets/index-a1b2.js",
            br#"x="http://www.w3.org/2000/svg/other",y="https://github.com/other""#,
        )],
        want: Some("http://www.w3.org/2000/svg/other is not on the dist URL allowlist"),
    },
    Case {
        name: "a WebSocket URL fails",
        files: &[(
            "assets/worker-e5f6.js",
            b"new WebSocket(`wss://telemetry.example/ws`)",
        )],
        want: Some("wss://telemetry.example/ws is not on the dist URL allowlist"),
    },
    Case {
        name: "a URL inside a binary file fails",
        files: &[(
            "favicon-16.png",
            b"\x89PNG\r\n\x1a\n\x00\x00caBX\x00http://c2pa.org/manifest\x00\xff",
        )],
        want: Some("favicon-16.png: http://c2pa.org/manifest is not on the dist URL allowlist"),
    },
    Case {
        name: "a scheme in upper case fails",
        files: &[(
            "index.html",
            br#"<script src="HTTPS://cdn.example.com/vue.js"></script>"#,
        )],
        want: Some("https://cdn.example.com/vue.js is not on the dist URL allowlist"),
    },
    Case {
        name: "an IPv6 host fails",
        files: &[("assets/index-a1b2.js", br#"x="https://[2001:db8::1]/x""#)],
        want: Some("https://[2001:db8::1]/x is not on the dist URL allowlist"),
    },
    Case {
        name: "a non-ASCII host fails",
        files: &[(
            "assets/index-a1b2.js",
            b"x=\"https://\xc3\xa9vil.example/x\"",
        )],
        want: Some("a URL with characters outside ASCII is not on the dist URL allowlist"),
    },
    Case {
        name: "an empty dist fails",
        files: &[],
        want: Some("holds no file"),
    },
];

/// Go: `TestDistURLs` covers what passes and, as negative controls, each kind of URL that must
/// fail. Every case runs and every failure is reported, as Go's subtests are.
#[test]
fn dist_urls() {
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
                "{}: the failure does not name the URL, wanted {want:?}:\n{output}",
                case.name
            )),
            None | Some(_) => {}
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Go: `TestDistURLsWithoutADist` pins that a missing dist fails rather than passing on nothing.
#[test]
fn dist_urls_without_a_dist() {
    let scratch = scratch();
    let (output, status) = run_check(&scratch.path().join("missing"));
    assert!(
        !status.success() && output.contains("no dist at"),
        "a missing dist did not fail: {status}\n{output}"
    );
}
