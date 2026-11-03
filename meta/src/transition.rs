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
//! Identity). The transitional assertions (the toolchain pins, the Dockerfiles, `release.yaml` and
//! audit-deps) state both artifacts through [`TRANSITION`], one constant, so the cutover changes
//! what they expect in one place.

/// A stage of the move to the Rust build.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transition {
    /// Before the cutover: the shipped `deployments/docker/Dockerfile` is the Go build, with the
    /// Go toolchain line and today's checks, and `deployments/docker/Dockerfile.rust` is the Rust
    /// candidate, which nothing ships or publishes.
    Candidate,
    /// After the cutover: `Dockerfile.rust` has become the shipped `Dockerfile`, the Go-side
    /// assertions are gone, and the candidate's assertions hold for the shipped image.
    Done,
}

/// Where the move stands today.
pub const TRANSITION: Transition = Transition::Candidate;

/// The shipped Dockerfile, the one release image.
pub const SHIPPED_DOCKERFILE: &str = "deployments/docker/Dockerfile";

/// The Rust Dockerfile: the candidate before the cutover, the shipped one after it.
#[must_use]
pub const fn rust_dockerfile(transition: Transition) -> &'static str {
    match transition {
        Transition::Candidate => "deployments/docker/Dockerfile.rust",
        Transition::Done => SHIPPED_DOCKERFILE,
    }
}

/// The Go Dockerfile, which only exists before the cutover.
#[must_use]
pub const fn go_dockerfile(transition: Transition) -> Option<&'static str> {
    match transition {
        Transition::Candidate => Some(SHIPPED_DOCKERFILE),
        Transition::Done => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{SHIPPED_DOCKERFILE, Transition, go_dockerfile, rust_dockerfile};

    /// Before the cutover the shipped file is Go's and the Rust one sits beside it; after it, the
    /// Rust one is the shipped file and there is no Go one.
    #[test]
    fn each_stage_names_its_dockerfiles() {
        assert_eq!(
            go_dockerfile(Transition::Candidate),
            Some(SHIPPED_DOCKERFILE)
        );
        assert_ne!(rust_dockerfile(Transition::Candidate), SHIPPED_DOCKERFILE);
        assert_eq!(go_dockerfile(Transition::Done), None);
        assert_eq!(rust_dockerfile(Transition::Done), SHIPPED_DOCKERFILE);
    }
}
