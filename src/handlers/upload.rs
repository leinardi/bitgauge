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

//! `POST /api/v1/upload` and its telemetry (wire-protocol.md sections 3.2 and 4).

use std::time::Duration;

use bytes::Bytes;
use http::{HeaderName, HeaderValue, Request, Response, StatusCode};
use serde::Serialize;
use tokio::time::Instant;

use super::drain::{DrainOptions, LifetimeExceeded, drain_body};
use super::envelope::{CODE_INTERNAL, error_response};
use super::epoch::{BUCKET_MS, Epoch, Grid};
use super::{Body, JSON_TYPE, UPLOAD_LIFETIME, set_type};

/// The most cells one upload can span: the 1200 cells of its lifetime, plus one when it starts
/// mid-cell.
const MAX_BUCKETS: u64 = UPLOAD_LIFETIME.as_secs() * (1000 / BUCKET_MS.unsigned_abs()) + 1;

const SERVER_TIMING: HeaderName = HeaderName::from_static("server-timing");

/// The upload response: exactly these seven keys.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Telemetry<'upload> {
    epoch: &'upload str,
    bucket_ms: i64,
    first_bucket: i64,
    buckets: &'upload [u64],
    bytes: u64,
    start_ms: i64,
    duration_ms: i64,
}

/// One body's frames, counted into the grid cells in which they arrived. It lives only for the
/// request.
struct Arrivals<'grid> {
    grid: &'grid Grid,
    deadline: Instant,
    first: Option<(Instant, i64)>,
    last: Instant,
    counts: Vec<u64>,
}

impl Arrivals<'_> {
    /// Counts a frame's bytes into the cell of the instant it arrived. A frame arriving at or
    /// after the deadline is refused, which also keeps the counts within [`MAX_BUCKETS`].
    fn record(&mut self, bytes: u64) -> Result<(), LifetimeExceeded> {
        let now = self.grid.now();
        if now >= self.deadline {
            return Err(LifetimeExceeded);
        }
        let cell = self.grid.cell(now);
        let (_, first_cell) = *self.first.get_or_insert((now, cell));
        self.last = now;
        let index = u64::try_from(cell - first_cell).unwrap_or(u64::MAX);
        if index >= MAX_BUCKETS {
            return Err(LifetimeExceeded);
        }
        let index = usize::try_from(index).unwrap_or(usize::MAX);
        if self.counts.len() <= index {
            self.counts.resize(index + 1, 0);
        }
        self.counts[index] += bytes;
        Ok(())
    }
}

fn whole_millis(duration: Duration) -> i64 {
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

/// Drains the whole body before responding, counting each frame into the grid cell in which it
/// arrived, and answers with the telemetry and `Server-Timing`. A missing `Content-Length` is
/// 411 and one above the cap is 413, both without reading. The body must arrive within the
/// lifetime of handler entry, enforced per frame and by the grid's clock; otherwise the answer
/// is 408 with no telemetry. `options.lifetime` is [`UPLOAD_LIFETIME`] outside tests.
pub async fn upload<B>(
    request: Request<B>,
    grid: &Grid,
    epoch: &Epoch,
    options: &DrainOptions,
) -> Response<Body>
where
    B: http_body::Body<Data = Bytes>,
{
    let entry = grid.now();
    let mut arrivals = Arrivals {
        grid,
        deadline: entry + options.lifetime,
        first: None,
        last: entry,
        counts: Vec::new(),
    };
    match drain_body(request, entry, options, |bytes| arrivals.record(bytes)).await {
        Ok(total) => telemetry(epoch, &arrivals, total, entry),
        Err(answer) => *answer,
    }
}

/// The answer to a drained body. An empty body has no first byte: its timeline point is the
/// handler's entry and its bucket list is empty.
fn telemetry(epoch: &Epoch, arrivals: &Arrivals<'_>, total: u64, entry: Instant) -> Response<Body> {
    let (start, duration_ms) = match arrivals.first {
        Some((first, _)) => (first, whole_millis(arrivals.last - first)),
        None => (entry, 0),
    };
    let body = super::json::to_vec(&Telemetry {
        epoch: &epoch.id,
        bucket_ms: BUCKET_MS,
        first_bucket: arrivals.grid.cell(start),
        buckets: &arrivals.counts,
        bytes: total,
        start_ms: arrivals.grid.ms(start),
        duration_ms,
    });
    let Ok(body) = body else {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            CODE_INTERNAL,
            "encode telemetry",
            None,
        );
    };
    let mut response = Response::new(Body::from(body));
    let headers = response.headers_mut();
    set_type(headers, JSON_TYPE);
    headers.insert(
        SERVER_TIMING,
        HeaderValue::from_str(&format!("bg-recv;dur={duration_ms}"))
            .unwrap_or_else(|_| HeaderValue::from_static("bg-recv;dur=0")),
    );
    response
}
