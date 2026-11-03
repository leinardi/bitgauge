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

//! The handlers over HTTP/1.1 on loopback, through the real connection driver and on the real
//! clock: the wire framing, and the one test of the lifetime on real time.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::Request;
use axum::routing::{get, post};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::time::timeout;

use super::support::{Loopback, no_transfer, read_response, send};
use crate::clock::TokioClock;
use crate::handlers::{
    BUFFER_SIZE, DrainOptions, Epoch, Grid, RandomSource, UPLOAD_LIFETIME, download, upload,
};

/// A failsafe against a hang, far above what any test here waits for; not a wait for state.
const FAILSAFE: Duration = Duration::from_secs(30);

fn upload_router(lifetime: Duration) -> Router {
    let grid = Arc::new(Grid::new(TokioClock, 77));
    let epoch = Arc::new(Epoch::new().expect("an epoch"));
    let options = Arc::new(DrainOptions {
        transfer: no_transfer(),
        limit: 1 << 30,
        lifetime,
        require_length: true,
    });
    Router::new().route(
        "/",
        post(move |request: Request| async move { upload(request, &grid, &epoch, &options).await }),
    )
}

/// Go: `TestDownloadOverHTTP`: exactly N bytes, never compressed even when asked.
#[tokio::test]
async fn download_over_http() {
    let source = RandomSource::new().expect("a random source");
    let router = Router::new().route(
        "/",
        get(move |request: Request| async move {
            download(request.uri().query(), &source, 1 << 30, no_transfer())
        }),
    );
    let server = Loopback::start(router).await;
    let size = 3 * BUFFER_SIZE + 17;
    let mut stream = server.connect().await;
    send(
        &mut stream,
        format!("GET /?bytes={size} HTTP/1.1\r\nHost: test\r\nAccept-Encoding: gzip\r\n\r\n")
            .as_bytes(),
    )
    .await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("an answer in time");
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.header("content-length"),
        Some(size.to_string().as_str())
    );
    assert_eq!(response.body.len(), size);
    assert_eq!(response.header("content-encoding"), None);
}

/// Go: `TestUploadOverHTTP`
#[tokio::test]
async fn upload_over_http() {
    let server = Loopback::start(upload_router(UPLOAD_LIFETIME)).await;
    let size = (3 << 20) + 5;
    let mut stream = server.connect().await;
    send(
        &mut stream,
        format!("POST / HTTP/1.1\r\nHost: test\r\nContent-Length: {size}\r\n\r\n").as_bytes(),
    )
    .await;
    send(&mut stream, &vec![0; size]).await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("an answer in time");
    assert_eq!(response.status(), 200);
    let telemetry: serde_json::Value = serde_json::from_slice(&response.body).expect("JSON");
    assert_eq!(telemetry["bytes"], size);
    assert_eq!(
        response.header("server-timing"),
        Some(format!("bg-recv;dur={}", telemetry["durationMs"]).as_str())
    );
}

/// Go: `TestUploadStalledBodyIsCutByTheReadDeadline`, on real time with a short lifetime in
/// place of the 120 s one, whose value the paused-clock tests cover: a stalled body is answered
/// 408 without telemetry, and the connection is closed after it.
#[tokio::test]
async fn stalled_upload_is_cut_at_its_lifetime() {
    let server = Loopback::start(upload_router(Duration::from_millis(300))).await;
    let mut stream = server.connect().await;
    // Ten of the hundred declared bytes, then nothing.
    send(
        &mut stream,
        b"POST / HTTP/1.1\r\nHost: test\r\nContent-Length: 100\r\n\r\n0123456789",
    )
    .await;
    let response = timeout(FAILSAFE, read_response(&mut stream))
        .await
        .expect("an answer in time");
    assert_eq!(response.status(), 408);
    assert!(String::from_utf8_lossy(&response.body).contains(r#""code":"request_timeout""#));
    assert_eq!(response.header("server-timing"), None);
    assert_eq!(response.header("connection"), Some("close"));
    let mut rest = [0; 1];
    let read = timeout(FAILSAFE, stream.read(&mut rest))
        .await
        .expect("the connection closes in time");
    assert!(
        matches!(read, Ok(0) | Err(_)),
        "{read:?}: want the connection closed"
    );
}

/// Go: `TestUploadWithoutLengthOverHTTPIs411`
#[tokio::test]
async fn upload_without_length_over_http_is_411() {
    let server = Loopback::start(upload_router(UPLOAD_LIFETIME)).await;
    for (name, head, want) in [
        ("no length", "POST / HTTP/1.1\r\nHost: test\r\n\r\n", 411),
        (
            "chunked",
            "POST / HTTP/1.1\r\nHost: test\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nabcde\r\n0\r\n\r\n",
            411,
        ),
        (
            "declared 0",
            "POST / HTTP/1.1\r\nHost: test\r\nContent-Length: 0\r\n\r\n",
            200,
        ),
    ] {
        let mut stream = server.connect().await;
        send(&mut stream, head.as_bytes()).await;
        let response = timeout(FAILSAFE, read_response(&mut stream))
            .await
            .expect("an answer in time");
        assert_eq!(response.status(), want, "{name}");
    }
}

/// Go: `TestUploadAbortsWhenTheClientGoesAway`, over the wire: a client that half-closes inside
/// its declared body gets no status line, only the connection's end.
#[tokio::test]
async fn an_aborted_upload_writes_nothing() {
    let server = Loopback::start(upload_router(UPLOAD_LIFETIME)).await;
    let mut stream = server.connect().await;
    send(
        &mut stream,
        b"POST / HTTP/1.1\r\nHost: test\r\nContent-Length: 100\r\n\r\n0123456789",
    )
    .await;
    stream.shutdown().await.expect("a half-close");
    let mut answer = Vec::new();
    let read = timeout(FAILSAFE, stream.read_to_end(&mut answer))
        .await
        .expect("the connection's end in time");
    assert!(
        answer.is_empty(),
        "{read:?}: {:?}",
        String::from_utf8_lossy(&answer)
    );
}
