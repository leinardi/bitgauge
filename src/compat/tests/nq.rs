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

//! The networkQuality layer.

use std::sync::atomic::Ordering;

use axum::Router;
use http::{Method, Response, StatusCode};
use http_body_util::BodyExt as _;
use tokio::time::Instant;

use super::support::{
    Call, Counted, assert_rows, client_address, flows, send, serve, tight_limiter,
};
use crate::compat::nq::{
    CONFIG_PATH, Deps, LARGE_BYTES, LARGE_PATH, ROWS, SMALL_PATH, UPLOAD_PATH, WELL_KNOWN_PATH,
    routes,
};
use crate::config::{Config, Size};
use crate::handlers::tests::support::{UnreadBody, body_bytes, envelope, header, no_transfer};
use crate::handlers::{
    Body, CODE_METHOD_NOT_ALLOWED, CODE_PAYLOAD_TOO_LARGE, CODE_PUBLIC_URL_REQUIRED,
    CODE_REQUEST_TIMEOUT, CODE_TOO_MANY_STREAMS, Limit, RandomSource, UPLOAD_LIFETIME, small,
};

const MIB: u64 = 1 << 20;

fn test_config() -> Config {
    let mut config = Config::default();
    config.compat.networkquality.enabled = true;
    config.compat.networkquality.max_upload_bytes = Size::new(MIB);
    config.server.public_url = "https://speed.example.lan".parse().expect("an origin");
    config
}

fn layer(config: &Config, flow_limit: Option<Limit>) -> Router {
    routes(
        config,
        Deps {
            source: RandomSource::new().expect("a random source"),
            flow_limit,
            download: no_transfer(),
            upload: no_transfer(),
        },
    )
}

/// Fails on any CORS header: the layer's clients are native tools.
fn assert_no_cors(label: &str, response: &Response<Body>) {
    for name in response.headers().keys() {
        assert!(
            !name.as_str().starts_with("access-control-") && name != "vary",
            "{label}: CORS header {name}"
        );
    }
}

/// Go: `TestConfigServesBothKeySets`
#[tokio::test]
async fn config_serves_both_key_sets() {
    let forwarded: &[(&str, &str)] = &[
        ("x-forwarded-proto", "https, http"),
        ("x-forwarded-host", "nq.example.lan"),
    ];
    for (headers, public_url, base_path, origin, trusted) in [
        (
            &[][..],
            "https://speed.example.lan",
            "/",
            "https://speed.example.lan",
            false,
        ),
        (
            forwarded,
            "https://speed.example.lan/",
            "/speed/",
            "https://speed.example.lan/speed",
            true,
        ),
        (forwarded, "", "/", "https://nq.example.lan", true),
        (
            &[("x-forwarded-proto", "https")][..],
            "",
            "/speed",
            "https://speed.lan:8080/speed",
            true,
        ),
    ] {
        let mut config = test_config();
        config.server.public_url = public_url.parse().expect("an origin");
        base_path.clone_into(&mut config.server.base_path);
        for path in [CONFIG_PATH, WELL_KNOWN_PATH] {
            let mut call = Call::get(path).headers(headers);
            if trusted {
                call = call.trusted();
            }
            let response = send(&layer(&config, None), &call).await;
            assert_eq!(response.status(), StatusCode::OK, "{path} {origin}");
            assert_eq!(header(&response, "content-type"), "application/json");
            assert_eq!(header(&response, "cache-control"), "no-store");
            assert_no_cors(path, &response);
            // Go's json.Marshal of maps: the keys sorted, at both levels.
            assert_eq!(
                body_bytes(response).await,
                format!(
                    concat!(
                        r#"{{"urls":{{"https_upload_url":"{0}/nq/upload","#,
                        r#""large_download_url":"{0}/nq/large","#,
                        r#""large_https_download_url":"{0}/nq/large","#,
                        r#""small_download_url":"{0}/nq/small","#,
                        r#""small_https_download_url":"{0}/nq/small","#,
                        r#""upload_url":"{0}/nq/upload"}},"version":1}}"#,
                    ),
                    origin
                ),
                "{path} {origin}"
            );
        }
    }
}

