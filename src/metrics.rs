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

//! The registry and the metric set of backend.md section 7. The instrumentation always runs;
//! only the endpoint is gated by `metrics.enabled`. Every label child a request touches is
//! created at startup, except a route's request counter for a status, which is created the
//! first time the route answers it and kept from then on, so a request never formats a label
//! value or looks one up in a family after that.

use std::collections::HashMap;
use std::fmt;
use std::sync::OnceLock;

use http::StatusCode;
use prometheus_client::collector::Collector;
use prometheus_client::encoding::{DescriptorEncoder, EncodeLabelSet, EncodeMetric};
use prometheus_client::metrics::counter::Counter;
use prometheus_client::metrics::family::Family;
use prometheus_client::metrics::gauge::{ConstGauge, Gauge};
use prometheus_client::metrics::histogram::Histogram;
use prometheus_client::registry::Registry;

use crate::buildinfo::Build;
use crate::ratelimit::Limit;

mod endpoint;
mod labels;

pub use endpoint::CONTENT_TYPE;
use labels::{CODE_LABELS, CODE_SLOTS, DIRECTIONS, LAYERS, LIMITS, code_slot, limit_label};
pub use labels::{Direction, Group, UNMATCHED};

/// Every name is under this prefix.
const PREFIX: &str = "bitgauge";

