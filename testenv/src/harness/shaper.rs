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

//! The shaper's tc command lines, built as data, the self-test's tbf counter, and the iperf3
//! settings and reading of the reference method (decisions.md section 35).

use std::fmt;
use std::time::Duration;

use serde::Deserialize;

use super::gofmt;
use super::profiles::Profile;

/// A full frame as tbf counts it: a 1500-byte MTU plus the 14-byte Ethernet header.
const ETHERNET_FRAME: i64 = 1514;
/// What TCP carries in a full frame, with timestamps on: 1500 - 20 (IP) - 32 (TCP).
const TCP_PAYLOAD: i64 = 1448;

/// tbf's burst is 10 ms of data, at least two full Ethernet frames: eight bits a byte, a hundred
/// 10 ms slices a second. Its queue is 80 ms of data, at least 64 KiB: eight bits a byte, 12.5
/// slices of 80 ms a second.
const BURST_DIVISOR: i64 = 8 * 100;
const MINIMUM_BURST: i64 = 2 * ETHERNET_FRAME;
const QUEUE_DIVISOR: i64 = 8 * 1000 / 80;
const MINIMUM_QUEUE: i64 = 64 * 1024;

pub(crate) const BITS_PER_BYTE: i64 = 8;
const MILLISECONDS_PER_SECOND: i64 = 1000;

/// iperf3's own TCP block length, 128 KiB.
const DEFAULT_IPERF3_LENGTH: i64 = 128 * 1024;
const MINIMUM_SETTLE: Duration = Duration::from_secs(2);
const SETTLE_ROUND_TRIPS: u32 = 10;
/// Leaves out the short last interval iperf3 may report as a test ends.
const FULL_INTERVAL: f64 = 0.5;
/// Absorbs iperf3's float interval starts.
const INTERVAL_SLACK: f64 = 1e-6;

/// The start of the `tc -s` line of the tbf [`shaper_commands`] adds on each device, handle 2:.
const TBF_QDISC: &str = "qdisc tbf 2:";

/// Output the shaper or iperf3 wrote that cannot be read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OutputError {
    /// `tc -s qdisc show` output without the tbf's sent bytes.
    Tbf(String),
    /// iperf3 `--json` output without a usable interval.
    Iperf3(String),
}

impl fmt::Display for OutputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tbf(detail) => write!(formatter, "unreadable tc output: {detail}"),
            Self::Iperf3(detail) => write!(formatter, "unreadable iperf3 output: {detail}"),
        }
    }
}

impl std::error::Error for OutputError {}

/// The bytes the tbf has sent, from `tc -s qdisc show` output: the "Sent N bytes" line under the
/// tbf, which counts whole frames, the unit tbf meters the rate in.
///
/// # Errors
///
/// [`OutputError::Tbf`] when there is no tbf, or no readable Sent line under it.
pub fn tbf_sent_bytes(out: &str) -> Result<i64, OutputError> {
    let lines: Vec<&str> = out.split('\n').collect();
    for (index, line) in lines.iter().enumerate() {
        if !line.starts_with(TBF_QDISC) || index + 1 == lines.len() {
            continue;
        }
        let fields: Vec<&str> = lines[index + 1].split_whitespace().collect();
        if fields.len() < 3 || fields[0] != "Sent" || fields[2] != "bytes" {
            return Err(OutputError::Tbf(format!(
                "no Sent line under {}",
                gofmt::quote(TBF_QDISC)
            )));
        }
        return gofmt::parse_int("ParseInt", fields[1]).map_err(OutputError::Tbf);
    }
    Err(OutputError::Tbf(format!("no {}", gofmt::quote(TBF_QDISC))))
}

/// The TCP payload rate a correct shaper lets through at a profile's rate: tbf counts whole
/// frames, iperf3 counts payload, and full frames carry 1448 of 1514 bytes. The reference runs are
/// held to this; the self-test reads the tbf itself, against the configured rate.
#[must_use]
#[expect(
    clippy::cast_precision_loss,
    reason = "Go's float64(rate), exact below 2^53"
)]
pub fn expected_goodput(rate_bits_per_second: i64) -> f64 {
    rate_bits_per_second as f64 * TCP_PAYLOAD as f64 / ETHERNET_FRAME as f64
}

