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

//! The WebSocket echo over loopback, through the real connection driver, on the real clock.

use std::net::{IpAddr, Ipv4Addr};
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::Request;
use axum::routing::any;
use futures_util::{SinkExt as _, StreamExt as _};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpStream;
use tokio::time::{Instant, sleep, timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest as _;
use tokio_tungstenite::tungstenite::error::Error as WsError;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::{WebSocketStream, client_async};

use super::support::{Loopback, read_response, sample, send};
use crate::clientip::Client;
use crate::clock::TokioClock;
use crate::config::Origin;
use crate::handlers::{WEBSOCKET_IDLE, WEBSOCKET_READ_LIMIT, WebSockets};
use crate::logger;
use crate::metrics::Metrics;
use crate::ratelimit::{Limiter, Options, WEBSOCKETS_PER_CLIENT};
use crate::server::conn::Lifecycle;
use tracing_setup::testing::Capture;

/// A failsafe against a hang, far above what any test here waits for; not a wait for state.
const FAILSAFE: Duration = Duration::from_secs(30);

type Socket = WebSocketStream<TcpStream>;

/// The echo behind a stand-in for the client IP middleware, on a lifecycle of its own so that a
/// test can stop the sockets while the server still accepts.
struct WsServer {
    server: Loopback,
    sockets: Lifecycle,
    meter: Arc<Metrics>,
}

impl WsServer {
    async fn start(allowed: &[&str], idle: Duration) -> Self {
        let limiter = Limiter::new(
            Options {
                max_streams: 8,
                requests_per_minute: 1200,
                tracked_clients: 64,
                max_flows: 32,
            },
            TokioClock,
        );
        let meter = Arc::new(Metrics::new(
            crate::buildinfo::info(),
            {
                let limiter = limiter.clone();
                move || limiter.tracked_clients()
            },
            &[],
        ));
        let sockets = Lifecycle::new();
        let allowed: Vec<Origin> = allowed
            .iter()
            .map(|origin| origin.parse().expect("an origin"))
            .collect();
        let echo = WebSockets::new(limiter, &allowed, idle, Arc::clone(&meter), sockets.clone());
        let router = Router::new().route(
            "/",
            any(move |mut request: Request| async move {
                request.extensions_mut().insert(Client {
                    address: IpAddr::V4(Ipv4Addr::LOCALHOST),
                    peer_trusted: false,
                });
                echo.respond(request)
            }),
        );
        Self {
            server: Loopback::start(router).await,
            sockets,
            meter,
        }
    }

    fn host(&self) -> String {
        self.server.address.to_string()
    }

    /// Opens a connection, or returns the refused handshake's status and `Retry-After`.
    async fn dial(&self, origin: Option<&str>) -> Result<Socket, (u16, Option<String>)> {
        let mut request = format!("ws://{}/", self.host())
            .into_client_request()
            .expect("a client request");
        if let Some(origin) = origin {
            request.headers_mut().insert(
                "origin",
                HeaderValue::from_str(origin).expect("an origin header"),
            );
        }
        let stream = self.server.connect().await;
        match timeout(FAILSAFE, client_async(request, stream))
            .await
            .expect("a handshake in time")
        {
            Ok((socket, _response)) => Ok(socket),
            Err(WsError::Http(response)) => Err((
                response.status().as_u16(),
                response
                    .headers()
                    .get("retry-after")
                    .map(|value| value.to_str().expect("a text header").to_owned()),
            )),
            Err(error) => panic!("handshake: {error}"),
        }
    }

    async fn must_dial(&self) -> Socket {
        match self.dial(None).await {
            Ok(socket) => socket,
            Err((status, _)) => panic!("handshake refused with {status}"),
        }
    }

    /// Opens a connection and waits for one pong, which proves it reached the echo loop.
    async fn must_echo(&self) -> Socket {
        let mut socket = self.must_dial().await;
        send_text(&mut socket, r#"{"type":"ping","seq":1,"t":5}"#).await;
        assert_eq!(
            receive(&mut socket).await,
            r#"{"type":"pong","seq":1,"t":5}"#
        );
        socket
    }

    /// Waits until `open` socket tasks are left on the sockets' tracker: the others have ended
    /// and so given their slots back.
    async fn settle(&self, open: usize) {
        timeout(FAILSAFE, async {
            while self.sockets.tracker().len() != open {
                sleep(Duration::from_millis(2)).await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("{} socket tasks, want {open}", self.sockets.tracker().len()));
    }

    fn sample(&self, series: &str) -> String {
        sample(&self.meter, series)
    }
}

async fn send_text(socket: &mut Socket, text: &str) {
    socket.send(Message::text(text)).await.expect("a send");
}

async fn receive(socket: &mut Socket) -> String {
    match timeout(FAILSAFE, socket.next())
        .await
        .expect("an answer in time")
    {
        Some(Ok(Message::Text(text))) => text.as_str().to_owned(),
        other => panic!("read {other:?}"),
    }
}

/// Reads until the server's close frame and returns its code, then on to the stream's end, as a
/// client does: the library answers the close while it reads.
async fn closed_with(socket: &mut Socket) -> Option<CloseCode> {
    timeout(FAILSAFE, async {
        let mut code = None;
        while let Some(Ok(message)) = socket.next().await {
            if let Message::Close(frame) = message {
                code = frame.map(|frame| frame.code);
            }
        }
        code
    })
    .await
    .expect("a close in time")
}

/// Go: `TestWebSocketEchoesSeqAndTUnchanged`, plus `null` and a value with whitespace inside,
/// both echoed as sent (`docs/rust-port.md` row 11).
#[tokio::test]
async fn echoes_seq_and_t_unchanged() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut socket = server.must_dial().await;
    for (ping, pong) in [
        (
            r#"{"type":"ping","seq":17,"t":48213.512}"#,
            r#"{"type":"pong","seq":17,"t":48213.512}"#,
        ),
        // A float with more digits than an f64 holds comes back as the same text.
        (
            r#"{"type":"ping","seq":18,"t":0.1000000000000000055511151231257827021181583404541015625}"#,
            r#"{"type":"pong","seq":18,"t":0.1000000000000000055511151231257827021181583404541015625}"#,
        ),
        (
            r#"{ "t" : 1e3 , "type" : "ping" , "seq" : 19 }"#,
            r#"{"type":"pong","seq":19,"t":1e3}"#,
        ),
        (
            r#"{"type":"ping","seq":null,"t":[1, 2]}"#,
            r#"{"type":"pong","seq":null,"t":[1, 2]}"#,
        ),
        (r#"{"type":"ping"}"#, r#"{"type":"pong"}"#),
    ] {
        send_text(&mut socket, ping).await;
        assert_eq!(receive(&mut socket).await, pong);
    }
}

/// Go: `TestWebSocketIgnoresUnknownTypes`, with a `null` type and a key of another case, which
/// Rust matches case-sensitively (`docs/rust-port.md` row 11).
#[tokio::test]
async fn ignores_unknown_types() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut socket = server.must_dial().await;
    send_text(&mut socket, r#"{"type":"hello","seq":1}"#).await;
    send_text(&mut socket, r#"{"type":null,"seq":2}"#).await;
    send_text(&mut socket, r#"{"Type":"ping","seq":3}"#).await;
    send_text(&mut socket, r#"{"type":"ping","seq":4,"t":5}"#).await;
    // The first answer is the pong to the last message: nothing answered the others.
    assert_eq!(
        receive(&mut socket).await,
        r#"{"type":"pong","seq":4,"t":5}"#
    );
}

/// Go: `TestWebSocketCloseCodes`, plus the 1007 cases of `docs/rust-port.md` row 11.
#[tokio::test]
async fn close_codes() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    // A message of exactly 256 bytes is accepted.
    let ping = r#"{"type":"ping","seq":1,"t":2}"#;
    let exact = format!("{ping}{}", " ".repeat(WEBSOCKET_READ_LIMIT - ping.len()));
    let mut socket = server.must_dial().await;
    send_text(&mut socket, &exact).await;
    assert_eq!(
        receive(&mut socket).await,
        r#"{"type":"pong","seq":1,"t":2}"#
    );
    drop(socket);
    server.settle(0).await;

    let too_big = format!("{exact} ");
    for (name, message, code) in [
        ("257 bytes", Message::text(too_big), CloseCode::Size),
        (
            "binary",
            Message::binary(ping.as_bytes().to_vec()),
            CloseCode::Unsupported,
        ),
        (
            "truncated",
            Message::text(r#"{"type":"ping","#),
            CloseCode::Invalid,
        ),
        ("an array", Message::text("[1,2]"), CloseCode::Invalid),
        ("null", Message::text("null"), CloseCode::Invalid),
        (
            "a duplicate key",
            Message::text(r#"{"type":"ping","seq":1,"seq":2}"#),
            CloseCode::Invalid,
        ),
        (
            "a duplicate unknown key",
            Message::text(r#"{"x":1,"x":2,"type":"ping"}"#),
            CloseCode::Invalid,
        ),
        (
            "a number type",
            Message::text(r#"{"type":5}"#),
            CloseCode::Invalid,
        ),
    ] {
        let mut socket = server.must_dial().await;
        socket.send(message).await.expect("a send");
        assert_eq!(closed_with(&mut socket).await, Some(code), "{name}");
        drop(socket);
        server.settle(0).await;
    }
}

/// Invalid UTF-8 in a text frame closes with 1007 (`docs/rust-port.md` row 11); no Go test, as
/// Go's library does not check it. The frame is written by hand, since a client library will not
/// send one.
#[tokio::test]
async fn invalid_utf8_closes_with_1007() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let (mut raw, _) = raw_dial(&server).await;
    send(&mut raw, &masked_text_frame(&[b'{', 0xff, b'}'])).await;
    let header = read_close_header(&mut raw).await;
    assert_eq!(header, (0x88, u16::from(CloseCode::Invalid)));
}

/// Go: `TestWebSocketIdleClose` on the real clock with a short window. Go also checked that one
/// timer stays armed; here the window is one timer reset by each message, by construction.
#[tokio::test]
async fn idle_close() {
    const WINDOW: Duration = Duration::from_millis(400);
    let server = WsServer::start(&[], WINDOW).await;
    let mut socket = server.must_echo().await;
    // A message before the window ends restarts it: three of them span more than one window.
    for seq in 2..=4 {
        sleep(WINDOW / 2).await;
        send_text(&mut socket, &format!(r#"{{"type":"ping","seq":{seq}}}"#)).await;
        assert_eq!(
            receive(&mut socket).await,
            format!(r#"{{"type":"pong","seq":{seq}}}"#)
        );
    }
    // A full window without a message closes with 1000.
    let quiet = Instant::now();
    assert_eq!(closed_with(&mut socket).await, Some(CloseCode::Normal));
    assert!(
        quiet.elapsed() >= WINDOW.mul_f64(0.9),
        "{:?}",
        quiet.elapsed()
    );
}

/// Go: `TestWebSocketOrigin`
#[tokio::test]
async fn origin() {
    let server = WsServer::start(
        &["https://speed.example", "http://lan.example:8080"],
        WEBSOCKET_IDLE,
    )
    .await;
    let host = server.host();
    let other_address = host.replace("127.0.0.1", "127.0.0.2");
    for (origin, accepted) in [
        (None, true),
        (Some(format!("http://{host}")), true),
        // Behind a TLS proxy the page is https while the server sees http.
        (Some(format!("https://{host}")), true),
        (Some("https://speed.example".to_owned()), true),
        (Some("HTTPS://Speed.Example:443".to_owned()), true),
        (Some("http://lan.example:8080".to_owned()), true),
        (Some("http://speed.example".to_owned()), false),
        (Some("https://evil.example".to_owned()), false),
        (Some("http://lan.example".to_owned()), false),
        (Some("null".to_owned()), false),
        (Some(format!("http://{other_address}")), false),
    ] {
        match (server.dial(origin.as_deref()).await, accepted) {
            (Ok(mut socket), true) => {
                socket.close(None).await.expect("a close");
            }
            (Err((status, _)), false) => assert_eq!(status, 403, "{origin:?}"),
            (Ok(_), false) => panic!("origin {origin:?} accepted"),
            (Err((status, _)), true) => panic!("origin {origin:?} refused with {status}"),
        }
        server.settle(0).await;
    }
}

/// Two Origin headers are refused (no Go test: Go's check is the same line).
#[tokio::test]
async fn two_origins_are_refused() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut stream = server.server.connect().await;
    send(
        &mut stream,
        format!(
            "GET / HTTP/1.1\r\nHost: {}\r\nOrigin: http://{0}\r\nOrigin: http://{0}\r\n{HANDSHAKE}\r\n",
            server.host()
        )
        .as_bytes(),
    )
    .await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("an answer");
    assert_eq!(response.status(), 403);
    assert_eq!(response.header("cache-control"), Some("no-store"));
}

/// Go: `TestWebSocketFifthConnectionIs429`
#[tokio::test]
async fn fifth_connection_is_429() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut open = Vec::new();
    for _ in 0..WEBSOCKETS_PER_CLIENT {
        open.push(server.must_dial().await);
    }
    let Err((status, retry_after)) = server.dial(None).await else {
        panic!("a fifth connection was accepted");
    };
    assert_eq!((status, retry_after.as_deref()), (429, Some("1")));
    // Closing one frees its slot.
    open[0].close(None).await.expect("a close");
    server.settle(open.len() - 1).await;
    let _sixth = server.must_dial().await;
}

/// The handshake lines after the request line and Host, with the RFC 6455 sample key.
const HANDSHAKE: &str = "Upgrade: websocket\r\nConnection: Upgrade\r\n\
    Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n";

/// Does the handshake by hand, so the test sees the TCP connection itself: whether the server
/// ends it, not only whether it wrote a close frame. Returns what came after the 101's head.
async fn raw_dial(server: &WsServer) -> (TcpStream, Vec<u8>) {
    let mut stream = server.server.connect().await;
    send(
        &mut stream,
        format!(
            "GET / HTTP/1.1\r\nHost: {}\r\n{HANDSHAKE}\r\n",
            server.host()
        )
        .as_bytes(),
    )
    .await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("a 101");
    assert_eq!(response.status(), 101);
    assert_eq!(
        response.header("sec-websocket-accept"),
        Some("s3pplmbitxaq9kygzzhzrbk+xoo="),
        "the RFC 6455 sample's accept key, lower-cased with the head"
    );
    (stream, response.body)
}

/// One client text frame (FIN set, masked) carrying `payload`.
fn masked_text_frame(payload: &[u8]) -> Vec<u8> {
    const MASK: [u8; 4] = [0x1b, 0x2c, 0x3d, 0x4e];
    let mut frame = vec![0x81];
    match u8::try_from(payload.len()) {
        Ok(length) if length < 126 => frame.push(0x80 | length),
        _ => {
            frame.push(0x80 | 0x7e);
            let length = u16::try_from(payload.len()).expect("a 16-bit length");
            frame.extend_from_slice(&length.to_be_bytes());
        }
    }
    frame.extend_from_slice(&MASK);
    frame.extend(
        payload
            .iter()
            .zip(MASK.iter().cycle())
            .map(|(byte, mask)| byte ^ mask),
    );
    frame
}

/// Reads the server's close frame, which is unmasked and short, and returns its first byte and
/// status code; the reason is read past.
async fn read_close_header(stream: &mut TcpStream) -> (u8, u16) {
    let mut header = [0; 4];
    timeout(FAILSAFE, stream.read_exact(&mut header))
        .await
        .expect("a close frame in time")
        .expect("a close frame");
    assert!(header[1] >= 2 && header[1] < 126, "frame {header:x?}");
    let mut reason = vec![0; usize::from(header[1] - 2)];
    stream.read_exact(&mut reason).await.expect("the reason");
    (header[0], u16::from_be_bytes([header[2], header[3]]))
}

/// Go: `TestWebSocketReadLimitClosesTheConnection`, and `TestWebSocketsAreCounted`'s gauge.
#[tokio::test]
async fn read_limit_closes_the_connection() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut open = Vec::new();
    for _ in 1..WEBSOCKETS_PER_CLIENT {
        open.push(server.must_echo().await);
    }
    let (mut raw, _) = raw_dial(&server).await;
    send(
        &mut raw,
        &masked_text_frame(&[b' '; WEBSOCKET_READ_LIMIT + 1]),
    )
    .await;
    assert_eq!(
        read_close_header(&mut raw).await,
        (0x88, u16::from(CloseCode::Size))
    );
    // The server ends the TCP connection too, rather than holding it after freeing its slot.
    let mut rest = Vec::new();
    timeout(FAILSAFE, raw.read_to_end(&mut rest))
        .await
        .expect("the end in time")
        .expect("a clean end");
    assert!(rest.is_empty(), "{rest:x?}");
    server.settle(open.len()).await;

    // Its slot is free, so one more fits and four are open again; a fifth is refused.
    open.push(server.must_echo().await);
    let Err((status, retry_after)) = server.dial(None).await else {
        panic!("a fifth connection was accepted");
    };
    assert_eq!(status, 429);
    assert!(retry_after.is_some());
    assert_eq!(server.sample("bitgauge_websocket_connections"), "4");
}

/// Go: `TestWebSocketsAreCounted`
#[tokio::test]
async fn websockets_are_counted() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut open = Vec::new();
    for _ in 0..WEBSOCKETS_PER_CLIENT {
        open.push(server.must_echo().await);
    }
    assert!(
        server.dial(None).await.is_err(),
        "a fifth WebSocket was accepted"
    );
    assert_eq!(server.sample("bitgauge_websocket_connections"), "4");
    assert_eq!(
        server.sample(r#"bitgauge_rate_limited_total{limit="websocket"}"#),
        "1"
    );
    assert_eq!(server.sample("bitgauge_ratelimit_tracked_clients"), "1");

    // An unknown type is not an echo.
    send_text(&mut open[0], r#"{"type":"hello","seq":9}"#).await;
    send_text(&mut open[0], r#"{"type":"ping","seq":10}"#).await;
    receive(&mut open[0]).await;

    // Once every task has ended, every echo has been counted and every connection closed.
    for socket in &mut open {
        socket.close(None).await.expect("a close");
    }
    server.settle(0).await;
    assert_eq!(server.sample("bitgauge_websocket_connections"), "0");
    assert_eq!(server.sample("bitgauge_websocket_messages_total"), "5");
}

/// Go: `TestWebSocketOpenAndCloseAreLoggedAtDebug`. The test runs on one thread, so the socket
/// task sees the test's default subscriber.
#[tokio::test(flavor = "current_thread")]
async fn open_and_close_are_logged_at_debug() {
    let logs = Capture::default();
    let dispatch = logger::to_writer(logs.clone(), "json", "debug").expect("a logger");
    let _default = tracing::dispatcher::set_default(&dispatch);
    // While only one dispatcher is registered, tracing-core computes a callsite's interest from
    // the calling thread's default, so another test's thread reaching the socket's callsites
    // first would cache them as never enabled. A second registered dispatcher makes it ask
    // every registered one.
    let _second = tracing::Dispatch::new(tracing::subscriber::NoSubscriber::default());
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut socket = server.must_echo().await;
    socket.close(None).await.expect("a close");
    server.settle(0).await;

    let records: Vec<_> = logs
        .json_lines()
        .into_iter()
        .filter(|record| {
            record["message"]
                .as_str()
                .is_some_and(|message| message.starts_with("websocket"))
        })
        .collect();
    let messages: Vec<_> = records
        .iter()
        .map(|record| record["message"].as_str())
        .collect();
    assert_eq!(messages, [Some("websocket open"), Some("websocket close")]);
    for record in &records {
        // The client address alone: never a message, a header or a seq.
        let mut keys: Vec<_> = record
            .as_object()
            .expect("an object")
            .keys()
            .cloned()
            .collect();
        keys.sort();
        assert_eq!(
            keys,
            ["client", "level", "message", "timestamp"],
            "{record}"
        );
        assert_eq!(
            (record["level"].as_str(), record["client"].as_str()),
            (Some("DEBUG"), Some("127.0.0.1"))
        );
    }
}

/// Go: `TestWebSocketNotAHandshakeIs400`, with each check of the handshake.
#[tokio::test]
async fn not_a_handshake_is_400() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let host = server.host();
    let key = "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n";
    for (name, head) in [
        (
            "plain GET",
            format!("GET / HTTP/1.1\r\nHost: {host}\r\n\r\n"),
        ),
        (
            "HTTP/1.0",
            format!("GET / HTTP/1.0\r\nHost: {host}\r\n{HANDSHAKE}\r\n"),
        ),
        (
            "version 8",
            format!(
                "GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n{key}Sec-WebSocket-Version: 8\r\n\r\n"
            ),
        ),
        (
            "no upgrade token",
            format!(
                "GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: keep-alive\r\n{key}Sec-WebSocket-Version: 13\r\n\r\n"
            ),
        ),
        (
            "a short key",
            format!(
                "GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: c2hvcnQ=\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ),
        ),
        (
            "two keys",
            format!(
                "GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n{key}{key}Sec-WebSocket-Version: 13\r\n\r\n"
            ),
        ),
    ] {
        let mut stream = server.server.connect().await;
        send(&mut stream, head.as_bytes()).await;
        let response = timeout(FAILSAFE, read_response(&mut stream))
            .await
            .expect("an answer");
        assert_eq!(response.status(), 400, "{name}");
        assert_eq!(
            response.header("content-type"),
            Some("application/json"),
            "{name}"
        );
        assert_eq!(
            response.header("sec-websocket-version"),
            Some("13"),
            "{name}"
        );
    }
    // A key with a token list in Connection passes.
    let mut stream = server.server.connect().await;
    send(
        &mut stream,
        format!("GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: WebSocket\r\nConnection: keep-alive, Upgrade\r\n{key}Sec-WebSocket-Version: 13\r\n\r\n").as_bytes(),
    )
    .await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("an answer");
    assert_eq!(response.status(), 101);
}

/// Go: `TestWebSocketCloseAll`: `stop` closes every open socket with 1001, and one upgraded
/// after `stop` is closed with 1001 at once.
#[tokio::test]
async fn stop_closes_every_socket_with_1001() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let mut first = server.must_echo().await;
    let mut second = server.must_echo().await;
    server.sockets.stop();
    assert_eq!(closed_with(&mut first).await, Some(CloseCode::Away));
    assert_eq!(closed_with(&mut second).await, Some(CloseCode::Away));
    let mut late = server.must_dial().await;
    assert_eq!(closed_with(&mut late).await, Some(CloseCode::Away));
    server.sockets.tracker().close();
    timeout(FAILSAFE, server.sockets.tracker().wait())
        .await
        .expect("every task ended");
}

/// Go: `TestWebSocketCloseAllHonoursItsContext`: a client that never answers the 1001 holds its
/// task for the close wait, and `cut` ends it at once.
#[tokio::test]
async fn cut_ends_a_close_the_client_never_answers() {
    let server = WsServer::start(&[], WEBSOCKET_IDLE).await;
    let (mut raw, _) = raw_dial(&server).await;
    send(&mut raw, &masked_text_frame(br#"{"type":"ping","seq":1}"#)).await;
    let mut pong = [0; 2];
    raw.read_exact(&mut pong).await.expect("the pong's head");
    server.sockets.stop();
    server.sockets.tracker().close();
    assert!(
        timeout(Duration::from_millis(200), server.sockets.tracker().wait())
            .await
            .is_err(),
        "the task ended before the client's close"
    );
    let cut = Instant::now();
    server.sockets.cut_token().cancel();
    timeout(FAILSAFE, server.sockets.tracker().wait())
        .await
        .expect("every task ended");
    assert!(
        cut.elapsed() < Duration::from_secs(1),
        "{:?}",
        cut.elapsed()
    );
    raw.shutdown().await.ok();
}
