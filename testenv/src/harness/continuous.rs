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

//! The manual Continuous memory check (testing.md section 5, "Continuous memory (manual)"),
//! beside the three tiers and outside [`tiers`](super::profiles::tiers): a Continuous download on
//! one profile in Chromium, whose browser driver forces a garbage collection on the engine Worker
//! every 60 s from the steady start and reads its heap. Every sample from minute 5 to the last
//! must lie within 2 MiB of the minute-5 sample. A missing, empty or short sample file fails the
//! check; nothing here skips. The runner that drives it is Docker's (the harness runner).

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::time::Duration;

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use super::evaluate::counters_clean;
use super::gofmt;
use super::profiles::BROWSER_CHROMIUM;
use super::report::{
    self, CANNOT_PROVE, ENVIRONMENTAL_LIMITS, NO_EGRESS_LAYER, Status, Throughput, cell, egress,
    push_limits, throughput,
};

/// The profile the check runs on.
pub const CONTINUOUS_PROFILE: &str = "ci-100m-50ms";
/// The one browser whose `DevTools` Protocol reaches a Worker's heap.
pub const CONTINUOUS_BROWSER: &str = BROWSER_CHROMIUM;
/// The hour testing.md asks for.
pub const CONTINUOUS_MINUTES_DEFAULT: i64 = 60;
/// Leaves a sample after the minute-5 baseline: a shorter run judges nothing.
pub const CONTINUOUS_MINUTES_MIN: i64 = 6;
/// The sample every later one is held to.
pub const CONTINUOUS_BASELINE_MINUTE: usize = 5;
/// 2 MiB.
pub const CONTINUOUS_BOUND_BYTES: i64 = 2 << 20;
/// The driver's sample file in its export directory.
pub const CONTINUOUS_FILE: &str = "continuous.json";
/// The rule in the report's words.
pub const CONTINUOUS_RULE: &str = "every Worker heap sample (Runtime.getHeapUsage usedSize after \
    HeapProfiler.collectGarbage, every 60 s from the steady start) from minute 5 to the last lies \
    within 2 MiB (2097152 bytes) of the minute-5 sample (testing.md section 5)";
/// What a browser run spends outside the sampled minutes: the page load, the idle latency, the
/// warm-up and the run's 30 s past the last sample.
const CONTINUOUS_SETUP: Duration = Duration::from_mins(10);
/// The report directory's prefix, as a tier names its own: continuous-<UTC>-<envid>.
const CONTINUOUS_REPORT_DIR: &str = "continuous";

/// `HARNESS_CONTINUOUS_MINUTES`: empty is the default hour, anything else a whole number of at
/// least [`CONTINUOUS_MINUTES_MIN`].
///
/// # Errors
///
/// Anything else, never a silent default.
pub fn continuous_minutes(value: &str) -> Result<i64, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(CONTINUOUS_MINUTES_DEFAULT);
    }
    match gofmt::parse_int("Atoi", trimmed) {
        Ok(minutes) if minutes >= CONTINUOUS_MINUTES_MIN => Ok(minutes),
        Ok(_) | Err(_) => Err(format!(
            "HARNESS_CONTINUOUS_MINUTES must be a whole number of at least \
             {CONTINUOUS_MINUTES_MIN}, not {}",
            gofmt::quote(value)
        )),
    }
}

/// How long the browser run may take: the sampled minutes and the setup.
#[must_use]
pub fn continuous_browse_limit(minutes: i64) -> Duration {
    Duration::from_secs(u64::try_from(minutes).unwrap_or(0).saturating_mul(60)) + CONTINUOUS_SETUP
}

/// The sample file's path relative to the report directory.
#[must_use]
pub fn continuous_export() -> String {
    format!("exports/{CONTINUOUS_PROFILE}/{CONTINUOUS_FILE}")
}

/// One reading of the Worker's heap, minute 0 at the steady start.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeapSample {
    /// The minute since the steady start.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub minute: i64,
    /// When it was read, in Unix milliseconds.
    #[serde(rename = "atMs", default, deserialize_with = "gofmt::nullable")]
    pub at_ms: i64,
    /// `Runtime.getHeapUsage`'s `usedSize`.
    #[serde(rename = "usedSize", default, deserialize_with = "gofmt::nullable")]
    pub used_bytes: i64,
    /// Its `totalSize`.
    #[serde(rename = "totalSize", default, deserialize_with = "gofmt::nullable")]
    pub total_bytes: i64,
}