/// The request duration buckets reach the 120 s upload lifetime, so a slow link's throughput
/// requests still fall in a bucket.
const DURATION_BUCKETS: [f64; 14] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0,
];

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct RequestLabels {
    code: &'static str,
    group: &'static str,
    route: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct RouteLabels {
    group: &'static str,
    route: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct TransferLabels {
    direction: &'static str,
    group: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct GroupLabels {
    group: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct LimitLabels {
    limit: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EncodeLabelSet)]
struct BuildLabels {
    commit: &'static str,
    version: &'static str,
}

type Histograms = Family<RouteLabels, Histogram, fn() -> Histogram>;

fn duration_histogram() -> Histogram {
    Histogram::new(DURATION_BUCKETS)
}

/// A route the router mounts: its pattern as the route table writes it, without `base_path`,
/// and the group of its owner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    /// The pattern, or [`UNMATCHED`].
    pub pattern: String,
    /// The owner's group.
    pub group: Group,
}

impl Route {
    /// A route of `group` at `pattern`.
    #[must_use]
    pub fn new(pattern: impl Into<String>, group: Group) -> Self {
        Self {
            pattern: pattern.into(),
            group,
        }
    }
}

/// One route's series: its duration child, created at startup, and its request counter
/// children by code slot, each created at the route's first answer with that status.
#[derive(Debug)]
struct RouteSeries {
    requests: Family<RequestLabels, Counter>,
    group: Group,
    route: String,
    duration: Histogram,
    codes: [OnceLock<Counter>; CODE_SLOTS],
}

impl RouteSeries {
    fn observe(&self, status: Option<StatusCode>, seconds: f64) {
        let slot = code_slot(status);
        self.codes[slot]
            .get_or_init(|| {
                self.requests.get_or_create_owned(&RequestLabels {
                    code: CODE_LABELS[slot],
                    group: self.group.as_str(),
                    route: self.route.clone(),
                })
            })
            .inc();
        self.duration.observe(seconds);
    }
}

/// The series of one group and direction. The default records nothing, which is what a group
/// without throughput routes hands out. Clones share their series.
#[derive(Debug, Clone, Default)]
pub struct Transfer {
    bytes: Option<Counter>,
    active: Option<Gauge>,
    aborts: Option<Counter>,
    timeouts: Option<Counter>,
}

impl Transfer {
    /// Counts a transfer as in progress until [`Transfer::done`].
    pub fn start(&self) {
        if let Some(active) = &self.active {
            active.inc();
        }
    }

    /// Ends a transfer [`Transfer::start`] began.
    pub fn done(&self) {
        if let Some(active) = &self.active {
            active.dec();
        }
    }

    /// Counts bytes sent or drained.
    pub fn add(&self, bytes: u64) {
        if let Some(counter) = &self.bytes {
            counter.inc_by(bytes);
        }
    }

    /// Counts a transfer the client abandoned before the body ended.
    pub fn abort(&self) {
        if let Some(counter) = &self.aborts {
            counter.inc();
        }
    }

    /// Counts an upload body cut at its lifetime. A download transfer has no timeout series.
    pub fn timeout(&self) {
        if let Some(counter) = &self.timeouts {
            counter.inc();
        }
    }
}

/// The rate-limit table's size, read at each scrape.
struct TrackedClients(Box<dyn Fn() -> usize + Send + Sync>);

impl fmt::Debug for TrackedClients {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("TrackedClients")
    }
}

impl Collector for TrackedClients {
    fn encode(&self, mut encoder: DescriptorEncoder) -> fmt::Result {
        let gauge = ConstGauge::new(i64::try_from((self.0)()).unwrap_or(i64::MAX));
        let metric = encoder.encode_descriptor(
            "ratelimit_tracked_clients",
            "Entries in the rate-limit table.",
            None,
            gauge.metric_type(),
        )?;
        gauge.encode(metric)
    }
}

/// The registry and its series.
#[derive(Debug)]
pub struct Metrics {
    registry: Registry,
    routes: HashMap<Group, HashMap<String, RouteSeries>>,
    transfers: HashMap<(Group, Direction), Transfer>,
    refused: HashMap<Limit, Counter>,
    websocket_connections: Gauge,
    websocket_messages: Counter,
}

impl Metrics {
    /// The registry and the metric set, its children created for `routes`, the routes the
    /// router mounts, plus the unmatched route of the spa and api groups and of each layer with
    /// a mounted route. Transfer series exist for each group among `routes` that has throughput
    /// routes. `tracked` reports the entries in the rate-limit table at each scrape.
    ///
    /// Help texts are registered without their final period, which the crate adds.
    #[must_use]
    pub fn new(
        build: Build,
        tracked: impl Fn() -> usize + Send + Sync + 'static,
        routes: &[Route],
    ) -> Self {
        let mut registry = Registry::with_prefix(PREFIX);
        let requests = Family::<RequestLabels, Counter>::default();
        let durations = Histograms::new_with_constructor(duration_histogram);
        registry.register(
            "http_requests",
            "Requests by route group, route pattern and status",
            requests.clone(),
        );
        registry.register(
            "http_request_duration_seconds",
            "Request durations by route group and route pattern",
            durations.clone(),
        );

        let all: Vec<Route> = [Group::Spa, Group::Api]
            .into_iter()
            .map(|group| Route::new(UNMATCHED, group))
            .chain(routes.iter().cloned())
            .chain(
                LAYERS
                    .into_iter()
                    .filter(|&layer| routes.iter().any(|route| route.group == layer))
                    .map(|layer| Route::new(UNMATCHED, layer)),
            )
            .collect();

        let mut by_group: HashMap<Group, HashMap<String, RouteSeries>> = HashMap::new();
        for route in &all {
            let duration = durations.get_or_create_owned(&RouteLabels {
                group: route.group.as_str(),
                route: route.pattern.clone(),
            });
            by_group.entry(route.group).or_default().insert(
                route.pattern.clone(),
                RouteSeries {
                    requests: requests.clone(),
                    group: route.group,
                    route: route.pattern.clone(),
                    duration,
                    codes: std::array::from_fn(|_| OnceLock::new()),
                },
            );
        }

        let transfers = register_transfers(&mut registry, &all);
        let refused = register_limits(&mut registry, tracked);
        let websocket_connections = Gauge::default();
        let websocket_messages = Counter::default();
        registry.register(
            "websocket_connections",
            "Open latency WebSockets",
            websocket_connections.clone(),
        );
        registry.register(
            "websocket_messages",
            "Echoed ping messages",
            websocket_messages.clone(),
        );

        let info = Family::<BuildLabels, Gauge>::default();
        info.get_or_create(&BuildLabels {
            commit: build.commit,
            version: build.version,
        })
        .set(1);
        registry.register("build_info", "Build information; always 1", info);

        Self {
            registry,
            routes: by_group,
            transfers,
            refused,
            websocket_connections,
            websocket_messages,
        }
    }

    /// Records a finished request of `route`, a pattern [`Metrics::new`] was given or
    /// [`UNMATCHED`], with the status it answered, `None` when it ended without a response, and
    /// its duration.
    pub fn observe(&self, group: Group, route: &str, status: Option<StatusCode>, seconds: f64) {
        let Some(routes) = self.routes.get(&group) else {
            return;
        };
        // The router mounts only the routes the metrics were given; anything else is unmatched.
        if let Some(series) = routes.get(route).or_else(|| routes.get(UNMATCHED)) {
            series.observe(status, seconds);
        }
    }

    /// The transfer series of a group and direction; the default [`Transfer`], which records
    /// nothing, for a group without throughput routes.
    #[must_use]
    pub fn transfer(&self, group: Group, direction: Direction) -> Transfer {
        self.transfers
            .get(&(group, direction))
            .cloned()
            .unwrap_or_default()
    }

    /// Counts a refused acquisition by its limit.
    pub fn refused(&self, limit: Limit) {
        if let Some(counter) = self.refused.get(&limit) {
            counter.inc();
        }
    }

    /// Counts an open latency WebSocket until [`Metrics::websocket_closed`].
    pub fn websocket_opened(&self) {
        self.websocket_connections.inc();
    }

    /// Ends a connection [`Metrics::websocket_opened`] counted.
    pub fn websocket_closed(&self) {
        self.websocket_connections.dec();
    }

    /// Counts an echoed ping.
    pub fn websocket_echoed(&self) {
        self.websocket_messages.inc();
    }
}

fn register_transfers(
    registry: &mut Registry,
    routes: &[Route],
) -> HashMap<(Group, Direction), Transfer> {
    let bytes = Family::<TransferLabels, Counter>::default();
    let active = Family::<TransferLabels, Gauge>::default();
    let aborts = Family::<TransferLabels, Counter>::default();
    let timeouts = Family::<GroupLabels, Counter>::default();
    registry.register(
        "transfer_bytes",
        "Bytes sent (download) and drained (upload)",
        bytes.clone(),
    );
    registry.register("active_transfers", "Transfers in progress", active.clone());
    registry.register(
        "http_aborts",
        "Transfers the client abandoned before the body ended",
        aborts.clone(),
    );
    registry.register(
        "upload_timeouts",
        "Upload bodies cut at the 120 s lifetime",
        timeouts.clone(),
    );

    let mut transfers = HashMap::new();
    for route in routes {
        let group = route.group;
        if !group.carries_transfers() || transfers.contains_key(&(group, Direction::Download)) {
            continue;
        }
        for direction in DIRECTIONS {
            let labels = TransferLabels {
                direction: direction.as_str(),
                group: group.as_str(),
            };
            let timeouts = match direction {
                Direction::Upload => Some(timeouts.get_or_create_owned(&GroupLabels {
                    group: group.as_str(),
                })),
                Direction::Download => None,
            };
            transfers.insert(
                (group, direction),
                Transfer {
                    bytes: Some(bytes.get_or_create_owned(&labels)),
                    active: Some(active.get_or_create_owned(&labels)),
                    aborts: Some(aborts.get_or_create_owned(&labels)),
                    timeouts,
                },
            );
        }
    }
    transfers
}

fn register_limits(
    registry: &mut Registry,
    tracked: impl Fn() -> usize + Send + Sync + 'static,
) -> HashMap<Limit, Counter> {
    let refused = Family::<LimitLabels, Counter>::default();
    registry.register("rate_limited", "Rejections by limit", refused.clone());
    registry.register_collector(Box::new(TrackedClients(Box::new(tracked))));
    LIMITS
        .into_iter()
        .map(|limit| {
            let counter = refused.get_or_create_owned(&LimitLabels {
                limit: limit_label(limit),
            });
            (limit, counter)
        })
        .collect()
}

#[cfg(test)]
mod tests;
