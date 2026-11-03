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

//! The LibreSpeed layer (compatibility.md section 2): the routes LibreSpeed's web UI,
//! librespeed-cli and self-built Android apps drive, in the four spellings LibreSpeed's Go
//! server answers, mounted when `compat.librespeed.enabled` is set.

use std::future::ready;
use std::net::IpAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::routing::any;
use http::header::{CACHE_CONTROL, CONNECTION, CONTENT_LENGTH, CONTENT_TYPE};
use http::{HeaderValue, Method, Response, StatusCode, Version};
use serde::Serialize;
use serde_json::json;

use self::cors::Cors;
use super::Row;
use crate::clientip::{self, Class, Client};
use crate::config::Config;
use crate::handlers::{
    Body, CODE_BAD_REQUEST, CODE_INTERNAL, DrainOptions, JSON_TYPE, Limit, NO_STORE, OCTET_STREAM,
    RandomSource, UPLOAD_LIFETIME, drain_body, empty_ok, error_response, limited,
    method_not_allowed, query_value, request_origin, to_json,
};
use crate::metrics::Transfer;

mod cors;

/// The BitGauge convention that lists this instance for librespeed-cli (section 2.4).
pub const WELL_KNOWN_PATH: &str = "/.well-known/librespeed";
/// The size of one `ckSize` chunk: 1 MiB, as LibreSpeed's Go server sends it.
const CHUNK_BYTES: u64 = 1 << 20;
/// The `ckSize` of a request without one.
const DEFAULT_CHUNKS: u64 = 4;
/// LibreSpeed's own clamp.
const MAX_CHUNKS: u64 = 1024;
/// The bare names of the three LibreSpeed routes, which the server list also gives as paths
/// relative to its server (section 2.3).
const NAME_GARBAGE: &str = "garbage";
const NAME_EMPTY: &str = "empty";
const NAME_GET_IP: &str = "getIP";

/// A route of the layer, whichever of its four spellings a request used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Garbage,
    Empty,
    GetIp,
    WellKnown,
}

const GARBAGE: &[Method] = &[Method::GET, Method::OPTIONS];
const EMPTY: &[Method] = &[Method::GET, Method::POST, Method::OPTIONS];
const GET_IP: &[Method] = &[Method::GET, Method::OPTIONS];
const ALLOW_GARBAGE: &str = "GET, OPTIONS";
const ALLOW_EMPTY: &str = "GET, POST, OPTIONS";
const ALLOW_GET_IP: &str = "GET, OPTIONS";

/// Each bare name with the `backend/` prefix, the `.php` suffix, and both (section 2.1).
macro_rules! spellings {
    ($name:literal, $methods:expr, $allow:expr) => {
        [
            Row {
                path: concat!("/", $name),
                methods: $methods,
                allow: $allow,
            },
            Row {
                path: concat!("/backend/", $name),
                methods: $methods,
                allow: $allow,
            },
            Row {
                path: concat!("/", $name, ".php"),
                methods: $methods,
                allow: $allow,
            },
            Row {
                path: concat!("/backend/", $name, ".php"),
                methods: $methods,
                allow: $allow,
            },
        ]
    };
}

/// The layer's route-table rows (compatibility.md section 5): 12 spellings and the server list.
pub const ROWS: [Row; 13] = {
    let [g0, g1, g2, g3] = spellings!("garbage", GARBAGE, ALLOW_GARBAGE);
    let [e0, e1, e2, e3] = spellings!("empty", EMPTY, ALLOW_EMPTY);
    let [i0, i1, i2, i3] = spellings!("getIP", GET_IP, ALLOW_GET_IP);
    [
        g0,
        g1,
        g2,
        g3,
        e0,
        e1,
        e2,
        e3,
        i0,
        i1,
        i2,
        i3,
        Row {
            path: WELL_KNOWN_PATH,
            methods: &[Method::GET],
            allow: "GET",
        },
    ]
};

/// What the layer is built from, created once at startup.
#[derive(Debug, Clone)]
pub struct Deps {
    /// The shared random buffer `/garbage` is cut from.
    pub source: RandomSource,
    /// The per-client stream and request-rate limit of `/garbage` and `/empty`; `None` leaves
    /// them unlimited.
    pub limit: Option<Limit>,
    /// Counts the downloads under the layer's metrics group.
    pub download: Transfer,
    /// Counts the uploads under the layer's metrics group.
    pub upload: Transfer,
}

