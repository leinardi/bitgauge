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

//! The task that owns an upgraded connection (`docs/rust-port.md`, Shutdown and Signals).
//!
//! A handler that answers `101` registers the socket's task on the lifecycle's tracker *before*
//! it returns the response, while its HTTP connection task still runs, so the tracker is never
//! empty between the HTTP task ending and the socket task starting, and shutdown cannot finish in
//! that gap. The task runs in two stages:
//!
//! 1. **Awaiting the upgrade**, selecting only on the upgrade and `cut`. `stop` does not end this
//!    stage and never drops a pending upgrade; the stage reads `stop` when it ends. `cut` drops
//!    the upgrade and ends the task; a failed upgrade (the client went away) ends it too.
//! 2. **Upgraded**: the socket's own code runs, told whether `stop` came before or during stage 1
//!    (it then closes with 1001 at once) and handed `stop` and `cut` for the rest.

use std::future::Future;

use hyper::upgrade::Upgraded;
use hyper_util::rt::TokioIo;
use tokio_util::sync::CancellationToken;

use super::conn::Lifecycle;

/// What an upgraded socket's code is told about shutdown.
#[derive(Debug, Clone)]
pub struct SocketShutdown {
    /// `stop` was cancelled before the upgrade completed: close with 1001 at once.
    pub stopped_before_upgrade: bool,
    /// Cancelled on `stop`: close with 1001.
    pub stop: CancellationToken,
    /// Cancelled when the grace runs out: drop the socket without a close.
    pub cut: CancellationToken,
}

/// Spawns the task of an upgraded connection on the lifecycle's tracker. Call it before returning
/// the `101`. `upgrade` resolves to the upgraded connection (`hyper::upgrade::on`); `guard` is held
/// until the task ends (a rate-limit slot, say); `run` is the socket's code.
pub fn spawn_socket_task<U, G, F, R>(lifecycle: &Lifecycle, upgrade: U, guard: G, run: F)
where
    U: Future<Output = hyper::Result<Upgraded>> + Send + 'static,
    G: Send + 'static,
    F: FnOnce(TokioIo<Upgraded>, SocketShutdown) -> R + Send + 'static,
    R: Future<Output = ()> + Send,
{
    let stop = lifecycle.stop_token().clone();
    let cut = lifecycle.cut_token().clone();
    lifecycle.tracker().spawn(async move {
        let _guard = guard;
        let upgraded = tokio::select! {
            biased;
            () = cut.cancelled() => return,
            upgraded = upgrade => upgraded,
        };
        let Ok(upgraded) = upgraded else {
            return;
        };
        let shutdown = SocketShutdown {
            stopped_before_upgrade: stop.is_cancelled(),
            stop,
            cut,
        };
        run(TokioIo::new(upgraded), shutdown).await;
    });
}
