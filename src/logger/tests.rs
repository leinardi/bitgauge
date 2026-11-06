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

//! The Go logger tests, ported; each names the Go test it maps to.

use tracing::Level;

use super::*;
use tracing_setup::testing::Capture;

/// Go: `TestParseLevel`
#[test]
fn parse_level_takes_the_four_documented_values() {
    for (input, want) in [
        ("debug", Level::DEBUG),
        ("info", Level::INFO),
        ("warn", Level::WARN),
        ("error", Level::ERROR),
    ] {
        assert_eq!(parse_level(input), Ok(want), "{input:?}");
    }
    for input in ["", "INFO", "warning", "trace", " info"] {
        assert_eq!(
            parse_level(input),
            Err(LogError::UnknownLevel(input.to_owned())),
            "{input:?}"
        );
    }
}

/// Go: `TestNewToSelectsHandler`. The lines are tracing's: the text one carries the level, the
/// message and the field, with a UTC timestamp; the JSON one has them at the top level.
#[test]
fn to_writer_selects_the_format() {
    let text = Capture::default();
    let dispatch = to_writer(text.clone(), "text", "info").expect("a text logger");
    tracing::dispatcher::with_default(&dispatch, || {
        tracing::info!(listen = ":8080", "started");
    });
    let line = text.text();
    assert!(
        line.contains(" INFO ") && line.contains("started") && line.contains("listen=\":8080\""),
        "text line {line:?}"
    );
    let (timestamp, _) = line.split_once(' ').expect("a timestamp first");
    assert!(
        timestamp.ends_with('Z') && timestamp.contains('T'),
        "an RFC 3339 UTC timestamp: {timestamp:?}"
    );

    let json = Capture::default();
    let dispatch = to_writer(json.clone(), "json", "info").expect("a JSON logger");
    tracing::dispatcher::with_default(&dispatch, || {
        tracing::info!(listen = ":8080", "started");
    });
    let records = json.json_lines();
    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record["level"], "INFO");
    assert_eq!(record["message"], "started");
    assert_eq!(record["listen"], ":8080");
    assert!(
        record["timestamp"]
            .as_str()
            .is_some_and(|timestamp| timestamp.ends_with('Z')),
        "{record}"
    );
}

/// Go: `TestNewToFiltersBelowLevel`
#[test]
fn to_writer_filters_below_the_level() {
    for (level, emitted) in [
        ("debug", &["d", "i", "w", "e"][..]),
        ("info", &["i", "w", "e"]),
        ("warn", &["w", "e"]),
        ("error", &["e"]),
    ] {
        let capture = Capture::default();
        let dispatch = to_writer(capture.clone(), "json", level).expect("a logger");
        tracing::dispatcher::with_default(&dispatch, || {
            tracing::debug!("d");
            tracing::info!("i");
            tracing::warn!("w");
            tracing::error!("e");
        });
        let messages: Vec<String> = capture
            .json_lines()
            .iter()
            .map(|record| record["message"].as_str().unwrap_or_default().to_owned())
            .collect();
        assert_eq!(messages, emitted, "level {level}");
    }
}

/// Go: `TestNewRejectsUnknownValues`. With both unknown, the level is reported, as in Go.
#[test]
fn unknown_values_are_refused() {
    for (format, level, want) in [
        (
            "logfmt",
            "info",
            LogError::UnknownFormat("logfmt".to_owned()),
        ),
        ("", "info", LogError::UnknownFormat(String::new())),
        ("JSON", "info", LogError::UnknownFormat("JSON".to_owned())),
        (
            "text",
            "verbose",
            LogError::UnknownLevel("verbose".to_owned()),
        ),
        ("xml", "loud", LogError::UnknownLevel("loud".to_owned())),
    ] {
        assert_eq!(
            stdout(format, level).err(),
            Some(want),
            "{format:?}, {level:?}"
        );
    }
    assert_eq!(
        LogError::UnknownFormat("logfmt".to_owned()).to_string(),
        "unknown log format: \"logfmt\" (want \"text\" or \"json\")"
    );
}

/// The fallback logger writes text at info.
#[test]
fn the_fallback_is_text_at_info() {
    let capture = Capture::default();
    tracing::dispatcher::with_default(&text_to(capture.clone()), || {
        tracing::debug!("hidden");
        tracing::info!("shown");
    });
    let text = capture.text();
    assert!(text.contains(" INFO ") && text.contains("shown") && !text.contains("hidden"));
}
