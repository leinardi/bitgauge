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

//! The accept loop, the per-connection driver and the shutdown sequence (`backend.md` §5).
//!
//! hyper-util's `GracefulShutdown` is not used: its `watch()` does not take hyper's HTTP/1
//! `UpgradeableConnection`, and its `shutdown()` future must be polled. Each connection is driven
//! in one task of the [`Lifecycle`]'s tracker instead: on `stop` it lets a request in flight finish
//! (a `101` included, so the upgrade still happens), then calls `graceful_shutdown()` on its own
//! pinned connection, which closes it, and keeps polling it; on `cut` it drops it.
//!
//! On `stop`, under one deadline `grace_end = now + grace`: the listener is dropped, every task
//! sees `stop`, the tracker is closed and awaited until `grace_end`. Past it, `cut` drops every
//! connection and socket, the tracker gets [`CUT_WAIT`] more, and the outcome is
//! [`Outcome::GraceExceeded`].

use std::error::Error as StdError;
use std::future::{Future, poll_fn};
use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use bytes::Bytes;
use http::{Request, Response, StatusCode};
use http_body::{Body, Frame, SizeHint};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;
use tower_service::Service;

use super::timeouts::{ConnIo, ConnState, Timeouts};
use crate::handlers::Abort;

/// The error type a connection's service may fail with.
pub type BoxError = Box<dyn StdError + Send + Sync>;

/// The service error for a response carrying [`Abort`]: hyper closes the connection on it
/// without writing a status line.
#[derive(Debug, thiserror::Error)]
#[error("the client went away mid-body")]
pub struct Aborted;

/// How long the tracker is given after `cut`, before the runtime's own backstop.
pub const CUT_WAIT: Duration = Duration::from_secs(1);

/// The shutdown grace (`backend.md` §5): how long running transfers may finish after `stop`.
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);

/// The most headers a request may carry; hyper answers more with `431`.
pub const MAX_HEADERS: usize = 100;

/// The largest request head, start line included; hyper answers a larger one with `431`.
pub const MAX_HEADER_SIZE: usize = 16 * 1024;

/// The first and the longest pause after a failed accept, as net/http's `Serve` backs off.
const ACCEPT_BACKOFF_FIRST: Duration = Duration::from_millis(5);
const ACCEPT_BACKOFF_MAX: Duration = Duration::from_secs(1);

/// The shared shutdown signals and the tracker that owns every connection and socket task.
#[derive(Debug, Clone, Default)]
pub struct Lifecycle {
    stop: CancellationToken,
    cut: CancellationToken,
    tracker: TaskTracker,
}

impl Lifecycle {
    /// A server that has not been asked to stop.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Asks the server to stop: no new connection, graceful shutdown of the running ones.
    pub fn stop(&self) {
        self.stop.cancel();
    }

    /// The token cancelled by [`Lifecycle::stop`].
    #[must_use]
    pub fn stop_token(&self) -> &CancellationToken {
        &self.stop
    }

    /// The token cancelled when the grace runs out: every task drops its connection or socket.
    #[must_use]
    pub fn cut_token(&self) -> &CancellationToken {
        &self.cut
    }

    /// The tracker every connection and socket task is spawned on.
    #[must_use]
    pub fn tracker(&self) -> &TaskTracker {
        &self.tracker
    }
}

/// How [`serve`] ended.
#[derive(Debug)]
pub enum Outcome {
    /// Every connection and socket finished within the grace.
    Stopped,
    /// Transfers still running at the end of the grace were cut.
    GraceExceeded,
    /// The listener failed with an error that retrying cannot fix.
    ListenerFailed(io::Error),
}

/// Whether an accept error is about this one connection or a passing shortage, so the loop backs
/// off and retries rather than stopping the server.
fn accept_error_is_transient(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::ConnectionAborted
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::Interrupted
            | io::ErrorKind::WouldBlock
            | io::ErrorKind::OutOfMemory
    ) || matches!(
        error.raw_os_error(),
        Some(code) if [
            nix::libc::EMFILE,
            nix::libc::ENFILE,
            nix::libc::ENOBUFS,
            nix::libc::ENOMEM,
            nix::libc::EPROTO,
        ]
        .contains(&code)
    )
}

/// Serves `service` on `listener` until the lifecycle's `stop`, then shuts down within `grace`.
pub async fn serve<S, B>(
    listener: TcpListener,
    service: S,
    lifecycle: &Lifecycle,
    timeouts: Timeouts,
    grace: Duration,
) -> Outcome
where
    S: Service<Request<Incoming>, Response = Response<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
    B: Body<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError>,
{
    if let Err(error) = accept_loop(listener, &service, lifecycle, timeouts).await {
        lifecycle.stop();
        return finish(lifecycle, Instant::now() + grace, Some(error)).await;
    }
    finish(lifecycle, Instant::now() + grace, None).await
}

