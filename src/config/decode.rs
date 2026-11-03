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

//! The typed walker: every key of configuration.md section 2 with its type, and the decoding of
//! the raw tree into a [`Config`]. A key that does not decode is a problem and keeps its
//! default, so validation does not report it a second time under another rule; every other key
//! still decodes.
//!
//! The conversions are strict, as the Go decode hook was: an integer key takes a whole number
//! only, a size a whole non-negative one, a boolean only `true` or `false`, and a key whose value
//! is text (a CIDR, an address, a duration, an origin) takes text only.

use std::collections::BTreeSet;
use std::str::FromStr;

use jiff::SignedDuration;

use super::gofmt::{float, quote};
use super::raw::{Map, Node, Raw};
use super::types::{PLACEHOLDER_CIDR, ValueError, parse_duration};
use super::{Cidr, Config, LabelRule, Listen, Origin, Problem, Size, Warmup};

/// Where a key's value lives in a [`Config`], by type.
pub(super) enum Slot<'cfg> {
    Text(&'cfg mut String),
    Int(&'cfg mut i64),
    Float(&'cfg mut f64),
    Bool(&'cfg mut bool),
    Size(&'cfg mut Size),
    Listen(&'cfg mut Listen),
    Origin(&'cfg mut Origin),
    Duration(&'cfg mut Option<SignedDuration>),
    Warmup(&'cfg mut Warmup),
    Cidrs(&'cfg mut Vec<Cidr>),
    Labels(&'cfg mut Vec<LabelRule>),
    Origins(&'cfg mut Vec<Origin>),
    Texts(&'cfg mut Vec<String>),
}

impl Slot<'_> {
    /// Whether the key is a list, which one environment variable gives as comma-separated items.
    pub(super) const fn is_list(&self) -> bool {
        match self {
            Self::Cidrs(_) | Self::Labels(_) | Self::Origins(_) | Self::Texts(_) => true,
            Self::Text(_)
            | Self::Int(_)
            | Self::Float(_)
            | Self::Bool(_)
            | Self::Size(_)
            | Self::Listen(_)
            | Self::Origin(_)
            | Self::Duration(_)
            | Self::Warmup(_) => false,
        }
    }
}

/// One key of the configuration and where it lives.
pub(super) struct Field {
    pub(super) key: &'static str,
    pub(super) slot: for<'cfg> fn(&'cfg mut Config) -> Slot<'cfg>,
}

impl Field {
    /// Whether the key is a list; see [`Slot::is_list`].
    pub(super) fn is_list(&self) -> bool {
        (self.slot)(&mut Config::default()).is_list()
    }

    /// Whether the key is `server.labels`, whose items are `{cidr, label}` entries.
    pub(super) fn is_labels(&self) -> bool {
        matches!((self.slot)(&mut Config::default()), Slot::Labels(_))
    }
}

macro_rules! field {
    ($key:literal, $slot:ident, $($path:ident).+) => {
        Field {
            key: $key,
            slot: |config| Slot::$slot(&mut config.$($path).+),
        }
    };
}

/// Every key of configuration.md section 2, sorted. The unknown-key rule, the comma rule of the
/// environment and the effective list all follow this table, so a key is added in one place;
/// the effective list keeps its order.
pub(super) const FIELDS: &[Field] = &[
    field!("compat.librespeed.enabled", Bool, compat.librespeed.enabled),
    field!(
        "compat.networkquality.enabled",
        Bool,
        compat.networkquality.enabled
    ),
    field!(
        "compat.networkquality.max_flows_per_client",
        Int,
        compat.networkquality.max_flows_per_client
    ),
    field!(
        "compat.networkquality.max_upload_bytes",
        Size,
        compat.networkquality.max_upload_bytes
    ),
    field!(
        "compat.openspeedtest.enabled",
        Bool,
        compat.openspeedtest.enabled
    ),
    field!("limits.max_download_bytes", Size, limits.max_download_bytes),
    field!(
        "limits.max_streams_per_client",
        Int,
        limits.max_streams_per_client
    ),
    field!("limits.max_upload_bytes", Size, limits.max_upload_bytes),
    field!(
        "limits.requests_per_minute",
        Int,
        limits.requests_per_minute
    ),
    field!("limits.tracked_clients", Int, limits.tracked_clients),
    field!("log.format", Text, log.format),
    field!("log.level", Text, log.level),
    field!("metrics.enabled", Bool, metrics.enabled),
    field!("metrics.path", Text, metrics.path),
    field!("server.base_path", Text, server.base_path),
    field!(
        "server.cors.allowed_origins",
        Origins,
        server.cors.allowed_origins
    ),
    field!("server.display_name", Text, server.display_name),
    field!("server.labels", Labels, server.labels),
    field!("server.listen", Listen, server.listen),
    field!("server.public_url", Origin, server.public_url),
    field!("server.trusted_proxies", Cidrs, server.trusted_proxies),
    field!("test_defaults.data_cap", Size, test_defaults.data_cap),
    field!(
        "test_defaults.download.max_duration",
        Duration,
        test_defaults.download.max_duration
    ),
    field!(
        "test_defaults.download.min_duration",
        Duration,
        test_defaults.download.min_duration
    ),
    field!(
        "test_defaults.overhead_compensation_percent",
        Float,
        test_defaults.overhead_compensation_percent
    ),
    field!("test_defaults.phases", Texts, test_defaults.phases),
    field!("test_defaults.ping_count", Int, test_defaults.ping_count),
    field!("test_defaults.preset", Text, test_defaults.preset),
    field!(
        "test_defaults.streams.fixed",
        Int,
        test_defaults.streams.fixed
    ),
    field!("test_defaults.streams.max", Int, test_defaults.streams.max),
    field!(
        "test_defaults.streams.mode",
        Text,
        test_defaults.streams.mode
    ),
    field!("test_defaults.units", Text, test_defaults.units),
    field!(
        "test_defaults.upload.max_duration",
        Duration,
        test_defaults.upload.max_duration
    ),
    field!(
        "test_defaults.upload.min_duration",
        Duration,
        test_defaults.upload.min_duration
    ),
    field!("test_defaults.warmup", Warmup, test_defaults.warmup),
];

/// The keys of a `server.labels` entry.
pub(super) const LABEL_KEYS: [&str; 2] = [LABEL_CIDR, LABEL_LABEL];
const LABEL_CIDR: &str = "cidr";
const LABEL_LABEL: &str = "label";

/// The field at `key`, if it is one.
pub(super) fn field(key: &str) -> Option<&'static Field> {
    FIELDS.iter().find(|field| field.key == key)
}

/// Whether `key` is a section: a proper prefix of some key.
pub(super) fn is_section(key: &str) -> bool {
    FIELDS.iter().any(|field| {
        field
            .key
            .strip_prefix(key)
            .is_some_and(|rest| rest.starts_with('.'))
    })
}

/// Decodes the raw tree into a configuration that starts from the defaults, with a problem for
/// each key that does not decode. A section given as something other than a mapping is one
/// problem at the section; a null was reported already and leaves the default.
pub(super) fn decode(raw: &Map) -> (Config, Vec<Problem>) {
    let mut config = Config::default();
    let mut problems = Vec::new();
    let mut failed_sections = BTreeSet::new();
    for field in FIELDS {
        let segments: Vec<&str> = field.key.split('.').collect();
        let Some((leaf, sections)) = segments.split_last() else {
            continue;
        };
        let mut map = Some(raw);
        for (depth, section) in sections.iter().enumerate() {
            let Some(node) = map.and_then(|level| level.get(*section)) else {
                map = None;
                break;
            };
            map = match &node.value {
                Raw::Map(nested) => Some(nested),
                Raw::Null => None,
                Raw::Bool(_)
                | Raw::Int(_)
                | Raw::Wide(_)
                | Raw::Float(_)
                | Raw::Text(_)
                | Raw::List(_) => {
                    let key = segments[..=depth].join(".");
                    if failed_sections.insert(key.clone()) {
                        problems.push(mismatch(key, node, "a map"));
                    }
                    None
                }
            };
            if map.is_none() {
                break;
            }
        }
        if let Some(node) = map.and_then(|level| level.get(*leaf))
            && !is_null(&node.value)
        {
            decode_into((field.slot)(&mut config), field.key, node, &mut problems);
        }
    }
    (config, problems)
}

fn problem(key: impl Into<String>, node: &Node, rule: impl Into<String>) -> Problem {
    Problem {
        key: key.into(),
        value: node.value.to_string(),
        rule: rule.into(),
        location: node.location,
    }
}

fn mismatch(key: impl Into<String>, node: &Node, expected: &str) -> Problem {
    problem(
        key,
        node,
        format!("expected {expected}, got {}", node.value.kind()),
    )
}

/// Decodes one key's value into its slot, or adds its problem and leaves the default.
fn decode_into(slot: Slot<'_>, key: &str, node: &Node, problems: &mut Vec<Problem>) {
    let value = &node.value;
    let mut report = |result: Result<(), String>| {
        if let Err(rule) = result {
            problems.push(problem(key, node, rule));
        }
    };
    match slot {
        Slot::Text(target) => report(text(value).map(|decoded| *target = decoded)),
        Slot::Int(target) => report(integer(value).map(|decoded| *target = decoded)),
        Slot::Float(target) => report(number(value).map(|decoded| *target = decoded)),
        Slot::Bool(target) => report(boolean(value).map(|decoded| *target = decoded)),
        Slot::Size(target) => report(size(value).map(|decoded| *target = decoded)),
        Slot::Listen(target) => report(textual(value, "Listen").map(|decoded| *target = decoded)),
        Slot::Origin(target) => report(textual(value, "Origin").map(|decoded| *target = decoded)),
        Slot::Duration(target) => report(optional_duration(value).map(|decoded| *target = decoded)),
        Slot::Warmup(target) => report(textual(value, "Warmup").map(|decoded| *target = decoded)),
        Slot::Cidrs(target) => {
            if let Some(items) = list(key, node, problems, cidr, PLACEHOLDER_CIDR) {
                *target = items;
            }
        }
        Slot::Origins(target) => {
            let origin = |item: &Raw| textual(item, "Origin");
            if let Some(items) = list(key, node, problems, origin, Origin::default()) {
                *target = items;
            }
        }
        Slot::Texts(target) => {
            if let Some(items) = list(key, node, problems, text, String::new()) {
                *target = items;
            }
        }
        Slot::Labels(target) => {
            if let Some(entries) = labels(key, node, problems) {
                *target = entries;
            }
        }
    }
}

/// Decodes a list element by element. A failed or null element leaves `placeholder` in its
/// place, as Go's decoder leaves a zero value, so the list keeps its length for the rules that
/// count it; a configuration with any problem is never served, so the placeholder never is.
fn list<T: Clone>(
    key: &str,
    node: &Node,
    problems: &mut Vec<Problem>,
    decode: impl Fn(&Raw) -> Result<T, String>,
    placeholder: T,
) -> Option<Vec<T>> {
    let Raw::List(items) = &node.value else {
        problems.push(mismatch(key, node, "a list"));
        return None;
    };
    let decoded = items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            if is_null(&item.value) {
                return placeholder.clone();
            }
            decode(&item.value).unwrap_or_else(|rule| {
                problems.push(problem(format!("{key}[{index}]"), item, rule));
                placeholder.clone()
            })
        })
        .collect();
    Some(decoded)
}

/// Decodes `server.labels`: each entry a `{cidr, label}` mapping. In the file an entry given as
/// text is refused; in the environment an item without `=` arrives as text and is refused the
/// same way, so it is a problem and never dropped.
fn labels(key: &str, node: &Node, problems: &mut Vec<Problem>) -> Option<Vec<LabelRule>> {
    let Raw::List(items) = &node.value else {
        problems.push(mismatch(key, node, "a list"));
        return None;
    };
    let mut entries = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let entry_key = format!("{key}[{index}]");
        let mut entry = LabelRule {
            cidr: None,
            label: String::new(),
        };
        match &item.value {
            Raw::Map(fields) => {
                if let Some(field) = fields
                    .get(LABEL_CIDR)
                    .filter(|field| !is_null(&field.value))
                {
                    match cidr(&field.value) {
                        Ok(decoded) => entry.cidr = Some(decoded),
                        Err(rule) => {
                            problems.push(problem(
                                format!("{entry_key}.{LABEL_CIDR}"),
                                field,
                                rule,
                            ));
                        }
                    }
                }
                if let Some(field) = fields
                    .get(LABEL_LABEL)
                    .filter(|field| !is_null(&field.value))
                {
                    match text(&field.value) {
                        Ok(decoded) => entry.label = decoded,
                        Err(rule) => {
                            problems.push(problem(
                                format!("{entry_key}.{LABEL_LABEL}"),
                                field,
                                rule,
                            ));
                        }
                    }
                }
            }
            Raw::Null => {}
            Raw::Text(entry_text) => problems.push(problem(
                entry_key,
                item,
                format!(
                    "must be a {{cidr, label}} entry; in the environment each item is \
                     cidr=label: {}",
                    quote(entry_text)
                ),
            )),
            Raw::Bool(_) | Raw::Int(_) | Raw::Wide(_) | Raw::Float(_) | Raw::List(_) => {
                problems.push(mismatch(entry_key, item, "a map"));
            }
        }
        entries.push(entry);
    }
    Some(entries)
}

const fn is_null(value: &Raw) -> bool {
    matches!(value, Raw::Null)
}

/// A NaN or an infinity is refused for every key, before its type is looked at.
fn finite(value: &Raw) -> Result<(), String> {
    match value {
        Raw::Float(number) if !number.is_finite() => Err(format!(
            "invalid number: {} is not a finite number",
            float(*number)
        )),
        Raw::Null
        | Raw::Bool(_)
        | Raw::Int(_)
        | Raw::Wide(_)
        | Raw::Float(_)
        | Raw::Text(_)
        | Raw::List(_)
        | Raw::Map(_) => Ok(()),
    }
}

fn expected(value: &Raw, kind: &str) -> String {
    format!("expected {kind}, got {}", value.kind())
}

fn text(value: &Raw) -> Result<String, String> {
    finite(value)?;
    match value {
        Raw::Text(text) => Ok(text.clone()),
        Raw::Null
        | Raw::Bool(_)
        | Raw::Int(_)
        | Raw::Wide(_)
        | Raw::Float(_)
        | Raw::List(_)
        | Raw::Map(_) => Err(expected(value, "text")),
    }
}

/// An integer: a whole number, or decimal text (as the environment gives every value).
fn integer(value: &Raw) -> Result<i64, String> {
    // 2^63, one past the largest integer.
    const LIMIT: f64 = 9_223_372_036_854_775_808.0;
    finite(value)?;
    match value {
        Raw::Int(number) => Ok(*number),
        Raw::Text(text) => text
            .parse()
            .map_err(|_| format!("invalid number: {}", quote(text))),
        Raw::Wide(number) => Err(format!("invalid number: {number} is too large")),
        Raw::Float(number) if number.fract() == 0.0 && number.abs() < LIMIT =>
        {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "checked above: whole and within the i64 range"
            )]
            Ok(*number as i64)
        }
        Raw::Float(number) => Err(format!(
            "invalid number: {} is not a whole number",
            float(*number)
        )),
        Raw::Null | Raw::Bool(_) | Raw::List(_) | Raw::Map(_) => Err(expected(value, "an integer")),
    }
}

/// A finite number, or decimal text.
fn number(value: &Raw) -> Result<f64, String> {
    finite(value)?;
    match value {
        Raw::Float(number) => Ok(*number),
        #[expect(
            clippy::cast_precision_loss,
            reason = "a YAML integer for a float key, converted as Go converts it"
        )]
        Raw::Int(number) => Ok(*number as f64),
        #[expect(
            clippy::cast_precision_loss,
            reason = "a YAML integer for a float key, converted as Go converts it"
        )]
        Raw::Wide(number) => Ok(*number as f64),
        Raw::Text(text) => text
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite())
            .ok_or_else(|| format!("invalid number: {}", quote(text))),
        Raw::Null | Raw::Bool(_) | Raw::List(_) | Raw::Map(_) => Err(expected(value, "a number")),
    }
}

