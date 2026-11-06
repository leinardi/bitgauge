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

//! The router's tests through the whole stack: CORS, the limits per route, the base path, the
//! 404 and 405 answers, the SPA, the route table and the collision check.

use std::sync::Arc;

use bytes::Bytes;
use http::{Method, StatusCode};

use super::stack::{REQUESTS_PER_MINUTE, TestStack, groups, limiter, test_config, test_spa};
use crate::buildinfo;
use crate::config::{Config, Origin};
use crate::metrics::Metrics;
use crate::server::router::router;
use crate::server::routes::{Owner, check_routes, route_table};

const ORIGIN: &str = "https://speed.example";

fn allowing(origin: &str) -> Config {
    let mut config = test_config();
    config.server.cors.allowed_origins = vec![origin.parse::<Origin>().expect("an origin")];
    config
}

const CORS_HEADERS: [&str; 6] = [
    "access-control-allow-origin",
    "vary",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-expose-headers",
    "timing-allow-origin",
];

/// Go: `TestCORSOffByDefault`.
#[tokio::test]
async fn cors_off_by_default() {
    let stack = TestStack::start(&test_config(), None).await;
    let reply = stack.call(Method::GET, "/api/v1/ping", Some(ORIGIN)).await;
    for name in CORS_HEADERS {
        assert_eq!(reply.header(name), "", "{name} without allowed origins");
    }
    // Without allowed origins there is no preflight to answer.
    let preflight = stack
        .call(Method::OPTIONS, "/api/v1/download", Some(ORIGIN))
        .await;
    assert_eq!(preflight.status, StatusCode::METHOD_NOT_ALLOWED);
}

/// Go: `TestCORSForAnAllowedOrigin`.
#[tokio::test]
async fn cors_for_an_allowed_origin() {
    let stack = TestStack::start(&allowing(ORIGIN), None).await;
    let want = [
        ORIGIN,
        "Origin",
        "GET, POST, OPTIONS",
        "Content-Type",
        "Server-Timing",
        ORIGIN,
    ];
    for (method, status) in [
        (Method::GET, StatusCode::OK),
        (Method::OPTIONS, StatusCode::NO_CONTENT),
    ] {
        let reply = stack
            .call(method.clone(), "/api/v1/info", Some(ORIGIN))
            .await;
        assert_eq!(reply.status, status, "{method}");
        for (name, value) in CORS_HEADERS.into_iter().zip(want) {
            assert_eq!(reply.header(name), value, "{method}: {name}");
        }
    }
    let foreign = stack
        .call(Method::GET, "/api/v1/info", Some("https://other.example"))
        .await;
    assert_eq!(foreign.header("access-control-allow-origin"), "");
}

/// Go: `TestOnlyDownloadAndUploadAreLimited`.
#[tokio::test]
async fn only_download_and_upload_are_limited() {
    let stack = TestStack::start(&allowing(ORIGIN), None).await;
    // More than the whole burst of the routes that are never counted, preflights included.
    for _ in 0..=REQUESTS_PER_MINUTE {
        for (method, path) in [
            (Method::GET, "/api/v1/ping"),
            (Method::GET, "/api/v1/small"),
            (Method::GET, "/api/v1/info"),
            (Method::OPTIONS, "/api/v1/download"),
            (Method::OPTIONS, "/api/v1/upload"),
        ] {
            let reply = stack.call(method.clone(), path, Some(ORIGIN)).await;
            assert!(
                reply.status.as_u16() < 400,
                "{method} {path} = {}",
                reply.status
            );
        }
    }
    // The burst is still whole for the throughput routes.
    for index in 0..REQUESTS_PER_MINUTE {
        let (method, path) = if index % 2 == 1 {
            (Method::POST, "/api/v1/upload")
        } else {
            (Method::GET, "/api/v1/download?bytes=1")
        };
        let reply = stack.call(method, path, Some(ORIGIN)).await;
        assert_eq!(
            reply.status,
            StatusCode::OK,
            "throughput request {}",
            index + 1
        );
    }
    for (method, path) in [
        (Method::GET, "/api/v1/download?bytes=1"),
        (Method::POST, "/api/v1/upload"),
    ] {
        let reply = stack.call(method.clone(), path, Some(ORIGIN)).await;
        assert_eq!(
            reply.status,
            StatusCode::TOO_MANY_REQUESTS,
            "{method} {path}"
        );
        assert_ne!(reply.header("retry-after"), "", "{method} {path}");
        assert_eq!(
            reply.header("access-control-allow-origin"),
            ORIGIN,
            "{method} {path}"
        );
    }
    let ping = stack.call(Method::GET, "/api/v1/ping", Some(ORIGIN)).await;
    assert_eq!(ping.status, StatusCode::NO_CONTENT, "ping after the burst");
}

