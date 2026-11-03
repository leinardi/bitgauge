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

//! The OpenSpeedTest layer.

use std::sync::atomic::Ordering;

use axum::Router;
use http::{Method, Response, StatusCode};
use tokio::time::Instant;

use super::support::{
    Call, Counted, assert_rows, client_address, send, serve, streams, tight_limiter,
};
use crate::compat::openspeedtest::{
    DOWNLOAD_BYTES, DOWNLOAD_PATH, Deps, ROWS, UPLOAD_CAP, UPLOAD_PATH, routes,
};
use crate::handlers::tests::support::{UnreadBody, body_bytes, envelope, header, no_transfer};
use crate::handlers::{
    Body, CODE_METHOD_NOT_ALLOWED, CODE_PAYLOAD_TOO_LARGE, CODE_REQUEST_TIMEOUT,
    CODE_TOO_MANY_STREAMS, Limit, RandomSource, UPLOAD_LIFETIME,
};

fn layer(limit: Option<Limit>) -> Router {
    routes(Deps {
        source: RandomSource::new().expect("a random source"),
        limit,
        download: no_transfer(),
        upload: no_transfer(),
    })
}

fn assert_cors(label: &str, response: &Response<Body>) {
    for (name, want) in [
        ("access-control-allow-origin", "*"),
        ("access-control-allow-methods", "GET, POST, OPTIONS"),
        ("access-control-allow-headers", "Content-Type"),
        ("cache-control", "no-store"),
    ] {
        assert_eq!(header(response, name), want, "{label}: {name}");
    }
}

async fn assert_code(label: &str, response: Response<Body>, status: StatusCode, code: &str) {
    assert_cors(label, &response);
    envelope(response, status, code).await;
}

/// Go: `TestDownloadIsExactly30MiB`
#[tokio::test]
async fn download_is_exactly_30_mib() {
    let router = layer(None);
    let length = DOWNLOAD_BYTES.to_string();
    for target in ["/downloading", "/downloading?n=0.5", "/downloading?n=abc"] {
        let response = send(&router, &Call::get(target)).await;
        assert_eq!(response.status(), StatusCode::OK, "GET {target}");
        assert_cors(target, &response);
        assert_eq!(header(&response, "content-length"), length);
        assert_eq!(
            header(&response, "content-type"),
            "application/octet-stream"
        );
        assert_eq!(header(&response, "content-encoding"), "");
        assert_eq!(
            body_bytes(response).await.len() as u64,
            DOWNLOAD_BYTES,
            "GET {target}"
        );
    }
    let response = send(&router, &Call::new(Method::HEAD, DOWNLOAD_PATH)).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, "content-length"), length);
    assert!(body_bytes(response).await.is_empty(), "HEAD has a body");
}

/// Go: `TestPingIs200NeverA204`
#[tokio::test]
async fn ping_is_200_never_a_204() {
    let router = layer(None);
    for method in [Method::GET, Method::HEAD, Method::OPTIONS] {
        let label = format!("{method} /upload");
        let response = send(&router, &Call::new(method, "/upload?n=3")).await;
        assert_eq!(response.status(), StatusCode::OK, "{label}");
        assert_cors(&label, &response);
        assert_eq!(header(&response, "content-length"), "0", "{label}");
        assert_eq!(header(&response, "content-type"), "", "{label}");
        assert!(body_bytes(response).await.is_empty(), "{label}");
    }
}

