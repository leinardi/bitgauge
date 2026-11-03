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

//! The compatibility layers as the router mounts them (Go's `openspeedtest_test.go`,
//! `librespeed_test.go` and `nq_test.go` in `internal/server`): their paths under the base
//! path, their header group, their limits, their labels, and the plain 404 when disabled.

use bytes::Bytes;
use http::{Method, StatusCode};

use super::stack::{
    REQUESTS_PER_MINUTE, Reply, TestStack, has_request_series, metrics_config, test_spa, trusting,
};
use crate::config::{Config, Origin};

async fn layer_stack(base_path: &str, enable: impl FnOnce(&mut Config)) -> TestStack {
    let mut config = metrics_config(base_path);
    enable(&mut config);
    TestStack::start(&config, Some(test_spa(base_path))).await
}

/// The SPA group's plain 404 of a disabled layer's path.
fn assert_spa_404(reply: &Reply, label: &str) {
    assert_eq!(reply.status, StatusCode::NOT_FOUND, "{label}");
    assert_ne!(reply.header("content-type"), "application/json", "{label}");
    assert!(!reply.text().contains(r#""error""#), "{label}");
    assert_eq!(reply.header("access-control-allow-origin"), "", "{label}");
    assert_ne!(reply.header("content-security-policy"), "", "{label}");
}

/// The headers every OpenSpeedTest answer carries: the API set of its group and the three
/// CORS headers, without the SPA's.
fn assert_openspeedtest_headers(reply: &Reply, label: &str) {
    for (name, want) in [
        ("cache-control", "no-store"),
        ("x-content-type-options", "nosniff"),
        ("access-control-allow-origin", "*"),
        ("access-control-allow-methods", "GET, POST, OPTIONS"),
        ("access-control-allow-headers", "Content-Type"),
        ("content-security-policy", ""),
        ("content-encoding", ""),
    ] {
        assert_eq!(reply.header(name), want, "{label}: {name}");
    }
}

fn openspeedtest(config: &mut Config) {
    config.compat.openspeedtest.enabled = true;
}

fn librespeed(config: &mut Config) {
    config.compat.librespeed.enabled = true;
}

/// Go: `TestOpenSpeedTestOffIsAPlain404`.
#[tokio::test]
async fn openspeedtest_off_is_a_plain_404() {
    let stack = layer_stack("/", |_| ()).await;
    for (method, path) in [
        (Method::GET, "/downloading"),
        (Method::HEAD, "/downloading"),
        (Method::OPTIONS, "/downloading"),
        (Method::GET, "/upload"),
        (Method::POST, "/upload"),
        (Method::OPTIONS, "/upload"),
    ] {
        assert_spa_404(
            &stack.fetch(method.clone(), path).await,
            &format!("{method} {path}"),
        );
    }
}

/// Go: `TestOpenSpeedTestRoutes`.
#[tokio::test]
async fn openspeedtest_routes() {
    let stack = layer_stack("/speed/", openspeedtest).await;
    let reply = stack
        .fetch(Method::GET, "/speed/downloading?n=0.12345")
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body.len(), 31_457_280);
    assert_eq!(reply.header("content-length"), "31457280");
    assert_eq!(reply.header("content-type"), "application/octet-stream");
    assert_openspeedtest_headers(&reply, "GET /downloading");

    let reply = stack.fetch(Method::HEAD, "/speed/downloading").await;
    assert_eq!(reply.status, StatusCode::OK);
    assert!(reply.body.is_empty());
    assert_eq!(reply.header("content-length"), "31457280");

    for method in [Method::GET, Method::HEAD, Method::OPTIONS] {
        for path in ["/speed/upload?n=7", "/speed/downloading"] {
            if method != Method::OPTIONS && path == "/speed/downloading" {
                continue;
            }
            let label = format!("{method} {path}");
            let reply = stack.fetch(method.clone(), path).await;
            assert_eq!(reply.status, StatusCode::OK, "{label}");
            assert!(reply.body.is_empty(), "{label}");
            assert_eq!(reply.header("content-length"), "0", "{label}");
            assert_eq!(reply.header("content-type"), "", "{label}");
            assert_openspeedtest_headers(&reply, &label);
        }
    }

    let posted = stack.call(Method::POST, "/speed/upload?n=1", None).await;
    assert_eq!(posted.status, StatusCode::OK);
    assert_eq!(posted.header("content-length"), "0");
    assert_openspeedtest_headers(&posted, "POST /upload");
}

/// Go: `TestOpenSpeedTestUnlistedMethodIs405`. Elsewhere a method a path does not serve is the
/// SPA's own 405, whose Allow lists `HEAD` too (`docs/rust-port.md` row 12).
#[tokio::test]
async fn openspeedtest_unlisted_method_is_405() {
    let stack = layer_stack("/", openspeedtest).await;
    for (path, allow) in [
        ("/downloading", "GET, HEAD, OPTIONS"),
        ("/upload", "GET, HEAD, POST, OPTIONS"),
    ] {
        for method in [Method::PUT, Method::DELETE, Method::PATCH] {
            let label = format!("{method} {path}");
            let reply = stack.fetch(method, path).await;
            assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED, "{label}");
            assert_eq!(reply.header("allow"), allow, "{label}");
            let decoded: serde_json::Value =
                serde_json::from_slice(&reply.body).expect("an envelope");
            assert_eq!(decoded["error"]["code"], "method_not_allowed", "{label}");
            assert_openspeedtest_headers(&reply, &label);
        }
    }
    let reply = stack.fetch(Method::POST, "/").await;
    assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(reply.header("allow"), "GET, HEAD");
    assert!(reply.body.is_empty());
}

