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

//! `POST /api/v1/upload` on the paused clock: each scripted frame arrives at its instant.

use std::sync::atomic::Ordering;
use std::time::Duration;

use bytes::Bytes;
use http::{Request, Response, StatusCode};
use tokio::time::{Instant, advance};

use super::support::{
    Arrival, ScriptedBody, UnreadBody, body_bytes, data, envelope, gone, header, no_transfer,
};
use crate::clock::TokioClock;
use crate::handlers::{
    Abort, Body, CODE_LENGTH_REQUIRED, CODE_PAYLOAD_TOO_LARGE, CODE_REQUEST_TIMEOUT, DrainOptions,
    Epoch, Grid, UPLOAD_LIFETIME, upload,
};

/// K for the upload tests: the grid's origin sits at 123450000 ms, so an entry 6700 ms later
/// is the start of cell 1234567, as in the worked example of section 4.
pub(super) const TEST_OFFSET: i64 = 1_234_500;
pub(super) const EXAMPLE_ENTRY: Duration = Duration::from_millis(6700);
const TEST_MAX_BODY: u64 = 1 << 20;

fn test_epoch() -> Epoch {
    Epoch {
        id: "k3V9qW2rT0aY".to_owned(),
        grid_offset: TEST_OFFSET,
    }
}

fn upload_options() -> DrainOptions {
    DrainOptions {
        transfer: no_transfer(),
        limit: TEST_MAX_BODY,
        lifetime: UPLOAD_LIFETIME,
        require_length: true,
    }
}

/// The grid at the origin, then the clock moved to the handler's entry `entry` later.
pub(super) async fn grid_at(entry: Duration) -> (Grid, Instant) {
    let grid = Grid::new(TokioClock, TEST_OFFSET);
    advance(entry).await;
    (grid, Instant::now())
}

fn post<B>(length: Option<u64>, body: B) -> Request<B> {
    let mut builder = Request::post("/api/v1/upload");
    if let Some(length) = length {
        builder = builder.header("content-length", length);
    }
    builder.body(body).expect("a request")
}

/// An upload of a scripted body entered `entry` after the grid's origin, with the frame count.
pub(super) async fn run(
    entry: Duration,
    length: Option<u64>,
    arrivals: &[Arrival],
) -> (Response<Body>, usize) {
    let (grid, start) = grid_at(entry).await;
    let body = ScriptedBody::new(start, arrivals);
    let reads = body.reads();
    let response = upload(post(length, body), &grid, &test_epoch(), &upload_options()).await;
    (response, reads.load(Ordering::SeqCst))
}

/// Checks a successful upload's status, headers, keys and invariants, and returns its body.
pub(super) async fn telemetry_of(response: Response<Body>) -> (Bytes, serde_json::Value) {
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, "cache-control"), "no-store");
    assert_eq!(header(&response, "content-type"), "application/json");
    let timing = header(&response, "server-timing").to_owned();
    let body = body_bytes(response).await;
    let decoded: serde_json::Value = serde_json::from_slice(&body).expect("JSON telemetry");
    let object = decoded.as_object().expect("an object");
    assert_eq!(
        object.len(),
        7,
        "exactly the seven keys of section 4: {decoded}"
    );
    assert_eq!(timing, format!("bg-recv;dur={}", decoded["durationMs"]));
    let buckets = decoded["buckets"].as_array().expect("buckets");
    let sum: u64 = buckets.iter().filter_map(serde_json::Value::as_u64).sum();
    assert_eq!(decoded["bucketMs"], 100);
    assert_eq!(Some(sum), decoded["bytes"].as_u64());
    assert_eq!(
        decoded["firstBucket"].as_i64(),
        decoded["startMs"].as_i64().map(|ms| ms / 100)
    );
    assert!(buckets.len() <= 1201, "{} buckets", buckets.len());
    (body, decoded)
}

