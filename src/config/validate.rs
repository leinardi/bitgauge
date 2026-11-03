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

//! The validation rules of configuration.md sections 2 and 4.

use std::collections::HashMap;
use std::fmt::Display;

use jiff::SignedDuration;

use super::gofmt::{duration, float};
use super::printable::is_print;
use super::url::{self, Url};
use super::{
    Cidr, Compat, Config, DurationRange, LabelRule, Limits, Loaded, Log, Metrics, Origin,
    PHASE_DOWNLOAD, PHASE_IDLE, PHASE_UPLOAD, Problem, STREAMS_MODE_AUTO, STREAMS_MODE_FIXED,
    STREAMS_MODE_SINGLE, Server, Size, Streams, TestDefaults, Warmup, preset,
};
use crate::logger;

const MIN_PORT: u64 = 1;
const MAX_PORT: u64 = 65_535;
const MIN_DISPLAY_NAME_CHARS: usize = 1;
const MAX_DISPLAY_NAME_CHARS: usize = 64;
const MIN_TRANSFER_CAP: Size = Size::KIB.times(64);
const MAX_TRANSFER_CAP: Size = Size::GIB.times(4);
const STREAMS_PER_CLIENT: (i64, i64) = (1, 64);
const REQUESTS_PER_MINUTE: (i64, i64) = (60, 100_000);
const TRACKED_CLIENTS: (i64, i64) = (16, 1_000_000);
const MIN_NQ_UPLOAD_BYTES: Size = Size::MIB;
const MAX_NQ_UPLOAD_BYTES: Size = Size::GIB.times(64);
const NQ_FLOWS_PER_CLIENT: (i64, i64) = (1, 256);
const MIN_STREAMS: i64 = 1;
const MAX_STREAMS: i64 = 6;
const MIN_PHASE_DURATION: SignedDuration = SignedDuration::from_secs(5);
const MAX_PHASE_DURATION: SignedDuration = SignedDuration::from_secs(600);
const MIN_DATA_CAP: Size = Size::MIB;
const MIN_FIXED_WARMUP: SignedDuration = SignedDuration::from_secs(1);
const MAX_FIXED_WARMUP: SignedDuration = SignedDuration::from_secs(60);
const PING_COUNT: (i64, i64) = (6, 200);
const MAX_OVERHEAD_PERCENT: f64 = 20.0;
const PRESETS: [&str; 4] = ["quick", "standard", "extended", "continuous"];
const UNITS: [&str; 2] = ["bits", "bytes"];

/// The sizes a compatibility layer needs the limits to allow while it is enabled: the
/// OpenSpeedTest layer's fixed download size and upload cap (compatibility.md section 1.1), and
/// one LibreSpeed ckSize chunk (section 2.1).
const MIN_OPENSPEEDTEST_DOWNLOAD: Size = Size::MIB.times(30);
const MIN_OPENSPEEDTEST_UPLOAD: Size = Size::MIB.times(35);
const MIN_LIBRESPEED_DOWNLOAD: Size = Size::MIB;

/// The rule an IPv4-mapped IPv6 prefix breaks in `server.trusted_proxies` and `server.labels`:
/// an IPv4 client is matched as IPv4, so such a prefix would never match.
const RULE_IPV4_MAPPED: &str = "is an IPv4-mapped IPv6 prefix; write it as IPv4";

/// Checks a decoded configuration against every rule of configuration.md section 4 that this
/// release can decide, and returns every problem, not only the first. The one rule it leaves out
/// is the `metrics.path` route collision, which needs the router's own route list
/// (configuration-security.md section 2) and is checked where the router is built; here
/// `metrics.path` is checked for its shape only.
#[must_use]
pub fn validate(config: &Config) -> Vec<Problem> {
    let mut check = Checker::default();
    check.server(&config.server);
    check.limits(&config.limits);
    check.test_defaults(&config.test_defaults, &config.limits);
    check.compat(&config.compat, &config.limits, &config.server);
    check.log(&config.log);
    check.metrics(&config.metrics);
    check.problems
}

/// Every problem of a load: the keys that did not decode, then the validation problems of the
/// rest. A key that did not decode kept its default, so validation does not report it again.
#[must_use]
pub fn check(loaded: &Loaded) -> Vec<Problem> {
    let mut problems = loaded.problems.clone();
    problems.extend(
        validate(&loaded.config)
            .into_iter()
            .filter(|problem| !covered_by(&problem.key, &loaded.problems)),
    );
    problems
}

