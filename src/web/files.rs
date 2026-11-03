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

//! One embedded file's answer, as Go's `http.ServeContent` gives it for a file with no
//! modification time and no `ETag`: its content type, `Accept-Ranges`, a single range as 206
//! or 416, and the conditional headers that can apply.

use axum::extract::Request;
use bytes::Bytes;
use http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_RANGE, CONTENT_TYPE, IF_MATCH, IF_NONE_MATCH, IF_RANGE,
    RANGE, X_CONTENT_TYPE_OPTIONS,
};
use http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode};

use crate::handlers::Body;

/// The content types by extension: Go's built-in table, plus the text and font types the build
/// ships, which Go sniffed. Any other extension is `application/octet-stream`
/// (`docs/rust-port.md` row 12).
const CONTENT_TYPES: [(&str, &str); 19] = [
    ("avif", "image/avif"),
    ("css", "text/css; charset=utf-8"),
    ("gif", "image/gif"),
    ("htm", "text/html; charset=utf-8"),
    ("html", "text/html; charset=utf-8"),
    ("jpeg", "image/jpeg"),
    ("jpg", "image/jpeg"),
    ("js", "text/javascript; charset=utf-8"),
    ("json", "application/json"),
    ("mjs", "text/javascript; charset=utf-8"),
    ("pdf", "application/pdf"),
    ("png", "image/png"),
    ("svg", "image/svg+xml"),
    ("txt", "text/plain; charset=utf-8"),
    ("wasm", "application/wasm"),
    ("webp", "image/webp"),
    ("woff", "font/woff"),
    ("woff2", "font/woff2"),
    ("xml", "text/xml; charset=utf-8"),
];
const OCTET_STREAM: &str = "application/octet-stream";
const TEXT_PLAIN: &str = "text/plain; charset=utf-8";

/// The plain 404 of an unknown path: Go's `http.NotFound`.
#[must_use]
pub fn not_found() -> Response<Body> {
    plain_error(StatusCode::NOT_FOUND, "404 page not found\n")
}

/// Go's `http.Error`: a plain-text body, `nosniff`, and whatever caching the handler set does
/// not apply.
pub fn plain_error(status: StatusCode, text: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(text));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static(TEXT_PLAIN));
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}

/// The answer for `content`, the file `name`, with `content_type` or the one its extension
/// gives, and `cache`.
pub(super) fn serve_file(
    request: &Request,
    name: &str,
    content: Bytes,
    content_type: Option<&'static str>,
    cache: &'static str,
) -> Response<Body> {
    let headers = request.headers();
    let mut response = match precondition(headers) {
        Some(status) => {
            let mut response = Response::new(Body::empty());
            *response.status_mut() = status;
            response
        }
        None => ranged(headers, content),
    };
    let status = response.status();
    let served = matches!(status, StatusCode::OK | StatusCode::PARTIAL_CONTENT);
    let response_headers = response.headers_mut();
    if served {
        let content_type = content_type.unwrap_or_else(|| type_of(name));
        response_headers.insert(CONTENT_TYPE, HeaderValue::from_static(content_type));
    }
    // Go's ServeContent drops the caching headers from the error it writes for a range, but
    // keeps them on a 304 or 412, which it writes itself.
    if status != StatusCode::RANGE_NOT_SATISFIABLE {
        response_headers.insert(CACHE_CONTROL, HeaderValue::from_static(cache));
    }
    response
}

fn type_of(name: &str) -> &'static str {
    let extension = name.rsplit_once('.').map_or("", |(_, extension)| extension);
    CONTENT_TYPES
        .iter()
        .find(|(known, _)| known.eq_ignore_ascii_case(extension))
        .map_or(OCTET_STREAM, |&(_, content_type)| content_type)
}

/// A conditional header's first value, as Go's `Header.Get` reads it: an empty value is no
/// header at all.
fn condition<'header>(
    headers: &'header HeaderMap,
    name: &HeaderName,
) -> Option<&'header HeaderValue> {
    headers.get(name).filter(|value| !value.is_empty())
}

/// The conditional headers that can decide for a file with no `ETag` and no modification
/// time: `If-Match` without `*` fails (412), and `If-None-Match` with `*` matches (304).
fn precondition(headers: &HeaderMap) -> Option<StatusCode> {
    let listed = |value: &HeaderValue| {
        value
            .to_str()
            .is_ok_and(|list| list.split(',').any(|tag| tag.trim() == "*"))
    };
    if let Some(value) = condition(headers, &IF_MATCH)
        && !listed(value)
    {
        return Some(StatusCode::PRECONDITION_FAILED);
    }
    condition(headers, &IF_NONE_MATCH)
        .is_some_and(listed)
        .then_some(StatusCode::NOT_MODIFIED)
}

