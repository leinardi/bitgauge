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

//! One harness invocation's report, written as report.json and report.md (testing.md section
//! 5.1), and the summary of an exported result the runs carry.

use std::collections::BTreeMap;
use std::fmt::{self, Write as _};
use std::fs::{self, DirBuilder, OpenOptions};
use std::io::Write as _;
use std::os::unix::fs::{DirBuilderExt as _, OpenOptionsExt as _};
use std::path::{Path, PathBuf};

use go_compat::quote::quote;
use go_compat::time_layout::go_zero_time;
use jiff::Timestamp;
use jiff::tz::TimeZone;
use serde::{Deserialize, Serialize, Serializer};

use super::compat::{Compat, CompatClient};
use super::evaluate::{LATENCY_RULE, TOLERANCES};
use super::gofmt;
use super::notice::Notice;
use super::ping::Ping;
use super::profiles::{GBIT, KBIT, MBIT, Tier, TierSpec};
use super::usage::Usage;

/// A run's status. A run that completed is recorded until [`Run::judge`] turns it into pass,
/// fail or inconclusive; a run that could not complete is failed. Recorded stays only on a
/// debugging run that is not judged. Inconclusive is never a pass.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    /// Completed, not judged.
    #[default]
    Recorded,
    /// Could not complete, or is evidence of nothing.
    Failed,
    /// Within every tolerance.
    Pass,
    /// Outside a tolerance, or missing what the rule needs.
    Fail,
    /// The reference was unstable twice.
    Inconclusive,
}

impl Status {
    /// The status as the report writes it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Recorded => "recorded",
            Self::Failed => "failed",
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::Inconclusive => "inconclusive",
        }
    }
}

impl fmt::Display for Status {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// The no-egress claim a harness run makes (testing.md section 5): netguard's, not the image
/// test's syscall layer.
pub const NO_EGRESS_LAYER: &str =
    "no packet egress (netguard counters, from BitGauge's start to the end of the run)";

/// The list testing.md section 5 requires in every report.
pub const ENVIRONMENTAL_LIMITS: [&str; 4] = [
    "tc shaping jitter (tbf burst sizes, netem timer granularity).",
    "Docker bridge overhead at high rates.",
    "Playwright WebKit ≠ Safari: Worker XHR and nextHopProtocol behavior must be re-checked on \
     real Safari.",
    "Mobile power management: device runs happen with the screen on.",
];

/// The closing statement of testing.md section 5.
pub const CANNOT_PROVE: &str = "What the harness cannot prove: real Wi-Fi behavior, real VPN \
    MTU effects, carrier-grade NAT, and anything about networks the project does not target.";

/// A report is the operator's own: private to them, like the dist tree it sits in.
pub(crate) const DIR_MODE: u32 = 0o750;
pub(crate) const FILE_MODE: u32 = 0o600;

const MS_PER_SECOND: f64 = 1000.0;
const BYTES_PER_MB: f64 = 1e6;
/// The number of columns of the report's runs table.
const RUN_COLUMNS: usize = 19;

/// One iperf3 measurement in both directions.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Throughput {
    /// The download goodput.
    pub download_bits_per_second: f64,
    /// The upload goodput.
    pub upload_bits_per_second: f64,
    /// How long each direction ran.
    pub seconds: f64,
}

/// A direction's confidence level; the ceiling tier needs `cpu-bound`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Confidence {
    /// The level, such as `cpu-bound`.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub level: String,
}

/// A direction's loaded latency without its series (measurement.md sections 11.4 and 17):
/// measured from its source, with the increase over idle beside an idle median, or unavailable
/// with its reason. An empty string is Go's absent value, and is not written.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedLatency {
    /// The probe source, such as `websocket`.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "String::is_empty")]
    pub source: String,
    /// `unavailable`, or empty when measured.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "String::is_empty")]
    pub status: String,
    /// Why it is unavailable.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reason: String,
    /// The samples it rests on.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub samples: i64,
    /// The loaded median.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "is_zero")]
    pub median_ms: f64,
    /// The loaded 90th percentile.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "is_zero")]
    pub p90_ms: f64,
    /// The increase over the idle median, when there is one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub increase_ms: Option<f64>,
}

