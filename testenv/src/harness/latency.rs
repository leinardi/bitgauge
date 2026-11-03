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

//! The loaded-latency rule of testing.md section 5: each direction measured with the WebSocket or
//! the reserved HTTP/1.1 probe is held to the concurrent ICMP ping's increase over idle, and the
//! grade to the letter of the larger ping increase its basis names. A direction measured over an
//! HTTP/2 or HTTP/3 probe waits behind its own load connection's data, which the ping does not,
//! so it is recorded with the ping figures and not judged.

use super::evaluate::ROUNDING;
use super::gofmt;
use super::ping::{PHASE_DOWNLOAD, PHASE_UPLOAD, Ping, PingPhase};
use super::profiles::Profile;
use super::report::{Direction, ResultSummary, Run};

/// The WebSocket loaded-latency source of measurement.md section 11.
pub const SOURCE_WEBSOCKET: &str = "websocket";
/// The reserved HTTP/1.1 loaded-latency source of measurement.md section 11.
pub const SOURCE_RESERVED: &str = "http-h1-reserved";

/// The rule's ±20 %.
const LATENCY_TOLERANCE: f64 = 0.20;
/// The rule's 5 ms floor, whichever of the two is larger.
const LATENCY_FLOOR_MS: f64 = 5.0;
/// What the ws-blocked profile must show: the reserved probe with at least 10 samples, at most
/// 5 streams beside it, and the notice that says so.
const MIN_FALLBACK_SAMPLES: i64 = 10;
const MAX_RESERVED_STREAMS: i64 = 5;
const RESERVATION_NOTICE: &str = "probe-reservation";
/// A grade read from both directions.
pub const BASIS_BOTH: &str = "download+upload";

/// measurement.md section 11.3's table: an increase below a threshold has the letter at its
/// index, one at or above the last has the last letter.
const GRADE_LETTERS: [&str; 6] = ["A+", "A", "B", "C", "D", "F"];
const GRADE_THRESHOLDS: [f64; 5] = [5.0, 30.0, 60.0, 200.0, 400.0];

/// The letter of an increase.
pub(crate) fn grade_for(increase_ms: f64) -> &'static str {
    GRADE_THRESHOLDS
        .iter()
        .position(|threshold| increase_ms < *threshold)
        .map_or(GRADE_LETTERS[GRADE_LETTERS.len() - 1], |index| {
            GRADE_LETTERS[index]
        })
}

/// The rule's allowance around a ping increase: 20 % of it, or 5 ms when larger.
fn tolerance_ms(ping_increase_ms: f64) -> f64 {
    (LATENCY_TOLERANCE * ping_increase_ms.abs()).max(LATENCY_FLOOR_MS)
}

/// The ping increase's letter, and the letter across a threshold that lies within the tolerance
/// of it.
fn allowed_grades(ping_increase_ms: f64) -> Vec<&'static str> {
    let mut allowed = vec![grade_for(ping_increase_ms)];
    let tolerance = tolerance_ms(ping_increase_ms);
    for (index, threshold) in GRADE_THRESHOLDS.iter().enumerate() {
        if (ping_increase_ms - threshold).abs() > tolerance + ROUNDING {
            continue;
        }
        for letter in &GRADE_LETTERS[index..index + 2] {
            if !allowed.contains(letter) {
                allowed.push(letter);
            }
        }
    }
    allowed
}

/// Whether the rule judges a source; the others are recorded.
fn judged(source: &str) -> bool {
    source == SOURCE_WEBSOCKET || source == SOURCE_RESERVED
}

