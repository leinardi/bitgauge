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

//! The accuracy harness (testing.md section 5): profiles, shaping, evaluation and the report.
//!
//! The profile table, the shaper's command lines, the evaluator, the report and the image pins
//! are plain code, unit-tested untagged without Docker; the runners that build the topology over
//! the docker CLI sit behind the `harness` feature on top of these modules. The evaluator judges
//! each run against testing.md section 5 on the iperf3 reference method of decisions.md section
//! 35, and every report keeps the Go harness's bytes ([`gofmt`]).

pub mod bringup;
pub mod compat;
pub mod compat_step;
pub mod continuous;
pub mod evaluate;
#[cfg(test)]
mod fixtures;
pub mod gofmt;
pub mod images;
pub mod latency;
pub mod notice;
pub mod ping;
pub mod preflight;
pub mod profiles;
pub mod report;
pub mod shaper;
pub mod topology;
pub mod usage;
