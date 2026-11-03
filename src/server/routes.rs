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

//! The route table of compatibility.md section 5, the `metrics.path` collision check, and the
//! routes each configuration mounts.

use http::Method;

use crate::compat::{Row, librespeed, nq, openspeedtest};
use crate::config::{Config, Problem};
use crate::handlers::{NATIVE_ROUTES, PREFIX};
use crate::metrics::{self, Group as MetricsGroup};
use crate::web;

/// Who serves a row of the route table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Owner {
    /// The SPA's documents and assets.
    Spa,
    /// The native API under `/api/v1`.
    Native,
    /// `/metrics`.
    Operations,
    /// The OpenSpeedTest layer.
    OpenSpeedTest,
    /// The LibreSpeed layer.
    LibreSpeed,
    /// The networkQuality layer.
    Nq,
}

impl Owner {
    /// The name the collision check gives.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Spa => "SPA",
            Self::Native => "native",
            Self::Operations => "operations",
            Self::OpenSpeedTest => "OpenSpeedTest",
            Self::LibreSpeed => "LibreSpeed",
            Self::Nq => "networkQuality",
        }
    }

    /// The metrics' group label of the owner (backend.md section 7).
    #[must_use]
    pub const fn group(self) -> MetricsGroup {
        match self {
            Self::Spa => MetricsGroup::Spa,
            Self::Native => MetricsGroup::Api,
            Self::Operations => MetricsGroup::Metrics,
            Self::OpenSpeedTest => MetricsGroup::OpenSpeedTest,
            Self::LibreSpeed => MetricsGroup::LibreSpeed,
            Self::Nq => MetricsGroup::Nq,
        }
    }

    /// Whether the router mounts the owner's rows for `config`: the SPA's and the native API's
    /// always, a compatibility layer's when its toggle is on, `/metrics` when it is enabled.
    #[must_use]
    pub const fn mounted(self, config: &Config) -> bool {
        match self {
            Self::Spa | Self::Native => true,
            Self::Operations => config.metrics.enabled,
            Self::OpenSpeedTest => config.compat.openspeedtest.enabled,
            Self::LibreSpeed => config.compat.librespeed.enabled,
            Self::Nq => config.compat.networkquality.enabled,
        }
    }
}

/// One row of the route table: a path pattern under `base_path`, in the table's syntax (a
/// `{param}` segment, or a trailing `/*` for anything below it), its owner and its methods.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    /// The pattern, as the metrics label a request on it.
    pub pattern: String,
    /// Who serves it.
    pub owner: Owner,
    /// The methods it serves, in Allow order.
    pub methods: Vec<Method>,
}

impl Route {
    fn new(pattern: impl Into<String>, owner: Owner, methods: &[Method]) -> Self {
        Self {
            pattern: pattern.into(),
            owner,
            methods: methods.to_vec(),
        }
    }
}

/// Every route BitGauge can serve, whether or not its group is enabled, except `/metrics`,
/// whose path is the thing checked against it: the list the collision check reads
/// (configuration-security.md section 2).
#[must_use]
pub fn route_table() -> Vec<Route> {
    let spa = web::route_patterns()
        .into_iter()
        .map(|pattern| Route::new(pattern, Owner::Spa, web::METHODS));
    let native = NATIVE_ROUTES.iter().map(|route| {
        Route::new(
            format!("{PREFIX}{}", route.path),
            Owner::Native,
            route.methods,
        )
    });
    let layer = |rows: &'static [Row], owner: Owner| {
        rows.iter()
            .map(move |row| Route::new(row.path, owner, row.methods))
    };
    spa.chain(native)
        .chain(layer(&openspeedtest::ROWS, Owner::OpenSpeedTest))
        .chain(layer(&librespeed::ROWS, Owner::LibreSpeed))
        .chain(layer(&nq::ROWS, Owner::Nq))
        .collect()
}

/// The `metrics.path` rule of configuration.md section 4 that validation leaves to the router:
/// the path must not collide with any row of the route table, nor fall under the native API,
/// whose unknown paths answer its own 404.
#[must_use]
pub fn check_routes(config: &Config) -> Vec<Problem> {
    let path = config.metrics.path.as_str();
    let problem = |rule: String| Problem {
        key: "metrics.path".to_owned(),
        value: path.to_owned(),
        rule,
        location: None,
    };
    if path == PREFIX || path.starts_with(&format!("{PREFIX}/")) {
        return vec![problem(format!(
            "must not be under {PREFIX}, the native API"
        ))];
    }
    route_table()
        .into_iter()
        .find(|route| matches(&route.pattern, path))
        .map(|route| {
            problem(format!(
                "must not collide with the {} route {} (compatibility.md section 5)",
                route.owner.name(),
                route.pattern
            ))
        })
        .into_iter()
        .collect()
}

/// Whether `path` is matched by a pattern of the route table: a literal, a `{param}` segment,
/// or a trailing `*` that matches anything below its prefix.
fn matches(pattern: &str, path: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix('*') {
        return path.starts_with(prefix);
    }
    let patterns: Vec<&str> = pattern.split('/').collect();
    let segments: Vec<&str> = path.split('/').collect();
    patterns.len() == segments.len()
        && patterns.iter().zip(&segments).all(|(pattern, segment)| {
            let param = pattern.starts_with('{') && pattern.ends_with('}');
            if param {
                !segment.is_empty()
            } else {
                pattern == segment
            }
        })
}

/// The routes the router mounts for `config`, without `base_path`, each with its owner's
/// group: the SPA's, the native API's, each enabled layer's, and `metrics.path` when
/// `metrics.enabled` is set. The metrics create their series from it.
#[must_use]
pub fn mounted_routes(config: &Config) -> Vec<metrics::Route> {
    let mut routes: Vec<metrics::Route> = route_table()
        .into_iter()
        .filter(|route| route.owner.mounted(config))
        .map(|route| metrics::Route::new(route.pattern, route.owner.group()))
        .collect();
    if config.metrics.enabled {
        routes.push(metrics::Route::new(
            config.metrics.path.clone(),
            Owner::Operations.group(),
        ));
    }
    routes
}
