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

//! The ICMP ping that runs beside the browser, the reference of the loaded-latency rule
//! (testing.md section 5). iputils ping with `-D` prints each reply with the wall-clock time it
//! arrived; less its round trip, that is when its request was sent, which places it in the phase
//! windows the browser driver records from the Test screen, on the same host clock.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use super::gofmt;
use super::report::{create_dir, read_file, write_file};

/// The idle phase, as the browser driver names the Test screen's measuring phases.
pub const PHASE_IDLE: &str = "idle";
/// The download phase.
pub const PHASE_DOWNLOAD: &str = "download";
/// The upload phase.
pub const PHASE_UPLOAD: &str = "upload";

/// A phase step's state while its phase runs (ui/screens.md section 1).
const STATE_ACTIVE: &str = "active";
/// `I_s` of measurement.md section 11: max(1 s, 4 × RTT).
const SLOW_START_FLOOR_NS: i128 = 1_000_000_000;
const SLOW_START_RTTS: f64 = 4.0;
const NANO_DIGITS: usize = 9;
const NANOS_PER_MS: f64 = 1e6;
/// The lines ping prints last: its packet counts and its round-trip summary.
const PING_SUMMARY_LINES: usize = 2;

/// One reply line of `ping -D`: `[1760000000.123456] 64 bytes from …: icmp_seq=1 ttl=64
/// time=50.3 ms`. Go's `\d` and `\b` are ASCII.
static PING_REPLY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\[([0-9]+)\.([0-9]+)\] .*(?-u:\b)time=([0-9.]+) ms")
        .unwrap_or_else(|_| unreachable!("the ping reply pattern is a constant that compiles"))
});

/// A wall-clock instant in nanoseconds since the Unix epoch, Go's `time.Time` without its range
/// limits.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct WallTime(i128);

impl WallTime {
    /// `time.Unix(seconds, nanos)`.
    #[must_use]
    pub fn from_unix(seconds: i64, nanos: i64) -> Self {
        Self(i128::from(seconds) * 1_000_000_000 + i128::from(nanos))
    }

    /// `time.UnixMilli(millis)`.
    #[must_use]
    pub fn from_unix_millis(millis: i64) -> Self {
        Self(i128::from(millis) * 1_000_000)
    }

    /// The instant `nanos` later, or earlier when negative.
    #[must_use]
    pub const fn add_nanos(self, nanos: i128) -> Self {
        Self(self.0 + nanos)
    }

    /// Nanoseconds since the Unix epoch.
    #[must_use]
    pub const fn unix_nanos(self) -> i128 {
        self.0
    }
}

/// One ping reply: when its request was sent, on the wall clock, and its round trip.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PingSample {
    /// When the request was sent: the reply's arrival less its round trip.
    pub sent_at: WallTime,
    /// The round trip.
    pub rtt_ms: f64,
}

/// `time.Duration(ms * float64(time.Millisecond))`: a float of milliseconds truncated to whole
/// nanoseconds.
#[expect(
    clippy::cast_possible_truncation,
    reason = "Go's float64 to Duration conversion"
)]
fn ms_to_nanos(ms: f64) -> i128 {
    i128::from((ms * NANOS_PER_MS) as i64)
}

/// The replies of `ping -D` output. Every other line, the header, a timeout or the summary,
/// carries no round trip and is skipped.
#[must_use]
pub fn parse_ping(output: &str) -> Vec<PingSample> {
    output
        .split('\n')
        .filter_map(|line| {
            let captures = PING_REPLY.captures(line.trim())?;
            let seconds = captures[1].parse::<i64>().ok()?;
            let padded = format!("{}{}", &captures[2], "0".repeat(NANO_DIGITS));
            let fraction = padded[..NANO_DIGITS].parse::<i64>().ok()?;
            let rtt = gofmt::parse_float(&captures[3]).ok()?;
            let arrived = WallTime::from_unix(seconds, fraction);
            Some(PingSample {
                sent_at: arrived.add_nanos(-ms_to_nanos(rtt)),
                rtt_ms: rtt,
            })
        })
        .collect()
}

