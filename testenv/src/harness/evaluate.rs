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

//! The evaluator: a completed run judged against testing.md section 5 on the iperf3 reference
//! method of decisions.md section 35, exactly as written and nothing looser. Boundaries are
//! inclusive, the only slack float rounding (`1e-9`), a rate between the table's rows has no
//! tolerance and fails, and inconclusive is never a pass.

use std::collections::BTreeMap;

use go_compat::quote::quote;

use super::profiles::{
    GBIT, MBIT, PathBRule, Profile, RESPONSIVENESS_H1, RESPONSIVENESS_MEASURED,
    RESPONSIVENESS_UNCERTAIN,
};
use super::report::{Direction, Responsiveness, Run, Status, Throughput, rate};
use super::shaper::configured_goodput;

/// What every report says about how its runs are judged.
pub const TOLERANCES: &str = "testing.md section 5: each direction's headline against \
    mean(iperf3 before, after), and its loaded latency against the concurrent ICMP ping, judged \
    per run as pass, fail or inconclusive";

/// The loaded-latency rule of testing.md section 5 as every report states it.
pub const LATENCY_RULE: &str = "each direction measured with websocket or http-h1-reserved: its \
    increase over idle within ±20 % or 5 ms, whichever is larger, of the ICMP ping's increase \
    from idle latency's window to the direction's after I_s; the grade on the letter of the \
    larger ping increase its basis names, or the adjacent letter within that tolerance of a \
    threshold; http-h2 and http-h3 recorded, not judged";

/// testing.md's 5 %: iperf3 before against after, and each against the configured goodput.
const STABILITY_BOUND: f64 = 0.05;
/// Absorbs float error at a boundary; it widens no bound by any measurable amount.
pub(crate) const ROUNDING: f64 = 1e-9;
/// Where the browser's CPU is the limit and the result must say so.
const CPU_BOUND_RATE: i64 = 2500 * MBIT;
/// The run and its one re-run.
const MAX_ATTEMPTS: i64 = 2;
const PERCENT: f64 = 100.0;

/// The tolerance table of testing.md section 5: at or below 1 Mbit/s.
const TOLERANCE_FLOOR: f64 = 0.15;
/// 10 to 100 Mbit/s, and 1 Gbit.
const TOLERANCE_MIDDLE: f64 = 0.10;
/// 2.5 Gbit and above, the browser's CPU the limit.
const TOLERANCE_CEILING: f64 = 0.20;

/// netguard's counters (Egress, DNS and Loopback), every one of which a run must carry. The
/// wave 2 netguard port holds its own list to this one.
pub const COUNTER_NAMES: [&str; 3] = ["egress", "dns", "loopback"];

/// The headline tolerance of testing.md section 5 for a profile's link rate; `None` when the
/// table has no row for it.
#[must_use]
pub const fn tolerance(rate_bits_per_second: i64) -> Option<f64> {
    if rate_bits_per_second <= MBIT {
        Some(TOLERANCE_FLOOR)
    } else if (rate_bits_per_second >= 10 * MBIT && rate_bits_per_second <= 100 * MBIT)
        || rate_bits_per_second == GBIT
    {
        Some(TOLERANCE_MIDDLE)
    } else if rate_bits_per_second >= CPU_BOUND_RATE {
        Some(TOLERANCE_CEILING)
    } else {
        None
    }
}

/// A relative difference beyond its bound.
fn exceeds(ratio: f64, bound: f64) -> bool {
    ratio > bound + ROUNDING
}

/// The instability rule on one direction: before and after more than 5 % apart, or, on a shaped
/// link, either more than 5 % off the configured goodput.
fn reference_problems(
    name: &str,
    before: f64,
    after: f64,
    goodput: f64,
    shaped: bool,
) -> Vec<String> {
    let mean = f64::midpoint(before, after);
    if mean <= 0.0 {
        return vec![format!("{name}: iperf3 measured nothing")];
    }
    let mut problems = Vec::new();
    let spread = (before - after).abs() / mean;
    if exceeds(spread, STABILITY_BOUND) {
        problems.push(format!(
            "{name}: iperf3 before ({}) and after ({}) differ by {:.1} %",
            rate(before),
            rate(after),
            spread * PERCENT
        ));
    }
    if !shaped {
        return problems;
    }
    for (when, value) in [("before", before), ("after", after)] {
        let off = (value - goodput).abs() / goodput;
        if exceeds(off, STABILITY_BOUND) {
            problems.push(format!(
                "{name}: iperf3 {when} ({}) is {:.1} % off the configured goodput {}",
                rate(value),
                off * PERCENT,
                rate(goodput)
            ));
        }
    }
    problems
}

