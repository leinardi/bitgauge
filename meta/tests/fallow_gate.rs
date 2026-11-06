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

//! The fallow dead-code gate: `web/package.json` pins fallow to an exact version, and the
//! committed regression baseline was written by that version. Fallow's findings change between
//! releases, so a baseline from another one either forgives issues nobody reviewed or fails a
//! tree nobody changed, and a range lets two checkouts disagree about what the baseline means.

use std::collections::BTreeMap;

use regex::Regex;
use serde::Deserialize;

/// Holds fallow's per-issue-type counts and the version that wrote them.
const REGRESSION_BASELINE_FILE: &str = ".fallow-regression-baseline.json";

/// The part of `web/package.json` this test reads.
#[derive(Deserialize)]
struct Manifest {
    #[serde(default, rename = "devDependencies")]
    dev_dependencies: Option<BTreeMap<String, String>>,
}

/// The fallow version `web/package.json` pins, failing when it is missing or a range.
fn pinned_fallow_version() -> String {
    let manifest: Manifest = serde_json::from_str(&meta::repo().read("web/package.json"))
        .unwrap_or_else(|error| panic!("parse web/package.json: {error}"));
    let Some(version) = manifest
        .dev_dependencies
        .and_then(|dependencies| dependencies.get("fallow").cloned())
    else {
        panic!(
            "web/package.json does not list fallow as a devDependency, so the hook has no binary \
             of its own to run"
        );
    };
    // RE2's ASCII \d, spelled out: Rust's \d is Unicode-aware.
    let exact =
        Regex::new(r"^[0-9]+\.[0-9]+\.[0-9]+$").unwrap_or_else(|error| panic!("pattern: {error}"));
    assert!(
        exact.is_match(&version),
        "fallow is pinned as {version:?} rather than an exact version: a range lets two checkouts \
         run different analyzers against the same baseline"
    );
    version
}

/// Go: `TestFallowBaselineMatchesThePinnedVersion`. The `fallow_version` that
/// `.fallow-regression-baseline.json` records is the exact version `web/package.json` pins.
#[test]
fn fallow_baseline_matches_the_pinned_version() {
    // Decoded as a map rather than a struct: the key is fallow's, in fallow's spelling.
    let baseline: BTreeMap<String, serde_json::Value> =
        serde_json::from_str(&meta::repo().read(REGRESSION_BASELINE_FILE))
            .unwrap_or_else(|error| panic!("parse {REGRESSION_BASELINE_FILE}: {error}"));
    let Some(written_by) = baseline
        .get("fallow_version")
        .and_then(serde_json::Value::as_str)
    else {
        panic!("{REGRESSION_BASELINE_FILE} does not record the fallow version that wrote it");
    };
    let pinned = pinned_fallow_version();
    assert_eq!(
        written_by, pinned,
        "{REGRESSION_BASELINE_FILE} was written by fallow {written_by} but the hook runs \
         {pinned}; regenerate both baselines with the commands in the web-fallow hook's comment"
    );
}
