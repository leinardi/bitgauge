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

//! The production bans of the root `clippy.toml` may be lifted on a few named items only
//! (`docs/rust-port.md`, Lint Boundary), modeled on swarm-device-access's `unsafe_allowlist`:
//!
//! - `src/healthcheck.rs`: the healthcheck's single connect, the item `connect`;
//! - `src/test_support.rs`: `dial_loopback`, so unit tests can connect; the module is compiled
//!   under `#[cfg(test)]` only;
//! - `tests/support/mod.rs`: `dial_loopback`, for the integration tests;
//! - `src/clock.rs`: the `SystemClock`, only if a wall-clock read is ever needed.
//!
//! The rule is about the lint names: in the `bitgauge` package's Rust files (tracked or new), each
//! mention of one of the three boundary lints must be an item-level
//! `#[expect(clippy::<lint>, reason = "...")]` on an allowlisted item of an allowlisted file, at
//! most once per entry. Any other mention (an `allow`, a crate-level `#![expect]`, a `cfg_attr`,
//! another file or item, even a comment) is refused, so no attribute form this scan does not model
//! can slip past it. The same holds for the lint groups that contain all three (`clippy::style`
//! and `clippy::all`): a group lifted anywhere lifts every ban with it, so the package may not
//! name either at all. The lint names are assembled at compile time, so this file never mentions
//! them itself, and it is not in the scanned package anyway.
//!
//! The scan is rust-common's `repo_meta::allowlist::allowlist_problems` with this package's
//! allowlist, which also refuses an exemption that matches nothing, except the `SystemClock`
//! one, reserved for a wall-clock read the server does not make yet. The test-support module's
//! `#[cfg(test)]` declaration is BitGauge's own rule and stays here.
//!
//! The checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;
use repo_meta::allowlist::{Exemption, LintAllowlist, allowlist_problems};
use repo_meta::{Problem, report, strings};

/// The boundary lints, spelled so that no file contains their names by accident.
const LINTS: [&str; 3] = [
    concat!("disallowed", "_methods"),
    concat!("disallowed", "_macros"),
    concat!("disallowed", "_types"),
];

/// The boundary lints as an attribute names them.
const CLIPPY_LINTS: [&str; 3] = [
    concat!("clippy::disallowed", "_methods"),
    concat!("clippy::disallowed", "_macros"),
    concat!("clippy::disallowed", "_types"),
];

/// The allowed exemptions of the methods ban: the file and the item the expect sits on.
const METHOD_EXEMPTIONS: &[Exemption<'static>] = &[
    Exemption::Item {
        file: "src/healthcheck.rs",
        item: "connect",
        reserved: false,
    },
    Exemption::Item {
        file: "src/test_support.rs",
        item: "dial_loopback",
        reserved: false,
    },
    Exemption::Item {
        file: "tests/support/mod.rs",
        item: "dial_loopback",
        reserved: false,
    },
    Exemption::Item {
        file: "src/clock.rs",
        item: "SystemClock",
        reserved: true,
    },
];

/// Each boundary lint and where it may be lifted: the methods ban on the allowlisted items, the
/// other two nowhere.
const ALLOWLIST: [LintAllowlist<'static>; 3] = [
    LintAllowlist {
        lint: CLIPPY_LINTS[0],
        exemptions: METHOD_EXEMPTIONS,
    },
    LintAllowlist {
        lint: CLIPPY_LINTS[1],
        exemptions: &[],
    },
    LintAllowlist {
        lint: CLIPPY_LINTS[2],
        exemptions: &[],
    },
];

/// The module that only tests may compile.
const TEST_SUPPORT: &str = "src/test_support.rs";

/// The `bitgauge` package's Rust sources: everything Cargo builds for it.
const PACKAGE_PATHSPECS: &[&str] = &[
    "src/*.rs",
    "tests/*.rs",
    "benches/*.rs",
    "examples/*.rs",
    "build.rs",
];

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The clippy lint groups that contain the three boundary lints.
const GROUPS: [&str; 2] = [concat!("clippy::", "style"), concat!("clippy::", "all")];

/// What is wrong with how the files name the boundary lints, if anything. `files` maps each
/// package path to its text.
fn exemption_problems(files: &BTreeMap<String, String>) -> Vec<Problem> {
    allowlist_problems(files, &ALLOWLIST, &GROUPS)
}

/// A declaration of the test-support module, with the attribute lines before it.
static TEST_SUPPORT_DECLARATION: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+test_support\s*;"));

/// What is wrong with how `lib` (the text of `src/lib.rs`) declares the test-support module, if
/// anything: every declaration must follow a `#[cfg(test)]` line.
fn test_support_problems(lib: &str, module_exists: bool) -> Vec<String> {
    let lines: Vec<&str> = lib.lines().collect();
    let declarations: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| TEST_SUPPORT_DECLARATION.is_match(line))
        .map(|(index, _)| index)
        .collect();
    if module_exists && declarations.is_empty() {
        return vec![format!(
            "{TEST_SUPPORT} exists but src/lib.rs does not declare it under #[cfg(test)]"
        )];
    }
    declarations
        .into_iter()
        .filter(|&index| {
            let attributes = lines[..index]
                .iter()
                .rev()
                .take_while(|line| line.trim_start().starts_with("#["));
            !attributes
                .into_iter()
                .any(|line| line.trim() == "#[cfg(test)]")
        })
        .map(|index| {
            format!(
                "src/lib.rs:{}: declares test_support without #[cfg(test)]",
                index + 1
            )
        })
        .collect()
}

