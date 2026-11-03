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

//! The security headers of each group against security.md section 5, and the classifier that
//! puts a request in its group (Go's `headers_test.go`, `layers_test.go` and `TestClassifier`).

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::Router;
use axum::routing::get;
use http::HeaderMap;

use super::stack::{boom, chain, direct_get, has_request_series, metrics_config, test_config};
use crate::buildinfo;
use crate::metrics::Metrics;
use crate::server::classify::{Classifier, Group, set_headers};
use crate::server::routes::mounted_routes;

/// The SPA header block of security.md section 5, by lower-case name, with the CSP's
/// continuation lines joined by one space, so the test compares against the document itself.
fn spec_headers() -> BTreeMap<String, String> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/docs/features/security.md");
    let text = std::fs::read_to_string(path).expect("security.md");
    let mut headers = BTreeMap::new();
    let (mut in_section, mut in_block, mut last) = (false, false, String::new());
    for line in text.lines() {
        if line.starts_with("## ") {
            in_section = line.starts_with("## 5. ");
        } else if in_section && line == "```text" {
            in_block = true;
        } else if in_block && line == "```" {
            return headers;
        } else if in_block && line.starts_with("  ") {
            let value: &mut String = headers.get_mut(&last).expect("a header before it");
            value.push(' ');
            value.push_str(line.trim());
        } else if in_block {
            let (name, value) = line.split_once(": ").expect("a header line");
            last = name.to_ascii_lowercase();
            headers.insert(last.clone(), value.to_owned());
        }
    }
    panic!("no header block in security.md section 5");
}

fn headers_of(group: Group, host: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    set_headers(&mut headers, group, host);
    headers
}

/// Go: `TestSPAHeadersMatchSecurityMD`.
#[test]
fn spa_headers_match_security_md() {
    let spec = spec_headers();
    assert_eq!(spec.len(), 8, "security.md section 5 lists {spec:?}");
    for host in [
        "speed.example",
        "speed.example:8443",
        "127.0.0.1:8080",
        "localhost",
    ] {
        let headers = headers_of(Group::Spa, host);
        assert_eq!(headers.len(), spec.len(), "{host}: {headers:?}");
        for (name, want) in &spec {
            let values: Vec<_> = headers.get_all(name.as_str()).iter().collect();
            assert_eq!(values.len(), 1, "{host}: {name}");
            assert_eq!(
                values[0],
                want.replace("<host>", host).as_str(),
                "{host}: {name}"
            );
        }
    }
}

/// Go: `TestCSPWithoutWebSocketsForAnInvalidHost`.
#[test]
fn csp_without_websockets_for_an_invalid_host() {
    let want = spec_headers()["content-security-policy"].replace(" ws://<host> wss://<host>", "");
    let long_label = format!("{}.example", "a".repeat(64));
    let long_name = format!("{}aa", "a.".repeat(127));
    for host in [
        "",
        "evil.example; script-src *",
        "a b",
        "exa_mple.com",
        "-bad.example",
        "bad-.example",
        "bad..example",
        ".example",
        "example.",
        "host:",
        "host:0",
        "host:65536",
        "host:123456",
        "host:8a",
        "[::1",
        "[::1]x",
        "[fe80::1%25eth0]",
        "[127.0.0.1]",
        "::1",
        "ex\"ample",
        // IPv6 literals are not hostnames, and CSP host sources cannot name them.
        "[::1]",
        "[::1]:8080",
        "[2001:db8::1]",
        &long_label,
        &long_name,
    ] {
        let headers = headers_of(Group::Spa, host);
        assert_eq!(
            headers["content-security-policy"],
            want.as_str(),
            "host {host:?}"
        );
    }
}

/// Go: `TestAPIHeaders` and `TestLayerGroupsGetTheAPIHeaders`.
#[test]
fn api_and_layer_groups_get_the_api_headers() {
    for group in [
        Group::Api,
        Group::OpenSpeedTest,
        Group::LibreSpeed,
        Group::Nq,
    ] {
        let headers = headers_of(group, "speed.example");
        assert_eq!(headers.len(), 2, "{group:?}: {headers:?}");
        assert_eq!(headers["x-content-type-options"], "nosniff", "{group:?}");
        assert_eq!(headers["cache-control"], "no-store", "{group:?}");
    }
}