/// The reference runs' baseline (testing.md section 5): [`expected_goodput`] less the share a
/// lossy profile's loss spends on retransmissions, which iperf3 does not count.
#[must_use]
pub fn configured_goodput(profile: &Profile) -> f64 {
    expected_goodput(profile.rate_bits_per_second) * (1.0 - profile.loss_percent / 100.0)
}

/// Caps segmentation offload on eth0 at one segment per packet (testing.md section 5.1). The
/// qdiscs see a sender's packets before segmentation, and a two-segment packet takes one of
/// `fq_codel`'s slots sized for one frame: at 300 kbit/s, 600 ms the 64 KiB queue held 133 KB, and
/// the round trip grew to 3.3 s instead of the 2.35 s the queue allows.
pub const OFFLOAD_COMMAND: &str = "ip link set dev eth0 gso_max_segs 1";

/// Whether a profile's link runs [`OFFLOAD_COMMAND`]: only where the queue is its 64 KiB minimum,
/// more than 80 ms of data. There `CoDel`'s interval is seconds long and the packet limit is what
/// holds the queue; above it, `CoDel` holds the queue near its 80 ms target within 160 ms whatever
/// the packets carry, and one segment per packet costs more CPU than the Docker bridge has: the
/// 1 Gbit self-test fell to 780-858 Mbit/s against 956.
#[must_use]
pub const fn caps_offload(profile: &Profile) -> bool {
    profile.rate_bits_per_second / QUEUE_DIVISOR < MINIMUM_QUEUE
}

/// The tc and ip commands that shape a profile's link on the client's eth0: delay and rate,
/// without loss. The self-test runs on this link; [`loss_command`] adds the loss after, since TCP
/// over a lossy link cannot show whether the rate holds.
///
/// Each direction is a tbf at the profile's rate whose queue, the one of measurement.md section
/// 19 (80 ms of data, at least 64 KiB), is an `fq_codel` shared among the flows crossing it, as
/// section 19.1 models the link: one drop-tail FIFO would let an established stream hold the
/// whole queue and lock a newly opened one out for seconds, which measures TCP's fairness and not
/// BitGauge. `CoDel`'s target is the queue's own length, so it drops nothing early and a single
/// flow still fills the link; a full queue drops from the flow holding most of it.
///
/// `fq_codel`'s limit counts packets, sized as full frames, so where [`caps_offload`] holds, the
/// first command is [`OFFLOAD_COMMAND`]; the namespace that sends to the client runs it too.
///
/// A profile without a rate, which no shaped profile is, yields a zero queue length rather than
/// Go's division panic.
#[must_use]
pub fn shaper_commands(profile: &Profile) -> Vec<String> {
    let rate_bits = profile.rate_bits_per_second;
    let rate = format!("{rate_bits}bit");
    let burst = (rate_bits / BURST_DIVISOR).max(MINIMUM_BURST);
    let queue = (rate_bits / QUEUE_DIVISOR).max(MINIMUM_QUEUE);
    let tbf = format!("tbf rate {rate} burst {burst} limit {queue}");
    // The queue's length in time, rounded up to a whole millisecond.
    let queue_ms = (queue * BITS_PER_BYTE * MILLISECONDS_PER_SECOND + rate_bits - 1)
        .checked_div(rate_bits)
        .unwrap_or(0);
    let fq_codel = format!(
        "fq_codel limit {} target {queue_ms}ms interval {}ms",
        (queue + ETHERNET_FRAME - 1) / ETHERNET_FRAME,
        2 * queue_ms
    );

    let mut commands = Vec::with_capacity(10);
    if caps_offload(profile) {
        commands.push(OFFLOAD_COMMAND.to_owned());
    }
    commands.extend([
        format!(
            "tc qdisc add dev eth0 root handle 1: {}",
            netem_delay(profile)
        ),
        format!("tc qdisc add dev eth0 parent 1: handle 2: {tbf}"),
        format!("tc qdisc add dev eth0 parent 2:1 handle 3: {fq_codel}"),
        "ip link add ifb0 type ifb".to_owned(),
        "ip link set ifb0 up".to_owned(),
        "tc qdisc add dev eth0 handle ffff: ingress".to_owned(),
        "tc filter add dev eth0 parent ffff: protocol all u32 match u32 0 0 action mirred \
         egress redirect dev ifb0"
            .to_owned(),
        format!("tc qdisc add dev ifb0 root handle 2: {tbf}"),
        format!("tc qdisc add dev ifb0 parent 2:1 handle 3: {fq_codel}"),
    ]);
    commands
}

