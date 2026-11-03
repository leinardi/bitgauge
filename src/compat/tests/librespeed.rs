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

//! The LibreSpeed layer.

use std::sync::atomic::Ordering;

use axum::Router;
use http::{Method, Response, StatusCode, Version};
use tokio::time::Instant;

use super::support::{
    Call, Counted, assert_rows, client_address, send, serve, streams, tight_limiter,
};
use crate::compat::librespeed::{Deps, ROWS, WELL_KNOWN_PATH, routes};
use crate::config::{Config, Size};
use crate::handlers::tests::support::{UnreadBody, body_bytes, envelope, header, no_transfer};
use crate::handlers::{
    Body, CODE_BAD_REQUEST, CODE_INTERNAL, CODE_METHOD_NOT_ALLOWED, CODE_PAYLOAD_TOO_LARGE,
    CODE_REQUEST_TIMEOUT, CODE_TOO_MANY_STREAMS, Limit, RandomSource, UPLOAD_LIFETIME,
};

const MIB: u64 = 1 << 20;

fn test_config() -> Config {
    let mut config = Config::default();
    config.compat.librespeed.enabled = true;
    config.limits.max_download_bytes = Size::new(8 * MIB);
    config.limits.max_upload_bytes = Size::new(MIB);
    "BitGauge home".clone_into(&mut config.server.display_name);
    config.server.cors.allowed_origins = vec!["https://ui.example.lan".parse().expect("an origin")];
    config
}

fn layer(config: &Config, limit: Option<Limit>) -> Router {
    routes(
        config,
        Deps {
            source: RandomSource::new().expect("a random source"),
            limit,
            download: no_transfer(),
            upload: no_transfer(),
        },
    )
}

fn spellings_of(name: &str) -> [String; 4] {
    [
        format!("/{name}"),
        format!("/backend/{name}"),
        format!("/{name}.php"),
        format!("/backend/{name}.php"),
    ]
}

/// The four CORS headers a response carries, empty when absent.
fn cors_of(response: &Response<Body>) -> [&str; 4] {
    [
        header(response, "access-control-allow-origin"),
        header(response, "access-control-allow-methods"),
        header(response, "access-control-allow-headers"),
        header(response, "vary"),
    ]
}

const ANY_ORIGIN: [&str; 4] = ["*", "GET, POST", "Content-Encoding, Content-Type", ""];
const NO_CORS: [&str; 4] = [""; 4];

/// Go: `TestEveryRouteAnswersInFourSpellings`
#[tokio::test]
async fn every_route_answers_in_four_spellings() {
    let router = layer(&test_config(), None);
    for name in ["garbage", "empty", "getIP"] {
        for path in spellings_of(name) {
            assert_eq!(
                send(&router, &Call::get(&path)).await.status(),
                StatusCode::OK,
                "GET {path}"
            );
        }
    }
    for path in spellings_of("empty") {
        let call = Call::new(Method::POST, &path).length(3);
        let response = serve(&router, call.build(Body::from("abc"))).await;
        assert_eq!(response.status(), StatusCode::OK, "POST {path}");
    }
}

/// Go: `TestGarbageChunks`
#[tokio::test]
async fn garbage_chunks() {
    let router = layer(&test_config(), None);
    for (target, chunks) in [
        ("/garbage", 4),
        ("/garbage?ckSize=1", 1),
        ("/garbage?ckSize=007", 7),
        ("/garbage?ckSize=8", 8),
        ("/garbage?ckSize=9", 8),
        ("/garbage?ckSize=1024", 8),
        ("/garbage?ckSize=99999999999999999", 8),
        ("/garbage?ckSize=2&ckSize=abc", 2),
        ("/garbage?ckSize=3&cors=true", 3),
    ] {
        let response = send(&router, &Call::get(target)).await;
        let size = chunks * MIB;
        assert_eq!(response.status(), StatusCode::OK, "{target}");
        assert_eq!(
            header(&response, "content-length"),
            size.to_string(),
            "{target}"
        );
        assert_eq!(
            header(&response, "content-type"),
            "application/octet-stream",
            "{target}"
        );
        assert_eq!(header(&response, "cache-control"), "no-store", "{target}");
        assert_eq!(header(&response, "content-encoding"), "", "{target}");
        assert_eq!(body_bytes(response).await.len() as u64, size, "{target}");
    }
}

/// Go: `TestGarbageRefusesAnInvalidCkSize`
#[tokio::test]
async fn garbage_refuses_an_invalid_ck_size() {
    let router = layer(&test_config(), None);
    for value in ["0", "00", "-1", "1.5", "abc", "", "+3", "%203", "3x", "1e3"] {
        let target = format!("/garbage?ckSize={value}");
        envelope(
            send(&router, &Call::get(&target)).await,
            StatusCode::BAD_REQUEST,
            CODE_BAD_REQUEST,
        )
        .await;
    }
}

