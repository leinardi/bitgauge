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

//! The epoch and the grid.

use std::time::Duration;

use tokio::time::advance;

use crate::clock::{Clock as _, TokioClock};
use crate::handlers::{Epoch, Grid};

/// Decodes unpadded base64url, for the check only.
fn decode_base64url(text: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let sextets: Vec<u32> = text
        .bytes()
        .map(|byte| {
            ALPHABET
                .iter()
                .position(|&letter| letter == byte)
                .and_then(|index| u32::try_from(index).ok())
        })
        .collect::<Option<_>>()?;
    let mut bytes = Vec::new();
    for group in sextets.chunks(4) {
        let bits = group
            .iter()
            .enumerate()
            .fold(0, |bits, (index, sextet)| bits | sextet << (18 - 6 * index));
        for index in 0..group.len() - 1 {
            bytes.push(u8::try_from((bits >> (16 - 8 * index)) & 0xff).ok()?);
        }
    }
    Some(bytes)
}

/// Go: `TestNewEpoch`
#[test]
fn new_epoch() {
    let first = Epoch::new().expect("an epoch");
    let second = Epoch::new().expect("an epoch");
    for epoch in [&first, &second] {
        let decoded = decode_base64url(&epoch.id);
        assert!(
            epoch.id.len() == 12 && decoded.is_some_and(|bytes| bytes.len() == 9),
            "id {:?}, want 12 base64url characters of 9 random bytes",
            epoch.id
        );
        assert!(
            (0..1_i64 << 32).contains(&epoch.grid_offset),
            "{}",
            epoch.grid_offset
        );
    }
    // 72 random bits colliding would be a broken source, not bad luck.
    assert_ne!(first.id, second.id);
}

/// Go: `TestGridCellsAndMilliseconds`
#[tokio::test(start_paused = true)]
async fn grid_cells_and_milliseconds() {
    let grid = Grid::new(TokioClock, 7);
    let origin = TokioClock.now();
    for (after, cell, ms) in [
        // The origin is the start of cell K, at K × 100 ms.
        (Duration::ZERO, 7, 700),
        (Duration::from_micros(99_999), 7, 799),
        // A cell's end is the next cell's start.
        (Duration::from_millis(100), 8, 800),
        (
            Duration::from_millis(3_600_050),
            7 + 36_000,
            700 + 3_600_050,
        ),
    ] {
        let instant = origin + after;
        assert_eq!(grid.cell(instant), cell, "after {after:?}");
        assert_eq!(grid.ms(instant), ms, "after {after:?}");
        assert_eq!(grid.cell(instant), grid.ms(instant) / 100);
    }
    advance(Duration::from_secs(60)).await;
    assert_eq!(
        grid.now(),
        origin + Duration::from_secs(60),
        "the grid reads its clock"
    );
}
