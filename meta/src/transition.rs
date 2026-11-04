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

//! Where the move from the Go build to the Rust one stands (`docs/rust-port.md`, Implementation
//! Identity). It is complete: the Rust build is the shipped one, and the meta-tests that once
//! stated both builds through this constant hold the shipped Dockerfile alone.

/// A stage of the move to the Rust build.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transition {
    /// The cutover is done: `deployments/docker/Dockerfile` is the Rust build, and the Go build,
    /// the Go toolchain and the Go meta-tests are gone.
    Done,
}

/// Where the move stands today.
pub const TRANSITION: Transition = Transition::Done;

/// The shipped Dockerfile, the one release image.
pub const SHIPPED_DOCKERFILE: &str = "deployments/docker/Dockerfile";
