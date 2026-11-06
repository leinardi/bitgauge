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

//! Go's `strconv.Unquote`, which decides which strace arguments are paths (strace's `"\1\0"` is
//! not a Go string literal, so it is no path). No crate matches it; `path.Clean` and `path.Join`,
//! which place the paths, are `policy::clean`'s.

/// Go's `strconv.Unquote`: the bytes of a Go string literal in double quotes, backquotes or
/// single quotes, or `None` when `text` is not exactly one.
pub(super) fn unquote(text: &str) -> Option<Vec<u8>> {
    let bytes = text.as_bytes();
    let (&first, &last) = (bytes.first()?, bytes.last()?);
    if bytes.len() < 2 || first != last {
        return None;
    }
    let body = &text[1..text.len() - 1];
    match first {
        b'`' => (!body.contains('`')).then(|| body.replace('\r', "").into_bytes()),
        b'"' => unquote_body(body, b'"'),
        b'\'' => {
            let decoded = unquote_body(body, b'\'')?;
            // A rune literal holds exactly one character.
            let one = std::str::from_utf8(&decoded)
                .map_or(decoded.len() == 1, |text| text.chars().count() == 1);
            one.then_some(decoded)
        }
        _ => None,
    }
}

/// The escapes of a double- or single-quoted body, as `strconv.UnquoteChar` reads them.
fn unquote_body(body: &str, quote: u8) -> Option<Vec<u8>> {
    let bytes = body.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == quote || byte == b'\n' {
            return None;
        }
        if byte != b'\\' {
            out.push(byte);
            index += 1;
            continue;
        }
        let escape = *bytes.get(index + 1)?;
        index += 2;
        match escape {
            b'a' => out.push(0x07),
            b'b' => out.push(0x08),
            b'f' => out.push(0x0c),
            b'n' => out.push(b'\n'),
            b'r' => out.push(b'\r'),
            b't' => out.push(b'\t'),
            b'v' => out.push(0x0b),
            b'\\' => out.push(b'\\'),
            b'\'' | b'"' if escape == quote => out.push(escape),
            b'x' => {
                out.push(u8::try_from(hex(bytes.get(index..index + 2)?)?).ok()?);
                index += 2;
            }
            b'u' | b'U' => {
                let width = if escape == b'u' { 4 } else { 8 };
                let value = hex(bytes.get(index..index + width)?)?;
                let char = char::from_u32(value)?;
                let mut buffer = [0_u8; 4];
                out.extend_from_slice(char.encode_utf8(&mut buffer).as_bytes());
                index += width;
            }
            b'0'..=b'7' => {
                // Exactly three octal digits, at most 0o377; strace's one-digit "\1" is refused.
                let digits = bytes.get(index - 1..index + 2)?;
                let mut value: u32 = 0;
                for &digit in digits {
                    if !(b'0'..=b'7').contains(&digit) {
                        return None;
                    }
                    value = value * 8 + u32::from(digit - b'0');
                }
                out.push(u8::try_from(value).ok()?);
                index += 2;
            }
            _ => return None,
        }
    }
    Some(out)
}

fn hex(digits: &[u8]) -> Option<u32> {
    let mut value: u32 = 0;
    for &digit in digits {
        value = value * 16 + char::from(digit).to_digit(16)?;
    }
    Some(value)
}

#[cfg(test)]
mod tests {
    use super::unquote;

    /// `strconv.Unquote` on the shapes strace prints, Go's answers taken from its documented
    /// grammar.
    #[test]
    fn unquote_is_gos() {
        let ok =
            |text: &str| unquote(text).map(|bytes| String::from_utf8_lossy(&bytes).into_owned());
        assert_eq!(ok(r#""/etc/hosts""#).as_deref(), Some("/etc/hosts"));
        assert_eq!(ok(r#""a\"b\\c\n""#).as_deref(), Some("a\"b\\c\n"));
        assert_eq!(ok(r#""\x41\101é""#).as_deref(), Some("AAé"));
        assert_eq!(ok("`raw\\n`").as_deref(), Some("raw\\n"));
        assert_eq!(ok("'a'").as_deref(), Some("a"));
        for bad in [
            r#""\1\0\0""#,
            r#""\400""#,
            r#""\'""#,
            r#""a"b""#,
            r#""abc"..."#,
            "\"",
            "abc",
            "NULL",
            r#""\x4""#,
            r#""\ud800""#,
            "'ab'",
            "\"a\nb\"",
        ] {
            assert_eq!(unquote(bad), None, "{bad}");
        }
    }
}
