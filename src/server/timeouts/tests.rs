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

//! The deadline states on tokio's paused clock, over an in-memory pipe.

use std::time::Duration;

use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _, DuplexStream};
use tokio::time::{Instant, timeout};

use super::*;

const TIMEOUTS: Timeouts = Timeouts {
    head: Duration::from_secs(10),
    idle: Duration::from_secs(120),
    write_stall: Duration::from_secs(30),
    shutdown_drain: Duration::from_millis(500),
};

const REQUEST: &[u8] = b"GET / HTTP/1.1\r\nHost: x\r\n\r\n";

/// A connection's I/O on one end of a pipe, the client on the other.
fn connection() -> (ConnState, ConnIo<DuplexStream>, DuplexStream) {
    let (server, client) = tokio::io::duplex(64 * 1024);
    let state = ConnState::new(TIMEOUTS);
    (state.clone(), ConnIo::new(server, state), client)
}

/// Whether a read is still waiting after `wait`, or how it ended.
async fn read_within(io: &mut ConnIo<DuplexStream>, wait: Duration) -> Option<io::Result<usize>> {
    let mut buf = [0_u8; 256];
    timeout(wait, io.read(&mut buf)).await.ok()
}

fn is_timeout(result: Option<io::Result<usize>>) -> bool {
    matches!(result, Some(Err(error)) if error.kind() == io::ErrorKind::TimedOut)
}

#[tokio::test(start_paused = true)]
async fn initial_head_is_due_head_timeout_after_accept() {
    let (state, mut io, _client) = connection();
    let accepted = Instant::now();
    assert_eq!(state.phase(), Phase::Head);
    assert_eq!(state.read_deadline(), Some(accepted + TIMEOUTS.head));
    assert!(
        read_within(
            &mut io,
            TIMEOUTS.head.saturating_sub(Duration::from_millis(1))
        )
        .await
        .is_none()
    );
    assert!(is_timeout(
        read_within(&mut io, Duration::from_secs(1)).await
    ));
    assert_eq!(Instant::now() - accepted, TIMEOUTS.head);
}

#[tokio::test(start_paused = true)]
async fn body_has_no_connection_deadline() {
    let (state, mut io, _client) = connection();
    state.on_request_head();
    assert_eq!(state.phase(), Phase::Request);
    assert_eq!(state.read_deadline(), None);
    assert!(read_within(&mut io, TIMEOUTS.idle * 3).await.is_none());
}

#[tokio::test(start_paused = true)]
async fn keep_alive_idle_waits_idle_timeout_for_the_first_byte() {
    let (state, mut io, mut client) = connection();
    client.write_all(REQUEST).await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    state.on_request_head();
    state.on_response_done();
    let done = Instant::now();
    assert_eq!(state.phase(), Phase::Idle);
    assert_eq!(state.read_deadline(), Some(done + TIMEOUTS.idle));
    assert!(
        read_within(
            &mut io,
            TIMEOUTS.idle.saturating_sub(Duration::from_millis(1))
        )
        .await
        .is_none()
    );
    assert!(is_timeout(
        read_within(&mut io, Duration::from_secs(1)).await
    ));
    assert_eq!(Instant::now() - done, TIMEOUTS.idle);
}

#[tokio::test(start_paused = true)]
async fn keep_alive_head_is_due_head_timeout_after_its_first_byte() {
    let (state, mut io, mut client) = connection();
    client.write_all(REQUEST).await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    state.on_request_head();
    state.on_response_done();
    tokio::time::advance(Duration::from_secs(60)).await;
    client.write_all(b"G").await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(1))
    ));
    let first_byte = Instant::now();
    assert_eq!(state.phase(), Phase::Head);
    assert_eq!(state.read_deadline(), Some(first_byte + TIMEOUTS.head));
    assert!(is_timeout(read_within(&mut io, TIMEOUTS.head * 2).await));
    assert_eq!(Instant::now() - first_byte, TIMEOUTS.head);
}

#[tokio::test(start_paused = true)]
async fn pipelined_head_skips_the_idle_phase() {
    let (state, mut io, mut client) = connection();
    client.write_all(REQUEST).await.unwrap();
    client.write_all(b"GET /next HTTP/1.1\r\nHo").await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    state.on_request_head();
    tokio::time::advance(Duration::from_secs(5)).await;
    state.on_response_done();
    let done = Instant::now();
    assert_eq!(state.phase(), Phase::Head);
    assert_eq!(state.read_deadline(), Some(done + TIMEOUTS.head));
}

#[tokio::test(start_paused = true)]
async fn upgraded_connection_has_no_deadline_and_stays_upgraded() {
    let (state, mut io, mut client) = connection();
    state.on_request_head();
    state.on_upgraded();
    state.on_response_done();
    assert_eq!(state.phase(), Phase::Upgraded);
    assert_eq!(state.read_deadline(), None);
    client.write_all(REQUEST).await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    assert_eq!(state.phase(), Phase::Upgraded);
    assert!(read_within(&mut io, TIMEOUTS.idle * 3).await.is_none());
}

