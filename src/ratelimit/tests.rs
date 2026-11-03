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

//! The Go limiter tests, ported on tokio's paused clock; each names the Go test it maps to.
//! Nothing here sleeps: time moves only by `tokio::time::advance`.

use std::net::IpAddr;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::Duration;

use tokio::time::advance;

use super::*;
use crate::clock::TokioClock;

const DEFAULTS: Options = Options {
    max_streams: 8,
    requests_per_minute: 1200,
    tracked_clients: 4096,
    max_flows: 32,
};

fn address(text: &str) -> IpAddr {
    text.parse().expect("an address")
}

fn limiter(options: Options) -> Limiter {
    Limiter::new(options, TokioClock)
}

fn options(max_streams: u32, requests_per_minute: u32, tracked_clients: usize) -> Options {
    Options {
        max_streams,
        requests_per_minute,
        tracked_clients,
        max_flows: 1,
    }
}

fn refused(result: Result<Permit, LimitError>, limit: Limit) -> LimitError {
    match result {
        Ok(_permit) => panic!("admitted, want a {limit:?} refusal"),
        Err(error) => {
            assert_eq!(error.limit(), limit, "{error}");
            error
        }
    }
}

fn assert_refused(result: Result<Permit, LimitError>, limit: Limit) {
    let _refusal = refused(result, limit);
}

fn is_tracked(limiter: &Limiter, text: &str) -> bool {
    limiter.inner.lock().entries.contains_key(&address(text))
}

/// Go: `TestConcurrencyLimitAndRelease`. Go's second call of one release must not free a second
/// slot; a permit is dropped once, so that call has no Rust spelling.
#[tokio::test(start_paused = true)]
async fn concurrency_limit_and_release() {
    let limiter = limiter(DEFAULTS);
    let client = address("192.168.1.42");
    let mut permits: Vec<Permit> = (0..DEFAULTS.max_streams)
        .map(|_| limiter.acquire_stream(client).expect("within the limit"))
        .collect();

    let refusal = refused(limiter.acquire_stream(client), Limit::Streams);
    assert_eq!(refusal.retry_after(), 1);
    assert_eq!(refusal.code(), CODE_TOO_MANY_STREAMS);
    assert_eq!(
        refusal.to_string(),
        "too many concurrent throughput requests (retry after 1 s)"
    );

    // Another client is not affected.
    let _other = limiter
        .acquire_stream(address("192.168.1.43"))
        .expect("another client");

    drop(permits.remove(0));
    let _again = limiter.acquire_stream(client).expect("the slot was freed");
    assert_refused(limiter.acquire_stream(client), Limit::Streams);
}

/// Go: `TestReleaseInDeferOnAbort`: a panic mid-transfer, and here also a cancelled task, the
/// way a client that goes away ends a transfer under tokio.
#[tokio::test(start_paused = true)]
async fn release_on_abort() {
    let limiter = limiter(Options {
        max_flows: 1,
        ..options(1, 1200, 16)
    });
    let client = address("10.0.0.1");

    let panicked = catch_unwind(AssertUnwindSafe(|| {
        let _permit = limiter.acquire_stream(client).expect("a slot");
        panic!("client went away mid-transfer");
    }));
    assert!(panicked.is_err());
    drop(
        limiter
            .acquire_stream(client)
            .expect("the panic kept its slot"),
    );

    let held = limiter.clone();
    let transfer = tokio::spawn(async move {
        let _permit = held.acquire_stream(client).expect("a slot");
        std::future::pending::<()>().await;
    });
    tokio::task::yield_now().await;
    assert_refused(limiter.acquire_stream(client), Limit::Streams);
    transfer.abort();
    assert!(transfer.await.is_err_and(|error| error.is_cancelled()));
    drop(
        limiter
            .acquire_stream(client)
            .expect("the cancelled task kept its slot"),
    );
}

