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

//! The Go metrics tests, ported against the gathered OpenMetrics text; each names the Go test it
//! maps to. A family's children come out in no fixed order, so a family is compared as the
//! sorted set of its lines.

use std::fmt::Write as _;

use bytes::Bytes;
use http::header::{
    ALLOW, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE as CONTENT_TYPE_HEADER,
    X_CONTENT_TYPE_OPTIONS,
};
use http::{Method, Response};
use http_body_util::{BodyExt, Full};

use super::*;
use crate::logger;
use crate::test_support::Capture;

const BUILD: Build = Build {
    version: "0.2.0",
    commit: "a1b2c3d",
    date: "2026-10-17T12:00:00Z",
};

fn test_routes() -> Vec<Route> {
    vec![
        Route::new("/", Group::Spa),
        Route::new("/api/v1/download", Group::Api),
        Route::new("/metrics", Group::Metrics),
    ]
}

fn test_metrics(tracked: usize) -> Metrics {
    Metrics::new(BUILD, move || tracked, &test_routes())
}

/// The sample suffixes a family's samples may carry.
const SUFFIXES: [&str; 5] = ["", "_total", "_bucket", "_sum", "_count"];

/// The lines of one family, its HELP and TYPE lines included, sorted.
fn family(exposition: &str, name: &str) -> Vec<String> {
    let mut lines: Vec<String> = exposition
        .lines()
        .filter(|line| {
            if let Some(comment) = line
                .strip_prefix("# HELP ")
                .or_else(|| line.strip_prefix("# TYPE "))
            {
                return comment.split(' ').next() == Some(name);
            }
            let sample = line.split(['{', ' ']).next().unwrap_or_default();
            SUFFIXES
                .iter()
                .any(|suffix| sample.strip_suffix(suffix) == Some(name))
        })
        .map(str::to_owned)
        .collect();
    lines.sort();
    lines
}

fn sorted(expected: &str) -> Vec<String> {
    let mut lines: Vec<String> = expected
        .lines()
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect();
    lines.sort();
    lines
}

fn compare(meter: &Metrics, expected: &str, names: &[&str]) {
    let exposition = meter.encode().expect("the exposition");
    let mut got: Vec<String> = names
        .iter()
        .flat_map(|name| family(&exposition, name))
        .collect();
    got.sort();
    assert_eq!(got, sorted(expected), "exposition:\n{exposition}");
}

/// Go: `TestMetricSet`. The names, types, labels and startup children of the metric set; the
/// counters' TYPE and HELP lines name the family without `_total`, as OpenMetrics writes them,
/// and the build information has no `goversion`.
#[test]
fn metric_set() {
    let meter = test_metrics(3);
    let download = meter.transfer(Group::Api, Direction::Download);
    download.start();
    download.add(1000);
    download.abort();
    let upload = meter.transfer(Group::Api, Direction::Upload);
    upload.start();
    upload.add(250);
    upload.done();
    upload.timeout();
    meter.refused(Limit::Rate);
    meter.websocket_opened();
    meter.websocket_echoed();
    meter.websocket_echoed();

    compare(
        &meter,
        r#"
# HELP bitgauge_transfer_bytes Bytes sent (download) and drained (upload).
# TYPE bitgauge_transfer_bytes counter
bitgauge_transfer_bytes_total{direction="download",group="api"} 1000
bitgauge_transfer_bytes_total{direction="upload",group="api"} 250
# HELP bitgauge_active_transfers Transfers in progress.
# TYPE bitgauge_active_transfers gauge
bitgauge_active_transfers{direction="download",group="api"} 1
bitgauge_active_transfers{direction="upload",group="api"} 0
# HELP bitgauge_http_aborts Transfers the client abandoned before the body ended.
# TYPE bitgauge_http_aborts counter
bitgauge_http_aborts_total{direction="download",group="api"} 1
bitgauge_http_aborts_total{direction="upload",group="api"} 0
# HELP bitgauge_upload_timeouts Upload bodies cut at the 120 s lifetime.
# TYPE bitgauge_upload_timeouts counter
bitgauge_upload_timeouts_total{group="api"} 1
# HELP bitgauge_rate_limited Rejections by limit.
# TYPE bitgauge_rate_limited counter
bitgauge_rate_limited_total{limit="nq_flows"} 0
bitgauge_rate_limited_total{limit="rate"} 1
bitgauge_rate_limited_total{limit="streams"} 0
bitgauge_rate_limited_total{limit="table_full"} 0
bitgauge_rate_limited_total{limit="websocket"} 0
# HELP bitgauge_websocket_connections Open latency WebSockets.
# TYPE bitgauge_websocket_connections gauge
bitgauge_websocket_connections 1
# HELP bitgauge_websocket_messages Echoed ping messages.
# TYPE bitgauge_websocket_messages counter
bitgauge_websocket_messages_total 2
# HELP bitgauge_ratelimit_tracked_clients Entries in the rate-limit table.
# TYPE bitgauge_ratelimit_tracked_clients gauge
bitgauge_ratelimit_tracked_clients 3
# HELP bitgauge_build_info Build information; always 1.
# TYPE bitgauge_build_info gauge
bitgauge_build_info{commit="a1b2c3d",version="0.2.0"} 1
"#,
        &[
            "bitgauge_transfer_bytes",
            "bitgauge_active_transfers",
            "bitgauge_http_aborts",
            "bitgauge_upload_timeouts",
            "bitgauge_rate_limited",
            "bitgauge_websocket_connections",
            "bitgauge_websocket_messages",
            "bitgauge_ratelimit_tracked_clients",
            "bitgauge_build_info",
        ],
    );
}

