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

//! The behavior contract, checked offline (ported from `test/docs/`): `docs/features/` agrees with
//! itself on the native API names, the upload telemetry keys and a few wire numbers. Pages drift
//! apart one edit at a time, and a stale number in the contract is a wrong spec that code then
//! follows. The links and fragments of the Markdown are the lychee hook's (lychee.toml).
//!
//! Each check is also run on input built to break it, so none passes on nothing.

// A test crate root resolves `mod` against `tests/`, so the helper names its own path.
#[path = "docs/facts.rs"]
mod facts;

use std::fs;
use std::path::Path;

use facts::{FACTS, NATIVE_ENDPOINTS, UPLOAD_KEYS};

/// The product and technical contract the wire facts are checked in.
const FEATURES_DIR: &str = "docs/features";

/// The Markdown under `docs/features`, walked following symlinks, so pages that live in the
/// design export are checked under the path readers use.
fn feature_files() -> Vec<String> {
    let mut files = Vec::new();
    walk(FEATURES_DIR, &mut files);
    files.sort();
    files
}

/// Whether `rel` names a Markdown page.
fn is_markdown(rel: &str) -> bool {
    Path::new(rel)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
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
        } else if info.is_file() && is_markdown(&child) {
            files.push(child);
        }
    }
}

/// The sorted upload telemetry key set.
fn wanted_upload_keys() -> Vec<String> {
    let mut want: Vec<String> = UPLOAD_KEYS.iter().map(|key| (*key).to_owned()).collect();
    want.sort();
    want
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