/// One change of a Test screen phase step's state, with the wall-clock time the page saw it, in
/// Unix milliseconds, as the browser driver records it.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseTransition {
    /// The phase.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub phase: String,
    /// Its new state.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub state: String,
    /// When the page saw it.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub at_ms: i64,
}

/// The browser driver's `<browser>.phases.json`.
///
/// # Errors
///
/// A file that does not parse.
pub fn parse_phases(data: &[u8]) -> Result<Vec<PhaseTransition>, String> {
    let transitions: Option<Vec<PhaseTransition>> =
        gofmt::unmarshal(data).map_err(|error| format!("read the phase transitions: {error}"))?;
    Ok(transitions.unwrap_or_default())
}

/// When a phase ran: from its step turning active to its leaving that state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PhaseWindow {
    /// When the step turned active.
    pub from: WallTime,
    /// When it left the active state.
    pub to: WallTime,
}

/// Each phase's first run of the active state; a phase that never left it has no window.
#[must_use]
pub fn phase_windows(transitions: &[PhaseTransition]) -> BTreeMap<String, PhaseWindow> {
    let mut windows = BTreeMap::new();
    let mut started: BTreeMap<&str, WallTime> = BTreeMap::new();
    for transition in transitions {
        let seen = WallTime::from_unix_millis(transition.at_ms);
        if windows.contains_key(&transition.phase) {
            continue;
        }
        let active = transition.state == STATE_ACTIVE;
        match started.get(transition.phase.as_str()) {
            None if active => {
                started.insert(&transition.phase, seen);
            }
            Some(from) if !active => {
                windows.insert(
                    transition.phase.clone(),
                    PhaseWindow {
                        from: *from,
                        to: seen,
                    },
                );
            }
            None | Some(_) => {}
        }
    }
    windows
}

/// The ping over one phase's window: its samples, their median and, for a direction, the
/// increase of that median over idle latency's.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingPhase {
    /// The replies whose requests were sent in the window.
    pub samples: i64,
    /// Their median round trip.
    pub median_ms: f64,
    /// The median's increase over idle latency's, beside an idle median.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub increase_ms: Option<f64>,
}

/// The ICMP ping that ran alongside the browser: ping's own closing summary, the file its full
/// output went to, relative to the report directory, and its figures per phase window.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Ping {
    /// ping's last two lines, joined.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub summary: String,
    /// The full output's file, relative to the report directory.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub log: String,
    /// Idle latency's window.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle: Option<PingPhase>,
    /// The download's window after its `I_s`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download: Option<PingPhase>,
    /// The upload's window after its `I_s`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload: Option<PingPhase>,
}

/// The samples placed by their send time: idle latency's whole window, and each direction's
/// window after its first `I_s`, max(1 s, 4 × the idle median) (testing.md section 5). A
/// direction's increase exists only beside an idle median; a window without samples has no
/// figures.
#[must_use]
pub fn summarize_ping(samples: &[PingSample], windows: &BTreeMap<String, PhaseWindow>) -> Ping {
    let mut ping = Ping {
        idle: windows
            .get(PHASE_IDLE)
            .and_then(|window| ping_phase(samples, window.from, window.to)),
        ..Ping::default()
    };
    let slow_start = ping.idle.map_or(SLOW_START_FLOOR_NS, |idle| {
        SLOW_START_FLOOR_NS.max(ms_to_nanos(SLOW_START_RTTS * idle.median_ms))
    });
    let idle_median = ping.idle.map(|idle| idle.median_ms);
    let direction = |phase: &str| {
        let window = windows.get(phase)?;
        let mut figures = ping_phase(samples, window.from.add_nanos(slow_start), window.to)?;
        figures.increase_ms = idle_median.map(|idle| figures.median_ms - idle);
        Some(figures)
    };
    ping.download = direction(PHASE_DOWNLOAD);
    ping.upload = direction(PHASE_UPLOAD);
    ping
}

