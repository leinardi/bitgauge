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
// Adapted from swarm-scheduler-exporter/src/server/timeouts.rs at b670952, MIT, Copyright (c) 2026 Roberto Leinardi

//! The connection deadlines of `backend.md` §5, kept by a per-connection state that an I/O
//! wrapper enforces and the service updates at the request boundaries hyper does not expose.
//!
//! | State | Starts | Read deadline | Ends |
//! | --- | --- | --- | --- |
//! | Initial head | accept | accept + head | head complete |
//! | Body | head complete | none: the handler owns it | response done |
//! | Keep-alive idle | response done, nothing buffered | now + idle until the first byte | first byte |
//! | Keep-alive head | first byte after idle | first byte + head | head complete |
//! | Pipelined head | response done with the next request's bytes read | now + head | head complete |
//! | Upgraded | 101 sent | none: the WebSocket idle timer owns it | close |
//!
//! In every state a write that makes no progress for the write-stall timeout fails with
//! `TimedOut`, and so does a read past its deadline; hyper then drops the connection without a
//! response.
//!
//! hyper's own `header_read_timeout` cannot express this: hyper 1.12 arms it as soon as a
//! connection goes idle, so it would close an idle keep-alive connection after the head timeout.
//! It stays off. hyper reads ahead, so the bytes of a pipelined request may already sit in its
//! buffer when a response ends; [`Framer`] follows the request framing in `poll_read` to know.

use std::future::Future as _;
use std::io;
use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::task::{Context, Poll, Waker};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::sync::Notify;
use tokio::time::{Instant, Sleep};

use super::framing::Framer;

/// The connection timeouts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timeouts {
    /// A request head must be complete this long after the accept, or after its first byte.
    pub head: Duration,
    /// A keep-alive connection may wait this long for the next request's first byte.
    pub idle: Duration,
    /// A write that makes no progress for this long ends the connection.
    pub write_stall: Duration,
    /// How long a closing connection reads and discards what the client still sends, so the last
    /// response (a `413`, a `408`) is not lost to a reset.
    pub shutdown_drain: Duration,
}

impl Timeouts {
    /// The server's (`backend.md` §5): 10 s head, 120 s idle, 30 s write stall, 500 ms drain.
    pub const SERVER: Self = Self {
        head: Duration::from_secs(10),
        idle: Duration::from_mins(2),
        write_stall: Duration::from_secs(30),
        shutdown_drain: Duration::from_millis(500),
    };
}

/// Where a connection is in its request cycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Reading a request head: the initial, a keep-alive or a pipelined one.
    Head,
    /// Head read: the handler runs and its response is written.
    Request,
    /// Response done, waiting for the next request's first byte.
    Idle,
    /// The connection was upgraded and belongs to its socket task.
    Upgraded,
}

#[derive(Debug)]
struct Inner {
    phase: Phase,
    read_deadline: Option<Instant>,
    // Where the requests read so far start and end, and how many responses are done: more
    // requests started than answered means the next one is already (partly) read.
    framer: Framer,
    responses_done: u64,
    // The read side's waker while it waits, so a new deadline is armed at once rather than at
    // the next read.
    read_waker: Option<Waker>,
}

impl Inner {
    fn next_request_read(&self) -> bool {
        self.framer.started() > self.responses_done
    }

    fn start_head(&mut self, timeouts: Timeouts, now: Instant) {
        self.phase = Phase::Head;
        self.read_deadline = Some(now + timeouts.head);
    }
}

/// One connection's deadlines, shared by its I/O wrapper, its service and its response bodies.
#[derive(Debug, Clone)]
pub struct ConnState {
    timeouts: Timeouts,
    inner: Arc<Mutex<Inner>>,
    /// Notified on every change of phase, for [`ConnState::wait_until_idle`].
    changed: Arc<Notify>,
}

impl ConnState {
    /// A connection accepted now: its first head is due within the head timeout.
    #[must_use]
    pub fn new(timeouts: Timeouts) -> Self {
        Self {
            timeouts,
            inner: Arc::new(Mutex::new(Inner {
                phase: Phase::Head,
                read_deadline: Some(Instant::now() + timeouts.head),
                framer: Framer::new(),
                responses_done: 0,
                read_waker: None,
            })),
            changed: Arc::new(Notify::new()),
        }
    }

