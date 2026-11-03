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

//! The native API's router (wire-protocol.md section 2) and its CORS step (section 8).

use std::collections::HashSet;
use std::future::ready;
use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::routing::any;
use http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    ACCESS_CONTROL_EXPOSE_HEADERS, ORIGIN, VARY,
};
use http::{HeaderName, HeaderValue, Method, Response, StatusCode};

use super::{
    Body, CODE_NOT_FOUND, DrainOptions, Epoch, Grid, Info, Limit, PREFIX, RandomSource, WebSockets,
    download, error_response, limited, method_not_allowed, normalize_origin, ping, small, upload,
};
use crate::config::Origin;
use crate::metrics::Transfer;

/// A native route: its path below [`PREFIX`], its methods, and its Allow value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeRoute {
    /// The path below [`PREFIX`].
    pub path: &'static str,
    /// The methods, in Allow order.
    pub methods: &'static [Method],
    /// The Allow value of the route's 405.
    pub allow: &'static str,
}

const fn route(path: &'static str, methods: &'static [Method], allow: &'static str) -> NativeRoute {
    NativeRoute {
        path,
        methods,
        allow,
    }
}

/// The native API's routes.
pub const NATIVE_ROUTES: [NativeRoute; 6] = [
    route("/download", &[Method::GET], "GET"),
    route("/upload", &[Method::POST], "POST"),
    route("/ping", &[Method::GET, Method::HEAD], "GET, HEAD"),
    route("/small", &[Method::GET], "GET"),
    route("/ws", &[Method::GET], "GET"),
    route("/info", &[Method::GET], "GET"),
];

/// What the native API is built from, created once at startup (backend.md section 5).
#[derive(Debug)]
pub struct Native {
    /// The shared random buffer.
    pub source: RandomSource,
    /// The server grid, shifted by the epoch's offset.
    pub grid: Grid,
    /// The process epoch.
    pub epoch: Epoch,
    /// The WebSocket echo.
    pub websockets: WebSockets,
    /// `GET /api/v1/info`, resolved at startup.
    pub info: Arc<Info>,
    /// `limits.max_download_bytes`.
    pub max_download_bytes: u64,
    /// The upload's drain: `limits.max_upload_bytes`, the lifetime and its transfer.
    pub upload: DrainOptions,
    /// Counts the downloads.
    pub download: Transfer,
    /// The stream and request-rate limit of download and upload; `None` leaves them unlimited.
    pub limit: Option<Limit>,
}

/// The native API's routes under `base` (empty at the root): any other method on a known path
/// answers the envelope 405 with Allow, and any unknown path under [`PREFIX`] the envelope 404.
/// Every answer goes through the CORS step for `allowed_origins`.
pub fn native_routes(native: Native, allowed_origins: &[Origin], base: &str) -> Router {
    let native = Arc::new(native);
    let cors = Arc::new(Cors::new(allowed_origins));
    let mut router = Router::new();
    for row in NATIVE_ROUTES {
        let native = Arc::clone(&native);
        let cors = Arc::clone(&cors);
        router = router.route(
            &format!("{base}{PREFIX}{}", row.path),
            any(move |request: Request| async move {
                let native = Arc::clone(&native);
                cors.apply(request, |request| async move {
                    if row.methods.contains(request.method()) {
                        native.serve(row.path, request).await
                    } else {
                        method_not_allowed(row.allow)
                    }
                })
                .await
            }),
        );
    }
    let not_found = any(move |request: Request| {
        let cors = Arc::clone(&cors);
        async move {
            cors.apply(request, |_| {
                ready(error_response(
                    StatusCode::NOT_FOUND,
                    CODE_NOT_FOUND,
                    "not found",
                    None,
                ))
            })
            .await
        }
    });
    // axum's catch-all needs a tail, so the bare prefix and the prefix with its slash are
    // routes of their own.
    router
        .route(&format!("{base}{PREFIX}"), not_found.clone())
        .route(&format!("{base}{PREFIX}/"), not_found.clone())
        .route(&format!("{base}{PREFIX}/{{*rest}}"), not_found)
}

impl Native {
    async fn serve(&self, path: &str, request: Request) -> Response<Body> {
        let limit = self.limit.as_ref();
        match path {
            "/download" => {
                limited(limit, request, |request| {
                    ready(download(
                        request.uri().query(),
                        &self.source,
                        self.max_download_bytes,
                        self.download.clone(),
                    ))
                })
                .await
            }
            "/upload" => {
                limited(limit, request, |request| {
                    upload(request, &self.grid, &self.epoch, &self.upload)
                })
                .await
            }
            "/ping" => ping(),
            "/small" => small(),
            "/ws" => self.websockets.respond(request),
            _ => self.info.respond(&request),
        }
    }
}

const TIMING_ALLOW_ORIGIN: HeaderName = HeaderName::from_static("timing-allow-origin");

/// The CORS step of the native group. By default the API is same-origin and sends no CORS
/// headers. A request whose one Origin is in `server.cors.allowed_origins` gets the full set,
/// `Timing-Allow-Origin` included, so that the browser keeps the Resource Timing fields the
/// engine reads; its `OPTIONS` preflight is answered 204 here and never reaches the limiter.
/// Every later answer, a 429 included, carries the headers.
#[derive(Debug)]
struct Cors {
    allowed: HashSet<String>,
}

impl Cors {
    fn new(allowed_origins: &[Origin]) -> Self {
        Self {
            allowed: allowed_origins
                .iter()
                .filter_map(|origin| normalize_origin(origin.as_str()))
                .collect(),
        }
    }

    async fn apply<F, R>(&self, request: Request, next: F) -> Response<Body>
    where
        F: FnOnce(Request) -> R,
        R: Future<Output = Response<Body>>,
    {
        let Some(origin) = self.listed_origin(&request) else {
            return next(request).await;
        };
        let mut response = if request.method() == Method::OPTIONS {
            let mut preflight = Response::new(Body::empty());
            *preflight.status_mut() = StatusCode::NO_CONTENT;
            preflight
        } else {
            next(request).await
        };
        let headers = response.headers_mut();
        headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
        headers.insert(VARY, HeaderValue::from_static("Origin"));
        headers.insert(
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        headers.insert(
            ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type"),
        );
        headers.insert(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static("Server-Timing"),
        );
        headers.insert(TIMING_ALLOW_ORIGIN, origin);
        response
    }

    /// The request's one Origin, as sent, when it is listed: the browser compares the echoed
    /// origin with its own byte for byte.
    fn listed_origin(&self, request: &Request) -> Option<HeaderValue> {
        if self.allowed.is_empty() {
            return None;
        }
        let mut origins = request.headers().get_all(ORIGIN).iter();
        let (Some(origin), None) = (origins.next(), origins.next()) else {
            return None;
        };
        let normalized = normalize_origin(origin.to_str().ok()?)?;
        self.allowed.contains(&normalized).then(|| origin.clone())
    }
}