/// A boolean, or exactly the text `true` or `false`: never `1`, `t`, `yes` or `TRUE`.
fn boolean(value: &Raw) -> Result<bool, String> {
    finite(value)?;
    match value {
        Raw::Bool(flag) => Ok(*flag),
        Raw::Text(text) if text == "true" => Ok(true),
        Raw::Text(text) if text == "false" => Ok(false),
        Raw::Text(text) => Err(format!(
            "invalid boolean: {} (want true or false)",
            quote(text)
        )),
        Raw::Null | Raw::Int(_) | Raw::Wide(_) | Raw::Float(_) | Raw::List(_) | Raw::Map(_) => {
            Err(expected(value, "true or false"))
        }
    }
}

/// A size: text in the size syntax, or a whole non-negative YAML number.
fn size(value: &Raw) -> Result<Size, String> {
    finite(value)?;
    match value {
        Raw::Text(text) => Size::from_str(text).map_err(|error| format!("decode Size: {error}")),
        Raw::Int(number) => u64::try_from(*number)
            .map(Size::new)
            .map_err(|_| ValueError::Size(format!("{number} is negative")).to_string()),
        Raw::Wide(number) => Err(format!("invalid number: {number} is too large")),
        Raw::Float(number) => Size::from_float(*number).map_err(|error| error.to_string()),
        Raw::Null | Raw::Bool(_) | Raw::List(_) | Raw::Map(_) => Err(expected(value, "a size")),
    }
}

