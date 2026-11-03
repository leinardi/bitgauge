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

//! The Go tests' shared fixtures (`evaluate_test.go`, `harness_unit_test.go`), and the report the
//! golden files under `testdata/` were written from. Those files are the Go harness's own output
//! for the same values: a throwaway `go test -tags=harness -overlay` file outside the repository
//! built the same report with `NewReport`, `Judge` and `Write` and copied report.json and
//! report.md here, and did the same for `NewContinuousReport` (continuous-report.json and .md),
//! `WriteGoResponsiveness` and three `Judge` verdicts. The Markdown goldens are named `.md.txt`
//! so the markdownlint hook, which fixes in place, leaves Go's bytes alone.

use std::collections::BTreeMap;
use std::time::Duration;

use jiff::Timestamp;

use super::compat::{Compat, CompatClient};
use super::latency::{BASIS_BOTH, SOURCE_WEBSOCKET};
use super::ping::{Ping, PingPhase};
use super::profiles::{self, Preset, Profile, RESPONSIVENESS_H1, RESPONSIVENESS_MEASURED};
use super::report::{
    Bufferbloat, Direction, LoadedLatency, Report, Responsiveness, ResultSummary, Run, Status,
    Throughput,
};
use super::shaper::expected_goodput;
use super::usage::Usage;

/// netguard's counters after a clean run.
pub(crate) fn zero() -> BTreeMap<String, u64> {
    ["egress", "dns", "loopback"]
        .into_iter()
        .map(|name| (name.to_owned(), 0))
        .collect()
}

/// A measured loaded latency over the WebSocket, `increase_ms` above an idle median of 50 ms.
pub(crate) fn loaded_at(increase_ms: f64) -> LoadedLatency {
    LoadedLatency {
        source: SOURCE_WEBSOCKET.to_owned(),
        samples: 40,
        median_ms: 50.0 + increase_ms,
        increase_ms: Some(increase_ms),
        ..LoadedLatency::default()
    }
}

/// The ping beside it: 50 ms idle, and each direction's increase over that.
pub(crate) fn ping_at(down_ms: f64, up_ms: f64) -> Ping {
    Ping {
        idle: Some(PingPhase {
            samples: 50,
            median_ms: 50.0,
            increase_ms: None,
        }),
        download: Some(PingPhase {
            samples: 40,
            median_ms: 50.0 + down_ms,
            increase_ms: Some(down_ms),
        }),
        upload: Some(PingPhase {
            samples: 40,
            median_ms: 50.0 + up_ms,
            increase_ms: Some(up_ms),
        }),
        ..Ping::default()
    }
}

/// A completed, shaped run whose iperf3 pair sits on the configured goodput of `rate`, with both
/// headlines at the given fractions of it, and both loaded latencies and the grade on the ping's
/// 20 ms increase.
pub(crate) fn stable_run(rate: i64, down_fraction: f64, up_fraction: f64) -> Run {
    let goodput = expected_goodput(rate);
    let pair = Throughput {
        download_bits_per_second: goodput,
        upload_bits_per_second: goodput,
        seconds: 10.0,
    };
    let direction = |fraction: f64| Direction {
        status: "measured".to_owned(),
        bits_per_second: goodput * fraction,
        streams: 6,
        loaded_latency: Some(loaded_at(20.0)),
        ..Direction::default()
    };
    Run {
        status: Status::Recorded,
        shaped: true,
        reference_before: Some(pair),
        reference_after: Some(pair),
        result: Some(ResultSummary {
            status: "complete".to_owned(),
            download: Some(direction(down_fraction)),
            upload: Some(direction(up_fraction)),
            bufferbloat: Some(Bufferbloat {
                grade: "A".to_owned(),
                basis: BASIS_BOTH.to_owned(),
                increase_ms: 20.0,
            }),
            ..ResultSummary::default()
        }),
        ping: Some(ping_at(20.0, 20.0)),
        egress: Some(zero()),
        ..Run::default()
    }
}

pub(crate) fn profile_at(rate: i64, shaped: bool) -> Profile {
    Profile {
        name: "test".to_owned(),
        rate_bits_per_second: rate,
        shaped,
        preset: Preset::Standard,
        ..Profile::default()
    }
}

/// The started time of `TestReport`, 2026-10-09T12:30:00Z.
pub(crate) fn report_started() -> Timestamp {
    Timestamp::new(1_791_549_000, 0).expect("2026-10-09T12:30:00Z")
}