/// Go: `TestGarbageCapFollowsTheDownloadLimit`: the clamp is `min(1024, floor(max_download_bytes
/// / 1 MiB))`; the body is never read, only its declared length.
#[tokio::test]
async fn garbage_cap_follows_the_download_limit() {
    for (download, chunks) in [(MIB, 1), (MIB + 1024, 1), (256 * MIB, 256), (4 << 30, 1024)] {
        let mut config = test_config();
        config.limits.max_download_bytes = Size::new(download);
        let response = send(&layer(&config, None), &Call::get("/garbage?ckSize=5000")).await;
        assert_eq!(
            header(&response, "content-length"),
            (chunks * MIB).to_string(),
            "max_download_bytes {download}"
        );
    }
}

/// Go: `TestEmptyDrainsAndKeepsTheConnection`
#[tokio::test]
async fn empty_drains_and_keeps_the_connection() {
    let router = layer(&test_config(), None);
    for (name, method, size, length, version, keep_alive) in [
        (
            "a GET ping",
            Method::GET,
            0,
            Some(0),
            Version::HTTP_11,
            "keep-alive",
        ),
        (
            "a POST upload",
            Method::POST,
            64 << 10,
            Some(64 << 10),
            Version::HTTP_11,
            "keep-alive",
        ),
        (
            "exactly the cap",
            Method::POST,
            1 << 20,
            Some(MIB),
            Version::HTTP_11,
            "keep-alive",
        ),
        (
            "without a length, under the cap",
            Method::POST,
            5000,
            None,
            Version::HTTP_11,
            "keep-alive",
        ),
        (
            "over HTTP/2",
            Method::POST,
            10,
            Some(10),
            Version::HTTP_2,
            "",
        ),
    ] {
        let mut call = Call::new(method, "/empty?r=0.4").version(version);
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
        assert_eq!(header(&response, "connection"), keep_alive, "{name}");
        assert!(body_bytes(response).await.is_empty(), "{name}");
    }
}