/// A direction's HTTP loaded responsiveness, path B (measurement.md sections 12.6 and 17): its
/// state, the protocol and samples it rests on, and the RPM when measured or uncertain.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Responsiveness {
    /// The path B state.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub state: String,
    /// The protocol of the connection it ran on.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub protocol: String,
    /// The samples it rests on.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub samples: i64,
    /// The RPM, zero without one.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "is_zero")]
    pub rpm: f64,
}

/// One direction of a result, as the harness records it.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Direction {
    /// `measured`, or why there is no headline.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub status: String,
    /// The headline.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub bits_per_second: f64,
    /// The steady window's length.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub window_ms: f64,
    /// The bytes the direction moved.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub bytes: f64,
    /// The load streams it ran.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub streams: i64,
    /// Its confidence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    /// Its loaded latency.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loaded_latency: Option<LoadedLatency>,
    /// Its path B.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub responsiveness: Option<Responsiveness>,
}

/// The result's grade (measurement.md section 11.3): its letter, the directions it was read from
/// and the increase it was read from.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bufferbloat {
    /// The letter.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub grade: String,
    /// `download`, `upload` or `download+upload`.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub basis: String,
    /// The increase the letter was read from.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub increase_ms: f64,
}

/// What the harness keeps of an exported result (measurement.md section 17): the headline per
/// direction, its steady window and loaded latency, the grade, the data used and the notices.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultSummary {
    /// `complete`, or how the result ended.
    pub status: String,
    /// The preset the result ran.
    pub preset: String,
    /// The page's protocol.
    pub protocol: String,
    /// The download, when the result has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download: Option<Direction>,
    /// The upload, when the result has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload: Option<Direction>,
    /// The grade, when the result has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bufferbloat: Option<Bufferbloat>,
    /// The data used.
    pub data_used_bytes: f64,
    /// The notices, kept whole; `None` is the export's absent or `null` list, written `null`.
    pub notices: Option<Vec<Notice>>,
}

impl ResultSummary {
    /// The codes of the result's notices; a notice whose code cannot be read is left out.
    #[must_use]
    pub fn notice_codes(&self) -> Vec<String> {
        self.notices
            .iter()
            .flatten()
            .filter_map(Notice::code)
            .collect()
    }
}

#[derive(Deserialize)]
struct Export {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    format: String,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    results: Vec<ExportedResult>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ExportedResult {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    status: String,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    settings: ExportedSettings,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    client: ExportedClient,
    #[serde(default)]
    download: Option<Direction>,
    #[serde(default)]
    upload: Option<Direction>,
    #[serde(default)]
    bufferbloat: Option<Bufferbloat>,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    data_used_bytes: f64,
    #[serde(default)]
    notices: Option<Vec<Notice>>,
}

#[derive(Deserialize, Default)]
struct ExportedSettings {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    preset: String,
}

#[derive(Deserialize, Default)]
struct ExportedClient {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    protocol: String,
}

/// Reads the Download JSON export of one result: the history export format with a single entry
/// (frontend.md section 5).
///
/// # Errors
///
/// An export that does not parse, or is not `bitgauge.history` with exactly one result.
pub fn summarize_export(data: &[u8]) -> Result<ResultSummary, String> {
    let export: Export =
        gofmt::unmarshal(data).map_err(|error| format!("read the export: {error}"))?;
    if export.format != "bitgauge.history" || export.results.len() != 1 {
        return Err(format!(
            "the export holds no result: format {} with {} results, want bitgauge.history with \
             one",
            quote(&export.format),
            export.results.len()
        ));
    }
    let result = export.results.into_iter().next().unwrap_or_default();
    Ok(ResultSummary {
        status: result.status,
        preset: result.settings.preset,
        protocol: result.client.protocol,
        download: result.download,
        upload: result.upload,
        bufferbloat: result.bufferbloat,
        data_used_bytes: result.data_used_bytes,
        notices: result.notices,
    })
}

/// One profile in one browser.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    /// The profile's name.
    pub profile: String,
    /// The run's own test environment, the label its containers carried.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub env_id: String,
    /// The Playwright project.
    pub browser: String,
    /// The run's status.
    pub status: Status,
    /// Why the run could not complete.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
    /// False for an unshaped (ceiling) run, which has no shaper and no self-test.
    pub shaped: bool,
    /// What the shaper self-test judged: the rate each direction's tbf sent while iperf3
    /// saturated it, within 5 % of the configured rate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_test: Option<Throughput>,
    /// The raw iperf3 run before the browser run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_before: Option<Throughput>,
    /// The raw iperf3 run after the browser run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_after: Option<Throughput>,
    /// mean(before, after), set only when the pair is stable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<Throughput>,
    /// The exported result.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<ResultSummary>,
    /// 1, or 2 for the re-run of an inconclusive first attempt.
    pub attempt: i64,
    /// Marks an attempt the re-run superseded, which stays in the report with its raw values.
    #[serde(skip_serializing_if = "is_false")]
    pub rerun: bool,
    /// The run's judgment in one line.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub verdict: String,
    /// What made it fail or inconclusive.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub findings: Vec<String>,
    /// The ICMP ping that ran concurrently with the browser, the loaded-latency reference.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ping: Option<Ping>,
    /// The client's CPU and memory over the browser run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_usage: Option<Usage>,
    /// The netguard counters at the end of the run; all must be zero. `None` is a run that read
    /// none, which the report shows apart from an empty set.
    #[serde(skip_serializing_if = "no_counters")]
    pub egress: Option<BTreeMap<String, u64>>,
    /// The path of the downloaded result, relative to the report directory.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub export: String,
    /// What the compatibility step recorded on a Compat profile (testing.md section 5).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compat: Option<Compat>,
}

