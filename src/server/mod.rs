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

//! The HTTP server: the route table, the router of the route groups and the global middleware,
//! the accept loop and connection driver, the connection deadlines, the upgraded-socket tasks,
//! the shutdown signals and the end of the process.

use std::process::ExitCode;

use tokio::runtime::Runtime;

pub mod classify;
pub mod conn;
pub mod framing;
pub mod middleware;
pub mod router;
pub mod routes;
pub mod signals;
pub mod timeouts;
pub mod upgrade;

#[cfg(test)]
mod tests;

pub use conn::{Lifecycle, Outcome, serve};

/// How long the runtime may take to stop after the shutdown sequence: the backstop for a task
/// that ignored `cut`.
const RUNTIME_SHUTDOWN: std::time::Duration = std::time::Duration::from_secs(1);

/// The error text of a shutdown that had to cut transfers, as the log line names it.
pub const GRACE_EXCEEDED: &str = "shutdown grace exceeded; running transfers were cut";

/// Ends the process after [`serve`]: stops the runtime within its backstop, logs the outcome and
/// returns the exit status: 0 after a clean shutdown, 1 when transfers were cut or the listener
/// failed.
#[must_use]
pub fn finish_process(runtime: Runtime, outcome: &Outcome) -> ExitCode {
    runtime.shutdown_timeout(RUNTIME_SHUTDOWN);
    log_outcome(outcome);
    exit_code(outcome)
}

/// The exit status of an outcome.
#[must_use]
pub fn exit_code(outcome: &Outcome) -> ExitCode {
    match outcome {
        Outcome::Stopped => ExitCode::SUCCESS,
        Outcome::GraceExceeded | Outcome::ListenerFailed(_) => ExitCode::FAILURE,
    }
}

fn log_outcome(outcome: &Outcome) {
    match outcome {
        Outcome::Stopped => tracing::info!("stopped"),
        Outcome::GraceExceeded => tracing::error!(error = GRACE_EXCEEDED, "server stopped"),
        Outcome::ListenerFailed(error) => {
            tracing::error!(error = %format_args!("serve: {error}"), "server stopped");
        }
    }
}