/// `TestReport`'s floor report: a judged run, a failed one and a superseded inconclusive one.
#[expect(clippy::too_many_lines, reason = "one Go fixture, kept whole")]
pub(crate) fn floor_report() -> Report {
    let spec = profiles::lookup("floor").expect("the floor tier");
    let started = report_started();
    let mut report = Report::new(&spec, "abcd1234", started);
    report.finished = started
        .checked_add(Duration::from_secs(3600))
        .expect("an hour later");
    let measured = |rate: f64, window_ms: f64, median_ms: f64, increase_ms: f64| Direction {
        status: "measured".to_owned(),
        bits_per_second: rate,
        window_ms,
        loaded_latency: Some(LoadedLatency {
            source: SOURCE_WEBSOCKET.to_owned(),
            samples: 40,
            median_ms,
            increase_ms: Some(increase_ms),
            ..LoadedLatency::default()
        }),
        ..Direction::default()
    };
    let phase = |samples: i64, median_ms: f64, increase_ms: Option<f64>| PingPhase {
        samples,
        median_ms,
        increase_ms,
    };
    let client = |download: f64, upload: f64| CompatClient {
        download_bits_per_second: download,
        upload_bits_per_second: upload,
        ..CompatClient::default()
    };
    let throughput = |download: f64, upload: f64, seconds: f64| Throughput {
        download_bits_per_second: download,
        upload_bits_per_second: upload,
        seconds,
    };
    report.runs = vec![
        Run {
            profile: "floor-300k-600ms-vpn".to_owned(),
            browser: "firefox".to_owned(),
            status: Status::Recorded,
            attempt: 1,
            shaped: true,
            result: Some(ResultSummary {
                status: "complete".to_owned(),
                preset: Preset::Extended.as_str().to_owned(),
                download: Some(Direction {
                    responsiveness: Some(Responsiveness {
                        state: RESPONSIVENESS_MEASURED.to_owned(),
                        protocol: "h2".to_owned(),
                        samples: 31,
                        rpm: 95.0,
                    }),
                    ..measured(281_000.0, 12_400.0, 760.0, 160.0)
                }),
                upload: Some(Direction {
                    responsiveness: Some(Responsiveness {
                        state: RESPONSIVENESS_H1.to_owned(),
                        protocol: "http/1.1".to_owned(),
                        ..Responsiveness::default()
                    }),
                    ..measured(290_000.0, 11_000.0, 790.0, 190.0)
                }),
                bufferbloat: Some(Bufferbloat {
                    grade: "C".to_owned(),
                    basis: BASIS_BOTH.to_owned(),
                    increase_ms: 190.0,
                }),
                ..ResultSummary::default()
            }),
            ping: Some(Ping {
                summary: "120 packets transmitted, 120 received, 0% packet loss".to_owned(),
                log: "exports/floor-300k-600ms-vpn/firefox.ping.txt".to_owned(),
                idle: Some(phase(30, 600.0, None)),
                download: Some(phase(60, 750.0, Some(150.0))),
                upload: Some(phase(60, 770.0, Some(170.0))),
            }),
            self_test: Some(throughput(299_000.0, 301_000.0, 5.0)),
            reference_before: Some(throughput(298_000.0, 297_000.0, 20.0)),
            reference_after: Some(throughput(296_000.0, 299_500.0, 20.0)),
            client_usage: Some(Usage {
                cpu_seconds: 40.5,
                wall_seconds: 27.0,
                peak_memory_bytes: 812_400_000,
            }),
            egress: Some(zero()),
            compat: Some(Compat {
                librespeed: Some(client(280_000.0, 270_000.0)),
                goresponsiveness: Some(CompatClient {
                    rpm: 61.0,
                    estimate: true,
                    ..client(250_000.0, 240_000.0)
                }),
                openspeedtest: Some(client(275_000.0, 265_000.0)),
            }),
            ..Run::default()
        },
        Run {
            profile: "floor-300k-300ms-1pct-loss".to_owned(),
            browser: "webkit".to_owned(),
            status: Status::Failed,
            attempt: 1,
            error: "shaper | self-test".to_owned(),
            shaped: true,
            ..Run::default()
        },
        Run {
            profile: "floor-300k-300ms-1pct-loss".to_owned(),
            browser: "chromium".to_owned(),
            status: Status::Inconclusive,
            attempt: 1,
            rerun: true,
            shaped: true,
            verdict: "inconclusive: unstable reference; upload: iperf3 before (290.0 kbit/s) and \
                      after (250.0 kbit/s) differ by 14.8 %"
                .to_owned(),
            ..Run::default()
        },
    ];
    report.runs[0].judge(&spec.profiles[1]);
    report
}