/// Go: `TestOpenSpeedTestCountsAgainstTheLimits`: the ping counts against the request rate
/// like the throughput routes, its 429 carries the CORS headers, and a preflight never reaches
/// the limiter.
#[tokio::test]
async fn openspeedtest_counts_against_the_limits() {
    let stack = layer_stack("/", openspeedtest).await;
    for _ in 0..REQUESTS_PER_MINUTE {
        let reply = stack.fetch(Method::GET, "/upload").await;
        assert_eq!(reply.status, StatusCode::OK, "ping within the burst");
    }
    for path in ["/upload", "/downloading"] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_eq!(
            reply.status,
            StatusCode::TOO_MANY_REQUESTS,
            "GET {path} past the burst"
        );
        assert_ne!(reply.header("retry-after"), "", "{path}");
        assert!(
            reply.text().contains(r#""code":"rate_limited""#),
            "{}",
            reply.text()
        );
        assert_openspeedtest_headers(&reply, &format!("429 on {path}"));
    }
    let preflight = stack.fetch(Method::OPTIONS, "/upload").await;
    assert_eq!(preflight.status, StatusCode::OK, "preflight past the burst");
}

/// Go: `TestOpenSpeedTestRequestsAreLabeled`.
#[tokio::test]
async fn openspeedtest_requests_are_labeled() {
    let stack = layer_stack("/speed/", openspeedtest).await;
    stack.fetch(Method::HEAD, "/speed/downloading").await;
    stack.fetch(Method::GET, "/speed/upload").await;
    stack.fetch(Method::PUT, "/speed/upload").await;
    let exposition = stack.scrape("/speed/metrics").await;
    for labels in [
        r#"code="200",group="openspeedtest",route="/downloading"}"#,
        r#"code="200",group="openspeedtest",route="/upload"}"#,
        r#"code="405",group="openspeedtest",route="unmatched"}"#,
    ] {
        assert!(has_request_series(&exposition, labels), "no {labels}");
    }
}

