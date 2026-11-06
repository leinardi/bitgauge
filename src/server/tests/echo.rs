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

//! A test-only service with one route per behavior the driver tests need, and a WebSocket echo on
//! the two-stage socket task, until the real router and handlers are ported.

use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;

use bytes::Bytes;
use futures_util::{SinkExt as _, StreamExt as _};
use http::{Request, Response, StatusCode, header};
use http_body::Frame;
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Full, StreamBody};
use hyper::body::Incoming;
use hyper::upgrade::Upgraded;
use hyper_util::rt::TokioIo;
use tokio::sync::Notify;
use tokio::time::Instant;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Role};
use tower_service::Service;

use crate::server::Lifecycle;
use crate::server::upgrade::{SocketShutdown, spawn_socket_task};

type Body = BoxBody<Bytes, Infallible>;

/// The points where a test holds a request or an upgrade.
#[derive(Debug, Default)]
pub(super) struct Hooks {
    /// `/ws-slow` registered its socket task and waits for `slow_release` before the 101.
    pub(super) slow_reached: Notify,
    pub(super) slow_release: Notify,
    /// `/ws-held`'s upgrade resolved and is held until `held_release`.
    pub(super) held_resolved: Notify,
    pub(super) held_release: Notify,
}

#[derive(Debug, Clone)]
pub(super) struct EchoService {
    hooks: Arc<Hooks>,
    /// A socket that receives no message for this long is closed with 1000.
    socket_idle: Duration,
}

impl EchoService {
    pub(super) fn new(hooks: Arc<Hooks>, socket_idle: Duration) -> Self {
        Self { hooks, socket_idle }
    }
}

fn text(status: StatusCode, body: &'static str) -> Response<Body> {
    let mut response = Response::new(Full::new(Bytes::from_static(body.as_bytes())).boxed());
    *response.status_mut() = status;
    response
}