/// backend.md section 7's upper bounds, as the exposition writes them.
const BUCKET_BOUNDS: [&str; 15] = [
    "0.005", "0.01", "0.025", "0.05", "0.1", "0.25", "0.5", "1.0", "2.5", "5.0", "10.0", "30.0",
    "60.0", "120.0", "+Inf",
];

/// The expected exposition of one duration child: `first_full` is the index of the first bucket
/// counting its `count` observations, which sum to `sum`.
fn histogram(group: &str, route: &str, first_full: usize, count: u64, sum: &str) -> String {
    let mut text = String::new();
    for (index, bound) in BUCKET_BOUNDS.iter().enumerate() {
        let in_bucket = if index >= first_full { count } else { 0 };
        writeln!(
            text,
            "bitgauge_http_request_duration_seconds_bucket{{le=\"{bound}\",group=\"{group}\",route=\"{route}\"}} {in_bucket}"
        )
        .expect("a string");
    }
    writeln!(
        text,
        "bitgauge_http_request_duration_seconds_sum{{group=\"{group}\",route=\"{route}\"}} {sum}"
    )
    .expect("a string");
    writeln!(
        text,
        "bitgauge_http_request_duration_seconds_count{{group=\"{group}\",route=\"{route}\"}} {count}"
    )
    .expect("a string");
    text
}

const DURATION_HEAD: &str = "# HELP bitgauge_http_request_duration_seconds Request durations by route group and route pattern.
# TYPE bitgauge_http_request_duration_seconds histogram
";
const REQUESTS_HEAD: &str =
    "# HELP bitgauge_http_requests Requests by route group, route pattern and status.
# TYPE bitgauge_http_requests counter
";

/// Go: `TestRequestSeries`
#[test]
fn request_series() {
    let meter = Metrics::new(BUILD, || 0, &[Route::new("/api/v1/download", Group::Api)]);

    // No request counter exists before a route answers, while every duration child does.
    compare(&meter, "", &["bitgauge_http_requests"]);
    let untouched = BUCKET_BOUNDS.len();
    compare(
        &meter,
        &(DURATION_HEAD.to_owned()
            + &histogram("api", "/api/v1/download", untouched, 0, "0.0")
            + &histogram("api", UNMATCHED, untouched, 0, "0.0")
            + &histogram("spa", UNMATCHED, untouched, 0, "0.0")),
        &["bitgauge_http_request_duration_seconds"],
    );

    meter.observe(Group::Api, "/api/v1/download", Some(StatusCode::OK), 7.0);
    meter.observe(Group::Api, UNMATCHED, Some(StatusCode::NOT_FOUND), 0.002);
    // A status BitGauge does not answer, and a request that ended without any, count as other.
    meter.observe(Group::Spa, UNMATCHED, Some(StatusCode::IM_A_TEAPOT), 0.02);
    meter.observe(Group::Spa, UNMATCHED, None, 0.02);
    // A pattern the router does not mount counts as its group's unmatched route.
    meter.observe(
        Group::Api,
        "/api/v1/scanner",
        Some(StatusCode::NOT_FOUND),
        0.002,
    );

    // The first bucket holding each observation: 10 s for 7 s, 5 ms for 2 ms, 25 ms for 20 ms.
    let (seven_seconds, two_millis, twenty_millis) = (10, 0, 2);
    compare(
        &meter,
        &(REQUESTS_HEAD.to_owned()
            + r#"bitgauge_http_requests_total{code="200",group="api",route="/api/v1/download"} 1
bitgauge_http_requests_total{code="404",group="api",route="unmatched"} 2
bitgauge_http_requests_total{code="other",group="spa",route="unmatched"} 2
"# + DURATION_HEAD
            + &histogram("api", "/api/v1/download", seven_seconds, 1, "7.0")
            + &histogram("api", UNMATCHED, two_millis, 2, "0.004")
            + &histogram("spa", UNMATCHED, twenty_millis, 2, "0.04")),
        &[
            "bitgauge_http_requests",
            "bitgauge_http_request_duration_seconds",
        ],
    );
}