/// The change to the root netem qdisc that adds the profile's loss, or empty when it has none.
#[must_use]
pub fn loss_command(profile: &Profile) -> String {
    if profile.loss_percent <= 0.0 {
        return String::new();
    }
    format!(
        "tc qdisc change dev eth0 root handle 1: {} loss {}%",
        netem_delay(profile),
        gofmt::format_float_plain(profile.loss_percent)
    )
}

fn netem_delay(profile: &Profile) -> String {
    format!("netem delay {}ms", profile.rtt.as_millis())
}

/// How long an iperf3 measurement runs before its intervals count: TCP's ramp and, over a long
/// round trip, its first loss recoveries, ten round trips and at least 2 s.
#[must_use]
pub fn iperf3_settle(rtt: Duration) -> Duration {
    MINIMUM_SETTLE.max(rtt.saturating_mul(SETTLE_ROUND_TRIPS))
}

/// iperf3's block length at a profile's rate, in bytes: 10 ms of data, between one full segment's
/// payload and iperf3's default. iperf3 reads whole blocks, so a block of more than a second's
/// data at a slow rate would quantize every interval's count; an unshaped profile, with no rate,
/// keeps the default.
#[must_use]
pub fn iperf3_length(rate_bits_per_second: i64) -> i64 {
    if rate_bits_per_second <= 0 {
        return DEFAULT_IPERF3_LENGTH;
    }
    (rate_bits_per_second / BURST_DIVISOR).clamp(TCP_PAYLOAD, DEFAULT_IPERF3_LENGTH)
}

/// One of iperf3's one-second interval reports, as `--json` writes it.
#[derive(Deserialize, Default)]
struct Iperf3Interval {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    sum: Iperf3Sum,
}

#[derive(Deserialize, Default)]
struct Iperf3Sum {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    start: f64,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    seconds: f64,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    bits_per_second: f64,
}

#[derive(Deserialize)]
struct Iperf3Report {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    intervals: Vec<Iperf3Interval>,
    #[serde(default)]
    server_output_json: Option<Iperf3ServerOutput>,
}

#[derive(Deserialize)]
struct Iperf3ServerOutput {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    intervals: Vec<Iperf3Interval>,
}

