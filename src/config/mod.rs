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

//! BitGauge's configuration (configuration.md): the defaults, then the optional YAML file, then
//! the `BITGAUGE_` environment variables, each overriding only the keys it sets
//! (configuration-security.md section 1). It only reads: nothing here writes a file, and the
//! configuration is loaded once at startup.
//!
//! [`load`] reads the file and the environment into a raw tree and walks it into a [`Config`],
//! collecting one [`Problem`] per key that does not decode; [`check`] adds the validation rules
//! of configuration.md section 4. Any problem is fatal: the process reports every one and exits
//! with [`EXIT_INVALID_CONFIG`] before it opens the listener. [`warnings`] lists the valid but
//! probably unintended settings, and [`effective`] the configuration for the startup line.

use jiff::SignedDuration;

mod decode;
mod effective;
mod gofmt;
mod load;
mod preset;
mod printable;
mod raw;
mod report;
mod types;
pub(crate) mod url;
mod validate;
mod warn;

#[cfg(test)]
mod tests;

pub use effective::{EffectiveValue, effective};
pub use load::{DEFAULT_PATH, ENV_PREFIX, FileError, LoadError, Loaded, load, load_from};
pub use preset::{PresetValues, preset};
pub use report::{log_effective, report_problems, report_warnings};
pub(crate) use types::parse_addr;
pub use types::{Cidr, Listen, Origin, Size, ValueError, Warmup};
pub use validate::{check, validate};
pub use warn::warnings;

/// The exit status of a process whose configuration has a problem: it stops before opening the
/// listener (configuration.md section 4).
pub const EXIT_INVALID_CONFIG: u8 = 2;

/// One key that broke one rule. A configuration problem is logged as one line with these three
/// attributes (configuration-security.md section 2); a warning has the same shape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    /// The key path, such as `server.listen` or `server.labels[1].cidr`.
    pub key: String,
    /// The value as given. Configuration holds no secret (configuration.md section 4), so it is
    /// shown as it is.
    pub value: String,
    /// The rule the value broke.
    pub rule: String,
    /// Where the file wrote the value, for a problem found while loading a value from the file;
    /// `None` for the environment and for validation. The problem line keeps the three
    /// attributes above (configuration-security.md section 2) and does not print it.
    pub location: Option<Location>,
}

/// A position in the configuration file, as serde-saphyr reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Location {
    /// The line, from 1.
    pub line: u64,
    /// The column, from 1.
    pub column: u64,
}

impl Problem {
    /// Whether the problem is on a `log` key. The log settings themselves are then in doubt, so
    /// the problems are reported as text on stderr (configuration-security.md section 2).
    #[must_use]
    pub fn is_log_problem(&self) -> bool {
        self.key == "log" || self.key.starts_with("log.")
    }
}

/// The stream mode an empty `test_defaults.streams.mode` and a preset can name.
pub(crate) const STREAMS_MODE_AUTO: &str = "auto";
pub(crate) const STREAMS_MODE_FIXED: &str = "fixed";
pub(crate) const STREAMS_MODE_SINGLE: &str = "single";

/// The phases of `test_defaults.phases`.
const PHASE_IDLE: &str = "idle";
const PHASE_DOWNLOAD: &str = "download";
const PHASE_UPLOAD: &str = "upload";

/// The default port of `server.listen`.
const DEFAULT_PORT: u64 = 8080;

/// The whole configuration. Its field paths are the key paths of configuration.md section 2; a
/// key in the file or the environment that matches no field is a problem.
#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    /// The `server.*` keys (section 2.1).
    pub server: Server,
    /// The `limits.*` keys (section 2.2).
    pub limits: Limits,
    /// The `test_defaults.*` keys (section 2.3), exposed to the browser through
    /// `GET /api/v1/info`.
    pub test_defaults: TestDefaults,
    /// The `compat.*` keys (section 2.4).
    pub compat: Compat,
    /// The `log.*` keys (section 2.5).
    pub log: Log,
    /// The `metrics.*` keys (section 2.6).
    pub metrics: Metrics,
}

/// The `server.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Server {
    /// `server.listen`.
    pub listen: Listen,
    /// `server.base_path`.
    pub base_path: String,
    /// `server.display_name`.
    pub display_name: String,
    /// `server.public_url`; empty when unset.
    pub public_url: Origin,
    /// `server.trusted_proxies`.
    pub trusted_proxies: Vec<Cidr>,
    /// `server.labels`.
    pub labels: Vec<LabelRule>,
    /// `server.cors.*`.
    pub cors: Cors,
}

/// One `server.labels` entry: client addresses in `cidr` get `label` as their suggested context
/// label (wire-protocol.md section 5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LabelRule {
    /// The client range; validation requires it, so it is `None` only in an entry that lacks it.
    pub cidr: Option<Cidr>,
    /// The label.
    pub label: String,
}

/// The `server.cors.*` keys.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Cors {
    /// `server.cors.allowed_origins`.
    pub allowed_origins: Vec<Origin>,
}

