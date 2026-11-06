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

//! `/api/v1/ws`, the idle-latency echo (wire-protocol.md section 6).
//!
//! The handshake is checked by hand, in Go's order: the Origin (403), the handshake itself (400
//! with `Sec-WebSocket-Version: 13`), then one of the client's WebSocket slots (429). The socket's
//! task is registered on the lifecycle's tracker before the `101` is returned
//! ([`spawn_socket_task`]), and holds the slot until it ends.

use std::collections::HashSet;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt as _, StreamExt as _};
use http::header::{
    CACHE_CONTROL, CONNECTION, ORIGIN, SEC_WEBSOCKET_ACCEPT, SEC_WEBSOCKET_KEY,
    SEC_WEBSOCKET_VERSION, UPGRADE,
};
use http::{HeaderMap, HeaderValue, Request, Response, StatusCode, Version};
use hyper::upgrade::Upgraded;
use hyper_util::rt::TokioIo;
use tokio::time::{Instant, sleep, timeout};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message as Frame;
use tokio_tungstenite::tungstenite::error::{Error as WsError, ProtocolError};
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{Role, WebSocketConfig};

use self::message::Message;
use super::origin::request_host;
use super::{Body, CODE_BAD_REQUEST, CODE_INTERNAL, NO_STORE, error_response, normalize_origin};
use crate::clientip::Client;
use crate::config::{Origin, url};
use crate::metrics::Metrics;
use crate::ratelimit::Limiter;
use crate::server::Lifecycle;
use crate::server::upgrade::{SocketShutdown, spawn_socket_task};

mod message;

/// The largest message accepted, and the largest frame; a larger one closes with 1009.
pub const READ_LIMIT: usize = 256;
/// How long a connection may go without a message before it closes with 1000.
pub const IDLE: Duration = Duration::from_secs(120);
/// How long a close handshake the server starts waits for the client's close frame, as Go's
/// coder/websocket waits.
const CLOSE_WAIT: Duration = Duration::from_secs(5);
/// The decoded length of a valid `Sec-WebSocket-Key`.
const KEY_BYTES: usize = 16;
const VERSION_13: HeaderValue = HeaderValue::from_static("13");
const TOKEN_UPGRADE: &str = "upgrade";
const TOKEN_WEBSOCKET: &str = "websocket";

/// The echo endpoint. It keeps nothing about a connection beyond the connection itself; the
/// lifecycle's tracker owns every socket task, so shutdown reaches them through `stop` and `cut`.
#[derive(Debug, Clone)]
pub struct WebSockets {
    inner: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    limiter: Limiter,
    meter: Arc<Metrics>,
    allowed: HashSet<String>,
    idle: Duration,
}

impl WebSockets {
    /// The echo endpoint. `allowed_origins` is `server.cors.allowed_origins`; `idle` is [`IDLE`]
    /// outside tests. `meter` counts the open connections, the echoed pings and the refused
    /// handshakes.
    #[must_use]
    pub fn new(
        limiter: Limiter,
        allowed_origins: &[Origin],
        idle: Duration,
        meter: Arc<Metrics>,
    ) -> Self {
        let allowed = allowed_origins
            .iter()
            .filter_map(|origin| normalize_origin(origin.as_str()))
            .collect();
        Self {
            inner: Arc::new(Inner {
                limiter,
                meter,
                allowed,
                idle,
            }),
        }
    }

