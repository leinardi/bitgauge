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

//! Go's output formats, where the harness's reports and messages carry them: `encoding/json`'s
//! indented output and syntax errors, `strconv`'s quoting and parse errors, `time.Duration`'s
//! and RFC 3339 text, and `fmt`'s map layout. The Go harness wrote report.json, report.md and the
//! verdict lines through these; the port keeps their bytes (the rust-port-go skill, section 2).

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::io::{self, Write};
use std::path::Path;
use std::time::Duration;

use jiff::Timestamp;
use jiff::tz::TimeZone;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::ser::{CharEscape, Formatter, PrettyFormatter};

/// The smallest magnitude `encoding/json` writes without an exponent.
const PLAIN_FROM: f64 = 1e-6;
/// The magnitude from which `encoding/json` writes an exponent again.
const PLAIN_BELOW: f64 = 1e21;

/// `bufio.Scanner`'s default maximum token size: a line this long or longer stops the scan.
const MAX_SCAN_TOKEN: usize = 64 * 1024;

/// A float's shortest decimal digits, without a sign or trailing zeros, and the power of ten of
/// the first digit. Rust breaks an exact tie of two shortest candidates upward, Go to even: the
/// digit count comes from the shortest form and the digits from the exact rounding at that count.
fn shortest_digits(value: f64) -> (String, i32) {
    let magnitude = value.abs();
    let shortest = format!("{magnitude:e}");
    let count = shortest.split('e').next().map_or(1, |mantissa| {
        mantissa.bytes().filter(u8::is_ascii_digit).count()
    });
    let exact = format!("{magnitude:.prec$e}", prec = count.saturating_sub(1));
    let (mantissa, exponent) = exact.split_once('e').unwrap_or((exact.as_str(), "0"));
    let mut digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    (digits, exponent.parse().unwrap_or(0))
}

/// The digits laid out without an exponent, as Go's `'f'` format with precision -1.
fn plain_layout(digits: &str, exponent: i32) -> String {
    if digits == "0" {
        return "0".to_owned();
    }
    let mut out = String::new();
    if exponent < 0 {
        out.push_str("0.");
        for _ in 0..(-exponent - 1) {
            out.push('0');
        }
        out.push_str(digits);
        return out;
    }
    let whole = usize::try_from(exponent).unwrap_or(0) + 1;
    if digits.len() <= whole {
        out.push_str(digits);
        for _ in digits.len()..whole {
            out.push('0');
        }
    } else {
        out.push_str(&digits[..whole]);
        out.push('.');
        out.push_str(&digits[whole..]);
    }
    out
}

/// `strconv.FormatFloat(value, 'f', -1, 64)`: the shortest digits that read back, never with an
/// exponent.
#[must_use]
pub fn format_float_plain(value: f64) -> String {
    let (digits, exponent) = shortest_digits(value);
    let sign = if value.is_sign_negative() { "-" } else { "" };
    format!("{sign}{}", plain_layout(&digits, exponent))
}

/// A float as `encoding/json` writes it: plain between `1e-6` and `1e21` and at zero, and
/// otherwise with an exponent that carries a sign and no leading zero (`1e+21`, `1e-7`).
#[must_use]
pub fn format_float_json(value: f64) -> String {
    let magnitude = value.abs();
    if magnitude == 0.0 || (PLAIN_FROM..PLAIN_BELOW).contains(&magnitude) {
        return format_float_plain(value);
    }
    let (digits, exponent) = shortest_digits(value);
    let sign = if value.is_sign_negative() { "-" } else { "" };
    let mantissa = if digits.len() > 1 {
        format!("{}.{}", &digits[..1], &digits[1..])
    } else {
        digits
    };
    let exponent_sign = if exponent < 0 { '-' } else { '+' };
    format!(
        "{sign}{mantissa}e{exponent_sign}{}",
        exponent.unsigned_abs()
    )
}

