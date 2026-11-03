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

//! The OpenSpeedTest layer (compatibility.md section 1): the two routes a self-hosted copy of
//! the OpenSpeedTest web UI drives, mounted when `compat.openspeedtest.enabled` is set.

use std::future::ready;
use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::routing::any;
use http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE,
};
use http::{HeaderValue, Method, Response};

use super::Row;
use crate::handlers::{
    Body, DrainOptions, Limit, NO_STORE, OCTET_STREAM, RandomSource, UPLOAD_LIFETIME, drain_body,
    empty_ok, limited, method_not_allowed,
};
use crate::metrics::Transfer;

/// Sends the fixed-size random body.
pub const DOWNLOAD_PATH: &str = "/downloading";
/// The ping on `GET` and `HEAD`, and the upload on `POST`.
pub const UPLOAD_PATH: &str = "/upload";
/// The fixed size of every `GET /downloading` body: 30 MiB.
pub const DOWNLOAD_BYTES: u64 = 30 << 20;
/// The fixed cap of a `POST /upload` body: 35 MiB. `limits.max_upload_bytes` does not change
/// it; it only gates startup.
pub const UPLOAD_CAP: u64 = 35 << 20;

/// The layer's route-table rows (compatibility.md section 5).
pub const ROWS: [Row; 2] = [
    Row {
        path: DOWNLOAD_PATH,
        methods: &[Method::GET, Method::HEAD, Method::OPTIONS],
        allow: "GET, HEAD, OPTIONS",
    },
    Row {
        path: UPLOAD_PATH,
        methods: &[Method::GET, Method::HEAD, Method::POST, Method::OPTIONS],
        allow: "GET, HEAD, POST, OPTIONS",
    },
];

/// What the layer is built from, created once at startup.
#[derive(Debug, Clone)]
pub struct Deps {
    /// The shared random buffer the download is cut from.
    pub source: RandomSource,
    /// The per-client stream and request-rate limit of every route but the preflight; `None`
    /// leaves them unlimited.
    pub limit: Option<Limit>,
    /// Counts the downloads under the layer's metrics group.
    pub download: Transfer,
    /// Counts the uploads under the layer's metrics group.
    pub upload: Transfer,
}

/// The layer's router, to be mounted under `server.base_path`. Every response carries the CORS
/// headers, set around the limit so a 429 is readable cross-origin too (section 1.2); `OPTIONS`
/// answers 200 and is never limited.
pub fn routes(deps: Deps) -> Router {
    let deps = Arc::new(deps);
    let download = Arc::clone(&deps);
    Router::new()
        .route(
            DOWNLOAD_PATH,
            any(move |request: Request| async move { with_cors(download.download(request).await) }),
        )
        .route(
            UPLOAD_PATH,
            any(move |request: Request| async move { with_cors(deps.upload(request).await) }),
        )
}

impl Deps {
    async fn download(&self, request: Request) -> Response<Body> {
        let [row, _] = &ROWS;
        match *request.method() {
            Method::GET | Method::HEAD => {
                limited(self.limit.as_ref(), request, |request| {
                    ready(self.download_body(request.method() == Method::HEAD))
                })
                .await
            }
            Method::OPTIONS => empty_ok(),
            _ => method_not_allowed(row.allow),
        }
    }

    /// Exactly [`DOWNLOAD_BYTES`] random bytes with `Content-Length`, no-store and no
    /// `Content-Encoding`; a `HEAD` gets the headers only and counts no transfer. The `n`
    /// cache-buster is ignored.
    fn download_body(&self, head: bool) -> Response<Body> {
        let body = if head {
            Body::empty()
        } else {
            Body::new(self.source.body(DOWNLOAD_BYTES, self.download.clone()))
        };
        let mut response = Response::new(body);
        let headers = response.headers_mut();
        headers.insert(CACHE_CONTROL, NO_STORE);
        headers.insert(CONTENT_TYPE, OCTET_STREAM);
        headers.insert(CONTENT_LENGTH, HeaderValue::from(DOWNLOAD_BYTES));
        response
    }

    async fn upload(&self, request: Request) -> Response<Body> {
        let [_, row] = &ROWS;
        match *request.method() {
            // OpenSpeedTest's ping: its client accepts only 200, never 204.
            Method::GET | Method::HEAD => {
                limited(self.limit.as_ref(), request, |_| ready(empty_ok())).await
            }
            Method::POST => {
                limited(self.limit.as_ref(), request, |request| self.drain(request)).await
            }
            Method::OPTIONS => empty_ok(),
            _ => method_not_allowed(row.allow),
        }
    }

    /// Drains the body up to [`UPLOAD_CAP`], declared or not, within the native upload's
    /// lifetime from handler entry, then answers 200 empty; the drainer answers the rest.
    async fn drain(&self, request: Request) -> Response<Body> {
        let options = DrainOptions {
            transfer: self.upload.clone(),
            limit: UPLOAD_CAP,
            lifetime: UPLOAD_LIFETIME,
            require_length: false,
        };
        let entry = tokio::time::Instant::now();
        match drain_body(request, entry, &options, |_| Ok(())).await {
            Ok(_) => empty_ok(),
            Err(answer) => *answer,
        }
    }
}

/// The CORS values of every response on the layer's routes (compatibility.md section 1.2): the
/// OpenSpeedTest UI is usually served from another origin than the server it tests.
fn with_cors(mut response: Response<Body>) -> Response<Body> {
    let headers = response.headers_mut();
    headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    headers.insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, OPTIONS"),
    );
    headers.insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Content-Type"),
    );
    response
}
