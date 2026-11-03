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

//! The global middleware of backend.md section 3, outermost first: panic recovery, client IP,
//! security headers, then the request log and metrics.
//!
//! The four stages run in one service around the router. Recovery is the panic catch of
//! tower-http's `CatchPanicLayer`, written here because its answer depends on the request's
//! group, which tower-http's handler does not see. A Rust handler returns before its body
//! streams, so a request is observed when its response body ends or is dropped, which is when
//! Go's handler returned.

use std::any::Any;
use std::collections::HashMap;
use std::convert::Infallible;
use std::future::Future;
use std::net::IpAddr;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll};

use axum::Router;
use axum::extract::{MatchedPath, Request};
use axum::middleware::Next;
use bytes::Bytes;
use futures_util::FutureExt as _;
use http::header::CACHE_CONTROL;
use http::{Method, Response, StatusCode};
use http_body::{Body as HttpBody, Frame, SizeHint};
use tokio::time::Instant;
use tower_service::Service;

use super::classify::{Classifier, Group, base_of, set_headers};
use super::conn::Peer;
use super::routes::mounted_routes;
use crate::clientip::Deriver;
use crate::config::Config;
use crate::handlers::{Abort, Body, CODE_INTERNAL, NO_STORE, error_response, request_host};
use crate::metrics::{Group as MetricsGroup, Metrics, UNMATCHED};
use crate::web::plain_error;

/// The route a request matched, filled in by [`record_route`] inside the router so that the
/// stages around it can read it, a panicking request's included.
#[derive(Debug, Clone, Default)]
pub struct RouteSlot(Arc<OnceLock<String>>);

impl RouteSlot {
    /// The matched path pattern in the table's syntax, whatever the method, or [`UNMATCHED`].
    fn pattern(&self) -> &str {
        self.0.get().map_or(UNMATCHED, String::as_str)
    }
}

/// The route layer that records the route the router matched in the request's [`RouteSlot`].
pub async fn record_route(request: Request, next: Next) -> Response<Body> {
    if let (Some(slot), Some(matched)) = (
        request.extensions().get::<RouteSlot>(),
        request.extensions().get::<MatchedPath>(),
    ) {
        let _ = slot.0.set(table_pattern(matched.as_str()));
    }
    next.run(request).await
}

/// A matched path in the route table's syntax: axum's `{*path}` tail is the table's `*`.
fn table_pattern(matched: &str) -> String {
    matched
        .rsplit_once("/{*")
        .map_or_else(|| matched.to_owned(), |(prefix, _)| format!("{prefix}/*"))
}

/// Records each finished request in the metrics, labeled with the owner and the pattern of the
/// route it matched (backend.md section 7).
#[derive(Debug)]
pub struct Observer {
    meter: Arc<Metrics>,
    groups: HashMap<String, MetricsGroup>,
    base: String,
}

impl Observer {
    /// Resolves the labels of the routes the router mounts for `config` once, so a request only
    /// looks its route up.
    #[must_use]
    pub fn new(config: &Config, meter: Arc<Metrics>) -> Self {
        Self {
            meter,
            groups: mounted_routes(config)
                .into_iter()
                .map(|route| (route.pattern, route.group))
                .collect(),
            base: base_of(config).to_owned(),
        }
    }

    /// The group and route labels of a request: its route's owner and pattern without
    /// `base_path`, or, when no route matched, the classifier's group and [`UNMATCHED`].
    fn labels(&self, pattern: &str, group: Group) -> (MetricsGroup, String) {
        if let Some(trimmed) = pattern.strip_prefix(self.base.as_str()) {
            let trimmed = if trimmed.is_empty() { "/" } else { trimmed };
            if let Some(owner) = self.groups.get(trimmed) {
                return (*owner, trimmed.to_owned());
            }
        }
        (group.metrics_group(), UNMATCHED.to_owned())
    }
}

/// The global middleware around the router.
#[derive(Debug, Clone)]
pub struct Stack {
    router: Router,
    shared: Arc<Shared>,
}

#[derive(Debug)]
struct Shared {
    deriver: Deriver,
    classifier: Classifier,
    observer: Option<Observer>,
}

impl Stack {
    /// The stack around `router`. `observer` records the requests in the metrics; `None`
    /// records nothing.
    #[must_use]
    pub fn new(
        router: Router,
        deriver: Deriver,
        classifier: Classifier,
        observer: Option<Observer>,
    ) -> Self {
        Self {
            router,
            shared: Arc::new(Shared {
                deriver,
                classifier,
                observer,
            }),
        }
    }
}

