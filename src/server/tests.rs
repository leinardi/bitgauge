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

//! Loopback tests of the connection driver and the shutdown sequence, on the real clock with
//! short injected timeouts, against a test-only echo service with an upgrade route.

mod echo;

use std::error::Error as _;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt as _, StreamExt as _};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;
use tokio::time::{Instant, timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

use self::echo::{EchoService, Hooks};
use super::conn::{self, Lifecycle, Outcome};
use super::timeouts::Timeouts;
use crate::test_support::dial_loopback;

/// Short timeouts, so the deadlines are seen in well under a second each.
const SHORT: Timeouts = Timeouts {
    head: Duration::from_millis(400),
    idle: Duration::from_millis(1500),
    write_stall: Duration::from_millis(500),
    shutdown_drain: Duration::from_millis(500),
};

/// The shutdown grace of the tests.
const GRACE: Duration = Duration::from_millis(800);

/// The test echo socket's idle timeout: longer than the head and idle deadlines together, so a
/// socket outliving those is shown to end by its own timer.
const SOCKET_IDLE: Duration = Duration::from_millis(2500);

/// Slack for scheduling on a busy test machine.
const SLACK: Duration = Duration::from_millis(250);

const GET: &[u8] = b"GET / HTTP/1.1\r\nHost: test\r\n\r\n";

/// A running test server.
struct Server {
    address: SocketAddr,
    lifecycle: Lifecycle,
    hooks: Arc<Hooks>,
    served: JoinHandle<Outcome>,
}

async fn start(timeouts: Timeouts, grace: Duration) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let lifecycle = Lifecycle::new();
    let hooks = Arc::new(Hooks::default());
    let service = EchoService::new(lifecycle.clone(), Arc::clone(&hooks), SOCKET_IDLE);
    let served = tokio::spawn({
        let lifecycle = lifecycle.clone();
        async move { conn::serve(listener, service, &lifecycle, timeouts, grace).await }
    });
    Server {
        address,
        lifecycle,
        hooks,
        served,
    }
}

impl Server {
    async fn connect(&self) -> TcpStream {
        dial_loopback(self.address).await
    }

    /// Stops the server and returns the outcome, failing if it takes longer than `within`.
    async fn stop_within(self, within: Duration) -> Outcome {
        self.lifecycle.stop();
        timeout(within, self.served)
            .await
            .expect("serve ends in time")
            .unwrap()
    }
}

/// Reads until the peer closes the connection or resets it; returns what was read and when.
async fn read_until_closed(stream: &mut TcpStream) -> (Vec<u8>, Instant) {
    let mut read = Vec::new();
    let mut buf = [0_u8; 8192];
    loop {
        match stream.read(&mut buf).await {
            Ok(0) | Err(_) => return (read, Instant::now()),
            Ok(count) => read.extend_from_slice(&buf[..count]),
        }
    }
}

/// Reads one response with a `Content-Length` body from `stream`, keeping what it read past the
/// response in `buffered` for the next call; returns its head and body.
async fn read_buffered(stream: &mut TcpStream, buffered: &mut Vec<u8>) -> (String, Vec<u8>) {
    let mut buf = [0_u8; 8192];
    loop {
        if let Some(end) = buffered.windows(4).position(|window| window == b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&buffered[..end]).into_owned();
            let length = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|value| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            while buffered.len() < end + 4 + length {
                let count = stream.read(&mut buf).await.unwrap();
                assert!(count > 0, "closed inside the body: {head}");
                buffered.extend_from_slice(&buf[..count]);
            }
            let body = buffered[end + 4..end + 4 + length].to_vec();
            buffered.drain(..end + 4 + length);
            return (head, body);
        }
        let count = stream.read(&mut buf).await.unwrap();
        assert!(
            count > 0,
            "closed before a response: {:?}",
            String::from_utf8_lossy(buffered)
        );
        buffered.extend_from_slice(&buf[..count]);
    }
}