/// What `web/harness/continuous.spec.ts` writes.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct HeapFile {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    worker_url: String,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    samples: Vec<HeapSample>,
}

/// The judged sample file.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeapVerdict {
    /// Pass or fail.
    pub status: Status,
    /// What made it fail.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub findings: Vec<String>,
    /// The engine Worker's script.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub worker_url: String,
    /// The samples, as the driver wrote them.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub samples: Vec<HeapSample>,
    /// The minute-5 sample's used heap.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline_bytes: Option<i64>,
    /// The largest distance of a later sample from the baseline.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_drift_bytes: Option<i64>,
}

impl HeapVerdict {
    fn failed(finding: String) -> Self {
        Self {
            status: Status::Fail,
            findings: vec![finding],
            ..Self::default()
        }
    }
}

/// Holds every sample from minute 5 to the last within [`CONTINUOUS_BOUND_BYTES`] of the
/// minute-5 one. The samples must be minute 0 to `minutes`, one each, in order, each with a heap
/// size; anything less fails, as does an empty or unreadable file.
#[must_use]
pub fn judge_heap(data: &[u8], minutes: i64) -> HeapVerdict {
    if String::from_utf8_lossy(data).trim().is_empty() {
        return HeapVerdict::failed("the sample file is empty".to_owned());
    }
    let file: HeapFile = match gofmt::unmarshal::<Option<HeapFile>>(data) {
        Ok(file) => file.unwrap_or_default(),
        Err(error) => {
            return HeapVerdict::failed(format!("the sample file does not parse: {error}"));
        }
    };

    let mut verdict = HeapVerdict {
        status: Status::Pass,
        worker_url: file.worker_url,
        samples: file.samples,
        ..HeapVerdict::default()
    };

    let count = i64::try_from(verdict.samples.len()).unwrap_or(i64::MAX);
    if count < minutes + 1 {
        verdict.status = Status::Fail;
        verdict.findings.push(format!(
            "short: {count} samples, where minutes 0 to {minutes} need {}",
            minutes + 1
        ));
        return verdict;
    }

    for (index, sample) in verdict.samples.iter().enumerate() {
        if usize::try_from(sample.minute) != Ok(index) || sample.used_bytes <= 0 {
            let finding = format!(
                "sample {index} reads minute {} with {} bytes used, not minute {index} with a \
                 heap size",
                sample.minute, sample.used_bytes
            );
            verdict.status = Status::Fail;
            verdict.findings.push(finding);
            return verdict;
        }
    }

    let baseline = verdict.samples[CONTINUOUS_BASELINE_MINUTE].used_bytes;
    verdict.baseline_bytes = Some(baseline);
    let mut drift: i64 = 0;
    let mut findings = Vec::new();
    for sample in &verdict.samples[CONTINUOUS_BASELINE_MINUTE..] {
        let distance = (sample.used_bytes - baseline).abs();
        drift = drift.max(distance);
        if distance > CONTINUOUS_BOUND_BYTES {
            findings.push(format!(
                "minute {}: {} bytes used, {:+} from the minute-5 sample, past 2 MiB",
                sample.minute,
                sample.used_bytes,
                sample.used_bytes - baseline
            ));
        }
    }
    if !findings.is_empty() {
        verdict.status = Status::Fail;
        verdict.findings.extend(findings);
    }
    verdict.max_drift_bytes = Some(drift);
    verdict
}

/// One run of the check, written as report.json and report.md.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuousReport {
    /// [`CONTINUOUS_PROFILE`].
    pub profile: String,
    /// [`CONTINUOUS_BROWSER`].
    pub browser: String,
    /// The sampled minutes.
    pub minutes: i64,
    /// The invocation's environment ID.
    pub env_id: String,
    /// The run's own environment ID.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub run_env_id: String,
    /// When it started, in UTC.
    #[serde(serialize_with = "gofmt::serialize_time")]
    pub started: Timestamp,
    /// When it finished; Go's zero time until the runner sets it.
    #[serde(serialize_with = "gofmt::serialize_time")]
    pub finished: Timestamp,
    /// [`CONTINUOUS_RULE`].
    pub rule: String,
    /// [`NO_EGRESS_LAYER`].
    pub no_egress_layer: String,
    /// Pass or fail once judged, or failed when the run could not complete.
    pub status: Status,
    /// The judgment in one line.
    pub verdict: String,
    /// Why the run could not complete.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
    /// The judged sample file.
    pub heap: HeapVerdict,
    /// The shaper self-test's rates.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_test: Option<Throughput>,
    /// The netguard counters at the end of the run.
    #[serde(skip_serializing_if = "report::no_counters")]
    pub egress: Option<BTreeMap<String, u64>>,
    /// The sample file, relative to the report directory.
    pub export: String,
    /// [`ENVIRONMENTAL_LIMITS`].
    pub environmental_limits: Vec<String>,
    /// [`CANNOT_PROVE`].
    pub cannot_prove: String,
}