/// Go: `TestTokenBucketAtTheDefaultRate`
#[tokio::test(start_paused = true)]
async fn token_bucket_at_the_default_rate() {
    let limiter = limiter(DEFAULTS);
    let client = address("192.168.1.42");

    // Burst max(60, 1200 / 4) = 300 new requests at once.
    for index in 0..300 {
        let permit = limiter.acquire_stream(client);
        assert!(permit.is_ok(), "request {} of the burst refused", index + 1);
    }

    // 1200 per minute is 20 tokens per second: the next one is 50 ms away, rounded up to 1 s.
    let refusal = refused(limiter.acquire_stream(client), Limit::Rate);
    assert_eq!(refusal.retry_after(), 1);
    assert_eq!(refusal.code(), CODE_RATE_LIMITED);

    advance(Duration::from_millis(49)).await;
    assert_refused(limiter.acquire_stream(client), Limit::Rate);
    advance(Duration::from_millis(1)).await;
    drop(limiter.acquire_stream(client).expect("a token after 50 ms"));

    // A full second refills 20 tokens and no more.
    advance(Duration::from_secs(1)).await;
    for index in 0..20 {
        let permit = limiter.acquire_stream(client);
        assert!(permit.is_ok(), "token {} of 20 refused", index + 1);
    }
    assert_refused(limiter.acquire_stream(client), Limit::Rate);
}

/// Go: `TestTokenBucketBurstNeverExceeded`
#[tokio::test(start_paused = true)]
async fn token_bucket_burst_never_exceeded() {
    let limiter = limiter(DEFAULTS);
    let client = address("192.168.1.42");
    advance(Duration::from_secs(3600)).await;
    let accepted = std::iter::from_fn(|| limiter.acquire_stream(client).ok())
        .take(1000)
        .count();
    assert_eq!(accepted, 300, "after an hour idle, want the 300 burst");
}

/// Go: `TestTokenBucketAtCustomRates`
#[tokio::test(start_paused = true)]
async fn token_bucket_at_custom_rates() {
    for (name, requests_per_minute, burst, first_retry_after) in [
        // The minimum rate: 1 token per second, burst max(60, 15) = 60.
        ("60 per minute", 60, 60, 1),
        // 100 per minute: burst max(60, 25) = 60, 0.6 s to the next token, rounded up to 1 s.
        ("100 per minute", 100, 60, 1),
        // The maximum rate: burst 25000.
        ("100000 per minute", 100_000, 25_000, 1),
        // Below the validated range the limiter still rounds up: 30 per minute is 2 s a token.
        ("30 per minute", 30, 60, 2),
        // 20 per minute: 3 s a token.
        ("20 per minute", 20, 60, 3),
    ] {
        let limiter = limiter(options(8, requests_per_minute, 16));
        let client = address("10.0.0.1");
        for index in 0..burst {
            let permit = limiter.acquire_stream(client);
            assert!(permit.is_ok(), "{name}: request {} refused", index + 1);
        }
        let refusal = refused(limiter.acquire_stream(client), Limit::Rate);
        assert_eq!(refusal.retry_after(), first_retry_after, "{name}");

        // Retry-After is the time to the next token: halfway there it halves, rounded up.
        if first_retry_after > 1 {
            advance(Duration::from_secs(u64::from(first_retry_after)) / 2).await;
            let refusal = refused(limiter.acquire_stream(client), Limit::Rate);
            assert_eq!(
                refusal.retry_after(),
                first_retry_after.div_ceil(2),
                "{name} halfway"
            );
        }
    }
}

/// Go: `TestRetryAfterRoundsUpAndIsAtLeastOne`
#[test]
fn retry_after_rounds_up_and_is_at_least_one() {
    let limiter = limiter(Options {
        requests_per_minute: 60,
        ..Options::default()
    });
    for (tokens, want) in [(0.0, 1), (0.999, 1), (-0.5, 2), (-1.0, 2), (-1.0001, 3)] {
        assert_eq!(
            limiter.inner.until_next_token(tokens),
            want,
            "{tokens} tokens at 1/s"
        );
    }
    let never = Limiter::new(Options::default(), TokioClock);
    assert_eq!(never.inner.until_next_token(0.0), RETRY_AFTER_NEVER);
}