/// `serde_json`'s pretty formatter with two-space indentation, as `json.MarshalIndent(v, "", "  ")`
/// lays it out, with Go's escapes and float layout.
struct GoFormatter {
    pretty: PrettyFormatter<'static>,
}

impl Formatter for GoFormatter {
    fn write_f64<W: ?Sized + Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        writer.write_all(format_float_json(value).as_bytes())
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

    fn begin_array<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.begin_array(writer)
    }

    fn end_array<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.end_array(writer)
    }

    fn begin_array_value<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        first: bool,
    ) -> io::Result<()> {
        self.pretty.begin_array_value(writer, first)
    }

    fn end_array_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.end_array_value(writer)
    }

    fn begin_object<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.begin_object(writer)
    }

    fn end_object<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.end_object(writer)
    }

    fn begin_object_key<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        first: bool,
    ) -> io::Result<()> {
        self.pretty.begin_object_key(writer, first)
    }

    fn end_object_key<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.end_object_key(writer)
    }

    fn begin_object_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.begin_object_value(writer)
    }

    fn end_object_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.pretty.end_object_value(writer)
    }
}

/// `value` as `json.MarshalIndent(value, "", "  ")` writes it, without a trailing newline.
///
/// # Errors
///
/// What `serde_json` refuses to serialize.
pub fn to_json_indent<T: Serialize + ?Sized>(value: &T) -> Result<String, serde_json::Error> {
    let mut written = Vec::new();
    let formatter = GoFormatter {
        pretty: PrettyFormatter::with_indent(b"  "),
    };
    value.serialize(&mut serde_json::Serializer::with_formatter(
        &mut written,
        formatter,
    ))?;
    Ok(String::from_utf8_lossy(&written).into_owned())
}

/// `json.Unmarshal` into `T`: a syntax error anywhere in the input reads as Go's scanner words it,
/// before any field is decoded, as Go checks the whole input first. Invalid UTF-8 is read as
/// U+FFFD, as Go's decoder reads it inside strings.
///
/// A type mismatch keeps `serde_json`'s words, and keys match exactly where Go also matches them
/// case-insensitively; every input the harness reads comes from a tool that writes its keys one
/// way.
///
/// # Errors
///
/// The syntax error in Go's words, or `serde_json`'s decoding error.
pub fn unmarshal<T: DeserializeOwned>(data: &[u8]) -> Result<T, String> {
    if let Some(message) = json_syntax_error(data) {
        return Err(message);
    }
    serde_json::from_str(&String::from_utf8_lossy(data)).map_err(|error| error.to_string())
}

/// A field that reads JSON `null` as its zero value, as `encoding/json` leaves a field alone on
/// `null`.
pub(crate) fn nullable<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

/// Go's first syntax error in `data`, as `json.Unmarshal` reports it, or `None` for valid JSON.
#[must_use]
pub fn json_syntax_error(data: &[u8]) -> Option<String> {
    let mut checker = SyntaxChecker { data, pos: 0 };
    checker.document().err()
}

/// A recursive-descent reading of `encoding/json`'s scanner: the same states, the same words.
struct SyntaxChecker<'data> {
    data: &'data [u8],
    pos: usize,
}

const UNEXPECTED_END: &str = "unexpected end of JSON input";