/// The `limits.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Limits {
    /// `limits.max_download_bytes`.
    pub max_download_bytes: Size,
    /// `limits.max_upload_bytes`.
    pub max_upload_bytes: Size,
    /// `limits.max_streams_per_client`.
    pub max_streams_per_client: i64,
    /// `limits.requests_per_minute`.
    pub requests_per_minute: i64,
    /// `limits.tracked_clients`.
    pub tracked_clients: i64,
}

/// The `test_defaults.*` keys.
#[derive(Debug, Clone, PartialEq)]
pub struct TestDefaults {
    /// `test_defaults.preset`.
    pub preset: String,
    /// `test_defaults.phases`.
    pub phases: Vec<String>,
    /// `test_defaults.streams.*`.
    pub streams: Streams,
    /// `test_defaults.download.*`.
    pub download: DurationRange,
    /// `test_defaults.upload.*`.
    pub upload: DurationRange,
    /// `test_defaults.data_cap`; zero is no cap.
    pub data_cap: Size,
    /// `test_defaults.units`.
    pub units: String,
    /// `test_defaults.warmup`.
    pub warmup: Warmup,
    /// `test_defaults.ping_count`; zero is the preset's count.
    pub ping_count: i64,
    /// `test_defaults.overhead_compensation_percent`.
    pub overhead_compensation_percent: f64,
}

/// The `test_defaults.streams.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Streams {
    /// `auto`, `fixed` or `single`; empty means the preset's mode ([`PresetValues`]).
    pub mode: String,
    /// `test_defaults.streams.fixed`.
    pub fixed: i64,
    /// `test_defaults.streams.max`.
    pub max: i64,
}

/// A direction's `min_duration` and `max_duration`; an unset bound means the preset's value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DurationRange {
    /// `min_duration`.
    pub min_duration: Option<SignedDuration>,
    /// `max_duration`.
    pub max_duration: Option<SignedDuration>,
}

/// The `compat.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Compat {
    /// `compat.openspeedtest.*`.
    pub openspeedtest: Toggle,
    /// `compat.librespeed.*`.
    pub librespeed: Toggle,
    /// `compat.networkquality.*`.
    pub networkquality: NetworkQuality,
}

/// A compatibility layer with no setting beyond its switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Toggle {
    /// `enabled`.
    pub enabled: bool,
}

/// The `compat.networkquality.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkQuality {
    /// `compat.networkquality.enabled`.
    pub enabled: bool,
    /// `compat.networkquality.max_upload_bytes`.
    pub max_upload_bytes: Size,
    /// `compat.networkquality.max_flows_per_client`.
    pub max_flows_per_client: i64,
}

/// The `log.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Log {
    /// `log.format`: `text` or `json`.
    pub format: String,
    /// `log.level`: `debug`, `info`, `warn` or `error`.
    pub level: String,
}

/// The `metrics.*` keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Metrics {
    /// `metrics.enabled`.
    pub enabled: bool,
    /// `metrics.path`.
    pub path: String,
}

impl Default for Config {
    /// The configuration a deployment gets with no file and no environment: every key at the
    /// value configuration.md section 1 shows. These are the only place the defaults live.
    fn default() -> Self {
        Self {
            server: Server {
                listen: Listen {
                    host: String::new(),
                    port: DEFAULT_PORT,
                },
                base_path: "/".to_owned(),
                display_name: "BitGauge".to_owned(),
                public_url: Origin::default(),
                trusted_proxies: Vec::new(),
                labels: Vec::new(),
                cors: Cors::default(),
            },
            limits: Limits {
                max_download_bytes: Size::MIB.times(256),
                max_upload_bytes: Size::MIB.times(256),
                max_streams_per_client: 8,
                requests_per_minute: 1200,
                tracked_clients: 4096,
            },
            test_defaults: TestDefaults {
                preset: "standard".to_owned(),
                phases: [PHASE_IDLE, PHASE_DOWNLOAD, PHASE_UPLOAD]
                    .map(str::to_owned)
                    .to_vec(),
                streams: Streams {
                    mode: String::new(),
                    fixed: 3,
                    max: 6,
                },
                download: DurationRange::default(),
                upload: DurationRange::default(),
                data_cap: Size::new(0),
                units: "bits".to_owned(),
                warmup: Warmup::Auto,
                ping_count: 0,
                overhead_compensation_percent: 0.0,
            },
            compat: Compat {
                openspeedtest: Toggle::default(),
                librespeed: Toggle::default(),
                networkquality: NetworkQuality {
                    enabled: false,
                    max_upload_bytes: Size::GIB.times(16),
                    max_flows_per_client: 32,
                },
            },
            log: Log {
                format: "text".to_owned(),
                level: "info".to_owned(),
            },
            metrics: Metrics {
                enabled: false,
                path: "/metrics".to_owned(),
            },
        }
    }
}
