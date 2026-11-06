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

//! How the configuration's problem lines and effective list write a value: a quoted text, a float
//! and a duration, in plain Rust formatting (`{:?}`, `f64`'s `Display`, jiff's friendly duration).

use jiff::SignedDuration;

/// `text` quoted and escaped as Rust's `Debug` does (`"a\"b"`, `"\u{7f}"`).
pub(super) fn quote(text: &str) -> String {
    format!("{text:?}")
}

/// `value` as `f64`'s `Display` writes it: `0.5`, `1`, `100`, never an exponent.
pub(super) fn float(value: f64) -> String {
    value.to_string()
}

/// `value` as jiff's friendly duration form: `1m 30s`, `500ms`, `2h`.
pub(super) fn duration(value: SignedDuration) -> String {
    format!("{value:#}")
}