/// Go: `TestRouterBasePathAndNotFound`, with the rendered SPA in place of a stub.
#[tokio::test]
async fn router_base_path_and_not_found() {
    let mut config = test_config();
    config.server.base_path = "/speed".to_owned();
    let stack = TestStack::start(&config, Some(test_spa("/speed"))).await;
    for (path, status, content_type) in [
        ("/speed/api/v1/ping", StatusCode::NO_CONTENT, ""),
        (
            "/speed/api/v1/nope",
            StatusCode::NOT_FOUND,
            "application/json",
        ),
        (
            "/speed/nope",
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
        ),
        (
            "/api/v1/ping",
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
        ),
        ("/nope", StatusCode::NOT_FOUND, "text/plain; charset=utf-8"),
        ("/speed", StatusCode::OK, "text/html; charset=utf-8"),
        ("/speed/", StatusCode::OK, "text/html; charset=utf-8"),
        (
            "/speed/result/0b6f",
            StatusCode::OK,
            "text/html; charset=utf-8",
        ),
        ("/speed/history", StatusCode::OK, "text/html; charset=utf-8"),
        (
            "/speed/assets/index-a1.js",
            StatusCode::OK,
            "text/javascript; charset=utf-8",
        ),
    ] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_eq!(reply.status, status, "{path}");
        assert_eq!(reply.header("content-type"), content_type, "{path}");
    }
}

/// Go: `TestRouterServesTheRenderedSPA`.
#[tokio::test]
async fn router_serves_the_rendered_spa() {
    let mut config = test_config();
    config.server.base_path = "/speed".to_owned();
    let stack = TestStack::start(&config, Some(test_spa("/speed"))).await;
    for path in [
        "/speed/",
        "/speed/result/0b6f",
        "/speed/history",
        "/speed/settings",
        "/speed/about",
    ] {
        let reply = stack.fetch(Method::GET, path).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.header("cache-control"), "no-cache", "{path}");
        assert!(
            reply
                .header("content-security-policy")
                .starts_with("default-src 'none'"),
            "{path}: {:?}",
            reply.headers
        );
        assert_eq!(
            reply.header("cross-origin-embedder-policy"),
            "require-corp",
            "{path}"
        );
        assert!(
            reply.text().contains(r#"src="/speed/assets/index-a1.js""#),
            "{path}"
        );
    }
    let asset = stack.fetch(Method::GET, "/speed/assets/index-a1.js").await;
    assert_eq!(asset.status, StatusCode::OK);
    assert_eq!(
        asset.header("cache-control"),
        "public, max-age=31536000, immutable"
    );
    for path in ["/speed/unknown", "/unknown", "/favicon.svg"] {
        assert_eq!(
            stack.fetch(Method::GET, path).await.status,
            StatusCode::NOT_FOUND,
            "{path}"
        );
    }
}

/// Go: `TestRouterWithoutSPA`.
#[tokio::test]
async fn router_without_spa() {
    let stack = TestStack::start(&test_config(), None).await;
    assert_eq!(
        stack.fetch(Method::GET, "/").await.status,
        StatusCode::NOT_FOUND
    );
}

/// A path the route-table pattern matches.
pub(super) fn request_path(pattern: &str) -> String {
    let path = pattern.replace("{id}", "abc").replace('*', "index-a1.js");
    if path == "/api/v1/download" {
        return format!("{path}?bytes=1");
    }
    path
}

const PROBED: [Method; 8] = [
    Method::GET,
    Method::HEAD,
    Method::POST,
    Method::PUT,
    Method::PATCH,
    Method::DELETE,
    Method::OPTIONS,
    Method::TRACE,
];

