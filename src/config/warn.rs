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

//! The warnings of configuration.md section 4: settings that are valid but probably unintended.

use super::gofmt::duration;
use super::{Config, Problem, TestDefaults};

/// The settings that are valid but probably unintended (configuration.md section 4). They are
/// logged at warn and never stop startup.
#[must_use]
pub fn warnings(config: &Config) -> Vec<Problem> {
    let mut warnings = Vec::new();
    if config.metrics.enabled && config.server.trusted_proxies.is_empty() {
        warnings.push(Problem {
            key: "metrics.enabled".to_owned(),
            value: "true".to_owned(),
            rule: "metrics are on with no server.trusted_proxies, so the unauthenticated metrics \
                   endpoint is probably reachable directly; restrict it at the proxy"
                .to_owned(),
            location: None,
        });
    }
    for (index, prefix) in config.server.trusted_proxies.iter().enumerate() {
        // A /0 trusts every peer, IPv4 or IPv6, so any client can choose its own address.
        if prefix.bits() == 0 {
            warnings.push(Problem {
                key: format!("server.trusted_proxies[{index}]"),
                value: prefix.to_string(),
                rule: "trusts every address, so any client can set its own IP through \
                       X-Forwarded-For and escape the per-client limits"
                    .to_owned(),
                location: None,
            });
        }
    }
    warnings.extend(continuous_durations(&config.test_defaults));
    warnings
}

/// Each duration key set with the Continuous preset, which has no minimum or maximum and
/// ignores them (configuration.md section 2.3).
fn continuous_durations(defaults: &TestDefaults) -> Vec<Problem> {
    if defaults.preset != "continuous" {
        return Vec::new();
    }
    [
        ("test_defaults.download", defaults.download),
        ("test_defaults.upload", defaults.upload),
    ]
    .into_iter()
    .flat_map(|(key, bounds)| {
        [
            (format!("{key}.min_duration"), bounds.min_duration),
            (format!("{key}.max_duration"), bounds.max_duration),
        ]
    })
    .filter_map(|(key, bound)| {
        bound.map(|value| Problem {
            key,
            value: duration(value),
            rule: "ignored with test_defaults.preset continuous, which has no minimum or maximum"
                .to_owned(),
            location: None,
        })
    })
    .collect()
}
