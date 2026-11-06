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

//! The Markdown documentation, checked offline (ported from `test/docs/`): every relative link and
//! fragment in the project's Markdown resolves, and `docs/features/`, the behavior contract, agrees
//! with itself on the native API names, the upload telemetry keys and a few wire numbers. Pages
//! drift apart one edit at a time, and a broken link or a stale number in the contract is a wrong
//! spec that code then follows.
//!
//! The link check is rust-common's `repo_meta::links::Checker`, the port of the Go checker, run
//! on this repository's own file list: the tracked and new Markdown outside what the project does
//! not author, and `docs/features` walked through its symlinks.
//!
//! Each check is also run on input built to break it, so none passes on nothing.

// A test crate root resolves `mod` against `tests/`, so the helper names its own path.
#[path = "docs/facts.rs"]
mod facts;

use std::collections::BTreeSet;
use std::fs;

use repo_meta::links::{self, Checker};
use repo_meta::{report, strings};

use facts::{FACTS, NATIVE_ENDPOINTS, UPLOAD_KEYS};

/// Markdown the project does not author: the vendored skills (pinned upstream in
/// `skills-lock.json`) and the design export (never hand-edited). The parts of the export that
/// `docs/features` symlinks to are still checked, under their `docs/features` path.
const EXCLUDED_TREES: [&str; 5] = [
    ".agents/skills/fallow/",
    ".agents/skills/vue-best-practices/",
    ".agents/skills/vue-router-best-practices/",
    ".agents/skills/vue-testing-best-practices/",
    "docs/design_system/",
];

/// The product and technical contract the wire facts are checked in.
const FEATURES_DIR: &str = "docs/features";

/// The project's Markdown outside [`EXCLUDED_TREES`], plus whatever `docs/features` reaches
/// through symlinks, as sorted slash-separated paths relative to the root.
fn markdown_files() -> Vec<String> {
    let mut files: BTreeSet<String> = meta::repo()
        .tracked_or_new(&["*.md"])
        .into_iter()
        .filter(|rel| !EXCLUDED_TREES.iter().any(|tree| rel.starts_with(tree)))
        .collect();
    files.extend(feature_files());
    files.into_iter().collect()
}

/// The Markdown under `docs/features`, walked following symlinks, so pages that live in the
/// design export are checked under the path readers use.
fn feature_files() -> Vec<String> {
    let mut files = Vec::new();
    walk(FEATURES_DIR, &mut files);
    files.sort();
    files
}

fn walk(rel: &str, files: &mut Vec<String>) {
    let entries =
        fs::read_dir(meta::repo().path(rel)).unwrap_or_else(|error| panic!("read {rel}: {error}"));
    for entry in entries {
        let entry = entry.unwrap_or_else(|error| panic!("read {rel}: {error}"));
        let child = format!("{rel}/{}", entry.file_name().to_string_lossy());
        // Metadata follows symlinks: a linked directory is walked, a linked page is read.
        let info = fs::metadata(meta::repo().path(&child))
            .unwrap_or_else(|error| panic!("{child}: {error}"));
        if info.is_dir() {
            walk(&child, files);
        } else if info.is_file() && links::is_markdown(&child) {
            files.push(child);
        }
    }
}

/// The link problems of `content` read as the repository file `rel`.
fn link_problems(rel: &str, content: &str) -> Vec<String> {
    strings(&Checker::new(meta::repo().root()).check_text(rel, content))
}

/// The sorted upload telemetry key set.
fn wanted_upload_keys() -> Vec<String> {
    let mut want: Vec<String> = UPLOAD_KEYS.iter().map(|key| (*key).to_owned()).collect();
    want.sort();
    want
}

/// Go: `TestRelativeLinksResolve`. Every relative link and fragment in the project's Markdown
/// resolves.
#[test]
fn relative_links_resolve() {
    let repo = meta::repo();
    let mut checker = Checker::new(repo.root());
    let files = markdown_files();
    assert!(
        files.iter().any(|rel| rel == "AGENTS.md"),
        "the scan did not see AGENTS.md: {files:?}"
    );
    let problems: Vec<_> = files
        .iter()
        .flat_map(|rel| checker.check_file(rel))
        .collect();
    assert!(problems.is_empty(), "{}", report(&problems));
}