/// Go: `TestConfigWithoutAnHTTPSOriginIs503`: no https `public_url`, an untrusted peer's
/// forwarding headers, or a trusted proxy forwarding http or no scheme leave no https origin.
#[tokio::test]
async fn config_without_an_https_origin_is_503() {
    let https: &[(&str, &str)] = &[
        ("x-forwarded-proto", "https"),
        ("x-forwarded-host", "nq.example.lan"),
    ];
    for (headers, public_url, trusted) in [
        (&[][..], "http://speed.lan", false),
        (https, "http://speed.lan", true),
        (&[][..], "", false),
        (https, "", false),
        (&[][..], "", true),
        (&[("x-forwarded-proto", "http")][..], "", true),
        (&[("x-forwarded-proto", "ftp")][..], "", true),
    ] {
        let mut config = test_config();
        config.server.public_url = public_url.parse().expect("an origin");
        for path in [CONFIG_PATH, WELL_KNOWN_PATH] {
            let mut call = Call::get(path).headers(headers);
            if trusted {
                call = call.trusted();
            }
            let response = send(&layer(&config, None), &call).await;
            let body = envelope(
                response,
                StatusCode::SERVICE_UNAVAILABLE,
                CODE_PUBLIC_URL_REQUIRED,
            )
            .await
            .to_string();
            assert!(
                body.contains("server.public_url") && !body.contains("nq.example.lan"),
                "{path} {headers:?} {public_url:?}: {body}"
            );
        }
    }
}

/// Go: `TestSmallIsTheNativeObject`
#[tokio::test]
async fn small_is_the_native_object() {
    let response = send(&layer(&test_config(), None), &Call::get(SMALL_PATH)).await;
    let native = small();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, "content-length"), "1");
    assert_eq!(
        header(&response, "content-type"),
        header(&native, "content-type")
    );
    assert_eq!(body_bytes(response).await, body_bytes(native).await);
}

/// Go: `TestLargeDeclares8GiBAndEndsOnClose`: the client reads a little and goes away.
#[tokio::test]
async fn large_declares_8_gib_and_ends_on_close() {
    let response = send(&layer(&test_config(), None), &Call::get(LARGE_PATH)).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, "content-length"), LARGE_BYTES.to_string());
    assert_eq!(
        header(&response, "content-type"),
        "application/octet-stream"
    );
    assert_eq!(header(&response, "cache-control"), "no-store");
    assert_eq!(header(&response, "content-encoding"), "");
    assert_no_cors(LARGE_PATH, &response);
    let mut body = response.into_body();
    let mut read = 0;
    while read < 3 << 20 {
        let frame = body.frame().await.expect("a frame").expect("data");
        read += frame.into_data().expect("a data frame").len();
    }
    drop(body);
}

/// Go: `TestUploadDrainsUpToItsOwnCap`
#[tokio::test]
async fn upload_drains_up_to_its_own_cap() {
    let mut config = test_config();
    // limits.max_upload_bytes is not the cap of /nq/upload.
    config.limits.max_upload_bytes = Size::new(64 << 10);
    let router = layer(&config, None);
    for (name, size, length) in [
        ("a declared length", 512 << 10, Some(512 << 10)),
        ("exactly the cap", 1 << 20, Some(MIB)),
        ("streamed, under the cap", 700 << 10, None),
        ("empty", 0, Some(0)),
    ] {
        let mut call = Call::new(Method::POST, UPLOAD_PATH);
        if let Some(length) = length {
            call = call.length(length);
        }
        let body = Counted::new(size);
        let read = body.read();
        let response = serve(&router, call.build(body)).await;
        assert_eq!(response.status(), StatusCode::OK, "{name}");
        assert_eq!(read.load(Ordering::SeqCst), size, "{name}");
        assert_eq!(header(&response, "content-length"), "0", "{name}");
        assert_eq!(header(&response, "content-type"), "", "{name}");
        assert_eq!(header(&response, "cache-control"), "no-store", "{name}");
        assert!(body_bytes(response).await.is_empty(), "{name}");
    }
}

