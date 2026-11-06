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

use std::path::PathBuf;

use testenv_core::toolgate::{Gate, Locate, Note};

/// The variable that turns a missing tool from a note into a failure.
pub const REQUIRE_ENV: &str = "BITGAUGE_REQUIRE_TOOLS";

/// BitGauge's gate (rust-common's `testenv-core`): [`Tool::ALL`] under the nearest
/// `web/node_modules/.bin`, a missing tool's note captured by libtest.
pub const GATE: Gate = Gate {
    require_env: REQUIRE_ENV,
    tools: &["eslint", "fallow"],
    locate: Locate::Ancestors {
        dir: "web/node_modules/.bin",
        hint: "run npm ci in web/",
    },
    note: Note::Captured,
};

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

/// The path of `tool`: `web/node_modules/.bin/<tool>` in the nearest ancestor of the working
/// directory that has one. `None`, after a note on stderr, when it is missing and the test should
/// return early.
///
/// # Panics
///
/// The tool is missing while [`REQUIRE_ENV`] is `1`: the test fails.
#[must_use]
pub fn lookup(tool: Tool) -> Option<PathBuf> {
    GATE.lookup(tool.name())
}

/// The repository root: this crate sits one level below it.
#[must_use]
pub fn repo_root() -> PathBuf {
    testenv_core::repo_root!()
}

#[cfg(test)]
mod tests {
    use super::{GATE, Tool, repo_root};

    /// The gate's list is [`Tool::ALL`], and the root is this checkout's. (The lookup itself is
    /// tested in rust-common's `testenv-core`, `toolgate::tests::ancestors_find_or_gate`, with
    /// this gate.)
    #[test]
    fn the_gate_is_the_tool_list() {
        assert_eq!(Tool::ALL.map(Tool::name), GATE.tools);
        assert_eq!(Tool::ALL.map(Tool::name), ["eslint", "fallow"]);
        assert!(repo_root().join("testenv/Cargo.toml").is_file());
    }
}
