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

//! What the layer tests share: a request builder, a body that counts what is read of it, and
//! the router call.

use std::convert::Infallible;
use std::io;
use std::net::IpAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll};

use axum::Router;
use bytes::Bytes;
use http::{Method, Request, Response, Version};
use http_body::{Body as HttpBody, Frame};
use tower_service::Service as _;

use crate::clientip::Client;
use crate::clock::TokioClock;
use crate::handlers::tests::support::{header, meter};
use crate::handlers::{Body, Limit};
use crate::ratelimit::{Limiter, Options};

/// The size of each frame a [`Counted`] body hands out, the most a Go read of the drainer took.
const FRAME: usize = 64 << 10;

/// The client of every request unless a test names another.
pub(super) const CLIENT: &str = "10.0.0.7";

/// A request body of `size` bytes in frames, counting the bytes handed out; at its end it either
/// ends, fails as a client gone away does, or stalls as a client that stopped sending does.
pub(super) struct Counted {
    left: usize,
    read: Arc<AtomicUsize>,
    end: End,
}

#[derive(Debug, Clone, Copy)]
enum End {
    Done,
    Stall,
}

impl Counted {
    pub(super) fn new(size: usize) -> Self {
        Self {
            left: size,
            read: Arc::default(),
            end: End::Done,
        }
    }

    pub(super) fn stalling(mut self) -> Self {
        self.end = End::Stall;
        self
    }

    /// The count of bytes handed out, which stays readable after the body is consumed.
    pub(super) fn read(&self) -> Arc<AtomicUsize> {
        Arc::clone(&self.read)
    }
}

impl HttpBody for Counted {
    type Data = Bytes;
    type Error = io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, io::Error>>> {
        let this = self.get_mut();
        if this.left == 0 {
            return match this.end {
                End::Done => Poll::Ready(None),
                End::Stall => Poll::Pending,
            };
        }
        let size = this.left.min(FRAME);
        this.left -= size;
        this.read.fetch_add(size, Ordering::SeqCst);
        Poll::Ready(Some(Ok(Frame::data(Bytes::from(vec![b'x'; size])))))
    }
}

/// A request to a layer: from [`CLIENT`] unless set, to the `Host` `speed.lan:8080`.
pub(super) struct Call<'call> {
    pub(super) method: Method,
    pub(super) target: &'call str,
    pub(super) headers: &'call [(&'call str, &'call str)],
    pub(super) client: &'call str,
    pub(super) peer_trusted: bool,
    pub(super) length: Option<u64>,
    pub(super) version: Version,
}

impl<'call> Call<'call> {
    pub(super) fn new(method: Method, target: &'call str) -> Self {
        Self {
            method,
            target,
            headers: &[],
            client: CLIENT,
            peer_trusted: false,
            length: None,
            version: Version::HTTP_11,
        }
    }

    pub(super) fn get(target: &'call str) -> Self {
        Self::new(Method::GET, target)
    }

    pub(super) fn headers(mut self, headers: &'call [(&'call str, &'call str)]) -> Self {
        self.headers = headers;
        self
    }

    pub(super) fn client(mut self, client: &'call str) -> Self {
        self.client = client;
        self
    }

    pub(super) fn trusted(mut self) -> Self {
        self.peer_trusted = true;
        self
    }

    pub(super) fn length(mut self, length: u64) -> Self {
        self.length = Some(length);
        self
    }

    pub(super) fn version(mut self, version: Version) -> Self {
        self.version = version;
        self
    }

    /// The request with `body`, and the [`Client`] the client IP middleware would store.
    pub(super) fn build<B>(&self, body: B) -> Request<B> {
        let mut builder = Request::builder()
            .method(self.method.clone())
            .uri(self.target)
            .version(self.version)
            .header("host", "speed.lan:8080");
        for (name, value) in self.headers {
            builder = builder.header(*name, *value);
        }
        if let Some(length) = self.length {
            builder = builder.header("content-length", length);
        }
        let mut request = builder.body(body).expect("a request");
        let address: IpAddr = self.client.parse().expect("a client address");
        request.extensions_mut().insert(Client {
            address,
            peer_trusted: self.peer_trusted,
        });
        request
    }
}

/// Serves one request on `router`.
pub(super) async fn serve<B>(router: &Router, request: Request<B>) -> Response<Body>
where
    B: HttpBody<Data = Bytes> + Send + 'static,
    B::Error: Into<axum::BoxError>,
{
    let answer: Result<Response<Body>, Infallible> = router.clone().call(request).await;
    match answer {
        Ok(response) => response,
        Err(never) => match never {},
    }
}

/// Serves `call` without a body.
pub(super) async fn send(router: &Router, call: &Call<'_>) -> Response<Body> {
    serve(router, call.build(Body::empty())).await
}

/// A limiter of one stream and one flow per client, and the limits over it.
pub(super) fn tight_limiter() -> Limiter {
    Limiter::new(
        Options {
            max_streams: 1,
            requests_per_minute: 1200,
            tracked_clients: 16,
            max_flows: 1,
        },
        TokioClock,
    )
}

pub(super) fn streams(limiter: &Limiter) -> Limit {
    Limit::streams(limiter.clone(), Arc::new(meter()))
}

pub(super) fn flows(limiter: &Limiter) -> Limit {
    Limit::flows(limiter.clone(), Arc::new(meter()))
}

pub(super) fn client_address() -> IpAddr {
    CLIENT.parse().expect("the client address")
}

/// Every method a route-table check tries on a path.
pub(super) const METHODS: [Method; 7] = [
    Method::GET,
    Method::HEAD,
    Method::POST,
    Method::PUT,
    Method::DELETE,
    Method::PATCH,
    Method::OPTIONS,
];

/// Checks a layer's router against its rows: each row's methods are served, every other method
/// answers 405 with the row's Allow value, which names exactly the row's methods in order.
pub(super) async fn assert_rows(router: &Router, rows: &[crate::compat::Row]) {
    for row in rows {
        let named: Vec<&str> = row.methods.iter().map(Method::as_str).collect();
        assert_eq!(row.allow, named.join(", "), "{}", row.path);
        for method in METHODS {
            let label = format!("{method} {}", row.path);
            let response = send(router, &Call::new(method.clone(), row.path).length(0)).await;
            if row.methods.contains(&method) {
                assert_ne!(
                    response.status(),
                    http::StatusCode::METHOD_NOT_ALLOWED,
                    "{label}"
                );
            } else {
                assert_eq!(
                    response.status(),
                    http::StatusCode::METHOD_NOT_ALLOWED,
                    "{label}"
                );
                assert_eq!(header(&response, "allow"), row.allow, "{label}");
            }
        }
    }
}
