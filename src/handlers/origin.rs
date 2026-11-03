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

//! The origins of a request: the absolute origin the compatibility layers write
//! (compatibility.md section 6), the host check of configuration-security.md section 3, and
//! the comparable form of an `Origin` (RFC 6454).

use http::header::HOST;
use http::{HeaderName, Request};

use crate::clientip::Client;
use crate::config::url;

const MAX_HOST_LENGTH: usize = 253;
const MAX_LABEL_LENGTH: usize = 63;
const MAX_PORT: u32 = 65_535;
const MAX_PORT_DIGITS: usize = 5;
const SCHEME_HTTP: &str = "http";
const SCHEME_HTTPS: &str = "https";
/// Separates the values of a forwarding header a chain of proxies extended.
const LIST_SEPARATOR: char = ',';
const X_FORWARDED_PROTO: HeaderName = HeaderName::from_static("x-forwarded-proto");
const X_FORWARDED_HOST: HeaderName = HeaderName::from_static("x-forwarded-host");

/// The origin clients use, followed by the base path, and whether it is https.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestOrigin {
    /// The origin and base path, without a trailing slash.
    pub url: String,
    /// Whether the origin is https.
    pub secure: bool,
}

/// The one builder of the compatibility layers' absolute URLs: the origin clients use,
/// followed by `base_path` without its trailing slash. `public_url`, `server.public_url`, wins
/// when it is set. Otherwise, for a request whose TCP peer is a trusted proxy (the [`Client`]
/// the client IP middleware stored), the scheme is the first comma-separated value of
/// `X-Forwarded-Proto`, trimmed and lower-cased, http when it is absent or neither http nor
/// https; the host is the first value of `X-Forwarded-Host`, trimmed, when it passes
/// [`valid_host`], and the request's host otherwise. Any other request gets http and its own
/// host: forwarding headers from an untrusted peer are never read.
#[must_use]
pub fn request_origin<B>(request: &Request<B>, public_url: &str, base_path: &str) -> RequestOrigin {
    let base = base_path.strip_suffix('/').unwrap_or(base_path);
    if !public_url.is_empty() {
        let origin = public_url.strip_suffix('/').unwrap_or(public_url);
        let secure = origin
            .get(..SCHEME_HTTPS.len() + 3)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"));
        return RequestOrigin {
            url: format!("{origin}{base}"),
            secure,
        };
    }
    let mut scheme = SCHEME_HTTP;
    let mut host = request_host(request);
    let peer_trusted = request
        .extensions()
        .get::<Client>()
        .is_some_and(|client| client.peer_trusted);
    if peer_trusted {
        let forwarded = first_value(request, &X_FORWARDED_PROTO);
        if forwarded.eq_ignore_ascii_case(SCHEME_HTTPS) {
            scheme = SCHEME_HTTPS;
        }
        let forwarded_host = first_value(request, &X_FORWARDED_HOST);
        if valid_host(forwarded_host) {
            host = forwarded_host;
        }
    }
    RequestOrigin {
        url: format!("{scheme}://{host}{base}"),
        secure: scheme == SCHEME_HTTPS,
    }
}

/// The request's host: the authority of an absolute-form target without its userinfo, as Go's
/// `URL.Host`, else the `Host` header.
pub fn request_host<B>(request: &Request<B>) -> &str {
    request.uri().authority().map_or_else(
        || {
            request
                .headers()
                .get(HOST)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
        },
        |authority| {
            let authority = authority.as_str();
            authority
                .rsplit_once('@')
                .map_or(authority, |(_userinfo, host)| host)
        },
    )
}

/// The first comma-separated value of a forwarding header's first line, trimmed: the one the
/// proxy closest to the client wrote.
fn first_value<'request, B>(request: &'request Request<B>, name: &HeaderName) -> &'request str {
    let line = request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    line.split(LIST_SEPARATOR).next().unwrap_or_default().trim()
}

/// Whether `host` is a hostname, a DNS name or an IPv4 address, followed by an optional port of
/// 1 to 65535: the check a CSP host and a forwarded host both pass before use. An IPv6 literal
/// is not a hostname, and CSP host sources cannot express one.
#[must_use]
pub fn valid_host(host: &str) -> bool {
    match host.rfind(':') {
        Some(colon) => valid_hostname(&host[..colon]) && valid_port(&host[colon + 1..]),
        None => valid_hostname(host),
    }
}

fn valid_port(digits: &str) -> bool {
    !digits.is_empty()
        && digits.len() <= MAX_PORT_DIGITS
        && digits.bytes().all(|byte| byte.is_ascii_digit())
        && digits
            .parse::<u32>()
            .is_ok_and(|port| (1..=MAX_PORT).contains(&port))
}

/// A DNS name of letters, digits and hyphens in dot-separated labels of 1 to 63 characters that
/// neither start nor end with a hyphen; an IPv4 address passes too.
fn valid_hostname(name: &str) -> bool {
    !name.is_empty() && name.len() <= MAX_HOST_LENGTH && name.split('.').all(valid_label)
}

fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= MAX_LABEL_LENGTH
        && !label.starts_with('-')
        && !label.ends_with('-')
        && label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// An origin's comparable form: the scheme and host lower-cased, and no port when it is the
/// scheme's default, so that equal origins compare equal. `None` for what does not parse as a
/// URL with a host.
#[must_use]
pub fn normalize_origin(origin: &str) -> Option<String> {
    let parsed = url::parse(origin).ok()?;
    if parsed.host.is_empty() {
        return None;
    }
    let scheme = parsed.scheme.to_ascii_lowercase();
    let host = parsed.hostname().to_lowercase();
    let mut port = parsed.port();
    if (scheme == SCHEME_HTTP && port == "80") || (scheme == SCHEME_HTTPS && port == "443") {
        port = "";
    }
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host
    };
    if port.is_empty() {
        Some(format!("{scheme}://{host}"))
    } else {
        Some(format!("{scheme}://{host}:{port}"))
    }
}
