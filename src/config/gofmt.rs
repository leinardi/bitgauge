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

//! The text forms the configuration's problem lines and its effective list share with the Go
//! binary: durations as Go's `time.Duration` prints them (`1m30s`, `500ms`), floats as `%v`
//! prints them (`20.5`, `1e+06`), and quoted values as `strconv.Quote` writes them.

use std::fmt::Write as _;

use jiff::SignedDuration;

use super::printable::is_print;

const NANOS_PER_MICRO: u128 = 1_000;
const NANOS_PER_MILLI: u128 = 1_000_000;
const NANOS_PER_SECOND: u128 = 1_000_000_000;
const SECONDS_PER_MINUTE: u128 = 60;
const MINUTES_PER_HOUR: u128 = 60;

/// A duration in Go's `time.Duration` form: `0s`, `750ns`, `1.5µs`, `500ms`, `10s`, `1m30s`,
/// `2h0m0s`. Below a second the largest unit that keeps a whole part is used; from a second up
/// the hours and minutes are written in full.
pub(super) fn duration(value: SignedDuration) -> String {
    let nanos = value.as_nanos().unsigned_abs();
    let sign = if value.is_negative() { "-" } else { "" };
    if nanos == 0 {
        return "0s".to_owned();
    }
    if nanos < NANOS_PER_MICRO {
        return format!("{sign}{nanos}ns");
    }
    if nanos < NANOS_PER_MILLI {
        return format!("{sign}{}µs", fraction(nanos, NANOS_PER_MICRO));
    }
    if nanos < NANOS_PER_SECOND {
        return format!("{sign}{}ms", fraction(nanos, NANOS_PER_MILLI));
    }
    let seconds = nanos / NANOS_PER_SECOND;
    let with_fraction = fraction(
        seconds % SECONDS_PER_MINUTE * NANOS_PER_SECOND + nanos % NANOS_PER_SECOND,
        NANOS_PER_SECOND,
    );
    let minutes = seconds / SECONDS_PER_MINUTE;
    let hours = minutes / MINUTES_PER_HOUR;
    if hours > 0 {
        format!(
            "{sign}{hours}h{}m{with_fraction}s",
            minutes % MINUTES_PER_HOUR
        )
    } else if minutes > 0 {
        format!("{sign}{minutes}m{with_fraction}s")
    } else {
        format!("{sign}{with_fraction}s")
    }
}

/// `value / unit` with its fraction, trailing zeros dropped: `1500 / 1000` is `1.5`.
fn fraction(value: u128, unit: u128) -> String {
    let whole = value / unit;
    let rest = value % unit;
    if rest == 0 {
        return whole.to_string();
    }
    let width = unit.ilog10() as usize;
    let digits = format!("{rest:0width$}");
    format!("{whole}.{}", digits.trim_end_matches('0'))
}

/// The smallest decimal exponent `%v` writes in positional form; below it, `1e-05`.
const MIN_POSITIONAL_EXPONENT: i32 = -4;
/// The exponent from which `%v` writes `1e+06` rather than `1000000`.
const MAX_POSITIONAL_EXPONENT: i32 = 6;

/// A float as Go's `%v` writes it: the shortest digits that read back the same, positional
/// unless the decimal exponent is below -4 or at least 6, where it is `1e+06`, `1.5e-05`.
/// `NaN`, `+Inf` and `-Inf` are Go's spellings. Rust breaks an exact shortest-digit tie upward
/// where Go rounds to even, which no configuration value reaches.
pub(super) fn float(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_owned();
    }
    if value.is_infinite() {
        return if value > 0.0 { "+Inf" } else { "-Inf" }.to_owned();
    }
    let scientific = format!("{value:e}");
    let Some((mantissa, exponent)) = scientific.split_once('e') else {
        return value.to_string();
    };
    let exponent: i32 = exponent.parse().unwrap_or_default();
    if (MIN_POSITIONAL_EXPONENT..MAX_POSITIONAL_EXPONENT).contains(&exponent) {
        return value.to_string();
    }
    let sign = if exponent < 0 { '-' } else { '+' };
    format!("{mantissa}e{sign}{:02}", exponent.unsigned_abs())
}

/// A string quoted as `strconv.Quote` quotes it: printable characters as they are, the C escapes
/// for the usual controls, `\x` for other bytes below 0x80 and `\u` or `\U` for anything else
/// Go does not print.
pub(super) fn quote(text: &str) -> String {
    let mut quoted = String::with_capacity(text.len() + 2);
    quoted.push('"');
    for character in text.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\u{7}' => quoted.push_str("\\a"),
            '\u{8}' => quoted.push_str("\\b"),
            '\u{c}' => quoted.push_str("\\f"),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            '\u{b}' => quoted.push_str("\\v"),
            printable if is_print(printable) => quoted.push(printable),
            ascii if ascii.is_ascii() => {
                let _ = write!(quoted, "\\x{:02x}", u32::from(ascii));
            }
            narrow if u32::from(narrow) < 0x1_0000 => {
                let _ = write!(quoted, "\\u{:04x}", u32::from(narrow));
            }
            wide => {
                let _ = write!(quoted, "\\U{:08x}", u32::from(wide));
            }
        }
    }
    quoted.push('"');
    quoted
}
