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

//! The Apple networkQuality layer (compatibility.md section 3): the config and the three test
//! routes macOS's and iOS's networkQuality tool and compatible clients drive, under their own
//! `/nq/` prefix, mounted when `compat.networkquality.enabled` is set. It sends no CORS headers
//! and never redirects.

use std::future::ready;
use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::routing::any;
use http::header::{CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE};
use http::{HeaderValue, Method, Response, StatusCode};
use serde_json::json;

use super::Row;
use crate::config::Config;
use crate::handlers::{
    Body, CODE_INTERNAL, CODE_PUBLIC_URL_REQUIRED, DrainOptions, JSON_TYPE, Limit, NO_STORE,
    OCTET_STREAM, RandomSource, UPLOAD_LIFETIME, drain_body, empty_ok, error_response, limited,
    method_not_allowed, request_origin, small, to_json,
};
use crate::metrics::Transfer;

/// The config JSON.
pub const CONFIG_PATH: &str = "/nq/config";
/// The config JSON at its well-known path.
pub const WELL_KNOWN_PATH: &str = "/.well-known/nq";
/// The native one-byte object.
pub const SMALL_PATH: &str = "/nq/small";
/// The download flow.
pub const LARGE_PATH: &str = "/nq/large";
/// The upload flow.
pub const UPLOAD_PATH: &str = "/nq/upload";
/// The declared size of every `GET /nq/large` body: 8 GiB, which clients close early.
/// `limits.max_download_bytes` does not bound it.
pub const LARGE_BYTES: u64 = 8 << 30;
/// The `version` of the config JSON.
const CONFIG_VERSION: u32 = 1;

const GET: &[Method] = &[Method::GET];
const POST: &[Method] = &[Method::POST];

/// The layer's route-table rows (compatibility.md section 5): no `HEAD` and no `OPTIONS`.
pub const ROWS: [Row; 5] = [
    Row {
        path: CONFIG_PATH,
        methods: GET,
        allow: "GET",
    },
    Row {
        path: WELL_KNOWN_PATH,
        methods: GET,
        allow: "GET",
    },
    Row {
        path: SMALL_PATH,
        methods: GET,
        allow: "GET",
    },
    Row {
        path: LARGE_PATH,
        methods: GET,
        allow: "GET",
    },
    Row {
        path: UPLOAD_PATH,
        methods: POST,
        allow: "POST",
    },
];

/// What the layer is built from, created once at startup.
#[derive(Debug, Clone)]
pub struct Deps {
    /// The shared random buffer `/nq/large` is cut from.
    pub source: RandomSource,
    /// The per-client flow limit of `/nq/large` and `/nq/upload`,
    /// `compat.networkquality.max_flows_per_client`; `None` leaves them unlimited.
    pub flow_limit: Option<Limit>,
    /// Counts the downloads under the layer's metrics group.
    pub download: Transfer,
    /// Counts the uploads under the layer's metrics group.
    pub upload: Transfer,
}

/// The layer, built: what the configuration decides, resolved once.
#[derive(Debug)]
struct Layer {
    deps: Deps,
    public_url: String,
    base_path: String,
    max_upload_bytes: u64,
}

/// The layer's router for `config`, to be mounted under `server.base_path`. A method a row
/// does not list, `OPTIONS` included, answers the envelope 405 with the row's Allow value.
pub fn routes(config: &Config, deps: Deps) -> Router {
    let layer = Arc::new(Layer {
        deps,
        public_url: config.server.public_url.as_str().to_owned(),
        base_path: config.server.base_path.clone(),
        max_upload_bytes: config.compat.networkquality.max_upload_bytes.bytes(),
    });
    let mut router = Router::new();
    for row in &ROWS {
        let layer = Arc::clone(&layer);
        router = router.route(
            row.path,
            any(move |request: Request| async move { layer.serve(row, request).await }),
        );
    }
    router
}

impl Layer {
    async fn serve(&self, row: &Row, request: Request) -> Response<Body> {
        if !row.methods.contains(request.method()) {
            return method_not_allowed(row.allow);
        }
        let limit = self.deps.flow_limit.as_ref();
        match row.path {
            CONFIG_PATH | WELL_KNOWN_PATH => self.config(&request),
            SMALL_PATH => small(),
            LARGE_PATH => limited(limit, request, |_| ready(self.large())).await,
            _ => limited(limit, request, |request| self.upload(request)).await,
        }
    }

    /// The config JSON of section 3.2: both key sets, Apple's and the IETF responsiveness
    /// draft's, pointing at the same absolute https URLs, the request origin, the base path and
    /// the route. Without an https origin it answers 503 `public_url_required` instead, naming
    /// `server.public_url` (section 3.3).
    fn config(&self, request: &Request) -> Response<Body> {
        let origin = request_origin(request, &self.public_url, &self.base_path);
        if !origin.secure {
            return error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                CODE_PUBLIC_URL_REQUIRED,
                "networkQuality needs https URLs: set server.public_url to the https URL clients \
                 use, or serve BitGauge behind a trusted proxy that forwards X-Forwarded-Proto: \
                 https",
                None,
            );
        }
        let small = format!("{}{SMALL_PATH}", origin.url);
        let large = format!("{}{LARGE_PATH}", origin.url);
        let upload = format!("{}{UPLOAD_PATH}", origin.url);
        // The keys are the clients' own; a JSON map writes them sorted, as Go writes a map's.
        let config = json!({
            "version": CONFIG_VERSION,
            "urls": {
                "small_https_download_url": small,
                "large_https_download_url": large,
                "https_upload_url": upload,
                "small_download_url": small,
                "large_download_url": large,
                "upload_url": upload,
            },
        });
        let Ok(body) = to_json(&config) else {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                CODE_INTERNAL,
                "encode the config",
                None,
            );
        };
        let length = body.len();
        let mut response = Response::new(Body::from(body));
        let headers = response.headers_mut();
        headers.insert(CACHE_CONTROL, NO_STORE);
        headers.insert(CONTENT_TYPE, JSON_TYPE);
        headers.insert(CONTENT_LENGTH, HeaderValue::from(length));
        response
    }

    /// [`LARGE_BYTES`] random bytes with `Content-Length`, no-store and no `Content-Encoding`,
    /// sent until the client closes the flow, which is how it ends.
    fn large(&self) -> Response<Body> {
        let mut response = Response::new(Body::new(
            self.deps
                .source
                .body(LARGE_BYTES, self.deps.download.clone()),
        ));
        let headers = response.headers_mut();
        headers.insert(CACHE_CONTROL, NO_STORE);
        headers.insert(CONTENT_TYPE, OCTET_STREAM);
        headers.insert(CONTENT_LENGTH, HeaderValue::from(LARGE_BYTES));
        response
    }

    /// Drains the body up to `compat.networkquality.max_upload_bytes`, declared or not, within
    /// the native upload's lifetime from handler entry, then answers 200 empty; the drainer
    /// answers the rest.
    async fn upload(&self, request: Request) -> Response<Body> {
        let options = DrainOptions {
            transfer: self.deps.upload.clone(),
            limit: self.max_upload_bytes,
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