impl SyntaxChecker<'_> {
    fn peek(&self) -> Result<u8, String> {
        self.data
            .get(self.pos)
            .copied()
            .ok_or_else(|| UNEXPECTED_END.to_owned())
    }

    fn skip_space(&mut self) {
        while matches!(self.data.get(self.pos), Some(b' ' | b'\t' | b'\r' | b'\n')) {
            self.pos += 1;
        }
    }

    fn invalid(byte: u8, context: &str) -> String {
        format!("invalid character {} {context}", quote_char(byte))
    }

    fn document(&mut self) -> Result<(), String> {
        self.skip_space();
        self.value()?;
        self.skip_space();
        match self.data.get(self.pos) {
            None => Ok(()),
            Some(&byte) => Err(Self::invalid(byte, "after top-level value")),
        }
    }

    fn value(&mut self) -> Result<(), String> {
        match self.peek()? {
            b'{' => self.object(),
            b'[' => self.array(),
            b'"' => self.string(),
            b'-' | b'0'..=b'9' => self.number(),
            b't' => self.literal("true"),
            b'f' => self.literal("false"),
            b'n' => self.literal("null"),
            byte => Err(Self::invalid(byte, "looking for beginning of value")),
        }
    }

    fn object(&mut self) -> Result<(), String> {
        self.pos += 1;
        self.skip_space();
        if self.peek()? == b'}' {
            self.pos += 1;
            return Ok(());
        }
        loop {
            let byte = self.peek()?;
            if byte != b'"' {
                return Err(Self::invalid(
                    byte,
                    "looking for beginning of object key string",
                ));
            }
            self.string()?;
            self.skip_space();
            let byte = self.peek()?;
            if byte != b':' {
                return Err(Self::invalid(byte, "after object key"));
            }
            self.pos += 1;
            self.skip_space();
            self.value()?;
            self.skip_space();
            match self.peek()? {
                b',' => {
                    self.pos += 1;
                    self.skip_space();
                }
                b'}' => {
                    self.pos += 1;
                    return Ok(());
                }
                byte => return Err(Self::invalid(byte, "after object key:value pair")),
            }
        }
    }

    fn array(&mut self) -> Result<(), String> {
        self.pos += 1;
        self.skip_space();
        if self.peek()? == b']' {
            self.pos += 1;
            return Ok(());
        }
        loop {
            self.value()?;
            self.skip_space();
            match self.peek()? {
                b',' => {
                    self.pos += 1;
                    self.skip_space();
                }
                b']' => {
                    self.pos += 1;
                    return Ok(());
                }
                byte => return Err(Self::invalid(byte, "after array element")),
            }
        }
    }

    fn string(&mut self) -> Result<(), String> {
        self.pos += 1;
        loop {
            let byte = self.peek()?;
            self.pos += 1;
            match byte {
                b'"' => return Ok(()),
                b'\\' => {
                    let escape = self.peek()?;
                    self.pos += 1;
                    match escape {
                        b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't' => {}
                        b'u' => {
                            for _ in 0..4 {
                                let hex = self.peek()?;
                                if !hex.is_ascii_hexdigit() {
                                    return Err(Self::invalid(
                                        hex,
                                        "in \\u hexadecimal character escape",
                                    ));
                                }
                                self.pos += 1;
                            }
                        }
                        other => return Err(Self::invalid(other, "in string escape code")),
                    }
                }
                control if control < 0x20 => {
                    return Err(Self::invalid(control, "in string literal"));
                }
                _ => {}
            }
        }
    }

    fn digits(&mut self) {
        while matches!(self.data.get(self.pos), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
    }

    fn number(&mut self) -> Result<(), String> {
        if self.peek()? == b'-' {
            self.pos += 1;
            let byte = self.peek()?;
            if !byte.is_ascii_digit() {
                return Err(Self::invalid(byte, "in numeric literal"));
            }
        }
        if self.peek()? == b'0' {
            self.pos += 1;
        } else {
            self.digits();
        }
        if self.data.get(self.pos) == Some(&b'.') {
            self.pos += 1;
            let byte = self.peek()?;
            if !byte.is_ascii_digit() {
                return Err(Self::invalid(
                    byte,
                    "after decimal point in numeric literal",
                ));
            }
            self.digits();
        }
        if matches!(self.data.get(self.pos), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek()?, b'+' | b'-') {
                self.pos += 1;
            }
            let byte = self.peek()?;
            if !byte.is_ascii_digit() {
                return Err(Self::invalid(byte, "in exponent of numeric literal"));
            }
            self.digits();
        }
        Ok(())
    }

    fn literal(&mut self, word: &str) -> Result<(), String> {
        self.pos += 1;
        for expected in word.bytes().skip(1) {
            let byte = self.peek()?;
            if byte != expected {
                return Err(Self::invalid(
                    byte,
                    &format!("in literal {word} (expecting {})", quote_char(expected)),
                ));
            }
            self.pos += 1;
        }
        Ok(())
    }
}

