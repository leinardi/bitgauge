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

//! The per-request limit and the shared 429.

use std::future::ready;
use std::net::IpAddr;
use std::sync::Arc;

use http::{Request, StatusCode, Version};

use super::support::{UnreadBody, envelope, header, meter, sample};
use crate::clientip::Client;
use crate::clock::TokioClock;
use crate::handlers::{Body, CODE_TABLE_FULL, CODE_TOO_MANY_STREAMS, Limit, ping, refuse};
use crate::logger;
use crate::metrics::Metrics;
use crate::ratelimit::{Limiter, Options};
use tracing_setup::testing::Capture;

fn limiter(max_flows: u32, tracked_clients: usize) -> Limiter {
    Limiter::new(
        Options {
            max_streams: 1,
            requests_per_minute: 1200,
            tracked_clients,
            max_flows,
        },
        TokioClock,
    )
}

fn address(text: &str) -> IpAddr {
    text.parse().expect("an address")
}

/// A request from `client` with `body`, carrying the [`Client`] the client IP middleware
/// stores.
fn request<B>(client: &str, version: Version, body: B) -> Request<B> {
    let mut request = Request::post("/")
        .version(version)
        .body(body)
        .expect("a request");
    request.extensions_mut().insert(Client {
        address: address(client),
        peer_trusted: false,
    });
    request
}

/// Go: `TestMiddlewareRefusesWith429BeforeReadingTheBody`: the slot is held while the first
/// response is alive, which is while its body streams.
#[tokio::test]
async fn refuses_with_429_before_reading_the_body() {
    for version in [Version::HTTP_11, Version::HTTP_2] {
        let meter = Arc::new(meter());
        let limit = Limit::streams(limiter(1, 16), Arc::clone(&meter));
        let held = limit
            .run(request("10.0.0.1", version, Body::empty()), |_| {
                ready(ping())
            })
            .await;
        let refused = limit
            .run(request("10.0.0.1", version, UnreadBody), |_| async {
                panic!("the handler of a refused request ran")
            })
            .await;
        assert_eq!(header(&refused, "retry-after"), "1", "{version:?}");
        let close = if version == Version::HTTP_11 {
            "close"
        } else {
            ""
        };
        assert_eq!(header(&refused, "connection"), close, "{version:?}");
        envelope(
            refused,
            StatusCode::TOO_MANY_REQUESTS,
            CODE_TOO_MANY_STREAMS,
        )
        .await;
        assert_eq!(
            sample(&meter, r#"bitgauge_rate_limited_total{limit="streams"}"#),
            "1",
            "{version:?}"
        );

        // The finished request released its slot.
        drop(held);
        let after = limit
            .run(request("10.0.0.1", version, Body::empty()), |_| {
                ready(ping())
            })
            .await;
        assert_eq!(after.status(), StatusCode::NO_CONTENT, "{version:?}");
    }
}

/// Go: `TestMiddlewareReleasesOnPanic`
#[tokio::test]
async fn releases_on_panic() {
    let limiter = limiter(1, 16);
    let limit = Limit::streams(limiter.clone(), Arc::new(meter()));
    let panicked = tokio::spawn(async move {
        limit
            .run(
                request("10.0.0.1", Version::HTTP_11, Body::empty()),
                |_| async { panic!("the handler panics") },
            )
            .await
    })
    .await;
    assert!(panicked.is_err_and(|error| error.is_panic()));
    assert!(
        limiter.acquire_stream(address("10.0.0.1")).is_ok(),
        "the aborted request kept its slot"
    );
}

/// Go: `TestRefuseLogsEveryTableFull`: every table-full refusal is logged, without the
/// client, and no other refusal is.
#[test]
fn refuse_logs_every_table_full() {
    let limiter = limiter(1, 1);
    let _active = limiter
        .acquire_stream(address("10.0.0.1"))
        .expect("the one tracked client");
    let Err(table_full) = limiter.acquire_stream(address("10.0.0.9")) else {
        panic!("a second client fit in a table of one");
    };
    let Err(streams) = limiter.acquire_stream(address("10.0.0.1")) else {
        panic!("a second stream fit in one slot");
    };
    let meter = Metrics::new(crate::buildinfo::info(), || 0, &[]);
    let logs = Capture::default();
    let dispatch = logger::to_writer(logs.clone(), "text", "info").expect("a logger");
    let responses = tracing::dispatcher::with_default(&dispatch, || {
        [
            refuse(Version::HTTP_11, &table_full, &meter),
            refuse(Version::HTTP_11, &table_full, &meter),
            refuse(Version::HTTP_11, &streams, &meter),
        ]
    });
    let codes: Vec<_> = responses.iter().map(http::Response::status).collect();
    assert_eq!(codes, [StatusCode::TOO_MANY_REQUESTS; 3]);
    assert_eq!(table_full.code(), CODE_TABLE_FULL);
    let text = logs.text();
    assert_eq!(text.matches(" WARN ").count(), 2, "{text}");
    assert!(
        !text.contains("10.0.0.9"),
        "the warn line names a client IP: {text}"
    );
}

/// Go: `TestFlowMiddlewareTakesAFlowSlotNotAStream`
#[tokio::test]
async fn flows_take_a_flow_slot_not_a_stream() {
    let meter = Arc::new(meter());
    let limiter = limiter(2, 16);
    let limit = Limit::flows(limiter.clone(), Arc::clone(&meter));
    // The client's one stream slot is taken: flows do not count against it.
    let _stream = limiter
        .acquire_stream(address("10.0.0.1"))
        .expect("a stream slot");
    let flow = || request("10.0.0.1", Version::HTTP_11, Body::empty());

    // Three flows at once: the third is refused while the first two hold their slots.
    let first = limit.run(flow(), |_| ready(ping())).await;
    let second = limit.run(flow(), |_| ready(ping())).await;
    let third = limit.run(flow(), |_| ready(ping())).await;
    let statuses = [first.status(), second.status(), third.status()];
    assert_eq!(
        statuses,
        [
            StatusCode::NO_CONTENT,
            StatusCode::NO_CONTENT,
            StatusCode::TOO_MANY_REQUESTS
        ]
    );
    envelope(third, StatusCode::TOO_MANY_REQUESTS, CODE_TOO_MANY_STREAMS).await;
    assert_eq!(
        sample(&meter, r#"bitgauge_rate_limited_total{limit="nq_flows"}"#),
        "1"
    );

    // Every flow gave its slot back.
    drop((first, second));
    let again = [
        limit.run(flow(), |_| ready(ping())).await,
        limit.run(flow(), |_| ready(ping())).await,
    ];
    assert!(
        again
            .iter()
            .all(|response| response.status() == StatusCode::NO_CONTENT)
    );
}

/// A request without a [`Client`] shares one budget with every other such request, as Go's
/// zero address did (no Go test).
#[tokio::test]
async fn requests_without_a_client_share_one_budget() {
    let limit = Limit::streams(limiter(1, 16), Arc::new(meter()));
    let bare = || Request::get("/").body(Body::empty()).expect("a request");
    let held = limit.run(bare(), |_| ready(ping())).await;
    let refused = limit.run(bare(), |_| ready(ping())).await;
    assert_eq!(
        (held.status(), refused.status()),
        (StatusCode::NO_CONTENT, StatusCode::TOO_MANY_REQUESTS)
    );
}