/// One direction's loaded latency held to the ping's increase in its window, as its summary,
/// whether the rule records it without judging, and its findings.
fn judge_loaded(
    name: &str,
    dir: Option<&Direction>,
    ping: Option<&PingPhase>,
) -> (String, bool, Vec<String>) {
    let Some(loaded) = dir.and_then(|dir| dir.loaded_latency.as_ref()) else {
        return (
            String::new(),
            false,
            vec![format!("{name}: no loaded latency")],
        );
    };
    let ping_increase = ping.and_then(|ping| ping.increase_ms);
    let figures = ping_increase.map_or_else(
        || "no ping samples".to_owned(),
        |ms| format!("ping {ms:+.1} ms"),
    );

    if !loaded.source.is_empty() && !judged(&loaded.source) {
        return (
            format!(
                "{name} loaded latency over {} recorded, not judged ({figures})",
                loaded.source
            ),
            true,
            Vec::new(),
        );
    }

    if !loaded.status.is_empty() {
        return (
            String::new(),
            false,
            vec![format!(
                "{name}: loaded latency {} ({})",
                loaded.status, loaded.reason
            )],
        );
    }
    let Some(engine) = loaded.increase_ms else {
        return (
            String::new(),
            false,
            vec![format!(
                "{name}: loaded latency without an increase over idle"
            )],
        );
    };
    let Some(ping_increase) = ping_increase else {
        return (
            String::new(),
            false,
            vec![format!(
                "{name}: the ping has no samples in the direction's window, or none in idle \
                 latency's"
            )],
        );
    };

    let tolerance = tolerance_ms(ping_increase);
    let summary = format!(
        "{name} loaded {engine:+.1} ms ({}) vs ping {ping_increase:+.1} ms (±{tolerance:.1} ms)",
        loaded.source
    );
    if (engine - ping_increase).abs() > tolerance + ROUNDING {
        let finding = format!("{summary} is outside the tolerance");
        return (summary, false, vec![finding]);
    }
    (summary, false, Vec::new())
}

/// The grade held to the larger ping increase over the directions its basis names;
/// `recorded_directions` are those the rule records without judging, which leave the grade
/// recorded.
fn judge_grade(
    result: &ResultSummary,
    ping: &Ping,
    recorded_directions: &[&str],
) -> (String, Vec<String>) {
    let Some(grade) = result.bufferbloat.as_ref() else {
        if !recorded_directions.is_empty() {
            return (
                "no grade, beside a direction recorded and not judged".to_owned(),
                Vec::new(),
            );
        }
        return (String::new(), vec!["no bufferbloat grade".to_owned()]);
    };

    let basis: Vec<&str> = if grade.basis == BASIS_BOTH {
        vec![PHASE_DOWNLOAD, PHASE_UPLOAD]
    } else {
        vec![grade.basis.as_str()]
    };

    let mut increase = f64::NEG_INFINITY;
    for direction in basis {
        if recorded_directions.contains(&direction) {
            return (
                format!(
                    "grade {} recorded, not judged: its basis {} includes a direction not judged",
                    grade.grade, grade.basis
                ),
                Vec::new(),
            );
        }
        // Any basis but the upload reads the download's figures, as the Go rule did.
        let phase = if direction == PHASE_UPLOAD {
            ping.upload.as_ref()
        } else {
            ping.download.as_ref()
        };
        let Some(phase_increase) = phase.and_then(|phase| phase.increase_ms) else {
            return (
                String::new(),
                vec![format!(
                    "grade {}: the ping has no increase for {direction}",
                    grade.grade
                )],
            );
        };
        increase = increase.max(phase_increase);
    }

    let allowed = allowed_grades(increase);
    let summary = format!(
        "grade {} ({}) vs ping {increase:+.1} ms ({})",
        grade.grade,
        grade.basis,
        allowed.join(" or ")
    );
    if !allowed.contains(&grade.grade.as_str()) {
        let finding = format!("{summary} is not the ping's letter");
        return (summary, vec![finding]);
    }
    (summary, Vec::new())
}

/// What a profile that expects a fallback source must show: that source with at least 10
/// samples in each direction, at most 5 streams, and the probe-reservation notice.
fn judge_fallback(expect: &str, result: &ResultSummary) -> Vec<String> {
    let mut findings = Vec::new();
    for (name, dir) in [
        (PHASE_DOWNLOAD, result.download.as_ref()),
        (PHASE_UPLOAD, result.upload.as_ref()),
    ] {
        let Some((dir, loaded)) =
            dir.and_then(|dir| dir.loaded_latency.as_ref().map(|loaded| (dir, loaded)))
        else {
            continue;
        };
        if loaded.source != expect {
            findings.push(format!(
                "{name}: loaded latency from {}, want {expect}",
                gofmt::quote(&loaded.source)
            ));
        }
        if loaded.samples < MIN_FALLBACK_SAMPLES {
            findings.push(format!(
                "{name}: {} {expect} samples, want at least {MIN_FALLBACK_SAMPLES}",
                loaded.samples
            ));
        }
        if dir.streams > MAX_RESERVED_STREAMS {
            findings.push(format!(
                "{name}: {} streams beside the reserved probe, want at most \
                 {MAX_RESERVED_STREAMS}",
                dir.streams
            ));
        }
    }
    if !result
        .notice_codes()
        .iter()
        .any(|code| code == RESERVATION_NOTICE)
    {
        findings.push(format!("no {RESERVATION_NOTICE} notice"));
    }
    findings
}