/// Reads one response, for a test that expects nothing after it.
async fn read_response(stream: &mut TcpStream) -> (String, Vec<u8>) {
    let mut buffered = Vec::new();
    let response = read_buffered(stream, &mut buffered).await;
    assert!(buffered.is_empty(), "more than one response: {buffered:?}");
    response
}

fn assert_between(elapsed: Duration, low: Duration, high: Duration, what: &str) {
    assert!(
        elapsed >= low && elapsed <= high,
        "{what}: {elapsed:?}, want between {low:?} and {high:?}"
    );
}

#[tokio::test]
async fn fresh_connection_is_closed_at_the_head_timeout_not_the_idle_one() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    let connected = Instant::now();
    let (read, closed) = read_until_closed(&mut stream).await;
    assert!(read.is_empty(), "a response was written: {read:?}");
    assert_between(
        closed - connected,
        SHORT.head.saturating_sub(SLACK),
        SHORT.head + SLACK,
        "closed",
    );
}

#[tokio::test]
async fn keep_alive_past_the_head_timeout_is_closed_at_idle() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream.write_all(GET).await.unwrap();
    let (head, body) = read_response(&mut stream).await;
    let answered = Instant::now();
    assert!(head.starts_with("HTTP/1.1 200"), "{head}");
    assert_eq!(body, b"ok");
    let (_, closed) = read_until_closed(&mut stream).await;
    assert_between(
        closed - answered,
        SHORT.idle.saturating_sub(SLACK),
        SHORT.idle + SLACK,
        "closed",
    );
}

#[tokio::test]
async fn head_dripped_after_idle_is_cut_a_head_timeout_after_its_first_byte() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream.write_all(GET).await.unwrap();
    read_response(&mut stream).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    let first_byte = Instant::now();
    let (mut reader, mut writer) = stream.into_split();
    let drip = tokio::spawn(async move {
        for byte in b"GET /slow HTTP/1.1\r\nHost: test\r\n" {
            if writer.write_all(&[*byte]).await.is_err() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });
    let mut buf = Vec::new();
    let _ = reader.read_to_end(&mut buf).await;
    let closed = Instant::now();
    drip.abort();
    assert!(buf.is_empty(), "a response was written: {buf:?}");
    assert_between(
        closed - first_byte,
        SHORT.head.saturating_sub(SLACK),
        SHORT.head + SLACK,
        "cut",
    );
}

#[tokio::test]
async fn two_pipelined_requests_in_one_write_are_both_answered() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(
            b"GET / HTTP/1.1\r\nHost: test\r\n\r\nGET /second HTTP/1.1\r\nHost: test\r\n\r\n",
        )
        .await
        .unwrap();
    let mut buffered = Vec::new();
    let (first, first_body) = read_buffered(&mut stream, &mut buffered).await;
    let (second, second_body) = read_buffered(&mut stream, &mut buffered).await;
    assert!(first.starts_with("HTTP/1.1 200"), "{first}");
    assert!(second.starts_with("HTTP/1.1 200"), "{second}");
    assert_eq!(first_body, b"ok");
    assert_eq!(second_body, b"second");
}

#[tokio::test]
async fn pipelined_partial_head_is_cut_a_head_timeout_after_the_first_response() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"GET / HTTP/1.1\r\nHost: test\r\n\r\nGET /second HTTP/1.1\r\nHo")
        .await
        .unwrap();
    let mut buffered = Vec::new();
    let (head, _) = read_buffered(&mut stream, &mut buffered).await;
    let answered = Instant::now();
    assert!(head.starts_with("HTTP/1.1 200"), "{head}");
    assert!(
        buffered.is_empty(),
        "a second response was written: {buffered:?}"
    );
    let (rest, closed) = read_until_closed(&mut stream).await;
    assert!(rest.is_empty(), "a second response was written: {rest:?}");
    assert_between(
        closed - answered,
        SHORT.head.saturating_sub(SLACK),
        SHORT.head + SLACK,
        "cut",
    );
}