/// Whether `key` already has a decode problem: the same key, a parent of it, or, for a list
/// element that failed, the list itself, since the element left a placeholder behind.
fn covered_by(key: &str, decode_problems: &[Problem]) -> bool {
    decode_problems.iter().any(|problem| {
        let failed = problem.key.as_str();
        key == failed
            || key
                .strip_prefix(failed)
                .is_some_and(|rest| rest.starts_with(['.', '[']))
            || failed.split_once('[').is_some_and(|(list, _)| key == list)
    })
}

#[derive(Default)]
struct Checker {
    problems: Vec<Problem>,
}

impl Checker {
    fn add(&mut self, key: impl Into<String>, value: impl Display, rule: impl Into<String>) {
        self.problems.push(Problem {
            key: key.into(),
            value: value.to_string(),
            rule: rule.into(),
            location: None,
        });
    }

    fn int_range(&mut self, key: &str, value: i64, (low, high): (i64, i64)) {
        if !(low..=high).contains(&value) {
            self.add(key, value, format!("must be between {low} and {high}"));
        }
    }

    fn size_range(&mut self, key: &str, value: Size, low: Size, high: Size) {
        if !(low..=high).contains(&value) {
            self.add(
                key,
                value,
                format!(
                    "must be between {low} and {high} ({} to {} bytes)",
                    low.bytes(),
                    high.bytes()
                ),
            );
        }
    }

    fn one_of(&mut self, key: &str, value: &str, allowed: &[&str]) {
        if !allowed.contains(&value) {
            self.add(key, value, format!("must be one of {}", allowed.join(", ")));
        }
    }

    fn server(&mut self, server: &Server) {
        if !(MIN_PORT..=MAX_PORT).contains(&server.listen.port) {
            self.add(
                "server.listen",
                &server.listen,
                format!("must be host:port with a port from {MIN_PORT} to {MAX_PORT}"),
            );
        }
        self.path_shape("server.base_path", &server.base_path);
        self.printable("server.display_name", &server.display_name);
        self.trusted_proxies(&server.trusted_proxies);
        self.labels(&server.labels);
        if !server.public_url.is_empty() {
            self.origin("server.public_url", &server.public_url);
        }
        for (index, origin) in server.cors.allowed_origins.iter().enumerate() {
            self.origin(&format!("server.cors.allowed_origins[{index}]"), origin);
        }
    }

    /// The `display_name` rule, which a `server.labels` label shares: 1 to 64 printable
    /// characters.
    fn printable(&mut self, key: &str, text: &str) {
        let length = text.chars().count();
        if !(MIN_DISPLAY_NAME_CHARS..=MAX_DISPLAY_NAME_CHARS).contains(&length)
            || !text.chars().all(is_print)
        {
            self.add(
                key,
                text,
                format!(
                    "must be {MIN_DISPLAY_NAME_CHARS} to {MAX_DISPLAY_NAME_CHARS} printable \
                     characters"
                ),
            );
        }
    }

    /// Each `server.trusted_proxies` entry is written as IPv4 when it is IPv4.
    fn trusted_proxies(&mut self, prefixes: &[Cidr]) {
        for (index, prefix) in prefixes.iter().enumerate() {
            if prefix.is_ipv4_mapped() {
                self.add(
                    format!("server.trusted_proxies[{index}]"),
                    prefix,
                    RULE_IPV4_MAPPED,
                );
            }
        }
    }

    /// Each `server.labels` entry: a CIDR with no host bits set, written as IPv4 when it is
    /// IPv4, unique in the list, and a label under the `display_name` rule.
    fn labels(&mut self, rules: &[LabelRule]) {
        let mut first: HashMap<Cidr, usize> = HashMap::with_capacity(rules.len());
        for (index, rule) in rules.iter().enumerate() {
            let key = format!("server.labels[{index}]");
            let cidr_key = format!("{key}.cidr");
            match rule.cidr {
                None => self.add(cidr_key, "", "is required: a CIDR such as 10.8.0.0/24"),
                Some(cidr) if cidr.is_ipv4_mapped() => self.add(cidr_key, cidr, RULE_IPV4_MAPPED),
                Some(cidr) if cidr != cidr.masked() => {
                    self.add(
                        cidr_key,
                        cidr,
                        format!("has host bits set; write {}", cidr.masked()),
                    );
                }
                Some(cidr) => {
                    if let Some(earlier) = first.get(&cidr) {
                        self.add(
                            cidr_key,
                            cidr,
                            format!(
                                "repeats server.labels[{earlier}].cidr; each CIDR appears once"
                            ),
                        );
                    } else {
                        first.insert(cidr, index);
                    }
                }
            }
            self.printable(&format!("{key}.label"), &rule.label);
        }
    }

