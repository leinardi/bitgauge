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

//! The pins of the rust-common crates in the root `Cargo.toml`: every `[workspace.dependencies]`
//! line on the repository names a `vX.Y.Z` tag with `version` equal to its `<major>.<minor>`, and
//! all lines name one tag, so a bump that misses a line, or moves the tag without the version,
//! fails here and not in a build. The check is rust-common's `repo_meta::git_pins`. It is also run
//! on a copy of the manifest with one tag and one version altered, which it must refuse.

use repo_meta::git_pins::{self, RUST_COMMON_URL};
use repo_meta::report;

/// The root manifest as it is.
fn manifest() -> String {
    std::fs::read_to_string(meta::repo().path("Cargo.toml"))
        .unwrap_or_else(|error| panic!("the root Cargo.toml cannot be read: {error}"))
}

#[test]
fn the_rust_common_pins_agree() {
    let problems = git_pins::root_git_pins(&meta::repo(), RUST_COMMON_URL);
    assert!(problems.is_empty(), "{}", report(&problems));
}

#[test]
fn a_mismatched_tag_and_version_are_refused() {
    let original = manifest();
    // The first pin gets another tag, the second a version that is not its tag's major.minor.
    let (tag_from, version_from) = (
        r#"repo-meta = { git = "https://github.com/leinardi/rust-common", tag = "v"#,
        r#"service-kit = { git = "https://github.com/leinardi/rust-common", tag = "v"#,
    );
    let first = original
        .lines()
        .find(|line| line.starts_with(tag_from))
        .expect("the manifest pins repo-meta");
    let second = original
        .lines()
        .find(|line| line.starts_with(version_from))
        .expect("the manifest pins service-kit");
    let changed = original
        .replacen(first, &first.replace("tag = \"v", "tag = \"v9."), 1)
        .replacen(second, &second.replace("version = \"", "version = \"9."), 1);
    assert_ne!(changed, original, "the control's mutation missed");

    let problems = git_pins::git_pins(&[("Cargo.toml", &changed)], RUST_COMMON_URL);
    let text = report(&problems);
    assert!(
        problems.len() >= 2 && text.contains("repo-meta") && text.contains("service-kit"),
        "the altered pins were not both refused:\n{text}"
    );
}