/// Go: `TestEveryStatusHasItsCode`
#[test]
fn every_status_has_its_code() {
    for status in [
        101, 200, 204, 206, 304, 400, 403, 404, 405, 408, 411, 413, 416, 429, 500, 503,
    ] {
        let code = StatusCode::from_u16(status).expect("a status");
        assert_eq!(CODE_LABELS[code_slot(Some(code))], status.to_string());
    }
    assert_eq!(CODE_LABELS[code_slot(None)], "other", "no response");
    for status in [100, 201, 302, 401, 418, 502, 504, 999] {
        let code = StatusCode::from_u16(status).expect("a status");
        assert_eq!(CODE_LABELS[code_slot(Some(code))], "other", "{status}");
    }
}

/// Go: `TestEverySentinelIsMapped`. Each limit counts under its own label among five children.
/// Go's error that is not a limit has no Rust spelling: `refused` takes a [`Limit`].
#[test]
fn every_limit_is_mapped() {
    for (limit, label) in [
        (Limit::Streams, "streams"),
        (Limit::Rate, "rate"),
        (Limit::WebSockets, "websocket"),
        (Limit::Flows, "nq_flows"),
        (Limit::TableFull, "table_full"),
    ] {
        let meter = test_metrics(0);
        meter.refused(limit);
        let exposition = meter.encode().expect("the exposition");
        let samples: Vec<String> = family(&exposition, "bitgauge_rate_limited")
            .into_iter()
            .filter(|line| !line.starts_with('#'))
            .collect();
        assert_eq!(samples.len(), 5, "{samples:?}");
        for sample in samples {
            let want = if sample.contains(&format!("limit=\"{label}\"")) {
                " 1"
            } else {
                " 0"
            };
            assert!(sample.ends_with(want), "{limit:?}: {sample}");
        }
    }
}

/// Go: `TestNilMetricsRecordNothing`, the half Rust can write: a group without throughput routes
/// hands out a transfer that records nothing. There is no nil `Metrics` to call.
#[test]
fn a_group_without_transfers_records_nothing() {
    let meter = test_metrics(0);
    let before = meter.encode().expect("the exposition");
    let transfer = meter.transfer(Group::Spa, Direction::Download);
    transfer.start();
    transfer.add(1);
    transfer.abort();
    transfer.timeout();
    transfer.done();
    assert_eq!(meter.encode().expect("the exposition"), before);
}

/// Go: `TestRegistryHoldsTheRuntimeCollectors`, inverted by rust-port.md row 5: the registry
/// holds no `go_*` or `process_*` families, nothing but BitGauge's own. prometheus-client has
/// no default registry to leak into.
#[test]
fn registry_holds_only_the_metric_set() {
    let exposition = test_metrics(0).encode().expect("the exposition");
    for line in exposition.lines().filter(|line| *line != "# EOF") {
        let name = line
            .strip_prefix("# HELP ")
            .or_else(|| line.strip_prefix("# TYPE "))
            .unwrap_or(line);
        assert!(name.starts_with("bitgauge_"), "{line}");
    }
}