/// Go: `TestUploadWorkedExample`
#[tokio::test(start_paused = true)]
async fn upload_worked_example() {
    // 120 KiB at a steady 120 KiB/s: the first byte arrives 50 ms into cell 1234567, one frame
    // lands in the middle of each of the nine full cells, and the last 50 ms into cell 1234577.
    let mut arrivals = vec![data(50, 6144)];
    arrivals.extend((0..9).map(|cell| data(150 + 100 * cell, 12_288)));
    arrivals.push(data(1050, 6144));
    let (response, _) = run(EXAMPLE_ENTRY, Some(122_880), &arrivals).await;
    let (body, _) = telemetry_of(response).await;
    assert_eq!(
        body,
        concat!(
            r#"{"epoch":"k3V9qW2rT0aY","bucketMs":100,"firstBucket":1234567,"#,
            r#""buckets":[6144,12288,12288,12288,12288,12288,12288,12288,12288,12288,6144],"#,
            r#""bytes":122880,"startMs":123456750,"durationMs":1000}"#
        )
    );
}

/// Go: `TestUploadTelemetry`. Go's read that began in the first cell and returned in the second
/// is a frame arriving in the second: a frame has no beginning, and it counts where it arrived.
#[tokio::test(start_paused = true)]
async fn upload_telemetry() {
    let (response, _) = run(
        EXAMPLE_ENTRY,
        Some(1000),
        // The third cell has no frame and stays zero.
        &[data(20, 100), data(99, 200), data(100, 300), data(350, 400)],
    )
    .await;
    let (_, got) = telemetry_of(response).await;
    assert_eq!(
        got,
        serde_json::json!({
            "epoch": "k3V9qW2rT0aY", "bucketMs": 100, "firstBucket": 1_234_567,
            "buckets": [300, 300, 0, 400], "bytes": 1000, "startMs": 123_456_720,
            "durationMs": 330,
        })
    );
}

/// Go: `TestUploadAtMost1201Buckets`
#[tokio::test(start_paused = true)]
async fn upload_at_most_1201_buckets() {
    // Entered mid-cell, a body whose last frame arrives just inside the lifetime spans the 1200
    // cells of the lifetime plus the partial one it started in.
    let last = u64::try_from(UPLOAD_LIFETIME.as_millis()).expect("ms") - 1;
    let (response, _) = run(
        EXAMPLE_ENTRY + Duration::from_millis(50),
        Some(2),
        &[data(0, 1), data(last, 1)],
    )
    .await;
    let (_, got) = telemetry_of(response).await;
    let buckets = got["buckets"].as_array().expect("buckets");
    assert_eq!(buckets.len(), 1201);
    assert_eq!((&buckets[0], &buckets[1200]), (&1.into(), &1.into()));
}

/// Go: `TestUploadLifetimeIs408WithoutTelemetry`
#[tokio::test(start_paused = true)]
async fn upload_lifetime_is_408_without_telemetry() {
    let lifetime = u64::try_from(UPLOAD_LIFETIME.as_millis()).expect("ms");
    let (response, reads) = run(
        EXAMPLE_ENTRY,
        Some(30),
        &[
            data(1000, 10),
            data(lifetime, 10),
            data(lifetime + 1000, 10),
        ],
    )
    .await;
    assert_eq!(header(&response, "server-timing"), "");
    assert_eq!(header(&response, "connection"), "close");
    assert_eq!(reads, 2, "close after the frame past the lifetime");
    let decoded = envelope(response, StatusCode::REQUEST_TIMEOUT, CODE_REQUEST_TIMEOUT).await;
    assert!(decoded.get("buckets").is_none());
}

/// Go: `TestUploadSetsTheReadDeadlineAtEntry`, and the in-process half of
/// `TestUploadStalledBodyIsCutByTheReadDeadline`: a body that stops arriving is answered 408
/// exactly the lifetime after the handler's entry.
#[tokio::test(start_paused = true)]
async fn lifetime_counts_from_entry() {
    let (grid, entry) = grid_at(EXAMPLE_ENTRY).await;
    let body = ScriptedBody::new(entry, &[data(1000, 10)]).stalling();
    let response = upload(
        post(Some(100), body),
        &grid,
        &test_epoch(),
        &upload_options(),
    )
    .await;
    assert_eq!(Instant::now() - entry, UPLOAD_LIFETIME);
    envelope(response, StatusCode::REQUEST_TIMEOUT, CODE_REQUEST_TIMEOUT).await;
}