/// Go: `TestEmptyCapAndLifetime`, the lifetime on the paused clock.
#[tokio::test(start_paused = true)]
async fn empty_cap_and_lifetime() {
    let router = layer(&test_config(), None);
    let cap = usize::try_from(MIB).expect("the cap");
    for (name, length) in [
        ("without a length, past the cap", None),
        ("a lying length", Some(10)),
    ] {
        let mut call = Call::new(Method::POST, "/empty");
        if let Some(length) = length {
            call = call.length(length);
        }
        let body = Counted::new(cap + 1);
        let read = body.read();
        let response = serve(&router, call.build(body)).await;
        assert_eq!(header(&response, "connection"), "close", "{name}");
        let read = read.load(Ordering::SeqCst);
        assert!(read <= cap + (64 << 10), "{name}: read {read} bytes");
        envelope(
            response,
            StatusCode::PAYLOAD_TOO_LARGE,
            CODE_PAYLOAD_TOO_LARGE,
        )
        .await;
    }

    let call = Call::new(Method::POST, "/empty").length(MIB + 1);
    envelope(
        serve(&router, call.build(UnreadBody)).await,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;

    let entry = Instant::now();
    let call = Call::new(Method::POST, "/empty").length(1000);
    let response = serve(&router, call.build(Counted::new(3).stalling())).await;
    assert_eq!(entry.elapsed(), UPLOAD_LIFETIME);
    envelope(response, StatusCode::REQUEST_TIMEOUT, CODE_REQUEST_TIMEOUT).await;
}

/// Go: `TestGetIPClassifiesTheAddress`
#[tokio::test]
async fn get_ip_classifies_the_address() {
    let router = layer(&test_config(), None);
    for (client, want) in [
        ("::1", "::1 - localhost IPv6 access"),
        ("fe80::1", "fe80::1 - link-local IPv6 access"),
        ("fd00::5", "fd00::5 - ULA IPv6 access"),
        ("fd7a:115c:a1e0::17", "fd7a:115c:a1e0::17 - ULA IPv6 access"),
        ("127.0.0.1", "127.0.0.1 - localhost IPv4 access"),
        ("10.8.0.2", "10.8.0.2 - private IPv4 access"),
        ("172.16.0.9", "172.16.0.9 - private IPv4 access"),
        ("192.168.1.42", "192.168.1.42 - private IPv4 access"),
        ("169.254.10.1", "169.254.10.1 - link-local IPv4 access"),
        ("100.64.0.1", "100.64.0.1 - CGNAT IPv4 access"),
        ("::ffff:192.168.1.42", "192.168.1.42 - private IPv4 access"),
        ("203.0.113.9", "203.0.113.9"),
        ("2001:db8::9", "2001:db8::9"),
    ] {
        for target in ["/getIP", "/backend/getIP.php?isp=true&distance=km"] {
            let response = send(&router, &Call::get(target).client(client)).await;
            assert_eq!(response.status(), StatusCode::OK, "{target} from {client}");
            assert_eq!(header(&response, "content-type"), "application/json");
            assert_eq!(header(&response, "cache-control"), "no-store");
            let body = body_bytes(response).await;
            // Go's field order: rawIspInfo, then processedString.
            assert_eq!(
                body,
                format!(r#"{{"rawIspInfo":{{}},"processedString":"{want}"}}"#),
                "{target} from {client}"
            );
        }
    }
}

/// Go: `TestGetIPWithoutTheMiddlewareIs500`
#[tokio::test]
async fn get_ip_without_the_middleware_is_500() {
    let mut request = Call::get("/getIP").build(Body::empty());
    request.extensions_mut().clear();
    let response = serve(&layer(&test_config(), None), request).await;
    envelope(response, StatusCode::INTERNAL_SERVER_ERROR, CODE_INTERNAL).await;
}

/// Go: `TestCORSOnlyWithCorsTrue`
#[tokio::test]
async fn cors_only_with_cors_true() {
    let router = layer(&test_config(), None);
    let listed: &[(&str, &str)] = &[("origin", "https://ui.example.lan")];
    let unlisted: &[(&str, &str)] = &[("origin", "https://evil.example")];
    let echoed = [
        "https://ui.example.lan",
        "GET, POST",
        "Content-Encoding, Content-Type",
        "Origin",
    ];
    for (headers, method, target, want) in [
        (unlisted, Method::GET, "/garbage?cors=true", ANY_ORIGIN),
        (
            &[][..],
            Method::GET,
            "/backend/empty.php?cors=true",
            ANY_ORIGIN,
        ),
        (&[][..], Method::POST, "/empty?cors=true", ANY_ORIGIN),
        (&[][..], Method::GET, "/garbage", NO_CORS),
        (&[][..], Method::GET, "/garbage?cors=1", NO_CORS),
        (&[][..], Method::GET, "/empty?cors=TRUE", NO_CORS),
        (&[][..], Method::GET, "/empty?cors=", NO_CORS),
        // A preflight cannot carry the query reliably, so it is always answered.
        (&[][..], Method::OPTIONS, "/garbage", ANY_ORIGIN),
        (unlisted, Method::OPTIONS, "/backend/empty", ANY_ORIGIN),
        // /getIP is never *: only a listed origin, echoed, with Vary.
        (listed, Method::GET, "/getIP?cors=true", echoed),
        (listed, Method::GET, "/getIP", NO_CORS),
        (listed, Method::GET, "/getIP?cors=1", NO_CORS),
        (unlisted, Method::GET, "/getIP?cors=true", NO_CORS),
        (&[][..], Method::GET, "/getIP?cors=true", NO_CORS),
        (listed, Method::OPTIONS, "/getIP.php", echoed),
        (unlisted, Method::OPTIONS, "/getIP", NO_CORS),
        // The server list sends none.
        (
            listed,
            Method::GET,
            "/.well-known/librespeed?cors=true",
            NO_CORS,
        ),
    ] {
        let label = format!("{method} {target} with {headers:?}");
        let preflight = method == Method::OPTIONS;
        let response = send(
            &router,
            &Call::new(method, target).headers(headers).length(0),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK, "{label}");
        assert_eq!(cors_of(&response), want, "{label}");
        if preflight {
            assert_eq!(header(&response, "content-length"), "0", "{label}");
            assert!(
                body_bytes(response).await.is_empty(),
                "{label}: a preflight with a body"
            );
        }
    }
}

/// Go: `TestUnlistedMethodIs405`
#[tokio::test]
async fn unlisted_method_is_405() {
    let router = layer(&test_config(), None);
    for (method, path, allow) in [
        (Method::HEAD, "/garbage", "GET, OPTIONS"),
        (Method::POST, "/backend/garbage.php", "GET, OPTIONS"),
        (Method::PUT, "/empty.php", "GET, POST, OPTIONS"),
        (Method::HEAD, "/backend/empty", "GET, POST, OPTIONS"),
        (Method::POST, "/getIP", "GET, OPTIONS"),
        (Method::OPTIONS, "/.well-known/librespeed", "GET"),
        (Method::POST, "/.well-known/librespeed", "GET"),
    ] {
        let label = format!("{method} {path}");
        let head = method == Method::HEAD;
        let response = send(&router, &Call::new(method, path)).await;
        assert_eq!(header(&response, "allow"), allow, "{label}");
        // A HEAD answer has no body to hold the envelope.
        if head {
            assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED, "{label}");
        } else {
            envelope(
                response,
                StatusCode::METHOD_NOT_ALLOWED,
                CODE_METHOD_NOT_ALLOWED,
            )
            .await;
        }
    }
}

/// Go: `TestServerList`
#[tokio::test]
async fn server_list() {
    let forwarded: &[(&str, &str)] = &[
        ("x-forwarded-proto", "https"),
        ("x-forwarded-host", "speed.example.lan, internal"),
    ];
    for (headers, public_url, base_path, want, trusted) in [
        (&[][..], "", "/", "http://speed.lan:8080/", false),
        (forwarded, "", "/", "http://speed.lan:8080/", false),
        (
            forwarded,
            "",
            "/speed/",
            "https://speed.example.lan/speed/",
            true,
        ),
        (
            &[("x-forwarded-host", "bad host")][..],
            "",
            "/",
            "http://speed.lan:8080/",
            true,
        ),
        (
            forwarded,
            "https://speed.example.org",
            "/speed/",
            "https://speed.example.org/speed/",
            true,
        ),
    ] {
        let mut config = test_config();
        config.server.public_url = public_url.parse().expect("an origin");
        base_path.clone_into(&mut config.server.base_path);
        let mut call = Call::get(WELL_KNOWN_PATH).headers(headers);
        if trusted {
            call = call.trusted();
        }
        let response = send(&layer(&config, None), &call).await;
        assert_eq!(response.status(), StatusCode::OK, "{want}");
        assert_eq!(header(&response, "content-type"), "application/json");
        assert_eq!(header(&response, "cache-control"), "no-store");
        assert_eq!(cors_of(&response), NO_CORS);
        // Go's json.Marshal of a map: the keys sorted.
        assert_eq!(
            body_bytes(response).await,
            format!(
                r#"[{{"dlURL":"garbage","getIpURL":"getIP","id":1,"name":"BitGauge home","pingURL":"empty","server":"{want}","ulURL":"empty"}}]"#
            ),
        );
    }
}

/// Go: `TestThroughputRoutesTakeAStreamSlot`: `/garbage` and `/empty` count against
/// `limits.max_streams_per_client`, a 429 carries the CORS headers `cors=true` asked for, and
/// `/getIP`, the server list and preflights are never limited.
#[tokio::test]
async fn throughput_routes_take_a_stream_slot() {
    let limiter = tight_limiter();
    let router = layer(&test_config(), Some(streams(&limiter)));
    let _permit = limiter
        .acquire_stream(client_address())
        .expect("a stream slot");
    for (method, target) in [
        (Method::GET, "/garbage?cors=true"),
        (Method::GET, "/backend/empty.php?cors=true"),
        (Method::POST, "/empty?cors=true"),
    ] {
        let response = send(&router, &Call::new(method, target).length(0)).await;
        assert_eq!(cors_of(&response), ANY_ORIGIN, "{target}");
        envelope(
            response,
            StatusCode::TOO_MANY_REQUESTS,
            CODE_TOO_MANY_STREAMS,
        )
        .await;
    }
    for (method, target) in [
        (Method::GET, "/getIP"),
        (Method::GET, WELL_KNOWN_PATH),
        (Method::OPTIONS, "/garbage"),
        (Method::OPTIONS, "/empty"),
    ] {
        let response = send(&router, &Call::new(method.clone(), target)).await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "{method} {target} at the limit"
        );
    }
}