/// One harness invocation.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// The tier.
    pub tier: Tier,
    /// The invocation's environment ID.
    pub env_id: String,
    /// When it started, in UTC.
    #[serde(serialize_with = "gofmt::serialize_time")]
    pub started: Timestamp,
    /// When it finished; Go's zero time until the runner sets it.
    #[serde(serialize_with = "gofmt::serialize_time")]
    pub finished: Timestamp,
    /// [`TOLERANCES`].
    pub tolerances: String,
    /// [`LATENCY_RULE`].
    pub latency_rule: String,
    /// [`NO_EGRESS_LAYER`].
    pub no_egress_layer: String,
    /// Every run, the superseded attempts included; `null` while there is none, as Go's nil
    /// slice.
    #[serde(serialize_with = "null_when_empty")]
    pub runs: Vec<Run>,
    /// The manual runs the tier requires.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub manual: Vec<String>,
    /// [`ENVIRONMENTAL_LIMITS`].
    pub environmental_limits: Vec<String>,
    /// [`CANNOT_PROVE`].
    pub cannot_prove: String,
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde's skip_serializing_if signature"
)]
fn is_zero(value: &f64) -> bool {
    *value == 0.0
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde's skip_serializing_if signature"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

/// Go's `omitempty` on a map: nil or empty.
#[expect(clippy::ref_option, reason = "serde's skip_serializing_if signature")]
pub(crate) fn no_counters(counters: &Option<BTreeMap<String, u64>>) -> bool {
    counters.as_ref().is_none_or(BTreeMap::is_empty)
}

fn null_when_empty<S: Serializer, T: Serialize>(
    values: &[T],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    if values.is_empty() {
        serializer.serialize_unit()
    } else {
        values.serialize(serializer)
    }
}

impl Report {
    /// A report with the fixed statements every report carries.
    #[must_use]
    pub fn new(spec: &TierSpec, env_id: &str, started: Timestamp) -> Self {
        Self {
            tier: spec.tier,
            env_id: env_id.to_owned(),
            started,
            finished: go_zero_time(),
            tolerances: TOLERANCES.to_owned(),
            latency_rule: LATENCY_RULE.to_owned(),
            no_egress_layer: NO_EGRESS_LAYER.to_owned(),
            runs: Vec::new(),
            manual: spec.manual.clone(),
            environmental_limits: ENVIRONMENTAL_LIMITS.map(str::to_owned).to_vec(),
            cannot_prove: CANNOT_PROVE.to_owned(),
        }
    }

    /// Writes report.json and report.md into `dir`, creating it.
    ///
    /// # Errors
    ///
    /// The directory or a file cannot be written.
    pub fn write(&self, dir: &Path) -> Result<(), String> {
        write_report(dir, self, &self.markdown())
    }

    /// The report for the CI step summary and for docs/engineering/harness-runs.
    #[must_use]
    pub fn markdown(&self) -> String {
        let mut out = String::new();
        let _ = write!(
            out,
            "# Accuracy harness: {} tier\n\n\
             - Environment: `{}`\n\
             - Started: {}\n\
             - Finished: {}\n\
             - Tolerances: {}\n\
             - Loaded latency: {}\n\
             - No-egress layer: {}\n\n",
            self.tier,
            self.env_id,
            gofmt::rfc3339(self.started),
            gofmt::rfc3339(self.finished),
            self.tolerances,
            self.latency_rule,
            self.no_egress_layer,
        );

        out.push_str("## Runs\n\n");
        out.push_str(
            "| Profile | Browser | Attempt | Status | Self-test down / up | iperf3 before down / \
             up | iperf3 after down / up | Reference down / up | Download | Upload | Loaded \
             latency down / up | Ping idle / down / up | Grade | Path B down / up | Data used | \
             Client CPU and memory | Egress | Compatibility clients | Verdict |\n",
        );
        out.push('|');
        out.push_str(&" --- |".repeat(RUN_COLUMNS));
        out.push('\n');

        for run in &self.runs {
            let result = run.result.as_ref();
            let cells = [
                run.profile.clone(),
                run.browser.clone(),
                attempt(run),
                status(run),
                throughput(run.self_test.as_ref(), run.shaped),
                throughput(run.reference_before.as_ref(), true),
                throughput(run.reference_after.as_ref(), true),
                throughput(run.reference.as_ref(), true),
                direction(result, true),
                direction(result, false),
                loaded(result),
                ping_figures(run.ping.as_ref()),
                grade(result),
                path_b(result),
                data_used(result),
                usage(run.client_usage.as_ref()),
                egress(run.egress.as_ref()),
                compat_clients(run.compat.as_ref()),
                cell(&run.verdict),
            ];
            out.push('|');
            for value in cells {
                let _ = write!(out, " {value} |");
            }
            out.push('\n');
        }

        if !self.manual.is_empty() {
            out.push_str("\n## Manual runs this tier requires\n\n");
            for manual in &self.manual {
                let _ = writeln!(out, "- {manual}");
            }
        }

        push_limits(&mut out, &self.environmental_limits, &self.cannot_prove);
        out
    }
}

/// The environmental limits and the closing statement every report ends on.
pub(crate) fn push_limits(out: &mut String, limits: &[String], cannot_prove: &str) {
    out.push_str("\n## Environmental limits\n\n");
    for limit in limits {
        let _ = writeln!(out, "- {limit}");
    }
    let _ = write!(out, "\n{cannot_prove}\n");
}

/// Where a report goes: `<root>/<prefix>-<UTC>-<envid>` (testing.md section 5.1), the prefix a
/// tier's name or `continuous`.
#[must_use]
pub fn dir(root: &Path, prefix: &str, started: Timestamp, env_id: &str) -> PathBuf {
    let stamp = started
        .to_zoned(TimeZone::UTC)
        .strftime("%Y%m%dT%H%M%SZ")
        .to_string();
    root.join(format!("{prefix}-{stamp}-{env_id}"))
}

/// Writes `value` as report.json and `markdown` as report.md into `dir`, creating it.
pub(crate) fn write_report<T: Serialize>(
    dir: &Path,
    value: &T,
    markdown: &str,
) -> Result<(), String> {
    create_dir(dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    let mut encoded =
        gofmt::to_json_indent(value).map_err(|error| format!("encode the report: {error}"))?;
    encoded.push('\n');
    for (name, content) in [("report.json", encoded.as_str()), ("report.md", markdown)] {
        write_file(&dir.join(name), content.as_bytes())
            .map_err(|error| format!("write {name}: {error}"))?;
    }
    Ok(())
}

/// `os.MkdirAll(dir, 0o750)`, its error in Go's words.
pub(crate) fn create_dir(dir: &Path) -> Result<(), String> {
    DirBuilder::new()
        .recursive(true)
        .mode(DIR_MODE)
        .create(dir)
        .map_err(|error| gofmt::path_error("mkdir", dir, &error))
}

/// `os.WriteFile(path, data, 0o600)`, its error in Go's words.
pub(crate) fn write_file(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(FILE_MODE)
        .open(path)
        .map_err(|error| gofmt::path_error("open", path, &error))?;
    file.write_all(data)
        .map_err(|error| gofmt::path_error("write", path, &error))
}

/// `os.ReadFile`, its error in Go's words; `Ok(None)` for a missing file.
pub(crate) fn read_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(gofmt::path_error("open", path, &error)),
    }
}

