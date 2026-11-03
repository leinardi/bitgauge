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

//! The configuration's log lines, through tracing's text and JSON formats.

use jiff::SignedDuration;

use super::load;
use crate::config::{
    Config, LabelRule, Log, Problem, Warmup, check, log_effective, report_problems, report_warnings,
};
use crate::logger;
use crate::test_support::Capture;

fn problem(key: &str, value: &str, rule: &str) -> Problem {
    Problem {
        key: key.to_owned(),
        value: value.to_owned(),
        rule: rule.to_owned(),
        location: None,
    }
}

fn log(format: &str, level: &str) -> Log {
    Log {
        format: format.to_owned(),
        level: level.to_owned(),
    }
}

/// Go: `TestReportProblems`
#[test]
fn report_problems_follows_the_log_settings() {
    let problems = [
        problem("server.listen", ":0", "port"),
        problem("test_defaults.units", "nibbles", "units"),
    ];

    // Valid log settings log on stdout.
    let (stdout, stderr) = (Capture::default(), Capture::default());
    report_problems(
        &problems,
        &log("json", "error"),
        stdout.clone(),
        stderr.clone(),
    );
    assert_eq!(stderr.text(), "");
    let records = stdout.json_lines();
    assert_eq!(records.len(), problems.len());
    for (record, want) in records.iter().zip(&problems) {
        assert_eq!(record["level"], "ERROR");
        assert_eq!(record["message"], "invalid configuration");
        assert_eq!(record["key"], want.key.as_str());
        assert_eq!(record["value"], want.value.as_str());
        assert_eq!(record["rule"], want.rule.as_str());
    }

    // Invalid log settings fall back to text on stderr.
    let (stdout, stderr) = (Capture::default(), Capture::default());
    report_problems(
        &problems,
        &log("xml", "info"),
        stdout.clone(),
        stderr.clone(),
    );
    assert_eq!(stdout.text(), "");
    let text = stderr.text();
    assert!(
        text.contains(" ERROR ")
            && text.contains("key=\"server.listen\"")
            && text.contains("value=\"nibbles\"")
            && text.lines().count() == problems.len(),
        "stderr {text:?}"
    );
}

/// Go: `TestInvalidLogKeysReportOnStderr`. Log settings that never decoded leave the default
/// text and info behind, but the problems go to stderr anyway.
#[test]
fn invalid_log_keys_report_on_stderr() {
    for (name, file, entries) in [
        ("null level", "log:\n  level:\n", &[][..]),
        ("number as the level", "log: {level: 1}\n", &[]),
        ("scalar log section", "log: text\n", &[]),
        (
            "a level below the level",
            "{}\n",
            &["BITGAUGE_LOG__LEVEL__X=debug"],
        ),
        ("unknown format", "log:\n  format: logfmt\n", &[]),
    ] {
        let loaded = load(file, entries);
        let problems = check(&loaded);
        let (stdout, stderr) = (Capture::default(), Capture::default());
        report_problems(
            &problems,
            &loaded.config.log,
            stdout.clone(),
            stderr.clone(),
        );
        assert_eq!(stdout.text(), "", "{name}");
        assert!(
            stderr.text().contains("key=\"log"),
            "{name}: {:?}",
            stderr.text()
        );
    }
}

/// The warnings log at warn with the same fields.
#[test]
fn report_warnings_logs_at_warn() {
    let capture = Capture::default();
    let dispatch = logger::to_writer(capture.clone(), "json", "info").expect("a logger");
    tracing::dispatcher::with_default(&dispatch, || {
        report_warnings(&[problem("metrics.enabled", "true", "restrict it")]);
    });
    let records = capture.json_lines();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["level"], "WARN");
    assert_eq!(records[0]["message"], "suspicious configuration");
    assert_eq!(records[0]["key"], "metrics.enabled");
}

/// Go: `TestEffective`, the rendering half: the startup line through both formats.
#[test]
fn effective_configuration_line() {
    let mut config = Config::default();
    config.server.trusted_proxies = vec!["172.20.0.2/32".parse().expect("a CIDR")];
    config.server.labels = vec![
        LabelRule {
            cidr: Some("10.8.0.0/24".parse().expect("a CIDR")),
            label: "VPN".to_owned(),
        },
        LabelRule {
            cidr: Some("fd7a:115c:a1e0::/48".parse().expect("a CIDR")),
            label: "Tailscale".to_owned(),
        },
    ];
    config.test_defaults.download.max_duration = Some(SignedDuration::from_secs(30));
    config.test_defaults.warmup = Warmup::Fixed(SignedDuration::from_secs(3));

    let text = Capture::default();
    let dispatch = logger::to_writer(text.clone(), "text", "info").expect("a logger");
    tracing::dispatcher::with_default(&dispatch, || log_effective(&config));
    let line = text.text();
    for want in [
        " INFO configuration ",
        "server.listen=\":8080\"",
        "server.trusted_proxies=\"[172.20.0.2/32]\"",
        "server.labels=\"[10.8.0.0/24=VPN fd7a:115c:a1e0::/48=Tailscale]\"",
        "test_defaults.download.max_duration=\"30s\"",
        "test_defaults.download.min_duration=\"\"",
        "test_defaults.warmup=\"3s\"",
        "limits.max_download_bytes=268435456",
        "metrics.path=\"/metrics\"",
    ] {
        assert!(line.contains(want), "text line {line:?} lacks {want:?}");
    }

    let json = Capture::default();
    let dispatch = logger::to_writer(json.clone(), "json", "info").expect("a logger");
    tracing::dispatcher::with_default(&dispatch, || log_effective(&Config::default()));
    let records = json.json_lines();
    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record["message"], "configuration");
    assert_eq!(record["test_defaults.warmup"], "auto");
    assert_eq!(record["server.labels"], "[]");
    assert_eq!(record["limits.max_streams_per_client"], 8);
    assert_eq!(record["metrics.enabled"], false);

    // Below its level the line is not built at all.
    let quiet = Capture::default();
    let dispatch = logger::to_writer(quiet.clone(), "json", "warn").expect("a logger");
    tracing::dispatcher::with_default(&dispatch, || log_effective(&config));
    assert_eq!(quiet.text(), "");
}
