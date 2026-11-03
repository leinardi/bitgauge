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

//! What the handler tests share: bodies on the paused clock, the envelope check, and a
//! loopback server.

use std::collections::VecDeque;
use std::io;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll, ready};
use std::time::Duration;

use bytes::Bytes;
use http::header::{CACHE_CONTROL, CONTENT_TYPE};
use http::{Response, StatusCode};
use http_body::{Body as HttpBody, Frame};
use http_body_util::BodyExt as _;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{Instant, Sleep, sleep_until};

use crate::handlers::Body;
use crate::metrics::{Direction, Group, Metrics, Route, Transfer};
use crate::server::conn::{self, Lifecycle};
use crate::server::timeouts::Timeouts;
use crate::test_support::dial_loopback;

/// A transfer that counts nothing, for a test that does not look at the metrics.
pub(crate) fn no_transfer() -> Transfer {
    Transfer::default()
}

/// The metrics of a test that looks at them, with the native API's transfer series.
pub(crate) fn meter() -> Metrics {
    Metrics::new(
        crate::buildinfo::info(),
        || 0,
        &[Route::new("/api/v1/download", Group::Api)],
    )
}

/// A sample of the exposition: the value of the line `series` starts.
pub(crate) fn sample(meter: &Metrics, series: &str) -> String {
    let exposition = meter.encode().expect("the exposition");
    exposition
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{series} ")).map(str::to_owned))
        .unwrap_or_default()
}

pub(crate) fn api_transfer(meter: &Metrics, direction: Direction) -> Transfer {
    meter.transfer(Group::Api, direction)
}

/// What a scripted frame is.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Outcome {
    /// This many bytes.
    Data(usize),
    /// The client goes away: the body fails.
    Gone,
}

/// One scripted frame, arriving `at` after the body's start.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Arrival {
    pub(crate) at: Duration,
    pub(crate) outcome: Outcome,
}

pub(crate) const fn data(at_ms: u64, size: usize) -> Arrival {
    Arrival {
        at: Duration::from_millis(at_ms),
        outcome: Outcome::Data(size),
    }
}

pub(crate) const fn gone(at_ms: u64) -> Arrival {
    Arrival {
        at: Duration::from_millis(at_ms),
        outcome: Outcome::Gone,
    }
}

/// A request body whose frames arrive at scripted instants of tokio's clock, each awaited by a
/// sleep, so on a paused clock they arrive exactly then. It counts the frames handed out, and
/// `stall` makes it wait forever once the script is done instead of ending.
pub(crate) struct ScriptedBody {
    start: Instant,
    arrivals: VecDeque<Arrival>,
    sleep: Option<Pin<Box<Sleep>>>,
    reads: Arc<AtomicUsize>,
    stall: bool,
}

impl ScriptedBody {
    pub(crate) fn new(start: Instant, arrivals: &[Arrival]) -> Self {
        Self {
            start,
            arrivals: arrivals.iter().copied().collect(),
            sleep: None,
            reads: Arc::default(),
            stall: false,
        }
    }

    pub(crate) fn stalling(mut self) -> Self {
        self.stall = true;
        self
    }

    /// The count of frames handed out, which stays readable after the body is consumed.
    pub(crate) fn reads(&self) -> Arc<AtomicUsize> {
        Arc::clone(&self.reads)
    }
}

impl HttpBody for ScriptedBody {
    type Data = Bytes;
    type Error = io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, io::Error>>> {
        let this = self.get_mut();
        let Some(next) = this.arrivals.front().copied() else {
            return if this.stall {
                Poll::Pending
            } else {
                Poll::Ready(None)
            };
        };
        let start = this.start;
        let sleep = this
            .sleep
            .get_or_insert_with(|| Box::pin(sleep_until(start + next.at)));
        ready!(sleep.as_mut().poll(context));
        this.sleep = None;
        this.arrivals.pop_front();
        this.reads.fetch_add(1, Ordering::SeqCst);
        Poll::Ready(Some(match next.outcome {
            Outcome::Data(size) => Ok(Frame::data(Bytes::from(vec![b'x'; size]))),
            Outcome::Gone => Err(io::Error::from(io::ErrorKind::ConnectionReset)),
        }))
    }
}