fn status(run: &Run) -> String {
    if run.error.is_empty() {
        return run.status.as_str().to_owned();
    }
    format!("{}: {}", run.status, cell(&run.error))
}

/// The attempt number, and whether a re-run superseded it.
fn attempt(run: &Run) -> String {
    if run.rerun {
        return format!("{} (re-run)", run.attempt);
    }
    run.attempt.to_string()
}

/// A value kept inside its Markdown table cell.
pub(crate) fn cell(value: &str) -> String {
    if value.is_empty() {
        return "—".to_owned();
    }
    value.replace('|', "\\|")
}

pub(crate) fn throughput(value: Option<&Throughput>, shaped: bool) -> String {
    if !shaped {
        return "unshaped".to_owned();
    }
    value.map_or_else(
        || "—".to_owned(),
        |value| {
            format!(
                "{} / {}",
                rate(value.download_bits_per_second),
                rate(value.upload_bits_per_second)
            )
        },
    )
}

fn direction(result: Option<&ResultSummary>, download: bool) -> String {
    let dir = result.and_then(|result| {
        if download {
            result.download.as_ref()
        } else {
            result.upload.as_ref()
        }
    });
    dir.map_or_else(
        || "—".to_owned(),
        |dir| {
            format!(
                "{} ({}, {:.1} s window)",
                rate(dir.bits_per_second),
                dir.status,
                dir.window_ms / MS_PER_SECOND
            )
        },
    )
}