/// A read waiting with no deadline arms the idle deadline as soon as the response is done.
#[tokio::test(start_paused = true)]
async fn a_waiting_read_picks_up_a_new_deadline() {
    let (state, mut io, _client) = connection();
    state.on_request_head();
    let reader = tokio::spawn(async move {
        let mut buf = [0_u8; 16];
        io.read(&mut buf).await
    });
    tokio::time::advance(Duration::from_secs(300)).await;
    assert!(!reader.is_finished());
    state.on_response_done();
    let done = Instant::now();
    let result = reader.await.unwrap();
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
    assert_eq!(Instant::now() - done, TIMEOUTS.idle);
}

/// Fills the pipe until a write would wait.
async fn fill(io: &mut ConnIo<DuplexStream>) {
    let chunk = [0_u8; 4096];
    while timeout(Duration::ZERO, io.write(&chunk)).await.is_ok() {}
}

#[tokio::test(start_paused = true)]
async fn a_write_without_progress_fails_after_the_stall_timeout() {
    let (state, mut io, _client) = connection();
    state.on_request_head();
    fill(&mut io).await;
    let stalled = Instant::now();
    let result = io.write(b"more").await;
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
    assert_eq!(Instant::now() - stalled, TIMEOUTS.write_stall);
}

/// Progress restarts the stall timeout: a slow reader is never cut, only a stalled one.
#[tokio::test(start_paused = true)]
async fn write_progress_restarts_the_stall_timeout() {
    let (state, mut io, mut client) = connection();
    state.on_request_head();
    fill(&mut io).await;
    let writer = tokio::spawn(async move {
        for _ in 0..4 {
            io.write_all(&[1_u8; 4096]).await?;
        }
        io::Result::Ok(io)
    });
    let mut buf = [0_u8; 4096];
    for _ in 0..4 {
        tokio::time::advance(TIMEOUTS.write_stall.saturating_sub(Duration::from_secs(1))).await;
        client.read_exact(&mut buf).await.unwrap();
    }
    tokio::time::advance(TIMEOUTS.write_stall.saturating_sub(Duration::from_secs(1))).await;
    assert!(writer.await.unwrap().is_ok());
}

/// Shutdown reads and discards what the client still sends, then ends when it closes.
#[tokio::test(start_paused = true)]
async fn shutdown_drains_until_the_client_closes() {
    let (_state, mut io, mut client) = connection();
    client.write_all(&[7_u8; 1000]).await.unwrap();
    let closer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        drop(client);
    });
    let started = Instant::now();
    io.shutdown().await.unwrap();
    closer.await.unwrap();
    assert_eq!(Instant::now() - started, Duration::from_millis(100));
}

/// A client that keeps the connection open is drained for the drain timeout only.
#[tokio::test(start_paused = true)]
async fn shutdown_drains_at_most_the_drain_timeout() {
    let (_state, mut io, mut client) = connection();
    client.write_all(&[7_u8; 1000]).await.unwrap();
    let started = Instant::now();
    io.shutdown().await.unwrap();
    assert_eq!(Instant::now() - started, TIMEOUTS.shutdown_drain);
}

/// Busy while a head has started arriving or a response is not done; shutdown waits for that.
#[tokio::test(start_paused = true)]
async fn busy_while_a_request_is_in_flight() {
    let (state, mut io, mut client) = connection();
    assert!(
        !state.is_busy(),
        "a fresh connection that read nothing is idle"
    );
    client.write_all(b"GET / HT").await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    assert!(state.is_busy(), "a head has started arriving");
    state.on_request_head();
    assert!(state.is_busy(), "the response is not done");
    let waiter = tokio::spawn({
        let state = state.clone();
        async move { state.wait_until_idle().await }
    });
    tokio::task::yield_now().await;
    assert!(!waiter.is_finished());
    state.on_response_done();
    waiter.await.unwrap();
    assert!(!state.is_busy());
}

/// A pipelining client keeps a next request read, so the wait also ends once the response that
/// was in flight when it began is done.
#[tokio::test(start_paused = true)]
async fn the_wait_ends_after_the_response_in_flight_even_when_pipelined() {
    let (state, mut io, mut client) = connection();
    client.write_all(REQUEST).await.unwrap();
    client.write_all(REQUEST).await.unwrap();
    assert!(matches!(
        read_within(&mut io, Duration::ZERO).await,
        Some(Ok(_))
    ));
    state.on_request_head();
    let waiter = tokio::spawn({
        let state = state.clone();
        async move { state.wait_until_idle().await }
    });
    tokio::task::yield_now().await;
    assert!(!waiter.is_finished());
    state.on_response_done();
    assert!(state.is_busy(), "the pipelined request is read");
    waiter.await.unwrap();
}