/// Go: `TestUploadOverTheCap`, the lifetime on the paused clock.
#[tokio::test(start_paused = true)]
async fn upload_over_the_cap() {
    let router = layer(&test_config(), None);
    // Declared over the cap: 413 without reading.
    let call = Call::new(Method::POST, UPLOAD_PATH).length(MIB + 1);
    let response = serve(&router, call.build(UnreadBody)).await;
    assert_eq!(header(&response, "connection"), "close");
    envelope(
        response,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;

    // Streamed, or lying about its length: read to the cap, then 413 and close.
    let cap = usize::try_from(MIB).expect("the cap");
    for (name, length) in [("streamed", None), ("lying", Some(10))] {
        let mut call = Call::new(Method::POST, UPLOAD_PATH);
        if let Some(length) = length {
            call = call.length(length);
        }
        let body = Counted::new(2 << 20);
        let read = body.read();
        let response = serve(&router, call.build(body)).await;
        let read = read.load(Ordering::SeqCst);
        assert!(
            (cap..=cap + (64 << 10)).contains(&read),
            "{name}: read {read} bytes"
        );
        assert_eq!(header(&response, "connection"), "close", "{name}");
        envelope(
            response,
            StatusCode::PAYLOAD_TOO_LARGE,
            CODE_PAYLOAD_TOO_LARGE,
        )
        .await;
    }

    // The lifetime.
    let entry = Instant::now();
    let call = Call::new(Method::POST, UPLOAD_PATH).length(1000);
    let response = serve(&router, call.build(Counted::new(3).stalling())).await;
    assert_eq!(entry.elapsed(), UPLOAD_LIFETIME);
    envelope(response, StatusCode::REQUEST_TIMEOUT, CODE_REQUEST_TIMEOUT).await;
}

/// Go: `TestUnlistedMethodIs405`
#[tokio::test]
async fn unlisted_method_is_405() {
    let router = layer(&test_config(), None);
    let preflight: &[(&str, &str)] = &[
        ("origin", "https://ui.example.lan"),
        ("access-control-request-method", "GET"),
    ];
    for (method, path, allow) in [
        (Method::OPTIONS, CONFIG_PATH, "GET"),
        (Method::OPTIONS, WELL_KNOWN_PATH, "GET"),
        (Method::OPTIONS, SMALL_PATH, "GET"),
        (Method::OPTIONS, LARGE_PATH, "GET"),
        (Method::OPTIONS, UPLOAD_PATH, "POST"),
        (Method::POST, CONFIG_PATH, "GET"),
        (Method::POST, LARGE_PATH, "GET"),
        (Method::GET, UPLOAD_PATH, "POST"),
        (Method::PUT, UPLOAD_PATH, "POST"),
    ] {
        let label = format!("{method} {path}");
        let response = send(&router, &Call::new(method, path).headers(preflight)).await;
        assert_no_cors(&label, &response);
        assert_eq!(header(&response, "allow"), allow, "{label}");
        envelope(
            response,
            StatusCode::METHOD_NOT_ALLOWED,
            CODE_METHOD_NOT_ALLOWED,
        )
        .await;
    }
    let head = send(&router, &Call::new(Method::HEAD, SMALL_PATH)).await;
    assert_eq!(
        head.status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "HEAD /nq/small"
    );
}

/// Go: `TestFlowsCountAgainstTheFlowLimitOnly`: `/nq/large` and `/nq/upload` take a flow
/// slot, not a stream slot, and a refusal is 429 with `Retry-After`; the config and
/// `/nq/small` are never limited.
#[tokio::test]
async fn flows_count_against_the_flow_limit_only() {
    let limiter = tight_limiter();
    let router = layer(&test_config(), Some(flows(&limiter)));
    // Every stream slot is taken: the flows do not use them.
    let _stream = limiter
        .acquire_stream(client_address())
        .expect("a stream slot");
    let call = Call::new(Method::POST, UPLOAD_PATH).length(3);
    let response = serve(&router, call.build(Body::from("abc"))).await;
    assert_eq!(
        response.status(),
        StatusCode::OK,
        "an upload flow with the streams taken"
    );
    drop(response);

    let _flow = limiter.acquire_flow(client_address()).expect("a flow slot");
    for (method, path) in [(Method::GET, LARGE_PATH), (Method::POST, UPLOAD_PATH)] {
        let call = Call::new(method, path).length(3);
        let response = serve(&router, call.build(Body::from("abc"))).await;
        assert_eq!(header(&response, "retry-after"), "1", "{path}");
        assert_no_cors(path, &response);
        envelope(
            response,
            StatusCode::TOO_MANY_REQUESTS,
            CODE_TOO_MANY_STREAMS,
        )
        .await;
    }
    for path in [CONFIG_PATH, WELL_KNOWN_PATH, SMALL_PATH] {
        let response = send(&router, &Call::get(path)).await;
        assert_eq!(response.status(), StatusCode::OK, "{path} at the limits");
    }
}

/// Go: `TestRouterHoldsExactlyTheRouteTableRows`
#[tokio::test]
async fn router_holds_exactly_the_route_table_rows() {
    let rows: Vec<_> = ROWS
        .iter()
        .map(|row| (row.path, row.methods.to_vec()))
        .collect();
    assert_eq!(
        rows,
        [
            (CONFIG_PATH, vec![Method::GET]),
            (WELL_KNOWN_PATH, vec![Method::GET]),
            (SMALL_PATH, vec![Method::GET]),
            (LARGE_PATH, vec![Method::GET]),
            (UPLOAD_PATH, vec![Method::POST]),
        ]
    );
    let router = layer(&test_config(), None);
    assert_rows(&router, &ROWS).await;
    for path in ["/nq", "/nq/", "/nq/Small", "/.well-known/nq/"] {
        assert_eq!(
            send(&router, &Call::get(path)).await.status(),
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
}
