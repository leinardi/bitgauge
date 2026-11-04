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

//! The external tools that behavioral tests drive (Go's `test/internal/toolgate`).
//!
//! A behavioral test that skips when its tool is missing passes in exactly the place it is meant
//! to guard: CI. So a missing tool is an early return with a note on a developer machine, and a
//! failure wherever `BITGAUGE_REQUIRE_TOOLS=1` is set, which CI does. The tools are a closed list,
//! [`Tool`]: Docker is deliberately not on it, because every Docker-dependent test sits behind
//! the `image` or `harness` feature and never runs without one. Every gated test looks its tool
//! up here (`meta/tests/untagged_tests.rs` holds the list closed and the lookups in this file).

use std::env;
use std::fmt;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// The variable that turns a missing tool from a note into a failure.
pub const REQUIRE_ENV: &str = "BITGAUGE_REQUIRE_TOOLS";

/// The closed list of tools a test may be gated on; widening it is a decision, not a side
/// effect of a new test.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    /// eslint, from `web/node_modules`.
    Eslint,
    /// fallow, from `web/node_modules`.
    Fallow,
}

impl Tool {
    /// Every tool.
    pub const ALL: [Self; 2] = [Self::Eslint, Self::Fallow];

    /// The tool's program name.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Eslint => "eslint",
            Self::Fallow => "fallow",
        }
    }
}

/// A required tool that is missing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Required {
    /// The tool.
    pub tool: Tool,
    /// Why it was not found.
    pub reason: String,
}

impl fmt::Display for Required {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{} is required ({REQUIRE_ENV}=1) but was not found: {}",
            self.tool.name(),
            self.reason
        )
    }
}

impl std::error::Error for Required {}

/// The path of `tool`: `web/node_modules/.bin/<tool>` in the nearest ancestor of the working
/// directory that has one. `None`, after a note on stderr, when
/// it is missing and the test should return early.
///
/// # Panics
///
/// The tool is missing while [`REQUIRE_ENV`] is `1`: the test fails.
#[must_use]
pub fn lookup(tool: Tool) -> Option<PathBuf> {
    let start = env::current_dir().unwrap_or_default();
    let required = env::var_os(REQUIRE_ENV).is_some_and(|value| value == "1");
    lookup_in(tool, &start, required).unwrap_or_else(|error| panic!("{error}"))
}

/// [`lookup`] from the directory `start`, with `required` for [`REQUIRE_ENV`].
///
/// # Errors
///
/// [`Required`] when the tool is missing and `required` is set.
pub fn lookup_in(tool: Tool, start: &Path, required: bool) -> Result<Option<PathBuf>, Required> {
    match find(tool, start) {
        Ok(found) => Ok(Some(found)),
        Err(reason) if required => Err(Required { tool, reason }),
        Err(reason) => {
            eprintln!(
                "note: {} not found ({reason}); set {REQUIRE_ENV}=1 to make this a failure",
                tool.name()
            );
            Ok(None)
        }
    }
}

/// The repository root: this crate sits one level below it.
#[must_use]
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn find(tool: Tool, start: &Path) -> Result<PathBuf, String> {
    let name = tool.name();
    for dir in start.ancestors() {
        let candidate = dir.join("web/node_modules/.bin").join(name);
        match fs::metadata(&candidate) {
            Ok(_) => return Ok(candidate),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(format!("stat {}: {error}", candidate.display())),
        }
    }
    Err(format!(
        "web/node_modules/.bin/{name}: not installed; run npm ci in web/"
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{Tool, lookup_in, repo_root};

    /// A tool is found under the nearest `web/node_modules`, a missing one is `None` unless
    /// required, and then it is an error naming the variable. (Go's `toolgate` has no test of
    /// its own; `test/toolchain` pinned its list.)
    #[test]
    fn lookup_finds_or_gates() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(lookup_in(Tool::Eslint, dir.path(), false).unwrap(), None);
        let web = dir.path().join("web/node_modules/.bin");
        fs::create_dir_all(&web).unwrap();
        fs::write(web.join("eslint"), "").unwrap();
        let nested = dir.path().join("a/b");
        fs::create_dir_all(&nested).unwrap();
        assert_eq!(
            lookup_in(Tool::Eslint, &nested, true).unwrap(),
            Some(web.join("eslint"))
        );
        let error = lookup_in(Tool::Fallow, &nested, true).unwrap_err();
        assert!(
            error
                .to_string()
                .starts_with("fallow is required (BITGAUGE_REQUIRE_TOOLS=1) but was not found"),
            "{error}"
        );
        assert_eq!(Tool::ALL.map(Tool::name), ["eslint", "fallow"]);
        assert!(repo_root().join("testenv/Cargo.toml").is_file());
    }
}