/// `encoding/json`'s `quoteChar`: a byte read as the code point of the same number, quoted in
/// single quotes.
fn quote_char(byte: u8) -> String {
    match byte {
        b'\'' => "'\\''".to_owned(),
        b'"' => "'\"'".to_owned(),
        _ => {
            let quoted = quote(&char::from(byte).to_string());
            format!("'{}'", &quoted[1..quoted.len() - 1])
        }
    }
}

/// Whether Go's `unicode.IsPrint` holds, outside the ASCII range read from Rust's own tables:
/// control, separator, format and private-use code points are not printable. Go also refuses an
/// unassigned code point, which Rust's standard library cannot tell apart; no harness text
/// carries one.
fn is_print(character: char) -> bool {
    if character.is_ascii() {
        return (' '..='~').contains(&character);
    }
    let code = u32::from(character);
    let format = matches!(
        code,
        0xAD | 0x600..=0x605
            | 0x61C
            | 0x6DD
            | 0x70F
            | 0x180E
            | 0x200B..=0x200F
            | 0x202A..=0x202E
            | 0x2060..=0x2064
            | 0x2066..=0x206F
            | 0xFEFF
            | 0xFFF9..=0xFFFB
    );
    let private = matches!(code, 0xE000..=0xF8FF | 0xF_0000..=0x10_FFFF);
    let noncharacter = (0xFDD0..=0xFDEF).contains(&code) || code & 0xFFFE == 0xFFFE;
    !(character.is_control() || character.is_whitespace() || format || private || noncharacter)
}

/// `strconv.Quote`: double quotes, with Go's escapes for what is not printable.
#[must_use]
pub fn quote(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            printable if is_print(printable) => out.push(printable),
            '\u{7}' => out.push_str("\\a"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{b}' => out.push_str("\\v"),
            other => {
                let code = u32::from(other);
                if code < 0x20 || code == 0x7F {
                    let _ = write!(out, "\\x{code:02x}");
                } else if code < 0x1_0000 {
                    let _ = write!(out, "\\u{code:04x}");
                } else {
                    let _ = write!(out, "\\U{code:08x}");
                }
            }
        }
    }
    out.push('"');
    out
}

/// `strconv.ParseInt(text, 10, 64)` (`function` names the caller in the error, as Go's
/// `strconv.Atoi` does): an optional sign, then ASCII digits only; out of range is reported at the
/// digit that overflows, before a later invalid byte.
///
/// # Errors
///
/// Go's `strconv.NumError` text: `strconv.ParseInt: parsing "x": invalid syntax` or
/// `value out of range`.
pub fn parse_int(function: &str, text: &str) -> Result<i64, String> {
    let (negative, digits) = match text.as_bytes().first() {
        Some(b'+') => (false, &text[1..]),
        Some(b'-') => (true, &text[1..]),
        _ => (false, text),
    };
    let magnitude = parse_digits(function, text, digits)?;
    let limit = if negative {
        i64::MIN.unsigned_abs()
    } else {
        i64::MAX.unsigned_abs()
    };
    if magnitude > limit {
        return Err(num_error(function, text, "value out of range"));
    }
    if negative {
        Ok(0_i64.wrapping_sub_unsigned(magnitude))
    } else {
        i64::try_from(magnitude).map_err(|_| num_error(function, text, "value out of range"))
    }
}