/// The samples sent in `[from, to)`, `None` when there are none.
fn ping_phase(samples: &[PingSample], from: WallTime, to: WallTime) -> Option<PingPhase> {
    let rtts: Vec<f64> = samples
        .iter()
        .filter(|sample| sample.sent_at >= from && sample.sent_at < to)
        .map(|sample| sample.rtt_ms)
        .collect();
    if rtts.is_empty() {
        return None;
    }
    Some(PingPhase {
        samples: i64::try_from(rtts.len()).unwrap_or(i64::MAX),
        median_ms: median(&rtts),
        increase_ms: None,
    })
}

/// The middle value, or the mean of the two middle values of an even count.
pub(crate) fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        return sorted[middle];
    }
    f64::midpoint(sorted[middle - 1], sorted[middle])
}

/// Where one browser run's files go, relative to the report directory: the export, the phase
/// transitions the driver recorded beside it, the ping's full output, and the directory of the
/// compatibility step's outputs on a Compat profile.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Artifacts {
    /// The downloaded result.
    pub export: String,
    /// The driver's phase transitions.
    pub phases: String,
    /// The ping's full output.
    pub ping_log: String,
    /// The compatibility step's directory.
    pub compat: String,
}

/// The files of one profile in one browser.
#[must_use]
pub fn artifacts_for(profile: &str, browser: &str) -> Artifacts {
    let dir = format!("exports/{profile}");
    Artifacts {
        export: format!("{dir}/{browser}.json"),
        phases: format!("{dir}/{browser}.phases.json"),
        ping_log: format!("{dir}/{browser}.ping.txt"),
        compat: format!("{dir}/{browser}-compat"),
    }
}

/// What [`record_ping`] kept: the ping, unless its output could not be written, and the error,
/// which can come beside a ping summarized without phase figures, as Go returned both.
#[derive(Clone, Debug, PartialEq)]
pub struct RecordedPing {
    /// The ping, `None` when its output could not be written.
    pub ping: Option<Ping>,
    /// What went wrong, `None` for a ping fully recorded.
    pub error: Option<String>,
}

impl RecordedPing {
    const fn failed(ping: Option<Ping>, error: String) -> Self {
        Self {
            ping,
            error: Some(error),
        }
    }
}