/// Go: `TestRefusedStreamSpendsNoToken`
#[tokio::test(start_paused = true)]
async fn refused_stream_spends_no_token() {
    let limiter = limiter(options(1, 60, 16));
    let client = address("10.0.0.1");
    let permit = limiter.acquire_stream(client).expect("a slot");
    for _ in 0..100 {
        assert_refused(limiter.acquire_stream(client), Limit::Streams);
    }
    drop(permit);

    // 60 burst, one spent: 59 left despite the 100 refusals.
    for index in 0..59 {
        let permit = limiter.acquire_stream(client);
        assert!(
            permit.is_ok(),
            "token {} refused: refusals spent tokens",
            index + 1
        );
    }
}

/// Go: `TestWebSocketsAndFlows`
#[tokio::test(start_paused = true)]
async fn websockets_and_flows() {
    let limiter = limiter(Options {
        max_flows: 2,
        ..options(8, 1200, 16)
    });
    let client = address("10.0.0.1");
    let mut sockets: Vec<Permit> = (0..WEBSOCKETS_PER_CLIENT)
        .map(|_| limiter.acquire_websocket(client).expect("a WebSocket"))
        .collect();
    let refusal = refused(limiter.acquire_websocket(client), Limit::WebSockets);
    assert_eq!(refusal.retry_after(), 1);
    assert_eq!(refusal.code(), CODE_TOO_MANY_STREAMS);

    // WebSockets and streams are separate counters.
    drop(
        limiter
            .acquire_stream(client)
            .expect("a stream despite the WebSockets"),
    );

    drop(sockets.remove(2));
    let _socket = limiter
        .acquire_websocket(client)
        .expect("closing a WebSocket frees its slot");

    let _flows: Vec<Permit> = (0..2)
        .map(|_| limiter.acquire_flow(client).expect("a flow"))
        .collect();
    let refusal = refused(limiter.acquire_flow(client), Limit::Flows);
    assert_eq!(refusal.code(), CODE_TOO_MANY_STREAMS);
}

fn drain(limiter: &Limiter, client: IpAddr) {
    for _ in 0..1000 {
        if let Err(error) = limiter.acquire_stream(client) {
            assert_eq!(error.limit(), Limit::Rate);
            return;
        }
    }
    panic!("the bucket never ran out");
}

/// Go: `TestLRUEvictsOnlyIdleEntries`
#[tokio::test(start_paused = true)]
async fn lru_evicts_only_idle_entries() {
    let limiter = limiter(options(8, 60, 3));
    let active = limiter.acquire_stream(address("10.0.0.1")).expect("a slot");
    for idle in ["10.0.0.2", "10.0.0.3"] {
        advance(Duration::from_secs(1)).await;
        drop(limiter.acquire_stream(address(idle)).expect("a slot"));
    }

    // Spend 10.0.0.2's tokens down, so that an eviction would show as a fresh burst. Seeing it
    // also makes 10.0.0.3 the least recently seen idle entry.
    drain(&limiter, address("10.0.0.2"));

    // The table is full: the least recently seen idle entry goes, not the older active one.
    drop(
        limiter
            .acquire_stream(address("10.0.0.4"))
            .expect("a new client with an idle entry to evict"),
    );
    assert_eq!(limiter.tracked_clients(), 3);
    assert!(
        !is_tracked(&limiter, "10.0.0.3"),
        "the eviction did not pick the least recently seen idle entry"
    );
    assert!(
        is_tracked(&limiter, "10.0.0.1"),
        "the active entry was evicted"
    );

    // 10.0.0.2 kept its spent bucket: it was not evicted and recreated.
    assert_refused(limiter.acquire_stream(address("10.0.0.2")), Limit::Rate);
    drop(active);
}