    /// The base path shape rule; `metrics.path` shares it.
    fn path_shape(&mut self, key: &str, path: &str) {
        const RULE: &str = "must start with /, have no trailing / (except / itself), no empty \
                            segment (//), no . or .. segment, no query or fragment, and only \
                            A-Z a-z 0-9 - . _ ~ /";
        let shape = path.starts_with('/')
            && (path == "/" || !path.ends_with('/'))
            && !path.contains("//")
            && path
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "-._~/".contains(character))
            && !path
                .split('/')
                .any(|segment| segment == "." || segment == "..");
        if !shape {
            self.add(key, path, RULE);
        }
    }

    /// An absolute http or https origin: scheme, host and optional port, nothing else. `*` is
    /// not an origin and is refused like any other non-origin.
    fn origin(&mut self, key: &str, origin: &Origin) {
        const RULE: &str = "must be an http or https origin (scheme, host and optional port \
                            1-65535) with no path, query, fragment or user information; the host \
                            is an IP literal or a name of letters, digits, - and . only, so * is \
                            not allowed";
        let valid = url::parse(origin.as_str())
            .is_ok_and(|parsed| origin_shape(origin.as_str(), &parsed) && origin_host(&parsed));
        if !valid {
            self.add(key, origin, RULE);
        }
    }

    fn limits(&mut self, limits: &Limits) {
        self.size_range(
            "limits.max_download_bytes",
            limits.max_download_bytes,
            MIN_TRANSFER_CAP,
            MAX_TRANSFER_CAP,
        );
        self.size_range(
            "limits.max_upload_bytes",
            limits.max_upload_bytes,
            MIN_TRANSFER_CAP,
            MAX_TRANSFER_CAP,
        );
        self.int_range(
            "limits.max_streams_per_client",
            limits.max_streams_per_client,
            STREAMS_PER_CLIENT,
        );
        self.int_range(
            "limits.requests_per_minute",
            limits.requests_per_minute,
            REQUESTS_PER_MINUTE,
        );
        self.int_range(
            "limits.tracked_clients",
            limits.tracked_clients,
            TRACKED_CLIENTS,
        );
    }

    fn test_defaults(&mut self, defaults: &TestDefaults, limits: &Limits) {
        self.one_of("test_defaults.preset", &defaults.preset, &PRESETS);
        self.phases(&defaults.phases);
        self.streams(&defaults.streams, limits);

        // The ranges hold whatever the preset. An unknown preset leaves an empty bound without
        // a value to compare against, and so does Continuous, which has none: an empty bound is
        // then no bound, and only a pair with both bounds set is compared (configuration.md
        // section 2.3).
        let values = preset(&defaults.preset);
        let bounded = values.is_some_and(|values| values.bounded);
        let zero = [SignedDuration::ZERO; 2];
        self.durations(
            "test_defaults.download",
            defaults.download,
            values.map_or(zero, |values| values.download),
            bounded,
        );
        self.durations(
            "test_defaults.upload",
            defaults.upload,
            values.map_or(zero, |values| values.upload),
            bounded,
        );

        if defaults.data_cap != Size::new(0) && defaults.data_cap < MIN_DATA_CAP {
            self.add(
                "test_defaults.data_cap",
                defaults.data_cap,
                format!("must be 0 (no cap) or at least {MIN_DATA_CAP}"),
            );
        }
        self.one_of("test_defaults.units", &defaults.units, &UNITS);
        if let Warmup::Fixed(fixed) = defaults.warmup
            && !(MIN_FIXED_WARMUP..=MAX_FIXED_WARMUP).contains(&fixed)
        {
            self.add(
                "test_defaults.warmup",
                duration(fixed),
                format!(
                    "must be auto or a duration from {} to {}",
                    duration(MIN_FIXED_WARMUP),
                    duration(MAX_FIXED_WARMUP)
                ),
            );
        }
        let (low, high) = PING_COUNT;
        if defaults.ping_count != 0 && !(low..=high).contains(&defaults.ping_count) {
            self.add(
                "test_defaults.ping_count",
                defaults.ping_count,
                format!("must be 0 (the preset's value) or {low} to {high}"),
            );
        }
        let percent = defaults.overhead_compensation_percent;
        if !(0.0..=MAX_OVERHEAD_PERCENT).contains(&percent) {
            self.add(
                "test_defaults.overhead_compensation_percent",
                float(percent),
                format!("must be between 0 and {}", float(MAX_OVERHEAD_PERCENT)),
            );
        }
    }

    /// Non-empty, known names, no duplicates, idle first when present.
    fn phases(&mut self, phases: &[String]) {
        const KEY: &str = "test_defaults.phases";
        let value = format!("[{}]", phases.join(", "));
        let mut sorted: Vec<&String> = phases.iter().collect();
        sorted.sort();
        sorted.dedup();
        if phases.is_empty() {
            self.add(
                KEY,
                value,
                "must list at least one of idle, download, upload",
            );
        } else if phases
            .iter()
            .any(|phase| ![PHASE_IDLE, PHASE_DOWNLOAD, PHASE_UPLOAD].contains(&phase.as_str()))
        {
            self.add(KEY, value, "may only list idle, download and upload");
        } else if sorted.len() != phases.len() {
            self.add(KEY, value, "must not list a phase twice");
        } else if phases.iter().any(|phase| phase == PHASE_IDLE) && phases[0] != PHASE_IDLE {
            self.add(KEY, value, "must list idle first when it is present");
        }
    }

    fn streams(&mut self, streams: &Streams, limits: &Limits) {
        // Empty is unset: GET /api/v1/info sends the preset's mode in its place.
        if !streams.mode.is_empty() {
            self.one_of(
                "test_defaults.streams.mode",
                &streams.mode,
                &[STREAMS_MODE_AUTO, STREAMS_MODE_FIXED, STREAMS_MODE_SINGLE],
            );
        }
        self.int_range(
            "test_defaults.streams.max",
            streams.max,
            (MIN_STREAMS, MAX_STREAMS),
        );
        if streams.max > limits.max_streams_per_client {
            self.add(
                "test_defaults.streams.max",
                streams.max,
                format!(
                    "must not exceed limits.max_streams_per_client ({})",
                    limits.max_streams_per_client
                ),
            );
        }
        if streams.fixed < MIN_STREAMS || streams.fixed > streams.max {
            self.add(
                "test_defaults.streams.fixed",
                streams.fixed,
                format!(
                    "must be between {MIN_STREAMS} and test_defaults.streams.max ({})",
                    streams.max
                ),
            );
        }
    }

    /// One direction's bounds, an unset bound standing for the preset's value when the preset
    /// is bounded. A pair violation is reported on the bound the operator wrote: the maximum
    /// when it is set, the minimum otherwise.
    fn durations(
        &mut self,
        key: &str,
        bounds: DurationRange,
        [preset_min, preset_max]: [SignedDuration; 2],
        bounded: bool,
    ) {
        let min_key = format!("{key}.min_duration");
        let max_key = format!("{key}.max_duration");
        let minimum = bounds.min_duration.unwrap_or(preset_min);
        let maximum = bounds.max_duration.unwrap_or(preset_max);
        if bounds.min_duration.is_some()
            && !(MIN_PHASE_DURATION..=MAX_PHASE_DURATION).contains(&minimum)
        {
            self.add(
                &min_key,
                duration(minimum),
                format!(
                    "must be from {} to {}",
                    duration(MIN_PHASE_DURATION),
                    duration(MAX_PHASE_DURATION)
                ),
            );
        }
        if bounds.max_duration.is_some() && maximum > MAX_PHASE_DURATION {
            self.add(
                &max_key,
                duration(maximum),
                format!("must be at most {}", duration(MAX_PHASE_DURATION)),
            );
        }
        let both_set = bounds.min_duration.is_some() && bounds.max_duration.is_some();
        let one_set_with_preset =
            (bounds.min_duration.is_some() || bounds.max_duration.is_some()) && bounded;
        if (!both_set && !one_set_with_preset) || minimum <= maximum {
            return;
        }
        if bounds.max_duration.is_some() {
            self.add(
                max_key,
                duration(maximum),
                format!(
                    "must not be below min_duration ({}; an empty bound is the preset's value)",
                    duration(minimum)
                ),
            );
        } else {
            self.add(
                min_key,
                duration(minimum),
                format!(
                    "must not exceed max_duration ({}, the preset's value since it is empty)",
                    duration(maximum)
                ),
            );
        }
    }

    fn compat(&mut self, compat: &Compat, limits: &Limits, server: &Server) {
        if compat.networkquality.enabled && !https_origin_known(server) {
            self.add(
                "compat.networkquality.enabled",
                true,
                "needs an https server.public_url or, with server.public_url empty, at least one \
                 server.trusted_proxies entry, since the layer cannot build its https URLs \
                 otherwise",
            );
        }
        if compat.openspeedtest.enabled {
            self.layer_needs(
                "limits.max_download_bytes",
                limits.max_download_bytes,
                MIN_OPENSPEEDTEST_DOWNLOAD,
                "compat.openspeedtest.enabled",
                "its fixed 30 MiB download",
            );
            self.layer_needs(
                "limits.max_upload_bytes",
                limits.max_upload_bytes,
                MIN_OPENSPEEDTEST_UPLOAD,
                "compat.openspeedtest.enabled",
                "its fixed 35 MiB upload cap",
            );
        }
        if compat.librespeed.enabled {
            self.layer_needs(
                "limits.max_download_bytes",
                limits.max_download_bytes,
                MIN_LIBRESPEED_DOWNLOAD,
                "compat.librespeed.enabled",
                "one 1 MiB ckSize chunk",
            );
        }
        self.size_range(
            "compat.networkquality.max_upload_bytes",
            compat.networkquality.max_upload_bytes,
            MIN_NQ_UPLOAD_BYTES,
            MAX_NQ_UPLOAD_BYTES,
        );
        self.int_range(
            "compat.networkquality.max_flows_per_client",
            compat.networkquality.max_flows_per_client,
            NQ_FLOWS_PER_CLIENT,
        );
    }

    /// A conflicting-toggles rule of configuration.md section 4: with `toggle` on, the limit
    /// under `key` must be at least `minimum`, for `reason`.
    fn layer_needs(&mut self, key: &str, value: Size, minimum: Size, toggle: &str, reason: &str) {
        if value < minimum {
            self.add(
                key,
                value,
                format!(
                    "must be at least {minimum} ({} bytes) while {toggle} is true, for {reason}",
                    minimum.bytes()
                ),
            );
        }
    }

    fn log(&mut self, log: &Log) {
        self.one_of("log.format", &log.format, &logger::FORMATS);
        self.one_of("log.level", &log.level, &logger::LEVELS);
    }

    fn metrics(&mut self, metrics: &Metrics) {
        self.path_shape("metrics.path", &metrics.path);
    }
}