#[tokio::test]
async fn slow_upload_body_is_not_cut() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"POST /upload HTTP/1.1\r\nHost: test\r\nContent-Length: 12\r\n\r\n")
        .await
        .unwrap();
    // 12 bytes over 2.4 s: past the head timeout and the idle timeout, never stalled.
    for _ in 0..12 {
        tokio::time::sleep(Duration::from_millis(200)).await;
        stream.write_all(b"x").await.unwrap();
    }
    let (head, body) = read_response(&mut stream).await;
    assert!(head.starts_with("HTTP/1.1 200"), "{head}");
    assert_eq!(body, b"12");
}

/// Whether `error`, or anything it wraps, is an I/O timeout.
fn is_timed_out(error: &hyper::Error) -> bool {
    let mut source = error.source();
    while let Some(cause) = source {
        if cause
            .downcast_ref::<io::Error>()
            .is_some_and(|io| io.kind() == io::ErrorKind::TimedOut)
        {
            return true;
        }
        source = cause.source();
    }
    false
}

#[tokio::test]
async fn stalled_reader_is_cut_after_the_write_stall_timeout() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let lifecycle = Lifecycle::new();
    let service = EchoService::new(lifecycle.clone(), Arc::new(Hooks::default()), SOCKET_IDLE);
    let mut client = dial_loopback(address).await;
    let (stream, _) = listener.accept().await.unwrap();
    client
        .write_all(b"GET /endless HTTP/1.1\r\nHost: test\r\n\r\n")
        .await
        .unwrap();
    // The client never reads: the socket buffers fill, then every write waits.
    let started = Instant::now();
    let result = timeout(
        Duration::from_secs(10),
        conn::drive(stream, service, &lifecycle, SHORT),
    )
    .await
    .expect("the stalled connection is cut");
    let error = result.expect_err("the connection ends with an error");
    assert!(is_timed_out(&error), "not a timeout: {error:?}");
    assert!(
        started.elapsed() >= SHORT.write_stall,
        "cut before the stall timeout"
    );
    drop(client);
}

#[tokio::test]
async fn upgraded_socket_is_not_cut_by_the_head_or_idle_deadlines() {
    let server = start(SHORT, GRACE).await;
    let stream = server.connect().await;
    let (mut socket, _) = tokio_tungstenite::client_async("ws://test/ws", stream)
        .await
        .unwrap();
    tokio::time::sleep(SHORT.idle + SHORT.head).await;
    socket.send(Message::text("ping")).await.unwrap();
    let echoed = socket.next().await.unwrap().unwrap();
    assert_eq!(echoed, Message::text("ping"));
}

/// A silent upgraded socket outlives the head and idle deadlines and is closed by its own idle
/// timer, with 1000.
#[tokio::test]
async fn silent_upgraded_socket_is_closed_by_its_idle_timer() {
    let server = start(SHORT, GRACE).await;
    let stream = server.connect().await;
    let (mut socket, _) = tokio_tungstenite::client_async("ws://test/ws", stream)
        .await
        .unwrap();
    let upgraded = Instant::now();
    assert_eq!(close_code(&mut socket).await, Some(CloseCode::Normal));
    assert_between(
        upgraded.elapsed(),
        SOCKET_IDLE.saturating_sub(SLACK),
        SOCKET_IDLE + SLACK,
        "closed",
    );
}

/// The drain on close keeps a 413 answered without reading from being lost to a reset.
#[tokio::test]
async fn response_before_the_body_survives_the_close() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"POST /too-large HTTP/1.1\r\nHost: test\r\nContent-Length: 100000000\r\n\r\n")
        .await
        .unwrap();
    let (mut reader, mut writer) = stream.into_split();
    let upload = tokio::spawn(async move {
        let chunk = vec![0_u8; 65536];
        for _ in 0..32 {
            if writer.write_all(&chunk).await.is_err() {
                return;
            }
        }
    });
    let mut read = Vec::new();
    let _ = reader.read_to_end(&mut read).await;
    upload.abort();
    let text = String::from_utf8_lossy(&read);
    assert!(text.starts_with("HTTP/1.1 413"), "{text}");
}

