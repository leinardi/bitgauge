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

//! The test-support module (`src/test_support.rs`) is compiled by tests only: `src/lib.rs`
//! declares it under `#[cfg(test)]`, so its loopback dial (a production ban lifted for tests) can
//! never reach a release build. The check is a function of the text of `src/lib.rs`, and is also
//! run on input built to break it.

use std::sync::LazyLock;

use regex::Regex;

/// The module that only tests may compile.
const TEST_SUPPORT: &str = "src/test_support.rs";

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
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

#[test]
fn test_support_compiles_only_under_cfg_test() {
    let repo = meta::repo();
    let problems =
        test_support_problems(&repo.read("src/lib.rs"), repo.path(TEST_SUPPORT).is_file());
    assert!(problems.is_empty(), "{}", problems.join("\n"));
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