/// A chunked body of one small chunk every 20 ms, for `milliseconds`.
fn timed_download(milliseconds: u64) -> Response<Body> {
    let until = Instant::now() + Duration::from_millis(milliseconds);
    let chunks = futures_util::stream::unfold(true, move |first| async move {
        if !first {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        (Instant::now() < until).then(|| (Ok(Frame::data(Bytes::from_static(&[b'x'; 64]))), false))
    });
    Response::new(BodyExt::boxed(StreamBody::new(chunks)))
}

/// A body that never ends and is always ready: 64 KiB chunks as fast as the socket takes them.
fn endless() -> Response<Body> {
    static CHUNK: [u8; 65536] = [b'e'; 65536];
    let chunks = futures_util::stream::repeat_with(|| Ok(Frame::data(Bytes::from_static(&CHUNK))));
    Response::new(BodyExt::boxed(StreamBody::new(chunks)))
}

/// Reads the whole body and answers its length.
async fn upload(request: Request<Incoming>) -> Response<Body> {
    match request.into_body().collect().await {
        Ok(collected) => {
            let length = collected.to_bytes().len().to_string();
            Response::new(Full::new(Bytes::from(length)).boxed())
        }
        Err(_) => text(StatusCode::BAD_REQUEST, "body"),
    }
}

/// Echoes text messages, closes with 1000 after `idle` without a message, with 1001 on `stop` (at
/// once if it came before the upgrade), and drops the socket on `cut`.
async fn echo(io: TokioIo<Upgraded>, shutdown: SocketShutdown, idle: Duration) {
    let mut socket = WebSocketStream::from_raw_socket(io, Role::Server, None).await;
    let away = CloseFrame {
        code: CloseCode::Away,
        reason: "".into(),
    };
    if shutdown.stopped_before_upgrade {
        let _ = socket.close(Some(away)).await;
        return;
    }
    let idle_timer = tokio::time::sleep(idle);
    tokio::pin!(idle_timer);
    loop {
        tokio::select! {
            () = shutdown.cut.cancelled() => return,
            () = &mut idle_timer => {
                let normal = CloseFrame {
                    code: CloseCode::Normal,
                    reason: "".into(),
                };
                let _ = socket.close(Some(normal)).await;
                return;
            }
            () = shutdown.stop.cancelled() => {
                let _ = socket.close(Some(away)).await;
                return;
            }
            message = socket.next() => match message {
                Some(Ok(Message::Text(text))) => {
                    idle_timer.as_mut().reset(Instant::now() + idle);
                    if socket.send(Message::Text(text)).await.is_err() {
                        return;
                    }
                }
                Some(Ok(_)) => idle_timer.as_mut().reset(Instant::now() + idle),
                None | Some(Err(_)) => return,
            },
        }
    }
}

/// How `/ws`, `/ws-slow` and `/ws-held` differ.
#[derive(Debug, Clone, Copy)]
enum Upgrade {
    Plain,
    /// The handler waits for the test after registering the task, before the 101.
    Slow,
    /// The upgrade is held for the test after it resolves.
    Held,
}

async fn websocket(
    mut request: Request<Incoming>,
    service: EchoService,
    kind: Upgrade,
) -> Response<Body> {
    let EchoService { hooks, socket_idle } = service;
    // The lifecycle the server stores in every request, as the WebSocket handler takes it.
    let Some(lifecycle) = request.extensions().get::<Lifecycle>().cloned() else {
        return text(StatusCode::INTERNAL_SERVER_ERROR, "no lifecycle");
    };
    let Some(key) = request.headers().get(header::SEC_WEBSOCKET_KEY).cloned() else {
        return text(StatusCode::BAD_REQUEST, "no key");
    };
    let on_upgrade = hyper::upgrade::on(&mut request);
    let held = Arc::clone(&hooks);
    let upgrade = async move {
        let upgraded = on_upgrade.await;
        if matches!(kind, Upgrade::Held) {
            held.held_resolved.notify_one();
            held.held_release.notified().await;
        }
        upgraded
    };
    spawn_socket_task(&lifecycle, upgrade, (), move |io, shutdown| {
        echo(io, shutdown, socket_idle)
    });
    if matches!(kind, Upgrade::Slow) {
        hooks.slow_reached.notify_one();
        hooks.slow_release.notified().await;
    }
    Response::builder()
        .status(StatusCode::SWITCHING_PROTOCOLS)
        .header(header::CONNECTION, "Upgrade")
        .header(header::UPGRADE, "websocket")
        .header(
            header::SEC_WEBSOCKET_ACCEPT,
            derive_accept_key(key.as_bytes()),
        )
        .body(Full::new(Bytes::new()).boxed())
        .unwrap_or_else(|error| panic!("build the 101: {error}"))
}

impl Service<Request<Incoming>> for EchoService {
    type Response = Response<Body>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Response<Body>, Infallible>> + Send>>;

    fn poll_ready(&mut self, _context: &mut Context<'_>) -> Poll<Result<(), Infallible>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: Request<Incoming>) -> Self::Future {
        let service = self.clone();
        Box::pin(async move {
            let path = request.uri().path().to_owned();
            let query = request.uri().query().unwrap_or_default().to_owned();
            Ok(match path.as_str() {
                "/" => text(StatusCode::OK, "ok"),
                "/second" => text(StatusCode::OK, "second"),
                "/download" => {
                    let milliseconds = query
                        .strip_prefix("ms=")
                        .and_then(|value| value.parse().ok())
                        .unwrap_or(0);
                    timed_download(milliseconds)
                }
                "/endless" => endless(),
                "/upload" => upload(request).await,
                "/too-large" => {
                    let mut response = text(StatusCode::PAYLOAD_TOO_LARGE, "too large");
                    response.headers_mut().insert(
                        header::CONNECTION,
                        header::HeaderValue::from_static("close"),
                    );
                    response
                }
                "/ws" => websocket(request, service, Upgrade::Plain).await,
                "/ws-slow" => websocket(request, service, Upgrade::Slow).await,
                "/ws-held" => websocket(request, service, Upgrade::Held).await,
                _ => text(StatusCode::NOT_FOUND, "not found"),
            })
        })
    }
}
