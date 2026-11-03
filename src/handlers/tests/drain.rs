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

//! The drainer, on the paused clock.

use std::sync::atomic::Ordering;
use std::time::Duration;

use http::{Request, StatusCode, Version};
use tokio::time::Instant;

use super::support::{ScriptedBody, UnreadBody, data, envelope, header, no_transfer};
use crate::handlers::{
    Body, CODE_LENGTH_REQUIRED, CODE_PAYLOAD_TOO_LARGE, DrainOptions, LifetimeExceeded, drain_body,
};

fn options(limit: u64, require_length: bool) -> DrainOptions {
    DrainOptions {
        transfer: no_transfer(),
        limit,
        lifetime: Duration::from_secs(60),
        require_length,
    }
}

fn request<B>(length: Option<u64>, body: B) -> Request<B> {
    let mut builder = Request::post("/");
    if let Some(length) = length {
        builder = builder.header("content-length", length);
    }
    builder.body(body).expect("a request")
}

/// Go: `TestDrainCountsEveryRead`, by frames rather than 64 KiB reads (rust-port.md row 10).
#[tokio::test(start_paused = true)]
async fn drain_counts_every_frame() {
    let start = Instant::now();
    let script = [
        data(1, 70_000),
        data(2, 65_536),
        data(3, 10),
        data(4, 196_618),
    ];
    let total: usize = 70_000 + 65_536 + 10 + 196_618;
    let mut frames = Vec::new();
    let drained = drain_body(
        request(None, ScriptedBody::new(start, &script)),
        start,
        &options(1 << 30, false),
        |bytes| {
            frames.push(bytes);
            Ok(())
        },
    )
    .await;
    assert_eq!(drained.ok(), Some(u64::try_from(total).expect("a total")));
    assert_eq!(frames, [70_000, 65_536, 10, 196_618]);
}

/// Go: `TestDrainStopsOnCallbackError`: the callback's refusal is the lifetime's 408, after one
/// call.
#[tokio::test(start_paused = true)]
async fn drain_stops_on_the_callback_s_refusal() {
    let start = Instant::now();
    let script = [data(1, 10), data(2, 10), data(3, 10)];
    let body = ScriptedBody::new(start, &script);
    let reads = body.reads();
    let mut calls = 0;
    let answer = drain_body(request(None, body), start, &options(1 << 30, false), |_| {
        calls += 1;
        Err(LifetimeExceeded)
    })
    .await
    .expect_err("stopped");
    assert_eq!((calls, reads.load(Ordering::SeqCst)), (1, 1));
    assert_eq!(answer.status(), StatusCode::REQUEST_TIMEOUT);
}

/// Go: `TestDrainCutsAtTheCap` and `TestDrainBodyReadsALengthlessBodyUpToTheCap`: a body
/// without a length is read up to the cap, and one past it is cut there with 413 and close.
#[tokio::test(start_paused = true)]
async fn a_lengthless_body_is_read_up_to_the_cap() {
    let start = Instant::now();
    let drained = drain_body(
        request(
            None,
            ScriptedBody::new(start, &[data(1, 600), data(2, 400)]),
        ),
        start,
        &options(1000, false),
        |_| Ok(()),
    )
    .await;
    assert_eq!(drained.ok(), Some(1000), "the whole body and no answer");

    let mut counted = 0;
    let answer = drain_body(
        request(
            None,
            ScriptedBody::new(start, &[data(1, 600), data(2, 401)]),
        ),
        start,
        &options(1000, false),
        |bytes| {
            counted += bytes;
            Ok(())
        },
    )
    .await
    .expect_err("over the cap");
    assert!(counted <= 1000, "{counted} bytes counted past the cap");
    assert_eq!(header(&answer, "connection"), "close");
    envelope(
        *answer,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;
}

/// Go: `TestDrainBodyRequiresALengthOnlyWhenAsked`
#[tokio::test]
async fn drain_body_requires_a_length_only_when_asked() {
    let answer = drain_body(
        request(None, UnreadBody),
        Instant::now(),
        &options(1000, true),
        |_| Ok(()),
    )
    .await
    .expect_err("411");
    envelope(*answer, StatusCode::LENGTH_REQUIRED, CODE_LENGTH_REQUIRED).await;
}

/// Go: `TestDrainBodyRefusesADeclaredLengthOverTheCap`: refused without reading. Go also
/// checked that no read deadline was set first; Rust sets none, and the lifetime counts from
/// entry (`lifetime_counts_from_entry` in the upload tests).
#[tokio::test]
async fn drain_body_refuses_a_declared_length_over_the_cap() {
    let answer = drain_body(
        request(Some(1001), UnreadBody),
        Instant::now(),
        &options(1000, false),
        |_| Ok(()),
    )
    .await
    .expect_err("413");
    assert_eq!(header(&answer, "connection"), "close");
    envelope(
        *answer,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;

    let drained = drain_body(
        request(Some(1), Body::from("x")),
        Instant::now(),
        &options(1000, false),
        |_| Ok(()),
    )
    .await;
    assert_eq!(drained.ok(), Some(1));
}

/// `Connection: close` is for HTTP/1.x only (no Go test: Go's server checked the protocol).
#[tokio::test]
async fn http2_refusals_keep_the_connection() {
    let mut refused = request(Some(1001), UnreadBody);
    *refused.version_mut() = Version::HTTP_2;
    let answer = drain_body(refused, Instant::now(), &options(1000, false), |_| Ok(()))
        .await
        .expect_err("413");
    assert_eq!(header(&answer, "connection"), "");
}
