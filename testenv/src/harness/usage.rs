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

//! The client's CPU and memory over one browser run (testing.md section 5's CPU and memory
//! counters), read from its own cgroup v2 files.

use serde::Serialize;

use super::gofmt;

/// The client container's cpu.stat, as its private cgroup namespace shows it.
pub const CGROUP_CPU_STAT: &str = "/sys/fs/cgroup/cpu.stat";
/// The client container's memory.peak (Linux 5.19 or later).
pub const CGROUP_MEMORY_PEAK: &str = "/sys/fs/cgroup/memory.peak";

/// cpu.stat's microseconds in a second, for [`Usage::cpu_seconds`].
pub const USEC_PER_SECOND: f64 = 1e6;

/// What a cgroup counter error starts with.
const CGROUP_ERROR: &str = "unreadable cgroup counters";

/// The client's CPU and memory over one browser run: the browser and Playwright, everything in
/// the client container. The client only sleeps before the run, so its lifetime memory peak is
/// the run's.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// User plus system CPU time, summed over all cores.
    pub cpu_seconds: f64,
    /// The run's duration, so `cpu_seconds / wall_seconds` is the mean cores busy.
    pub wall_seconds: f64,
    /// The client's lifetime memory peak.
    pub peak_memory_bytes: u64,
}

/// `usage_usec` from a cgroup v2 cpu.stat.
///
/// # Errors
///
/// A cpu.stat without `usage_usec`, or with a value that is not a whole number.
pub fn cpu_usage_micros(cpu_stat: &str) -> Result<u64, String> {
    for line in cpu_stat.split('\n') {
        let Some((key, value)) = line.trim().split_once(' ') else {
            continue;
        };
        if key != "usage_usec" {
            continue;
        }
        return gofmt::parse_uint(value).map_err(|error| {
            format!(
                "{CGROUP_ERROR}: usage_usec {}: {error}",
                gofmt::quote(value)
            )
        });
    }
    Err(format!("{CGROUP_ERROR}: cpu.stat has no usage_usec"))
}

/// A cgroup v2 memory.peak.
///
/// # Errors
///
/// A value that is not a whole number, such as `max`.
pub fn memory_peak(content: &str) -> Result<u64, String> {
    let value = content.trim();
    gofmt::parse_uint(value).map_err(|error| {
        format!(
            "{CGROUP_ERROR}: memory.peak {}: {error}",
            gofmt::quote(value)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Go: `TestClientCounters`.
    #[test]
    fn client_counters() {
        let mut failures = Vec::new();
        let usec = cpu_usage_micros("usage_usec 24356\nuser_usec 15335\nsystem_usec 9021\n");
        if usec != Ok(24356) {
            failures.push(format!("cpu_usage_micros = {usec:?}"));
        }
        for bad in ["", "user_usec 1\n", "usage_usec many\n"] {
            if cpu_usage_micros(bad).is_ok() {
                failures.push(format!("{bad:?} was read as a CPU time"));
            }
        }
        let peak = memory_peak("5955584\n");
        if peak != Ok(5_955_584) {
            failures.push(format!("memory_peak = {peak:?}"));
        }
        if memory_peak("max\n").is_ok() {
            failures.push("max was read as a memory peak".to_owned());
        }
        assert_eq!(
            cpu_usage_micros("usage_usec many\n"),
            Err(
                "unreadable cgroup counters: usage_usec \"many\": strconv.ParseUint: parsing \
                 \"many\": invalid syntax"
                    .to_owned()
            )
        );
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
