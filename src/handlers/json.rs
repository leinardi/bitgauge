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

//! JSON written as Go's `encoding/json` writes it, so every body reads byte for byte as the Go
//! server's: `<`, `>`, `&`, U+2028 and U+2029 escaped as `\u` sequences, a backspace and a form
//! feed as `\u0008` and `\u000c`, and floats in Go's layout (`0` and `5.13`, not `0.0`, and an
//! exponent only outside `1e-6` to `1e21`, written `1e+21` and `1e-7`). `serde_json` writes the
//! rest, keys and integers included, as Go does.

use std::io::{self, Write};

use serde::Serialize;
use serde_json::ser::{CharEscape, Formatter, Serializer};

/// The smallest magnitude Go writes without an exponent.
const PLAIN_FROM: f64 = 1e-6;
/// The magnitude from which Go writes an exponent again.
const PLAIN_BELOW: f64 = 1e21;

/// `serde_json`'s compact formatter, with Go's escapes and float layout.
struct GoFormatter;

impl Formatter for GoFormatter {
    fn write_f64<W: ?Sized + Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        writer.write_all(go_float(value).as_bytes())
    }

    fn write_string_fragment<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        fragment: &str,
    ) -> io::Result<()> {
        let mut start = 0;
        for (index, character) in fragment.char_indices() {
            let escape = match character {
                '<' => "\\u003c",
                '>' => "\\u003e",
                '&' => "\\u0026",
                '\u{2028}' => "\\u2028",
                '\u{2029}' => "\\u2029",
                _ => continue,
            };
            writer.write_all(&fragment.as_bytes()[start..index])?;
            writer.write_all(escape.as_bytes())?;
            start = index + character.len_utf8();
        }
        writer.write_all(&fragment.as_bytes()[start..])
    }

    fn write_char_escape<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        char_escape: CharEscape,
    ) -> io::Result<()> {
        let escape: &[u8] = match char_escape {
            CharEscape::Quote => b"\\\"",
            CharEscape::ReverseSolidus => b"\\\\",
            CharEscape::Solidus => b"\\/",
            CharEscape::LineFeed => b"\\n",
            CharEscape::CarriageReturn => b"\\r",
            CharEscape::Tab => b"\\t",
            CharEscape::Backspace => b"\\u0008",
            CharEscape::FormFeed => b"\\u000c",
            CharEscape::AsciiControl(byte) => {
                return write!(writer, "\\u{byte:04x}");
            }
        };
        writer.write_all(escape)
    }
}

/// A float in `encoding/json`'s layout: the shortest digits that read back, plain between
/// `1e-6` and `1e21` and zero, and otherwise with an exponent that has a sign and no leading
/// zero.
fn go_float(value: f64) -> String {
    let magnitude = value.abs();
    let tiny = magnitude > 0.0 && magnitude < PLAIN_FROM;
    if !tiny && magnitude < PLAIN_BELOW {
        return format!("{value}");
    }
    let exponent = format!("{value:e}");
    match exponent.split_once('e') {
        Some((mantissa, power)) if !power.starts_with('-') => format!("{mantissa}e+{power}"),
        Some(_) | None => exponent,
    }
}

/// `value` as `encoding/json` would marshal it.
///
/// # Errors
///
/// What `serde_json` refuses to serialize.
pub fn to_vec<T: Serialize + ?Sized>(value: &T) -> Result<Vec<u8>, serde_json::Error> {
    let mut written = Vec::new();
    value.serialize(&mut Serializer::with_formatter(&mut written, GoFormatter))?;
    Ok(written)
}
