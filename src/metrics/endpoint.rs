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

//! The metrics endpoint (backend.md section 7): `GET` only, always OpenMetrics text, never
//! compressed, with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

use std::fmt;

use bytes::Bytes;
use http::header::{
    ALLOW, CACHE_CONTROL, CONTENT_TYPE as CONTENT_TYPE_HEADER, X_CONTENT_TYPE_OPTIONS,
};
use http::{HeaderValue, Method, Response, StatusCode};
use http_body_util::Full;
use prometheus_client::encoding::text;

use super::Metrics;

/// The one format the endpoint writes, whatever `Accept` asks for.
pub const CONTENT_TYPE: &str = "application/openmetrics-text; version=1.0.0; charset=utf-8";
const PLAIN_TEXT: &str = "text/plain; charset=utf-8";
const METHOD_NOT_ALLOWED: &str = "Method Not Allowed\n";

impl Metrics {
    /// The registry as OpenMetrics text, ending in `# EOF`.
    ///
    /// # Errors
    ///
    /// A collector that fails to encode.
    pub fn encode(&self) -> Result<String, fmt::Error> {
        let mut exposition = String::new();
        text::encode(&mut exposition, &self.registry)?;
        Ok(exposition)
    }

    /// The endpoint's answer to a request with `method`: the metrics for `GET`, and a plain
    /// `405` with `Allow: GET` for any other method. A failure to encode answers a plain `500`
    /// and is logged at warn, naming the error and nothing about the scraper.
    #[must_use]
    pub fn respond(&self, method: &Method) -> Response<Full<Bytes>> {
        if method != Method::GET {
            let mut response = plain(StatusCode::METHOD_NOT_ALLOWED, METHOD_NOT_ALLOWED.into());
            response
                .headers_mut()
                .insert(ALLOW, HeaderValue::from_static("GET"));
            return response;
        }
        match self.encode() {
            Ok(exposition) => respond(StatusCode::OK, CONTENT_TYPE, exposition),
            Err(error) => {
                tracing::warn!(error = %error, "metrics endpoint");
                plain(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("An error has occurred while serving metrics:\n\n{error}\n"),
                )
            }
        }
    }
}

fn plain(status: StatusCode, body: String) -> Response<Full<Bytes>> {
    respond(status, PLAIN_TEXT, body)
}

fn respond(status: StatusCode, content_type: &'static str, body: String) -> Response<Full<Bytes>> {
    let mut response = Response::new(Full::new(Bytes::from(body)));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE_HEADER, HeaderValue::from_static(content_type));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}