    /// Checks the handshake and, when it passes, registers the socket's task and answers `101`.
    /// The client comes from the [`Client`] the client IP middleware stores; without it the
    /// answer is a 500 envelope.
    pub fn respond<B>(&self, mut request: Request<B>) -> Response<Body> {
        if !self.origin_allowed(&request) {
            // wire-protocol.md section 7 lists this plain 403 among the responses with no envelope.
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::FORBIDDEN;
            response.headers_mut().insert(CACHE_CONTROL, NO_STORE);
            return response;
        }
        let Some(key) = handshake_key(&request) else {
            let mut response = error_response(
                StatusCode::BAD_REQUEST,
                CODE_BAD_REQUEST,
                "a WebSocket handshake is required",
                None,
            );
            response
                .headers_mut()
                .insert(SEC_WEBSOCKET_VERSION, VERSION_13);
            return response;
        };
        let accept = derive_accept_key(key.as_bytes());
        let Some(client) = request.extensions().get::<Client>().copied() else {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                CODE_INTERNAL,
                "client address unavailable",
                None,
            );
        };
        let permit = match self.inner.limiter.acquire_websocket(client.address) {
            Ok(permit) => permit,
            Err(refused) => return super::refuse(request.version(), &refused, &self.inner.meter),
        };
        // The connection's own lifecycle, which the server stores in every request: the socket's
        // task is registered on its tracker and obeys its `stop` and `cut`.
        let Some(lifecycle) = request.extensions().get::<Lifecycle>().cloned() else {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                CODE_INTERNAL,
                "server lifecycle unavailable",
                None,
            );
        };
        let upgrade = hyper::upgrade::on(&mut request);
        let inner = Arc::clone(&self.inner);
        spawn_socket_task(&lifecycle, upgrade, permit, move |io, shutdown| {
            serve(io, shutdown, inner, client.address)
        });
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::SWITCHING_PROTOCOLS;
        let headers = response.headers_mut();
        headers.insert(UPGRADE, HeaderValue::from_static(TOKEN_WEBSOCKET));
        headers.insert(CONNECTION, HeaderValue::from_static("Upgrade"));
        if let Ok(accept) = HeaderValue::try_from(accept) {
            headers.insert(SEC_WEBSOCKET_ACCEPT, accept);
        }
        response
    }

    /// The Origin rule of wire-protocol.md section 6: no Origin (a non-browser client), an
    /// origin whose host and port equal the request's host whatever its scheme (behind a TLS
    /// proxy the server sees http while the page is https), or an origin in
    /// `server.cors.allowed_origins`.
    fn origin_allowed<B>(&self, request: &Request<B>) -> bool {
        let mut origins = request.headers().get_all(ORIGIN).iter();
        let Some(origin) = origins.next() else {
            return true;
        };
        if origins.next().is_some() {
            return false;
        }
        let Ok(origin) = origin.to_str() else {
            return false;
        };
        let Ok(parsed) = url::parse(origin) else {
            return false;
        };
        if parsed.host.is_empty() {
            return false;
        }
        if parsed.host.eq_ignore_ascii_case(request_host(request)) {
            return true;
        }
        normalize_origin(origin).is_some_and(|origin| self.inner.allowed.contains(&origin))
    }
}

/// The `Sec-WebSocket-Key` of a request that is what a WebSocket handshake must be, so that one
/// that is not gets the error envelope.
fn handshake_key<B>(request: &Request<B>) -> Option<&HeaderValue> {
    let headers = request.headers();
    if request.version() < Version::HTTP_11
        || !has_token(headers, &CONNECTION, TOKEN_UPGRADE)
        || !has_token(headers, &UPGRADE, TOKEN_WEBSOCKET)
        || headers.get(SEC_WEBSOCKET_VERSION) != Some(&VERSION_13)
    {
        return None;
    }
    let mut keys = headers.get_all(SEC_WEBSOCKET_KEY).iter();
    match (keys.next(), keys.next()) {
        (Some(key), None) if decoded_length(key.as_bytes().trim_ascii()) == Some(KEY_BYTES) => {
            Some(key)
        }
        _ => None,
    }
}

/// Whether any of the header's values lists `token`, compared case-insensitively.
fn has_token(headers: &HeaderMap, name: &http::HeaderName, token: &str) -> bool {
    headers
        .get_all(name)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .any(|element| element.trim().eq_ignore_ascii_case(token))
}

/// The decoded length of padded standard base64, `None` if it is not that. Like Go's
/// non-strict `base64.StdEncoding`, it does not check the bits a padded quantum leaves over.
fn decoded_length(encoded: &[u8]) -> Option<usize> {
    const QUANTUM: usize = 4;
    const MAX_PADDING: usize = 2;
    if encoded.is_empty() || !encoded.len().is_multiple_of(QUANTUM) {
        return None;
    }
    let padding = encoded
        .iter()
        .rev()
        .take_while(|&&byte| byte == b'=')
        .count();
    let body = &encoded[..encoded.len() - padding];
    let in_alphabet = body
        .iter()
        .all(|&byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'/');
    (padding <= MAX_PADDING && in_alphabet).then(|| encoded.len() / QUANTUM * 3 - padding)
}

/// The socket's code once upgraded: counted and logged open, the echo, then counted and logged
/// closed. Only the client address is logged, never a message (configuration-security.md
/// section 6).
async fn serve(io: TokioIo<Upgraded>, shutdown: SocketShutdown, inner: Arc<Inner>, client: IpAddr) {
    let config = WebSocketConfig::default()
        .max_message_size(Some(READ_LIMIT))
        .max_frame_size(Some(READ_LIMIT));
    let socket = WebSocketStream::from_raw_socket(io, Role::Server, Some(config)).await;
    tracing::debug!(client = %client, "websocket open");
    inner.meter.websocket_opened();
    echo(socket, &shutdown, &inner).await;
    inner.meter.websocket_closed();
    tracing::debug!(client = %client, "websocket close");
}

