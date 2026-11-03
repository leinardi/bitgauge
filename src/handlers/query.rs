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

//! Query parameters, read as Go's `url.URL.Query` reads them.

use std::borrow::Cow;

/// The first value of the parameter `name` in a raw query, as Go's `url.ParseQuery` finds it:
/// pairs holding a semicolon or a malformed escape are skipped, and keys and values are
/// percent-decoded, a plus as a space. `None` when no pair names it.
#[must_use]
pub fn query_value<'query>(raw_query: &'query str, name: &[u8]) -> Option<Cow<'query, [u8]>> {
    for pair in raw_query.split('&') {
        if pair.is_empty() || pair.contains(';') {
            continue;
        }
        let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let Some(key) = query_unescape(raw_key) else {
            continue;
        };
        if *key != *name {
            continue;
        }
        let Some(value) = query_unescape(raw_value) else {
            continue;
        };
        return Some(value);
    }
    None
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