/// One direction's headline judged against its reference.
fn headline(
    name: &str,
    dir: Option<&Direction>,
    reference: f64,
    tolerance: f64,
    rate_bits_per_second: i64,
) -> (String, Vec<String>) {
    let Some(dir) = dir.filter(|dir| dir.status == "measured" && dir.bits_per_second > 0.0) else {
        let status = dir.map_or("absent", |dir| dir.status.as_str());
        return (
            String::new(),
            vec![format!("{name}: no headline ({status})")],
        );
    };
    let deviation = dir.bits_per_second / reference - 1.0;
    let summary = format!(
        "{name} {} vs {} ({:+.1} %, ±{:.0} %)",
        rate(dir.bits_per_second),
        rate(reference),
        deviation * PERCENT,
        tolerance * PERCENT
    );
    if !exceeds(deviation.abs(), tolerance) {
        return (summary, Vec::new());
    }
    let mut findings = vec![format!("{summary} is outside the tolerance")];
    let cpu_bound = dir
        .confidence
        .as_ref()
        .is_some_and(|confidence| confidence.level == "cpu-bound");
    if rate_bits_per_second >= CPU_BOUND_RATE && !cpu_bound {
        findings.push(format!(
            "{name}: outside the tolerance without confidence: cpu-bound"
        ));
    }
    (summary, findings)
}

impl Run {
    /// Evaluates a completed run against testing.md section 5 and records the outcome on it: its
    /// status, the reference when it is stable, the findings and the verdict line. A failed run
    /// stays failed; missing or non-zero egress counters fail any run; an unshaped run of a shaped
    /// profile is a debugging run, stays recorded and is not judged, and so it fails the tier
    /// ([`Run::failing`]).
    pub fn judge(&mut self, profile: &Profile) {
        self.reference = None;
        self.findings = Vec::new();

        if self.status == Status::Failed {
            "not judged: the run failed".clone_into(&mut self.verdict);
            return;
        }
        if !counters_clean(self.egress.as_ref()) {
            self.fail_with(
                "the netguard counters are missing or not zero: the run is evidence of nothing",
            );
            return;
        }
        if profile.shaped && !self.shaped {
            self.status = Status::Recorded;
            "not judged: an unshaped run of a shaped profile is a debugging run"
                .clone_into(&mut self.verdict);
            return;
        }
        let (Some(before), Some(after)) = (self.reference_before, self.reference_after) else {
            self.fail_with("the run lacks its result or an iperf3 reference");
            return;
        };
        if self.result.is_none() {
            self.fail_with("the run lacks its result or an iperf3 reference");
            return;
        }
        if profile.compat && self.compat.is_none() {
            self.fail_with("the compatibility step recorded nothing");
            return;
        }

        let goodput = configured_goodput(profile);
        let mut unstable = reference_problems(
            "download",
            before.download_bits_per_second,
            after.download_bits_per_second,
            goodput,
            self.shaped,
        );
        unstable.extend(reference_problems(
            "upload",
            before.upload_bits_per_second,
            after.upload_bits_per_second,
            goodput,
            self.shaped,
        ));
        if !unstable.is_empty() {
            self.status = Status::Inconclusive;
            self.verdict = format!("inconclusive: unstable reference; {}", unstable.join("; "));
            self.findings = unstable;
            return;
        }

        let reference = Throughput {
            download_bits_per_second: f64::midpoint(
                before.download_bits_per_second,
                after.download_bits_per_second,
            ),
            upload_bits_per_second: f64::midpoint(
                before.upload_bits_per_second,
                after.upload_bits_per_second,
            ),
            seconds: before.seconds,
        };
        self.reference = Some(reference);
        self.judge_headlines(profile, &reference);
    }

