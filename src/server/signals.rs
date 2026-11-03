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

//! SIGTERM and SIGINT, taken without tokio's signal driver.
//!
//! tokio's signal handling installs a handler that writes to a socketpair, which the image's
//! strace policy (no connection attempt, no unexpected socket) would refuse. Instead both signals
//! are blocked in the main thread before the runtime starts, so every thread inherits the mask and
//! none receives them, and one plain thread takes them with `sigwait`. The first cancels `stop`;
//! the second unblocks the signal on that thread and raises it again: no handler was ever
//! installed, so the default action ends the process at once, as an operator expects.

use std::io;
use std::thread;

use nix::sys::signal::{SigSet, Signal, raise};
use tokio_util::sync::CancellationToken;

/// The signals that stop the server.
fn shutdown_signals() -> SigSet {
    let mut set = SigSet::empty();
    set.add(Signal::SIGTERM);
    set.add(Signal::SIGINT);
    set
}

/// Blocks SIGTERM and SIGINT in the calling thread, and so in every thread it starts afterwards.
/// Call it first in `main`, before the runtime or any other thread exists.
///
/// # Errors
///
/// The signal mask cannot be changed.
pub fn block_shutdown_signals() -> io::Result<()> {
    shutdown_signals().thread_block().map_err(io::Error::from)
}

/// Starts the thread that takes the blocked signals: the first cancels `stop`, the second ends the
/// process by the signal's default action.
///
/// # Errors
///
/// The thread cannot be started.
pub fn spawn_signal_thread(stop: CancellationToken) -> io::Result<thread::JoinHandle<()>> {
    thread::Builder::new()
        .name("signals".to_owned())
        .spawn(move || {
            let set = shutdown_signals();
            let mut stopping = false;
            loop {
                let Ok(signal) = set.wait() else {
                    continue;
                };
                if stopping {
                    // The default action of SIGTERM and SIGINT ends the process; if unblocking
                    // or raising fails, the signal stays pending and the next one tries again.
                    let mut one = SigSet::empty();
                    one.add(signal);
                    if one.thread_unblock().is_ok() {
                        let _ = raise(signal);
                    }
                    continue;
                }
                stopping = true;
                tracing::info!("shutting down");
                stop.cancel();
            }
        })
}
