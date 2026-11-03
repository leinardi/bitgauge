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

//! The `bitgauge` command: `serve` (the default) runs the speed test, and `healthcheck` asks a
//! running server whether it answers (backend.md sections 5 and 6). Everything is in
//! [`bitgauge::command`]; this passes it the process's arguments, environment and streams.

use std::process::ExitCode;

use bitgauge::command::{self, Mode, Process};
use bitgauge::server::Lifecycle;
use bitgauge::web::Spa;

fn main() -> ExitCode {
    let environment = std::env::vars_os()
        .map(|(name, value)| {
            (
                name.to_string_lossy().into_owned(),
                value.to_string_lossy().into_owned(),
            )
        })
        .collect();
    command::run(
        std::env::args_os().skip(1),
        Process {
            stdout: std::io::stdout,
            stderr: std::io::stderr,
            environment,
            render: Spa::render,
            mode: Mode::Process,
            lifecycle: Lifecycle::new(),
        },
    )
}
