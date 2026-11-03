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

//! `GET /api/v1/download`.

use http::StatusCode;

use super::support::{body_bytes, envelope, header, no_transfer};
use crate::handlers::{CODE_BAD_REQUEST, CODE_BYTES_OUT_OF_RANGE, RandomSource, download};

const TEST_MAX_BYTES: u64 = 5000;

fn source() -> RandomSource {
    RandomSource::with_size(1000).expect("a random source")
}

/// Go: `TestDownloadWritesExactlyN`
#[tokio::test]
async fn download_writes_exactly_n() {
    let source = source();
    for (query, size) in [
        ("bytes=1", 1),
        ("bytes=2500", 2500),
        ("bytes=5000", 5000),
        ("bytes=0007", 7),
        ("other=1&bytes=12", 12),
        ("bytes=9&bytes=abc", 9),
        // Percent-decoded like url.ParseQuery; malformed pairs are skipped.
        ("bytes=%35", 5),
        ("byt%65s=8", 8),
        ("bytes=%zz&bytes=3", 3),
        ("bytes=1;x&bytes=4", 4),
    ] {
        let response = download(Some(query), &source, TEST_MAX_BYTES, no_transfer());
        assert_eq!(response.status(), StatusCode::OK, "{query}");
        assert_eq!(
            header(&response, "content-length"),
            size.to_string(),
            "{query}"
        );
        assert_eq!(header(&response, "cache-control"), "no-store", "{query}");
        assert_eq!(
            header(&response, "content-type"),
            "application/octet-stream"
        );
        assert!(
            !response.headers().contains_key("content-encoding"),
            "{query}"
        );
        assert_eq!(body_bytes(response).await.len(), size, "{query}");
    }
}

/// Go: `TestDownloadBadRequests`
#[tokio::test]
async fn download_bad_requests() {
    let source = source();
    for query in [
        None,
        Some(""),
        Some("other=5"),
        Some("bytes"),
        Some("bytes="),
        Some("bytes=abc"),
        Some("bytes=1.5"),
        Some("bytes=+5"),
        Some("bytes=0x10"),
        Some("bytes=1e3"),
        Some("bytes=-"),
        Some("bytes=%205"),
        Some("bytes=%2B5"),
        Some("bytes=%zz"),
        Some("bytes=4;x"),
    ] {
        let response = download(query, &source, TEST_MAX_BYTES, no_transfer());
        let decoded = envelope(response, StatusCode::BAD_REQUEST, CODE_BAD_REQUEST).await;
        assert!(decoded["error"].get("details").is_none(), "{query:?}");
    }
}

/// Go: `TestDownloadOutOfRange`
#[tokio::test]
async fn download_out_of_range() {
    let source = source();
    for query in [
        "bytes=0",
        "bytes=-0",
        "bytes=-5",
        "bytes=5001",
        "bytes=99999999999999999999999999999999",
    ] {
        let response = download(Some(query), &source, TEST_MAX_BYTES, no_transfer());
        let decoded = envelope(response, StatusCode::BAD_REQUEST, CODE_BYTES_OUT_OF_RANGE).await;
        assert_eq!(
            decoded["error"]["details"]["max"], TEST_MAX_BYTES,
            "{query}"
        );
        assert_eq!(
            decoded["error"]["message"], "bytes must be between 1 and 5000",
            "{query}"
        );
    }
}
