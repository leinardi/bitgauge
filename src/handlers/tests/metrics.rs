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

//! The handlers' transfer series.

use std::time::Duration;

use http::{Request, StatusCode};
use tokio::time::Instant;

use super::support::{ScriptedBody, api_transfer, body_bytes, data, gone, meter, sample};
use crate::clock::TokioClock;
use crate::handlers::{Abort, Body, DrainOptions, Epoch, Grid, RandomSource, download, upload};
use crate::metrics::Direction;

const DOWNLOAD_SERIES: &str = r#"{direction="download",group="api"}"#;
const UPLOAD_SERIES: &str = r#"{direction="upload",group="api"}"#;

fn expect_samples(meter: &crate::metrics::Metrics, want: &[(&str, &str)]) {
    for &(series, value) in want {
        assert_eq!(sample(meter, series), value, "{series}");
    }
}

/// Go: `TestDownloadCountsItsTransfer`. Go's failed write is a body dropped before its first
/// frame: hyper drops the body of a connection that went away.
#[tokio::test]
async fn download_counts_its_transfer() {
    let meter = meter();
    let source = RandomSource::with_size(1000).expect("a random source");
    let transfer = api_transfer(&meter, Direction::Download);
    let response = download(Some("bytes=100000"), &source, 1 << 30, transfer.clone());
    assert_eq!(body_bytes(response).await.len(), 100_000);
    drop(download(Some("bytes=100000"), &source, 1 << 30, transfer));
    expect_samples(
        &meter,
        &[
            (
                &format!("bitgauge_transfer_bytes_total{DOWNLOAD_SERIES}"),
                "100000",
            ),
            (&format!("bitgauge_active_transfers{DOWNLOAD_SERIES}"), "0"),
            (&format!("bitgauge_http_aborts_total{DOWNLOAD_SERIES}"), "1"),
        ],
    );
}

fn post<B>(length: u64, body: B) -> Request<B> {
    Request::post("/api/v1/upload")
        .header("content-length", length)
        .body(body)
        .expect("a request")
}

/// Go: `TestUploadCountsItsTransfer`
#[tokio::test(start_paused = true)]
async fn upload_counts_its_transfer() {
    let meter = meter();
    let grid = Grid::new(TokioClock, 0);
    let epoch = Epoch::new().expect("an epoch");
    let options = |lifetime: Duration| DrainOptions {
        transfer: api_transfer(&meter, Direction::Upload),
        limit: 1 << 20,
        lifetime,
        require_length: true,
    };
    let lifetime = crate::handlers::UPLOAD_LIFETIME;

    let drained = upload(
        post(6, Body::from("abcdef")),
        &grid,
        &epoch,
        &options(lifetime),
    )
    .await;
    assert_eq!(drained.status(), StatusCode::OK);

    // A lifetime that has already ended cuts the body at its first frame: a timeout.
    let timed_out = upload(
        post(3, Body::from("abc")),
        &grid,
        &epoch,
        &options(Duration::ZERO),
    )
    .await;
    assert_eq!(timed_out.status(), StatusCode::REQUEST_TIMEOUT);

    let body = ScriptedBody::new(Instant::now(), &[data(1, 3), gone(2)]);
    let aborted = upload(post(10, body), &grid, &epoch, &options(lifetime)).await;
    assert_eq!(aborted.extensions().get::<Abort>(), Some(&Abort));

    expect_samples(
        &meter,
        &[
            // Every byte read is counted, the timed-out and the aborted bodies' included.
            (
                &format!("bitgauge_transfer_bytes_total{UPLOAD_SERIES}"),
                "12",
            ),
            (&format!("bitgauge_active_transfers{UPLOAD_SERIES}"), "0"),
            (&format!("bitgauge_http_aborts_total{UPLOAD_SERIES}"), "1"),
            (r#"bitgauge_upload_timeouts_total{group="api"}"#, "1"),
            (&format!("bitgauge_http_aborts_total{DOWNLOAD_SERIES}"), "0"),
            (
                &format!("bitgauge_transfer_bytes_total{DOWNLOAD_SERIES}"),
                "0",
            ),
        ],
    );
}
