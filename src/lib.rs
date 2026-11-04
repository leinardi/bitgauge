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

//! BitGauge: a self-hosted, browser-based network speed test. One stateless binary serves the
//! embedded SPA, the native API under `/api/v1` and the optional compatibility layers.
//!
//! The package map is backend.md section 1; `docs/rust-port.md` records the port from Go.

pub mod buildinfo;
pub mod cli;
pub mod clientip;
pub mod clock;
pub mod command;
pub mod compat;
pub mod config;
pub mod handlers;
pub mod healthcheck;
pub mod logger;
pub mod metrics;
pub mod ratelimit;
pub mod server;
pub mod web;

#[cfg(test)]
mod test_support;
