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

//! The security-header classifier (configuration-security.md section 3) and the header sets
//! of security.md section 5.

use std::collections::HashMap;

use http::header::{
    CACHE_CONTROL, CONTENT_SECURITY_POLICY, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS,
    X_FRAME_OPTIONS,
};
use http::{HeaderMap, HeaderName, HeaderValue, Method};

use super::routes::{Owner, route_table};
use crate::config::Config;
use crate::handlers::{NO_STORE, PREFIX, valid_host};
use crate::metrics::{Group as MetricsGroup, UNMATCHED};

/// The route group a request is classified in, which decides its header set and its error
/// format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Group {
    /// The SPA document and its assets, and anything outside the other groups.
    Spa,
    /// The native API and `/metrics`.
    Api,
    /// An enabled OpenSpeedTest layer's exact route paths.
    OpenSpeedTest,
    /// An enabled LibreSpeed layer's exact route paths.
    LibreSpeed,
    /// An enabled networkQuality layer's exact route paths.
    Nq,
}

impl Group {
    /// The metrics' group label of a request in the group that no route matched (backend.md
    /// section 7).
    #[must_use]
    pub const fn metrics_group(self) -> MetricsGroup {
        match self {
            Self::Spa => MetricsGroup::Spa,
            Self::Api => MetricsGroup::Api,
            Self::OpenSpeedTest => MetricsGroup::OpenSpeedTest,
            Self::LibreSpeed => MetricsGroup::LibreSpeed,
            Self::Nq => MetricsGroup::Nq,
        }
    }
}

/// Puts the native API under `base_path`, and `/metrics` when it is enabled, in the API group,
/// and each exact route path of an enabled layer in that layer's group; everything else, a
/// disabled layer's paths included, is the SPA group.
#[derive(Debug, Clone)]
pub struct Classifier {
    api_prefix: String,
    metrics_path: Option<String>,
    layers: HashMap<String, Group>,
    /// The methods of each mounted route-table row, by its pattern under `base_path`.
    methods: HashMap<String, Vec<Method>>,
}

impl Classifier {
    /// The classifier for `config`.
    #[must_use]
    pub fn new(config: &Config) -> Self {
        let base = base_of(config);
        let mounted: Vec<_> = route_table()
            .into_iter()
            .filter(|route| route.owner.mounted(config))
            .collect();
        let mut methods = HashMap::new();
        for route in &mounted {
            if route.pattern == "/" && !base.is_empty() {
                // The bare base path serves the document too.
                methods.insert(base.to_owned(), route.methods.clone());
            }
            methods.insert(format!("{base}{}", route.pattern), route.methods.clone());
        }
        let layers = mounted
            .into_iter()
            .filter_map(|route| {
                let group = match route.owner {
                    Owner::OpenSpeedTest => Group::OpenSpeedTest,
                    Owner::LibreSpeed => Group::LibreSpeed,
                    Owner::Nq => Group::Nq,
                    Owner::Spa | Owner::Native | Owner::Operations => return None,
                };
                Some((format!("{base}{}", route.pattern), group))
            })
            .collect();
        Self {
            api_prefix: format!("{base}{PREFIX}"),
            metrics_path: config
                .metrics
                .enabled
                .then(|| format!("{base}{}", config.metrics.path)),
            layers,
            methods,
        }
    }

    /// The route a request with `method` is labeled with, given the pattern the router
    /// `matched`: the pattern when its row lists the method, and [`UNMATCHED`] otherwise, as chi
    /// matched no route for a method a row does not list. A pattern outside the route table,
    /// the metrics endpoint's or the native API's catch-all, keeps every method.
    #[must_use]
    pub fn route<'pattern>(&self, matched: &'pattern str, method: &Method) -> &'pattern str {
        match self.methods.get(matched) {
            Some(methods) if !methods.contains(method) => UNMATCHED,
            Some(_) | None => matched,
        }
    }

    /// The group of a request for `path`.
    #[must_use]
    pub fn classify(&self, path: &str) -> Group {
        let under_api = path
            .strip_prefix(self.api_prefix.as_str())
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'));
        if under_api || self.metrics_path.as_deref() == Some(path) {
            return Group::Api;
        }
        self.layers.get(path).copied().unwrap_or(Group::Spa)
    }
}

/// `server.base_path` without its trailing slash: empty at the root.
pub(super) fn base_of(config: &Config) -> &str {
    let base = config.server.base_path.as_str();
    base.strip_suffix('/').unwrap_or(base)
}

/// The one inline style the SPA inserts, the fixed `<style>` of reka-ui's `SelectViewport` that
/// hides the list's scrollbar, by its SHA-256, so `'unsafe-inline'` stays out (security.md section
/// 5). `web/src/lib/csp.test.ts` hashes the installed package's text.
const STYLE_HASH: &str = "'sha256-60LHlRjW/B3CtzIoE/Lf1/NEDvko9efWMFaGVhHu/cs='";

/// What precedes the WebSocket sources of `connect-src`.
fn csp_start() -> String {
    format!(
        "default-src 'none'; script-src 'self'; style-src 'self' {STYLE_HASH}; \
         img-src 'self' data: blob:; font-src 'self'; connect-src 'self'"
    )
}

/// What follows them.
const CSP_END: &str = "; worker-src 'self'; manifest-src 'self'; base-uri 'none'; \
                       form-action 'none'; frame-ancestors 'none'";

/// The CSP for a request's host: `connect-src` names `ws://` and `wss://` for it explicitly,
/// since older Safari versions do not match them with `'self'`. A host that is not a hostname
/// or IP literal with an optional port gets the policy without them, so the header only ever
/// reflects a well-formed host the browser asked for.
#[must_use]
pub fn content_security_policy(host: &str) -> String {
    if valid_host(host) {
        format!("{} ws://{host} wss://{host}{CSP_END}", csp_start())
    } else {
        format!("{}{CSP_END}", csp_start())
    }
}

const PERMISSIONS_POLICY: HeaderName = HeaderName::from_static("permissions-policy");
const COOP: HeaderName = HeaderName::from_static("cross-origin-opener-policy");
const COEP: HeaderName = HeaderName::from_static("cross-origin-embedder-policy");
const CORP: HeaderName = HeaderName::from_static("cross-origin-resource-policy");

/// The header set of `group`, as Go set it before the handler ran: a value the handler set
/// itself is kept. Every group but the SPA's gets the API set.
pub fn set_headers(headers: &mut HeaderMap, group: Group, host: &str) {
    let mut set = |name: HeaderName, value: HeaderValue| {
        headers.entry(name).or_insert(value);
    };
    set(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    if group != Group::Spa {
        set(CACHE_CONTROL, NO_STORE);
        return;
    }
    if let Ok(policy) = HeaderValue::try_from(content_security_policy(host)) {
        set(CONTENT_SECURITY_POLICY, policy);
    }
    set(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    set(
        PERMISSIONS_POLICY,
        HeaderValue::from_static("camera=(), microphone=(), geolocation=(), usb=(), payment=()"),
    );
    set(COOP, HeaderValue::from_static("same-origin"));
    set(COEP, HeaderValue::from_static("require-corp"));
    set(CORP, HeaderValue::from_static("same-origin"));
    set(X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
}