async fn body_text(response: Response<Full<Bytes>>) -> String {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("a whole body")
        .to_bytes();
    String::from_utf8(bytes.to_vec()).expect("UTF-8")
}

fn header<'response>(
    response: &'response Response<Full<Bytes>>,
    name: &http::HeaderName,
) -> &'response str {
    response
        .headers()
        .get(name)
        .map_or("", |value| value.to_str().expect("a text header"))
}

/// Go: `TestHandler`, and the endpoint half of the server's `TestMetricsEndpoint`: always
/// OpenMetrics, never compressed, `no-store` and `nosniff`; any other method a plain 405.
#[tokio::test]
async fn endpoint_writes_open_metrics() {
    let meter = test_metrics(0);
    let response = meter.respond(&Method::GET);
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, &CONTENT_TYPE_HEADER), CONTENT_TYPE);
    assert_eq!(header(&response, &CONTENT_ENCODING), "");
    assert_eq!(header(&response, &CACHE_CONTROL), "no-store");
    assert_eq!(header(&response, &X_CONTENT_TYPE_OPTIONS), "nosniff");
    let body = body_text(response).await;
    assert!(
        body.contains("bitgauge_build_info{") && body.ends_with("# EOF\n"),
        "{body}"
    );

    for method in [Method::HEAD, Method::POST, Method::DELETE] {
        let refused = meter.respond(&method);
        assert_eq!(refused.status(), StatusCode::METHOD_NOT_ALLOWED, "{method}");
        assert_eq!(header(&refused, &ALLOW), "GET");
        assert!(header(&refused, &CONTENT_TYPE_HEADER).starts_with("text/plain"));
        assert_eq!(header(&refused, &CACHE_CONTROL), "no-store");
        assert_eq!(body_text(refused).await, "Method Not Allowed\n");
    }
}

/// A collector that fails every scrape.
#[derive(Debug)]
struct Failing;

impl Collector for Failing {
    fn encode(&self, _encoder: DescriptorEncoder) -> fmt::Result {
        Err(fmt::Error)
    }
}

/// Go: `TestHandlerAnswers500AndWarnsOnAGatherError`
#[tokio::test]
async fn endpoint_answers_500_and_warns_on_an_encoding_error() {
    let mut meter = test_metrics(0);
    meter.registry.register_collector(Box::new(Failing));
    let logs = Capture::default();
    let dispatch = logger::to_writer(logs.clone(), "text", "info").expect("a logger");
    let response = tracing::dispatcher::with_default(&dispatch, || meter.respond(&Method::GET));
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert!(header(&response, &CONTENT_TYPE_HEADER).starts_with("text/plain"));
    assert!(!body_text(response).await.contains("bitgauge_"));
    let line = logs.text();
    assert!(
        line.lines().count() == 1
            && line.contains(" WARN ")
            && line.contains("metrics endpoint")
            && line.contains(&fmt::Error.to_string()),
        "log {line:?}, want one warn line naming the error"
    );
}

/// Go: `TestEachMountedLayerHasItsUnmatchedRoute`
#[test]
fn each_mounted_layer_has_its_unmatched_route() {
    let meter = Metrics::new(
        BUILD,
        || 0,
        &[
            Route::new("/api/v1/download", Group::Api),
            Route::new("/garbage", Group::LibreSpeed),
            Route::new("/empty", Group::LibreSpeed),
            Route::new("/nq/config", Group::Nq),
        ],
    );
    meter.observe(
        Group::LibreSpeed,
        UNMATCHED,
        Some(StatusCode::METHOD_NOT_ALLOWED),
        0.002,
    );
    meter.observe(
        Group::Nq,
        UNMATCHED,
        Some(StatusCode::SERVICE_UNAVAILABLE),
        0.002,
    );
    // No OpenSpeedTest route is mounted, so it has no series of its own to count in.
    meter.observe(
        Group::OpenSpeedTest,
        UNMATCHED,
        Some(StatusCode::NOT_FOUND),
        0.002,
    );
    compare(
        &meter,
        &(REQUESTS_HEAD.to_owned()
            + r#"bitgauge_http_requests_total{code="405",group="librespeed",route="unmatched"} 1
bitgauge_http_requests_total{code="503",group="nq",route="unmatched"} 1
"#),
        &["bitgauge_http_requests"],
    );
}