/// Go: `TestNativeAPIPaths`. The contract names no `/api/v1` path beyond the six native ones,
/// and names at least one.
#[test]
fn native_api_paths() {
    let mut problems = Vec::new();
    let mut found = 0;
    for rel in feature_files() {
        let (unknown_paths, count) = facts::api_paths(&meta::repo().read(&rel));
        found += count;
        problems.extend(unknown_paths.into_iter().map(|unknown| {
            format!(
                "{rel} names {unknown}, which is not one of the native endpoints \
                 {NATIVE_ENDPOINTS:?}"
            )
        }));
    }
    assert!(
        found > 0,
        "no /api/v1 path found in {FEATURES_DIR}: the check would pass on nothing"
    );
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestUploadTelemetryShape`. Every upload telemetry object the contract shows has exactly
/// the key set wire-protocol.md section 4 defines, and the contract shows at least one.
#[test]
fn upload_telemetry_shape() {
    let want = wanted_upload_keys();
    let mut problems = Vec::new();
    let mut found = 0;
    for rel in feature_files() {
        for keys in facts::upload_objects(&meta::repo().read(&rel)) {
            found += 1;
            if keys != want {
                problems.push(format!(
                    "{rel} shows upload telemetry with keys {keys:?}, want exactly {want:?}"
                ));
            }
        }
    }
    assert!(
        found > 0,
        "no upload telemetry object found: the check would pass on nothing"
    );
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestFactsAgree`. Each fact holds its one value wherever the contract states it, and is
/// stated at least once.
#[test]
fn facts_agree() {
    let pages: Vec<(String, String)> = feature_files()
        .into_iter()
        .map(|rel| {
            let content = meta::repo().read(&rel);
            (rel, content)
        })
        .collect();
    let mut problems = Vec::new();
    for fact in FACTS.iter() {
        let mut found = 0;
        for (rel, content) in &pages {
            let (mismatches, count) = facts::check_fact(fact, content);
            found += count;
            problems.extend(mismatches.into_iter().map(|mismatch| {
                format!(
                    "{rel}:{}: {} is {}, want {}",
                    mismatch.line, fact.name, mismatch.got, fact.want
                )
            }));
        }
        if found == 0 {
            problems.push(format!(
                "{} ({}) is stated nowhere in {FEATURES_DIR}: reword the pattern, not the check \
                 away",
                fact.name, fact.pattern
            ));
        }
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Go: `TestCheckerFindsBrokenLinks`. On a scratch tree, the link check reports a missing file
/// and a missing anchor, and ignores external links, code spans and fenced blocks.
#[test]
fn checker_finds_broken_links() {
    let scratch = tempfile::tempdir().unwrap_or_else(|error| panic!("temp dir: {error}"));
    let page = [
        "# Title",
        "## 1. Section — `GET /x`",
        "[ok](b.md#heading-two) [ok](#1-section--get-x) [ok](https://example.com/missing)",
        "[broken file](missing.md) [broken anchor](b.md#nope) `[in code](missing-too.md)`",
        "```text",
        "[in a fence](missing-three.md)",
        "```",
    ]
    .join("\n");
    for (name, content) in [("a.md", page.as_str()), ("b.md", "# Heading Two\n")] {
        fs::write(scratch.path().join(name), content)
            .unwrap_or_else(|error| panic!("write {name}: {error}"));
    }
    let got = strings(&Checker::new(scratch.path()).check_file("a.md"));
    assert_eq!(
        got,
        [
            r#"a.md:4: link "missing.md": missing.md does not exist"#,
            r#"a.md:4: link "b.md#nope": b.md has no heading or anchor #nope"#,
        ]
    );
}

/// Negative control on a real page: a copy of `AGENTS.md` passes as is, and fails once with one
/// fragment and one file name broken, while the file on disk stays untouched.
#[test]
fn a_broken_link_in_a_copy_of_a_real_page_is_found() {
    let original = meta::repo().read("AGENTS.md");
    assert_eq!(link_problems("AGENTS.md", &original), Vec::<String>::new());
    let link = "(docs/release.md#how-to-release)";
    assert!(original.contains(link), "AGENTS.md no longer links {link}");
    let broken = original
        .replacen(link, "(docs/release.md#how-to-release-nowhere)", 1)
        .replacen("(docs/features/README.md)", "(docs/featurez/README.md)", 1);
    let problems = link_problems("AGENTS.md", &broken);
    assert!(
        problems.iter().any(|problem| problem.ends_with(
            "link \"docs/release.md#how-to-release-nowhere\": docs/release.md has no heading or \
             anchor #how-to-release-nowhere"
        )),
        "{problems:?}"
    );
    assert!(
        problems.iter().any(|problem| problem.ends_with(
            r#"link "docs/featurez/README.md": docs/featurez/README.md does not exist"#
        )),
        "{problems:?}"
    );
    assert_eq!(problems.len(), 2, "{problems:?}");
}

/// Go: `TestSlug`. The GitHub slug rules the anchors follow.
#[test]
fn slug() {
    let cases = [
        ("1. Test (Home) — `/`", "1-test-home--"),
        ("5. `GET /api/v1/info`", "5-get-apiv1info"),
        ("5.1 Implementation", "51-implementation"),
        (
            "Why the Build Happens Before the Tag",
            "why-the-build-happens-before-the-tag",
        ),
        (
            "11.2 Path A fallback — HTTP probe",
            "112-path-a-fallback--http-probe",
        ),
        ("5. History Module (`idb`)", "5-history-module-idb"),
        (
            "**Bold** and _emphasis_ with snake_case",
            "bold-and-emphasis-with-snake_case",
        ),
        ("[Linked](other.md) heading", "linked-heading"),
        ("2.2 Stateless Server", "22-stateless-server"),
        ("Tags, Moves and `X.Y.Z`", "tags-moves-and-xyz"),
        ("Ünïcode Lëtters Stay", "ünïcode-lëtters-stay"),
        (
            "Required Checks and Fork Pull Requests",
            "required-checks-and-fork-pull-requests",
        ),
        (
            "6. `compat.networkquality.max_upload_bytes`",
            "6-compatnetworkqualitymax_upload_bytes",
        ),
    ];
    let wrong: Vec<String> = cases
        .iter()
        .filter_map(|(heading, want)| {
            let got = links::slug(heading);
            (got != *want).then(|| format!("slug({heading:?}) = {got:?}, want {want:?}"))
        })
        .collect();
    assert!(wrong.is_empty(), "{}", wrong.join("\n"));
}

/// Go: `TestUploadObjectsShorthand`. The `{a, b[], c}` form of the architecture diagram counts as
/// an upload object, and an object without an upload-only key does not.
#[test]
fn upload_objects_shorthand() {
    let objects = facts::upload_objects(
        "200 {epoch, bucketMs, buckets[], bytes} and {\"bucketMs\": 100, \"values\": []}",
    );
    assert_eq!(objects, [["bucketMs", "buckets", "bytes", "epoch"]]);
}

/// Negative control on a real page: a copy of wire-protocol.md with one key renamed, one stray
/// `/api/v1` path and one drifted bucket width fails each contract check.
#[test]
fn drift_in_a_copy_of_the_contract_is_found() {
    let rel = "docs/features/wire-protocol.md";
    let original = meta::repo().read(rel);
    for needle in ["\"firstBucket\":", "\"bucketMs\": 100,"] {
        assert!(
            original.contains(needle),
            "{rel} no longer contains {needle}"
        );
    }
    let drifted = format!(
        "{}\nSee /api/v1/results here\n",
        original
            .replacen("\"firstBucket\":", "\"firstCell\":", 1)
            .replacen("\"bucketMs\": 100,", "\"bucketMs\": 250,", 1)
    );

    let want = wanted_upload_keys();
    assert!(
        facts::upload_objects(&original)
            .iter()
            .all(|keys| *keys == want)
    );
    assert!(
        facts::upload_objects(&drifted)
            .iter()
            .any(|keys| keys.iter().any(|key| key == "firstCell")),
        "the renamed key went unnoticed"
    );

    assert_eq!(facts::api_paths(&original).0, Vec::<String>::new());
    assert_eq!(facts::api_paths(&drifted).0, ["/api/v1/results"]);

    let bucket_ms = FACTS
        .iter()
        .find(|fact| fact.name == "bucketMs in JSON")
        .unwrap_or_else(|| panic!("no bucketMs fact"));
    assert!(facts::check_fact(bucket_ms, &original).0.is_empty());
    let got: Vec<String> = facts::check_fact(bucket_ms, &drifted)
        .0
        .into_iter()
        .map(|mismatch| mismatch.got)
        .collect();
    assert_eq!(got, ["250"]);
}