    /// The timeouts this connection runs under.
    #[must_use]
    pub fn timeouts(&self) -> Timeouts {
        self.timeouts
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // The state is a few plain fields updated in place; a panic elsewhere leaves them
        // consistent, so a poisoned lock is still usable.
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Where the connection is now.
    #[must_use]
    pub fn phase(&self) -> Phase {
        self.lock().phase
    }

    /// The current read deadline, if any.
    #[must_use]
    pub fn read_deadline(&self) -> Option<Instant> {
        self.lock().read_deadline
    }

    /// Whether a request is in flight: its head has started arriving, or its response is not
    /// done. An idle connection, or a fresh one that has read nothing, is not busy.
    #[must_use]
    pub fn is_busy(&self) -> bool {
        let inner = self.lock();
        match inner.phase {
            Phase::Request => true,
            Phase::Head => inner.next_request_read(),
            Phase::Idle | Phase::Upgraded => false,
        }
    }

    /// Waits until no request is in flight ([`ConnState::is_busy`]), or until the response in
    /// flight when the wait began is done. The second bound matters for a client that pipelines:
    /// it may always have a next request read, and Go's `Shutdown` closes such a connection after
    /// the current response too.
    pub async fn wait_until_idle(&self) {
        let responses_at_start = self.lock().responses_done;
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if !self.is_busy() || self.lock().responses_done > responses_at_start {
                return;
            }
            notified.await;
        }
    }

    /// Applies `change`, wakes a waiting read, which then arms the new deadline, and tells
    /// [`ConnState::wait_until_idle`].
    fn update(&self, change: impl FnOnce(&mut Inner, Timeouts, Instant)) {
        let waker = {
            let mut inner = self.lock();
            change(&mut inner, self.timeouts, Instant::now());
            inner.read_waker.take()
        };
        if let Some(waker) = waker {
            waker.wake();
        }
        self.changed.notify_waiters();
    }

    /// hyper parsed a request head and calls the service: the body has no connection deadline.
    pub fn on_request_head(&self) {
        self.update(|inner, _, _| {
            if inner.phase != Phase::Upgraded {
                inner.phase = Phase::Request;
                inner.read_deadline = None;
            }
        });
    }

    /// The service answered `101 Switching Protocols`: the connection leaves the request cycle.
    pub fn on_upgraded(&self) {
        self.update(|inner, _, _| {
            inner.phase = Phase::Upgraded;
            inner.read_deadline = None;
        });
    }

    /// hyper dropped the response body: written, or the connection ended. The next request's head
    /// is due at once when its bytes were already read, otherwise the connection goes idle.
    pub fn on_response_done(&self) {
        self.update(|inner, timeouts, now| {
            inner.responses_done += 1;
            if inner.phase == Phase::Upgraded {
                return;
            }
            if inner.next_request_read() {
                inner.start_head(timeouts, now);
            } else {
                inner.phase = Phase::Idle;
                inner.read_deadline = Some(now + timeouts.idle);
            }
        });
    }

    /// The connection read `bytes`. On an idle connection, the first byte of a new request starts
    /// its head timer; the rest of a body the handler did not read does not.
    fn on_bytes_read(&self, bytes: &[u8]) {
        let now = Instant::now();
        let started = {
            let mut inner = self.lock();
            if inner.phase == Phase::Upgraded {
                return;
            }
            let before = inner.framer.started();
            inner.framer.feed(bytes);
            if inner.phase == Phase::Idle && inner.next_request_read() {
                inner.start_head(self.timeouts, now);
            }
            inner.framer.started() > before
        };
        if started {
            self.changed.notify_waiters();
        }
    }

    /// Keeps the read side's waker, returning the deadline it waits under.
    fn park_read(&self, context: &Context<'_>) -> Option<Instant> {
        let mut inner = self.lock();
        inner.read_waker = Some(context.waker().clone());
        inner.read_deadline
    }
}

fn timed_out(what: &str) -> io::Error {
    io::Error::new(io::ErrorKind::TimedOut, format!("{what} deadline exceeded"))
}

/// Polls `sleep`, moved to `deadline` first; whether the deadline passed.
fn expired(sleep: &mut Pin<Box<Sleep>>, deadline: Instant, context: &mut Context<'_>) -> bool {
    if sleep.deadline() != deadline {
        sleep.as_mut().reset(deadline);
    }
    sleep.as_mut().poll(context).is_ready()
}

/// How far a closing connection got.
#[derive(Debug)]
enum Closing {
    Open,
    /// The write side is shut; reads are discarded until this deadline.
    Draining(Instant),
    Closed,
}

/// The connection's I/O under the deadlines of its [`ConnState`].
#[derive(Debug)]
pub struct ConnIo<T> {
    io: T,
    state: ConnState,
    read_sleep: Pin<Box<Sleep>>,
    write_sleep: Pin<Box<Sleep>>,
    /// When the pending write started waiting, reset by every write that makes progress.
    write_stalled_since: Option<Instant>,
    closing: Closing,
}