/// `strconv.ParseUint(text, 10, 64)`: ASCII digits only, without a sign.
///
/// # Errors
///
/// Go's `strconv.NumError` text, as `parse_int` gives it.
pub fn parse_uint(text: &str) -> Result<u64, String> {
    parse_digits("ParseUint", text, text)
}

/// The digits of a base-10 integer, with Go's order of errors.
fn parse_digits(function: &str, text: &str, digits: &str) -> Result<u64, String> {
    if digits.is_empty() {
        return Err(num_error(function, text, "invalid syntax"));
    }
    let mut value: u64 = 0;
    for byte in digits.bytes() {
        if !byte.is_ascii_digit() {
            return Err(num_error(function, text, "invalid syntax"));
        }
        value = value
            .checked_mul(10)
            .and_then(|tens| tens.checked_add(u64::from(byte - b'0')))
            .ok_or_else(|| num_error(function, text, "value out of range"))?;
    }
    Ok(value)
}

/// `strconv.ParseFloat(text, 64)` for decimal input: what Rust reads, less a signed NaN, which Go
/// refuses, and with an overflow to infinity reported as Go reports it. Go also reads hex floats
/// and `_` after a base prefix; no harness input carries them.
///
/// # Errors
///
/// Go's `strconv.NumError` text.
pub fn parse_float(text: &str) -> Result<f64, String> {
    let unsigned = text.trim_start_matches(['+', '-']);
    let signed_nan = unsigned.len() != text.len() && unsigned.eq_ignore_ascii_case("nan");
    let value: f64 = match text.parse() {
        Ok(value) if !signed_nan => value,
        Ok(_) | Err(_) => return Err(num_error("ParseFloat", text, "invalid syntax")),
    };
    let infinity_literal =
        unsigned.eq_ignore_ascii_case("inf") || unsigned.eq_ignore_ascii_case("infinity");
    if value.is_infinite() && !infinity_literal {
        return Err(num_error("ParseFloat", text, "value out of range"));
    }
    Ok(value)
}

fn num_error(function: &str, text: &str, reason: &str) -> String {
    format!("strconv.{function}: parsing {}: {reason}", quote(text))
}

/// `time.Duration.String` for a non-negative duration: `0s`, `500ms`, `1.5µs`, `2s`, `1m30s`.
#[must_use]
pub fn duration(value: Duration) -> String {
    let nanos = u64::try_from(value.as_nanos()).unwrap_or(u64::MAX);
    if nanos == 0 {
        return "0s".to_owned();
    }
    if nanos < 1_000_000_000 {
        let (unit, precision) = if nanos < 1_000 {
            ("ns", 0)
        } else if nanos < 1_000_000 {
            ("µs", 3)
        } else {
            ("ms", 6)
        };
        let (whole, fraction) = split_fraction(nanos, precision);
        return format!("{whole}{fraction}{unit}");
    }
    let (seconds, fraction) = split_fraction(nanos, 9);
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let mut out = String::new();
    if hours > 0 {
        let _ = write!(out, "{hours}h");
    }
    if minutes > 0 {
        let _ = write!(out, "{}m", minutes % 60);
    }
    let _ = write!(out, "{}{fraction}s", seconds % 60);
    out
}

/// Go's `fmtFrac`: the value's whole part, and its last `precision` digits as a fraction without
/// trailing zeros, empty when they are all zero.
fn split_fraction(value: u64, precision: u32) -> (u64, String) {
    let divisor = 10_u64.pow(precision);
    let mut digits = format!("{:0width$}", value % divisor, width = precision as usize);
    while digits.ends_with('0') {
        digits.pop();
    }
    let fraction = if digits.is_empty() {
        digits
    } else {
        format!(".{digits}")
    };
    (value / divisor, fraction)
}

/// Go's zero `time.Time`, 0001-01-01T00:00:00Z, which a report's unset finish time reads as.
#[must_use]
pub fn zero_time() -> Timestamp {
    Timestamp::new(-62_135_596_800, 0).unwrap_or(Timestamp::UNIX_EPOCH)
}

