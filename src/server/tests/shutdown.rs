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

//! The shutdown of the whole stack (Go's `shutdown_test.go` and the settings of
//! `TestNewServerSettings`); the deadline and grace cases run on the echo service in
//! `src/server/tests.rs`.

use std::os::fd::AsRawFd as _;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt as _, StreamExt as _};
use tokio::net::TcpListener;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

use super::stack::{TestStack, test_config};
use crate::server::conn::{self, MAX_HEADER_SIZE, MAX_HEADERS, Outcome};
use crate::server::timeouts::Timeouts;
use crate::server::{GRACE_EXCEEDED, exit_code};
use crate::test_support::dial_loopback;
use tracing_setup::testing::Capture;

const FAILSAFE: Duration = Duration::from_secs(30);

/// Go: `TestNewServerSettings`: a 10 s head, a 120 s idle and a 16 KiB head, and no deadline on a
/// request's body or its response beyond the write stall (`body_has_no_connection_deadline`).
#[test]
fn server_settings() {
    assert_eq!(Timeouts::SERVER.head, Duration::from_secs(10));
    assert_eq!(Timeouts::SERVER.idle, Duration::from_secs(120));
    assert_eq!(Timeouts::SERVER.write_stall, Duration::from_secs(30));
    assert_eq!(MAX_HEADER_SIZE, 16 * 1024);
    assert_eq!(MAX_HEADERS, 100);
    assert!(!GRACE_EXCEEDED.is_empty());
}

/// Go: `TestRunClosesWebSocketsWithGoingAway`, through the real WebSocket handler: `stop` closes
/// an open socket with 1001, the server stops cleanly, and the listener is gone.
#[tokio::test]
async fn stop_closes_websockets_with_going_away() {
    let stack = TestStack::start(&test_config(), None).await;
    let address = stack.address;
    let connection = dial_loopback(address).await;
    let (mut socket, _) =
        tokio_tungstenite::client_async(format!("ws://{address}/api/v1/ws"), connection)
            .await
            .expect("a handshake");
    // A round trip proves the echo is running before shutdown starts.
    socket
        .send(Message::text(r#"{"type":"ping","seq":1,"t":1}"#))
        .await
        .expect("a send");
    socket.next().await.expect("a message").expect("a frame");
    // The server waits for the client's close reply, which reading the close frame sends.
    let stopped = tokio::spawn(stack.stop());
    let frame = timeout(FAILSAFE, socket.next())
        .await
        .expect("a close in time");
    let Some(Ok(Message::Close(Some(close)))) = frame else {
        panic!("not a close frame: {frame:?}");
    };
    assert_eq!(close.code, CloseCode::Away);
    // Polling on sends the reply tungstenite queued, then sees the end of the socket.
    let end = timeout(FAILSAFE, socket.next())
        .await
        .expect("the end in time");
    assert!(end.is_none(), "{end:?}");
    let outcome = stopped.await.expect("the stop did not panic");
    assert!(matches!(outcome, Outcome::Stopped), "{outcome:?}");
    assert_eq!(exit_code(&outcome), std::process::ExitCode::SUCCESS);
    // The listener is gone: its address can be bound again.
    assert!(
        TcpListener::bind(address).await.is_ok(),
        "the server still holds its listener"
    );
}

/// Go: `TestRunReportsAListenerFailure`: an accept that fails for good ends the server with the
/// listener's error, which the outcome's log line names after `serve:`, and exit status 1.
#[tokio::test(flavor = "current_thread")]
async fn a_listener_failure_is_reported() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("a listener");
    // A listening socket shut down fails every accept with EINVAL, which is not transient.
    nix::sys::socket::shutdown(listener.as_raw_fd(), nix::sys::socket::Shutdown::Both)
        .expect("a shutdown");
    let lifecycle = conn::Lifecycle::new();
    let outcome = timeout(
        FAILSAFE,
        conn::serve(
            listener,
            super::echo::EchoService::new(lifecycle.clone(), Arc::default(), FAILSAFE),
            &lifecycle,
            Timeouts::SERVER,
            Duration::from_secs(1),
        ),
    )
    .await
    .expect("serve ends");
    assert!(matches!(outcome, Outcome::ListenerFailed(_)), "{outcome:?}");
    assert_eq!(exit_code(&outcome), std::process::ExitCode::FAILURE);
    let logs = Capture::default();
    let dispatch = crate::logger::to_writer(logs.clone(), "json", "info").expect("a logger");
    tracing::dispatcher::with_default(&dispatch, || super::super::log_outcome(&outcome));
    let text = logs.text();
    assert!(text.contains("serve: "), "{text}");
}
