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

//! The npm install policy: an unreviewed dependency install script fails the install, and
//! `web/package.json`'s `allowScripts` records a decision for exactly the locked packages that
//! carry one, on every platform. Without the first the decisions are advisory; without the second
//! a platform-specific optional dependency passes on Linux and refuses `npm install` on a Mac.

use std::collections::{BTreeMap, BTreeSet};

use regex::Regex;
use serde::Deserialize;

/// The part of `web/package.json` this test reads.
#[derive(Deserialize)]
struct Manifest {
    #[serde(default, rename = "allowScripts")]
    allow_scripts: Option<BTreeMap<String, bool>>,
}

/// The part of `web/package-lock.json` this test reads.
#[derive(Deserialize)]
struct Lockfile {
    #[serde(default)]
    packages: Option<BTreeMap<String, LockedPackage>>,
}

#[derive(Deserialize)]
struct LockedPackage {
    #[serde(default)]
    version: Option<String>,
    #[serde(default, rename = "hasInstallScript")]
    has_install_script: Option<bool>,
}

/// Go: `TestNpmInstallFailsOnUnreviewedScripts`. `web/.npmrc` sets `strict-allow-scripts=true`,
/// which turns an unreviewed dependency install script from a warning into a failed install.
#[test]
fn npm_install_fails_on_unreviewed_scripts() {
    let npmrc = meta::repo().read("web/.npmrc");
    // RE2's ASCII \s, spelled out: Rust's \s is Unicode-aware.
    let pattern =
        Regex::new(r"(?m)^strict-allow-scripts[\t\n\f\r ]*=[\t\n\f\r ]*true[\t\n\f\r ]*$")
            .unwrap_or_else(|error| panic!("pattern: {error}"));
    assert!(
        pattern.is_match(&npmrc),
        "web/.npmrc does not set strict-allow-scripts=true:\n{npmrc}"
    );
}

/// Go: `TestEveryLockedInstallScriptIsReviewed`. Every package the lockfile marks with
/// `hasInstallScript` (the root entry excepted) has an `allowScripts` entry, bare or at its exact
/// locked version, and every entry matches such a package. A range is refused, since this test
/// cannot evaluate one.
#[test]
fn every_locked_install_script_is_reviewed() {
    let manifest: Manifest = serde_json::from_str(&meta::repo().read("web/package.json"))
        .unwrap_or_else(|error| panic!("parse web/package.json: {error}"));
    let lockfile: Lockfile = serde_json::from_str(&meta::repo().read("web/package-lock.json"))
        .unwrap_or_else(|error| panic!("parse web/package-lock.json: {error}"));
    let allow_scripts = manifest.allow_scripts.unwrap_or_default();
    let mut used = BTreeSet::new();
    let mut problems = Vec::new();
    for (path, package) in lockfile.packages.unwrap_or_default() {
        // The root entry is the project itself, whose own scripts allowScripts does not govern.
        if package.has_install_script != Some(true) || path.is_empty() {
            continue;
        }
        // A nested copy sits at node_modules/a/node_modules/b; the name is the last segment, which
        // keeps a scope intact. A workspace or link entry has no node_modules/ in its key; it is a
        // local folder, named by its path, and needs an allowScripts entry like any other.
        let name = path.rfind("node_modules/").map_or(path.as_str(), |index| {
            &path[index + "node_modules/".len()..]
        });
        let version = package.version.unwrap_or_default();
        let pinned = format!("{name}@{version}");
        if allow_scripts.contains_key(name) {
            used.insert(name.to_owned());
        } else if allow_scripts.contains_key(&pinned) {
            used.insert(pinned);
        } else {
            problems.push(format!(
                "{name}@{version} has an install script and no allowScripts entry in \
                 web/package.json: review it, then record the decision with npm install-scripts \
                 approve|deny {name}"
            ));
        }
    }
    for entry in allow_scripts.keys() {
        if !used.contains(entry) {
            problems.push(format!(
                "allowScripts entry {entry:?} in web/package.json matches no locked package with \
                 an install script: drop it (npm install-scripts prune), or name the package \
                 bare or at its exact locked version"
            ));
        }
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}
