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

//! The part of Go's `net/url.Parse` (go1.26) that decides whether an origin parses, and the
//! components the origin rule reads. An origin that Go refuses is a decode problem and one it
//! parses is a validation question, and which of the two a value is changes what else is
//! reported (an unparsed `server.public_url` keeps its empty default), so the split follows Go's
//! parser rather than the WHATWG one the `url` crate implements.

use super::types::parse_addr;
use go_compat::quote::quote;

/// The components of a parsed URL that the origin rule reads.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Url {
    /// The scheme, lowercased.
    pub(crate) scheme: String,
    /// The rootless part after `scheme:` when there is no `//`.
    pub(crate) opaque: String,
    /// Whether the authority has user information.
    pub(crate) has_user: bool,
    /// The host and optional port, unescaped, an IPv6 literal bracketed.
    pub(crate) host: String,
    /// The path, unescaped.
    pub(crate) path: String,
    /// The query, as written.
    pub(crate) raw_query: String,
    /// Whether the URL ends in a `?` with nothing after it.
    pub(crate) force_query: bool,
    /// The fragment, unescaped.
    pub(crate) fragment: String,
}

impl Url {
    /// The host without its port and without the brackets of an IPv6 literal.
    pub(crate) fn hostname(&self) -> &str {
        self.split_host_port().0
    }

    /// The port, empty when there is none.
    pub(crate) fn port(&self) -> &str {
        self.split_host_port().1
    }

    fn split_host_port(&self) -> (&str, &str) {
        let mut host = self.host.as_str();
        let mut port = "";
        if let Some(colon) = host.rfind(':')
            && valid_optional_port(&host[colon..])
        {
            (host, port) = (&host[..colon], &host[colon + 1..]);
        }
        if let Some(inner) = host
            .strip_prefix('[')
            .and_then(|rest| rest.strip_suffix(']'))
        {
            host = inner;
        }
        (host, port)
    }
}

/// The section of a URL being unescaped, which decides what may appear in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Path,
    Host,
    Zone,
    UserPassword,
    Fragment,
}

/// Parses `raw` as Go's `url.Parse` does, or says why it refuses it.
pub(crate) fn parse(raw: &str) -> Result<Url, String> {
    let (before_fragment, fragment) = raw.split_once('#').unwrap_or((raw, ""));
    let mut url = parse_without_fragment(before_fragment)?;
    if !fragment.is_empty() {
        url.fragment = unescape(fragment, Mode::Fragment)?;
    }
    Ok(url)
}

fn parse_without_fragment(raw: &str) -> Result<Url, String> {
    if raw.bytes().any(|byte| byte < b' ' || byte == 0x7f) {
        return Err("invalid control character in URL".to_owned());
    }
    let mut url = Url::default();
    if raw == "*" {
        "*".clone_into(&mut url.path);
        return Ok(url);
    }
    let (scheme, mut rest) = scheme(raw)?;
    url.scheme = scheme.to_ascii_lowercase();
    if rest.ends_with('?') && rest.matches('?').count() == 1 {
        url.force_query = true;
        rest = &rest[..rest.len() - 1];
    } else if let Some((before, query)) = rest.split_once('?') {
        query.clone_into(&mut url.raw_query);
        rest = before;
    }
    if !rest.starts_with('/') {
        if !url.scheme.is_empty() {
            // A rootless path after a scheme is opaque.
            rest.clone_into(&mut url.opaque);
            return Ok(url);
        }
        let segment = rest.split_once('/').map_or(rest, |(segment, _)| segment);
        if segment.contains(':') {
            return Err("first path segment in URL cannot contain colon".to_owned());
        }
    }
    if (!url.scheme.is_empty() || !rest.starts_with("///")) && rest.starts_with("//") {
        let authority_and_path = &rest[2..];
        let (authority, path) = authority_and_path
            .find('/')
            .map_or((authority_and_path, ""), |slash| {
                authority_and_path.split_at(slash)
            });
        let (has_user, host) = authority_parts(&url.scheme, authority)?;
        url.has_user = has_user;
        url.host = host;
        rest = path;
    }
    url.path = unescape(rest, Mode::Path)?;
    Ok(url)
}

/// Splits off a leading `scheme:`; a string that does not start with one has no scheme.
fn scheme(raw: &str) -> Result<(&str, &str), String> {
    for (index, byte) in raw.bytes().enumerate() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' => {}
            b'0'..=b'9' | b'+' | b'-' | b'.' if index > 0 => {}
            b':' if index == 0 => return Err("missing protocol scheme".to_owned()),
            b':' => return Ok((&raw[..index], &raw[index + 1..])),
            _ => return Ok(("", raw)),
        }
    }
    Ok(("", raw))
}