/// Go: `TestLibreSpeedOffIsAPlain404`.
#[tokio::test]
async fn librespeed_off_is_a_plain_404() {
    let stack = layer_stack("/", |_| ()).await;
    for path in [
        "/garbage",
        "/backend/garbage.php",
        "/empty",
        "/empty.php",
        "/getIP",
        "/backend/getIP",
        "/.well-known/librespeed",
    ] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
        assert!(!reply.text().contains(r#""error""#), "{path}");
        assert_ne!(reply.header("content-security-policy"), "", "{path}");
    }
}

/// Go: `TestLibreSpeedResultsRoutesAreNotMounted`: BitGauge never stores results, so
/// LibreSpeed's results, telemetry and stats routes answer the plain 404 of any unknown path.
#[tokio::test]
async fn librespeed_results_routes_are_not_mounted() {
    let stack = layer_stack("/", librespeed).await;
    for path in [
        "/results",
        "/results/",
        "/results/telemetry",
        "/results/telemetry.php",
        "/backend/results/telemetry.php",
        "/stats",
        "/stats.php",
        "/results/json",
        "/results/json.php",
        "/results/stats.php",
        "/backend/stats.php",
    ] {
        for method in [Method::GET, Method::POST] {
            let reply = stack.fetch(method.clone(), path).await;
            assert_eq!(reply.status, StatusCode::NOT_FOUND, "{method} {path}");
            assert!(!reply.text().contains(r#""error""#), "{method} {path}");
        }
    }
}

/// Go: `TestLibreSpeedRoutesTakeTheLayerGroup`.
#[tokio::test]
async fn librespeed_routes_take_the_layer_group() {
    let stack = layer_stack("/speed/", librespeed).await;
    for path in [
        "/speed/garbage?ckSize=1",
        "/speed/backend/empty.php",
        "/speed/getIP.php",
        "/speed/.well-known/librespeed",
    ] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.header("cache-control"), "no-store", "{path}");
        assert_eq!(reply.header("x-content-type-options"), "nosniff", "{path}");
        assert_eq!(reply.header("content-security-policy"), "", "{path}");
        assert_eq!(reply.header("content-encoding"), "", "{path}");
    }
    // Over HTTP/1.1, /empty asks the client to keep the connection.
    let empty = stack.fetch(Method::GET, "/speed/empty").await;
    assert_eq!(empty.header("connection"), "keep-alive");
    // A request that closes gets only the close, as Go's server replaced the handler's value.
    let closing = stack
        .send(
            Method::GET,
            "/speed/empty",
            &[("connection", "close")],
            Bytes::new(),
        )
        .await;
    let connection: Vec<_> = closing.headers.get_all("connection").iter().collect();
    assert_eq!(connection, ["close"]);
    stack.fetch(Method::PUT, "/speed/empty").await;
    let exposition = stack.scrape("/speed/metrics").await;
    for labels in [
        r#"code="200",group="librespeed",route="/garbage"}"#,
        r#"code="200",group="librespeed",route="/backend/empty.php"}"#,
        r#"code="200",group="librespeed",route="/getIP.php"}"#,
        r#"code="200",group="librespeed",route="/.well-known/librespeed"}"#,
        r#"code="405",group="librespeed",route="unmatched"}"#,
    ] {
        assert!(has_request_series(&exposition, labels), "no {labels}");
    }
}

const FORWARDED: [(&str, &str); 3] = [
    ("x-forwarded-for", "10.8.0.2"),
    ("x-forwarded-proto", "https"),
    ("x-forwarded-host", "speed.example.lan"),
];

/// Go: `TestLibreSpeedReadsForwardingHeadersOnlyFromATrustedProxy`.
#[tokio::test]
async fn librespeed_reads_forwarding_headers_only_from_a_trusted_proxy() {
    for (trusted, want_ip, want_url) in [
        (
            &[][..],
            "127.0.0.1 - localhost IPv4 access",
            "http://127.0.0.1:",
        ),
        (
            &["10.0.0.0/8"][..],
            "127.0.0.1 - localhost IPv4 access",
            "http://127.0.0.1:",
        ),
        (
            &["127.0.0.1/32"][..],
            "10.8.0.2 - private IPv4 access",
            "https://speed.example.lan/",
        ),
    ] {
        let stack = layer_stack("/", |config| {
            librespeed(config);
            trusting(config, trusted);
        })
        .await;
        let reply = stack
            .send(Method::GET, "/getIP", &FORWARDED, Bytes::new())
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{trusted:?}");
        let address: serde_json::Value = serde_json::from_slice(&reply.body).expect("JSON");
        assert_eq!(address["processedString"], want_ip, "{trusted:?}");

        let reply = stack
            .send(
                Method::GET,
                "/.well-known/librespeed",
                &FORWARDED,
                Bytes::new(),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{trusted:?}");
        let list: Vec<serde_json::Value> = serde_json::from_slice(&reply.body).expect("JSON");
        assert_eq!(list.len(), 1, "{trusted:?}");
        let server = list[0]["server"].as_str().expect("a server URL");
        assert!(
            server.starts_with(want_url),
            "{trusted:?}: {server}, want {want_url}"
        );
    }
}

fn nq(public_url: &str, trusted: &[&str]) -> impl FnOnce(&mut Config) {
    let public_url = public_url.to_owned();
    let trusted: Vec<String> = trusted.iter().map(|&proxy| proxy.to_owned()).collect();
    move |config| {
        config.compat.networkquality.enabled = true;
        config.server.public_url = if public_url.is_empty() {
            Origin::default()
        } else {
            public_url.parse().expect("an origin")
        };
        let trusted: Vec<&str> = trusted.iter().map(String::as_str).collect();
        trusting(config, &trusted);
    }
}

/// Go: `TestNQFlowsTakeTheFlowLimit`: `/nq/large` and `/nq/upload` take the flow limit,
/// counted as `nq_flows`; the config and `/nq/small` stay unlimited, and neither flow route
/// takes a stream slot.
#[tokio::test]
async fn nq_flows_take_the_flow_limit() {
    let stack = layer_stack("/", |config| {
        nq("https://speed.example.lan", &[])(config);
        config.compat.networkquality.max_flows_per_client = 1;
        config.limits.max_streams_per_client = 1;
    })
    .await;
    // One /nq/large flow held open, its body unread, while a native download holds the one
    // stream slot.
    let mut held = Vec::new();
    for path in ["/nq/large", "/api/v1/download?bytes=268435456"] {
        let open = stack.open(Method::GET, path, &[], Bytes::new()).await;
        assert_eq!(open.response.status(), StatusCode::OK, "GET {path}");
        held.push(open);
    }
    for (method, path) in [(Method::GET, "/nq/large"), (Method::POST, "/nq/upload")] {
        let reply = stack.fetch(method.clone(), path).await;
        assert_eq!(
            reply.status,
            StatusCode::TOO_MANY_REQUESTS,
            "{method} {path}"
        );
        assert_eq!(reply.header("retry-after"), "1", "{method} {path}");
        assert!(
            reply.text().contains(r#""code":"too_many_streams""#),
            "{}",
            reply.text()
        );
    }
    for path in ["/nq/config", "/.well-known/nq", "/nq/small"] {
        assert_eq!(
            stack.fetch(Method::GET, path).await.status,
            StatusCode::OK,
            "{path}"
        );
    }
    let exposition = stack.scrape("/metrics").await;
    assert!(
        exposition.contains(r#"bitgauge_rate_limited_total{limit="nq_flows"} 2"#)
            && exposition.contains(r#"bitgauge_rate_limited_total{limit="streams"} 0"#),
        "the refusals were not counted as two nq_flows:\n{exposition}"
    );
    drop(held);
}

/// Go: `TestNQOffIsAPlain404`.
#[tokio::test]
async fn nq_off_is_a_plain_404() {
    let stack = layer_stack("/", |_| ()).await;
    for (method, path) in [
        (Method::GET, "/nq/config"),
        (Method::GET, "/.well-known/nq"),
        (Method::GET, "/nq/small"),
        (Method::GET, "/nq/large"),
        (Method::POST, "/nq/upload"),
    ] {
        let reply = stack.fetch(method.clone(), path).await;
        let label = format!("{method} {path}");
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{label}");
        assert!(!reply.text().contains(r#""error""#), "{label}");
        assert_ne!(reply.header("content-security-policy"), "", "{label}");
    }
}

/// Go: `TestNQRoutes`.
#[tokio::test]
async fn nq_routes() {
    let stack = layer_stack("/speed/", nq("https://speed.example.lan", &[])).await;
    let reply = stack.fetch(Method::GET, "/speed/.well-known/nq").await;
    assert_eq!(reply.status, StatusCode::OK);
    let settings: serde_json::Value = serde_json::from_slice(&reply.body).expect("JSON");
    assert_eq!(
        settings["urls"]["https_upload_url"],
        "https://speed.example.lan/speed/nq/upload"
    );
    assert_eq!(reply.header("x-content-type-options"), "nosniff");
    assert_eq!(reply.header("content-security-policy"), "");

    let reply = stack.fetch(Method::GET, "/speed/nq/small").await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body.len(), 1);

    let posted = stack.call(Method::POST, "/speed/nq/upload", None).await;
    assert_eq!(posted.status, StatusCode::OK);
    assert_eq!(posted.header("content-length"), "0");

    // No redirect and no route below an exact path; no preflight.
    for (method, path, status) in [
        (Method::GET, "/speed/nq/config/", StatusCode::NOT_FOUND),
        (Method::GET, "/speed/nq/", StatusCode::NOT_FOUND),
        (Method::GET, "/speed/nq", StatusCode::NOT_FOUND),
        (
            Method::OPTIONS,
            "/speed/nq/config",
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            Method::OPTIONS,
            "/speed/nq/upload",
            StatusCode::METHOD_NOT_ALLOWED,
        ),
    ] {
        let reply = stack.fetch(method.clone(), path).await;
        let label = format!("{method} {path}");
        assert_eq!(reply.status, status, "{label}");
        assert_eq!(reply.header("location"), "", "{label}");
        assert_eq!(reply.header("access-control-allow-origin"), "", "{label}");
    }
    let exposition = stack.scrape("/speed/metrics").await;
    for labels in [
        r#"code="200",group="nq",route="/.well-known/nq"}"#,
        r#"code="200",group="nq",route="/nq/small"}"#,
        r#"code="200",group="nq",route="/nq/upload"}"#,
        r#"code="405",group="nq",route="unmatched"}"#,
    ] {
        assert!(has_request_series(&exposition, labels), "no {labels}");
    }
}

/// Go: `TestNQConfigReadsForwardingHeadersOnlyFromATrustedProxy`: without `public_url` the
/// config's origin comes from a trusted proxy's `X-Forwarded-Proto` and `-Host`, never an
/// untrusted peer's, and plain http is 503 `public_url_required`.
#[tokio::test]
async fn nq_config_reads_forwarding_headers_only_from_a_trusted_proxy() {
    for (trusted, status, want) in [
        (
            &[][..],
            StatusCode::SERVICE_UNAVAILABLE,
            r#""code":"public_url_required""#,
        ),
        (
            &["10.0.0.0/8"][..],
            StatusCode::SERVICE_UNAVAILABLE,
            r#""code":"public_url_required""#,
        ),
        (
            &["127.0.0.1/32"][..],
            StatusCode::OK,
            r#""https://speed.example.lan/nq/small""#,
        ),
    ] {
        let stack = layer_stack("/", nq("", trusted)).await;
        let reply = stack
            .send(Method::GET, "/nq/config", &FORWARDED[1..], Bytes::new())
            .await;
        assert_eq!(reply.status, status, "{trusted:?}: {}", reply.text());
        assert!(reply.text().contains(want), "{trusted:?}: {}", reply.text());
    }
}
