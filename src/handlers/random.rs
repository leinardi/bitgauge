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

//! The random buffer every response streaming random bytes is cut from (backend.md section
//! 2.1), and the body that streams it.

use std::convert::Infallible;
use std::pin::Pin;
use std::task::{Context, Poll};

use bytes::Bytes;
use http_body::{Body, Frame, SizeHint};

use crate::metrics::Transfer;

/// The size of the random buffer generated at startup.
pub const BUFFER_SIZE: usize = 4 << 20;
/// The most a frame holds, so a write in progress is never long on a slow link: 64 KiB take
/// about 5 s at 100 kbit/s. The connection driver's stall rule cuts a client that stops
/// reading (rust-port.md row 7).
pub const MAX_FRAME: usize = 64 << 10;

/// The system random source could not be read.
#[derive(Debug, thiserror::Error)]
#[error("read the system random source: {0}")]
pub struct RandomError(#[from] getrandom::Error);

/// The in-memory random buffer, generated once from the system random source and leaked, so
/// that every frame of every response is a slice of it: shared by every request without
/// locking, copying or a per-request data buffer (rust-port.md row 9). Clones share it.
#[derive(Debug, Clone)]
pub struct RandomSource {
    data: Bytes,
}

impl RandomSource {
    /// The 4 MiB buffer.
    ///
    /// # Errors
    ///
    /// The system random source failed.
    pub fn new() -> Result<Self, RandomError> {
        Self::with_size(BUFFER_SIZE)
    }

    pub(super) fn with_size(size: usize) -> Result<Self, RandomError> {
        let mut data = vec![0; size];
        getrandom::fill(&mut data)?;
        Ok(Self {
            data: Bytes::from_static(data.leak()),
        })
    }

    /// The buffer itself.
    #[must_use]
    pub fn bytes(&self) -> &Bytes {
        &self.data
    }

    /// A body of exactly `size` bytes cut from the buffer, wrapping around at its end.
    /// `transfer` counts it as in progress until the body is dropped, the bytes of each frame
    /// as it is handed on, and a body dropped with bytes left as an abort.
    #[must_use]
    pub fn body(&self, size: u64, transfer: Transfer) -> RandomBody {
        transfer.start();
        RandomBody {
            data: self.data.clone(),
            offset: 0,
            remaining: size,
            transfer,
        }
    }
}

/// A body of random bytes: [`Bytes::slice`]s of at most [`MAX_FRAME`] of the shared buffer,
/// with an exact size hint.
#[derive(Debug)]
pub struct RandomBody {
    data: Bytes,
    offset: usize,
    remaining: u64,
    transfer: Transfer,
}

impl Body for RandomBody {
    type Data = Bytes;
    type Error = Infallible;

    fn poll_frame(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, Infallible>>> {
        let this = self.get_mut();
        if this.remaining == 0 || this.data.is_empty() {
            return Poll::Ready(None);
        }
        let room = (this.data.len() - this.offset).min(MAX_FRAME);
        let chunk = usize::try_from(this.remaining).map_or(room, |remaining| remaining.min(room));
        let frame = this.data.slice(this.offset..this.offset + chunk);
        this.offset = (this.offset + chunk) % this.data.len();
        let counted = u64::try_from(chunk).unwrap_or(u64::MAX);
        this.remaining -= counted;
        this.transfer.add(counted);
        Poll::Ready(Some(Ok(Frame::data(frame))))
    }

    fn is_end_stream(&self) -> bool {
        self.remaining == 0
    }

    fn size_hint(&self) -> SizeHint {
        SizeHint::with_exact(self.remaining)
    }
}

impl Drop for RandomBody {
    fn drop(&mut self) {
        // A body dropped before its end is a client that went away or stalled.
        if self.remaining > 0 {
            self.transfer.abort();
        }
        self.transfer.done();
    }
}