impl<B> Service<http::Request<B>> for Stack
where
    B: HttpBody<Data = Bytes> + Send + 'static,
    B::Error: Into<axum::BoxError>,
{
    type Response = Response<Body>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Response<Body>, Infallible>> + Send>>;

    fn poll_ready(&mut self, _context: &mut Context<'_>) -> Poll<Result<(), Infallible>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: http::Request<B>) -> Self::Future {
        let mut router = self.router.clone();
        let shared = Arc::clone(&self.shared);
        Box::pin(async move {
            let mut request = request.map(Body::new);
            let start = Instant::now();
            let slot = RouteSlot::default();
            request.extensions_mut().insert(slot.clone());
            let group = shared.classifier.classify(request.uri().path());
            let host = request_host(&request).to_owned();
            let client = client_ip(&shared.deriver, &mut request);
            let method = request.method().clone();
            let answer = AssertUnwindSafe(router.call(request)).catch_unwind().await;
            let (mut response, panicked) = match answer {
                Ok(Ok(response)) => (response, false),
                Ok(Err(never)) => match never {},
                Err(panic) => (recovered(&*panic, group, &slot), true),
            };
            set_headers(response.headers_mut(), group, &host);
            let status =
                (response.extensions().get::<Abort>().is_none()).then(|| response.status());
            let observation = Observation {
                shared,
                group,
                slot,
                status,
                start,
                method,
                client,
                bytes: 0,
                panicked,
            };
            Ok(response.map(|body| {
                Body::new(Observed {
                    body,
                    observation: Some(observation),
                })
            }))
        })
    }
}

/// The client IP stage: the [`Client`](crate::clientip::Client) derived from the TCP peer the driver stores and the
/// forwarding headers, through trusted proxies only. A request without a peer address carries
/// none.
fn client_ip(deriver: &Deriver, request: &mut Request) -> Option<IpAddr> {
    let Peer(peer) = *request.extensions().get::<Peer>()?;
    let client = deriver.derive(peer, request.headers());
    request.extensions_mut().insert(client);
    Some(client.address)
}

/// The answer to a panic: 500, as the error envelope on every group but the SPA's, which gets
/// plain text. The panic is logged at warn with the route and the payload's type, never its
/// value, which could quote the request. A panic after the response started is in the body,
/// where hyper drops the connection.
fn recovered(panic: &(dyn Any + Send), group: Group, slot: &RouteSlot) -> Response<Body> {
    let kind = if panic.is::<&str>() {
        "&str"
    } else if panic.is::<String>() {
        "String"
    } else {
        "other"
    };
    tracing::warn!(route = slot.pattern(), panic = kind, "panic recovered");
    if group != Group::Spa {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            CODE_INTERNAL,
            "internal server error",
            None,
        );
    }
    let mut response = plain_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error\n");
    // Whatever caching the handler had set does not apply to this answer.
    response.headers_mut().insert(CACHE_CONTROL, NO_STORE);
    response
}

/// What a request is recorded with when its response body is done.
#[derive(Debug)]
struct Observation {
    shared: Arc<Shared>,
    group: Group,
    slot: RouteSlot,
    /// `None` for an aborted request, which gets no response.
    status: Option<StatusCode>,
    start: Instant,
    method: Method,
    client: Option<IpAddr>,
    bytes: u64,
    /// A recovered panic is counted in the metrics but has no request line, as in Go, where
    /// the panic passed through the logging stage.
    panicked: bool,
}

impl Observation {
    /// Records the request in the metrics, and, unless it panicked, logs one line at debug, and
    /// only at debug:
    /// method, route, status, body bytes, duration and the derived client IP. Never a header,
    /// a query string or a body (configuration-security.md section 6).
    fn finish(self) {
        let elapsed = self.start.elapsed();
        let pattern = self
            .shared
            .classifier
            .route(self.slot.pattern(), &self.method);
        if let Some(observer) = &self.shared.observer {
            let (group, route) = observer.labels(pattern, self.group);
            observer
                .meter
                .observe(group, &route, self.status, elapsed.as_secs_f64());
        }
        if self.panicked {
            return;
        }
        tracing::debug!(
            method = %self.method,
            route = pattern,
            status = self.status.map_or(0, |status| status.as_u16()),
            bytes = self.bytes,
            duration = ?elapsed,
            client = %self.client.map_or_else(String::new, |client| client.to_string()),
            "request"
        );
    }
}

pin_project_lite::pin_project! {
    /// A response body that counts what it hands out and records its request when it ends or
    /// is dropped.
    struct Observed {
        #[pin]
        body: Body,
        observation: Option<Observation>,
    }

    impl PinnedDrop for Observed {
        fn drop(this: Pin<&mut Self>) {
            if let Some(observation) = this.project().observation.take() {
                observation.finish();
            }
        }
    }
}

impl HttpBody for Observed {
    type Data = Bytes;
    type Error = axum::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, axum::Error>>> {
        let this = self.project();
        let frame = std::task::ready!(this.body.poll_frame(context));
        if let (Some(Ok(frame)), Some(observation)) = (&frame, this.observation.as_mut())
            && let Some(data) = frame.data_ref()
        {
            observation.bytes += u64::try_from(data.len()).unwrap_or(u64::MAX);
        }
        Poll::Ready(frame)
    }

    fn is_end_stream(&self) -> bool {
        self.body.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.body.size_hint()
    }
}
