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

//! The native API's routes as the router mounts them under a base path (Go's
//! `internal/handlers/routes_test.go`), and the malformed request that no handler sees.

use http::{Method, StatusCode};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

use super::stack::{Reply, TestStack, test_config};
use crate::test_support::dial_loopback;

async fn mounted() -> TestStack {
    let mut config = test_config();
    config.server.base_path = "/speed".to_owned();
    TestStack::start(&config, None).await
}

/// Checks an error envelope: its status, the JSON type, `no-store` and the code.
pub(super) fn assert_envelope(reply: &Reply, status: StatusCode, code: &str, label: &str) {
    assert_eq!(reply.status, status, "{label}");
    assert_eq!(reply.header("content-type"), "application/json", "{label}");
    assert_eq!(reply.header("cache-control"), "no-store", "{label}");
    let decoded: serde_json::Value = serde_json::from_slice(&reply.body).expect("an envelope");
    assert_eq!(decoded["error"]["code"], code, "{label}: {decoded}");
}

/// Go: `TestRoutesServeTheNativeAPI`.
#[tokio::test]
async fn routes_serve_the_native_api() {
    let stack = mounted().await;
    for (method, path, status) in [
        (Method::GET, "/speed/api/v1/ping", StatusCode::NO_CONTENT),
        (Method::HEAD, "/speed/api/v1/ping", StatusCode::NO_CONTENT),
        (Method::GET, "/speed/api/v1/small", StatusCode::OK),
        (
            Method::GET,
            "/speed/api/v1/download?bytes=10",
            StatusCode::OK,
        ),
        (Method::GET, "/speed/api/v1/info", StatusCode::OK),
        (Method::POST, "/speed/api/v1/upload", StatusCode::OK),
    ] {
        let reply = stack.call(method.clone(), path, None).await;
        assert_eq!(reply.status, status, "{method} {path}");
        // RFC 9110 forbids Content-Length on a 204, and Go sent none, on HEAD as on GET.
        if status == StatusCode::NO_CONTENT {
            assert!(
                !reply.headers.contains_key("content-length"),
                "{method} {path}"
            );
        }
    }
}

/// Go: `TestRoutesWrongMethodIs405WithAllow`; `HEAD` reaches the method table and is refused
/// where a row does not list it, rather than being axum's implicit `HEAD` on `GET`. A `HEAD`
/// answer has no body, so its envelope is checked by its headers.
#[tokio::test]
async fn routes_wrong_method_is_405_with_allow() {
    let stack = mounted().await;
    let root = TestStack::start(&test_config(), None).await;
    for (stack, method, path, allow) in [
        (&stack, Method::POST, "/speed/api/v1/ping", "GET, HEAD"),
        (&stack, Method::DELETE, "/speed/api/v1/ping", "GET, HEAD"),
        (&stack, Method::HEAD, "/speed/api/v1/small", "GET"),
        (&stack, Method::POST, "/speed/api/v1/small", "GET"),
        (&stack, Method::POST, "/speed/api/v1/download", "GET"),
        (&stack, Method::GET, "/speed/api/v1/upload", "POST"),
        (&stack, Method::POST, "/speed/api/v1/ws", "GET"),
        (&stack, Method::HEAD, "/speed/api/v1/info", "GET"),
        // Without a base path.
        (&root, Method::PUT, "/api/v1/small", "GET"),
    ] {
        let label = format!("{method} {path}");
        let reply = stack.fetch(method.clone(), path).await;
        if method == Method::HEAD {
            assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED, "{label}");
            assert_eq!(reply.header("content-type"), "application/json", "{label}");
        } else {
            assert_envelope(
                &reply,
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                &label,
            );
        }
        assert_eq!(reply.header("allow"), allow, "{label}");
    }
}

/// Go: `TestRoutesUnknownPathIs404Envelope`.
#[tokio::test]
async fn routes_unknown_path_is_404_envelope() {
    let stack = mounted().await;
    for path in [
        "/speed/api/v1",
        "/speed/api/v1/",
        "/speed/api/v1/nope",
        "/speed/api/v1/ping/extra",
        "/speed/api/v1/nope/deeper",
    ] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_envelope(&reply, StatusCode::NOT_FOUND, "not_found", path);
    }
}

/// Go: `TestMalformedFramingIsNetHTTPsPlain400`. A `Content-Length` that cannot be parsed is
/// answered by hyper before any handler runs: its empty-body 400 (`docs/rust-port.md` row 6),
/// then the connection is closed.
#[tokio::test]
async fn malformed_framing_is_hypers_400_and_close() {
    let stack = TestStack::start(&test_config(), None).await;
    for length in ["abc", "-5"] {
        let mut connection = dial_loopback(stack.address).await;
        let request = format!(
            "POST /api/v1/upload HTTP/1.1\r\nHost: {}\r\nContent-Length: {length}\r\n\r\n",
            stack.address
        );
        connection
            .write_all(request.as_bytes())
            .await
            .expect("a write");
        let mut answer = Vec::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            connection.read_to_end(&mut answer),
        )
        .await
        .expect("the connection closed")
        .expect("a read");
        let answer = String::from_utf8(answer).expect("a text answer");
        assert!(
            answer.starts_with("HTTP/1.1 400 Bad Request\r\n"),
            "{length}: {answer}"
        );
        assert!(
            answer.ends_with("\r\n\r\n"),
            "{length}: a body after the head: {answer}"
        );
    }
}
