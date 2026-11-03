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

//! `GET /api/v1/info` (wire-protocol.md section 5).

use http::{Request, Response, StatusCode};
use jiff::SignedDuration;
use serde::Serialize;

use super::envelope::{CODE_INTERNAL, error_response};
use super::epoch::{BUCKET_MS, Epoch};
use super::{Body, JSON_TYPE, UPLOAD_LIFETIME, set_type};
use crate::buildinfo::Build;
use crate::clientip::{self, Client, Labeler};
use crate::config::{Config, DurationRange, Limits, TestDefaults, Warmup, preset};

/// The info value of an automatic warm-up.
const WARMUP_AUTO: &str = "auto";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfoServer {
    name: String,
    version: &'static str,
    commit: &'static str,
    build_date: &'static str,
    epoch: String,
    base_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfoClient<'label> {
    ip: String,
    ip_version: u8,
    address_class: &'static str,
    suggested_label: Option<&'label str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfoLimits {
    max_download_bytes: u64,
    max_upload_bytes: u64,
    max_streams_per_client: i64,
    upload_lifetime_ms: i64,
    bucket_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfoDefaults {
    preset: String,
    phases: Vec<String>,
    streams: InfoStreams,
    download: InfoDurations,
    upload: InfoDurations,
    /// Null without a cap.
    data_cap_bytes: Option<u64>,
    units: String,
    warmup: InfoWarmup,
    ping_count: i64,
    overhead_compensation_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
struct InfoStreams {
    mode: String,
    fixed: i64,
    max: i64,
}

/// A resolved duration range; a bound is null only when neither the configuration nor the
/// preset has one.
#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfoDurations {
    min_ms: Option<i64>,
    max_ms: Option<i64>,
}

/// `"auto"`, or the fixed warm-up in whole milliseconds.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(untagged)]
enum InfoWarmup {
    Auto(&'static str),
    Millis(i64),
}

#[derive(Debug, Clone, Copy, Serialize)]
struct InfoCompat {
    openspeedtest: bool,
    librespeed: bool,
    networkquality: bool,
}

#[derive(Serialize)]
struct InfoBody<'info> {
    server: &'info InfoServer,
    client: InfoClient<'info>,
    limits: &'info InfoLimits,
    defaults: &'info InfoDefaults,
    compat: InfoCompat,
}

/// The info response's parts that the configuration, the build and the epoch decide, resolved
/// once at startup, and the labeler for the per-request client part. Nothing is cached per
/// client.
#[derive(Debug, Clone)]
pub struct Info {
    server: InfoServer,
    limits: InfoLimits,
    defaults: InfoDefaults,
    compat: InfoCompat,
    labeler: Labeler,
}

impl Info {
    /// The response for `config`, `build` and `epoch`, suggesting client labels with `labeler`.
    #[must_use]
    pub fn new(config: &Config, build: Build, epoch: &Epoch, labeler: Labeler) -> Self {
        Self {
            server: InfoServer {
                name: config.server.display_name.clone(),
                version: build.version,
                commit: build.commit,
                build_date: build.date,
                epoch: epoch.id.clone(),
                base_path: config.server.base_path.clone(),
            },
            limits: info_limits(&config.limits),
            defaults: info_defaults(&config.test_defaults),
            compat: InfoCompat {
                openspeedtest: config.compat.openspeedtest.enabled,
                librespeed: config.compat.librespeed.enabled,
                networkquality: config.compat.networkquality.enabled,
            },
            labeler,
        }
    }

    /// The response for the request's client, the [`Client`] the client IP middleware stored.
    #[must_use]
    pub fn respond<B>(&self, request: &Request<B>) -> Response<Body> {
        let Some(client) = request.extensions().get::<Client>() else {
            // The router always runs the client IP middleware first; this is a wiring bug.
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                CODE_INTERNAL,
                "client address unavailable",
                None,
            );
        };
        let address = client.address;
        let body = super::json::to_vec(&InfoBody {
            server: &self.server,
            client: InfoClient {
                ip: address.to_string(),
                ip_version: clientip::version(address),
                address_class: clientip::address_class(address).as_str(),
                suggested_label: self.labeler.suggest(address),
            },
            limits: &self.limits,
            defaults: &self.defaults,
            compat: self.compat,
        });
        let Ok(body) = body else {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                CODE_INTERNAL,
                "encode info",
                None,
            );
        };
        let mut response = Response::new(Body::from(body));
        set_type(response.headers_mut(), JSON_TYPE);
        response
    }
}

fn whole_millis(duration: SignedDuration) -> i64 {
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

fn info_limits(limits: &Limits) -> InfoLimits {
    InfoLimits {
        max_download_bytes: limits.max_download_bytes.bytes(),
        max_upload_bytes: limits.max_upload_bytes.bytes(),
        max_streams_per_client: limits.max_streams_per_client,
        upload_lifetime_ms: i64::try_from(UPLOAD_LIFETIME.as_millis()).unwrap_or(i64::MAX),
        bucket_ms: BUCKET_MS,
    }
}

/// The test defaults, resolved: an empty duration bound becomes the preset's value, an empty
/// stream mode the preset's, and `ping_count` 0 the preset's idle ping count. Continuous has no
/// minimum or maximum, so its bounds are null whatever the duration keys say.
fn info_defaults(defaults: &TestDefaults) -> InfoDefaults {
    let preset = preset(&defaults.preset);
    let bounds = |range: &DurationRange, preset_bounds: Option<[SignedDuration; 2]>| {
        if preset.is_some_and(|preset| !preset.bounded) {
            return InfoDurations::default();
        }
        InfoDurations {
            min_ms: range
                .min_duration
                .or(preset_bounds.map(|bounds| bounds[0]))
                .map(whole_millis),
            max_ms: range
                .max_duration
                .or(preset_bounds.map(|bounds| bounds[1]))
                .map(whole_millis),
        }
    };
    let mode = match (defaults.streams.mode.as_str(), preset) {
        ("", Some(preset)) => preset.streams_mode.to_owned(),
        (mode, _) => mode.to_owned(),
    };
    let ping_count = match (defaults.ping_count, preset) {
        (0, Some(preset)) => preset.ping_count,
        (count, _) => count,
    };
    InfoDefaults {
        preset: defaults.preset.clone(),
        phases: defaults.phases.clone(),
        streams: InfoStreams {
            mode,
            fixed: defaults.streams.fixed,
            max: defaults.streams.max,
        },
        download: bounds(&defaults.download, preset.map(|preset| preset.download)),
        upload: bounds(&defaults.upload, preset.map(|preset| preset.upload)),
        data_cap_bytes: Some(defaults.data_cap.bytes()).filter(|&bytes| bytes != 0),
        units: defaults.units.clone(),
        warmup: match defaults.warmup {
            Warmup::Auto => InfoWarmup::Auto(WARMUP_AUTO),
            Warmup::Fixed(duration) => InfoWarmup::Millis(whole_millis(duration)),
        },
        ping_count,
        overhead_compensation_percent: defaults.overhead_compensation_percent,
    }
}