type Socket = WebSocketStream<TokioIo<Upgraded>>;

/// How the echo ends.
enum End {
    /// The connection is over: the peer closed, or it broke.
    Gone,
    /// `cut`: drop the socket without a close.
    Cut,
    /// Close with this code and wait for the peer's close frame.
    Close(CloseCode, &'static str),
    /// Close with this code and drop the socket at once: what follows on the wire cannot be read.
    CloseNow(CloseCode, &'static str),
}

/// Answers each ping with its pong until the connection ends: by the peer, by a protocol rule,
/// by `idle` without a message, by `stop` (1001) or by `cut`.
async fn echo(mut socket: Socket, shutdown: &SocketShutdown, inner: &Inner) {
    let end = if shutdown.stopped_before_upgrade {
        End::Close(CloseCode::Away, "server shutting down")
    } else {
        echo_loop(&mut socket, shutdown, inner).await
    };
    match end {
        End::Gone | End::Cut => {}
        End::CloseNow(code, reason) => {
            let _ = tokio::select! {
                () = shutdown.cut.cancelled() => return,
                sent = socket.close(Some(close_frame(code, reason))) => sent,
            };
        }
        End::Close(code, reason) => {
            tokio::select! {
                () = shutdown.cut.cancelled() => {}
                () = close_handshake(&mut socket, code, reason) => {}
            }
        }
    }
}

async fn echo_loop(socket: &mut Socket, shutdown: &SocketShutdown, inner: &Inner) -> End {
    let idle = sleep(inner.idle);
    tokio::pin!(idle);
    loop {
        let frame = tokio::select! {
            () = shutdown.cut.cancelled() => return End::Cut,
            () = shutdown.stop.cancelled() => return End::Close(CloseCode::Away, "server shutting down"),
            () = &mut idle => return End::Close(CloseCode::Normal, "idle"),
            frame = socket.next() => frame,
        };
        let text = match frame {
            Some(Ok(Frame::Text(text))) => text,
            Some(Ok(Frame::Binary(_))) => {
                return End::Close(CloseCode::Unsupported, "only text frames are accepted");
            }
            // Control frames are the protocol's own and do not restart the idle window; a close
            // from the peer is answered by the library, and the stream then ends.
            Some(Ok(Frame::Ping(_) | Frame::Pong(_) | Frame::Close(_) | Frame::Frame(_))) => {
                continue;
            }
            Some(Err(error)) => return ended_by(&error),
            None => return End::Gone,
        };
        // The idle window restarts when a message arrives, before it is answered.
        idle.as_mut().reset(Instant::now() + inner.idle);
        let Ok(message) = Message::parse(text.as_str()) else {
            return End::Close(CloseCode::Invalid, "malformed JSON");
        };
        let Some(pong) = message.pong() else {
            // Unknown types are ignored.
            continue;
        };
        let sent = tokio::select! {
            () = shutdown.cut.cancelled() => return End::Cut,
            sent = socket.send(Frame::text(pong)) => sent,
        };
        if sent.is_err() {
            return End::Gone;
        }
        inner.meter.websocket_echoed();
    }
}

/// The close an error from the socket calls for.
fn ended_by(error: &WsError) -> End {
    match error {
        WsError::Capacity(_) => End::CloseNow(CloseCode::Size, "message too big"),
        WsError::Utf8(_) => End::Close(CloseCode::Invalid, "invalid UTF-8"),
        WsError::Protocol(ProtocolError::ResetWithoutClosingHandshake)
        | WsError::ConnectionClosed
        | WsError::AlreadyClosed
        | WsError::Io(_)
        | WsError::Tls(_)
        | WsError::WriteBufferFull(_)
        | WsError::Url(_)
        | WsError::Http(_)
        | WsError::HttpFormat(_)
        | WsError::AttackAttempt => End::Gone,
        WsError::Protocol(_) => End::CloseNow(CloseCode::Protocol, "protocol violation"),
    }
}

/// Sends the close frame and reads until the peer's close frame, for at most [`CLOSE_WAIT`].
async fn close_handshake(socket: &mut Socket, code: CloseCode, reason: &'static str) {
    if socket.close(Some(close_frame(code, reason))).await.is_err() {
        return;
    }
    let _ = timeout(CLOSE_WAIT, async {
        while let Some(Ok(_)) = socket.next().await {}
    })
    .await;
}

fn close_frame(code: CloseCode, reason: &'static str) -> CloseFrame {
    CloseFrame {
        code,
        reason: reason.into(),
    }
}
