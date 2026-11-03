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

//! The router of the route groups (backend.md section 4).

use std::future::ready;
use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use axum::middleware::from_fn;
use axum::routing::any;

use super::classify::{Classifier, base_of};
use super::middleware::{Observer, Stack, record_route};
use super::routes::{Owner, check_routes};
use crate::clientip::Deriver;
use crate::compat::{librespeed, nq, openspeedtest};
use crate::config::{Config, Problem};
use crate::handlers::{Body, Limit, Native, native_routes};
use crate::metrics::Metrics;
use crate::ratelimit::Limiter;
use crate::web::{Spa, not_found};

/// The route groups the router mounts.
#[derive(Debug)]
pub struct Groups {
    /// The SPA; without it its routes answer 404.
    pub spa: Option<Arc<Spa>>,
    /// The native API; the router adds its limit.
    pub native: Native,
    /// The OpenSpeedTest layer, mounted when `compat.openspeedtest.enabled` is set; the router
    /// adds its limit.
    pub openspeedtest: openspeedtest::Deps,
    /// The LibreSpeed layer, mounted when `compat.librespeed.enabled` is set; the router adds
    /// its limit.
    pub librespeed: librespeed::Deps,
    /// The networkQuality layer, mounted when `compat.networkquality.enabled` is set; the
    /// router adds its flow limit.
    pub nq: nq::Deps,
    /// Limits the native throughput routes and the layers', and networkQuality's flows.
    pub limiter: Limiter,
    /// Counts the limiter's refusals.
    pub meter: Arc<Metrics>,
    /// Serves the metrics endpoint, mounted when `metrics.enabled` is set; without it the path
    /// answers 404.
    pub endpoint: Option<Arc<Metrics>>,
}

/// The server's service for `config`, which the connection driver serves: the [`router`] of
/// `groups` inside the global middleware, with the client IP derived through
/// `server.trusted_proxies` and every request observed in `groups.meter`.
///
/// # Errors
///
/// The problems of the route collision check, as [`router`] returns them.
pub fn app(config: &Config, groups: Groups) -> Result<Stack, Vec<Problem>> {
    let meter = Arc::clone(&groups.meter);
    let router = router(config, groups)?;
    Ok(Stack::new(
        router,
        Deriver::new(&config.server.trusted_proxies),
        Classifier::new(config),
        Some(Observer::new(config, meter)),
    ))
}

/// Mounts the route groups under `base_path`: the SPA's fixed routes, the native API at
/// `/api/v1` behind its CORS step, with the limit on download and upload only, each enabled
/// layer at its exact paths, and the metrics endpoint at `metrics.path` when `metrics.enabled`
/// is set, outside any limit. Unknown paths under `/api/v1` get the error envelope; any other
/// unknown path a plain 404. A method a layer's row does not list reaches that layer, which
/// answers 405 itself.
///
/// # Errors
///
/// The route collision check runs first, so no router exists for a configuration that fails
/// it; the caller reports the problems and exits with status 2 like any other configuration
/// problem.
pub fn router(config: &Config, groups: Groups) -> Result<Router, Vec<Problem>> {
    let problems = check_routes(config);
    if !problems.is_empty() {
        return Err(problems);
    }
    let base = base_of(config);
    let limit = Limit::streams(groups.limiter.clone(), Arc::clone(&groups.meter));
    let flows = Limit::flows(groups.limiter, groups.meter);

    let mut router = Router::new();
    if let Some(spa) = &groups.spa {
        router = router.merge(spa.routes(base));
    }
    let mut layers = Router::new();
    if Owner::OpenSpeedTest.mounted(config) {
        let deps = openspeedtest::Deps {
            limit: Some(limit.clone()),
            ..groups.openspeedtest
        };
        layers = layers.merge(openspeedtest::routes(deps));
    }
    if Owner::LibreSpeed.mounted(config) {
        let deps = librespeed::Deps {
            limit: Some(limit.clone()),
            ..groups.librespeed
        };
        layers = layers.merge(librespeed::routes(config, deps));
    }
    if Owner::Nq.mounted(config) {
        let deps = nq::Deps {
            flow_limit: Some(flows),
            ..groups.nq
        };
        layers = layers.merge(nq::routes(config, deps));
    }
    router = if base.is_empty() {
        router.merge(layers)
    } else {
        router.nest(base, layers)
    };
    if let (true, Some(meter)) = (config.metrics.enabled, groups.endpoint) {
        router = router.route(
            &format!("{base}{}", config.metrics.path),
            any(move |request: Request| ready(meter.respond(request.method()).map(Body::new))),
        );
    }
    let native = Native {
        limit: Some(limit),
        ..groups.native
    };
    router = router.merge(native_routes(
        native,
        &config.server.cors.allowed_origins,
        base,
    ));
    Ok(router
        .route_layer(from_fn(record_route))
        .fallback(|| ready(not_found())))
}