    /// A run that is evidence of nothing: failed, with the one finding as its verdict.
    fn fail_with(&mut self, finding: &str) {
        self.status = Status::Failed;
        self.findings = vec![finding.to_owned()];
        self.verdict = format!("failed: {finding}");
    }

    fn judge_headlines(&mut self, profile: &Profile, reference: &Throughput) {
        let Some(result) = self.result.as_ref() else {
            return;
        };
        let mut findings = Vec::new();
        if result.status != "complete" {
            findings.push(format!("the result is {}, not complete", result.status));
        }

        let Some(tolerance) = tolerance(profile.rate_bits_per_second) else {
            #[expect(clippy::cast_precision_loss, reason = "Go's float64(rate)")]
            let configured = profile.rate_bits_per_second as f64;
            findings.push(format!(
                "testing.md section 5 has no tolerance for {}",
                rate(configured)
            ));
            self.status = Status::Fail;
            self.verdict = format!("fail: {}", findings.join("; "));
            self.findings = findings;
            return;
        };

        let (download, download_findings) = headline(
            "download",
            result.download.as_ref(),
            reference.download_bits_per_second,
            tolerance,
            profile.rate_bits_per_second,
        );
        let (upload, upload_findings) = headline(
            "upload",
            result.upload.as_ref(),
            reference.upload_bits_per_second,
            tolerance,
            profile.rate_bits_per_second,
        );
        findings.extend(download_findings);
        findings.extend(upload_findings);

        let mut parts: Vec<String> = [download, upload]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect();

        let (latency, latency_findings) = self.judge_latency(profile);
        parts.extend(latency);
        findings.extend(latency_findings);

        let (responsiveness, responsiveness_findings) = self.judge_responsiveness(profile);
        parts.extend(responsiveness);
        findings.extend(responsiveness_findings);

        self.status = Status::Pass;
        if !findings.is_empty() {
            self.status = Status::Fail;
            parts.push(findings.join("; "));
        }
        self.findings = findings;
        self.verdict = format!("{}: {}", self.status, parts.join("; "));
    }

    /// The path B rule of testing.md section 5: on the Caddy profile each measured direction's
    /// path B must run over HTTP/2 and give an RPM, measured or uncertain, and on the Traefik
    /// profile read `unavailable_h1`; a measured direction without its responsiveness fails
    /// there. On every other profile the state is recorded and not judged.
    fn judge_responsiveness(&self, profile: &Profile) -> (Vec<String>, Vec<String>) {
        let mut parts = Vec::new();
        let mut findings = Vec::new();
        let Some(result) = self.result.as_ref() else {
            return (parts, findings);
        };
        if profile.path_b == PathBRule::Recorded {
            return (parts, findings);
        }
        for (name, dir) in [
            ("download", result.download.as_ref()),
            ("upload", result.upload.as_ref()),
        ] {
            let Some(dir) = dir.filter(|dir| dir.status == "measured") else {
                continue;
            };
            match dir.responsiveness.as_ref() {
                None => findings.push(format!(
                    "{name}: no path B responsiveness, want {}",
                    path_b_want(profile.path_b)
                )),
                Some(got) if !path_b_holds(profile.path_b, got) => findings.push(format!(
                    "{name}: path B {} (protocol {}, {} samples), want {}",
                    got.state,
                    quote(&got.protocol),
                    got.samples,
                    path_b_want(profile.path_b)
                )),
                Some(got) => parts.push(format!("{name} path B {}", got.state)),
            }
        }
        (parts, findings)
    }

    /// Whether a final run fails the tier: every status but pass does, a recorded debugging run
    /// included, which is never evidence. An attempt a re-run superseded is not final.
    #[must_use]
    pub fn failing(&self) -> bool {
        !self.rerun && self.status != Status::Pass
    }
}

