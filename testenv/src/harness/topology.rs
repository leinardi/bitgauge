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

//! The topology's settings and its pure pieces (testing.md section 5.1): an internal network with
//! no route out; the netguard holder owning BitGauge's namespace, which BitGauge (read-only) and
//! the iperf3 server join; an optional proxy; the Playwright client, whose namespace the shaper
//! sidecar shares and shapes; and on a Compat profile the `OpenSpeedTest` UI. The bring-up itself
//! drives the docker CLI and lives with the harness runner.

use std::path::PathBuf;
use std::time::Duration;

use super::report::Throughput;
use super::shaper::BITS_PER_BYTE;

/// BitGauge's listen port inside the guard's namespace.
pub const LISTEN_PORT: u16 = 8080;
/// The iperf3 server's port, beside BitGauge.
pub const IPERF3_PORT: &str = "5201";
/// How long the shaper self-test reads each tbf.
pub const SELF_TEST_FOR: Duration = Duration::from_secs(5);
/// Keeps iperf3 running past the self-test's last tbf read.
pub const SELF_TEST_TAIL: Duration = Duration::from_secs(1);
/// How far the measured rate may stray from the configured one before a profile does not count
/// (testing.md section 5.1).
pub const SELF_TEST_BOUND: f64 = 0.05;
/// Where `web/` is mounted in the client.
pub const CLIENT_WEB: &str = "/web";
/// Where the output directory is mounted in the client.
pub const CLIENT_OUT: &str = "/out";
/// How long one tier browser run may take.
pub const BROWSER_LIMIT: Duration = Duration::from_mins(20);
/// ping's `-i`, in seconds.
pub const PING_INTERVAL: &str = "0.2";
/// How often a readiness probe is retried.
pub const POLL_INTERVAL: Duration = Duration::from_millis(200);
/// How long a readiness probe is retried.
pub const POLL_LIMIT: Duration = Duration::from_secs(60);
/// The `OpenSpeedTest` image's HTTP port.
pub const OPENSPEEDTEST_PORT: &str = "3000";

/// What the shaper self-test refuses a profile with.
pub const SHAPER_SELF_TEST_FAILED: &str = "shaper self-test failed";

/// What every topology of one harness invocation shares.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Config {
    /// The image netguard's tools build produced.
    pub tools_image: String,
    /// The image under test.
    pub bitgauge_image: String,
    /// The repository root; `web/` is mounted into the client from there.
    pub repo_root: PathBuf,
    /// Receives the browsers' exports and Playwright's output; the client writes it. It must
    /// exist, owned by the user running the harness, before the bring-up.
    pub out_dir: PathBuf,
    /// Skips the shaper even on a shaped profile (`HARNESS_SHAPE=none`).
    pub unshaped: bool,
}

/// A `--mount` bind, which refuses a missing source where `--volume` would have the daemon create
/// it, root-owned.
#[must_use]
pub fn bind_mount(source: &str, target: &str, read_only: bool) -> String {
    let mut mount = format!("type=bind,source={source},target={target}");
    if read_only {
        mount.push_str(",readonly");
    }
    mount
}

/// iperf3's `--time`: the settle and the measured duration, rounded up to a whole second.
#[must_use]
pub fn iperf3_seconds(total: Duration) -> u64 {
    let seconds = total.as_secs();
    if total.subsec_nanos() > 0 {
        seconds + 1
    } else {
        seconds
    }
}

/// The rate a tbf sent between two reads of its counter, `elapsed_seconds` apart.
#[must_use]
#[expect(clippy::cast_precision_loss, reason = "Go's float64 of a byte count")]
pub fn tbf_rate(first: i64, last: i64, elapsed_seconds: f64) -> f64 {
    (last - first) as f64 * BITS_PER_BYTE as f64 / elapsed_seconds
}

/// The shaper self-test's judgment (testing.md section 5.1): the rate each direction's tbf sent
/// while iperf3 saturated it, held to [`SELF_TEST_BOUND`] of the configured rate. The Go harness
/// checked the two directions in a map's random order; this checks the download first.
///
/// # Errors
///
/// The first direction off its configured rate, in the Go harness's words.
#[expect(clippy::cast_precision_loss, reason = "Go's float64(rate)")]
pub fn check_self_test(
    rate_bits_per_second: i64,
    download: f64,
    upload: f64,
) -> Result<Throughput, String> {
    let want = rate_bits_per_second as f64;
    for (direction, got) in [("download", download), ("upload", upload)] {
        if (got - want).abs() / want > SELF_TEST_BOUND {
            return Err(format!(
                "{SHAPER_SELF_TEST_FAILED}: the {direction} tbf sent {got:.0} bit/s against a \
                 configured rate of {want:.0}"
            ));
        }
    }
    Ok(Throughput {
        download_bits_per_second: download,
        upload_bits_per_second: upload,
        seconds: SELF_TEST_FOR.as_secs_f64(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pure_pieces() {
        assert_eq!(
            bind_mount("/repo/web", CLIENT_WEB, true),
            "type=bind,source=/repo/web,target=/web,readonly"
        );
        assert_eq!(
            bind_mount("/out", CLIENT_OUT, false),
            "type=bind,source=/out,target=/out"
        );
        assert_eq!(iperf3_seconds(Duration::from_secs(12)), 12);
        assert_eq!(iperf3_seconds(Duration::from_millis(12_001)), 13);
        assert!((tbf_rate(1000, 2000, 0.5) - 16_000.0).abs() < f64::EPSILON);
        assert!(check_self_test(300_000, 299_000.0, 301_000.0).is_ok());
        assert_eq!(
            check_self_test(300_000, 299_000.0, 250_000.0),
            Err(
                "shaper self-test failed: the upload tbf sent 250000 bit/s against a configured \
                 rate of 300000"
                    .to_owned()
            )
        );
    }
}
