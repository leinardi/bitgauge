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

//! BitGauge's settings for service-kit's HTTP/1 server, and the one thing it adds to it: a response
//! carrying [`Abort`] ends its connection without a status line (`backend.md` §5).
//!
//! The accept loop, the connection driver, the head and write-stall deadlines and the shutdown
//! sequence (stop, drain, cut) are service-kit's `http::serve`; the router, the middleware and the
//! WebSocket handler are BitGauge's.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use bytes::Bytes;
use http::{Request, Response};
use http_body::Body;
use hyper::body::Incoming;
use service_kit::http::{BoxError, Lifecycle, Outcome, ServerConfig};
use tokio::net::TcpListener;
use tower_service::Service;

use crate::handlers::Abort;

/// How long a client may take to send a request's head, an idle keep-alive connection's wait for
/// its next request included (hyper's header-read timeout).
pub const HEAD_TIMEOUT: Duration = Duration::from_secs(10);

/// How long a write may wait without a byte leaving before the connection is closed.
pub const WRITE_STALL: Duration = Duration::from_secs(30);

/// The most headers a request may carry; hyper answers more with `431`.
pub const MAX_HEADERS: usize = 100;

/// The largest request head, start line included; hyper answers a larger one with `431`.
pub const MAX_HEADER_SIZE: usize = 16 * 1024;

/// The server's settings: the head and write-stall deadlines, the header limits, upgrades for the
/// WebSocket, and `drain` as the time running transfers have to finish after `stop`.
#[must_use]
pub fn config(drain: Duration) -> ServerConfig {
    ServerConfig::new(HEAD_TIMEOUT, WRITE_STALL, drain)
        .max_headers(MAX_HEADERS)
        .max_header_size(MAX_HEADER_SIZE)
        .with_upgrades()
}

/// The service error for a response carrying [`Abort`]: hyper closes the connection on it
/// without writing a status line.
#[derive(Debug, thiserror::Error)]
#[error("the client went away mid-body")]
pub struct Aborted;

/// Serves `service` on `listener` until the lifecycle's `stop`, then drains and cuts as `config`
/// says.
pub async fn serve<S, B>(
    listener: TcpListener,
    service: S,
    config: ServerConfig,
    lifecycle: &Lifecycle,
) -> Outcome
where
    S: Service<Request<Incoming>, Response = Response<B>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
    B: Body<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError>,
{
    service_kit::http::serve(listener, Aborting { inner: service }, config, lifecycle).await
}

/// Fails a response carrying [`Abort`], so that nothing is written for it.
#[derive(Debug, Clone)]
struct Aborting<S> {
    inner: S,
}

impl<S, B> Service<Request<Incoming>> for Aborting<S>
where
    S: Service<Request<Incoming>, Response = Response<B>>,
    S::Future: Send + 'static,
    S::Error: Into<BoxError>,
{
    type Response = Response<B>;
    type Error = BoxError;
    type Future = Pin<Box<dyn Future<Output = Result<Response<B>, BoxError>> + Send>>;

    fn poll_ready(&mut self, context: &mut Context<'_>) -> Poll<Result<(), BoxError>> {
        self.inner.poll_ready(context).map_err(Into::into)
    }

    fn call(&mut self, request: Request<Incoming>) -> Self::Future {
        let future = self.inner.call(request);
        Box::pin(async move {
            let response = future.await.map_err(Into::into)?;
            if response.extensions().get::<Abort>().is_some() {
                return Err(Aborted.into());
            }
            Ok(response)
        })
    }
}
