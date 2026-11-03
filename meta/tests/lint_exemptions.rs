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
//! The checks are functions of the text, and each is also run on input built to break it.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use meta::repo;
use regex::Regex;

/// The boundary lints, spelled so that no file contains their names by accident.
const LINTS: [&str; 3] = [
    concat!("disallowed", "_methods"),
    concat!("disallowed", "_macros"),
    concat!("disallowed", "_types"),
];

/// The allowed exemptions: file, lint and the name of the item the expect sits on.
const ALLOWLIST: &[(&str, &str, &str)] = &[
    ("src/healthcheck.rs", LINTS[0], "connect"),
    ("src/test_support.rs", LINTS[0], "dial_loopback"),
    ("tests/support/mod.rs", LINTS[0], "dial_loopback"),
    ("src/clock.rs", LINTS[0], "SystemClock"),
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

/// A lint group that contains the boundary lints, as a whole path.
static GROUP_WORD: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"(?:^|[^A-Za-z0-9_:])(?:{})\b",
        GROUPS.map(regex::escape).join("|")
    ))
});

/// Any boundary lint name as a whole word.
static LINT_WORD: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"\b(?:{})\b", LINTS.join("|"))));

/// The one accepted form, on a line of its own: an item-level expect of one lint with a reason.
static ITEM_EXPECT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r#"^\s*#\[expect\(\s*clippy::({})\s*,\s*reason\s*=\s*"[^"]+"\s*\)\]\s*$"#,
        LINTS.join("|")
    ))
});

/// The name an item line declares: a function, a type, or the type an `impl` block is for.
static ITEM_NAME: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:(?:const|async|unsafe)\s+)*(?:fn|struct|enum|type|static|const)\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*impl(?:<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_:<>]*\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)",
    )
});

/// The text as logical lines, each with its first line's number: an attribute that rustfmt wrapped
/// over several lines (`#[expect(` ... `)]`) is joined into one, so it reads as it would unwrapped.
fn logical_lines(text: &str) -> Vec<(usize, String)> {
    let mut joined: Vec<(usize, String)> = Vec::new();
    let mut open: Option<(usize, String, i32)> = None;
    for (index, line) in text.lines().enumerate() {
        if let Some((number, mut attribute, depth)) = open.take() {
            attribute.push(' ');
            attribute.push_str(line.trim());
            let depth = depth + bracket_depth(line);
            if depth > 0 {
                open = Some((number, attribute, depth));
            } else {
                joined.push((number, attribute));
            }
            continue;
        }
        let trimmed = line.trim_start();
        let depth = bracket_depth(line);
        if (trimmed.starts_with("#[") || trimmed.starts_with("#![")) && depth > 0 {
            open = Some((index + 1, line.trim_end().to_owned(), depth));
        } else {
            joined.push((index + 1, line.to_owned()));
        }
    }
    if let Some((number, attribute, _)) = open {
        joined.push((number, attribute));
    }
    joined
}

/// How many more square brackets and parentheses a line opens than it closes, outside string
/// literals: a bracket inside a `reason = "..."` does not count.
fn bracket_depth(line: &str) -> i32 {
    let mut depth = 0;
    let mut in_string = false;
    let mut escaped = false;
    for character in line.chars() {
        if in_string {
            match character {
                _ if escaped => escaped = false,
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match character {
            '"' => in_string = true,
            '[' | '(' => depth += 1,
            ']' | ')' => depth -= 1,
            _ => {}
        }
    }
    depth
}

/// The item the attribute on line `index` applies to: the first following line that is neither
/// an attribute, a comment nor blank.
fn item_after(lines: &[&str], index: usize) -> Option<String> {
    lines.iter().skip(index + 1).find_map(|line| {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with("#[") || trimmed.starts_with("//") {
            return None;
        }
        Some(
            ITEM_NAME
                .captures(line)
                .and_then(|found| found.get(1).or_else(|| found.get(2)))
                .map_or_else(String::new, |name| name.as_str().to_owned()),
        )
    })
}

/// What is wrong with how the files name the boundary lints, if anything. `files` maps each
/// package path to its text.
fn exemption_problems(files: &BTreeMap<String, String>) -> Vec<String> {
    let mut problems = Vec::new();
    let mut used: BTreeMap<(&str, &str, &str), usize> = BTreeMap::new();
    for (path, text) in files {
        let logical = logical_lines(text);
        let lines: Vec<&str> = logical.iter().map(|(_, line)| line.as_str()).collect();
        for (index, line) in lines.iter().enumerate() {
            let number = logical[index].0;
            if GROUP_WORD.is_match(line) {
                problems.push(format!(
                    "{path}:{number}: names a clippy lint group that contains the boundary lints \
                     ({GROUPS:?}); lifting it lifts every ban"
                ));
                continue;
            }
            if !LINT_WORD.is_match(line) {
                continue;
            }
            let Some(expect) = ITEM_EXPECT.captures(line) else {
                problems.push(format!(
                    "{path}:{number}: names a boundary lint outside an item-level \
                     #[expect(clippy::<lint>, reason = \"...\")] line"
                ));
                continue;
            };
            let lint = expect.get(1).map_or("", |found| found.as_str());
            let item = item_after(&lines, index).unwrap_or_default();
            let entry = ALLOWLIST.iter().find(|(file, allowed_lint, allowed_item)| {
                file == path && *allowed_lint == lint && *allowed_item == item
            });
            match entry {
                Some(&key) => *used.entry(key).or_default() += 1,
                None => problems.push(format!(
                    "{path}:{number}: lifts {lint} on {item:?}, which the allowlist does not \
                     name; the allowed exemptions are {ALLOWLIST:?}"
                )),
            }
        }
    }
    for ((path, lint, item), count) in used {
        if count > 1 {
            problems.push(format!(
                "{path}: lifts {lint} on {item} {count} times; at most once"
            ));
        }
    }
    problems
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
    let mut paths = repo::tracked_or_new(PACKAGE_PATHSPECS);
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
            let text = repo::read(&path);
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
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

#[test]
fn test_support_compiles_only_under_cfg_test() {
    let problems = test_support_problems(
        &repo::read("src/lib.rs"),
        repo::path(TEST_SUPPORT).is_file(),
    );
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

fn files(entries: &[(&str, &str)]) -> BTreeMap<String, String> {
    entries
        .iter()
        .map(|(path, text)| ((*path).to_owned(), (*text).to_owned()))
        .collect()
}

fn expect_line(lint: &str) -> String {
    format!("#[expect(clippy::{lint}, reason = \"the one exemption\")]")
}

/// The allowlisted exemptions, each once, pass.
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
    assert_eq!(exemption_problems(&input), Vec::<String>::new());
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
        let problems = exemption_problems(&files(&[(path, &text)]));
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
    assert_eq!(
        exemption_problems(&files(&[("src/lib.rs", &text)])),
        Vec::<String>::new()
    );
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
        exemption_problems(&files(&[("src/test_support.rs", &text)])),
        Vec::<String>::new()
    );
    let elsewhere = text.replace("dial_loopback", "dial_anywhere");
    let problems = exemption_problems(&files(&[("src/test_support.rs", &elsewhere)]));
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
    let problems = exemption_problems(&files(&[("src/test_support.rs", &text)]));
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
    let problems = exemption_problems(&files(&[("src/healthcheck.rs", &text)]));
    assert_eq!(
        problems,
        [format!(
            "src/healthcheck.rs: lifts {} on connect 2 times; at most once",
            LINTS[0]
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
