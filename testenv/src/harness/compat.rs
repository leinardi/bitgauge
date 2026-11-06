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

//! The outputs of the compatibility step (testing.md section 5), one file per client in the
//! run's compatibility directory ([`Artifacts::compat`](super::ping::Artifacts)). The step itself
//! runs Docker (the harness runner); writing and reading the files is plain code, unit-tested on
//! fixture outputs. Each client passes when it exits without an error and reports a non-zero
//! download and upload, and goresponsiveness an RPM; anything else, a missing or unreadable file
//! included, fails the profile and is never a skip.

use std::fmt;
use std::path::Path;
use std::sync::LazyLock;

use super::gofmt::quote;
use regex::Regex;
use serde::{Deserialize, Serialize};

use super::gofmt;
use super::profiles::MBIT;
use super::report::{create_dir, read_file, write_file};

/// librespeed-cli's `--json` output.
pub const LIBRESPEED_FILE: &str = "librespeed.json";
/// What [`write_goresponsiveness`] reads from goresponsiveness's summary.
pub const GORESPONSIVENESS_FILE: &str = "goresponsiveness.json";
/// What the `OpenSpeedTest` driver recorded.
pub const OPENSPEEDTEST_FILE: &str = "openspeedtest.json";
/// goresponsiveness's own output, which its JSON is read from.
const GORESPONSIVENESS_LOG: &str = "goresponsiveness.txt";

/// The status line the `OpenSpeedTest` UI ends a completed test on.
const OPENSPEEDTEST_DONE: &str = "All done";

#[expect(clippy::cast_precision_loss, reason = "a constant exact in f64")]
const MBIT_F64: f64 = MBIT as f64;

/// The throughput line goresponsiveness prints under each direction's heading, in Mbit/s. Go's
/// `\s` is ASCII.
static GORESPONSIVENESS_THROUGHPUT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\t\n\f\r ]+Throughput: ([0-9.]+) Mbps \(")
        .unwrap_or_else(|_| unreachable!("the throughput pattern is a constant that compiles"))
});

/// Its final RPM, at the percentile it names.
static GORESPONSIVENESS_RPM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^Final RPM: ([0-9]+) \(P[0-9]+\)$")
        .unwrap_or_else(|_| unreachable!("the RPM pattern is a constant that compiles"))
});

/// One compatibility client's numbers. They follow the client's own method (compatibility.md),
/// so they are recorded, not held to the tolerance table.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatClient {
    /// The download it reported.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub download_bits_per_second: f64,
    /// The upload it reported.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    pub upload_bits_per_second: f64,
    /// goresponsiveness's final RPM at its percentile; zero for the other clients.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "is_zero")]
    pub rpm: f64,
    /// goresponsiveness's note that a direction did not run to stability.
    #[serde(default, deserialize_with = "gofmt::nullable")]
    #[serde(skip_serializing_if = "is_false")]
    pub estimate: bool,
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

/// What the compatibility step recorded of one run: each client that produced its numbers.
/// `OpenSpeedTest` runs in Chromium only, so it is `None` on the other browsers' runs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
pub struct Compat {
    /// librespeed-cli.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub librespeed: Option<CompatClient>,
    /// goresponsiveness.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub goresponsiveness: Option<CompatClient>,
    /// The `OpenSpeedTest` UI.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openspeedtest: Option<CompatClient>,
}

/// What made a client fail the profile.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompatErrorKind {
    /// The client exited non-zero, or the UI ended on another status.
    ClientFailed,
    /// Its output is missing, empty or unreadable.
    ClientOutput,
    /// It reported a zero download, upload or RPM.
    ClientNumbers,
    /// A file could not be written or read.
    Io,
}

/// A failure of one client, its message in the Go harness's words.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompatError {
    kind: CompatErrorKind,
    message: String,
}

impl CompatError {
    fn new(kind: CompatErrorKind, message: String) -> Self {
        Self { kind, message }
    }

    /// What made the client fail.
    #[must_use]
    pub const fn kind(&self) -> CompatErrorKind {
        self.kind
    }

