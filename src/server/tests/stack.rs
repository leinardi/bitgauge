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

//! The whole server for a configuration, as the Go tests' `newStack` built it: the global
//! middleware around the router of every route group, served by the connection driver on a
//! loopback listener, and an HTTP/1 client that sends each request on a connection of its own.

use std::convert::Infallible;
use std::future::ready;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::middleware::from_fn;

use bytes::Bytes;
use http::header::{HOST, ORIGIN};
use http::{HeaderMap, Method, Request, StatusCode};
use http_body_util::{BodyExt as _, Full};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio::time::Instant;
use tower_service::Service as _;

use crate::buildinfo;
use crate::clientip::{Deriver, Labeler};
use crate::clock::{Clock, TokioClock};
use crate::compat::{librespeed, nq, openspeedtest};
use crate::config::{Cidr, Config};
use crate::handlers::{
    Body, DrainOptions, Epoch, Grid, Info, Native, RandomSource, UPLOAD_LIFETIME, WEBSOCKET_IDLE,
    WebSockets,
};
use crate::metrics::{Direction, Group as MetricsGroup, Metrics};
use crate::ratelimit::{Limiter, Options};
use crate::server::classify::Classifier;
use crate::server::conn::{self, Lifecycle, Outcome, Peer};
use crate::server::middleware::{Observer, Stack, record_route};
use crate::server::router::{Groups, app};
use crate::server::routes::mounted_routes;
use crate::server::timeouts::Timeouts;
use crate::test_support::dial_loopback;
use crate::web::{Files, ROOT_ASSETS, Spa, not_found};

/// A burst of exactly 60 tokens; the frozen clock never refills it.
pub(super) const REQUESTS_PER_MINUTE: u32 = 60;

/// The limiter's clock, which never moves, so a burst is never refilled mid-test.
#[derive(Debug)]
struct Frozen(Instant);

impl Clock for Frozen {
    fn now(&self) -> Instant {
        self.0
    }
}

/// The defaults with a burst of [`REQUESTS_PER_MINUTE`].
pub(super) fn test_config() -> Config {
    let mut config = Config::default();
    config.limits.requests_per_minute = i64::from(REQUESTS_PER_MINUTE);
    config
}

/// [`test_config`] with the metrics endpoint enabled under `base_path`.
pub(super) fn metrics_config(base_path: &str) -> Config {
    let mut config = test_config();
    config.metrics.enabled = true;
    config.server.base_path = base_path.to_owned();
    config
}

pub(super) fn trusting(config: &mut Config, proxies: &[&str]) {
    config.server.trusted_proxies = proxies
        .iter()
        .map(|proxy| proxy.parse::<Cidr>().expect("a CIDR"))
        .collect();
}

/// The SPA rendered from a scratch dist for `base_path`: `index.html`, one asset and every
/// root asset.
pub(super) fn test_spa(base_path: &str) -> Arc<Spa> {
    let mut files = Files::new();
    files.insert(
        "index.html".to_owned(),
        Bytes::from_static(
            br#"<meta name="bitgauge-base-path" content="/" /><script type="module" src="./assets/index-a1.js"></script>"#,
        ),
    );
    files.insert(
        "assets/index-a1.js".to_owned(),
        Bytes::from_static(b"export {}"),
    );
    for (name, _) in ROOT_ASSETS {
        files.insert(name.to_owned(), Bytes::from_static(name.as_bytes()));
    }
    Arc::new(Spa::render_files(files, base_path).expect("a complete dist"))
}