/// The layer, built: what the configuration decides, resolved once.
#[derive(Debug)]
struct Layer {
    deps: Deps,
    cors: Cors,
    /// `min(1024, floor(limits.max_download_bytes / 1 MiB))`.
    max_chunks: u64,
    max_upload_bytes: u64,
    public_url: String,
    base_path: String,
    display_name: String,
}

/// The layer's router for `config`, to be mounted under `server.base_path`. The CORS step of
/// section 2.2 runs around the limit; `OPTIONS` answers 200 and is never limited.
pub fn routes(config: &Config, deps: Deps) -> Router {
    let layer = Arc::new(Layer {
        deps,
        cors: Cors::new(&config.server.cors.allowed_origins),
        max_chunks: MAX_CHUNKS.min(config.limits.max_download_bytes.bytes() / CHUNK_BYTES),
        max_upload_bytes: config.limits.max_upload_bytes.bytes(),
        public_url: config.server.public_url.as_str().to_owned(),
        base_path: config.server.base_path.clone(),
        display_name: config.server.display_name.clone(),
    });
    let mut router = Router::new();
    for row in &ROWS {
        let kind = kind_of(row.path);
        let layer = Arc::clone(&layer);
        router = router.route(
            row.path,
            any(move |request: Request| async move { layer.serve(kind, row.allow, request).await }),
        );
    }
    router
}

/// The route a row's path spells.
fn kind_of(path: &str) -> Kind {
    if path == WELL_KNOWN_PATH {
        return Kind::WellKnown;
    }
    let name = path.trim_start_matches("/backend").trim_start_matches('/');
    match name.strip_suffix(".php").unwrap_or(name) {
        NAME_GARBAGE => Kind::Garbage,
        NAME_EMPTY => Kind::Empty,
        _ => Kind::GetIp,
    }
}

impl Layer {
    async fn serve(&self, kind: Kind, allow: &'static str, request: Request) -> Response<Body> {
        let cors = self.cors.headers(kind, &request);
        let method = request.method().clone();
        let limit = self.deps.limit.as_ref();
        let mut response = match (kind, method) {
            (Kind::Garbage | Kind::Empty | Kind::GetIp, Method::OPTIONS) => empty_ok(),
            (Kind::Garbage, Method::GET) => {
                limited(limit, request, |request| ready(self.garbage(&request))).await
            }
            (Kind::Empty, Method::GET | Method::POST) => {
                limited(limit, request, |request| self.empty(request)).await
            }
            (Kind::GetIp, Method::GET) => get_ip(&request),
            (Kind::WellKnown, Method::GET) => self.server_list(&request),
            _ => method_not_allowed(allow),
        };
        response.headers_mut().extend(cors);
        response
    }

    /// `GET /garbage?ckSize=N`: N chunks of 1 MiB of random data with `Content-Length`,
    /// no-store and no `Content-Encoding`. N is 4 when absent and clamped silently to the
    /// layer's cap; a value that is not a positive decimal integer answers 400 `bad_request`.
    fn garbage(&self, request: &Request) -> Response<Body> {
        let query = request.uri().query().unwrap_or_default();
        let chunks = match query_value(query, b"ckSize") {
            None => DEFAULT_CHUNKS,
            Some(value) => match parse_chunks(&value, self.max_chunks) {
                Some(chunks) => chunks,
                None => {
                    return error_response(
                        StatusCode::BAD_REQUEST,
                        CODE_BAD_REQUEST,
                        "ckSize must be a positive integer",
                        None,
                    );
                }
            },
        };
        let size = chunks.min(self.max_chunks) * CHUNK_BYTES;
        let mut response = Response::new(Body::new(
            self.deps.source.body(size, self.deps.download.clone()),
        ));
        let headers = response.headers_mut();
        headers.insert(CACHE_CONTROL, NO_STORE);
        headers.insert(CONTENT_TYPE, OCTET_STREAM);
        headers.insert(CONTENT_LENGTH, HeaderValue::from(size));
        response
    }