/// Whether a parsed URL is a scheme and a host with nothing after them.
fn origin_shape(origin: &str, parsed: &Url) -> bool {
    (parsed.scheme == "http" || parsed.scheme == "https")
        && !parsed.host.is_empty()
        && parsed.opaque.is_empty()
        && !parsed.has_user
        && parsed.path.is_empty()
        && parsed.raw_query.is_empty()
        && !parsed.force_query
        && parsed.fragment.is_empty()
        && !origin.ends_with('#')
}

/// Whether an origin's host is an IP literal or a plain name, and its port, when present, is 1
/// to 65535. A host ending in `:` has an empty port and is refused.
fn origin_host(parsed: &Url) -> bool {
    if parsed.host.ends_with(':') {
        return false;
    }
    let port = parsed.port();
    if !port.is_empty()
        && !port
            .parse::<u64>()
            .is_ok_and(|number| (MIN_PORT..=MAX_PORT).contains(&number))
    {
        return false;
    }
    let hostname = parsed.hostname();
    if hostname.is_empty() {
        return false;
    }
    super::types::parse_addr(hostname).is_some()
        || hostname.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '.'
        })
}

/// Whether the networkQuality layer can have an https origin: an https `server.public_url`, or,
/// with `public_url` empty, a trusted proxy that may forward `X-Forwarded-Proto: https`
/// (compatibility.md section 3.3).
fn https_origin_known(server: &Server) -> bool {
    if server.public_url.is_empty() {
        return !server.trusted_proxies.is_empty();
    }
    url::parse(server.public_url.as_str()).is_ok_and(|parsed| parsed.scheme == "https")
}