/// A UTC instant in Go's `time.RFC3339` layout: `2026-10-09T12:30:00Z`.
#[must_use]
pub fn rfc3339(instant: Timestamp) -> String {
    instant
        .to_zoned(TimeZone::UTC)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

/// A UTC instant as `time.Time`'s JSON form, `time.RFC3339Nano`: the fraction without trailing
/// zeros, none at all on a whole second.
#[must_use]
pub fn rfc3339_nano(instant: Timestamp) -> String {
    let zoned = instant.to_zoned(TimeZone::UTC);
    let (_, fraction) = split_fraction(u64::try_from(zoned.subsec_nanosecond()).unwrap_or(0), 9);
    format!("{}{fraction}Z", zoned.strftime("%Y-%m-%dT%H:%M:%S"))
}

/// Serializes a `Timestamp` field as `time.Time` marshals itself.
pub(crate) fn serialize_time<S: Serializer>(
    instant: &Timestamp,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(&rfc3339_nano(*instant))
}

/// A counter map as `fmt`'s `%v` prints it: `map[dns:0 egress:1]`, its keys sorted.
#[must_use]
pub fn counters(counters: &BTreeMap<String, u64>) -> String {
    let entries: Vec<String> = counters
        .iter()
        .map(|(name, packets)| format!("{name}:{packets}"))
        .collect();
    format!("map[{}]", entries.join(" "))
}

/// `bufio.Scanner`'s lines with its default buffer: split at `\n`, one trailing `\r` dropped, a
/// last line without a newline kept when not empty, and the scan stopped, silently as the Go
/// callers left it, at a line of 64 KiB or more.
#[must_use]
pub fn scan_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        let (line, next) = match rest.find('\n') {
            Some(end) => (&rest[..end], &rest[end + 1..]),
            None => (rest, ""),
        };
        if line.len() >= MAX_SCAN_TOKEN {
            break;
        }
        lines.push(line.strip_suffix('\r').unwrap_or(line));
        rest = next;
    }
    lines
}