#[tokio::test]
async fn head_over_16_kib_is_answered_431() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    let mut request = b"GET / HTTP/1.1\r\nHost: test\r\nX-Pad: ".to_vec();
    request.extend(std::iter::repeat_n(b'a', 17 * 1024));
    request.extend_from_slice(b"\r\n\r\n");
    stream.write_all(&request).await.unwrap();
    let (read, _) = read_until_closed(&mut stream).await;
    let text = String::from_utf8_lossy(&read);
    assert!(text.starts_with("HTTP/1.1 431"), "{text}");
}

#[tokio::test]
async fn no_connections_stops_at_once() {
    let server = start(SHORT, GRACE).await;
    let outcome = server.stop_within(SLACK).await;
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

#[tokio::test]
async fn idle_keep_alive_is_closed_and_the_server_stops() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream.write_all(GET).await.unwrap();
    read_response(&mut stream).await;
    // The client closes when the server does, as a browser does; the server then stops at once.
    let stopped = tokio::spawn(server.stop_within(GRACE / 2));
    let (rest, _) = read_until_closed(&mut stream).await;
    drop(stream);
    assert!(rest.is_empty(), "{rest:?}");
    let outcome = stopped.await.unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

/// Reads a chunked response until the server closes, then closes too, as a browser does; whether
/// the terminating chunk arrived.
async fn read_chunked_to_end(mut stream: TcpStream) -> bool {
    let (read, _) = read_until_closed(&mut stream).await;
    drop(stream);
    read.ends_with(b"0\r\n\r\n")
}

#[tokio::test]
async fn download_ending_inside_the_grace_completes() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"GET /download?ms=400 HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut first = [0_u8; 1];
    stream.read_exact(&mut first).await.unwrap();
    let stopped = tokio::spawn(server.stop_within(GRACE + SLACK));
    assert!(read_chunked_to_end(stream).await, "the download was cut");
    let outcome = stopped.await.unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

/// The same on a keep-alive connection: the response in flight at `stop` completes, and then the
/// server closes the connection by itself.
#[tokio::test]
async fn keep_alive_download_completes_and_then_the_connection_is_closed() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"GET /download?ms=400 HTTP/1.1\r\nHost: test\r\n\r\n")
        .await
        .unwrap();
    let mut first = [0_u8; 1];
    stream.read_exact(&mut first).await.unwrap();
    let stopped = tokio::spawn(server.stop_within(GRACE + SLACK));
    assert!(read_chunked_to_end(stream).await, "the download was cut");
    let outcome = stopped.await.unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

#[tokio::test]
async fn download_past_the_grace_is_cut() {
    let server = start(SHORT, GRACE).await;
    let mut stream = server.connect().await;
    stream
        .write_all(b"GET /download?ms=5000 HTTP/1.1\r\nHost: test\r\n\r\n")
        .await
        .unwrap();
    let mut first = [0_u8; 1];
    stream.read_exact(&mut first).await.unwrap();
    let stopping = Instant::now();
    let outcome = server.stop_within(GRACE + conn::CUT_WAIT + SLACK).await;
    assert!(matches!(outcome, Outcome::GraceExceeded), "{outcome:?}");
    assert!(stopping.elapsed() >= GRACE, "cut before the grace");
    assert!(!read_chunked_to_end(stream).await, "the download completed");
    assert_eq!(super::exit_code(&outcome), std::process::ExitCode::FAILURE);
}

/// Reads the next frame of a client socket: the close code, if it is a close.
async fn close_code<S>(socket: &mut tokio_tungstenite::WebSocketStream<S>) -> Option<CloseCode>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    match timeout(Duration::from_secs(5), socket.next())
        .await
        .expect("a frame in time")
    {
        Some(Ok(Message::Close(Some(frame)))) => Some(frame.code),
        other => panic!("not a close frame: {other:?}"),
    }
}

