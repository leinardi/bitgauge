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

//! Drives `scripts/check-chunk-size.sh` against scratch dists and budgets: a Worker chunk within
//! the budget passes, and a chunk over it, a missing or doubled Worker chunk and a budget file
//! that is not exactly one number of bytes fail. The script holds the Worker chunk to its budget,
//! so each way it must refuse is pinned here.

use std::process::ExitStatus;

use meta::script;
use tempfile::TempDir;

/// The script under test, relative to the root.
const SCRIPT: &str = "scripts/check-chunk-size.sh";

/// The budget of most cases: a comment, then 1000 bytes.
const BUDGET: &str = "# a comment\n1000\n";

/// Writes a dist with `chunks` (file name to size in bytes) under `assets/` and a budget file,
/// runs the script on them from the scratch directory, and returns its output and exit status
/// ([`script::run`]).
fn run_check(chunks: &[(&str, usize)], budget: &str) -> (String, ExitStatus) {
    let scratch =
        TempDir::new().unwrap_or_else(|error| panic!("create a scratch directory: {error}"));
    let dir = scratch.path();
    let dist = dir.join("dist");
    let assets: Vec<(String, Vec<u8>)> = chunks
        .iter()
        .map(|(name, size)| (format!("assets/{name}"), "x".repeat(*size).into_bytes()))
        .collect();
    let mut files: Vec<(&str, &[u8])> = vec![("index.html", b"<!doctype html>")];
    files.extend(
        assets
            .iter()
            .map(|(name, content)| (name.as_str(), content.as_slice())),
    );
    script::write_files(&dist, &files);
    let budget_file = dir.join(".chunk-budget");
    script::write_files(dir, &[(".chunk-budget", budget.as_bytes())]);
    script::run(SCRIPT, |command| {
        command
            .arg(&dist)
            .current_dir(dir)
            .env("CHUNK_BUDGET", &budget_file);
    })
}

/// One scratch dist and budget, and what the check must say about them.
struct Case {
    name: &'static str,
    chunks: &'static [(&'static str, usize)],
    budget: &'static str,
    /// What the failure must contain; `None` for a dist that must pass.
    want: Option<&'static str>,
}

const CASES: &[Case] = &[
    Case {
        name: "a chunk within the budget passes",
        chunks: &[("worker-a1b2.js", 1000), ("index-c3d4.js", 5000)],
        budget: BUDGET,
        want: None,
    },
    Case {
        name: "a chunk over the budget fails",
        chunks: &[("worker-a1b2.js", 1001)],
        budget: BUDGET,
        want: Some("is 1001 bytes, over the budget of 1000"),
    },
    Case {
        name: "a dist without a Worker chunk fails",
        chunks: &[("index-c3d4.js", 10)],
        budget: BUDGET,
        want: Some("no Worker chunk"),
    },
    Case {
        name: "a dist without assets fails",
        chunks: &[],
        budget: BUDGET,
        want: Some("no Worker chunk"),
    },
    Case {
        name: "two Worker chunks fail",
        chunks: &[("worker-a1b2.js", 10), ("worker-e5f6.js", 10)],
        budget: BUDGET,
        want: Some("2 Worker chunks"),
    },
    Case {
        name: "a budget that is not a number fails",
        chunks: &[("worker-a1b2.js", 10)],
        budget: "128 KiB\n",
        want: Some("not a number of bytes"),
    },
    Case {
        name: "an empty budget fails",
        chunks: &[("worker-a1b2.js", 10)],
        budget: "# nothing\n",
        want: Some("holds no number"),
    },
    Case {
        name: "two budgets fail",
        chunks: &[("worker-a1b2.js", 10)],
        budget: "1000\n2000\n",
        want: Some("more than one number"),
    },
];

/// Go: `TestChunkSize` covers the budget held and, as negative controls, each way the check must
/// fail. Every case runs and every failure is reported, as Go's subtests are.
#[test]
fn chunk_size() {
    let mut failures = Vec::new();
    for case in CASES {
        let (output, status) = run_check(case.chunks, case.budget);
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
                "{}: the failure does not say why, wanted {want:?}:\n{output}",
                case.name
            )),
            None | Some(_) => {}
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
