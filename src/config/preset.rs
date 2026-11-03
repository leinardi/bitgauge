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

//! The presets of measurement.md section 8.5.

use jiff::SignedDuration;

use super::{STREAMS_MODE_AUTO, STREAMS_MODE_FIXED};

/// The values of a preset that an empty `test_defaults` key stands for: the download and upload
/// minimum and maximum durations, the stream mode an empty `streams.mode` means, and the idle
/// ping count that `ping_count` 0 means. Continuous is not bounded: it has no minimum and no
/// maximum, its durations are zero and its duration keys are ignored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PresetValues {
    /// The stream mode an empty `test_defaults.streams.mode` means.
    pub streams_mode: &'static str,
    /// The download minimum and maximum.
    pub download: [SignedDuration; 2],
    /// The upload minimum and maximum.
    pub upload: [SignedDuration; 2],
    /// The idle ping count `ping_count` 0 means.
    pub ping_count: i64,
    /// Whether the preset has a minimum and a maximum.
    pub bounded: bool,
}

const fn seconds(low: i64, high: i64) -> [SignedDuration; 2] {
    [
        SignedDuration::from_secs(low),
        SignedDuration::from_secs(high),
    ]
}

/// The values of the named preset, or `None` for a preset this release does not have.
#[must_use]
pub fn preset(name: &str) -> Option<PresetValues> {
    match name {
        "quick" => Some(PresetValues {
            streams_mode: STREAMS_MODE_FIXED,
            download: seconds(5, 10),
            upload: seconds(5, 10),
            ping_count: 10,
            bounded: true,
        }),
        "standard" => Some(PresetValues {
            streams_mode: STREAMS_MODE_AUTO,
            download: seconds(10, 20),
            upload: seconds(15, 25),
            ping_count: 20,
            bounded: true,
        }),
        "extended" => Some(PresetValues {
            streams_mode: STREAMS_MODE_AUTO,
            download: seconds(20, 40),
            upload: seconds(20, 40),
            ping_count: 50,
            bounded: true,
        }),
        "continuous" => Some(PresetValues {
            streams_mode: STREAMS_MODE_AUTO,
            download: [SignedDuration::ZERO; 2],
            upload: [SignedDuration::ZERO; 2],
            ping_count: 20,
            bounded: false,
        }),
        _ => None,
    }
}
