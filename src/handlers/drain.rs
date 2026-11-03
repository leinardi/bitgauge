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

//! The one drainer of every route that reads a body (backend.md section 2.2).

use std::pin::pin;
use std::time::Duration;

use bytes::Bytes;
use http::header::{CONNECTION, CONTENT_LENGTH};
use http::{HeaderMap, HeaderValue, Request, Response, StatusCode, Version};
use http_body_util::BodyExt as _;
use tokio::time::{Instant, timeout_at};

use super::Body;
use super::envelope::{
    CODE_LENGTH_REQUIRED, CODE_PAYLOAD_TOO_LARGE, CODE_REQUEST_TIMEOUT, error_response,
};
use crate::metrics::Transfer;

/// The rules of one route that drains a body.
#[derive(Debug, Clone)]
pub struct DrainOptions {
    /// Counts the drain, a body cut at its lifetime as a timeout, and a client gone mid-body as
    /// an abort.
    pub transfer: Transfer,
    /// The route's cap: a declared `Content-Length` above it is answered 413 without reading,
    /// and a body that runs past it is cut there and answered 413.
    pub limit: u64,
    /// How long after handler entry the body may take to arrive; 408 after it.
    pub lifetime: Duration,
    /// Answers a body without `Content-Length` 411, which only the native upload does; the
    /// other routes read such a body up to `limit` (compatibility.md section 6).
    pub require_length: bool,
}

/// A response that must not be sent: the client went away mid-body. The connection driver's
/// service (`server::conn`) turns a response carrying it into an error, on which hyper closes
/// the connection without writing, as Go's `http.ErrAbortHandler` does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Abort;

/// What a frame callback returns to stop a body still arriving when its lifetime ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LifetimeExceeded;

/// Why a drain stopped before the body's end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stopped {
    Lifetime,
    OverCap,
    Aborted,
}

/// Counts a transfer as in progress for as long as it lives.
struct Active<'transfer>(&'transfer Transfer);

impl<'transfer> Active<'transfer> {
    fn start(transfer: &'transfer Transfer) -> Self {
        transfer.start();
        Self(transfer)
    }
}

impl Drop for Active<'_> {
    fn drop(&mut self) {
        self.0.done();
    }
}

/// Reads `body` to its end and discards it, frame by frame, each frame awaited only until
/// `deadline`, reading at most `limit` bytes. After every frame with data, `on_frame` is
/// called with the bytes counted from it; its [`LifetimeExceeded`] stops the drain. The result
/// is the bytes read; `transfer` counts the drain as in progress and the bytes read.
async fn drain<B>(
    body: B,
    limit: u64,
    deadline: Instant,
    transfer: &Transfer,
    mut on_frame: impl FnMut(u64) -> Result<(), LifetimeExceeded>,
) -> Result<u64, Stopped>
where
    B: http_body::Body<Data = Bytes>,
{
    let _active = Active::start(transfer);
    let mut body = pin!(body);
    let mut total: u64 = 0;
    loop {
        let frame = match timeout_at(deadline, body.as_mut().frame()).await {
            Err(_elapsed) => return Err(Stopped::Lifetime),
            Ok(None) => return Ok(total),
            Ok(Some(Err(_))) => return Err(Stopped::Aborted),
            Ok(Some(Ok(frame))) => frame,
        };
        let Ok(data) = frame.into_data() else {
            continue;
        };
        let length = u64::try_from(data.len()).unwrap_or(u64::MAX);
        let room = limit - total;
        let counted = length.min(room);
        total += counted;
        transfer.add(counted);
        if counted > 0 && on_frame(counted).is_err() {
            return Err(Stopped::Lifetime);
        }
        if length > room {
            return Err(Stopped::OverCap);
        }
    }
}

/// The length the request declared, if it declared one. A chunked body, and a request with
/// neither a length nor chunking, declare none.
fn declared_length(headers: &HeaderMap) -> Option<u64> {
    headers
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

/// Drains a request's body: it checks the declared length, then reads the body to its end,
/// each frame before entry plus `options.lifetime`, calling `on_frame` after every frame with
/// data. It returns the bytes read, or the answer when the body was not drained: 411, 413 or
/// 408 with the error envelope and `Connection: close` on HTTP/1.x, so the unread rest never
/// has to be drained; and for a client that went away mid-body, an empty response marked
/// [`Abort`].
///
/// # Errors
///
/// The answer to send instead of the route's own.
pub async fn drain_body<B>(
    request: Request<B>,
    entry: Instant,
    options: &DrainOptions,
    on_frame: impl FnMut(u64) -> Result<(), LifetimeExceeded>,
) -> Result<u64, Box<Response<Body>>>
where
    B: http_body::Body<Data = Bytes>,
{
    let http1 = request.version() <= Version::HTTP_11;
    let declared = declared_length(request.headers());
    if options.require_length && declared.is_none() {
        return Err(Box::new(refuse(
            http1,
            StatusCode::LENGTH_REQUIRED,
            CODE_LENGTH_REQUIRED,
            "Content-Length is required",
        )));
    }
    let too_large = || {
        refuse(
            http1,
            StatusCode::PAYLOAD_TOO_LARGE,
            CODE_PAYLOAD_TOO_LARGE,
            &format!("the body must be at most {} bytes", options.limit),
        )
    };
    if declared.is_some_and(|declared| declared > options.limit) {
        return Err(Box::new(too_large()));
    }
    let deadline = entry + options.lifetime;
    match drain(
        request.into_body(),
        options.limit,
        deadline,
        &options.transfer,
        on_frame,
    )
    .await
    {
        Ok(total) => Ok(total),
        Err(Stopped::Lifetime) => {
            options.transfer.timeout();
            Err(Box::new(refuse(
                http1,
                StatusCode::REQUEST_TIMEOUT,
                CODE_REQUEST_TIMEOUT,
                "the body did not arrive within the upload lifetime",
            )))
        }
        Err(Stopped::OverCap) => Err(Box::new(too_large())),
        Err(Stopped::Aborted) => {
            // Nobody is left to read an answer, and answering would send one anyway.
            options.transfer.abort();
            let mut response = Response::new(Body::empty());
            response.extensions_mut().insert(Abort);
            Err(Box::new(response))
        }
    }
}

/// The error envelope, with `Connection: close` on HTTP/1.x.
fn refuse(http1: bool, status: StatusCode, code: &str, message: &str) -> Response<Body> {
    let mut response = error_response(status, code, message, None);
    if http1 {
        response
            .headers_mut()
            .insert(CONNECTION, HeaderValue::from_static("close"));
    }
    response
}