/// The route groups for `config`, with the limiter, the metrics and the shutdown signals they
/// share.
pub(super) fn groups(
    config: &Config,
    spa: Option<Arc<Spa>>,
    limiter: &Limiter,
    meter: &Arc<Metrics>,
    lifecycle: &Lifecycle,
) -> Groups {
    let source = RandomSource::new().expect("a random source");
    let epoch = Epoch::new().expect("an epoch");
    let transfer = |group, direction| meter.transfer(group, direction);
    let native = Native {
        source: source.clone(),
        grid: Grid::new(TokioClock, epoch.grid_offset),
        websockets: WebSockets::new(
            limiter.clone(),
            &config.server.cors.allowed_origins,
            WEBSOCKET_IDLE,
            Arc::clone(meter),
            lifecycle.clone(),
        ),
        info: Arc::new(Info::new(
            config,
            buildinfo::info(),
            &epoch,
            Labeler::new(&[]),
        )),
        epoch,
        max_download_bytes: config.limits.max_download_bytes.bytes(),
        upload: DrainOptions {
            transfer: transfer(MetricsGroup::Api, Direction::Upload),
            limit: config.limits.max_upload_bytes.bytes(),
            lifetime: UPLOAD_LIFETIME,
            require_length: true,
        },
        download: transfer(MetricsGroup::Api, Direction::Download),
        limit: None,
    };
    Groups {
        spa,
        native,
        openspeedtest: openspeedtest::Deps {
            source: source.clone(),
            limit: None,
            download: transfer(MetricsGroup::OpenSpeedTest, Direction::Download),
            upload: transfer(MetricsGroup::OpenSpeedTest, Direction::Upload),
        },
        librespeed: librespeed::Deps {
            source: source.clone(),
            limit: None,
            download: transfer(MetricsGroup::LibreSpeed, Direction::Download),
            upload: transfer(MetricsGroup::LibreSpeed, Direction::Upload),
        },
        nq: nq::Deps {
            source,
            flow_limit: None,
            download: transfer(MetricsGroup::Nq, Direction::Download),
            upload: transfer(MetricsGroup::Nq, Direction::Upload),
        },
        limiter: limiter.clone(),
        meter: Arc::clone(meter),
        endpoint: Some(Arc::clone(meter)),
    }
}

/// The limiter of `config`'s limits, on the frozen clock.
pub(super) fn limiter(config: &Config) -> Limiter {
    let count = |value: i64| u32::try_from(value).expect("a small limit");
    Limiter::new(
        Options {
            max_streams: count(config.limits.max_streams_per_client),
            requests_per_minute: count(config.limits.requests_per_minute),
            tracked_clients: usize::try_from(config.limits.tracked_clients).expect("a bound"),
            max_flows: count(config.compat.networkquality.max_flows_per_client),
        },
        Frozen(Instant::now()),
    )
}

/// The whole server on a loopback listener.
pub(super) struct TestStack {
    pub(super) address: SocketAddr,
    lifecycle: Lifecycle,
    served: Option<JoinHandle<Outcome>>,
}

/// A response with its body read.
#[derive(Debug)]
pub(super) struct Reply {
    pub(super) status: StatusCode,
    pub(super) headers: HeaderMap,
    pub(super) body: Bytes,
}

impl Reply {
    /// A header's value, or empty.
    pub(super) fn header(&self, name: &str) -> &str {
        self.headers
            .get(name)
            .map_or("", |value| value.to_str().expect("a text header"))
    }

    pub(super) fn text(&self) -> String {
        String::from_utf8(self.body.to_vec()).expect("a text body")
    }
}

/// A response whose body is left unread, with the connection that carries it.
pub(super) struct Held {
    pub(super) response: http::Response<Incoming>,
    _connection: JoinHandle<()>,
}

impl TestStack {
    /// The server for `config`, with `spa` mounted when given.
    pub(super) async fn start(config: &Config, spa: Option<Arc<Spa>>) -> Self {
        let limiter = limiter(config);
        let tracked = limiter.clone();
        let meter = Arc::new(Metrics::new(
            buildinfo::info(),
            move || tracked.tracked_clients(),
            &mounted_routes(config),
        ));
        let lifecycle = Lifecycle::new();
        let stack = app(config, groups(config, spa, &limiter, &meter, &lifecycle))
            .expect("no route problems");
        Self::serve(stack, lifecycle).await
    }