/// Where the check's report goes: `<root>/continuous-<UTC>-<envid>`.
#[must_use]
pub fn continuous_dir(root: &Path, started: Timestamp, env_id: &str) -> PathBuf {
    report::dir(root, CONTINUOUS_REPORT_DIR, started, env_id)
}

impl ContinuousReport {
    /// A report of the check with its fixed statements, failed until judged.
    #[must_use]
    pub fn new(minutes: i64, env_id: &str, started: Timestamp) -> Self {
        Self {
            profile: CONTINUOUS_PROFILE.to_owned(),
            browser: CONTINUOUS_BROWSER.to_owned(),
            minutes,
            env_id: env_id.to_owned(),
            run_env_id: String::new(),
            started,
            finished: gofmt::zero_time(),
            rule: CONTINUOUS_RULE.to_owned(),
            no_egress_layer: NO_EGRESS_LAYER.to_owned(),
            status: Status::Failed,
            verdict: String::new(),
            error: String::new(),
            heap: HeapVerdict::default(),
            self_test: None,
            egress: None,
            export: continuous_export(),
            environmental_limits: ENVIRONMENTAL_LIMITS.map(str::to_owned).to_vec(),
            cannot_prove: CANNOT_PROVE.to_owned(),
        }
    }

    /// Turns the run into pass or fail from the sample file's contents, or the message of the
    /// error reading it, which fails it; a run that could not complete stays failed. Its netguard
    /// counters must all be present and zero.
    pub fn judge(&mut self, read: Result<&[u8], &str>) {
        self.heap = match read {
            Ok(data) => judge_heap(data, self.minutes),
            Err(error) => HeapVerdict::failed(format!("the sample file is missing: {error}")),
        };

        if !self.error.is_empty() {
            self.status = Status::Failed;
            self.verdict = format!("failed: {}", self.error);
            return;
        }

        self.status = self.heap.status;
        let mut findings = self.heap.findings.clone();
        if !counters_clean(self.egress.as_ref()) {
            self.status = Status::Fail;
            findings.push(format!(
                "netguard counters not all present and zero: {}",
                egress(self.egress.as_ref())
            ));
        }

        if self.status == Status::Pass {
            self.verdict = format!(
                "pass: minutes 5 to {} within {CONTINUOUS_BOUND_BYTES} bytes of the minute-5 \
                 sample (largest {})",
                self.minutes,
                self.heap.max_drift_bytes.unwrap_or(0)
            );
            return;
        }
        self.verdict = format!("fail: {}", findings.join("; "));
    }

    /// [`ContinuousReport::judge`] on the file at `path`, a read error in Go's words.
    pub fn judge_file(&mut self, path: &Path) {
        match std::fs::read(path) {
            Ok(data) => self.judge(Ok(&data)),
            Err(error) => self.judge(Err(&gofmt::path_error("open", path, &error))),
        }
    }

    /// Writes report.json and report.md into `dir`, creating it.
    ///
    /// # Errors
    ///
    /// The directory or a file cannot be written.
    pub fn write(&self, dir: &Path) -> Result<(), String> {
        report::write_report(dir, self, &self.markdown())
    }