/// Go: `TestUploadDrainsBeforeResponding`: the answer is built only once the body has ended.
#[tokio::test(start_paused = true)]
async fn upload_drains_before_responding() {
    let (response, reads) = run(EXAMPLE_ENTRY, Some(8000), &[data(10, 4000), data(20, 4000)]).await;
    assert_eq!(reads, 2);
    let (_, got) = telemetry_of(response).await;
    assert_eq!(got["bytes"], 8000);
}

/// Go: `TestUploadRefusesBeforeReading`. Go's chunked body and its request with neither a
/// length nor chunking are one case here: no `Content-Length` header.
#[tokio::test(start_paused = true)]
async fn upload_refuses_before_reading() {
    let (grid, _) = grid_at(EXAMPLE_ENTRY).await;
    for (length, status, code) in [
        (None, StatusCode::LENGTH_REQUIRED, CODE_LENGTH_REQUIRED),
        (
            Some(TEST_MAX_BODY + 1),
            StatusCode::PAYLOAD_TOO_LARGE,
            CODE_PAYLOAD_TOO_LARGE,
        ),
    ] {
        let response = upload(
            post(length, UnreadBody),
            &grid,
            &test_epoch(),
            &upload_options(),
        )
        .await;
        assert_eq!(header(&response, "connection"), "close", "{length:?}");
        envelope(response, status, code).await;
    }
}

/// Go: `TestUploadAbortsWhenTheClientGoesAway`: a client that goes away after 10 of the 100
/// declared bytes gets no response, only the [`Abort`] mark.
#[tokio::test(start_paused = true)]
async fn upload_aborts_when_the_client_goes_away() {
    let (response, _) = run(EXAMPLE_ENTRY, Some(100), &[data(1, 10), gone(2)]).await;
    assert_eq!(response.extensions().get::<Abort>(), Some(&Abort));
    assert!(body_bytes(response).await.is_empty());
}

/// Go: `TestUploadLyingContentLengthIsBounded`: declared within the cap, the body keeps coming
/// past it, and reading stops at the cap.
#[tokio::test(start_paused = true)]
async fn upload_lying_content_length_is_bounded() {
    let arrivals: Vec<Arrival> = (1..=40).map(|index| data(index, 64 << 10)).collect();
    let (response, reads) = run(EXAMPLE_ENTRY, Some(100), &arrivals).await;
    assert_eq!(header(&response, "connection"), "close");
    let most = usize::try_from(TEST_MAX_BODY / (64 << 10) + 1).expect("a count");
    assert!(
        reads <= most,
        "{reads} frames of 64 KiB, want reading to stop at the 1 MiB cap"
    );
    envelope(
        response,
        StatusCode::PAYLOAD_TOO_LARGE,
        CODE_PAYLOAD_TOO_LARGE,
    )
    .await;
}

/// Go: `TestUploadEmptyBody`
#[tokio::test(start_paused = true)]
async fn upload_empty_body() {
    let (response, _) = run(EXAMPLE_ENTRY, Some(0), &[]).await;
    let (body, _) = telemetry_of(response).await;
    assert_eq!(
        body,
        concat!(
            r#"{"epoch":"k3V9qW2rT0aY","bucketMs":100,"firstBucket":1234567,"buckets":[],"#,
            r#""bytes":0,"startMs":123456700,"durationMs":0}"#
        )
    );
}

/// Go: `TestUploadEpochStablePerProcess`
#[tokio::test(start_paused = true)]
async fn upload_epoch_stable_per_process() {
    let grid = Grid::new(TokioClock, 0);
    let mut seen = Vec::new();
    // Two instances, two uploads each.
    for epoch in [Epoch::new(), Epoch::new()] {
        let epoch = epoch.expect("an epoch");
        for _ in 0..2 {
            let response = upload(
                post(Some(2), Body::from("ab")),
                &grid,
                &epoch,
                &upload_options(),
            )
            .await;
            let (_, got) = telemetry_of(response).await;
            assert_eq!(got["epoch"], epoch.id.as_str());
            seen.push(epoch.id.clone());
        }
    }
    seen.dedup();
    assert_eq!(seen.len(), 2, "one epoch per instance: {seen:?}");
}