    /// `stack` on a loopback listener.
    pub(super) async fn serve(stack: Stack, lifecycle: Lifecycle) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("a listener");
        let address = listener.local_addr().expect("an address");
        let served = tokio::spawn({
            let lifecycle = lifecycle.clone();
            async move {
                conn::serve(
                    listener,
                    stack,
                    &lifecycle,
                    Timeouts::SERVER,
                    Duration::from_secs(1),
                )
                .await
            }
        });
        Self {
            address,
            lifecycle,
            served: Some(served),
        }
    }

    /// Sends one request and returns the response with its body unread.
    pub(super) async fn open(
        &self,
        method: Method,
        path: &str,
        headers: &[(&str, &str)],
        body: Bytes,
    ) -> Held {
        let stream = dial_loopback(self.address).await;
        let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
            .await
            .expect("a handshake");
        let connection = tokio::spawn(async move {
            let _ = connection.await;
        });
        let mut request = Request::builder()
            .method(method)
            .uri(path)
            .header(HOST, self.address.to_string());
        for &(name, value) in headers {
            request = request.header(name, value);
        }
        let request = request.body(Full::new(body)).expect("a request");
        let response = sender.send_request(request).await.expect("a response");
        Held {
            response,
            _connection: connection,
        }
    }

    /// Sends one request and reads the whole response.
    pub(super) async fn send(
        &self,
        method: Method,
        path: &str,
        headers: &[(&str, &str)],
        body: Bytes,
    ) -> Reply {
        let held = self.open(method, path, headers, body).await;
        let (parts, body) = held.response.into_parts();
        Reply {
            status: parts.status,
            headers: parts.headers,
            body: body.collect().await.expect("a whole body").to_bytes(),
        }
    }

    /// Go's `fetch`: a request without a body.
    pub(super) async fn fetch(&self, method: Method, path: &str) -> Reply {
        self.send(method, path, &[], Bytes::new()).await
    }

    /// Go's `do`: a `POST` carries `abc`, and `origin`, when given, is sent as the Origin.
    pub(super) async fn call(&self, method: Method, path: &str, origin: Option<&str>) -> Reply {
        let body = if method == Method::POST {
            Bytes::from_static(b"abc")
        } else {
            Bytes::new()
        };
        let headers: Vec<_> = origin
            .map(|origin| (ORIGIN.as_str(), origin))
            .into_iter()
            .collect();
        self.send(method, path, &headers, body).await
    }

    /// The metrics endpoint's text at `path`.
    pub(super) async fn scrape(&self, path: &str) -> String {
        let reply = self.fetch(Method::GET, path).await;
        assert_eq!(reply.status, StatusCode::OK, "scrape of {path}");
        reply.text()
    }
}

impl TestStack {
    /// Stops the server and returns its outcome.
    pub(super) async fn stop(mut self) -> Outcome {
        self.lifecycle.stop();
        let served = self.served.take().expect("a running server");
        tokio::time::timeout(Duration::from_secs(30), served)
            .await
            .expect("serve ends in time")
            .expect("serve did not panic")
    }
}

impl Drop for TestStack {
    fn drop(&mut self) {
        self.lifecycle.stop();
    }
}

/// Whether the exposition has a request counter line holding `labels`.
pub(super) fn has_request_series(exposition: &str, labels: &str) -> bool {
    exposition
        .lines()
        .any(|line| line.starts_with("bitgauge_http_requests_total{") && line.contains(labels))
}

/// The TCP peer of every request [`direct`] sends, `httptest`'s.
pub(super) const PEER: &str = "192.0.2.1:1234";

/// The global middleware around a test's own `router`, whose routes are recorded as the real
/// router records them and whose unknown paths get the plain 404; `meter`, when given,
/// observes the requests.
pub(super) fn chain(router: Router, config: &Config, meter: Option<Arc<Metrics>>) -> Stack {
    let router = router
        .route_layer(from_fn(record_route))
        .fallback(|| ready(not_found()));
    Stack::new(
        router,
        Deriver::new(&config.server.trusted_proxies),
        Classifier::new(config),
        meter.map(|meter| Observer::new(config, meter)),
    )
}

/// `request` through `stack` from [`PEER`], as the connection driver hands it over.
pub(super) async fn direct(stack: &Stack, mut request: Request<Body>) -> http::Response<Body> {
    request
        .extensions_mut()
        .insert(Peer(PEER.parse().expect("a peer")));
    let mut stack = stack.clone();
    let answer: Result<_, Infallible> = stack.call(request).await;
    answer.expect("an answer")
}

/// A `GET` of `target` through `stack`, its body read.
pub(super) async fn direct_get(stack: &Stack, target: &str) -> Reply {
    let request = Request::get(target).body(Body::empty()).expect("a request");
    let (parts, body) = direct(stack, request).await.into_parts();
    Reply {
        status: parts.status,
        headers: parts.headers,
        body: body.collect().await.expect("a whole body").to_bytes(),
    }
}

/// A handler that panics with a `&str` payload.
pub(super) async fn boom() -> StatusCode {
    panic!("boom");
}