#[tokio::test]
async fn open_websockets_each_get_1001() {
    let server = start(SHORT, GRACE).await;
    let mut sockets = Vec::new();
    for _ in 0..2 {
        let stream = server.connect().await;
        let (socket, _) = tokio_tungstenite::client_async("ws://test/ws", stream)
            .await
            .unwrap();
        sockets.push(socket);
    }
    let stopped = tokio::spawn(server.stop_within(GRACE));
    for socket in &mut sockets {
        assert_eq!(close_code(socket).await, Some(CloseCode::Away));
    }
    let outcome = stopped.await.unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
    assert_eq!(super::exit_code(&outcome), std::process::ExitCode::SUCCESS);
}

/// The 101 is written after `stop`: the socket's task was registered first, so shutdown awaits it
/// and it closes with 1001.
#[tokio::test]
async fn upgrade_racing_stop_gets_the_101_then_1001() {
    let server = start(SHORT, GRACE).await;
    let stream = server.connect().await;
    let client = tokio::spawn(async move {
        let (mut socket, response) = tokio_tungstenite::client_async("ws://test/ws-slow", stream)
            .await
            .unwrap();
        assert_eq!(response.status(), http::StatusCode::SWITCHING_PROTOCOLS);
        close_code(&mut socket).await
    });
    server.hooks.slow_reached.notified().await;
    server.lifecycle.stop();
    tokio::time::sleep(Duration::from_millis(50)).await;
    server.hooks.slow_release.notify_one();
    assert_eq!(client.await.unwrap(), Some(CloseCode::Away));
    let outcome = timeout(GRACE, server.served).await.unwrap().unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

/// The scheduling gap: the upgrade resolves after the HTTP task has ended, and is held there by a
/// test hook. `stop` comes while it is held; the tracker must not finish until the socket task has
/// sent its 1001.
#[tokio::test]
async fn shutdown_awaits_a_socket_whose_upgrade_resolves_after_the_http_task() {
    let server = start(SHORT, GRACE).await;
    let stream = server.connect().await;
    let (mut socket, response) = tokio_tungstenite::client_async("ws://test/ws-held", stream)
        .await
        .unwrap();
    assert_eq!(response.status(), http::StatusCode::SWITCHING_PROTOCOLS);
    server.hooks.held_resolved.notified().await;
    server.lifecycle.stop();
    tokio::time::sleep(GRACE / 2).await;
    assert!(
        !server.served.is_finished(),
        "shutdown finished while the socket task was pending"
    );
    server.hooks.held_release.notify_one();
    assert_eq!(close_code(&mut socket).await, Some(CloseCode::Away));
    let outcome = timeout(GRACE, server.served).await.unwrap().unwrap();
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
}

/// `cut` while the upgrade is still pending ends the socket task without a close frame, and the
/// tracker's wait completes.
#[tokio::test]
async fn cut_while_the_upgrade_is_pending_ends_without_a_close() {
    let server = start(SHORT, GRACE).await;
    let stream = server.connect().await;
    let (mut socket, _) = tokio_tungstenite::client_async("ws://test/ws-held", stream)
        .await
        .unwrap();
    server.hooks.held_resolved.notified().await;
    let tracker = server.lifecycle.tracker().clone();
    let outcome = server.stop_within(GRACE + conn::CUT_WAIT + SLACK).await;
    assert!(matches!(outcome, Outcome::GraceExceeded), "{outcome:?}");
    assert!(tracker.is_empty(), "a task outlived the cut");
    match timeout(Duration::from_secs(5), socket.next())
        .await
        .unwrap()
    {
        Some(Ok(Message::Close(frame))) => panic!("a close frame was sent: {frame:?}"),
        Some(Ok(other)) => panic!("an unexpected frame: {other:?}"),
        None | Some(Err(_)) => {}
    }
}
