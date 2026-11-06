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

//! A configuration duration in Go's `time.Duration` text (`1m30s`, `500ms`), which the problem
//! lines and the effective list share with the Go binary. The configuration's floats and quoted
//! values are `go_compat`'s `float::format_g` (`%v`) and `quote::quote` (`strconv.Quote`), called
//! where they are written.

use jiff::SignedDuration;

/// Nanoseconds in an hour.
const NANOS_PER_HOUR: u128 = 3_600_000_000_000;

/// `value` as Go's `time.Duration.String` writes it: `0s`, `750ns`, `1.5µs`, `500ms`, `1m30s`,
/// `2h0m0s`. jiff reads durations up to `i64` seconds, beyond Go's `i64` nanoseconds; such a
/// duration is printed in Go's `<h>h<m>m<s>s` form, though Go itself cannot hold the value.
pub(super) fn duration(value: SignedDuration) -> String {
    if let Ok(nanos) = i64::try_from(value.as_nanos()) {
        return go_compat::duration::format(nanos);
    }
    let magnitude = value.as_nanos().unsigned_abs();
    // An hour and the rest of one fit in an i64, and Go writes them as `1h<m>m<s>s`.
    let rest = i64::try_from(magnitude % NANOS_PER_HOUR + NANOS_PER_HOUR).unwrap_or(i64::MAX);
    let text = go_compat::duration::format(rest);
    let sign = if value.is_negative() { "-" } else { "" };
    format!(
        "{sign}{}h{}",
        magnitude / NANOS_PER_HOUR,
        text.strip_prefix("1h").unwrap_or(&text)
    )
}