    /// `GET` and `POST /empty`, LibreSpeed's upload and ping: drains any body up to
    /// `limits.max_upload_bytes`, declared or not, within the native upload's lifetime from
    /// handler entry, then answers 200 empty with `Connection: keep-alive` on HTTP/1.1.
    async fn empty(&self, request: Request) -> Response<Body> {
        let options = DrainOptions {
            transfer: self.deps.upload.clone(),
            limit: self.max_upload_bytes,
            lifetime: UPLOAD_LIFETIME,
            require_length: false,
        };
        let http11 = request.version() == Version::HTTP_11;
        let entry = tokio::time::Instant::now();
        if let Err(answer) = drain_body(request, entry, &options, |_| Ok(())).await {
            return *answer;
        }
        let mut response = empty_ok();
        if http11 {
            response
                .headers_mut()
                .insert(CONNECTION, HeaderValue::from_static("keep-alive"));
        }
        response
    }

    /// `GET /.well-known/librespeed`: a server list of one entry describing this instance
    /// (section 2.4), whose server is the request origin, the base path and a slash. Plain http
    /// is allowed: LibreSpeed clients work over it.
    fn server_list(&self, request: &Request) -> Response<Body> {
        let origin = request_origin(request, &self.public_url, &self.base_path);
        // One entry of a librespeed-cli server list, with LibreSpeed's field names (section
        // 2.3); the URL fields are relative to server. A JSON map writes its keys sorted, as
        // Go writes a map's.
        let list = json!([{
            "id": 1,
            "name": self.display_name,
            "server": format!("{}/", origin.url),
            "dlURL": NAME_GARBAGE,
            "ulURL": NAME_EMPTY,
            "pingURL": NAME_EMPTY,
            "getIpURL": NAME_GET_IP,
        }]);
        json_response(&list, "encode the server list")
    }
}

/// `GET /getIP`: the client IP the client IP middleware derived through trusted proxies only,
/// with LibreSpeed's classification string after a non-public address. `isp` and `distance`
/// are ignored; `rawIspInfo` is always empty, since BitGauge never looks an address up.
fn get_ip(request: &Request) -> Response<Body> {
    let Some(client) = request.extensions().get::<Client>() else {
        // The router always runs the client IP middleware first; this is a wiring bug.
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            CODE_INTERNAL,
            "client address unavailable",
            None,
        );
    };
    let body = GetIp {
        raw_isp_info: NoIspInfo {},
        processed_string: processed_string(client.address),
    };
    json_response(&body, "encode the address")
}

/// The body of `GET /getIP`: LibreSpeed's shape without ISP data, which its web UI and
/// librespeed-cli both decode, in Go's field order.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetIp {
    raw_isp_info: NoIspInfo,
    processed_string: String,
}

/// `{}`: BitGauge never looks an address up.
#[derive(Serialize)]
struct NoIspInfo {}

/// The address, an IPv4-mapped one as IPv4, followed by its classification string when it is
/// not public.
fn processed_string(address: IpAddr) -> String {
    let address = address.to_canonical();
    let class = match (clientip::address_class(address), clientip::version(address)) {
        (Class::Loopback, 4) => "localhost IPv4 access",
        (Class::Loopback, _) => "localhost IPv6 access",
        (Class::LinkLocal, 4) => "link-local IPv4 access",
        (Class::LinkLocal, _) => "link-local IPv6 access",
        (Class::Private, 4) => "private IPv4 access",
        (Class::Cgnat, 4) => "CGNAT IPv4 access",
        (Class::Ula, 6) => "ULA IPv6 access",
        (Class::Private | Class::Cgnat | Class::Ula | Class::Public, _) => {
            return address.to_string();
        }
    };
    format!("{address} - {class}")
}

/// A positive decimal integer of any length, saturating at `limit` so a long run of digits
/// cannot overflow. `None` for anything else: empty, a sign, a point, a letter, or zero.
fn parse_chunks(value: &[u8], limit: u64) -> Option<u64> {
    if value.is_empty() || !value.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let mut chunks: u64 = 0;
    for &digit in value {
        if chunks <= limit {
            chunks = chunks * 10 + u64::from(digit - b'0');
        }
    }
    (chunks != 0).then(|| chunks.min(limit))
}

/// A JSON body with no-store, or the 500 envelope naming `what` failed.
fn json_response(value: &impl Serialize, what: &str) -> Response<Body> {
    let Ok(body) = to_json(value) else {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, CODE_INTERNAL, what, None);
    };
    let length = body.len();
    let mut response = Response::new(Body::from(body));
    let headers = response.headers_mut();
    headers.insert(CACHE_CONTROL, NO_STORE);
    headers.insert(CONTENT_TYPE, JSON_TYPE);
    headers.insert(CONTENT_LENGTH, HeaderValue::from(length));
    response
}