/// Each direction's loaded latency: its increase over idle and its source, or why it has none.
fn loaded(result: Option<&ResultSummary>) -> String {
    let Some(result) = result else {
        return "—".to_owned();
    };
    let parts: Vec<String> = [result.download.as_ref(), result.upload.as_ref()]
        .into_iter()
        .map(
            |dir| match dir.and_then(|dir| dir.loaded_latency.as_ref()) {
                None => "—".to_owned(),
                Some(loaded) if !loaded.status.is_empty() => {
                    format!("{} ({})", loaded.status, loaded.reason)
                }
                Some(loaded) => match loaded.increase_ms {
                    None => format!(
                        "{:.1} ms, no increase ({})",
                        loaded.median_ms, loaded.source
                    ),
                    Some(increase) => format!(
                        "{increase:+.1} ms ({}, {} samples)",
                        loaded.source, loaded.samples
                    ),
                },
            },
        )
        .collect();
    parts.join(" / ")
}

/// The ping's idle median and each direction's increase over it.
fn ping_figures(ping: Option<&Ping>) -> String {
    let Some((ping, idle)) = ping.and_then(|ping| ping.idle.as_ref().map(|idle| (ping, idle)))
    else {
        return "—".to_owned();
    };
    let mut parts = vec![format!("{:.1} ms", idle.median_ms)];
    for phase in [ping.download.as_ref(), ping.upload.as_ref()] {
        parts.push(
            phase
                .and_then(|phase| phase.increase_ms)
                .map_or_else(|| "—".to_owned(), |increase| format!("{increase:+.1} ms")),
        );
    }
    parts.join(" / ")
}

fn grade(result: Option<&ResultSummary>) -> String {
    result
        .and_then(|result| result.bufferbloat.as_ref())
        .map_or_else(
            || "—".to_owned(),
            |grade| {
                format!(
                    "{} ({}, {:+.1} ms)",
                    grade.grade, grade.basis, grade.increase_ms
                )
            },
        )
}

/// Each direction's path B state, with its RPM and protocol where it has them.
fn path_b(result: Option<&ResultSummary>) -> String {
    let Some(result) = result else {
        return "—".to_owned();
    };
    let parts: Vec<String> = [result.download.as_ref(), result.upload.as_ref()]
        .into_iter()
        .map(
            |dir| match dir.and_then(|dir| dir.responsiveness.as_ref()) {
                None => "—".to_owned(),
                Some(path_b) if path_b.rpm > 0.0 => format!(
                    "{}, {:.0} RPM ({}, {} samples)",
                    path_b.state, path_b.rpm, path_b.protocol, path_b.samples
                ),
                Some(path_b) => path_b.state.clone(),
            },
        )
        .collect();
    parts.join(" / ")
}

