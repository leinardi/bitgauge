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

//! The global middleware's tests (Go's `middleware_test.go` and the client IP middleware
//! tests of `internal/clientip`): recovery by group, the client IP stage, the request log and
//! what passes through the stack untouched.

use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::extract::Request;
use axum::routing::get;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use http::StatusCode;
use http_body_util::BodyExt as _;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tracing::dispatcher::DefaultGuard;

use super::stack::{
    TestStack, boom, chain, direct, direct_get, has_request_series, test_config, trusting,
};
use crate::buildinfo;
use crate::clientip::Client;
use crate::config::Config;
use crate::handlers::{Abort, Body};
use crate::logger;
use crate::metrics::Metrics;
use crate::server::conn::Lifecycle;
use crate::server::routes::mounted_routes;
use crate::test_support::{Capture, dial_loopback};

/// Logs at `level` as JSON into the returned capture while the guards live. The tests that
/// use it run on one thread, so the default dispatcher is the one every task sees.
fn capture(level: &str) -> (Capture, DefaultGuard, tracing::Dispatch) {
    let logs = Capture::default();
    let dispatch = logger::to_writer(logs.clone(), "json", level).expect("a logger");
    let guard = tracing::dispatcher::set_default(&dispatch);
    // While only one dispatcher is registered, tracing-core caches a callsite's interest from
    // whichever thread reaches it first; a second registered dispatcher makes it ask every one.
    let second = tracing::Dispatch::new(tracing::subscriber::NoSubscriber::default());
    (logs, guard, second)
}

fn records(logs: &Capture, message: &str) -> Vec<serde_json::Value> {
    logs.json_lines()
        .into_iter()
        .filter(|record| record["message"] == message)
        .collect()
}

