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

//! The native API under `/api/v1` (wire-protocol.md): the error envelope, the shared random
//! buffer, the epoch and the server grid, the drainer, and the download, upload, ping, small
//! and info handlers. Each handler is a plain function from a request to a response; the
//! router (phase 12) mounts them, with the method tables, 404, 405 and the limiter.

use std::time::Duration;

pub use axum::body::Body;
use http::header::{CACHE_CONTROL, CONTENT_TYPE};
use http::{HeaderMap, HeaderValue};

mod download;
mod drain;
mod envelope;
mod epoch;
mod info;
mod json;
mod limit;
mod origin;
mod probes;
mod query;
mod random;
mod routes;
mod upload;
mod ws;

pub use download::download;
pub use drain::{Abort, DrainOptions, LifetimeExceeded, drain_body};
pub use envelope::{
    CODE_BAD_REQUEST, CODE_BYTES_OUT_OF_RANGE, CODE_INTERNAL, CODE_LENGTH_REQUIRED,
    CODE_METHOD_NOT_ALLOWED, CODE_NOT_FOUND, CODE_PAYLOAD_TOO_LARGE, CODE_PUBLIC_URL_REQUIRED,
    CODE_RATE_LIMITED, CODE_REQUEST_TIMEOUT, CODE_TABLE_FULL, CODE_TOO_MANY_STREAMS, Details,
    error_response, method_not_allowed, refuse,
};
pub use epoch::{BUCKET_MS, Epoch, Grid};
pub use info::Info;
pub use json::to_vec as to_json;
pub use limit::{Limit, limited};
pub use origin::{RequestOrigin, normalize_origin, request_host, request_origin, valid_host};
pub use probes::{empty_ok, ping, small};
pub use query::query_value;
pub use random::{BUFFER_SIZE, MAX_FRAME, RandomBody, RandomError, RandomSource};
pub use routes::{NATIVE_ROUTES, Native, NativeRoute, native_routes};
pub use upload::upload;
pub use ws::{IDLE as WEBSOCKET_IDLE, READ_LIMIT as WEBSOCKET_READ_LIMIT, WebSockets};

/// The path the native API is mounted at, under `server.base_path`.
pub const PREFIX: &str = "/api/v1";

/// The longest an upload body is read (wire-protocol.md section 3.2).
pub const UPLOAD_LIFETIME: Duration = Duration::from_secs(120);

/// The `Cache-Control` value of every API and compatibility response.
pub const NO_STORE: HeaderValue = HeaderValue::from_static("no-store");
/// The `Content-Type` of a JSON body.
pub const JSON_TYPE: HeaderValue = HeaderValue::from_static("application/json");
/// The `Content-Type` of a random-data body.
pub const OCTET_STREAM: HeaderValue = HeaderValue::from_static("application/octet-stream");

/// Sets `Cache-Control: no-store` and the content type.
fn set_type(headers: &mut HeaderMap, content_type: HeaderValue) {
    headers.insert(CACHE_CONTROL, NO_STORE);
    headers.insert(CONTENT_TYPE, content_type);
}

#[cfg(test)]
pub(crate) mod tests;
