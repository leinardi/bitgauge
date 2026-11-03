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

//! The time source of everything in the server whose behavior depends on time: the limiter's
//! refill and `Retry-After`, and the upload grid and deadlines in the handlers. It reads tokio's
//! clock, which a test pauses and advances, so nothing waits out a real window; timers are
//! tokio's own (`sleep_until`, `timeout_at`), which follow the same paused clock.

use std::fmt::Debug;

use tokio::time::Instant;

/// A monotonic time source.
pub trait Clock: Debug + Send + Sync + 'static {
    /// The current instant. Intervals between two readings never jump with the wall clock.
    fn now(&self) -> Instant;
}

/// The production clock: tokio's, paused and advanced by tests that start paused.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TokioClock;

impl Clock for TokioClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{Clock, TokioClock};

    /// Go: `TestRealClockMovesForward`; here the paused clock moves exactly as far as advanced.
    #[tokio::test(start_paused = true)]
    async fn tokio_clock_follows_the_paused_clock() {
        let first = TokioClock.now();
        assert_eq!(TokioClock.now(), first);
        tokio::time::advance(Duration::from_millis(1500)).await;
        assert_eq!(TokioClock.now() - first, Duration::from_millis(1500));
    }
}