/// The receiver's steady goodput from iperf3 `--json` output: the median of its full one-second
/// intervals from `settle` on, the client's in `--reverse` mode, the server's
/// (`--get-server-output` from a `--json` server) otherwise. iperf3's own totals are not used:
/// `--omit` carries the omitted seconds' bytes into them, and at a slow rate over a long round
/// trip a loss recovery holds a second's bytes back and hands them over in the next, which a mean
/// over a few seconds turns into a rate the link never had.
///
/// # Errors
///
/// [`OutputError::Iperf3`] for output that does not parse, an upload without the server's
/// intervals, or no full interval after the settle.
pub fn received_bits_per_second(
    out: &str,
    reverse: bool,
    settle: Duration,
) -> Result<f64, OutputError> {
    let report: Iperf3Report = gofmt::unmarshal(out.as_bytes()).map_err(OutputError::Iperf3)?;

    let intervals = if reverse {
        report.intervals
    } else {
        report
            .server_output_json
            .ok_or_else(|| OutputError::Iperf3("no server intervals".to_owned()))?
            .intervals
    };

    let from = settle.as_secs_f64() - INTERVAL_SLACK;
    let mut rates: Vec<f64> = intervals
        .iter()
        .filter(|interval| interval.sum.start >= from && interval.sum.seconds >= FULL_INTERVAL)
        .map(|interval| interval.sum.bits_per_second)
        .collect();

    if rates.is_empty() {
        return Err(OutputError::Iperf3(format!(
            "no interval after {}",
            gofmt::duration(settle)
        )));
    }

    rates.sort_by(f64::total_cmp);
    let middle = rates.len() / 2;
    if rates.len().is_multiple_of(2) {
        return Ok(f64::midpoint(rates[middle - 1], rates[middle]));
    }
    Ok(rates[middle])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::profiles::{GBIT, KBIT, MBIT};

    /// Go: `TestShaperCommands`.
    #[test]
    fn shaper_commands_shape_the_link() {
        let mut failures = Vec::new();
        let profile = Profile {
            rate_bits_per_second: 300_000,
            rtt: Duration::from_millis(300),
            loss_percent: 1.0,
            shaped: true,
            ..Profile::default()
        };
        let shaper = shaper_commands(&profile);
        let commands = shaper.join("\n");

        // fq_codel's limit is sized in full frames, so a 64 KiB queue caps offload before
        // anything is shaped.
        if shaper[0] != OFFLOAD_COMMAND || OFFLOAD_COMMAND != "ip link set dev eth0 gso_max_segs 1"
        {
            failures.push(format!(
                "the shaper does not cap segmentation offload first:\n{commands}"
            ));
        }
        for want in [
            "tc qdisc add dev eth0 root handle 1: netem delay 300ms\n",
            "tc qdisc add dev eth0 parent 1: handle 2: tbf rate 300000bit burst 3028 limit 65536\n",
            "tc qdisc add dev eth0 parent 2:1 handle 3: fq_codel limit 44 target 1748ms interval \
             3496ms\n",
            "ip link add ifb0 type ifb",
            "action mirred egress redirect dev ifb0",
            "tc qdisc add dev ifb0 root handle 2: tbf rate 300000bit burst 3028 limit 65536\n",
            "tc qdisc add dev ifb0 parent 2:1 handle 3: fq_codel limit 44 target 1748ms interval \
             3496ms",
        ] {
            if !commands.contains(want) {
                failures.push(format!("the shaper does not run {want:?}:\n{commands}"));
            }
        }
        // The self-test runs before the loss: it goes on afterwards, as a change to the same
        // netem.
        if commands.contains("loss") {
            failures.push(format!(
                "the shaper adds the loss before the self-test:\n{commands}"
            ));
        }
        let loss = loss_command(&profile);
        if loss != "tc qdisc change dev eth0 root handle 1: netem delay 300ms loss 1%" {
            failures.push(format!("loss_command = {loss:?}"));
        }

        let fast = Profile {
            rate_bits_per_second: 1_000_000_000,
            ..Profile::default()
        };
        let fast_commands = shaper_commands(&fast).join("\n");
        if fast_commands.contains(OFFLOAD_COMMAND) {
            failures.push(format!(
                "the shaper caps offload on a queue above 64 KiB:\n{fast_commands}"
            ));
        }
        // 80 ms of data at 1 Gbit: 10 MB, 6606 full frames.
        if !fast_commands.contains("netem delay 0ms\n")
            || !fast_commands.contains("burst 1250000 limit 10000000\n")
            || !fast_commands.contains("fq_codel limit 6606 target 80ms interval 160ms\n")
        {
            failures.push(format!("1 Gbit without delay:\n{fast_commands}"));
        }
        if !loss_command(&fast).is_empty() {
            failures.push("a profile without loss changes netem".to_owned());
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestExpectedGoodput`. The payload share of a full frame, about 95.6 % of the rate tbf
    /// enforces.
    #[test]
    fn expected_goodput_is_the_payload_share() {
        let got = expected_goodput(100_000_000);
        assert!(
            (got - 95_640_686.9).abs() <= 1.0,
            "expected_goodput = {got:.1}"
        );
    }

    /// Go: `TestReceivedBitsPerSecond`.
    #[test]
    fn received_bits_per_second_is_the_median() {
        let mut failures = Vec::new();
        let settle = Duration::from_secs(2);
        // A loss recovery holds the third second's bytes back into the fourth; the median reads
        // the link, where the mean of the counted seconds would read 5 % fast. The short last
        // interval and the seconds before the settle do not count.
        let intervals = r#"[{"sum":{"start":0,"seconds":1,"bits_per_second":1}},
            {"sum":{"start":2,"seconds":1,"bits_per_second":4.75e5}},
            {"sum":{"start":3,"seconds":1,"bits_per_second":2.5e5}},
            {"sum":{"start":4,"seconds":1,"bits_per_second":7.5e5}},
            {"sum":{"start":5,"seconds":1,"bits_per_second":4.75e5}},
            {"sum":{"start":6,"seconds":0.2,"bits_per_second":9e9}}]"#;
        for (name, out, reverse) in [
            (
                "download, the client's intervals",
                format!(r#"{{"intervals":{intervals}}}"#),
                true,
            ),
            (
                "upload, the server's intervals",
                format!(r#"{{"intervals":[],"server_output_json":{{"intervals":{intervals}}}}}"#),
                false,
            ),
        ] {
            let got = received_bits_per_second(&out, reverse, settle);
            if got != Ok(4.75e5) {
                failures.push(format!("{name}: got {got:?}"));
            }
        }
        for bad in [
            "",
            "not json",
            r#"{"intervals":[]}"#,
            r#"{"error":"unable to connect"}"#,
        ] {
            if received_bits_per_second(bad, true, settle).is_ok() {
                failures.push(format!("{bad:?} was read as a throughput"));
            }
        }
        if received_bits_per_second(&format!(r#"{{"intervals":{intervals}}}"#), false, settle)
            .is_ok()
        {
            failures.push(
                "an upload without the server's intervals was read as a throughput".to_owned(),
            );
        }
        assert_eq!(
            received_bits_per_second(r#"{"intervals":[]}"#, true, settle)
                .map_err(|error| error.to_string()),
            Err("unreadable iperf3 output: no interval after 2s".to_owned())
        );
        assert_eq!(
            received_bits_per_second("", true, settle).map_err(|error| error.to_string()),
            Err("unreadable iperf3 output: unexpected end of JSON input".to_owned())
        );
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestIperf3Settings`.
    #[test]
    fn iperf3_settings() {
        let mut failures = Vec::new();
        for (rate, length) in [
            (500 * KBIT, 1448),
            (10 * MBIT, 12500),
            (100 * MBIT, 125_000),
            (GBIT, 131_072),
            (0, 131_072),
        ] {
            let got = iperf3_length(rate);
            if got != length {
                failures.push(format!("iperf3_length({rate}) = {got}, want {length}"));
            }
        }
        for (rtt_ms, settle_s) in [(0, 2), (50, 2), (300, 3), (600, 6)] {
            let got = iperf3_settle(Duration::from_millis(rtt_ms));
            if got != Duration::from_secs(settle_s) {
                failures.push(format!(
                    "iperf3_settle({rtt_ms} ms) = {got:?}, want {settle_s} s"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestCapsOffloadOnlyOnTheMinimumQueue`. 64 KiB is 80 ms of data at 6.5536 Mbit/s:
    /// below it the queue is the minimum.
    #[test]
    fn caps_offload_only_on_the_minimum_queue() {
        let mut failures = Vec::new();
        for (rate, want) in [
            (300_000, true),
            (500_000, true),
            (6_553_599, true),
            (6_553_600, false),
            (10_000_000, false),
            (1_000_000_000, false),
        ] {
            let profile = Profile {
                rate_bits_per_second: rate,
                ..Profile::default()
            };
            if caps_offload(&profile) != want {
                failures.push(format!("caps_offload({rate} bit/s) != {want}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestTbfSentBytes`. The self-test's counter from real `tc -s` output: the tbf's own
    /// line, not the netem above it or the `fq_codel` below.
    #[test]
    fn tbf_sent_bytes_reads_the_tbf() {
        let out = "qdisc netem 1: root refcnt 33 limit 1000 delay 600ms seed 1\n \
                   Sent 527356 bytes 599 pkt (dropped 22, overlimits 0 requeues 0) \n \
                   backlog 0b 0p requeues 0\n\
                   qdisc tbf 2: parent 1: rate 300Kbit burst 3027b lat 1.67s \n \
                   Sent 527300 bytes 598 pkt (dropped 22, overlimits 1696 requeues 0) \n \
                   backlog 0b 0p requeues 0\n\
                   qdisc fq_codel 3: parent 2:1 limit 44p flows 1024 quantum 1514 target 1.75s \
                   interval 3.5s\n \
                   Sent 527356 bytes 599 pkt (dropped 22, overlimits 0 requeues 0) \n";
        assert_eq!(tbf_sent_bytes(out), Ok(527_300));

        let mut failures = Vec::new();
        for bad in [
            "qdisc fq_codel 3: parent 2:1\n Sent 1 bytes 1 pkt\n",
            "qdisc tbf 2: root refcnt 2 rate 300Kbit\n backlog 0b 0p\n",
            "qdisc tbf 2: root refcnt 2 rate 300Kbit\n Sent many bytes 1 pkt\n",
            "qdisc tbf 2: root refcnt 2 rate 300Kbit",
        ] {
            match tbf_sent_bytes(bad) {
                Err(OutputError::Tbf(_)) => {}
                other => failures.push(format!("tbf_sent_bytes({bad:?}) = {other:?}")),
            }
        }
        assert_eq!(
            tbf_sent_bytes("qdisc tbf 2: x\n Sent many bytes\n").map_err(|error| error.to_string()),
            Err("unreadable tc output: strconv.ParseInt: parsing \"many\": invalid syntax".into())
        );
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