impl<T> ConnIo<T> {
    /// `io` under the deadlines of `state`.
    #[must_use]
    pub fn new(io: T, state: ConnState) -> Self {
        let now = Instant::now();
        Self {
            io,
            state,
            read_sleep: Box::pin(tokio::time::sleep_until(now)),
            write_sleep: Box::pin(tokio::time::sleep_until(now)),
            write_stalled_since: None,
            closing: Closing::Open,
        }
    }

    /// Fails a write that has waited the whole stall timeout since its last progress.
    fn on_write_pending(&mut self, context: &mut Context<'_>) -> Poll<io::Error> {
        let since = *self.write_stalled_since.get_or_insert_with(Instant::now);
        let deadline = since + self.state.timeouts.write_stall;
        if expired(&mut self.write_sleep, deadline, context) {
            Poll::Ready(timed_out("write"))
        } else {
            Poll::Pending
        }
    }

    fn on_write_ready<R>(&mut self, result: &io::Result<R>) {
        if result.is_ok() {
            self.write_stalled_since = None;
        }
    }
}

impl<T: AsyncRead + Unpin> AsyncRead for ConnIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = &mut *self;
        if let Some(deadline) = this.state.read_deadline()
            && Instant::now() >= deadline
        {
            return Poll::Ready(Err(timed_out("read")));
        }
        let before = buf.filled().len();
        match Pin::new(&mut this.io).poll_read(context, buf) {
            Poll::Ready(Ok(())) => {
                let read = &buf.filled()[before..];
                if !read.is_empty() {
                    this.state.on_bytes_read(read);
                }
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
            Poll::Pending => match this.state.park_read(context) {
                Some(deadline) if expired(&mut this.read_sleep, deadline, context) => {
                    Poll::Ready(Err(timed_out("read")))
                }
                Some(_) | None => Poll::Pending,
            },
        }
    }
}

impl<T: AsyncRead + AsyncWrite + Unpin> AsyncWrite for ConnIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = &mut *self;
        match Pin::new(&mut this.io).poll_write(context, buf) {
            Poll::Ready(result) => {
                this.on_write_ready(&result);
                Poll::Ready(result)
            }
            Poll::Pending => this.on_write_pending(context).map(Err),
        }
    }

    fn poll_write_vectored(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        bufs: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        let this = &mut *self;
        match Pin::new(&mut this.io).poll_write_vectored(context, bufs) {
            Poll::Ready(result) => {
                this.on_write_ready(&result);
                Poll::Ready(result)
            }
            Poll::Pending => this.on_write_pending(context).map(Err),
        }
    }

    fn is_write_vectored(&self) -> bool {
        self.io.is_write_vectored()
    }

    fn poll_flush(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = &mut *self;
        match Pin::new(&mut this.io).poll_flush(context) {
            Poll::Ready(result) => {
                this.on_write_ready(&result);
                Poll::Ready(result)
            }
            Poll::Pending => this.on_write_pending(context).map(Err),
        }
    }

    /// Shuts the write side, then reads and discards what the client still sends until it closes
    /// or the drain timeout passes: closing a socket with unread bytes resets it, and a reset can
    /// destroy the last response before the client reads it.
    fn poll_shutdown(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = &mut *self;
        loop {
            match this.closing {
                Closing::Open => match Pin::new(&mut this.io).poll_shutdown(context) {
                    Poll::Pending => return this.on_write_pending(context).map(Err),
                    Poll::Ready(Err(error)) => {
                        this.closing = Closing::Closed;
                        return Poll::Ready(Err(error));
                    }
                    Poll::Ready(Ok(())) => {
                        let deadline = Instant::now() + this.state.timeouts.shutdown_drain;
                        this.closing = Closing::Draining(deadline);
                    }
                },
                Closing::Draining(deadline) if Instant::now() >= deadline => {
                    this.closing = Closing::Closed;
                }
                Closing::Draining(deadline) => {
                    let mut scratch = [0_u8; 4096];
                    let mut buf = ReadBuf::new(&mut scratch);
                    match Pin::new(&mut this.io).poll_read(context, &mut buf) {
                        Poll::Ready(Ok(())) if !buf.filled().is_empty() => {}
                        Poll::Ready(_) => this.closing = Closing::Closed,
                        Poll::Pending => {
                            if expired(&mut this.read_sleep, deadline, context) {
                                this.closing = Closing::Closed;
                            } else {
                                return Poll::Pending;
                            }
                        }
                    }
                }
                Closing::Closed => return Poll::Ready(Ok(())),
            }
        }
    }
}

#[cfg(test)]
mod tests;
