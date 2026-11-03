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

//! The error envelope of wire-protocol.md section 7.

use http::{Response, StatusCode};
use serde::Serialize;

use super::{Body, JSON_TYPE, set_type};
use crate::ratelimit;

/// A malformed request.
pub const CODE_BAD_REQUEST: &str = "bad_request";
/// A download size outside 1 to the cap.
pub const CODE_BYTES_OUT_OF_RANGE: &str = "bytes_out_of_range";
/// An unknown path.
pub const CODE_NOT_FOUND: &str = "not_found";
/// A method the path does not take.
pub const CODE_METHOD_NOT_ALLOWED: &str = "method_not_allowed";
/// An upload body that did not arrive within its lifetime.
pub const CODE_REQUEST_TIMEOUT: &str = "request_timeout";
/// An upload without `Content-Length`.
pub const CODE_LENGTH_REQUIRED: &str = "length_required";
/// A body over its route's cap.
pub const CODE_PAYLOAD_TOO_LARGE: &str = "payload_too_large";
/// The limiter's codes, repeated here so that every code has one home; the limiter owns the
/// decision between them.
pub const CODE_RATE_LIMITED: &str = ratelimit::CODE_RATE_LIMITED;
/// See [`CODE_RATE_LIMITED`].
pub const CODE_TOO_MANY_STREAMS: &str = ratelimit::CODE_TOO_MANY_STREAMS;
/// See [`CODE_RATE_LIMITED`].
pub const CODE_TABLE_FULL: &str = ratelimit::CODE_TABLE_FULL;
/// A failure of ours.
pub const CODE_INTERNAL: &str = "internal";
/// A networkQuality config that cannot build an https origin (compatibility.md section 3.3);
/// never on `/api/v1`.
pub const CODE_PUBLIC_URL_REQUIRED: &str = "public_url_required";

/// The envelope written when an envelope cannot be encoded, so that even that failure answers
/// in the documented shape.
const INTERNAL_BODY: &str = r#"{"error":{"code":"internal","message":"internal server error"}}"#;

/// Optional machine-readable context of an error, such as the limit of `bytes_out_of_range`;
/// its keys are written sorted, as Go writes a map's.
pub type Details = serde_json::Map<String, serde_json::Value>;

#[derive(Serialize)]
struct Envelope<'error> {
    error: EnvelopeBody<'error>,
}

#[derive(Serialize)]
struct EnvelopeBody<'error> {
    code: &'error str,
    message: &'error str,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<&'error Details>,
}

/// The one writer of the error envelope. `message` is English, for logs and debugging; the SPA
/// switches on `code`. Empty details are left out. Callers never pass request bodies or
/// headers into `message` or `details`.
#[must_use]
pub fn error_response(
    status: StatusCode,
    code: &str,
    message: &str,
    details: Option<&Details>,
) -> Response<Body> {
    let envelope = Envelope {
        error: EnvelopeBody {
            code,
            message,
            details: details.filter(|details| !details.is_empty()),
        },
    };
    let (status, body) = match super::json::to_vec(&envelope) {
        Ok(body) => (status, Body::from(body)),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Body::from(INTERNAL_BODY)),
    };
    let mut response = Response::new(body);
    *response.status_mut() = status;
    set_type(response.headers_mut(), JSON_TYPE);
    response
}
