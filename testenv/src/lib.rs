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

//! The Docker test environments of BitGauge: the image suite and the accuracy harness, with the
//! network guard and the syscall tracer they share (`docs/rust-port.md`, phase 17).
//!
//! The modules compile without a feature, so their rules are unit-tested in every `cargo test`;
//! nothing here starts a container unless a feature-gated suite asks it to.
//!
//! - [`docker`]: the [`docker::Runner`] over the docker CLI, and its errors.
//! - [`env`](mod@env), [`envid`], [`sweep`], [`logger`]: labeled environments, their cleanup and
//!   the stale sweep (Go's `test/internal/testenv`).
//! - [`runner`] and [`run_filter`]: the `harness = false` runner with Go's `-run` filter, from
//!   rust-common's `testenv-core` (feature `sync`); the suites pass it [`envid::TEMP_DIR_PREFIX`].
//! - [`identity`]: the check, before any test, that the image is the expected implementation
//!   and commit.
//! - [`netguard`]: the namespace whose egress is counted (Go's `test/internal/netguard`).
//! - [`syscalltrace`]: the strace parser and policies (Go's `test/internal/syscalltrace`).
//! - [`gitenv`] and [`toolgate`]: git isolation (`testenv-core`'s) and gated tools for behavioral
//!   tests (BitGauge's gate on `testenv-core`'s).

pub mod docker;
pub mod env;
pub mod envid;
pub mod harness;
pub mod identity;
pub mod logger;
pub mod netguard;
pub mod sweep;
pub mod syscalltrace;
pub mod toolgate;

pub use testenv_core::{gitenv, run_filter, runner};