/// The idle list stays in least-recently-seen order through moves from its middle and its ends
/// (no Go test: Go's `container/list` was the standard library's).
#[tokio::test(start_paused = true)]
async fn idle_list_keeps_its_order() {
    let limiter = limiter(options(8, 1200, 4));
    for client in ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"] {
        drop(limiter.acquire_stream(address(client)).expect("a slot"));
    }
    // Seen again: the middle, then the oldest, then the newest.
    for client in ["10.0.0.2", "10.0.0.1", "10.0.0.4"] {
        drop(limiter.acquire_stream(address(client)).expect("a slot"));
    }
    // Least recently seen first: 10.0.0.3, 10.0.0.2, 10.0.0.1, 10.0.0.4.
    let mut evicted = Vec::new();
    for (index, newcomer) in ["10.0.1.1", "10.0.1.2", "10.0.1.3"].into_iter().enumerate() {
        drop(limiter.acquire_stream(address(newcomer)).expect("a slot"));
        for old in ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"] {
            if !is_tracked(&limiter, old) && !evicted.contains(&old) {
                evicted.push(old);
            }
        }
        assert_eq!(evicted.len(), index + 1, "one eviction per newcomer");
    }
    assert_eq!(evicted, ["10.0.0.3", "10.0.0.2", "10.0.0.1"]);
    assert!(is_tracked(&limiter, "10.0.0.4"));
}

/// Go: `TestTableFullWhenEveryEntryIsActive`
#[tokio::test(start_paused = true)]
async fn table_full_when_every_entry_is_active() {
    let limiter = limiter(options(8, 1200, 2));
    let first = limiter.acquire_stream(address("10.0.0.1")).expect("a slot");
    let _socket = limiter
        .acquire_websocket(address("10.0.0.2"))
        .expect("a WebSocket");

    let refusal = refused(
        limiter.acquire_stream(address("10.0.0.3")),
        Limit::TableFull,
    );
    assert_eq!(refusal.retry_after(), 1);
    assert_eq!(refusal.code(), CODE_TABLE_FULL);
    assert_refused(limiter.acquire_flow(address("10.0.0.4")), Limit::TableFull);
    advance(Duration::from_secs(60)).await;
    assert_refused(
        limiter.acquire_websocket(address("10.0.0.5")),
        Limit::TableFull,
    );

    // Known clients keep working while the table is full.
    let second = limiter
        .acquire_stream(address("10.0.0.1"))
        .expect("a tracked client");
    assert_eq!(limiter.tracked_clients(), 2, "the table grew");

    // While 10.0.0.1 has any stream left it is not evictable.
    drop(first);
    assert_refused(
        limiter.acquire_stream(address("10.0.0.3")),
        Limit::TableFull,
    );

    // Once it is idle, a new client takes its place.
    drop(second);
    drop(
        limiter
            .acquire_stream(address("10.0.0.3"))
            .expect("a new client with an idle entry to evict"),
    );
}

/// Go: `TestKeyIsTheFullAddress`
#[tokio::test(start_paused = true)]
async fn key_is_the_full_address() {
    let limiter = limiter(options(1, 1200, 16));
    let _first = limiter
        .acquire_stream(address("2001:db8::1"))
        .expect("a slot");
    // A neighbor in the same /64 has its own budget.
    let _neighbor = limiter
        .acquire_stream(address("2001:db8::2"))
        .expect("an address in the same /64 shared the budget");
}

/// Go: `TestConcurrentUse`, on threads; the clock is not paused and does not matter.
#[test]
fn concurrent_use() {
    let limiter = limiter(Options {
        max_flows: 4,
        ..options(4, 100_000, 8)
    });
    let clients = ["10.0.0.0", "10.0.0.1", "10.0.0.2", "10.0.0.3"].map(address);
    std::thread::scope(|scope| {
        for worker in 0..16 {
            let limiter = &limiter;
            let client = clients[worker % clients.len()];
            scope.spawn(move || {
                for _ in 0..200 {
                    drop(limiter.acquire_stream(client));
                }
            });
        }
    });
    let table = limiter.inner.lock();
    for (client, entry) in &table.entries {
        assert!(
            entry.streams == 0 && entry.idle.is_some(),
            "entry {client} left with {} streams, idle {}",
            entry.streams,
            entry.idle.is_some()
        );
    }
}
