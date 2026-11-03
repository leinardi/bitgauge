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

//! The per-request limit of the throughput routes and of networkQuality's flows, Go's
//! `ratelimit.Middleware` and `FlowMiddleware` (wire-protocol.md section 9).

use std::future::Future;
use std::net::{IpAddr, Ipv6Addr};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use bytes::Bytes;
use http::{Request, Response};
use http_body::{Body as HttpBody, Frame, SizeHint};

use super::{Body, refuse};
use crate::clientip::Client;
use crate::metrics::Metrics;
use crate::ratelimit::{LimitError, Limiter, Permit};

/// The key of a request that carries no [`Client`]: every such request shares one budget, which
/// limits too much rather than too little, as Go's zero address does.
const NO_CLIENT: IpAddr = IpAddr::V6(Ipv6Addr::UNSPECIFIED);

/// What one request takes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Slot {
    /// A stream slot and a token of `limits` (the throughput group).
    Stream,
    /// A flow slot of `compat.networkquality.max_flows_per_client`.
    Flow,
}

/// One acquisition per request for the client the client IP middleware derived, held until the
/// response body is done, so a download keeps its slot while it streams. A refusal is answered
/// with [`refuse`] before the handler runs, so its body is never read.
#[derive(Debug, Clone)]
pub struct Limit {
    limiter: Limiter,
    meter: Arc<Metrics>,
    slot: Slot,
}

impl Limit {
    /// The limit of the throughput routes: a stream slot and a request token per request.
    #[must_use]
    pub const fn streams(limiter: Limiter, meter: Arc<Metrics>) -> Self {
        Self {
            limiter,
            meter,
            slot: Slot::Stream,
        }
    }

    /// The limit of networkQuality's `/nq/large` and `/nq/upload`: a flow slot per request,
    /// not a stream slot (compatibility.md section 3.1).
    #[must_use]
    pub const fn flows(limiter: Limiter, meter: Arc<Metrics>) -> Self {
        Self {
            limiter,
            meter,
            slot: Slot::Flow,
        }
    }

    /// Runs `handler` under one acquisition, or answers the refusal.
    pub async fn run<B, F, R>(&self, request: Request<B>, handler: F) -> Response<Body>
    where
        F: FnOnce(Request<B>) -> R,
        R: Future<Output = Response<Body>>,
    {
        let address = request
            .extensions()
            .get::<Client>()
            .map_or(NO_CLIENT, |client| client.address);
        match self.acquire(address) {
            Ok(permit) => handler(request)
                .await
                .map(|body| Body::new(Held { body, permit })),
            Err(refused) => refuse(request.version(), &refused, &self.meter),
        }
    }

    fn acquire(&self, address: IpAddr) -> Result<Permit, LimitError> {
        match self.slot {
            Slot::Stream => self.limiter.acquire_stream(address),
            Slot::Flow => self.limiter.acquire_flow(address),
        }
    }
}

/// Runs `handler` under `limit`, or unlimited without one.
pub async fn limited<B, F, R>(
    limit: Option<&Limit>,
    request: Request<B>,
    handler: F,
) -> Response<Body>
where
    F: FnOnce(Request<B>) -> R,
    R: Future<Output = Response<Body>>,
{
    match limit {
        Some(limit) => limit.run(request, handler).await,
        None => handler(request).await,
    }
}

pin_project_lite::pin_project! {
    /// A response body that holds its request's permit until hyper drops it.
    struct Held {
        #[pin]
        body: Body,
        permit: Permit,
    }
}

impl HttpBody for Held {
    type Data = Bytes;
    type Error = axum::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, axum::Error>>> {
        self.project().body.poll_frame(context)
    }

    fn is_end_stream(&self) -> bool {
        self.body.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.body.size_hint()
    }
}
