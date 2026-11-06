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

//! The dependencies point inwards (backend.md section 1): the compatibility layers in
//! `src/compat/` use the shared building blocks (`src/handlers`, `src/ratelimit`, `src/clientip`),
//! never the reverse. No lint enforces the direction and the three are modules of one crate, so
//! where Go read the package graph with `go list -deps`, this scans the building blocks' sources,
//! their tests included, for any path to the `compat` module: `crate::compat` (or `$crate::`), a
//! `super::` path ending in it, `bitgauge::compat`, or a `use` tree that names it. Comments are
//! stripped first, so a doc comment may still mention the layers; `config.compat`, the
//! configuration's field, is no path and stays allowed.

use std::sync::LazyLock;

use regex::Regex;

/// The building blocks: each module file and the directory of its submodules.
const BUILDING_BLOCKS: [&str; 3] = ["handlers", "ratelimit", "clientip"];

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// A path through the crate root, a parent module or the library's name to `compat`.
static COMPAT_PATH: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"\b(?:crate|bitgauge|super)\s*::\s*(?:super\s*::\s*)*compat\b"));

/// A `use` declaration, up to its semicolon.
static USE_DECLARATION: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?s)\buse\s+[^;]*;"));

/// The word `compat` as a path segment of a `use` tree.
static COMPAT_WORD: LazyLock<Regex> = LazyLock::new(|| pattern(r"\bcompat\b"));

/// The text without its comments: `//` to the end of the line, and `/* */` blocks, nested ones
/// included. String literals are kept, so a path spelled in one is refused too.
fn without_comments(text: &str) -> String {
    let mut kept = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut depth = 0_usize;
    while let Some(current) = chars.next() {
        let next = chars.peek().copied();
        if depth > 0 {
            if current == '*' && next == Some('/') {
                chars.next();
                depth -= 1;
            } else if current == '/' && next == Some('*') {
                chars.next();
                depth += 1;
            } else if current == '\n' {
                kept.push('\n');
            }
            continue;
        }
        if current == '/' && next == Some('/') {
            for skipped in chars.by_ref() {
                if skipped == '\n' {
                    kept.push('\n');
                    break;
                }
            }
        } else if current == '/' && next == Some('*') {
            chars.next();
            depth = 1;
        } else {
            kept.push(current);
        }
    }
    kept
}

/// The paths to the `compat` module that `text` spells, as found.
fn compat_paths(text: &str) -> Vec<String> {
    let code = without_comments(text);
    let mut found: Vec<String> = COMPAT_PATH
        .find_iter(&code)
        .map(|found| found.as_str().to_owned())
        .collect();
    found.extend(
        USE_DECLARATION
            .find_iter(&code)
            .filter(|declaration| COMPAT_WORD.is_match(declaration.as_str()))
            .map(|declaration| declaration.as_str().to_owned()),
    );
    found
}

/// The building blocks' Rust files: `src/<block>.rs` and everything under `src/<block>/`.
fn building_block_files() -> Vec<String> {
    let mut files = Vec::new();
    for block in BUILDING_BLOCKS {
        let module = format!("src/{block}.rs");
        assert!(meta::repo().path(&module).is_file(), "{module} is missing");
        files.push(module);
        let directory = format!("src/{block}");
        if meta::repo().path(&directory).is_dir() {
            files.extend(meta::repo().files_under(&directory, &[".rs"]));
        }
    }
    files
}

/// Go: `TestBuildingBlocksDoNotImportTheLayers`: no file of the building blocks reaches the
/// compatibility layers. The file list holds the three module files themselves, so an empty or
/// wrong one cannot pass.
#[test]
fn building_blocks_do_not_import_the_layers() {
    let files = building_block_files();
    for module in BUILDING_BLOCKS {
        assert!(
            files.contains(&format!("src/{module}.rs")),
            "the scan does not read src/{module}.rs: {files:?}"
        );
    }
    let violations: Vec<String> = files
        .iter()
        .flat_map(|file| {
            compat_paths(&meta::repo().read(file))
                .into_iter()
                .map(move |path| format!("{file}: {path}"))
        })
        .collect();
    assert!(
        violations.is_empty(),
        "a building block depends on the compatibility layers:\n{}",
        violations.join("\n")
    );
}

/// The negative control: every way to spell a path to the layers is found, and what is not a
/// path (the configuration's field, a comment, a longer word) is not.
#[test]
fn the_scan_finds_every_spelling_of_the_layers() {
    for refused in [
        "use crate::compat::nq;",
        "use crate::compat;",
        "use crate :: compat :: librespeed;",
        "use crate::{config::Config, compat::librespeed::Deps};",
        "use crate::{\n    compat,\n    config,\n};",
        "use super::{compat};",
        "let deps = crate::compat::openspeedtest::Deps::default();",
        "let deps = $crate::compat::nq::Deps::default();",
        "fn layers() -> super::compat::nq::Deps { todo!() }",
        "let deps = super::super::compat::nq::Deps::default();",
        "let deps = bitgauge::compat::nq::Deps::default();",
        "let text = \"crate::compat\";",
    ] {
        assert!(!compat_paths(refused).is_empty(), "not refused: {refused}");
    }
    for allowed in [
        "let enabled = config.compat.librespeed.enabled;",
        "compat: InfoCompat,",
        "// The layers live in crate::compat and use this module.",
        "/// See `crate::compat::nq`.",
        "/* crate::compat /* nested */ still a comment */",
        "use crate::config::Compat;",
        "use crate::compatibility::Thing;",
        "let compatible = true;",
    ] {
        assert!(
            compat_paths(allowed).is_empty(),
            "refused: {allowed}: {:?}",
            compat_paths(allowed)
        );
    }
}
