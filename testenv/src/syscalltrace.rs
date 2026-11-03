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

//! Reads strace output and checks it against the image suite's syscall policies (testing.md
//! section 5; Go's `test/internal/syscalltrace`): the serve policy, under which `bitgauge serve`
//! may never connect, may send only on the connections it accepted and may write no file outside
//! `/dev` and `/proc`; and the healthcheck policy, under which `bitgauge healthcheck` makes
//! exactly one loopback connect, to the listen address, and writes no file.
//!
//! It judges attempts, not outcomes: a refused connect or a failed open fails a trace exactly like
//! a successful one. It needs no Docker and is tested on recorded traces in every `cargo test`
//! (`tests/testdata/syscalltrace/`).
//!
//! One kind of call is read without being judged: `???()`, which strace prints for a thread
//! whose system call it could not identify, typically one of a process that is exiting. It
//! carries no argument, so there is nothing to judge; a `???` call with arguments is unparsable.

mod gostr;
mod parse;
mod policy;

pub use parse::{Event, ParseError, UNKNOWN_CALL, parse};
pub use policy::{
    Descriptor, KIND_PATH, KIND_UNANNOTATED, Stats, TRACE_SET, Violation, check_healthcheck,
    check_serve, parse_descriptor, socket_address,
};

#[cfg(test)]
mod tests;