impl Run {
    /// The whole rule on a run: each direction, the grade, and the expected fallback, as the
    /// summary parts the verdict carries and the findings.
    pub(crate) fn judge_latency(&self, profile: &Profile) -> (Vec<String>, Vec<String>) {
        let mut parts = Vec::new();
        let mut findings = Vec::new();
        let Some(result) = self.result.as_ref() else {
            return (parts, findings);
        };
        let no_ping = Ping::default();
        let ping = self.ping.as_ref().unwrap_or(&no_ping);

        let mut recorded_directions = Vec::new();
        for (name, dir, phase) in [
            (
                PHASE_DOWNLOAD,
                result.download.as_ref(),
                ping.download.as_ref(),
            ),
            (PHASE_UPLOAD, result.upload.as_ref(), ping.upload.as_ref()),
        ] {
            let (summary, recorded, problems) = judge_loaded(name, dir, phase);
            if recorded {
                recorded_directions.push(name);
            }
            if !summary.is_empty() {
                parts.push(summary);
            }
            findings.extend(problems);
        }

        let (summary, problems) = judge_grade(result, ping, &recorded_directions);
        if !summary.is_empty() {
            parts.push(summary);
        }
        findings.extend(problems);

        if !profile.expect_fallback.is_empty() {
            findings.extend(judge_fallback(profile.expect_fallback, result));
        }
        (parts, findings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::fixtures::{loaded_at, ping_at, profile_at, stable_run};
    use crate::harness::notice::Notice;
    use crate::harness::profiles::MBIT;
    use crate::harness::report::{Bufferbloat, LoadedLatency, Status};

    /// The run's result, which every fixture has.
    fn result(run: &mut Run) -> &mut ResultSummary {
        run.result.as_mut().expect("a fixture with a result")
    }

    fn download(run: &mut Run) -> &mut Direction {
        result(run)
            .download
            .as_mut()
            .expect("a fixture with a download")
    }

    fn upload(run: &mut Run) -> &mut Direction {
        result(run)
            .upload
            .as_mut()
            .expect("a fixture with an upload")
    }

    fn grade(letter: &str, basis: &str, increase_ms: f64) -> Bufferbloat {
        Bufferbloat {
            grade: letter.to_owned(),
            basis: basis.to_owned(),
            increase_ms,
        }
    }

    /// Go: `TestGradeFor`. measurement.md section 11.3: below each threshold its letter, F from
    /// 400 ms.
    #[test]
    fn grade_for_follows_the_table() {
        let mut failures = Vec::new();
        for (increase, want) in [
            (-1.0, "A+"),
            (0.0, "A+"),
            (4.9, "A+"),
            (5.0, "A"),
            (29.9, "A"),
            (30.0, "B"),
            (59.9, "B"),
            (60.0, "C"),
            (199.9, "C"),
            (200.0, "D"),
            (399.9, "D"),
            (400.0, "F"),
            (2000.0, "F"),
        ] {
            if grade_for(increase) != want {
                failures.push(format!(
                    "grade_for({increase}) = {}, want {want}",
                    grade_for(increase)
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestAllowedGrades`. The letter across a threshold is allowed only while the ping
    /// increase lies within its tolerance, ±20 % or 5 ms, of that threshold.
    #[test]
    fn allowed_grades_follow_the_adjacency_rule() {
        let mut failures = Vec::new();
        for (increase, want) in [
            (0.0, &["A+", "A"][..]), // 5 ms from the 5 ms threshold
            (10.0, &["A", "A+"]),    // the 5 ms floor reaches it exactly
            (10.1, &["A"]),          // and no further
            (25.0, &["A", "B"]),     // 5 ms below 30
            (24.9, &["A"]),          // just past it
            (50.0, &["B", "C"]),     // 10 ms below 60
            (49.9, &["B"]),          // its 20 % is 9.98 ms
            (75.0, &["C", "B"]),     // 15 ms above 60
            (75.1, &["C"]),          // its 20 % is 15.02 ms, 15.1 ms past it
            (166.7, &["C", "D"]),    // 20 % of 166.7 is 33.3 ms
            (166.0, &["C"]),         // 34 ms below, 33.2 allowed
            (250.0, &["D", "C"]),    // 50 ms above 200
            (333.4, &["D", "F"]),    // 66.7 ms below 400
            (500.0, &["F", "D"]),    // 100 ms above 400
            (500.1, &["F"]),         // its 20 % is 100.02, 100.1 past it
        ] {
            let got = allowed_grades(increase);
            if got != want {
                failures.push(format!(
                    "allowed_grades({increase}) = {got:?}, want {want:?}"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestLoadedRuleBoundaries`. The increase rule at and just past ±20 % and the 5 ms
    /// floor.
    #[test]
    fn loaded_rule_boundaries() {
        let mut failures = Vec::new();
        for (ping, engine, pass) in [
            (100.0, 120.0, true),
            (100.0, 80.0, true),
            (100.0, 120.1, false),
            (100.0, 79.9, false),
            (10.0, 15.0, true), // 20 % is 2 ms: the 5 ms floor holds
            (10.0, 5.0, true),
            (10.0, 15.1, false),
            (-2.0, 0.0, true), // the engine clamps a negative increase to 0
            (-2.0, 3.1, false),
        ] {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            download(&mut run).loaded_latency = Some(loaded_at(engine));
            run.ping = Some(ping_at(ping, 20.0));
            // The grade follows the larger ping increase, so only the download rule is under
            // test.
            let larger = engine.max(20.0);
            result(&mut run).bufferbloat = Some(grade(grade_for(larger), BASIS_BOTH, larger));
            run.judge(&profile_at(100 * MBIT, true));

            let failed = run.findings.iter().any(|finding| {
                finding.starts_with("download loaded") && finding.ends_with("outside the tolerance")
            });
            if failed == pass {
                failures.push(format!(
                    "ping {ping:+} ms, engine {engine:+} ms: {}",
                    run.verdict
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestGradeRule`. The grade is judged against the larger ping increase of its basis.
    #[test]
    fn grade_rule() {
        let mut failures = Vec::new();
        for (name, down, up, letter, basis, want_pass, want_words) in [
            (
                "its letter",
                20.0,
                45.0,
                "B",
                BASIS_BOTH,
                true,
                "grade B (download+upload) vs ping +45.0 ms (B)",
            ),
            (
                "the larger increase decides",
                45.0,
                20.0,
                "A",
                BASIS_BOTH,
                false,
                "is not the ping's letter",
            ),
            (
                "one direction's basis",
                45.0,
                20.0,
                "A",
                PHASE_UPLOAD,
                true,
                "vs ping +20.0 ms (A)",
            ),
            (
                "adjacent within the tolerance",
                20.0,
                26.0,
                "B",
                BASIS_BOTH,
                true,
                "(A or B)",
            ),
            (
                "two letters away",
                20.0,
                26.0,
                "C",
                BASIS_BOTH,
                false,
                "is not the ping's letter",
            ),
        ] {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            download(&mut run).loaded_latency = Some(loaded_at(down));
            upload(&mut run).loaded_latency = Some(loaded_at(up));
            run.ping = Some(ping_at(down, up));
            result(&mut run).bufferbloat = Some(grade(letter, basis, up));
            run.judge(&profile_at(100 * MBIT, true));
            if (run.status == Status::Pass) != want_pass || !run.verdict.contains(want_words) {
                failures.push(format!("{name}: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestLoadedRuleRefuses`. On a judged direction, an unavailable loaded latency, a
    /// missing increase, a missing grade or a ping without figures fails the run.
    #[test]
    fn loaded_rule_refuses() {
        type Change = fn(&mut Run);
        let cases: [(&str, Change, &str); 6] = [
            (
                "no loaded latency",
                |run| upload(run).loaded_latency = None,
                "upload: no loaded latency",
            ),
            (
                "unavailable",
                |run| {
                    download(run).loaded_latency = Some(LoadedLatency {
                        source: SOURCE_WEBSOCKET.to_owned(),
                        status: "unavailable".to_owned(),
                        reason: "insufficient-samples".to_owned(),
                        samples: 4,
                        ..LoadedLatency::default()
                    });
                },
                "download: loaded latency unavailable (insufficient-samples)",
            ),
            (
                "no increase",
                |run| {
                    if let Some(loaded) = upload(run).loaded_latency.as_mut() {
                        loaded.increase_ms = None;
                    }
                },
                "upload: loaded latency without an increase over idle",
            ),
            (
                "no grade",
                |run| result(run).bufferbloat = None,
                "no bufferbloat grade",
            ),
            (
                "no ping in the window",
                |run| {
                    if let Some(ping) = run.ping.as_mut() {
                        ping.download = None;
                    }
                },
                "download: the ping has no samples",
            ),
            (
                "no ping at all",
                |run| run.ping = None,
                "upload: the ping has no samples",
            ),
        ];
        let mut failures = Vec::new();
        for (name, change, says) in cases {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            change(&mut run);
            run.judge(&profile_at(100 * MBIT, true));
            if run.status != Status::Fail || !run.verdict.contains(says) {
                failures.push(format!("{name}: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestHTTP2Recorded`. A direction over the HTTP/2 or HTTP/3 probe is recorded with the
    /// ping figures, never judged, and so is a grade whose basis includes it.
    #[test]
    fn http2_recorded() {
        let mut failures = Vec::new();
        for source in ["http-h2", "http-h3"] {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            download(&mut run).loaded_latency = Some(LoadedLatency {
                source: source.to_owned(),
                samples: 30,
                median_ms: 400.0,
                increase_ms: Some(350.0),
                ..LoadedLatency::default()
            });
            result(&mut run).bufferbloat = Some(grade("D", BASIS_BOTH, 350.0));
            run.judge(&profile_at(100 * MBIT, true));
            if run.status != Status::Pass
                || !run.verdict.contains(&format!(
                    "download loaded latency over {source} recorded, not judged (ping +20.0 ms)"
                ))
                || !run.verdict.contains("grade D recorded, not judged")
            {
                failures.push(format!("{source}: {}", run.verdict));
            }

            // An unavailable one over that source is recorded too.
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            download(&mut run).loaded_latency = Some(LoadedLatency {
                source: source.to_owned(),
                status: "unavailable".to_owned(),
                reason: "insufficient-samples".to_owned(),
                ..LoadedLatency::default()
            });
            result(&mut run).bufferbloat = Some(grade("A", PHASE_UPLOAD, 20.0));
            run.judge(&profile_at(100 * MBIT, true));
            if run.status != Status::Pass
                || !run
                    .verdict
                    .contains("grade A (upload) vs ping +20.0 ms (A)")
            {
                failures.push(format!("{source} unavailable: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestExpectedFallback`. The ws-blocked profile is held to the reserved HTTP/1.1 probe:
    /// its source, at least 10 samples, at most 5 streams and the probe-reservation notice.
    #[test]
    fn expected_fallback() {
        type Change = fn(&mut Run);
        let mut profile = profile_at(100 * MBIT, true);
        profile.expect_fallback = SOURCE_RESERVED;

        let reserved = || {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            for take in [download as fn(&mut Run) -> &mut Direction, upload] {
                let dir = take(&mut run);
                dir.streams = 5;
                if let Some(loaded) = dir.loaded_latency.as_mut() {
                    SOURCE_RESERVED.clone_into(&mut loaded.source);
                    loaded.samples = 10;
                }
            }
            result(&mut run).notices = Some(vec![
                Notice::parse(r#"{"code":"probe-reservation","streams":5}"#).expect("a notice"),
            ]);
            run
        };

        let mut pass = reserved();
        pass.judge(&profile);
        assert!(
            pass.status == Status::Pass && pass.verdict.contains("(http-h1-reserved) vs ping"),
            "the reserved fallback at its bounds: {}",
            pass.verdict
        );

        let cases: [(&str, Change, &str); 4] = [
            (
                "over the WebSocket",
                |run| {
                    if let Some(loaded) = upload(run).loaded_latency.as_mut() {
                        SOURCE_WEBSOCKET.clone_into(&mut loaded.source);
                    }
                },
                "upload: loaded latency from \"websocket\", want http-h1-reserved",
            ),
            (
                "9 samples",
                |run| {
                    if let Some(loaded) = download(run).loaded_latency.as_mut() {
                        loaded.samples = 9;
                    }
                },
                "download: 9 http-h1-reserved samples, want at least 10",
            ),
            (
                "6 streams",
                |run| upload(run).streams = 6,
                "upload: 6 streams beside the reserved probe, want at most 5",
            ),
            (
                "no notice",
                |run| result(run).notices = None,
                "no probe-reservation notice",
            ),
        ];
        let mut failures = Vec::new();
        for (name, change, says) in cases {
            let mut run = reserved();
            change(&mut run);
            run.judge(&profile);
            if run.status != Status::Fail || !run.verdict.contains(says) {
                failures.push(format!("{name}: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