fn package_files() -> BTreeMap<String, String> {
    let repo = meta::repo();
    let mut paths = repo.tracked_or_new(PACKAGE_PATHSPECS);
    paths.retain(|path| {
        !path.starts_with("meta/")
            && !path.starts_with("testenv/")
            && std::path::Path::new(path)
                .extension()
                .is_some_and(|extension| extension == "rs")
    });
    paths
        .into_iter()
        .map(|path| {
            let text = repo.read(&path);
            (path, text)
        })
        .collect()
}

#[test]
fn boundary_lints_are_lifted_only_on_allowlisted_items() {
    let files = package_files();
    for required in ["src/lib.rs", "src/main.rs"] {
        assert!(
            files.contains_key(required),
            "the scan did not see {required}: {:?}",
            files.keys()
        );
    }
    let problems = exemption_problems(&files);
    assert!(problems.is_empty(), "{}", report(&problems));
}

#[test]
fn test_support_compiles_only_under_cfg_test() {
    let repo = meta::repo();
    let problems =
        test_support_problems(&repo.read("src/lib.rs"), repo.path(TEST_SUPPORT).is_file());
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

fn files(entries: &[(&str, &str)]) -> BTreeMap<String, String> {
    entries
        .iter()
        .map(|(path, text)| ((*path).to_owned(), (*text).to_owned()))
        .collect()
}

/// The problems of a fixture that holds only some of the package's files, without the unused
/// exemptions of the files it leaves out (`an_unused_exemption_is_refused` covers those).
fn fixture_problems(entries: &[(&str, &str)]) -> Vec<String> {
    strings(&exemption_problems(&files(entries)))
        .into_iter()
        .filter(|problem| !problem.ends_with("matches nothing; remove it"))
        .collect()
}

/// [`fixture_problems`] of one file.
fn case_problems(path: &str, text: &str) -> Vec<String> {
    fixture_problems(&[(path, text)])
}

fn expect_line(lint: &str) -> String {
    format!("#[expect(clippy::{lint}, reason = \"the one exemption\")]")
}

/// The allowlisted exemptions, each once, pass, the reserved one included.
#[test]
fn the_allowlisted_exemptions_pass() {
    let methods = expect_line(LINTS[0]);
    let input = files(&[
        (
            "src/healthcheck.rs",
            &format!("{methods}\nfn connect(address: SocketAddr) {{}}\n"),
        ),
        (
            "src/test_support.rs",
            &format!("/// Dials.\n{methods}\npub(crate) fn dial_loopback() {{}}\n"),
        ),
        (
            "tests/support/mod.rs",
            &format!("{methods}\n#[must_use]\npub async fn dial_loopback() {{}}\n"),
        ),
        (
            "src/clock.rs",
            &format!("{methods}\nimpl Clock for SystemClock {{}}\n"),
        ),
    ]);
    assert_eq!(exemption_problems(&input), []);
}

/// Negative control: an exemption that matches nothing is refused, unless it is the reserved
/// `SystemClock` one; and a scan with no file is refused rather than passed.
#[test]
fn an_unused_exemption_is_refused() {
    let methods = expect_line(LINTS[0]);
    let input = files(&[
        (
            "src/healthcheck.rs",
            &format!("{methods}\nfn connect(address: SocketAddr) {{}}\n"),
        ),
        (
            "src/test_support.rs",
            &format!("{methods}\npub(crate) fn dial_loopback() {{}}\n"),
        ),
    ]);
    assert_eq!(
        strings(&exemption_problems(&input)),
        [format!(
            "tests/support/mod.rs: the exemption for {} on dial_loopback matches nothing; \
             remove it",
            CLIPPY_LINTS[0]
        )]
    );
    assert_eq!(
        strings(&exemption_problems(&BTreeMap::new())),
        ["no file to scan; the allowlist check would pass on nothing"]
    );
}

/// Negative control: the same call under an expect in a file the allowlist does not name is
/// refused, and so is every form other than the one accepted.
#[test]
fn an_exemption_outside_the_allowlist_is_refused() {
    let methods = expect_line(LINTS[0]);
    let cases = [
        (
            "src/handlers/upload.rs",
            format!("{methods}\nfn store() {{ std::fs::write(\"x\", \"y\").ok(); }}\n"),
        ),
        (
            "src/healthcheck.rs",
            format!("{methods}\nfn probe() {{}}\n"),
        ),
        (
            "src/healthcheck.rs",
            format!("{}\nfn connect() {{}}\n", expect_line(LINTS[1])),
        ),
        (
            "src/healthcheck.rs",
            format!(
                "#![expect(clippy::{}, reason = \"crate-wide\")]\n",
                LINTS[0]
            ),
        ),
        (
            "src/healthcheck.rs",
            format!(
                "#[allow(clippy::{}, reason = \"no\")]\nfn connect() {{}}\n",
                LINTS[0]
            ),
        ),
        (
            "src/healthcheck.rs",
            format!("#[expect(clippy::{})]\nfn connect() {{}}\n", LINTS[0]),
        ),
        (
            "src/main.rs",
            format!("#![cfg_attr(test, expect(clippy::{}))]\n", LINTS[2]),
        ),
        (
            "src/lib.rs",
            format!("// {} is lifted elsewhere\n", LINTS[0]),
        ),
        (
            "src/lib.rs",
            format!("#![expect({}, reason = \"crate-wide\")]\n", GROUPS[0]),
        ),
        (
            "src/handlers/upload.rs",
            format!(
                "#[expect({}, reason = \"one item\")]\nfn store() {{}}\n",
                GROUPS[1]
            ),
        ),
        (
            "src/healthcheck.rs",
            format!("#[allow({})]\nfn connect() {{}}\n", GROUPS[0]),
        ),
    ];
    for (path, text) in cases {
        let problems = case_problems(path, &text);
        assert_eq!(problems.len(), 1, "{path}:\n{text}\n{problems:?}");
    }
}

/// A group-like name that is not one of the groups (`clippy::all_x`, `clippy::styled`) is not
/// refused for it.
#[test]
fn a_similar_lint_name_is_not_a_group() {
    let text = format!(
        "#[expect({}_x, reason = \"x\")]\n#[expect({}d, reason = \"x\")]\nfn plain() {{}}\n",
        GROUPS[1], GROUPS[0]
    );
    assert_eq!(case_problems("src/lib.rs", &text), Vec::<String>::new());
}

/// An expect that rustfmt wrapped over several lines reads as the one-line form.
#[test]
fn a_wrapped_expect_is_read_whole() {
    let text = format!(
        "#[expect(\n    clippy::{},\n    reason = \"the one exemption\"\n)]\npub(crate) async fn \
         dial_loopback() {{}}\n",
        LINTS[0]
    );
    assert_eq!(
        case_problems("src/test_support.rs", &text),
        Vec::<String>::new()
    );
    let elsewhere = text.replace("dial_loopback", "dial_anywhere");
    let problems = case_problems("src/test_support.rs", &elsewhere);
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert!(
        problems[0].starts_with("src/test_support.rs:1:"),
        "{problems:?}"
    );
}

/// Negative control: a bracket inside a reason does not hide a later exemption by joining the rest
/// of the file into the first attribute.
#[test]
fn a_bracket_in_a_reason_does_not_hide_a_later_exemption() {
    let text = format!(
        "#[expect(\n    clippy::{lint},\n    reason = \"the one exemption (see below\"\n)]\n\
         pub(crate) fn dial_loopback() {{}}\n\n#[expect(clippy::{lint}, reason = \"x\")]\n\
         fn store() {{}}\n",
        lint = LINTS[0]
    );
    let problems = case_problems("src/test_support.rs", &text);
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert!(
        problems[0].starts_with("src/test_support.rs:7:"),
        "{problems:?}"
    );
}

/// Negative control: an allowlisted exemption used twice is refused.
#[test]
fn a_repeated_exemption_is_refused() {
    let methods = expect_line(LINTS[0]);
    let text = format!("{methods}\nfn connect() {{}}\n{methods}\nfn connect() {{}}\n");
    assert_eq!(
        case_problems("src/healthcheck.rs", &text),
        [format!(
            "src/healthcheck.rs: lifts {} on connect 2 times; at most once",
            CLIPPY_LINTS[0]
        )]
    );
}

/// The test-support module declared under `#[cfg(test)]` passes, and so does its absence.
#[test]
fn a_cfg_test_declaration_passes() {
    assert_eq!(
        test_support_problems("#[cfg(test)]\nmod test_support;\n", true),
        Vec::<String>::new()
    );
    assert_eq!(
        test_support_problems(
            "#[cfg(test)]\n#[expect(dead_code, reason = \"x\")]\npub(crate) mod test_support;\n",
            true
        ),
        Vec::<String>::new()
    );
    assert_eq!(
        test_support_problems("pub mod server;\n", false),
        Vec::<String>::new()
    );
}

/// Negative control: the test-support module declared without `#[cfg(test)]`, or present but not
/// declared under it, is refused.
#[test]
fn a_test_support_module_outside_cfg_test_is_refused() {
    assert_eq!(
        test_support_problems("pub mod server;\nmod test_support;\n", true),
        ["src/lib.rs:2: declares test_support without #[cfg(test)]"]
    );
    assert_eq!(
        test_support_problems(
            "#[cfg(feature = \"x\")]\npub(crate) mod test_support;\n",
            true
        ),
        ["src/lib.rs:2: declares test_support without #[cfg(test)]"]
    );
    assert_eq!(
        test_support_problems("pub mod server;\n", true),
        [format!(
            "{TEST_SUPPORT} exists but src/lib.rs does not declare it under #[cfg(test)]"
        )]
    );
}