/// Go: `TestRouterHoldsExactlyTheRouteTableRows`
#[tokio::test]
async fn router_holds_exactly_the_route_table_rows() {
    let mut want: Vec<(String, Vec<Method>)> =
        vec![(WELL_KNOWN_PATH.to_owned(), vec![Method::GET])];
    for (name, methods) in [
        ("garbage", vec![Method::GET, Method::OPTIONS]),
        ("empty", vec![Method::GET, Method::POST, Method::OPTIONS]),
        ("getIP", vec![Method::GET, Method::OPTIONS]),
    ] {
        for path in spellings_of(name) {
            want.push((path, methods.clone()));
        }
    }
    let mut rows: Vec<(String, Vec<Method>)> = ROWS
        .iter()
        .map(|row| (row.path.to_owned(), row.methods.to_vec()))
        .collect();
    want.sort();
    rows.sort();
    assert_eq!(rows, want);
    let pairs: usize = ROWS.iter().map(|row| row.methods.len()).sum();
    assert_eq!(pairs, 29);
    let router = layer(&test_config(), None);
    assert_rows(&router, &ROWS).await;
    for path in [
        "/",
        "/backend/",
        "/garbage.PHP",
        "/Garbage",
        "/backend/backend/empty",
    ] {
        assert_eq!(
            send(&router, &Call::get(path)).await.status(),
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
}