    /// The report for `docs/engineering/harness-runs/<version>.md`.
    #[must_use]
    pub fn markdown(&self) -> String {
        let mut out = String::new();
        let _ = write!(
            out,
            "# BitGauge Continuous memory check\n\n\
             - Profile: `{}`, {}, {} minutes\n\
             - Environment: `{}` (run `{}`)\n\
             - Started {}, finished {}\n\
             - Rule: {}\n\
             - No-egress layer: {}\n\
             - Self-test (down / up): {}\n\
             - Egress: {}\n\
             - Worker: {}\n\n\
             **{}**\n\n",
            self.profile,
            self.browser,
            self.minutes,
            self.env_id,
            self.run_env_id,
            gofmt::rfc3339(self.started),
            gofmt::rfc3339(self.finished),
            self.rule,
            self.no_egress_layer,
            throughput(self.self_test.as_ref(), true),
            egress(self.egress.as_ref()),
            cell(&self.heap.worker_url),
            self.verdict,
        );

        if !self.heap.samples.is_empty() {
            out.push_str("| Minute | Used (bytes) | Total (bytes) | From minute 5 (bytes) |\n");
            out.push_str("| --- | --- | --- | --- |\n");
            for sample in &self.heap.samples {
                let from = match self.heap.baseline_bytes {
                    Some(baseline)
                        if usize::try_from(sample.minute)
                            .is_ok_and(|minute| minute >= CONTINUOUS_BASELINE_MINUTE) =>
                    {
                        format!("{:+}", sample.used_bytes - baseline)
                    }
                    Some(_) | None => "—".to_owned(),
                };
                let _ = writeln!(
                    out,
                    "| {} | {} | {} | {from} |",
                    sample.minute, sample.used_bytes, sample.total_bytes
                );
            }
            out.push('\n');
        }

        // The tier report's closing section, without its leading blank line.
        let mut limits = String::new();
        push_limits(&mut limits, &self.environmental_limits, &self.cannot_prove);
        out.push_str(limits.strip_prefix('\n').unwrap_or(&limits));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::fixtures::zero;

    const EVAL_MINUTES: i64 = 6;
    const BASELINE_USED: i64 = 1_000_000;

    /// A driver's sample file of minutes 0 to `count - 1`, every one at `BASELINE_USED` but those
    /// the overrides set.
    fn samples_file(count: i64, overrides: &[(i64, i64)]) -> Vec<u8> {
        let samples: Vec<serde_json::Value> = (0..count)
            .map(|minute| {
                let used = overrides
                    .iter()
                    .find(|(at, _)| *at == minute)
                    .map_or(BASELINE_USED, |(_, used)| *used);
                serde_json::json!({
                    "minute": minute,
                    "atMs": minute * 60_000,
                    "usedSize": used,
                    "totalSize": 2 * BASELINE_USED,
                })
            })
            .collect();
        serde_json::to_vec(&serde_json::json!({
            "workerUrl": "http://bitgauge:8080/assets/worker-x.js",
            "samples": samples,
        }))
        .expect("the sample file encodes")
    }

    /// Go: `TestJudgeHeap`.
    #[test]
    fn judge_heap_holds_the_bound() {
        let mut failures = Vec::new();
        let cases: [(&str, Vec<u8>, Status, &str, i64); 7] = [
            (
                "every sample from minute 5 within 2 MiB, the bound itself included, passes",
                // Minute 4 is before the baseline, so its growth is not judged.
                samples_file(
                    EVAL_MINUTES + 1,
                    &[
                        (4, BASELINE_USED + 10 * CONTINUOUS_BOUND_BYTES),
                        (6, BASELINE_USED + CONTINUOUS_BOUND_BYTES),
                    ],
                ),
                Status::Pass,
                "",
                CONTINUOUS_BOUND_BYTES,
            ),
            (
                "a sample 2 MiB + 1 B from the minute-5 one fails",
                samples_file(
                    EVAL_MINUTES + 1,
                    &[(6, BASELINE_USED + CONTINUOUS_BOUND_BYTES + 1)],
                ),
                Status::Fail,
                "minute 6: 3097153 bytes used, +2097153 from the minute-5 sample, past 2 MiB",
                0,
            ),
            (
                "a shrink past 2 MiB fails too",
                samples_file(
                    EVAL_MINUTES + 1,
                    &[(5, BASELINE_USED + CONTINUOUS_BOUND_BYTES + 1)],
                ),
                Status::Fail,
                "minute 6: 1000000 bytes used, -2097153 from the minute-5 sample, past 2 MiB",
                0,
            ),
            (
                "a short file fails",
                samples_file(EVAL_MINUTES, &[]),
                Status::Fail,
                "short: 6 samples, where minutes 0 to 6 need 7",
                0,
            ),
            (
                "an empty file fails",
                Vec::new(),
                Status::Fail,
                "the sample file is empty",
                0,
            ),
            (
                "a file that does not parse fails",
                b"{".to_vec(),
                Status::Fail,
                "the sample file does not parse",
                0,
            ),
            (
                "a sample out of order or without a heap size fails",
                samples_file(EVAL_MINUTES + 1, &[(3, 0)]),
                Status::Fail,
                "sample 3 reads minute 3 with 0 bytes used",
                0,
            ),
        ];
        for (name, data, status, finding, max_drift) in cases {
            let verdict = judge_heap(&data, EVAL_MINUTES);
            if verdict.status != status {
                failures.push(format!(
                    "{name}: status = {}, want {status} (findings {:?})",
                    verdict.status, verdict.findings
                ));
                continue;
            }
            if !finding.is_empty() && !verdict.findings.join("\n").contains(finding) {
                failures.push(format!(
                    "{name}: findings {:?} hold no {finding:?}",
                    verdict.findings
                ));
            }
            if status == Status::Pass && verdict.max_drift_bytes != Some(max_drift) {
                failures.push(format!(
                    "{name}: max drift = {:?}, want {max_drift}",
                    verdict.max_drift_bytes
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestContinuousMinutes`.
    #[test]
    fn continuous_minutes_read_the_variable() {
        let mut failures = Vec::new();
        for (value, want) in [("", CONTINUOUS_MINUTES_DEFAULT), ("6", 6), ("90", 90)] {
            if continuous_minutes(value) != Ok(want) {
                failures.push(format!(
                    "continuous_minutes({value:?}) = {:?}",
                    continuous_minutes(value)
                ));
            }
        }
        for value in ["5", "0", "-6", "6.5", "an hour"] {
            if continuous_minutes(value).is_ok() {
                failures.push(format!(
                    "continuous_minutes({value:?}) took a value it should refuse"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// The sample file of a clean run, written where the driver writes it.
    fn write_samples(data: Option<&[u8]>) -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join(continuous_export());
        if let Some(data) = data {
            std::fs::create_dir_all(path.parent().expect("a parent")).expect("the export dir");
            std::fs::write(&path, data).expect("the sample file");
        }
        (temp, path)
    }

    /// Go: `TestContinuousReport`.
    #[test]
    fn continuous_report() {
        // A clean run within the bound passes, and its report says so.
        let clean = samples_file(EVAL_MINUTES + 1, &[]);
        let (temp, path) = write_samples(Some(&clean));
        let mut report = ContinuousReport::new(EVAL_MINUTES, "env", Timestamp::UNIX_EPOCH);
        report.egress = Some(zero());
        report.judge_file(&path);
        assert_eq!(report.status, Status::Pass, "{}", report.verdict);
        report.write(temp.path()).expect("the report is written");
        let markdown = std::fs::read_to_string(temp.path().join("report.md")).expect("report.md");
        for want in [
            "**pass: minutes 5 to 6 within 2097152 bytes",
            "| 6 | 1000000 | 2000000 | +0 |",
            CANNOT_PROVE,
        ] {
            assert!(markdown.contains(want), "report.md holds no {want:?}");
        }
        // Byte for byte what the Go harness wrote for the same report (the fixtures module says
        // how).
        let json = std::fs::read_to_string(temp.path().join("report.json")).expect("report.json");
        assert_eq!(json, include_str!("testdata/continuous-report.json"));
        assert_eq!(markdown, include_str!("testdata/continuous-report.md.txt"));

        // A missing sample file fails, never skips.
        let (_temp, path) = write_samples(None);
        let mut report = ContinuousReport::new(EVAL_MINUTES, "env", Timestamp::UNIX_EPOCH);
        report.egress = Some(zero());
        report.judge_file(&path);
        assert!(
            report.status == Status::Fail && report.verdict.contains("the sample file is missing"),
            "status {}, verdict {:?}",
            report.status,
            report.verdict
        );

        // Egress or a missing counter fails a run within the bound.
        let leaked: BTreeMap<String, u64> = [("egress", 1), ("dns", 0), ("loopback", 0)]
            .into_iter()
            .map(|(name, packets)| (name.to_owned(), packets))
            .collect();
        for counters in [None, Some(leaked)] {
            let mut report = ContinuousReport::new(EVAL_MINUTES, "env", Timestamp::UNIX_EPOCH);
            report.egress = counters.clone();
            report.judge(Ok(&clean));
            assert_eq!(report.status, Status::Fail, "counters {counters:?}");
        }

        // A run that could not complete stays failed.
        let mut report = ContinuousReport::new(EVAL_MINUTES, "env", Timestamp::UNIX_EPOCH);
        report.egress = Some(zero());
        "shaper self-test failed".clone_into(&mut report.error);
        report.judge(Ok(&clean));
        assert!(
            report.status == Status::Failed && report.verdict == "failed: shaper self-test failed",
            "status {}, verdict {:?}",
            report.status,
            report.verdict
        );
    }
}
