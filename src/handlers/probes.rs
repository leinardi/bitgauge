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

//! The latency and responsiveness probes (wire-protocol.md section 3.3).

use http::header::{CACHE_CONTROL, CONTENT_LENGTH};
use http::{HeaderValue, Response, StatusCode};

use super::{Body, NO_STORE, OCTET_STREAM, set_type};

/// The constant one-byte body of `GET /api/v1/small`.
const SMALL_BODY: &[u8] = b"0";

/// `GET` and `HEAD /api/v1/ping`: 204, no body and no-store, the HTTP fallback for idle and
/// loaded latency.
#[must_use]
pub fn ping() -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::NO_CONTENT;
    response.headers_mut().insert(CACHE_CONTROL, NO_STORE);
    response
}

/// `GET /api/v1/small`: a one-byte body, the HTTP responsiveness probe target and the path B
/// capability check.
#[must_use]
pub fn small() -> Response<Body> {
    let mut response = Response::new(Body::from(SMALL_BODY));
    let headers = response.headers_mut();
    set_type(headers, OCTET_STREAM);
    headers.insert(CONTENT_LENGTH, HeaderValue::from_static("1"));
    response
}