/// A value with a text syntax of its own: text only, since decoding a mapping into it would
/// expose its fields as undocumented keys.
fn textual<T: FromStr<Err = ValueError>>(value: &Raw, type_name: &str) -> Result<T, String> {
    finite(value)?;
    match value {
        Raw::Text(text) => {
            T::from_str(text).map_err(|error| format!("decode {type_name}: {error}"))
        }
        Raw::Null
        | Raw::Bool(_)
        | Raw::Int(_)
        | Raw::Wide(_)
        | Raw::Float(_)
        | Raw::List(_)
        | Raw::Map(_) => Err(format!("expected text: {value}")),
    }
}

/// A CIDR: text only.
fn cidr(value: &Raw) -> Result<Cidr, String> {
    finite(value)?;
    match value {
        Raw::Text(text) => Cidr::from_str(text).map_err(|error| error.to_string()),
        Raw::Null
        | Raw::Bool(_)
        | Raw::Int(_)
        | Raw::Wide(_)
        | Raw::Float(_)
        | Raw::List(_)
        | Raw::Map(_) => Err(format!("expected text: {value}")),
    }
}

/// A duration bound: text only, empty for the preset's value.
fn optional_duration(value: &Raw) -> Result<Option<SignedDuration>, String> {
    finite(value)?;
    match value {
        Raw::Text(text) if text.is_empty() => Ok(None),
        Raw::Text(text) => parse_duration(text)
            .map(Some)
            .map_err(|error| format!("decode OptionalDuration: {error}")),
        Raw::Null
        | Raw::Bool(_)
        | Raw::Int(_)
        | Raw::Wide(_)
        | Raw::Float(_)
        | Raw::List(_)
        | Raw::Map(_) => Err(format!("expected text: {value}")),
    }
}
