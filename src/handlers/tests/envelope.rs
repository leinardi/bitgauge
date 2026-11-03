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

//! The error envelope.

use http::StatusCode;
use http::header::{CONTENT_ENCODING, CONTENT_LENGTH};

use super::support::{body_bytes, envelope};
use crate::handlers::{
    CODE_BYTES_OUT_OF_RANGE, CODE_NOT_FOUND, CODE_TOO_MANY_STREAMS, Details, error_response,
};

/// Go: `TestWriteErrorShape`. Go also deleted a stale `Content-Length` and `Content-Encoding`
/// a handler had set; a Rust response is built fresh, so the check is that it has neither.
#[tokio::test]
async fn error_shape() {
    let mut details = Details::new();
    details.insert("max".to_owned(), 268_435_456_u64.into());
    let response = error_response(
        StatusCode::BAD_REQUEST,
        CODE_BYTES_OUT_OF_RANGE,
        "bytes must be between 1 and 268435456",
        Some(&details),
    );
    assert!(!response.headers().contains_key(CONTENT_LENGTH));
    assert!(!response.headers().contains_key(CONTENT_ENCODING));
    let body = body_bytes(response).await;
    // Exactly one top-level key, and the body keys of section 7 in its order.
    assert_eq!(
        body,
        r#"{"error":{"code":"bytes_out_of_range","message":"bytes must be between 1 and 268435456","details":{"max":268435456}}}"#
    );
    let decoded = envelope(
        error_response(
            StatusCode::BAD_REQUEST,
            CODE_BYTES_OUT_OF_RANGE,
            "bytes must be between 1 and 268435456",
            Some(&details),
        ),
        StatusCode::BAD_REQUEST,
        CODE_BYTES_OUT_OF_RANGE,
    )
    .await;
    assert_eq!(decoded["error"]["details"]["max"], 268_435_456);
}

/// Go: `TestWriteErrorOmitsEmptyDetails`, nil and empty alike.
#[tokio::test]
async fn error_omits_empty_details() {
    for details in [None, Some(&Details::new())] {
        let response = error_response(StatusCode::NOT_FOUND, CODE_NOT_FOUND, "not found", details);
        let decoded = envelope(response, StatusCode::NOT_FOUND, CODE_NOT_FOUND).await;
        assert!(decoded["error"].get("details").is_none(), "{decoded}");
    }
}

/// Go: `TestErrorWriterDelegates`: the limiter's codes go through the same writer.
#[tokio::test]
async fn limiter_codes_use_the_envelope() {
    let response = error_response(
        StatusCode::TOO_MANY_REQUESTS,
        CODE_TOO_MANY_STREAMS,
        "too many concurrent streams",
        None,
    );
    envelope(
        response,
        StatusCode::TOO_MANY_REQUESTS,
        CODE_TOO_MANY_STREAMS,
    )
    .await;
}