/// An I/O error as Go's `*fs.PathError` prints it: `open /path: no such file or directory`.
#[must_use]
pub fn path_error(operation: &str, path: &Path, error: &io::Error) -> String {
    let reason = error.raw_os_error().map_or_else(
        || error.to_string(),
        |code| {
            let text = io::Error::from_raw_os_error(code).to_string();
            let text = text
                .split(" (os error")
                .next()
                .unwrap_or(text.as_str())
                .to_owned();
            let mut characters = text.chars();
            characters.next().map_or_else(String::new, |first| {
                first.to_lowercase().chain(characters).collect()
            })
        },
    );
    format!("{operation} {}: {reason}", path.display())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Go's own outputs for the same values, from a go1.26 scratch program.
    #[test]
    fn formats_follow_go() {
        let mut failures = Vec::new();
        for (value, want) in [
            (0.0, "0"),
            (-0.0, "-0"),
            (20.0, "20"),
            (5.13, "5.13"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (1.5e-7, "1.5e-7"),
            (123_456_789.0, "123456789"),
            (95_640_686.922_060_77, "95640686.92206077"),
            (0.000_001, "0.000001"),
            (2.5e-10, "2.5e-10"),
        ] {
            let got = format_float_json(value);
            if got != want {
                failures.push(format!("format_float_json({value:e}) = {got}, want {want}"));
            }
        }
        for (value, want) in [
            (Duration::ZERO, "0s"),
            (Duration::from_secs(2), "2s"),
            (Duration::from_millis(2500), "2.5s"),
            (Duration::from_millis(500), "500ms"),
            (Duration::from_micros(1500), "1.5ms"),
            (Duration::from_nanos(1500), "1.5µs"),
            (Duration::from_nanos(15), "15ns"),
            (Duration::from_secs(90), "1m30s"),
            (Duration::from_secs(7200), "2h0m0s"),
        ] {
            let got = duration(value);
            if got != want {
                failures.push(format!("duration({value:?}) = {got}, want {want}"));
            }
        }
        for (text, want) in [
            ("many", "\"many\""),
            ("a\"b\\c", "\"a\\\"b\\\\c\""),
            ("tab\there", "\"tab\\there\""),
            ("\u{1}", "\"\\x01\""),
            ("≠ ±", "\"≠ ±\""),
            ("\u{a0}", "\"\\u00a0\""),
        ] {
            let got = quote(text);
            if got != want {
                failures.push(format!("quote({text:?}) = {got}, want {want}"));
            }
        }
        for (text, want) in [
            ("", Err("strconv.ParseInt: parsing \"\": invalid syntax")),
            ("+5", Ok(5)),
            ("-9223372036854775808", Ok(i64::MIN)),
            (
                "9223372036854775808",
                Err("strconv.ParseInt: parsing \"9223372036854775808\": value out of range"),
            ),
            (
                "99999999999999999999x",
                Err("strconv.ParseInt: parsing \"99999999999999999999x\": value out of range"),
            ),
        ] {
            let got = parse_int("ParseInt", text);
            if got != want.map_err(str::to_owned) {
                failures.push(format!("parse_int({text:?}) = {got:?}, want {want:?}"));
            }
        }
        if parse_uint("+5").is_ok() {
            failures.push("parse_uint read a sign".to_owned());
        }
        for (text, ok) in [
            ("1.5", true),
            (".5", true),
            ("+nan", false),
            ("1e400", false),
        ] {
            if parse_float(text).is_ok() != ok {
                failures.push(format!("parse_float({text:?}) ok != {ok}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go's `json.Unmarshal` syntax errors for the same inputs, from a go1.26 scratch program.
    #[test]
    fn syntax_errors_follow_go() {
        let mut failures = Vec::new();
        for (input, want) in [
            ("", Some("unexpected end of JSON input")),
            ("{", Some("unexpected end of JSON input")),
            (
                "not json",
                Some("invalid character 'o' in literal null (expecting 'u')"),
            ),
            (
                "Error: no server",
                Some("invalid character 'E' looking for beginning of value"),
            ),
            (
                "[1,]",
                Some("invalid character ']' looking for beginning of value"),
            ),
            ("{\"a\" 1}", Some("invalid character '1' after object key")),
            (
                "{\"a\":1 \"b\"}",
                Some("invalid character '\"' after object key:value pair"),
            ),
            ("[1 2]", Some("invalid character '2' after array element")),
            (
                "{1:2}",
                Some("invalid character '1' looking for beginning of object key string"),
            ),
            ("1 x", Some("invalid character 'x' after top-level value")),
            ("01", Some("invalid character '1' after top-level value")),
            ("-x", Some("invalid character 'x' in numeric literal")),
            (
                "1.x",
                Some("invalid character 'x' after decimal point in numeric literal"),
            ),
            (
                "1ex",
                Some("invalid character 'x' in exponent of numeric literal"),
            ),
            (
                "\"\\x\"",
                Some("invalid character 'x' in string escape code"),
            ),
            ("\"\t\"", Some("invalid character '\\t' in string literal")),
            ("[1e5, -0.5, true, false, null, \"\\u00e9\"]", None),
        ] {
            let got = json_syntax_error(input.as_bytes());
            if got.as_deref() != want {
                failures.push(format!("{input:?}: {got:?}, want {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn scan_lines_follow_bufio() {
        assert_eq!(scan_lines("a\r\nb\n\nc"), vec!["a", "b", "", "c"]);
        assert_eq!(scan_lines("a\n"), vec!["a"]);
        let long = format!("a\n{}\nb\n", "x".repeat(MAX_SCAN_TOKEN));
        assert_eq!(scan_lines(&long), vec!["a"]);
    }
}