    /// Each error's message on its own line, as Go's `errors.Join` prints them; empty for none.
    #[must_use]
    pub fn join(errors: &[Self]) -> String {
        errors
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl fmt::Display for CompatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CompatError {}

const FAILED: &str = "the client failed";
const UNUSABLE: &str = "the client's output is unusable";
const NO_NUMBERS: &str = "the client reported no throughput";

/// Keeps librespeed-cli's JSON output as librespeed.json; a non-zero exit, `run_error` the
/// message of the failed command, fails the client and writes nothing.
///
/// # Errors
///
/// The client failed, or the file cannot be written.
pub fn write_librespeed(
    dir: &Path,
    output: &str,
    run_error: Option<&str>,
) -> Result<(), CompatError> {
    if let Some(run_error) = run_error {
        return Err(CompatError::new(
            CompatErrorKind::ClientFailed,
            format!("librespeed-cli: {FAILED}: {run_error}"),
        ));
    }
    write_compat_file(dir, LIBRESPEED_FILE, output.as_bytes())
}

/// Keeps goresponsiveness's output and writes goresponsiveness.json from it. goresponsiveness
/// has no JSON output, and its Prometheus file holds the last direction only, so the JSON is read
/// from the summary it prints: each direction's throughput line and the final RPM. A non-zero
/// exit, `run_error` the message of the failed command (with the client's standard error), fails
/// the client, keeps that message in place of the output, which the docker CLI does not return
/// then, and writes no JSON; an output without the three lines writes none either, which
/// [`read_compat`] reports as a missing file.
///
/// # Errors
///
/// The client failed, its summary lacks a line, or a file cannot be written.
pub fn write_goresponsiveness(
    dir: &Path,
    output: &str,
    run_error: Option<&str>,
) -> Result<(), CompatError> {
    let kept = run_error.map_or_else(|| output.to_owned(), |error| format!("{error}\n"));
    write_compat_file(dir, GORESPONSIVENESS_LOG, kept.as_bytes())?;
    if let Some(run_error) = run_error {
        return Err(CompatError::new(
            CompatErrorKind::ClientFailed,
            format!("goresponsiveness: {FAILED}: {run_error}"),
        ));
    }
    let client = parse_goresponsiveness(output).map_err(|error| {
        CompatError::new(error.kind, format!("goresponsiveness: {}", error.message))
    })?;
    let mut encoded = gofmt::to_json_indent(&client).map_err(|error| {
        CompatError::new(
            CompatErrorKind::Io,
            format!("encode {GORESPONSIVENESS_FILE}: {error}"),
        )
    })?;
    encoded.push('\n');
    write_compat_file(dir, GORESPONSIVENESS_FILE, encoded.as_bytes())
}

/// The summary goresponsiveness prints: a "Download:" and an "Upload:" heading, each followed by
/// its indented throughput line, and the final RPM line.
fn parse_goresponsiveness(output: &str) -> Result<CompatClient, CompatError> {
    let mut client = CompatClient::default();
    let (mut download, mut upload, mut rpm) = (false, false, false);
    let mut heading = "";
    let unusable = |line: &str, error: &str| {
        CompatError::new(
            CompatErrorKind::ClientOutput,
            format!("{UNUSABLE}: {}: {error}", quote(line)),
        )
    };

    for line in gofmt::scan_lines(output) {
        if line == "Download:" || line == "Upload:" {
            heading = line.trim_end_matches(':');
        } else if line.contains("did not run to stability") {
            client.estimate = true;
        } else if let Some(captures) = GORESPONSIVENESS_THROUGHPUT
            .captures(line)
            .filter(|_| !heading.is_empty())
        {
            let mbps = gofmt::parse_float(&captures[1]).map_err(|error| unusable(line, &error))?;
            if heading == "Download" {
                client.download_bits_per_second = mbps * MBIT_F64;
                download = true;
            } else {
                client.upload_bits_per_second = mbps * MBIT_F64;
                upload = true;
            }
            heading = "";
        } else if let Some(captures) = GORESPONSIVENESS_RPM.captures(line).filter(|_| !rpm) {
            client.rpm =
                gofmt::parse_float(&captures[1]).map_err(|error| unusable(line, &error))?;
            rpm = true;
        }
    }

    for (want, seen) in [("Download", download), ("Upload", upload), ("RPM", rpm)] {
        if !seen {
            return Err(CompatError::new(
                CompatErrorKind::ClientOutput,
                format!("{UNUSABLE}: no {want} line in the summary"),
            ));
        }
    }
    Ok(client)
}

/// The step's files in `dir`: librespeed.json and goresponsiveness.json, and openspeedtest.json
/// when the run drove the `OpenSpeedTest` UI. It returns every client it could read, with every
/// failure: a missing or empty file, a parse failure, an `OpenSpeedTest` run that did not complete,
/// or a zero download, upload or RPM. A client that reports numbers is kept even when they fail
/// the check, so the report shows what it measured.
#[must_use]
pub fn read_compat(dir: &Path, openspeedtest: bool) -> (Compat, Vec<CompatError>) {
    let mut errors = Vec::new();
    let mut read = |name: &str, parse: Parser| {
        let (client, error) = read_compat_client(dir, name, parse);
        errors.extend(error);
        client
    };
    let compat = Compat {
        librespeed: read(LIBRESPEED_FILE, parse_librespeed),
        goresponsiveness: read(GORESPONSIVENESS_FILE, parse_goresponsiveness_json),
        openspeedtest: if openspeedtest {
            read(OPENSPEEDTEST_FILE, parse_openspeedtest)
        } else {
            None
        },
    };
    (compat, errors)
}

type Parser = fn(&[u8]) -> Result<CompatClient, CompatError>;

/// One file, its numbers checked.
fn read_compat_client(
    dir: &Path,
    name: &str,
    parse: Parser,
) -> (Option<CompatClient>, Option<CompatError>) {
    let output_error = |detail: &str| {
        CompatError::new(
            CompatErrorKind::ClientOutput,
            format!("{name}: {UNUSABLE}: {detail}"),
        )
    };
    let data = match read_file(&dir.join(name)) {
        Ok(Some(data)) => data,
        Ok(None) => return (None, Some(output_error("missing"))),
        Err(error) => {
            return (
                None,
                Some(CompatError::new(
                    CompatErrorKind::Io,
                    format!("{name}: {error}"),
                )),
            );
        }
    };
    if String::from_utf8_lossy(&data).trim().is_empty() {
        return (None, Some(output_error("empty")));
    }
    let client = match parse(&data) {
        Ok(client) => client,
        Err(error) => {
            return (
                None,
                Some(CompatError::new(error.kind, format!("{name}: {error}"))),
            );
        }
    };

    let mut zero = Vec::new();
    if client.download_bits_per_second <= 0.0 {
        zero.push("download");
    }
    if client.upload_bits_per_second <= 0.0 {
        zero.push("upload");
    }
    if name == GORESPONSIVENESS_FILE && client.rpm <= 0.0 {
        zero.push("RPM");
    }
    if zero.is_empty() {
        return (Some(client), None);
    }
    (
        Some(client),
        Some(CompatError::new(
            CompatErrorKind::ClientNumbers,
            format!("{name}: {NO_NUMBERS}: zero {}", zero.join(", ")),
        )),
    )
}

fn unusable(error: &str) -> CompatError {
    CompatError::new(
        CompatErrorKind::ClientOutput,
        format!("{UNUSABLE}: {error}"),
    )
}

#[derive(Deserialize)]
struct LibreSpeedResult {
    #[serde(default)]
    download: Option<f64>,
    #[serde(default)]
    upload: Option<f64>,
}

/// librespeed-cli's `--json` output: one result per server tested, of which `--server 1` makes
/// exactly one, with its download and upload in Mbit/s.
fn parse_librespeed(data: &[u8]) -> Result<CompatClient, CompatError> {
    let results: Option<Vec<LibreSpeedResult>> =
        gofmt::unmarshal(data).map_err(|error| unusable(&error))?;
    let results = results.unwrap_or_default();
    match results.as_slice() {
        [
            LibreSpeedResult {
                download: Some(download),
                upload: Some(upload),
            },
        ] => Ok(CompatClient {
            download_bits_per_second: download * MBIT_F64,
            upload_bits_per_second: upload * MBIT_F64,
            ..CompatClient::default()
        }),
        _ => Err(unusable(&format!(
            "{} results, want one with its download and upload",
            results.len()
        ))),
    }
}

/// The goresponsiveness.json [`write_goresponsiveness`] wrote.
fn parse_goresponsiveness_json(data: &[u8]) -> Result<CompatClient, CompatError> {
    let client: Option<CompatClient> = gofmt::unmarshal(data).map_err(|error| unusable(&error))?;
    Ok(client.unwrap_or_default())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenSpeedTestShown {
    #[serde(default, deserialize_with = "gofmt::nullable")]
    status: String,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    download_mbps: String,
    #[serde(default, deserialize_with = "gofmt::nullable")]
    upload_mbps: String,
}

/// What the `OpenSpeedTest` driver recorded: the status line the UI ended on and the download and
/// upload it shows, in Mbit/s.
fn parse_openspeedtest(data: &[u8]) -> Result<CompatClient, CompatError> {
    let shown: Option<OpenSpeedTestShown> =
        gofmt::unmarshal(data).map_err(|error| unusable(&error))?;
    let shown = shown.unwrap_or(OpenSpeedTestShown {
        status: String::new(),
        download_mbps: String::new(),
        upload_mbps: String::new(),
    });
    if shown.status != OPENSPEEDTEST_DONE {
        return Err(CompatError::new(
            CompatErrorKind::ClientFailed,
            format!("{FAILED}: the UI ended on {}", quote(&shown.status)),
        ));
    }
    let download = gofmt::parse_float(shown.download_mbps.trim());
    let upload = gofmt::parse_float(shown.upload_mbps.trim());
    match (download, upload) {
        (Ok(download), Ok(upload)) => Ok(CompatClient {
            download_bits_per_second: download * MBIT_F64,
            upload_bits_per_second: upload * MBIT_F64,
            ..CompatClient::default()
        }),
        (download, upload) => {
            let joined: Vec<String> = [download.err(), upload.err()]
                .into_iter()
                .flatten()
                .collect();
            Err(unusable(&joined.join("\n")))
        }
    }
}

fn write_compat_file(dir: &Path, name: &str, data: &[u8]) -> Result<(), CompatError> {
    create_dir(dir).map_err(|error| {
        CompatError::new(
            CompatErrorKind::Io,
            format!("create {}: {error}", dir.display()),
        )
    })?;
    write_file(&dir.join(name), data)
        .map_err(|error| CompatError::new(CompatErrorKind::Io, format!("write {name}: {error}")))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    use super::*;

    /// The clients' outputs as the CI tier's Caddy profile produced them.
    const LIBRESPEED_OUTPUT: &str = concat!(
        r#"[{"timestamp":"2026-10-19T13:51:07.708319658Z","server":{"name":"BitGauge","#,
        r#""url":"https://proxy:8443/"},"client":{"ip":"","hostname":"","city":"","region":"","#,
        r#""country":"","loc":"","org":"","postal":"","timezone":""},"bytes_sent":117831559,"#,
        r#""bytes_received":116149467,"ping":50.3,"jitter":0.02,"upload":91.4,"download":93.5,"#,
        r#""share":""}]"#
    );
    const GORESPONSIVENESS_OUTPUT: &str =
        "10-19-2026 13:51:12 UTC Go Responsiveness to proxy:8443...
Results:
========
Download:
\tNote: Test did not run to stability (throughput), these results are estimates.
\tThroughput: 92.863 Mbps (11.608 MBps), using 16 parallel connections.
\tRPM: 288 (P90)
\tRPM: 1039 (Single-Sided 5% Trimmed Mean)
========
Upload:
\tThroughput: 90.258 Mbps (11.282 MBps), using 16 parallel connections.
\tRPM: 577 (P90)
\tRPM: 1801 (Single-Sided 5% Trimmed Mean)
========
Final RPM: 307 (P90)
Final RPM: 1377 (Single-Sided 5% Trimmed Mean)
";
    const OPENSPEEDTEST_OUTPUT: &str =
        r#"{"status": "All done", "downloadMbps": "93.4", "uploadMbps": "91.2"}"#;

    const EXIT: &str = "exit status 1";

    /// The three clients' files in a fresh directory, each replaced by its entry in `overrides`
    /// when there is one; a `None` entry leaves the file out.
    fn write_fixtures(overrides: &BTreeMap<&str, Option<&str>>) -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let dir = temp.path().to_path_buf();
        write_librespeed(&dir, LIBRESPEED_OUTPUT, None).expect("librespeed.json");
        write_goresponsiveness(&dir, GORESPONSIVENESS_OUTPUT, None).expect("goresponsiveness.json");
        write_compat_file(&dir, OPENSPEEDTEST_FILE, OPENSPEEDTEST_OUTPUT.as_bytes())
            .expect("openspeedtest.json");
        for (name, content) in overrides {
            let path = dir.join(name);
            match content {
                None => std::fs::remove_file(&path).expect("the file is removed"),
                Some(content) => std::fs::write(&path, content).expect("the file is written"),
            }
        }
        (temp, dir)
    }

    fn close_to(got: f64, want: f64) -> bool {
        got > want * (1.0 - 1e-9) && got < want * (1.0 + 1e-9)
    }

    /// Go: `TestReadCompat`.
    #[test]
    #[expect(clippy::float_cmp, reason = "the Go test compares these exactly")]
    fn read_compat_reads_every_client() {
        let (_temp, dir) = write_fixtures(&BTreeMap::new());
        let (compat, errors) = read_compat(&dir, true);
        assert!(errors.is_empty(), "{}", CompatError::join(&errors));

        let client = |download: f64, upload: f64, rpm: f64, estimate: bool| CompatClient {
            download_bits_per_second: download,
            upload_bits_per_second: upload,
            rpm,
            estimate,
        };
        let mut failures = Vec::new();
        for (name, got, want) in [
            (
                "librespeed",
                compat.librespeed,
                client(93.5e6, 91.4e6, 0.0, false),
            ),
            (
                "goresponsiveness",
                compat.goresponsiveness,
                client(92.863e6, 90.258e6, 307.0, true),
            ),
            (
                "openspeedtest",
                compat.openspeedtest,
                client(93.4e6, 91.2e6, 0.0, false),
            ),
        ] {
            let matches = got.is_some_and(|got| {
                close_to(got.download_bits_per_second, want.download_bits_per_second)
                    && close_to(got.upload_bits_per_second, want.upload_bits_per_second)
                    && got.rpm == want.rpm
                    && got.estimate == want.estimate
            });
            if !matches {
                failures.push(format!("{name} = {got:?}, want {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));

        // Outside Chromium the OpenSpeedTest UI does not run, and its file is not read.
        let (_temp, dir) = write_fixtures(&BTreeMap::from([(OPENSPEEDTEST_FILE, None)]));
        let (compat, errors) = read_compat(&dir, false);
        assert!(
            errors.is_empty() && compat.openspeedtest.is_none(),
            "without the OpenSpeedTest UI: {compat:?}, {}",
            CompatError::join(&errors)
        );
    }

    /// Go: `TestReadCompatFailures`. Every failure mode of the step on fixture outputs: each
    /// fails the profile, and none is a skip.
    #[test]
    #[expect(clippy::too_many_lines, reason = "one Go test table, kept whole")]
    #[expect(clippy::float_cmp, reason = "the Go test compares these exactly")]
    fn read_compat_failures() {
        type Kept = Option<fn(&Compat) -> bool>;
        let cases: [(&str, &str, Option<&str>, &str, Kept); 14] = [
            (
                "librespeed missing",
                LIBRESPEED_FILE,
                None,
                "librespeed.json: the client's output is unusable: missing",
                None,
            ),
            (
                "goresponsiveness missing",
                GORESPONSIVENESS_FILE,
                None,
                "goresponsiveness.json: the client's output is unusable: missing",
                None,
            ),
            (
                "openspeedtest missing",
                OPENSPEEDTEST_FILE,
                None,
                "openspeedtest.json: the client's output is unusable: missing",
                None,
            ),
            (
                "librespeed empty",
                LIBRESPEED_FILE,
                Some(" \n"),
                "librespeed.json: the client's output is unusable: empty",
                None,
            ),
            (
                "openspeedtest empty",
                OPENSPEEDTEST_FILE,
                Some(""),
                "openspeedtest.json: the client's output is unusable: empty",
                None,
            ),
            (
                "librespeed not JSON",
                LIBRESPEED_FILE,
                Some("Error: no server"),
                "librespeed.json: the client's output is unusable: invalid character",
                None,
            ),
            (
                "librespeed no result",
                LIBRESPEED_FILE,
                Some("[]"),
                "librespeed.json: the client's output is unusable: 0 results",
                None,
            ),
            (
                "librespeed without upload",
                LIBRESPEED_FILE,
                Some(r#"[{"download":93.5}]"#),
                "librespeed.json: the client's output is unusable: 1 results",
                None,
            ),
            (
                "goresponsiveness not JSON",
                GORESPONSIVENESS_FILE,
                Some("{"),
                "goresponsiveness.json: the client's output is unusable",
                None,
            ),
            (
                "openspeedtest not a number",
                OPENSPEEDTEST_FILE,
                Some(r#"{"status":"All done","downloadMbps":"","uploadMbps":"91.2"}"#),
                "openspeedtest.json: the client's output is unusable: strconv.ParseFloat",
                None,
            ),
            (
                "openspeedtest network error",
                OPENSPEEDTEST_FILE,
                Some(concat!(
                    r#"{"status":"Check your network connection status.","#,
                    r#""downloadMbps":"0","uploadMbps":"0"}"#
                )),
                "openspeedtest.json: the client failed: the UI ended on \"Check your network \
                 connection status.\"",
                None,
            ),
            (
                "librespeed zero download",
                LIBRESPEED_FILE,
                Some(r#"[{"download":0,"upload":91.4}]"#),
                "librespeed.json: the client reported no throughput: zero download",
                Some(|compat| {
                    compat
                        .librespeed
                        .is_some_and(|client| client.upload_bits_per_second == 91.4e6)
                }),
            ),
            (
                "openspeedtest zero upload",
                OPENSPEEDTEST_FILE,
                Some(r#"{"status":"All done","downloadMbps":"93.4","uploadMbps":"0.000"}"#),
                "openspeedtest.json: the client reported no throughput: zero upload",
                None,
            ),
            (
                "goresponsiveness zero RPM",
                GORESPONSIVENESS_FILE,
                Some(r#"{"downloadBitsPerSecond":9e7,"uploadBitsPerSecond":9e7,"rpm":0}"#),
                "goresponsiveness.json: the client reported no throughput: zero RPM",
                None,
            ),
        ];
        let mut failures = Vec::new();
        for (name, file, content, want, kept) in cases {
            let (_temp, dir) = write_fixtures(&BTreeMap::from([(file, content)]));
            let (compat, errors) = read_compat(&dir, true);
            let message = CompatError::join(&errors);
            if errors.is_empty() || !message.contains(want) {
                failures.push(format!("{name}: {message:?}, want {want:?}"));
            }
            if let Some(kept) = kept
                && !kept(&compat)
            {
                failures.push(format!("{name}: the numbers were not kept: {compat:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestWriteCompatFailures`. A non-zero exit fails the client and writes no file the
    /// read could mistake for a result; a goresponsiveness summary without its lines writes no
    /// JSON.
    #[test]
    fn write_compat_failures() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let dir = temp.path();

        let error = write_librespeed(dir, LIBRESPEED_OUTPUT, Some(EXIT)).expect_err("a failure");
        assert!(
            error.kind() == CompatErrorKind::ClientFailed && error.to_string().contains(EXIT),
            "librespeed-cli's non-zero exit: {error}"
        );
        let error = write_goresponsiveness(dir, GORESPONSIVENESS_OUTPUT, Some(EXIT))
            .expect_err("a failure");
        assert_eq!(error.kind(), CompatErrorKind::ClientFailed, "{error}");
        let kept = std::fs::read_to_string(dir.join(GORESPONSIVENESS_LOG)).expect("the log");
        assert_eq!(
            kept,
            format!("{EXIT}\n"),
            "goresponsiveness's failure kept no error"
        );

        let (_, errors) = read_compat(dir, false);
        let message = CompatError::join(&errors);
        assert!(
            message.contains("librespeed.json: the client's output is unusable: missing")
                && message
                    .contains("goresponsiveness.json: the client's output is unusable: missing"),
            "after both exits failed: {message}"
        );

        let mut failures = Vec::new();
        for (name, output) in [
            (
                "no upload",
                GORESPONSIVENESS_OUTPUT.replacen("Upload:", "Uplink:", 1),
            ),
            (
                "no final RPM",
                GORESPONSIVENESS_OUTPUT.replace("Final RPM", "Last RPM"),
            ),
            ("empty", String::new()),
        ] {
            let temp = tempfile::tempdir().expect("a temporary directory");
            let dir = temp.path();
            match write_goresponsiveness(dir, &output, None) {
                Err(error) if error.kind() == CompatErrorKind::ClientOutput => {}
                other => failures.push(format!("goresponsiveness {name}: {other:?}")),
            }
            if dir.join(GORESPONSIVENESS_FILE).exists() {
                failures.push(format!("goresponsiveness {name} wrote its JSON"));
            }
            if !dir.join(GORESPONSIVENESS_LOG).exists() {
                failures.push(format!("goresponsiveness {name} kept no output"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// goresponsiveness.json as the harness writes it from the same summary (a whole float reads
    /// `92863000.0`, where the Go harness wrote `92863000`).
    #[test]
    fn goresponsiveness_json_matches_go() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        write_goresponsiveness(temp.path(), GORESPONSIVENESS_OUTPUT, None).expect("written");
        let written =
            std::fs::read_to_string(temp.path().join(GORESPONSIVENESS_FILE)).expect("the JSON");
        assert_eq!(written, include_str!("testdata/goresponsiveness.json"));
    }
}
