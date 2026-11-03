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

//! The process epoch (wire-protocol.md section 4) and the 100 ms server grid (measurement.md
//! section 7.3).

use std::time::Duration;

use tokio::time::Instant;

use super::random::RandomError;
use crate::clock::Clock;

/// The server grid's cell length in milliseconds; there is no coarsening.
pub const BUCKET_MS: i64 = 100;
const CELL: Duration = Duration::from_millis(100);

/// The entropy of the epoch identifier: 72 bits, 12 characters of base64url.
const EPOCH_BYTES: usize = 9;
const BASE64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// One run of the process. The engine compares `id` with the one `GET /info` reported at test
/// start to detect a restart, and `grid_offset` is K, the random whole number of 100 ms cells
/// that shifts the upload grid's origin away from process start, so that grid indices reveal
/// neither uptime nor wall-clock time (backend.md section 2.2). Both are drawn once at startup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Epoch {
    /// The identifier: 12 base64url characters.
    pub id: String,
    /// K, in `[0, 2^32)`.
    pub grid_offset: i64,
}

impl Epoch {
    /// A fresh epoch from the system random source.
    ///
    /// # Errors
    ///
    /// The system random source failed.
    pub fn new() -> Result<Self, RandomError> {
        let mut entropy = [0; EPOCH_BYTES + 4];
        getrandom::fill(&mut entropy)?;
        let (id, offset) = entropy.split_at(EPOCH_BYTES);
        let offset: [u8; 4] = offset.try_into().unwrap_or_default();
        Ok(Self {
            id: base64url(id),
            grid_offset: i64::from(u32::from_be_bytes(offset)),
        })
    }
}

/// Unpadded base64url, as Go's `base64.RawURLEncoding`.
fn base64url(data: &[u8]) -> String {
    let mut text = String::with_capacity(data.len().div_ceil(3) * 4);
    for group in data.chunks(3) {
        let bits = group
            .iter()
            .enumerate()
            .fold(0_u32, |bits, (index, &byte)| {
                bits | u32::from(byte) << (16 - 8 * index)
            });
        for sextet in 0..=group.len() {
            let index = (bits >> (18 - 6 * sextet)) & 0x3f;
            text.push(char::from(BASE64URL[index as usize]));
        }
    }
    text
}

/// The global 100 ms server grid. Its timeline is the clock's monotonic time since the grid was
/// made at startup, shifted by `offset` whole cells. Every request shares the same cell
/// boundaries; the grid itself holds no counts.
#[derive(Debug)]
pub struct Grid {
    clock: Box<dyn Clock>,
    origin: Instant,
    offset: i64,
}

impl Grid {
    /// The grid, starting now, shifted by `offset_cells` cells (the epoch's K).
    #[must_use]
    pub fn new(clock: impl Clock, offset_cells: i64) -> Self {
        let origin = clock.now();
        Self {
            clock: Box::new(clock),
            origin,
            offset: offset_cells,
        }
    }

    /// The grid's clock reading.
    #[must_use]
    pub fn now(&self) -> Instant {
        self.clock.now()
    }

    /// `instant` on the grid's timeline, in whole milliseconds.
    #[must_use]
    pub fn ms(&self, instant: Instant) -> i64 {
        let elapsed = instant.saturating_duration_since(self.origin).as_millis();
        i64::try_from(elapsed)
            .unwrap_or(i64::MAX)
            .saturating_add(self.offset.saturating_mul(BUCKET_MS))
    }

    /// The index of the cell `instant` falls in: `floor(ms / 100)`, so a cell's start is
    /// inclusive and its end exclusive.
    #[must_use]
    pub fn cell(&self, instant: Instant) -> i64 {
        let elapsed = instant.saturating_duration_since(self.origin).as_nanos() / CELL.as_nanos();
        i64::try_from(elapsed)
            .unwrap_or(i64::MAX)
            .saturating_add(self.offset)
    }
}
