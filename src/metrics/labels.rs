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

//! The fixed label values of backend.md section 7: groups, directions, limits and status codes.

use http::StatusCode;

use crate::ratelimit::Limit;

/// The `group` label: the owner of the route that matched (backend.md section 7).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Group {
    /// The SPA's routes.
    Spa,
    /// The native API.
    Api,
    /// The OpenSpeedTest layer.
    OpenSpeedTest,
    /// The LibreSpeed layer.
    LibreSpeed,
    /// The networkQuality layer.
    Nq,
    /// The metrics endpoint itself.
    Metrics,
}

impl Group {
    /// The label value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Spa => "spa",
            Self::Api => "api",
            Self::OpenSpeedTest => "openspeedtest",
            Self::LibreSpeed => "librespeed",
            Self::Nq => "nq",
            Self::Metrics => "metrics",
        }
    }

    /// Whether the group has throughput routes, and so transfer series.
    pub(super) const fn carries_transfers(self) -> bool {
        match self {
            Self::Api | Self::OpenSpeedTest | Self::LibreSpeed | Self::Nq => true,
            Self::Spa | Self::Metrics => false,
        }
    }
}

/// The compatibility layers, each with its own unmatched route once one of its routes is mounted.
pub(super) const LAYERS: [Group; 3] = [Group::OpenSpeedTest, Group::LibreSpeed, Group::Nq];

/// The `direction` label of a transfer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Direction {
    /// Bytes sent.
    Download,
    /// Bytes drained.
    Upload,
}

impl Direction {
    /// The label value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Download => "download",
            Self::Upload => "upload",
        }
    }
}

/// Both directions, in label order.
pub(super) const DIRECTIONS: [Direction; 2] = [Direction::Download, Direction::Upload];

/// The route label of a request no route matched.
pub const UNMATCHED: &str = "unmatched";

/// Every limit, each with its `limit` label value.
pub(super) const LIMITS: [Limit; 5] = [
    Limit::Streams,
    Limit::Rate,
    Limit::WebSockets,
    Limit::Flows,
    Limit::TableFull,
];

/// The `limit` label of a refusal.
pub(super) const fn limit_label(limit: Limit) -> &'static str {
    match limit {
        Limit::Streams => "streams",
        Limit::Rate => "rate",
        Limit::WebSockets => "websocket",
        Limit::Flows => "nq_flows",
        Limit::TableFull => "table_full",
    }
}

/// The statuses that are their own `code` label (backend.md section 7).
const ANSWERED: [u16; 16] = [
    101, 200, 204, 206, 304, 400, 403, 404, 405, 408, 411, 413, 416, 429, 500, 503,
];

/// One `code` label per answered status, plus `other`.
pub(super) const CODE_SLOTS: usize = ANSWERED.len() + 1;

/// The `code` labels by slot: the answered statuses as three digits, then `other`.
pub(super) const CODE_LABELS: [&str; CODE_SLOTS] = [
    "101", "200", "204", "206", "304", "400", "403", "404", "405", "408", "411", "413", "416",
    "429", "500", "503", "other",
];

/// The slot of a status: its own when BitGauge answers it, `other`'s otherwise, and `other`'s
/// for a request that ended without any response.
pub(super) fn code_slot(status: Option<StatusCode>) -> usize {
    status
        .and_then(|status| {
            ANSWERED
                .iter()
                .position(|&answered| answered == status.as_u16())
        })
        .unwrap_or(CODE_SLOTS - 1)
}