/// Each compatibility client's download and upload, with goresponsiveness's RPM.
fn compat_clients(compat: Option<&Compat>) -> String {
    let Some(compat) = compat else {
        return "—".to_owned();
    };
    let clients: [(&str, Option<&CompatClient>); 3] = [
        ("librespeed-cli", compat.librespeed.as_ref()),
        ("goresponsiveness", compat.goresponsiveness.as_ref()),
        ("OpenSpeedTest UI", compat.openspeedtest.as_ref()),
    ];
    let parts: Vec<String> = clients
        .into_iter()
        .filter_map(|(name, client)| {
            let client = client?;
            let mut part = format!(
                "{name} {} / {}",
                rate(client.download_bits_per_second),
                rate(client.upload_bits_per_second)
            );
            if client.rpm > 0.0 {
                let _ = write!(part, ", {:.0} RPM", client.rpm);
            }
            if client.estimate {
                part.push_str(" (estimate)");
            }
            Some(part)
        })
        .collect();
    if parts.is_empty() {
        return "—".to_owned();
    }
    cell(&parts.join("; "))
}

fn data_used(result: Option<&ResultSummary>) -> String {
    result.map_or_else(
        || "—".to_owned(),
        |result| format!("{:.1} MB", result.data_used_bytes / BYTES_PER_MB),
    )
}

#[expect(
    clippy::cast_precision_loss,
    reason = "Go's float64(bytes) for a figure in MB"
)]
fn usage(value: Option<&Usage>) -> String {
    value.map_or_else(
        || "—".to_owned(),
        |value| {
            let cores = if value.wall_seconds > 0.0 {
                value.cpu_seconds / value.wall_seconds
            } else {
                0.0
            };
            format!(
                "{:.1} s CPU in {:.1} s ({cores:.2} cores), {:.1} MB peak",
                value.cpu_seconds,
                value.wall_seconds,
                value.peak_memory_bytes as f64 / BYTES_PER_MB
            )
        },
    )
}

/// The counters' total, and each counter when any is not zero.
pub(crate) fn egress(counters: Option<&BTreeMap<String, u64>>) -> String {
    let Some(counters) = counters else {
        return "—".to_owned();
    };
    let total = counters
        .values()
        .fold(0_u64, |total, packets| total.wrapping_add(*packets));
    if total == 0 {
        return "0".to_owned();
    }
    format!("{total} packets: {}", gofmt::counters(counters))
}

