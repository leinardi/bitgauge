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

//! The random buffer and its body.

use std::time::Duration;

use bytes::Bytes;
use http_body::Body as _;
use http_body_util::BodyExt as _;

use super::support::no_transfer;
use crate::handlers::{BUFFER_SIZE, MAX_FRAME, RandomBody, RandomSource};
use crate::server::timeouts::Timeouts;

/// Every frame of a body, in order.
async fn frames(mut body: RandomBody) -> Vec<Bytes> {
    let mut frames = Vec::new();
    while let Some(frame) = body.frame().await {
        frames.push(
            frame
                .expect("an infallible body")
                .into_data()
                .expect("a data frame"),
        );
    }
    frames
}

/// Whether `frame` points into `buffer`: a slice of it, not a copy.
fn is_slice_of(frame: &Bytes, buffer: &Bytes) -> bool {
    let range = buffer.as_ptr_range();
    let frame_range = frame.as_ptr_range();
    range.start <= frame_range.start && frame_range.end <= range.end
}

/// Go: `TestNewBufferIsFourMiBOfRandomBytes`. The 30 s stall deadline is the connection
/// driver's here (rust-port.md row 7).
#[test]
fn new_buffer_is_four_mib_of_random_bytes() {
    let source = RandomSource::new().expect("a random source");
    let bytes = source.bytes();
    assert_eq!(bytes.len(), 4 * 1024 * 1024);
    // 4 MiB of zeros from the system source would be a broken source, not bad luck.
    assert!(
        bytes.iter().any(|&byte| byte != 0),
        "the buffer is all zeros"
    );
    assert_eq!(Timeouts::SERVER.write_stall, Duration::from_secs(30));
}

/// Go: `TestWriteRandomExactCountAndWrapAround`
#[tokio::test]
async fn random_body_exact_count_and_wrap_around() {
    const SIZE: usize = 1000;
    let source = RandomSource::with_size(SIZE).expect("a random source");
    for count in [1, SIZE - 1, SIZE, SIZE + 1, 3 * SIZE + 500] {
        let total = u64::try_from(count).expect("a count");
        let body = source.body(total, no_transfer());
        assert_eq!(body.size_hint().exact(), Some(total), "count {count}");
        let written: Vec<u8> = frames(body).await.concat();
        assert_eq!(written.len(), count);
        for (index, byte) in written.iter().enumerate() {
            assert_eq!(
                *byte,
                source.bytes()[index % SIZE],
                "count {count}: byte {index}"
            );
        }
    }
}

/// Go: `TestWriteRandomBoundsEachWrite`, and every frame a slice of the shared buffer
/// (rust-port.md row 9).
#[tokio::test]
async fn random_body_bounds_each_frame() {
    let source = RandomSource::new().expect("a random source");
    // One and a half buffers: the wrap-around falls in the middle of the 64 KiB grid.
    let count = BUFFER_SIZE + BUFFER_SIZE / 2 + 123;
    let frames = frames(source.body(u64::try_from(count).expect("a count"), no_transfer())).await;
    for frame in &frames {
        assert!(
            (1..=MAX_FRAME).contains(&frame.len()),
            "a frame of {} bytes",
            frame.len()
        );
        assert!(is_slice_of(frame, source.bytes()), "a frame was copied");
    }
    let written = frames.concat();
    assert_eq!(written.len(), count);
    assert_eq!(
        &written[BUFFER_SIZE..BUFFER_SIZE + BUFFER_SIZE / 2],
        &source.bytes()[..BUFFER_SIZE / 2],
        "the body wraps to the buffer start"
    );
}

/// An empty body ends at once.
#[tokio::test]
async fn an_empty_body_has_no_frames() {
    let source = RandomSource::with_size(10).expect("a random source");
    let body = source.body(0, no_transfer());
    assert!(body.is_end_stream());
    assert!(frames(body).await.is_empty());
}
