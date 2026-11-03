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

//! The layer's CORS step (compatibility.md section 2.2).

use std::collections::HashSet;

use axum::extract::Request;
use http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    ORIGIN, VARY,
};
use http::{HeaderMap, HeaderValue, Method};

use super::Kind;
use crate::config::Origin;
use crate::handlers::{normalize_origin, query_value};

/// Decides each response's CORS headers. A request asks for CORS with the exact query value
/// `cors=true`, as LibreSpeed's multi-server mode sends; a preflight counts as asking, because
/// it cannot carry the query reliably. `/garbage` and `/empty` then answer any origin. `/getIP`
/// returns the caller's own address, so it answers only an Origin listed in
/// `server.cors.allowed_origins`, echoed with `Vary: Origin`, and sends nothing to any other.
/// The server list sends no CORS headers.
#[derive(Debug)]
pub(super) struct Cors {
    allowed: HashSet<String>,
}

impl Cors {
    pub(super) fn new(allowed_origins: &[Origin]) -> Self {
        Self {
            allowed: allowed_origins
                .iter()
                .filter_map(|origin| normalize_origin(origin.as_str()))
                .collect(),
        }
    }

    /// The CORS headers of the response to `request` on a route of `kind`, decided before the
    /// limit so that a 429 carries them too.
    pub(super) fn headers(&self, kind: Kind, request: &Request) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let asked = request.method() == Method::OPTIONS || cors_requested(request);
        let origin = match kind {
            Kind::Garbage | Kind::Empty if asked => HeaderValue::from_static("*"),
            Kind::GetIp if asked => match self.listed_origin(request) {
                Some(origin) => {
                    headers.insert(VARY, HeaderValue::from_static("Origin"));
                    origin
                }
                None => return headers,
            },
            Kind::Garbage | Kind::Empty | Kind::GetIp | Kind::WellKnown => return headers,
        };
        headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        headers.insert(
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST"),
        );
        headers.insert(
            ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Encoding, Content-Type"),
        );
        headers
    }

    /// The request's one Origin, as sent, when it is listed: the browser compares the echoed
    /// origin with its own byte for byte.
    fn listed_origin(&self, request: &Request) -> Option<HeaderValue> {
        let mut origins = request.headers().get_all(ORIGIN).iter();
        let (Some(origin), None) = (origins.next(), origins.next()) else {
            return None;
        };
        let normalized = normalize_origin(origin.to_str().ok()?)?;
        self.allowed.contains(&normalized).then(|| origin.clone())
    }
}

/// Whether the first `cors` parameter is exactly `true`.
fn cors_requested(request: &Request) -> bool {
    query_value(request.uri().query().unwrap_or_default(), b"cors")
        .is_some_and(|value| *value == *b"true")
}
