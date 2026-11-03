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

//! Running cargo from a meta-test: the same cargo and toolchain that run the tests, on the
//! repository or on a scratch workspace.

use std::env;
use std::path::Path;
use std::process::{Command, Output};

/// A `cargo` command run in `directory`: the cargo that runs these tests (its `CARGO`), without the
/// variables that would point it at another clippy configuration or target directory.
#[must_use]
pub fn command(directory: &Path) -> Command {
    let program = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let mut command = Command::new(program);
    command
        .current_dir(directory)
        .env_remove("CLIPPY_CONF_DIR")
        .env_remove("CARGO_TARGET_DIR")
        .env_remove("CARGO_BUILD_TARGET_DIR");
    command
}

/// Runs `command`, returning its output whatever its status.
///
/// # Panics
///
/// The command cannot be started, naming it.
#[must_use]
pub fn output(command: &mut Command) -> Output {
    command
        .output()
        .unwrap_or_else(|error| panic!("run {command:?}: {error}"))
}
