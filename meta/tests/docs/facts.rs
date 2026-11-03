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

//! The wire facts several contract pages state, ported from `test/docs/facts.go`: the native
//! `/api/v1` names, the upload telemetry key set and a few numbers that must agree everywhere.
//!
//! RE2's `\d`, `\s` and `\b` are ASCII-only and Rust's are Unicode-aware, so the patterns spell
//! out `[0-9]`, `[\t\n\f\r ]` and `(?-u:\b)` to keep Go's meaning.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use regex::Regex;

fn pattern(text: &str) -> Regex {
    Regex::new(text).unwrap_or_else(|error| panic!("pattern {text}: {error}"))
}

/// The only paths under `/api/v1` (wire-protocol.md section 2).
pub const NATIVE_ENDPOINTS: [&str; 6] = ["download", "upload", "ping", "small", "ws", "info"];

/// The exact key set of the upload telemetry object (wire-protocol.md section 4).
pub const UPLOAD_KEYS: [&str; 7] = [
    "epoch",
    "bucketMs",
    "firstBucket",
    "buckets",
    "bytes",
    "startMs",
    "durationMs",
];

/// Keys that mark an object as upload telemetry rather than another object that happens to carry
/// a `bucketMs`, such as the limits of `GET /info` or a result's series.
const UPLOAD_ONLY_KEYS: [&str; 5] = ["epoch", "firstBucket", "buckets", "startMs", "durationMs"];

/// `/api/v1` paths the contract names only to record that they were not chosen.
const REJECTED_API_PATHS: [&str; 1] = [
    // decisions.md section 7: metrics live at the root, outside the versioned API.
    "/api/v1/metrics",
];

static API_PATH: LazyLock<Regex> = LazyLock::new(|| pattern(r"/api/v1/([A-Za-z0-9_.-]+)"));
/// A key of a JSON object.
static JSON_KEY: LazyLock<Regex> = LazyLock::new(|| pattern(r#""([A-Za-z]+)"[\t\n\f\r ]*:"#));
/// A key of the `{a, b[], c}` shorthand diagrams use.
static SHORTHAND_KEY: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?-u:\b)([A-Za-z]+)(?-u:\b)(?:\[\])?[\t\n\f\r ]*[,}]"));

/// A number several pages state, checked wherever its pattern finds it. `want` is the only value
/// its capture groups (whichever one matched) may hold, and the pattern must match at least once,
/// so rewording a page so the fact is no longer recognized fails rather than passing on nothing.
pub struct Fact {
    pub name: &'static str,
    pub pattern: Regex,
    pub want: &'static str,
}

/// The facts, grown as drift appears; free-text numeric agreement is not attempted beyond them.
pub static FACTS: LazyLock<Vec<Fact>> = LazyLock::new(|| {
    [
        (
            "bucketMs in JSON",
            r#""bucketMs":[\t\n\f\r ]*([0-9]+)"#,
            "100",
        ),
        (
            "bucket width in prose",
            r"([0-9]+) ms buckets?(?-u:\b)",
            "100",
        ),
        (
            "upload buckets per request",
            r"(?:[Aa]t most ([0-9]+) entries|≤ ([0-9]+) integers|exceeds ([0-9]+) cells)",
            "1201",
        ),
        (
            "upload lifetime in cells",
            r"120 s \(([0-9]+) cells\)",
            "1200",
        ),
        (
            "upload lifetime in JSON",
            r#""uploadLifetimeMs":[\t\n\f\r ]*([0-9]+)"#,
            "120000",
        ),
        ("default listen port", r#"listen: ":([0-9]+)""#, "8080"),
    ]
    .into_iter()
    .map(|(name, text, want)| Fact {
        name,
        pattern: pattern(text),
        want,
    })
    .collect()
});

/// A fact found with the wrong value.
pub struct Mismatch {
    pub got: String,
    pub line: usize,
}

/// Every place in `content` where `fact` holds another value, and how many times it was found at
/// all.
pub fn check_fact(fact: &Fact, content: &str) -> (Vec<Mismatch>, usize) {
    let mut mismatches = Vec::new();
    let mut found = 0;
    for (index, line) in content.split('\n').enumerate() {
        for captures in fact.pattern.captures_iter(line) {
            found += 1;
            let got: String = captures
                .iter()
                .skip(1)
                .map(|group| group.map_or("", |matched| matched.as_str()))
                .collect();
            if got != fact.want {
                mismatches.push(Mismatch {
                    got,
                    line: index + 1,
                });
            }
        }
    }
    (mismatches, found)
}

/// Every `/api/v1/<name>` in `content` whose name is not a native endpoint, and how many `/api/v1`
/// paths it found at all.
pub fn api_paths(content: &str) -> (Vec<String>, usize) {
    let mut unknown = Vec::new();
    let mut found = 0;
    for captures in API_PATH.captures_iter(content) {
        found += 1;
        if !NATIVE_ENDPOINTS.contains(&&captures[1]) && !REJECTED_API_PATHS.contains(&&captures[0])
        {
            unknown.push(captures[0].to_owned());
        }
    }
    (unknown, found)
}

/// The sorted key set of every brace-delimited object in `content` that carries `bucketMs`
/// together with an upload-only key: JSON objects in code blocks and the `{a, b, c}` shorthand of
/// diagrams alike. Nested objects are separated by depth, so only the keys directly inside each
/// object count.
pub fn upload_objects(content: &str) -> Vec<Vec<String>> {
    let mut objects = Vec::new();
    let mut stack = Vec::new();
    for (offset, character) in content.char_indices() {
        match character {
            '{' => stack.push(offset),
            '}' => {
                let Some(start) = stack.pop() else {
                    continue;
                };
                let keys = direct_keys(&content[start + 1..=offset]);
                if keys.iter().any(|key| key == "bucketMs")
                    && UPLOAD_ONLY_KEYS
                        .iter()
                        .any(|wanted| keys.iter().any(|key| key == wanted))
                {
                    objects.push(keys);
                }
            }
            _ => {}
        }
    }
    objects
}

/// The sorted keys of an object body (with its closing brace), nested objects and arrays skipped.
fn direct_keys(body: &str) -> Vec<String> {
    let mut flat = String::new();
    let mut depth = 0_usize;
    for character in body.chars() {
        match character {
            '{' | '[' => depth += 1,
            '}' | ']' if depth > 0 => {
                depth -= 1;
                if character == ']' && depth == 0 {
                    flat.push_str("[]");
                }
                continue;
            }
            _ => {}
        }
        if depth == 0 {
            flat.push(character);
        }
    }
    let key_pattern = if flat.contains("\":") {
        &*JSON_KEY
    } else {
        &*SHORTHAND_KEY
    };
    key_pattern
        .captures_iter(&flat)
        .map(|captures| captures[1].to_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
