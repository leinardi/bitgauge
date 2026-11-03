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

//! git commands that cannot reach the repository being committed (Go's `test/internal/gitenv`).
//!
//! The tests also run inside a pre-commit hook, and git exports its own location to hooks:
//! `GIT_INDEX_FILE` always, `GIT_DIR` and others in some setups, absolute in a linked worktree. A
//! git command run in a scratch repository with that environment acts on the real one instead --
//! a `git add` there writes into the index of the commit being made. [`isolate`] strips those
//! variables and the user's own configuration, so a scratch repository is only ever itself.
//! `meta/tests/license_headers.rs` inlines the same list.

use std::env;
use std::ffi::OsStr;
use std::process::Command;

/// The variables that point git at a repository other than the working directory's.
pub const REPOSITORY_VARS: [&str; 9] = [
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_WORK_TREE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_NAMESPACE",
    "GIT_CEILING_DIRECTORIES",
];

/// Whether a variable redirects git or carries the user's configuration.
fn redirects(name: &OsStr) -> bool {
    let name = name.to_string_lossy();
    REPOSITORY_VARS.contains(&name.as_ref()) || name.starts_with("GIT_CONFIG")
}

/// `command` without the variables that redirect git and without the user's global and system
/// configuration.
pub fn isolate(command: &mut Command) -> &mut Command {
    for (name, _) in env::vars_os() {
        if redirects(&name) {
            command.env_remove(&name);
        }
    }
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
}

#[cfg(test)]
mod tests {
    use std::ffi::OsStr;
    use std::process::Command;

    use super::{isolate, redirects};

    /// The redirecting variables are recognized, configuration included, and the isolated
    /// command carries the null configuration. (Go's `gitenv` has no test of its own; its
    /// behavior is checked through the license-header meta-test.)
    #[test]
    fn isolate_strips_the_redirections() {
        for name in [
            "GIT_DIR",
            "GIT_INDEX_FILE",
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_KEY_0",
        ] {
            assert!(redirects(OsStr::new(name)), "{name}");
        }
        for name in ["GIT_AUTHOR_NAME", "PATH", "HOME"] {
            assert!(!redirects(OsStr::new(name)), "{name}");
        }
        let mut command = Command::new("git");
        isolate(&mut command);
        let envs: Vec<(String, Option<String>)> = command
            .get_envs()
            .map(|(name, value)| {
                (
                    name.to_string_lossy().into_owned(),
                    value.map(|value| value.to_string_lossy().into_owned()),
                )
            })
            .collect();
        assert!(envs.contains(&("GIT_CONFIG_GLOBAL".to_owned(), Some("/dev/null".to_owned()))));
        assert!(envs.contains(&("GIT_CONFIG_NOSYSTEM".to_owned(), Some("1".to_owned()))));
    }
}
