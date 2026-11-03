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

//! The metrics endpoint as the router mounts it, and the labels requests are counted with (Go's
//! `metrics_test.go`).

use http::{Method, StatusCode};

use super::router::request_path;
use super::stack::{
    REQUESTS_PER_MINUTE, TestStack, has_request_series, metrics_config, test_config, test_spa,
};
use crate::metrics::CONTENT_TYPE;
use crate::server::routes::mounted_routes;

/// Go: `TestMetricsEndpointOffIsAPlain404`.
#[tokio::test]
async fn metrics_endpoint_off_is_a_plain_404() {
    let stack = TestStack::start(&test_config(), Some(test_spa("/"))).await;
    let reply = stack.fetch(Method::GET, "/metrics").await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(reply.header("content-type"), "text/plain; charset=utf-8");
    assert!(!reply.text().contains("bitgauge_"), "{}", reply.text());
}

/// Go: `TestMetricsEndpoint`; the exposition is OpenMetrics (`docs/rust-port.md` row 5).
#[tokio::test]
async fn metrics_endpoint() {
    for base_path in ["/", "/speed/"] {
        let stack = TestStack::start(&metrics_config(base_path), Some(test_spa(base_path))).await;
        let path = format!("{}/metrics", base_path.trim_end_matches('/'));
        let reply = stack.fetch(Method::GET, &path).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.header("content-type"), CONTENT_TYPE, "{path}");
        assert!(reply.text().contains("bitgauge_build_info{"), "{path}");
        assert_eq!(reply.header("cache-control"), "no-store", "{path}");
        assert_eq!(reply.header("x-content-type-options"), "nosniff", "{path}");
        assert_eq!(reply.header("content-encoding"), "", "{path}");
        for method in [Method::HEAD, Method::POST, Method::DELETE] {
            let refused = stack.fetch(method.clone(), &path).await;
            assert_eq!(
                refused.status,
                StatusCode::METHOD_NOT_ALLOWED,
                "{method} {path}"
            );
            assert_eq!(refused.header("allow"), "GET", "{method} {path}");
            assert!(
                !refused.header("content-type").contains("json"),
                "{method} {path}"
            );
            assert!(!refused.text().contains("bitgauge_"), "{method} {path}");
        }
        if base_path != "/" {
            let outside = stack.fetch(Method::GET, "/metrics").await;
            assert_eq!(
                outside.status,
                StatusCode::NOT_FOUND,
                "/metrics outside the base path"
            );
        }
    }
}

/// Go: `TestMetricsEndpointIsNotRateLimited`.
#[tokio::test]
async fn metrics_endpoint_is_not_rate_limited() {
    let stack = TestStack::start(&metrics_config("/"), None).await;
    // Twice the burst: a limited route would refuse the second half.
    for _ in 0..2 * REQUESTS_PER_MINUTE {
        stack.scrape("/metrics").await;
    }
    // The scrapes took none of the throughput routes' tokens.
    for _ in 0..REQUESTS_PER_MINUTE {
        let reply = stack.fetch(Method::GET, "/api/v1/download?bytes=1").await;
        assert_eq!(reply.status, StatusCode::OK, "download after the scrapes");
    }
}

/// Go: `TestRequestsAreLabeledByOwner`: a request to every mounted route, under a base path
/// and without one, counts under its owner's group and its pattern without the base path;
/// paths no route matches count as unmatched, in the classifier's group.
#[tokio::test]
async fn requests_are_labeled_by_owner() {
    for base_path in ["/", "/speed/"] {
        let config = metrics_config(base_path);
        let stack = TestStack::start(&config, Some(test_spa(base_path))).await;
        let base = base_path.trim_end_matches('/');
        let mut want = Vec::new();
        for route in mounted_routes(&config) {
            let method = if route.pattern == "/api/v1/upload" {
                Method::POST
            } else {
                Method::GET
            };
            stack
                .call(
                    method,
                    &format!("{base}{}", request_path(&route.pattern)),
                    None,
                )
                .await;
            want.push(format!(
                r#"group="{}",route="{}"}}"#,
                route.group.as_str(),
                route.pattern
            ));
        }
        stack
            .fetch(Method::GET, &format!("{base}/wp-login.php"))
            .await;
        stack
            .fetch(Method::GET, &format!("{base}/api/v1/nope"))
            .await;
        want.push(r#"group="spa",route="unmatched"}"#.to_owned());
        want.push(r#"group="api",route="unmatched"}"#.to_owned());
        let exposition = stack.scrape(&format!("{base}/metrics")).await;
        for labels in &want {
            assert!(
                has_request_series(&exposition, labels),
                "base {base_path}: no {labels}"
            );
        }
        assert!(
            !exposition.contains(r#"route="/speed"#) && !exposition.contains("wp-login"),
            "base {base_path}: a label carries the base path or a scanned path"
        );
    }
}

/// A method a route does not list is counted as unmatched, as chi matched no route for it;
/// the metrics endpoint keeps its route for every method.
#[tokio::test]
async fn an_unlisted_method_is_unmatched() {
    let stack = TestStack::start(&metrics_config("/speed/"), Some(test_spa("/speed/"))).await;
    stack.fetch(Method::POST, "/speed/history").await;
    stack.fetch(Method::DELETE, "/speed/api/v1/ping").await;
    stack.fetch(Method::POST, "/speed/metrics").await;
    let exposition = stack.scrape("/speed/metrics").await;
    for labels in [
        r#"code="405",group="spa",route="unmatched"} 1"#,
        r#"code="405",group="api",route="unmatched"} 1"#,
        r#"code="405",group="metrics",route="/metrics"} 1"#,
    ] {
        assert!(
            has_request_series(&exposition, labels),
            "{labels} in\n{exposition}"
        );
    }
    assert!(!has_request_series(
        &exposition,
        r#"code="405",group="spa",route="/history""#
    ));
}