/// Accepts until `stop`, spawning one tracked task per connection; the listener is dropped on
/// return. Fails only on an accept error that is not transient.
async fn accept_loop<S, B>(
    listener: TcpListener,
    service: &S,
    lifecycle: &Lifecycle,
    timeouts: Timeouts,
) -> io::Result<()>
where
    S: Service<Request<Incoming>, Response = Response<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
    B: Body<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError>,
{
    let mut backoff: Option<Duration> = None;
    loop {
        let accepted = tokio::select! {
            biased;
            () = lifecycle.stop.cancelled() => return Ok(()),
            accepted = listener.accept() => accepted,
        };
        match accepted {
            Ok((stream, _peer)) => {
                backoff = None;
                let service = service.clone();
                let connection = lifecycle.clone();
                lifecycle.tracker.spawn(async move {
                    if let Err(error) = drive(stream, service, &connection, timeouts).await {
                        tracing::debug!(error = %error, "connection ended with an error");
                    }
                });
            }
            Err(error) if accept_error_is_transient(&error) => {
                let delay = backoff.map_or(ACCEPT_BACKOFF_FIRST, |delay| {
                    (delay * 2).min(ACCEPT_BACKOFF_MAX)
                });
                backoff = Some(delay);
                tracing::warn!(error = %error, retry_ms = delay.as_millis(), "accept failed");
                tokio::select! {
                    biased;
                    () = lifecycle.stop.cancelled() => return Ok(()),
                    () = tokio::time::sleep(delay) => {}
                }
            }
            Err(error) => return Err(error),
        }
    }
}

/// The shutdown sequence after the listener is gone, all under one deadline.
async fn finish(lifecycle: &Lifecycle, grace_end: Instant, failed: Option<io::Error>) -> Outcome {
    lifecycle.tracker.close();
    let finished = tokio::time::timeout_at(grace_end, lifecycle.tracker.wait())
        .await
        .is_ok();
    if !finished {
        lifecycle.cut.cancel();
        // The runtime's shutdown_timeout is the backstop for a task that ignores cut.
        let _ = tokio::time::timeout(CUT_WAIT, lifecycle.tracker.wait()).await;
    }
    match (failed, finished) {
        (Some(error), _) => Outcome::ListenerFailed(error),
        (None, true) => Outcome::Stopped,
        (None, false) => Outcome::GraceExceeded,
    }
}

/// Drives one accepted connection to its end: served, gracefully shut down on `stop`, dropped on
/// `cut`.
///
/// # Errors
///
/// hyper's error for the connection: a deadline (`TimedOut`), a client that went away, or a
/// request hyper could not parse.
pub async fn drive<S, B>(
    stream: TcpStream,
    service: S,
    lifecycle: &Lifecycle,
    timeouts: Timeouts,
) -> Result<(), hyper::Error>
where
    S: Service<Request<Incoming>, Response = Response<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
    B: Body<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError>,
{
    let state = ConnState::new(timeouts);
    let io = TokioIo::new(ConnIo::new(stream, state.clone()));
    let service = Tracked {
        inner: service,
        state: state.clone(),
    };
    let mut builder = http1::Builder::new();
    builder
        .header_read_timeout(None)
        .max_headers(MAX_HEADERS)
        .max_header_size(MAX_HEADER_SIZE);
    let connection = builder.serve_connection(io, service).with_upgrades();
    tokio::pin!(connection);
    tokio::select! {
        result = connection.as_mut() => result,
        () = lifecycle.stop.cancelled() => {
            // A request in flight is served first, and only then is the connection shut down:
            // hyper's graceful_shutdown during a request appends `close` to its response's
            // Connection header, which would turn a 101 into a closed connection and lose the
            // upgrade (docs/rust-port.md, Findings During the Port). An idle connection is shut
            // down at once.
            tokio::select! {
                result = connection.as_mut() => return result,
                () = lifecycle.cut.cancelled() => return Ok(()),
                () = state.wait_until_idle() => {}
            }
            connection.as_mut().graceful_shutdown();
            tokio::select! {
                result = connection.as_mut() => result,
                () = lifecycle.cut.cancelled() => Ok(()),
            }
        }
        () = lifecycle.cut.cancelled() => Ok(()),
    }
}

/// The connection's service: tells the [`ConnState`] where each request starts and ends, and
/// fails a response carrying [`Abort`] so that nothing is written for it.
#[derive(Debug, Clone)]
struct Tracked<S> {
    inner: S,
    state: ConnState,
}

impl<S, B> hyper::service::Service<Request<Incoming>> for Tracked<S>
where
    S: Service<Request<Incoming>, Response = Response<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
    B: Body<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError>,
{
    type Response = Response<DoneBody<B>>;
    type Error = BoxError;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, BoxError>> + Send>>;

    fn call(&self, request: Request<Incoming>) -> Self::Future {
        self.state.on_request_head();
        let mut inner = self.inner.clone();
        let state = self.state.clone();
        Box::pin(async move {
            poll_fn(|context| inner.poll_ready(context))
                .await
                .map_err(Into::into)?;
            let response = inner.call(request).await.map_err(Into::into)?;
            if response.extensions().get::<Abort>().is_some() {
                return Err(Aborted.into());
            }
            if response.status() == StatusCode::SWITCHING_PROTOCOLS {
                state.on_upgraded();
            }
            Ok(response.map(|body| DoneBody {
                body,
                state: Some(state),
            }))
        })
    }
}

pin_project_lite::pin_project! {
    /// A response body that tells the [`ConnState`] when hyper is done with it.
    pub struct DoneBody<B> {
        #[pin]
        body: B,
        state: Option<ConnState>,
    }

    impl<B> PinnedDrop for DoneBody<B> {
        fn drop(this: Pin<&mut Self>) {
            if let Some(state) = this.project().state.take() {
                state.on_response_done();
            }
        }
    }
}

impl<B: Body> Body for DoneBody<B> {
    type Data = B::Data;
    type Error = B::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        self.project().body.poll_frame(context)
    }

    fn is_end_stream(&self) -> bool {
        self.body.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.body.size_hint()
    }
}