/// Whether there is user information, and the unescaped host, of an authority.
fn authority_parts(scheme: &str, authority: &str) -> Result<(bool, String), String> {
    let Some(at) = authority.rfind('@') else {
        return Ok((false, host(scheme, authority)?));
    };
    let host = host(scheme, &authority[at + 1..])?;
    let user_info = &authority[..at];
    if !user_info.chars().all(|character| {
        character.is_ascii_alphanumeric() || "-._:~!$&'()*+,;=%@".contains(character)
    }) {
        return Err("invalid userinfo".to_owned());
    }
    let (user, password) = user_info.split_once(':').unwrap_or((user_info, ""));
    unescape(user, Mode::UserPassword)?;
    unescape(password, Mode::UserPassword)?;
    Ok((true, host))
}

/// Parses host[:port]: a bracketed IP literal must be IPv6 and may carry a `%25` zone; an
/// http or https host has at most one colon, its port's.
fn host(scheme: &str, host: &str) -> Result<String, String> {
    match host.rfind('[') {
        Some(0) => return bracketed_host(host),
        Some(_) => return Err("invalid IP-literal".to_owned()),
        None => {}
    }
    if let Some(first) = host.find(':') {
        let last = host.rfind(':').unwrap_or(first);
        let colon = if scheme == "http" || scheme == "https" {
            first
        } else {
            last
        };
        let port = &host[colon..];
        if !valid_optional_port(port) {
            return Err(format!("invalid port {} after host", quote(port)));
        }
    }
    unescape(host, Mode::Host)
}

fn bracketed_host(host: &str) -> Result<String, String> {
    let close = host.rfind(']').ok_or("missing ']' in host")?;
    let port = &host[close + 1..];
    if !valid_optional_port(port) {
        return Err(format!("invalid port {} after host", quote(port)));
    }
    let literal = &host[1..close];
    let unescaped = match literal.find("%25") {
        Some(zone) => {
            unescape(&literal[..zone], Mode::Host)? + &unescape(&literal[zone..], Mode::Zone)?
        }
        None => unescape(literal, Mode::Host)?,
    };
    match parse_addr(&unescaped) {
        Some((address, _)) if address.is_ipv4() => Err("invalid IP-literal".to_owned()),
        Some(_) => Ok(format!("[{unescaped}]{port}")),
        None => Err(format!("invalid host: {}", quote(&unescaped))),
    }
}

/// An empty port, or a colon and decimal digits.
fn valid_optional_port(port: &str) -> bool {
    port.is_empty()
        || port
            .strip_prefix(':')
            .is_some_and(|digits| digits.bytes().all(|byte| byte.is_ascii_digit()))
}

/// Whether a host byte must be escaped: hosts may hold letters, digits, `-._~`, the sub-delims
/// and `:[]<>"`, and `%`-encode only non-ASCII bytes.
fn host_byte_needs_escape(byte: u8) -> bool {
    !(byte.is_ascii_alphanumeric() || b"-_.~!$&'()*+,;=:[]<>\"".contains(&byte))
}

/// Decodes the `%XX` escapes of one URL section, refusing a malformed escape and, in a host or a
/// zone, what that section may not hold.
fn unescape(text: &str, mode: Mode) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte == b'%' {
            let escape = bytes.get(index..index + 3);
            let value = escape.and_then(|escape| {
                let high = char::from(escape[1]).to_digit(16)?;
                let low = char::from(escape[2]).to_digit(16)?;
                u8::try_from(high << 4 | low).ok()
            });
            let shown = || {
                let end = (index + 3).min(text.len());
                // Bytes, as Go slices them: the three may end inside a character.
                let shown = String::from_utf8_lossy(&bytes[index..end]);
                format!("invalid URL escape {}", quote(&shown))
            };
            let value = value.ok_or_else(shown)?;
            let is_percent = &text[index..index + 3] == "%25";
            // A host %-encodes only non-ASCII bytes, except the %25 of a zone.
            if mode == Mode::Host && value < 0x80 && !is_percent {
                return Err(shown());
            }
            // A zone may escape only what it could hold unescaped, or a space.
            if mode == Mode::Zone && !is_percent && value != b' ' && host_byte_needs_escape(value) {
                return Err(shown());
            }
            decoded.push(value);
            index += 3;
            continue;
        }
        if matches!(mode, Mode::Host | Mode::Zone) && byte < 0x80 && host_byte_needs_escape(byte) {
            return Err(format!(
                "invalid character {} in host name",
                quote(&text[index..=index])
            ));
        }
        decoded.push(byte);
        index += 1;
    }
    Ok(String::from_utf8_lossy(&decoded).into_owned())
}
