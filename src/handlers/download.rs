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

//! `GET /api/v1/download?bytes=N` (wire-protocol.md section 3.1).

use std::borrow::Cow;

use http::header::CONTENT_LENGTH;
use http::{HeaderValue, Response, StatusCode};

use super::envelope::{CODE_BAD_REQUEST, CODE_BYTES_OUT_OF_RANGE, Details, error_response};
use super::random::RandomSource;
use super::{Body, OCTET_STREAM, set_type};
use crate::metrics::Transfer;

/// The query parameter of the route.
const BYTES_PARAM: &[u8] = b"bytes";

/// Answers with exactly N random bytes from `source`, with `Content-Length`, no-store and no
/// `Content-Encoding`. A missing or non-integer N is `bad_request`; an integer outside 1 to
/// `max_bytes` is `bytes_out_of_range` with the limit in the details. `transfer` counts the
/// body ([`RandomSource::body`]).
#[must_use]
pub fn download(
    query: Option<&str>,
    source: &RandomSource,
    max_bytes: u64,
    transfer: Transfer,
) -> Response<Body> {
    let size = match parse_bytes(query.unwrap_or_default(), max_bytes) {
        Parsed::Size(size) => size,
        Parsed::Invalid => {
            return error_response(
                StatusCode::BAD_REQUEST,
                CODE_BAD_REQUEST,
                "bytes must be an integer",
                None,
            );
        }
        Parsed::OutOfRange => {
            let mut details = Details::new();
            details.insert("max".to_owned(), max_bytes.into());
            return error_response(
                StatusCode::BAD_REQUEST,
                CODE_BYTES_OUT_OF_RANGE,
                &format!("bytes must be between 1 and {max_bytes}"),
                Some(&details),
            );
        }
    };
    let mut response = Response::new(Body::new(source.body(size, transfer)));
    let headers = response.headers_mut();
    set_type(headers, OCTET_STREAM);
    headers.insert(CONTENT_LENGTH, HeaderValue::from(size));
    response
}

/// What the `bytes` parameter says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Parsed {
    /// A size from 1 to the cap.
    Size(u64),
    /// Missing, or not an optionally signed run of decimal digits.
    Invalid,
    /// An integer outside 1 to the cap, however many digits it has.
    OutOfRange,
}

/// The first `bytes` parameter of a raw query, found as Go's `url.ParseQuery` would: pairs
/// holding a semicolon or a malformed escape are skipped, and keys and values are
/// percent-decoded, a plus as a space.
fn parse_bytes(raw_query: &str, max_bytes: u64) -> Parsed {
    for pair in raw_query.split('&') {
        if pair.is_empty() || pair.contains(';') {
            continue;
        }
        let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let Some(key) = query_unescape(raw_key) else {
            continue;
        };
        if *key != *BYTES_PARAM {
            continue;
        }
        let Some(value) = query_unescape(raw_value) else {
            continue;
        };
        return parse_count(&value, max_bytes);
    }
    Parsed::Invalid
}

/// Go's `url.QueryUnescape`: `%XX` decoded, `+` read as a space, and `None` for a malformed
/// escape. A component without either is borrowed.
fn query_unescape(component: &str) -> Option<Cow<'_, [u8]>> {
    let bytes = component.as_bytes();
    if !bytes.iter().any(|&byte| byte == b'%' || byte == b'+') {
        return Some(Cow::Borrowed(bytes));
    }
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        match byte {
            b'%' => {
                let high = char::from(*bytes.get(index + 1)?).to_digit(16)?;
                let low = char::from(*bytes.get(index + 2)?).to_digit(16)?;
                decoded.push(u8::try_from(high << 4 | low).ok()?);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            _ => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    Some(Cow::Owned(decoded))
}

fn parse_count(value: &[u8], max_bytes: u64) -> Parsed {
    let (negative, digits) = match value.strip_prefix(b"-") {
        Some(digits) => (true, digits),
        None => (false, value),
    };
    if digits.is_empty() || !digits.iter().all(u8::is_ascii_digit) {
        return Parsed::Invalid;
    }
    if negative {
        return Parsed::OutOfRange;
    }
    // Stop accumulating once past the cap, so a long run of digits cannot overflow.
    let mut size: u64 = 0;
    for &digit in digits {
        let next = u64::from(digit - b'0');
        match size.checked_mul(10).and_then(|tens| tens.checked_add(next)) {
            Some(grown) if grown <= max_bytes => size = grown,
            Some(_) | None => return Parsed::OutOfRange,
        }
    }
    if size == 0 {
        Parsed::OutOfRange
    } else {
        Parsed::Size(size)
    }
}