/// Go: `TestUploadDrainsUpToTheCap`
#[tokio::test]
async fn upload_drains_up_to_the_cap() {
    let router = layer(None);
    let cap = usize::try_from(UPLOAD_CAP).expect("the cap");
    for (name, size, length, status) in [
        (
            "30 MiB, as the client sends",
            30 << 20,
            Some(30 << 20),
            StatusCode::OK,
        ),
        ("exactly the cap", cap, Some(UPLOAD_CAP), StatusCode::OK),
        ("empty", 0, Some(0), StatusCode::OK),
        (
            "without a length, under the cap",
            1 << 20,
            None,
            StatusCode::OK,
        ),
        (
            "without a length, exactly the cap",
            cap,
            None,
            StatusCode::OK,
        ),
        (
            "without a length, past the cap",
            cap + 1,
            None,
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
        (
            "a lying length",
            cap + 1,
            Some(10),
            StatusCode::PAYLOAD_TOO_LARGE,
        ),
    ] {
        let mut call = Call::new(Method::POST, "/upload?n=1");
        if let Some(length) = length {
            call = call.length(length);
        }
        let body = Counted::new(size);
        let read = body.read();
        let response = serve(&router, call.build(body)).await;
        assert_eq!(response.status(), status, "{name}");
        assert_cors(name, &response);
        let read = read.load(Ordering::SeqCst);
        if status == StatusCode::OK {
            assert_eq!(read, size, "{name}");
            assert_eq!(header(&response, "content-length"), "0", "{name}");
            assert!(body_bytes(response).await.is_empty(), "{name}");
        } else {
            // The body stops at the cap, and the connection closes behind the answer.
            assert!(read <= cap + (64 << 10), "{name}: read {read} bytes");
            assert_eq!(header(&response, "connection"), "close", "{name}");
        }
    }
}

/// Go: `TestUploadRefusesADeclaredLengthOverTheCapUnread`
#[tokio::test]
async fn upload_refuses_a_declared_length_over_the_cap_unread() {
    let call = Call::new(Method::POST, UPLOAD_PATH).length(UPLOAD_CAP + 1);
    let response = serve(&layer(None), call.build(UnreadBody)).await;
    assert_code(
        "declared over the cap",
        response,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;
}

/// Go: `TestUploadLifetimeIs408`, on the paused clock: the lifetime counts from handler entry.
#[tokio::test(start_paused = true)]
async fn upload_lifetime_is_408() {
    let entry = Instant::now();
    let call = Call::new(Method::POST, UPLOAD_PATH).length(1000);
    let response = serve(&layer(None), call.build(Counted::new(3).stalling())).await;
    assert_eq!(entry.elapsed(), UPLOAD_LIFETIME);
    assert_code(
        "lifetime",
        response,
        StatusCode::REQUEST_TIMEOUT,
        CODE_REQUEST_TIMEOUT,
    )
    .await;
}

/// Go: `TestUnlistedMethodIs405`
#[tokio::test]
async fn unlisted_method_is_405() {
    let router = layer(None);
    for (method, path, allow) in [
        (Method::PUT, DOWNLOAD_PATH, "GET, HEAD, OPTIONS"),
        (Method::PUT, UPLOAD_PATH, "GET, HEAD, POST, OPTIONS"),
        (Method::POST, DOWNLOAD_PATH, "GET, HEAD, OPTIONS"),
    ] {
        let label = format!("{method} {path}");
        let response = send(&router, &Call::new(method, path)).await;
        assert_eq!(header(&response, "allow"), allow, "{label}");
        assert_code(
            &label,
            response,
            StatusCode::METHOD_NOT_ALLOWED,
            CODE_METHOD_NOT_ALLOWED,
        )
        .await;
    }
}

/// Go: `TestEveryRouteTakesAStreamSlot`: both routes, the ping included, count against
/// `limits.max_streams_per_client`, a 429 carries the CORS headers, and a preflight is never
/// limited.
#[tokio::test]
async fn every_route_takes_a_stream_slot() {
    let limiter = tight_limiter();
    let router = layer(Some(streams(&limiter)));
    let permit = limiter
        .acquire_stream(client_address())
        .expect("a stream slot");
    for (method, path) in [
        (Method::GET, DOWNLOAD_PATH),
        (Method::HEAD, DOWNLOAD_PATH),
        (Method::GET, UPLOAD_PATH),
        (Method::HEAD, UPLOAD_PATH),
        (Method::POST, UPLOAD_PATH),
    ] {
        let label = format!("{method} {path}");
        let head = method == Method::HEAD;
        let call = Call::new(method, path).length(1);
        let response = serve(&router, call.build(Body::from("x"))).await;
        let retry_after: u32 = header(&response, "retry-after")
            .parse()
            .expect("a Retry-After");
        assert!(retry_after >= 1, "{label}");
        // A HEAD answer has no body to hold the envelope.
        if head {
            assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS, "{label}");
            assert_cors(&label, &response);
        } else {
            assert_code(
                &label,
                response,
                StatusCode::TOO_MANY_REQUESTS,
                CODE_TOO_MANY_STREAMS,
            )
            .await;
        }
    }
    let preflight = send(&router, &Call::new(Method::OPTIONS, UPLOAD_PATH)).await;
    assert_eq!(
        preflight.status(),
        StatusCode::OK,
        "a preflight at the limit"
    );
    drop(permit);
    let ping = send(&router, &Call::get(UPLOAD_PATH)).await;
    assert_eq!(
        ping.status(),
        StatusCode::OK,
        "a ping after the slot was released"
    );
}

/// A streaming download holds its slot until its body is done, as Go's handler held it until
/// it returned (no Go test: Go's handler wrote the body before returning).
#[tokio::test]
async fn a_download_holds_its_slot_until_its_body_is_done() {
    let limiter = tight_limiter();
    let router = layer(Some(streams(&limiter)));
    let download = send(&router, &Call::get(DOWNLOAD_PATH)).await;
    assert_eq!(download.status(), StatusCode::OK);
    let refused = send(&router, &Call::get(UPLOAD_PATH)).await;
    assert_eq!(
        refused.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "the slot is held"
    );
    drop(download);
    let ping = send(&router, &Call::get(UPLOAD_PATH)).await;
    assert_eq!(
        ping.status(),
        StatusCode::OK,
        "the slot came back with the body"
    );
}

/// Go: `TestRouterHoldsExactlyTheRouteTableRows`
#[tokio::test]
async fn router_holds_exactly_the_route_table_rows() {
    let paths: Vec<_> = ROWS.iter().map(|row| row.path).collect();
    assert_eq!(paths, [DOWNLOAD_PATH, UPLOAD_PATH]);
    let router = layer(None);
    assert_rows(&router, &ROWS).await;
    for path in ["/", "/downloading/", "/Upload", "/upload.php"] {
        assert_eq!(
            send(&router, &Call::get(path)).await.status(),
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
}