/// A body that fails the test if it is ever read.
pub(crate) struct UnreadBody;

impl HttpBody for UnreadBody {
    type Data = Bytes;
    type Error = io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, io::Error>>> {
        panic!("the body was read");
    }
}

pub(crate) async fn body_bytes(response: Response<Body>) -> Bytes {
    response
        .into_body()
        .collect()
        .await
        .expect("a whole body")
        .to_bytes()
}

pub(crate) fn header<'response>(response: &'response Response<Body>, name: &str) -> &'response str {
    response
        .headers()
        .get(name)
        .map_or("", |value| value.to_str().expect("a text header"))
}

/// Checks an error response, status, the JSON content type, no-store and the code with a
/// message, and returns its envelope.
pub(crate) async fn envelope(
    response: Response<Body>,
    status: StatusCode,
    code: &str,
) -> serde_json::Value {
    assert_eq!(response.status(), status);
    assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
    assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
    let body = body_bytes(response).await;
    let decoded: serde_json::Value = serde_json::from_slice(&body).expect("a JSON envelope");
    assert_eq!(decoded["error"]["code"], code, "{decoded}");
    assert!(
        decoded["error"]["message"]
            .as_str()
            .is_some_and(|message| !message.is_empty()),
        "{decoded}"
    );
    decoded
}

/// A loopback server running `router` on the real driver with the server's timeouts.
pub(crate) struct Loopback {
    pub(crate) address: SocketAddr,
    lifecycle: Lifecycle,
}

impl Loopback {
    pub(crate) async fn start(router: axum::Router) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("a listener");
        let address = listener.local_addr().expect("an address");
        let lifecycle = Lifecycle::new();
        tokio::spawn({
            let lifecycle = lifecycle.clone();
            async move {
                conn::serve(
                    listener,
                    router,
                    &lifecycle,
                    Timeouts::SERVER,
                    Duration::from_secs(1),
                )
                .await
            }
        });
        Self { address, lifecycle }
    }

    pub(crate) async fn connect(&self) -> TcpStream {
        dial_loopback(self.address).await
    }
}

impl Drop for Loopback {
    fn drop(&mut self) {
        self.lifecycle.stop();
    }
}

/// A response read off the wire: the head, lower-cased, and the body of its `Content-Length`.
pub(crate) struct WireResponse {
    pub(crate) head: String,
    pub(crate) body: Vec<u8>,
}

impl WireResponse {
    pub(crate) fn status(&self) -> u16 {
        self.head
            .split(' ')
            .nth(1)
            .and_then(|code| code.parse().ok())
            .expect("a status line")
    }

    /// A header's value, by its lower-case name.
    pub(crate) fn header(&self, name: &str) -> Option<&str> {
        self.head.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            (key.trim() == name).then(|| value.trim())
        })
    }
}

/// Reads one response with a `Content-Length` body.
pub(crate) async fn read_response(stream: &mut TcpStream) -> WireResponse {
    let mut buffered = Vec::new();
    let mut chunk = vec![0; 64 * 1024];
    let head_end = loop {
        if let Some(end) = buffered.windows(4).position(|window| window == b"\r\n\r\n") {
            break end + 4;
        }
        let read = stream.read(&mut chunk).await.expect("a response");
        assert_ne!(read, 0, "the connection closed inside the head");
        buffered.extend_from_slice(&chunk[..read]);
    };
    let head = String::from_utf8(buffered[..head_end].to_vec())
        .expect("a text head")
        .to_ascii_lowercase();
    let mut response = WireResponse {
        head,
        body: buffered[head_end..].to_vec(),
    };
    let length: usize = response
        .header("content-length")
        .map_or(0, |length| length.parse().expect("a length"));
    while response.body.len() < length {
        let read = stream.read(&mut chunk).await.expect("the body");
        assert_ne!(read, 0, "the connection closed inside the body");
        response.body.extend_from_slice(&chunk[..read]);
    }
    response
}

pub(crate) async fn send(stream: &mut TcpStream, bytes: &[u8]) {
    stream.write_all(bytes).await.expect("a write");
}