/// A value the handler set itself is kept, as Go set the headers before the handler ran.
#[test]
fn a_handlers_own_header_wins() {
    let mut headers = HeaderMap::new();
    headers.insert("cache-control", "no-cache".parse().expect("a value"));
    set_headers(&mut headers, Group::Api, "speed.example");
    assert_eq!(headers["cache-control"], "no-cache");
}

/// Go: `TestClassifier`.
#[test]
fn classifier() {
    let mut config = metrics_config("/speed");
    let classifier = Classifier::new(&config);
    for (path, want) in [
        ("/speed/api/v1", Group::Api),
        ("/speed/api/v1/", Group::Api),
        ("/speed/api/v1/info", Group::Api),
        ("/speed/metrics", Group::Api),
        ("/speed/", Group::Spa),
        ("/speed/api/v1x", Group::Spa),
        ("/speed/assets/index.js", Group::Spa),
        ("/api/v1/info", Group::Spa),
        ("/metrics", Group::Spa),
        ("/speed/metrics/x", Group::Spa),
    ] {
        assert_eq!(classifier.classify(path), want, "{path}");
    }
    config.metrics.enabled = false;
    assert_eq!(
        Classifier::new(&config).classify("/speed/metrics"),
        Group::Spa
    );
}

/// Go: `TestClassifierPutsEnabledLayerPathsInTheirGroup`, with LibreSpeed and networkQuality
/// enabled and OpenSpeedTest standing for a disabled layer.
#[test]
fn classifier_puts_enabled_layer_paths_in_their_group() {
    let mut config = metrics_config("/speed/");
    config.compat.librespeed.enabled = true;
    config.compat.networkquality.enabled = true;
    let classifier = Classifier::new(&config);
    for (path, want) in [
        ("/speed/garbage", Group::LibreSpeed),
        ("/speed/backend/garbage.php", Group::LibreSpeed),
        ("/speed/nq/config", Group::Nq),
        ("/speed/api/v1/info", Group::Api),
        ("/speed/metrics", Group::Api),
        // Exact paths only, below base_path only, and a disabled layer's stay unmatched.
        ("/speed/garbage/x", Group::Spa),
        ("/speed/nq/config/", Group::Spa),
        ("/garbage", Group::Spa),
        ("/speed/downloading", Group::Spa),
    ] {
        assert_eq!(classifier.classify(path), want, "{path}");
    }
}

/// Go: `TestLayerGroupsTakeTheAPIRules`. Here the meter knows the layers' routes from the
/// configuration that enables them, so the panicking route keeps its pattern.
#[tokio::test]
async fn layer_groups_take_the_api_rules() {
    let mut config = test_config();
    config.compat.librespeed.enabled = true;
    config.compat.networkquality.enabled = true;
    let meter = Arc::new(Metrics::new(
        buildinfo::info(),
        || 0,
        &mounted_routes(&config),
    ));
    let router = Router::new().route("/nq/config", get(boom));
    let stack = chain(router, &config, Some(Arc::clone(&meter)));

    // A recovered panic is the error envelope, with the API header set.
    let reply = direct_get(&stack, "/nq/config").await;
    assert_eq!(reply.status, 500);
    assert_eq!(reply.header("content-type"), "application/json");
    assert_eq!(reply.header("cache-control"), "no-store");
    assert_eq!(reply.header("x-content-type-options"), "nosniff");
    assert_eq!(reply.header("content-security-policy"), "");

    // A layer path no route matched counts as that layer's unmatched route.
    assert_eq!(direct_get(&stack, "/garbage").await.status, 404);
    let exposition = meter.encode().expect("an exposition");
    for labels in [
        r#"code="500",group="nq",route="/nq/config"} 1"#,
        r#"code="404",group="librespeed",route="unmatched"} 1"#,
    ] {
        assert!(
            has_request_series(&exposition, labels),
            "{labels} in\n{exposition}"
        );
    }
}