/// Go: `TestRouterServesOnlyTheRouteTable`. axum has no `chi.Walk`, so every probed method is
/// sent to every row of the route table: a mounted row serves exactly its methods (neither 404
/// nor 405) and answers 405 to the others, and a disabled layer's rows are 404. The served
/// pairs are counted as Go counted the walked routes.
#[tokio::test]
async fn router_serves_only_the_route_table() {
    // The native API's seven method and path pairs, then OpenSpeedTest's seven, LibreSpeed's
    // 29 (seven in each of four spellings, and the server list) and networkQuality's five when
    // they are enabled.
    for (pairs, openspeedtest, librespeed, networkquality) in [
        (0, false, false, false),
        (7, true, false, false),
        (29, false, true, false),
        (5, false, false, true),
        (41, true, true, true),
    ] {
        let mut config = test_config();
        config.limits.requests_per_minute = 1_000_000;
        config.limits.max_streams_per_client = 1_000;
        config.compat.openspeedtest.enabled = openspeedtest;
        config.compat.librespeed.enabled = librespeed;
        config.compat.networkquality.enabled = networkquality;
        let stack = TestStack::start(&config, Some(test_spa("/"))).await;
        let mut served = 0;
        for route in route_table() {
            let path = request_path(&route.pattern);
            for method in PROBED {
                let status = stack
                    .open(method.clone(), &path, &[], Bytes::new())
                    .await
                    .response
                    .status();
                let label = format!("{method} {path} ({config:?})", config = route.owner);
                if !route.owner.mounted(&config) {
                    assert_eq!(status, StatusCode::NOT_FOUND, "{label}");
                } else if route.methods.contains(&method) {
                    assert!(
                        status != StatusCode::NOT_FOUND && status != StatusCode::METHOD_NOT_ALLOWED,
                        "{label}: {status}"
                    );
                    served += 1;
                } else {
                    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED, "{label}");
                }
            }
        }
        let spa_pairs = route_table()
            .iter()
            .filter(|route| route.owner == Owner::Spa)
            .map(|route| route.methods.len())
            .sum::<usize>();
        assert_eq!(
            served,
            spa_pairs + 7 + pairs,
            "layers {openspeedtest} {librespeed} {networkquality}"
        );
    }
}

/// Go: `TestCheckRoutes`.
#[test]
fn check_routes_finds_every_collision() {
    for (path, collides) in [
        ("/metrics", false),
        ("/stats", false),
        ("/resultx", false),
        ("/result", false),
        ("/assets", false),
        ("/favicon.svgx", false),
        ("/favicon.svg", true),
        ("/site.webmanifest", true),
        ("/", true),
        ("/history", true),
        ("/result/abc", true),
        ("/assets/index.js", true),
        ("/api/v1", true),
        ("/api/v1/info", true),
        ("/api/v1/anything", true),
        ("/upload", true),
        ("/backend/getIP.php", true),
        ("/.well-known/nq", true),
        ("/nq/large", true),
        ("/.well-known/librespeed", true),
    ] {
        let mut config = Config::default();
        config.metrics.path = path.to_owned();
        let problems = check_routes(&config);
        assert_eq!(
            !problems.is_empty(),
            collides,
            "metrics.path {path}: {problems:?}"
        );
        if let Some(problem) = problems.first() {
            assert_eq!(problem.key, "metrics.path");
            assert_eq!(problem.value, path);
        }
    }
}

/// Go: `TestNewRouterRunsTheCollisionCheck`.
#[tokio::test]
async fn router_runs_the_collision_check() {
    let mut config = test_config();
    config.metrics.path = "/upload".to_owned();
    let limiter = limiter(&config);
    let meter = Arc::new(Metrics::new(buildinfo::info(), || 0, &[]));
    let groups = groups(&config, None, &limiter, &meter);
    let problems = router(&config, groups).expect_err("a collision");
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert_eq!(problems[0].key, "metrics.path");
    assert_eq!(
        problems[0].rule,
        "must not collide with the OpenSpeedTest route /upload (compatibility.md section 5)"
    );
}
