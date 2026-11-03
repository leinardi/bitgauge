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

//! The Go handler tests, ported; each names the Go test it maps to. Time-dependent tests run on
//! tokio's paused clock: a body's frames arrive at scripted instants, and nothing waits out a
//! real window except the loopback tests of the real deadlines.

mod contract;
mod download;
mod drain;
mod envelope;
mod epoch;
mod info;
mod json;
mod loopback;
mod metrics;
mod origin;
mod probes;
mod random;
mod support;
mod upload;
mod ws;