/// Keeps the ping's full output beside the export and summarizes it over the phase windows the
/// driver recorded. A run whose driver wrote no phases, as when the browser failed early, keeps
/// the output and ping's own summary without phase figures. The output cannot be written, or the
/// phases file cannot be read or does not parse, is the error.
#[must_use]
pub fn record_ping(out_dir: &Path, artifacts: &Artifacts, output: &str) -> RecordedPing {
    let log_path = out_dir.join(&artifacts.ping_log);
    if let Some(parent) = log_path.parent()
        && let Err(error) = create_dir(parent)
    {
        return RecordedPing::failed(None, format!("create the export directory: {error}"));
    }
    if let Err(error) = write_file(&log_path, output.as_bytes()) {
        return RecordedPing::failed(None, format!("write the ping output: {error}"));
    }

    // Go's strings.Split, which keeps a carriage return where lines() drops it.
    #[expect(
        clippy::str_split_at_newline,
        reason = "Go's strings.Split keeps a \\r"
    )]
    let lines: Vec<&str> = output.trim().split('\n').collect();
    let summary = lines[lines.len().saturating_sub(PING_SUMMARY_LINES)..].join(" ");
    let ping = Ping {
        summary,
        log: artifacts.ping_log.clone(),
        ..Ping::default()
    };

    let data = match read_file(&out_dir.join(&artifacts.phases)) {
        Ok(None) => {
            return RecordedPing {
                ping: Some(ping),
                error: None,
            };
        }
        Ok(Some(data)) => data,
        Err(error) => {
            return RecordedPing::failed(
                Some(ping),
                format!("read the phase transitions: {error}"),
            );
        }
    };
    let transitions = match parse_phases(&data) {
        Ok(transitions) => transitions,
        Err(error) => return RecordedPing::failed(Some(ping), error),
    };
    let figures = summarize_ping(&parse_ping(output), &phase_windows(&transitions));
    RecordedPing {
        ping: Some(Ping {
            summary: ping.summary,
            log: ping.log,
            ..figures
        }),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// iputils ping -D as the shaper runs it: the header, replies, a timeout and the summary.
    const PING_OUTPUT: &str = "PING bitgauge-test-abcd-guard (172.18.0.2) 56(84) bytes of data.
[1760000000.250000] 64 bytes from 172.18.0.2: icmp_seq=1 ttl=64 time=50.0 ms
[1760000000.45] 64 bytes from 172.18.0.2: icmp_seq=2 ttl=64 time=50.4 ms
no answer yet for icmp_seq=3
[1760000001.123456789] 64 bytes from 172.18.0.2: icmp_seq=4 ttl=64 time=123 ms

--- bitgauge-test-abcd-guard ping statistics ---
4 packets transmitted, 3 received, 25% packet loss, time 1000ms
rtt min/avg/max/mdev = 50.000/74.466/123.000/34.300 ms";

    /// Go: `TestParsePing`.
    #[test]
    #[expect(clippy::float_cmp, reason = "the Go test compares these exactly")]
    fn parse_ping_reads_the_replies() {
        let samples = parse_ping(PING_OUTPUT);
        assert_eq!(samples.len(), 3, "{samples:?}");
        let mut failures = Vec::new();
        // The send time is the arrival less the round trip.
        for (index, (sent, rtt)) in [
            (WallTime::from_unix(1_760_000_000, 200_000_000), 50.0),
            (WallTime::from_unix(1_760_000_000, 399_600_000), 50.4),
            (WallTime::from_unix(1_760_000_001, 456_789), 123.0),
        ]
        .into_iter()
        .enumerate()
        {
            let got = samples[index];
            if got.rtt_ms != rtt || (got.sent_at.unix_nanos() - sent.unix_nanos()).abs() > 1000 {
                failures.push(format!(
                    "sample {index} = {got:?}, want {sent:?} {rtt:.1} ms"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestPhaseWindows`.
    #[test]
    fn phase_windows_take_the_first_active_run() {
        let transitions = parse_phases(
            br#"[
            {"phase":"idle","state":"pending","atMs":1000},
            {"phase":"idle","state":"active","atMs":2000},
            {"phase":"idle","state":"done","atMs":7000},
            {"phase":"download","state":"active","atMs":7000},
            {"phase":"download","state":"done","atMs":19000},
            {"phase":"download","state":"active","atMs":40000},
            {"phase":"upload","state":"active","atMs":19000}
        ]"#,
        )
        .expect("the phases parse");
        let windows = phase_windows(&transitions);

        // The first run of the active state counts; a phase still active has no window.
        let window = |from: i64, to: i64| PhaseWindow {
            from: WallTime::from_unix_millis(from),
            to: WallTime::from_unix_millis(to),
        };
        assert_eq!(windows.get(PHASE_IDLE), Some(&window(2000, 7000)));
        assert_eq!(windows.get(PHASE_DOWNLOAD), Some(&window(7000, 19000)));
        assert!(!windows.contains_key(PHASE_UPLOAD), "{windows:?}");
        assert_eq!(windows.len(), 2);

        assert!(parse_phases(b"{").is_err(), "a broken phases file was read");
    }

    /// A ping every 200 ms from `start` for `count` samples, each with its round trip.
    fn ping_every(start: WallTime, count: i64, rtt: impl Fn(i64) -> f64) -> Vec<PingSample> {
        (0..count)
            .map(|index| PingSample {
                sent_at: start.add_nanos(i128::from(index) * 200_000_000),
                rtt_ms: rtt(index),
            })
            .collect()
    }

    /// Go: `TestSummarizePing`. The samples are placed by their send time, each direction
    /// starting after its `I_s`: max(1 s, 4 × the idle median).
    #[test]
    #[expect(clippy::cast_precision_loss, reason = "small sample indices")]
    fn summarize_ping_places_the_samples() {
        let start = WallTime::from_unix_millis(1_000_000);
        let at = |seconds: f64| start.add_nanos(ms_to_nanos(seconds * 1000.0));

        // Idle 0–5 s at 300 ms, so I_s is 1.2 s; download 5–15 s, its first 1.2 s at 900 ms and
        // the rest at 400 ms; upload 15–25 s at 500 ms throughout, its ramp at 1.0 s past I_s.
        let samples = ping_every(start, 125, |index| {
            let sent = index as f64 * 0.2;
            if sent < 5.0 {
                300.0
            } else if sent < 6.2 {
                900.0
            } else if sent < 15.0 {
                400.0
            } else {
                500.0
            }
        });
        let windows: BTreeMap<String, PhaseWindow> = [
            (PHASE_IDLE, (0.0, 5.0)),
            (PHASE_DOWNLOAD, (5.0, 15.0)),
            (PHASE_UPLOAD, (15.0, 25.0)),
        ]
        .into_iter()
        .map(|(phase, (from, to))| {
            (
                phase.to_owned(),
                PhaseWindow {
                    from: at(from),
                    to: at(to),
                },
            )
        })
        .collect();

        let ping = summarize_ping(&samples, &windows);
        assert_eq!(
            ping.idle,
            Some(PingPhase {
                samples: 25,
                median_ms: 300.0,
                increase_ms: None
            })
        );
        assert_eq!(
            ping.download,
            Some(PingPhase {
                samples: 44,
                median_ms: 400.0,
                increase_ms: Some(100.0)
            })
        );
        let upload = ping.upload.expect("upload figures");
        assert_eq!((upload.samples, upload.increase_ms), (44, Some(200.0)));

        // I_s never falls below 1 s; without idle latency there is no increase.
        let only_download: BTreeMap<String, PhaseWindow> = [(
            PHASE_DOWNLOAD.to_owned(),
            PhaseWindow {
                from: at(0.0),
                to: at(10.0),
            },
        )]
        .into_iter()
        .collect();
        let short = summarize_ping(&ping_every(start, 50, |_| 10.0), &only_download);
        assert!(short.idle.is_none(), "{short:?}");
        let download = short.download.expect("download figures");
        assert_eq!((download.samples, download.increase_ms), (45, None));

        // A window without samples has no figures.
        let empty = summarize_ping(&[], &windows);
        assert!(
            empty.idle.is_none() && empty.download.is_none() && empty.upload.is_none(),
            "{empty:?}"
        );

        assert!((median(&[4.0, 1.0, 3.0, 2.0]) - 2.5).abs() < f64::EPSILON);
    }

    /// Go: `TestRecordPing`. The full output is kept beside the export and summarized over the
    /// recorded phases; without a phases file the summary is ping's own.
    #[test]
    fn record_ping_keeps_and_summarizes() {
        fn recorded(recorded: RecordedPing) -> Ping {
            assert_eq!(recorded.error, None, "the ping is recorded");
            recorded.ping.expect("a ping")
        }

        let temp = tempfile::tempdir().expect("a temporary directory");
        let out = temp.path();
        let artifacts = artifacts_for("ci-10m", "firefox");

        let ping = recorded(record_ping(out, &artifacts, PING_OUTPUT));
        let logged = std::fs::read_to_string(out.join(&artifacts.ping_log)).expect("the log");
        assert_eq!(logged, PING_OUTPUT, "the ping output was not kept");
        assert_eq!(ping.log, "exports/ci-10m/firefox.ping.txt");
        assert!(ping.idle.is_none());
        assert_eq!(
            ping.summary,
            "4 packets transmitted, 3 received, 25% packet loss, time 1000ms rtt \
             min/avg/max/mdev = 50.000/74.466/123.000/34.300 ms"
        );

        std::fs::write(
            out.join(&artifacts.phases),
            concat!(
                r#"[{"phase":"idle","state":"active","atMs":1760000000000},"#,
                r#"{"phase":"idle","state":"done","atMs":1760000001000}]"#
            ),
        )
        .expect("the phases are written");
        let ping = recorded(record_ping(out, &artifacts, PING_OUTPUT));
        let idle = ping.idle.expect("idle figures");
        assert_eq!((idle.samples, idle.median_ms), (2, 50.2));
        assert!(!ping.log.is_empty());

        std::fs::write(out.join(&artifacts.phases), "not json").expect("the phases are written");
        assert!(
            record_ping(out, &artifacts, PING_OUTPUT).error.is_some(),
            "a broken phases file was summarized"
        );
    }
}