/// Go: `TestPanicOnAPIRouteIsTheEnvelope`.
#[tokio::test(flavor = "current_thread")]
async fn panic_on_api_route_is_the_envelope() {
    let (logs, _guard, _second) = capture("info");
    let stack = chain(
        Router::new().route("/api/v1/things/{id}", get(boom)),
        &Config::default(),
        None,
    );
    let reply = direct_get(&stack, "/api/v1/things/42?secret=query-value").await;
    assert_eq!(reply.status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(reply.header("content-type"), "application/json");
    let decoded: serde_json::Value = serde_json::from_slice(&reply.body).expect("an envelope");
    assert_eq!(decoded["error"]["code"], "internal", "{decoded}");

    let text = logs.text();
    let warned = records(&logs, "panic recovered");
    assert_eq!(warned.len(), 1, "{text}");
    assert_eq!(warned[0]["level"], "WARN", "{text}");
    assert_eq!(warned[0]["route"], "/api/v1/things/{id}", "{text}");
    assert_eq!(warned[0]["panic"], "&str", "{text}");
    assert!(
        !text.contains("42") && !text.contains("query-value"),
        "{text}"
    );
}

/// Go: `TestPanicOnSPARouteIsPlain`: plain text with the SPA's headers, and `no-store`, so a
/// shared cache does not keep the 500 for the asset's lifetime.
#[tokio::test]
async fn panic_on_spa_route_is_plain() {
    let stack = chain(
        Router::new().route("/assets/app.js", get(boom)),
        &Config::default(),
        None,
    );
    let reply = direct_get(&stack, "/assets/app.js").await;
    assert_eq!(reply.status, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(
        reply.header("content-type").starts_with("text/plain"),
        "{:?}",
        reply.headers
    );
    assert_ne!(reply.header("content-security-policy"), "");
    assert_eq!(reply.header("cache-control"), "no-store");
    assert_eq!(reply.text(), "Internal Server Error\n");
}

/// Go: `TestStagesSeeTheEarlierOnes`: the router sees the derived client, the 500 of a panic
/// carries the security headers, and a panicking request writes no request line.
#[tokio::test(flavor = "current_thread")]
async fn the_router_sees_the_client_and_a_panic_keeps_the_headers() {
    let (logs, _guard, _second) = capture("debug");
    let seen = Arc::new(Mutex::new(None));
    let router = Router::new().route(
        "/api/v1/probe",
        get({
            let seen = Arc::clone(&seen);
            move |request: Request| async move {
                *seen.lock().expect("lock") = request.extensions().get::<Client>().copied();
                boom().await
            }
        }),
    );
    let reply = direct_get(&chain(router, &Config::default(), None), "/api/v1/probe").await;
    let client = seen.lock().expect("lock").expect("a derived client");
    assert_eq!(client.address.to_string(), "192.0.2.1");
    assert_eq!(reply.status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(reply.header("x-content-type-options"), "nosniff");
    assert!(records(&logs, "request").is_empty(), "{}", logs.text());
}

/// Go: `TestMiddlewareStoresTheDerivedAddress` and `TestMiddlewareRecordsWhetherThePeerIsTrusted`:
/// the client IP stage stores the client derived from the peer and the forwarding headers,
/// with whether the peer is trusted, an IPv4-mapped peer included.
#[tokio::test]
async fn the_client_ip_stage_stores_the_derived_client() {
    let seen = Arc::new(Mutex::new(None));
    let router = Router::new().route(
        "/",
        get({
            let seen = Arc::clone(&seen);
            move |request: Request| async move {
                *seen.lock().expect("lock") = request.extensions().get::<Client>().copied();
            }
        }),
    );
    let mut config = Config::default();
    trusting(&mut config, &["172.20.0.2/32"]);
    let stack = chain(router, &config, None);
    for (peer, address, trusted) in [
        ("172.20.0.2:41000", "203.0.113.9", true),
        ("172.20.0.3:41000", "172.20.0.3", false),
        ("[::ffff:172.20.0.2]:1", "203.0.113.9", true),
    ] {
        let mut request = Request::get("/")
            .header("x-forwarded-for", "203.0.113.9")
            .body(Body::empty())
            .expect("a request");
        request
            .extensions_mut()
            .insert(crate::server::conn::Peer(peer.parse().expect("a peer")));
        let mut stack = stack.clone();
        let answer: Result<_, Infallible> = tower_service::Service::call(&mut stack, request).await;
        assert_eq!(
            answer.expect("an answer").status(),
            StatusCode::OK,
            "{peer}"
        );
        let client = seen.lock().expect("lock").take().expect("a stored client");
        assert_eq!(client.address.to_string(), address, "{peer}");
        assert_eq!(client.peer_trusted, trusted, "{peer}");
    }
}

/// Go: `TestFromContextWithoutTheMiddleware`: a request without a peer address carries no
/// client.
#[tokio::test]
async fn a_request_without_a_peer_carries_no_client() {
    let seen = Arc::new(Mutex::new(Some(None)));
    let router = Router::new().route(
        "/",
        get({
            let seen = Arc::clone(&seen);
            move |request: Request| async move {
                *seen.lock().expect("lock") = Some(request.extensions().get::<Client>().copied());
            }
        }),
    );
    let mut stack = chain(router, &Config::default(), None);
    let request = Request::get("/").body(Body::empty()).expect("a request");
    let answer: Result<_, Infallible> = tower_service::Service::call(&mut stack, request).await;
    assert_eq!(answer.expect("an answer").status(), StatusCode::OK);
    assert_eq!(*seen.lock().expect("lock"), Some(None));
}

/// Go: `TestRequestLogLineAtDebugOnly`: one line at debug, with the route pattern, the status,
/// the body bytes, the duration and the derived client, and nothing of the headers or the
/// query; nothing at info.
#[tokio::test(flavor = "current_thread", start_paused = true)]
async fn request_log_line_at_debug_only() {
    let router = Router::new().route(
        "/api/v1/download",
        get(|| async {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            "12345"
        }),
    );
    let stack = chain(router, &Config::default(), None);
    let request = || {
        let mut builder = Request::get("/api/v1/download?bytes=4242&token=query-secret");
        for (name, value) in [
            ("user-agent", "ua-secret"),
            ("referer", "https://referer-secret.example/"),
            ("cookie", "session=cookie-secret"),
            ("x-forwarded-for", "203.0.113.77"),
            ("authorization", "Bearer auth-secret"),
        ] {
            builder = builder.header(name, value);
        }
        builder.body(Body::empty()).expect("a request")
    };
    let (logs, guard, second) = capture("debug");
    let response = direct(&stack, request()).await;
    response.into_body().collect().await.expect("a whole body");
    let text = logs.text();
    let lines = records(&logs, "request");
    assert_eq!(lines.len(), 1, "{text}");
    let line = &lines[0];
    for (field, want) in [
        ("level", "DEBUG"),
        ("method", "GET"),
        ("route", "/api/v1/download"),
        ("duration", "1.5s"),
        ("client", "192.0.2.1"),
    ] {
        assert_eq!(line[field], want, "{field} in {text}");
    }
    assert_eq!(line["status"], 200, "{text}");
    assert_eq!(line["bytes"], 5, "{text}");
    for secret in [
        "ua-secret",
        "referer-secret",
        "cookie-secret",
        "203.0.113.77",
        "auth-secret",
        "query-secret",
        "4242",
    ] {
        assert!(!text.contains(secret), "the log holds {secret}: {text}");
    }
    drop((guard, second));

    let (quiet, _guard, _second) = capture("info");
    let response = direct(&stack, request()).await;
    response.into_body().collect().await.expect("a whole body");
    assert_eq!(quiet.text(), "", "a request line at info");
}

/// Go: `TestRequestLogUnmatchedAndImplicitStatus`: a handler that sets nothing is a 200, and a
/// path no route matched is `unmatched`.
#[tokio::test(flavor = "current_thread")]
async fn request_log_unmatched_and_implicit_status() {
    let (logs, _guard, _second) = capture("debug");
    let stack = chain(
        Router::new().route("/silent", get(|| async {})),
        &Config::default(),
        None,
    );
    direct_get(&stack, "/silent").await;
    direct_get(&stack, "/nowhere").await;
    let lines: Vec<_> = records(&logs, "request")
        .into_iter()
        .map(|line| (line["route"].clone(), line["status"].clone()))
        .collect();
    assert_eq!(
        lines,
        [
            (serde_json::json!("/silent"), serde_json::json!(200)),
            (serde_json::json!("unmatched"), serde_json::json!(404)),
        ],
        "{}",
        logs.text()
    );
}

/// Go: `TestPanickingRequestsAreCounted`: a panic recovery answers counts as 500, and an
/// aborted request, on which the connection is dropped, as a request without a status.
#[tokio::test]
async fn panicking_and_aborted_requests_are_counted() {
    let config = test_config();
    let meter = Arc::new(Metrics::new(
        buildinfo::info(),
        || 0,
        &mounted_routes(&config),
    ));
    let router = Router::new().route("/api/v1/boom", get(boom)).route(
        "/api/v1/abort",
        get(|| async {
            let mut response = http::Response::new(Body::empty());
            response.extensions_mut().insert(Abort);
            response
        }),
    );
    let stack = chain(router, &config, Some(Arc::clone(&meter)));
    assert_eq!(direct_get(&stack, "/api/v1/boom").await.status, 500);
    let aborted = direct(
        &stack,
        Request::get("/api/v1/abort")
            .body(Body::empty())
            .expect("a request"),
    )
    .await;
    // The marker reaches the connection driver, which turns it into the dropped connection.
    assert!(aborted.extensions().get::<Abort>().is_some());
    drop(aborted);
    let exposition = meter.encode().expect("an exposition");
    for labels in [
        r#"code="500",group="api",route="unmatched"} 1"#,
        r#"code="other",group="api",route="unmatched"} 1"#,
    ] {
        assert!(
            has_request_series(&exposition, labels),
            "{labels} in\n{exposition}"
        );
    }
}

/// Go: `TestPanicsThatCannotBeAnswered`, the half after the response started: a panic inside
/// the body, once the handler has returned its head, drops the connection, and the request is
/// still recorded with the status it started. The aborted half is `panicking_and_aborted_requests_are_counted` and the driver's
/// `an_aborted_upload_writes_nothing`.
#[tokio::test]
async fn a_panic_inside_the_body_drops_the_connection() {
    let config = test_config();
    let meter = Arc::new(Metrics::new(
        buildinfo::info(),
        || 0,
        &mounted_routes(&config),
    ));
    let router = Router::new().route(
        "/late",
        get(|| async {
            let chunks = stream::iter([0, 1]).map(|index| {
                assert_eq!(index, 0, "boom");
                Ok::<_, Infallible>(http_body::Frame::data(Bytes::from_static(b"partial")))
            });
            Body::new(http_body_util::StreamBody::new(chunks))
        }),
    );
    let stack = TestStack::serve(
        chain(router, &config, Some(Arc::clone(&meter))),
        Lifecycle::new(),
    )
    .await;
    let mut connection = dial_loopback(stack.address).await;
    connection
        .write_all(b"GET /late HTTP/1.1\r\nHost: test\r\n\r\n")
        .await
        .expect("a write");
    let mut answer = Vec::new();
    let read = tokio::time::timeout(Duration::from_secs(10), connection.read_to_end(&mut answer))
        .await
        .expect("the connection closed");
    // hyper may not have flushed the head before the panic; either way no response is whole.
    let answer = String::from_utf8_lossy(&answer);
    assert!(read.is_ok(), "{read:?}");
    assert!(
        answer.is_empty() || answer.starts_with("HTTP/1.1 200 OK\r\n"),
        "{answer}"
    );
    assert!(
        !answer.ends_with("0\r\n\r\n"),
        "the chunked body was finished: {answer}"
    );
    let exposition = meter.encode().expect("an exposition");
    assert!(
        has_request_series(
            &exposition,
            r#"code="200",group="spa",route="unmatched"} 1"#
        ),
        "{exposition}"
    );
}

/// Go: `TestChainKeepsTheResponseControllerReachable`, whose Rust counterpart is the upgrade:
/// a WebSocket handshake passes through the stack to hyper and echoes.
#[tokio::test]
async fn a_websocket_upgrade_passes_through_the_stack() {
    use futures_util::SinkExt as _;
    use tokio_tungstenite::tungstenite::Message;

    let stack = TestStack::start(&test_config(), None).await;
    let connection = dial_loopback(stack.address).await;
    let (mut socket, response) =
        tokio_tungstenite::client_async(format!("ws://{}/api/v1/ws", stack.address), connection)
            .await
            .expect("a handshake");
    assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);
    socket
        .send(Message::text(r#"{"type":"ping","seq":1,"t":5}"#))
        .await
        .expect("a send");
    let echoed = socket.next().await.expect("a message").expect("a frame");
    assert_eq!(
        echoed.into_text().expect("text"),
        r#"{"type":"pong","seq":1,"t":5}"#
    );
    socket.close(None).await.expect("a close");
}