/// The whole file, a single range of it as 206, or 416; several ranges answer the whole file
/// (row 12), and so does a range of an empty file that cannot overlap it. An `If-Range` can
/// never match a file with no `ETag` and no modification time, so it makes the range ignored.
fn ranged(headers: &HeaderMap, content: Bytes) -> Response<Body> {
    let size = content.len();
    let range = headers
        .get(RANGE)
        .filter(|_| condition(headers, &IF_RANGE).is_none())
        .and_then(|value| value.to_str().ok());
    let (status, body, content_range) = match range.map(|range| parse_range(range, size)) {
        None | Some(Ok(Ranges::None | Ranges::Several)) => (StatusCode::OK, content, None),
        // Go ignores a range that cannot overlap an empty file, which some clients send on
        // every request.
        Some(Err(RangeError::NoOverlap)) if size == 0 => (StatusCode::OK, content, None),
        Some(Ok(Ranges::One { start, length })) => {
            // Go's end is signed: an empty suffix of an empty file ends at -1.
            let last = (start + length)
                .checked_sub(1)
                .map_or_else(|| "-1".to_owned(), |last| last.to_string());
            (
                StatusCode::PARTIAL_CONTENT,
                content.slice(start..start + length),
                Some(format!("bytes {start}-{last}/{size}")),
            )
        }
        Some(Err(RangeError::NoOverlap)) => {
            let mut response = plain_error(
                StatusCode::RANGE_NOT_SATISFIABLE,
                "invalid range: failed to overlap\n",
            );
            if let Ok(value) = HeaderValue::try_from(format!("bytes */{size}")) {
                response.headers_mut().insert(CONTENT_RANGE, value);
            }
            return response;
        }
        Some(Err(RangeError::Invalid)) => {
            return plain_error(StatusCode::RANGE_NOT_SATISFIABLE, "invalid range\n");
        }
    };
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Some(value) = content_range.and_then(|range| HeaderValue::try_from(range).ok()) {
        headers.insert(CONTENT_RANGE, value);
    }
    response
}

/// What a `Range` header asks of a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Ranges {
    /// No range: the whole file.
    None,
    /// One range.
    One { start: usize, length: usize },
    /// More than one: the whole file here.
    Several,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RangeError {
    /// Not a `bytes=` list Go's `parseRange` reads.
    Invalid,
    /// Every range starts past the end.
    NoOverlap,
}

/// Go's `parseRange` for a file of `size` bytes.
pub(super) fn parse_range(header: &str, size: usize) -> Result<Ranges, RangeError> {
    if header.is_empty() {
        return Ok(Ranges::None);
    }
    let list = header.strip_prefix("bytes=").ok_or(RangeError::Invalid)?;
    let mut ranges = Vec::new();
    let mut no_overlap = false;
    for part in list.split(',') {
        let part = part.trim_matches([' ', '\t']);
        if part.is_empty() {
            continue;
        }
        let (start, end) = part.split_once('-').ok_or(RangeError::Invalid)?;
        let (start, end) = (
            start.trim_matches([' ', '\t']),
            end.trim_matches([' ', '\t']),
        );
        if start.is_empty() {
            // A suffix: the last `end` bytes.
            if end.is_empty() || end.starts_with('-') {
                return Err(RangeError::Invalid);
            }
            let suffix = parse_count(end)?.min(size);
            ranges.push((size - suffix, suffix));
            continue;
        }
        let start = parse_count(start)?;
        if start >= size {
            no_overlap = true;
            continue;
        }
        let length = if end.is_empty() {
            size - start
        } else {
            let end = parse_count(end)?;
            if start > end {
                return Err(RangeError::Invalid);
            }
            end.min(size - 1) - start + 1
        };
        ranges.push((start, length));
    }
    match ranges.as_slice() {
        [] if no_overlap => Err(RangeError::NoOverlap),
        [] => Ok(Ranges::None),
        [(start, length)] => Ok(Ranges::One {
            start: *start,
            length: *length,
        }),
        [_, _, ..] => Ok(Ranges::Several),
    }
}

/// A non-negative decimal of Go's `strconv.ParseInt`, a leading `+` included.
fn parse_count(text: &str) -> Result<usize, RangeError> {
    let count: i64 = text.parse().map_err(|_| RangeError::Invalid)?;
    usize::try_from(count).map_err(|_| RangeError::Invalid)
}