/// Bits per second with the largest unit that keeps the value at or above one.
#[expect(
    clippy::cast_precision_loss,
    reason = "the unit constants are exact in f64"
)]
pub(crate) fn rate(bits_per_second: f64) -> String {
    if bits_per_second >= GBIT as f64 {
        format!("{:.2} Gbit/s", bits_per_second / GBIT as f64)
    } else if bits_per_second >= MBIT as f64 {
        format!("{:.2} Mbit/s", bits_per_second / MBIT as f64)
    } else {
        format!("{:.1} kbit/s", bits_per_second / KBIT as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::fixtures;

    /// Go: `TestSummarizeExport`.
    #[test]
    #[expect(clippy::float_cmp, reason = "the Go test compares these exactly")]
    fn summarize_export_reads_one_result() {
        let export = r#"{"format":"bitgauge.history","formatVersion":1,
            "exportedAt":"2026-10-09T12:00:00Z","results":[{
            "schema":"bitgauge.result","schemaVersion":1,"status":"complete",
            "client":{"ip":"10.8.0.2","protocol":"h2"},"settings":{"preset":"standard"},
            "download":{"status":"measured","bitsPerSecond":94100000,"windowMs":5600,
                "bytes":118000000},
            "upload":{"status":"insufficient-data","bitsPerSecond":0,"windowMs":0,"bytes":1000},
            "dataUsedBytes":268000000,"notices":[{"id":"websocket-unavailable"}]}]}"#;
        let summary = summarize_export(export.as_bytes()).expect("a summary");
        let download = summary.download.clone().unwrap_or_default();
        let upload = summary.upload.clone().unwrap_or_default();
        assert!(
            summary.status == "complete"
                && summary.preset == "standard"
                && summary.protocol == "h2"
                && download.bits_per_second == 94_100_000.0
                && download.window_ms == 5600.0
                && upload.status == "insufficient-data"
                && summary.data_used_bytes == 268_000_000.0
                && summary.notices.as_ref().map(Vec::len) == Some(1),
            "summary = {summary:?}"
        );

        let mut failures = Vec::new();
        for bad in [
            r#"{"format":"bitgauge.history","results":[]}"#,
            r#"{"format":"bitgauge.history","results":[{},{}]}"#,
            r#"{"format":"something.else","results":[{}]}"#,
            "not json",
        ] {
            if summarize_export(bad.as_bytes()).is_ok() {
                failures.push(format!("{bad} was summarized"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
        assert_eq!(
            summarize_export(br#"{"format":"something.else","results":[{}]}"#),
            Err(
                "the export holds no result: format \"something.else\" with 1 results, want \
                 bitgauge.history with one"
                    .to_owned()
            )
        );
    }

    /// Go: `TestReport`. What every report carries, in both forms, and where it goes.
    #[test]
    fn report_carries_its_statements() {
        let report = fixtures::floor_report();
        assert_eq!(
            report.runs[0].status,
            Status::Pass,
            "the floor run inside its tolerance: {}",
            report.runs[0].verdict
        );

        let temp = tempfile::tempdir().expect("a temporary directory");
        let dir = dir(
            temp.path(),
            report.tier.as_str(),
            report.started,
            &report.env_id,
        );
        assert_eq!(
            dir.file_name().and_then(|name| name.to_str()),
            Some("floor-20261009T123000Z-abcd1234")
        );
        report.write(&dir).expect("the report is written");

        let json = fs::read_to_string(dir.join("report.json")).expect("report.json");
        let decoded: serde_json::Value = serde_json::from_str(&json).expect("report.json parses");
        let run = &decoded["runs"][0];
        assert_eq!(run["referenceBefore"]["downloadBitsPerSecond"], 298_000.0);
        assert_eq!(run["referenceAfter"]["uploadBitsPerSecond"], 299_500.0);
        assert_eq!(run["ping"]["upload"]["increaseMs"], 170.0);
        assert_eq!(
            run["result"]["upload"]["loadedLatency"]["increaseMs"],
            190.0
        );
        assert_eq!(run["result"]["bufferbloat"]["grade"], "C");
        assert_eq!(decoded["latencyRule"], LATENCY_RULE);
        assert_eq!(run["result"]["download"]["responsiveness"]["rpm"], 95.0);
        assert_eq!(run["compat"]["goresponsiveness"]["rpm"], 61.0);
        assert!(run["compat"]["openspeedtest"].is_object());
        assert_eq!(decoded["tolerances"], TOLERANCES);
        assert_eq!(run["verdict"], report.runs[0].verdict.as_str());
        assert_eq!(run["reference"]["downloadBitsPerSecond"], 297_000.0);
        assert_eq!(decoded["runs"][2]["rerun"], true);

        let markdown = fs::read_to_string(dir.join("report.md")).expect("report.md");
        let mut failures = Vec::new();
        for want in [
            TOLERANCES,
            NO_EGRESS_LAYER,
            CANNOT_PROVE,
            "298.0 kbit/s / 297.0 kbit/s",
            "296.0 kbit/s / 299.5 kbit/s",
            "| 297.0 kbit/s / 298.2 kbit/s |",
            "| pass |",
            report.runs[0].verdict.as_str(),
            "| 1 (re-run) | inconclusive |",
            "download 281.0 kbit/s vs 297.0 kbit/s (-5.4 %, ±15 %)",
            &format!("- Loaded latency: {LATENCY_RULE}"),
            "download loaded +160.0 ms (websocket) vs ping +150.0 ms (±30.0 ms)",
            "grade C (download+upload) vs ping +170.0 ms (C or D)",
            "| +160.0 ms (websocket, 40 samples) / +190.0 ms (websocket, 40 samples) | 600.0 ms / \
             +150.0 ms / +170.0 ms | C (download+upload, +190.0 ms) |",
            r"failed: shaper \| self-test",
            "one real iOS Safari run over an actual VPN",
            "40.5 s CPU in 27.0 s (1.50 cores), 812.4 MB peak",
            "| measured, 95 RPM (h2, 31 samples) / unavailable_h1 |",
            "| librespeed-cli 280.0 kbit/s / 270.0 kbit/s; goresponsiveness 250.0 kbit/s / 240.0 \
             kbit/s, 61 RPM (estimate); OpenSpeedTest UI 275.0 kbit/s / 265.0 kbit/s |",
        ]
        .into_iter()
        .chain(ENVIRONMENTAL_LIMITS)
        {
            if !markdown.contains(want) {
                failures.push(format!("report.md lacks {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{}\n{markdown}", failures.join("\n"));

        // Byte for byte what the Go harness wrote for the same report (the fixtures module says
        // how).
        assert_eq!(json, include_str!("testdata/report.json"));
        assert_eq!(markdown, include_str!("testdata/report.md.txt"));
    }
}