/// Whether a direction's path B meets the rule.
fn path_b_holds(rule: PathBRule, got: &Responsiveness) -> bool {
    if rule == PathBRule::UnavailableH1 {
        return got.state == RESPONSIVENESS_H1;
    }
    (got.state == RESPONSIVENESS_MEASURED || got.state == RESPONSIVENESS_UNCERTAIN)
        && got.protocol == "h2"
        && got.rpm > 0.0
}

/// The rule in the words of a finding.
fn path_b_want(rule: PathBRule) -> &'static str {
    if rule == PathBRule::UnavailableH1 {
        return RESPONSIVENESS_H1;
    }
    "measured or uncertain over h2 with an RPM"
}

/// The re-run-once rule: an inconclusive first attempt is run again, and the second attempt's
/// verdict is final.
#[must_use]
pub fn should_rerun(run: &Run, attempt: i64) -> bool {
    run.status == Status::Inconclusive && attempt < MAX_ATTEMPTS
}

/// netguard's whole set of counters, each present and zero.
#[must_use]
pub fn counters_clean(counters: Option<&BTreeMap<String, u64>>) -> bool {
    let Some(counters) = counters else {
        return false;
    };
    COUNTER_NAMES
        .iter()
        .all(|name| counters.get(*name) == Some(&0))
        && counters.values().all(|packets| *packets == 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::compat::{Compat, CompatClient};
    use crate::harness::fixtures::{profile_at, stable_run};
    use crate::harness::profiles::KBIT;
    use crate::harness::report::Confidence;
    use crate::harness::shaper::expected_goodput;

    /// Go: `TestTolerancesFollowTestingMD`. Each row of the tolerance table at and just past its
    /// bound.
    #[test]
    fn tolerances_follow_testing_md() {
        let mut failures = Vec::new();
        for (rate, want) in [
            (300 * KBIT, 0.15),
            (500 * KBIT, 0.15),
            (MBIT, 0.15),
            (10 * MBIT, 0.10),
            (100 * MBIT, 0.10),
            (GBIT, 0.10),
            (2500 * MBIT, 0.20),
            (10 * GBIT, 0.20),
        ] {
            if tolerance(rate) != Some(want) {
                failures.push(format!(
                    "tolerance({rate}) = {:?}; want {want}",
                    tolerance(rate)
                ));
            }
            for sign in [1.0, -1.0] {
                let mut at = stable_run(rate, 1.0 + sign * want, 1.0);
                at.judge(&profile_at(rate, true));
                if at.status != Status::Pass {
                    failures.push(format!(
                        "{rate} at {:+.0} %: {}",
                        sign * want * PERCENT,
                        at.verdict
                    ));
                }
                let mut past = stable_run(rate, 1.0, 1.0 + sign * (want + 0.001));
                past.judge(&profile_at(rate, true));
                if past.status != Status::Fail || !past.verdict.contains("upload") {
                    failures.push(format!(
                        "{rate} past {:+.1} %: {}",
                        sign * (want + 0.001) * PERCENT,
                        past.verdict
                    ));
                }
            }
        }
        // The table has no row between its ranges; such a rate is never judged a pass.
        for rate in [2 * MBIT, 500 * MBIT, 2 * GBIT] {
            if tolerance(rate).is_some() {
                failures.push(format!("tolerance({rate}) has a row"));
            }
            let mut run = stable_run(rate, 1.0, 1.0);
            run.judge(&profile_at(rate, true));
            if run.status != Status::Fail || !run.verdict.contains("no tolerance") {
                failures.push(format!("{rate}: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestInstability`. The 5 % rule: before against after, and each against the
    /// configured goodput; only a stable pair becomes the reference.
    #[test]
    #[expect(clippy::too_many_lines, reason = "one Go test table, kept whole")]
    fn instability() {
        const RATE: i64 = 100 * MBIT;
        let goodput = expected_goodput(RATE);
        let mut failures = Vec::new();
        for (name, before, after, shaped, want) in [
            // mean 100, spread 5.0 %: stable; 5.1 %: unstable.
            (
                "5.0 % apart",
                goodput * 1.025,
                goodput * 0.975,
                true,
                Status::Pass,
            ),
            (
                "5.1 % apart",
                goodput * 1.0255,
                goodput * 0.9745,
                true,
                Status::Inconclusive,
            ),
            (
                "5.0 % off the goodput",
                goodput * 1.05,
                goodput * 1.05,
                true,
                Status::Pass,
            ),
            (
                "5.1 % off the goodput",
                goodput * 1.051,
                goodput * 1.051,
                true,
                Status::Inconclusive,
            ),
            (
                "below the goodput",
                goodput * 0.94,
                goodput * 0.94,
                true,
                Status::Inconclusive,
            ),
            // Unshaped, there is no configured goodput to hold to; only the pair counts.
            (
                "unshaped, far from the nominal rate",
                goodput * 0.5,
                goodput * 0.5,
                false,
                Status::Pass,
            ),
            (
                "unshaped, 5.1 % apart",
                goodput * 0.51275,
                goodput * 0.48725,
                false,
                Status::Inconclusive,
            ),
        ] {
            let mut run = stable_run(RATE, 1.0, 1.0);
            run.shaped = shaped;
            if let Some(pair) = run.reference_before.as_mut() {
                pair.download_bits_per_second = before;
            }
            if let Some(pair) = run.reference_after.as_mut() {
                pair.download_bits_per_second = after;
            }
            let mean = f64::midpoint(before, after);
            if let Some(download) = run
                .result
                .as_mut()
                .and_then(|result| result.download.as_mut())
            {
                download.bits_per_second = mean;
            }
            run.judge(&profile_at(RATE, shaped));

            if run.status != want {
                failures.push(format!("{name}: {}", run.verdict));
                continue;
            }
            match run.status {
                Status::Pass => {
                    if run
                        .reference
                        .map(|reference| reference.download_bits_per_second)
                        != Some(mean)
                    {
                        failures.push(format!(
                            "{name}: reference {:?}, want the mean {mean:.0}",
                            run.reference
                        ));
                    }
                }
                Status::Inconclusive => {
                    if run.reference.is_some() || run.findings.is_empty() {
                        failures.push(format!(
                            "{name}: an unstable pair became a reference: {run:?}"
                        ));
                    }
                    // Both raw values stay in the report.
                    if run
                        .reference_before
                        .map(|pair| pair.download_bits_per_second)
                        != Some(before)
                        || run
                            .reference_after
                            .map(|pair| pair.download_bits_per_second)
                            != Some(after)
                    {
                        failures.push(format!("{name}: the raw values changed"));
                    }
                }
                Status::Recorded | Status::Failed | Status::Fail => {}
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestRerunOnce`. An inconclusive first attempt is run again, the second is final, and
    /// only final runs fail the tier.
    #[test]
    fn rerun_once() {
        let mut unstable = stable_run(10 * MBIT, 1.0, 1.0);
        if let Some(after) = unstable.reference_after.as_mut() {
            after.upload_bits_per_second *= 0.8;
        }
        unstable.judge(&profile_at(10 * MBIT, true));
        assert!(
            unstable.status == Status::Inconclusive
                && should_rerun(&unstable, 1)
                && !should_rerun(&unstable, 2),
            "an unstable first attempt is re-run once: {}",
            unstable.verdict
        );

        let mut failures = Vec::new();
        unstable.rerun = true;
        if unstable.failing() {
            failures.push("a superseded attempt fails the tier".to_owned());
        }
        unstable.rerun = false;
        if !unstable.failing() {
            failures.push("a final inconclusive run passes the tier".to_owned());
        }
        // Only a pass lets the tier pass; a recorded debugging run is not evidence.
        for status in [Status::Pass, Status::Fail, Status::Failed, Status::Recorded] {
            let run = Run {
                status,
                ..Run::default()
            };
            if should_rerun(&run, 1) {
                failures.push(format!("{status} is re-run"));
            }
            if run.failing() != (status != Status::Pass) {
                failures.push(format!("{status}: failing {}", run.failing()));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestCPUBound`. At 2.5 Gbit and above, a headline outside its tolerance without
    /// `confidence: cpu-bound` is a finding of its own.
    #[test]
    fn cpu_bound() {
        let mut run = stable_run(10 * GBIT, 0.7, 1.0);
        run.shaped = false;
        run.judge(&profile_at(10 * GBIT, false));
        assert!(
            run.status == Status::Fail
                && run.findings.iter().any(|finding| finding
                    == "download: outside the tolerance without confidence: cpu-bound"),
            "missing cpu-bound: {}",
            run.verdict
        );

        let mut marked = stable_run(10 * GBIT, 0.7, 1.0);
        marked.shaped = false;
        if let Some(download) = marked
            .result
            .as_mut()
            .and_then(|result| result.download.as_mut())
        {
            download.confidence = Some(Confidence {
                level: "cpu-bound".to_owned(),
            });
        }
        marked.judge(&profile_at(10 * GBIT, false));
        assert!(
            marked.status == Status::Fail
                && !marked
                    .findings
                    .iter()
                    .any(|finding| finding.contains("cpu-bound")),
            "cpu-bound reported: {}",
            marked.verdict
        );

        // Below the ceiling range the rule does not apply.
        let mut slow = stable_run(GBIT, 0.7, 1.0);
        slow.judge(&profile_at(GBIT, true));
        assert!(
            !slow
                .findings
                .iter()
                .any(|finding| finding.contains("cpu-bound")),
            "1 Gbit asks for cpu-bound: {}",
            slow.verdict
        );
    }

    /// Go: `TestJudgeRefusesWhatIsNotEvidence`. Egress, a failed or incomplete run, a result that
    /// is not complete or lacks a headline, and an unshaped debugging run are never a pass.
    #[test]
    #[expect(clippy::too_many_lines, reason = "one Go test table, kept whole")]
    fn judge_refuses_what_is_not_evidence() {
        type Change = fn(&mut Run);
        let profile = profile_at(100 * MBIT, true);
        let mut failures = Vec::new();
        let cases: [(&str, Change, Status, &str); 11] = [
            (
                "egress",
                |run| {
                    if let Some(egress) = run.egress.as_mut() {
                        egress.insert("dns".to_owned(), 2);
                    }
                },
                Status::Failed,
                "netguard",
            ),
            (
                "no counters",
                |run| run.egress = None,
                Status::Failed,
                "netguard",
            ),
            (
                "no counter at all",
                |run| run.egress = Some(BTreeMap::new()),
                Status::Failed,
                "netguard",
            ),
            (
                "a counter missing",
                |run| {
                    if let Some(egress) = run.egress.as_mut() {
                        egress.remove("loopback");
                    }
                },
                Status::Failed,
                "netguard",
            ),
            (
                "a failed run",
                |run| run.status = Status::Failed,
                Status::Failed,
                "not judged",
            ),
            (
                "no reference after",
                |run| run.reference_after = None,
                Status::Failed,
                "iperf3 reference",
            ),
            (
                "no result",
                |run| run.result = None,
                Status::Failed,
                "result",
            ),
            (
                "a partial result",
                |run| {
                    if let Some(result) = run.result.as_mut() {
                        "partial".clone_into(&mut result.status);
                    }
                },
                Status::Fail,
                "partial, not complete",
            ),
            (
                "no upload headline",
                |run| {
                    if let Some(result) = run.result.as_mut() {
                        result.upload = Some(Direction {
                            status: "insufficient-data".to_owned(),
                            ..Direction::default()
                        });
                    }
                },
                Status::Fail,
                "upload: no headline (insufficient-data)",
            ),
            (
                "no download",
                |run| {
                    if let Some(result) = run.result.as_mut() {
                        result.download = None;
                    }
                },
                Status::Fail,
                "download: no headline (absent)",
            ),
            (
                "an unshaped debugging run",
                |run| run.shaped = false,
                Status::Recorded,
                "debugging run",
            ),
        ];
        for (name, change, want, says) in cases {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            change(&mut run);
            run.judge(&profile);
            if run.status != want || !run.verdict.contains(says) {
                failures.push(format!("{name}: {} {:?}", run.status, run.verdict));
            }
        }

        let mut pass = stable_run(100 * MBIT, 1.02, 0.97);
        pass.judge(&profile);
        if pass.status != Status::Pass
            || !pass
                .verdict
                .contains("download loaded +20.0 ms (websocket) vs ping +20.0 ms (±5.0 ms)")
            || !pass
                .verdict
                .contains("grade A (download+upload) vs ping +20.0 ms (A)")
            || !pass.findings.is_empty()
        {
            failures.push(format!("a run inside its tolerances: {}", pass.verdict));
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestLossyReference`. At 1 % loss, 300 kbit/s carries 284.0 kbit/s of payload sent
    /// once, so the 272.3 kbit/s the floor profile's iperf3 read is 4.1 % off it, and
    /// 269.6 kbit/s, 5.1 % off, is not.
    #[test]
    fn lossy_reference() {
        let profile = Profile {
            name: "lossy".to_owned(),
            rate_bits_per_second: 300 * KBIT,
            loss_percent: 1.0,
            shaped: true,
            ..Profile::default()
        };
        let goodput = configured_goodput(&profile);
        assert!(
            (goodput - 284_052.8).abs() <= 0.1,
            "configured_goodput = {goodput:.1}"
        );

        let mut failures = Vec::new();
        for (reference, want) in [(272_300.0, Status::Pass), (269_600.0, Status::Inconclusive)] {
            let mut run = stable_run(300 * KBIT, 1.0, 1.0);
            for pair in [run.reference_before.as_mut(), run.reference_after.as_mut()]
                .into_iter()
                .flatten()
            {
                pair.upload_bits_per_second = reference;
            }
            if let Some(upload) = run
                .result
                .as_mut()
                .and_then(|result| result.upload.as_mut())
            {
                upload.bits_per_second = reference;
            }
            run.judge(&profile);
            if run.status != want {
                failures.push(format!("reference {reference:.0} bit/s: {}", run.verdict));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestPathBRule`. On the Caddy profile each measured direction must run path B over h2
    /// with an RPM, measured or uncertain alike; on the Traefik profile it must read
    /// `unavailable_h1`; a missing responsiveness fails both; elsewhere any state passes.
    #[test]
    #[expect(clippy::too_many_lines, reason = "one Go test table, kept whole")]
    fn path_b_rule() {
        let path_b = |state: &str, protocol: &str, samples: i64, rpm: f64| {
            Some(Responsiveness {
                state: state.to_owned(),
                protocol: protocol.to_owned(),
                samples,
                rpm,
            })
        };
        let measured = path_b(RESPONSIVENESS_MEASURED, "h2", 30, 900.0);
        let uncertain = path_b(RESPONSIVENESS_UNCERTAIN, "h2", 8, 180.0);
        let h3 = path_b(RESPONSIVENESS_MEASURED, "h3", 30, 900.0);
        let insufficient = path_b("unavailable_insufficient", "h2", 3, 0.0);
        let h1 = path_b(RESPONSIVENESS_H1, "http/1.1", 0, 0.0);

        let mut failures = Vec::new();
        for (name, rule, download, upload, pass, finding) in [
            (
                "h2 measured",
                PathBRule::OverH2,
                &measured,
                &measured,
                true,
                "download path B measured",
            ),
            (
                "h2 uncertain",
                PathBRule::OverH2,
                &uncertain,
                &measured,
                true,
                "download path B uncertain",
            ),
            (
                "h2 upload on h1",
                PathBRule::OverH2,
                &measured,
                &h1,
                false,
                "upload: path B unavailable_h1 (protocol \"http/1.1\", 0 samples), want measured \
                 or uncertain over h2 with an RPM",
            ),
            (
                "h2 upload over h3",
                PathBRule::OverH2,
                &measured,
                &h3,
                false,
                "upload: path B measured (protocol \"h3\", 30 samples)",
            ),
            (
                "h2 no number",
                PathBRule::OverH2,
                &insufficient,
                &measured,
                false,
                "download: path B unavailable_insufficient",
            ),
            (
                "h2 download missing",
                PathBRule::OverH2,
                &None,
                &measured,
                false,
                "download: no path B responsiveness, want measured or uncertain",
            ),
            (
                "h1 unavailable",
                PathBRule::UnavailableH1,
                &h1,
                &h1,
                true,
                "",
            ),
            (
                "h1 measured",
                PathBRule::UnavailableH1,
                &measured,
                &h1,
                false,
                "download: path B measured",
            ),
            (
                "h1 missing",
                PathBRule::UnavailableH1,
                &h1,
                &None,
                false,
                "upload: no path B responsiveness, want unavailable_h1",
            ),
            ("not judged", PathBRule::Recorded, &h1, &None, true, ""),
        ] {
            let mut run = stable_run(100 * MBIT, 1.0, 1.0);
            if let Some(result) = run.result.as_mut() {
                if let Some(dir) = result.download.as_mut() {
                    dir.responsiveness.clone_from(download);
                }
                if let Some(dir) = result.upload.as_mut() {
                    dir.responsiveness.clone_from(upload);
                }
            }
            let mut profile = profile_at(100 * MBIT, true);
            profile.path_b = rule;
            run.judge(&profile);
            if (run.status == Status::Pass) != pass || !run.verdict.contains(finding) {
                failures.push(format!("{name}: {}", run.verdict));
            }
        }

        // A direction that was not measured is not held to the rule.
        let mut run = stable_run(100 * MBIT, 1.0, 1.0);
        if let Some(result) = run.result.as_mut() {
            if let Some(dir) = result.download.as_mut() {
                dir.responsiveness.clone_from(&measured);
            }
            result.upload = Some(Direction {
                status: "skipped".to_owned(),
                ..Direction::default()
            });
        }
        let mut profile = profile_at(100 * MBIT, true);
        profile.path_b = PathBRule::OverH2;
        run.judge(&profile);
        if run.verdict.contains("upload: no path B")
            || !run.verdict.contains("download path B measured")
        {
            failures.push(format!("a skipped upload: {}", run.verdict));
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestCompatProfileNeedsItsStep`. A Compat profile's run that carries no compatibility
    /// results fails.
    #[test]
    fn compat_profile_needs_its_step() {
        let mut profile = profile_at(100 * MBIT, true);
        profile.compat = true;

        let mut run = stable_run(100 * MBIT, 1.0, 1.0);
        run.judge(&profile);
        assert!(
            run.status == Status::Failed
                && run.verdict.contains("compatibility step recorded nothing"),
            "a Compat run without its step: {}",
            run.verdict
        );

        let mut run = stable_run(100 * MBIT, 1.0, 1.0);
        run.compat = Some(Compat {
            librespeed: Some(CompatClient {
                download_bits_per_second: 1.0,
                upload_bits_per_second: 1.0,
                ..CompatClient::default()
            }),
            ..Compat::default()
        });
        run.judge(&profile);
        assert_eq!(
            run.status,
            Status::Pass,
            "a Compat run with its step: {}",
            run.verdict
        );
    }

    /// The verdict lines of a few judged runs, byte for byte as the Go evaluator wrote them for
    /// the same runs (a go1.26 scratch test over `evaluate_test.go`'s fixtures): the verdict, then
    /// each finding, one a line.
    #[test]
    fn verdicts_match_go() {
        let mut failures = Vec::new();
        let profile = profile_at(100 * MBIT, true);
        let cases: [(f64, f64, &str); 3] = [
            (1.02, 0.97, include_str!("testdata/verdict-pass.txt")),
            (1.2, 0.5, include_str!("testdata/verdict-fail.txt")),
            (1.0, 1.0, include_str!("testdata/verdict-unstable.txt")),
        ];
        for (index, (down, up, want)) in cases.into_iter().enumerate() {
            let mut run = stable_run(100 * MBIT, down, up);
            if index == 2
                && let Some(after) = run.reference_after.as_mut()
            {
                after.upload_bits_per_second *= 0.8;
            }
            run.judge(&profile);
            let mut got = String::new();
            for line in std::iter::once(&run.verdict).chain(&run.findings) {
                got.push_str(line);
                got.push('\n');
            }
            if got != want {
                failures.push(format!("case {index}:\n{got}want:\n{want}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
