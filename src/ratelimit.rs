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

//! The bounded per-client limiter of configuration-security.md section 5: concurrent throughput
//! requests, a token bucket for new ones, WebSocket connections and networkQuality flows, per
//! derived client IP, in a table of at most `limits.tracked_clients` entries.

use std::collections::HashMap;
use std::error::Error;
use std::fmt;
use std::net::IpAddr;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use tokio::time::Instant;

use crate::clock::Clock;

/// The fixed WebSocket limit per client IP (wire-protocol.md section 9).
pub const WEBSOCKETS_PER_CLIENT: u32 = 4;

/// The envelope code of a client out of tokens (wire-protocol.md section 7).
pub const CODE_RATE_LIMITED: &str = "rate_limited";
/// The envelope code of every concurrency limit: streams, WebSocket connections and flows
/// (wire-protocol.md section 9).
pub const CODE_TOO_MANY_STREAMS: &str = "too_many_streams";
/// The envelope code of a new client at a table full of active ones.
pub const CODE_TABLE_FULL: &str = "table_full";

/// The smallest token-bucket burst: `max(60, requests_per_minute / 4)`.
const MIN_BURST: f64 = 60.0;
/// Turns `requests_per_minute` into the burst.
const BURST_DIVISOR: f64 = 4.0;
const SECONDS_PER_MINUTE: f64 = 60.0;
/// The `Retry-After` of the concurrency limits and of a full table.
const CONCURRENCY_RETRY_AFTER: u32 = 1;
/// The `Retry-After` of a bucket that never refills, Go's `math.MaxInt32`.
const RETRY_AFTER_NEVER: u32 = i32::MAX.unsigned_abs();

/// Which limit refused an acquisition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Limit {
    /// The client is at `limits.max_streams_per_client` concurrent throughput requests.
    Streams,
    /// The client is out of tokens for new throughput requests.
    Rate,
    /// The client is at [`WEBSOCKETS_PER_CLIENT`] open WebSocket connections.
    WebSockets,
    /// The client is at `compat.networkquality.max_flows_per_client` active flows.
    Flows,
    /// A new client arrived while every tracked client has active work.
    TableFull,
}

impl Limit {
    /// The error envelope code of the 429.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::Streams | Self::WebSockets | Self::Flows => CODE_TOO_MANY_STREAMS,
            Self::Rate => CODE_RATE_LIMITED,
            Self::TableFull => CODE_TABLE_FULL,
        }
    }

    const fn message(self) -> &'static str {
        match self {
            Self::Streams => "too many concurrent throughput requests",
            Self::Rate => "too many new throughput requests",
            Self::WebSockets => "too many WebSockets",
            Self::Flows => "too many networkQuality flows",
            Self::TableFull => "rate-limit table full of active clients",
        }
    }
}

/// A refused acquisition, with what its 429 needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct LimitError {
    limit: Limit,
    retry_after: u32,
}

impl LimitError {
    const fn concurrency(limit: Limit) -> Self {
        Self {
            limit,
            retry_after: CONCURRENCY_RETRY_AFTER,
        }
    }

    /// The limit that refused.
    #[must_use]
    pub const fn limit(&self) -> Limit {
        self.limit
    }

    /// The `Retry-After` value in whole seconds, rounded up and at least 1.
    #[must_use]
    pub const fn retry_after(&self) -> u32 {
        self.retry_after
    }

    /// The error envelope code of the 429.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        self.limit.code()
    }
}

impl fmt::Display for LimitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{} (retry after {} s)",
            self.limit.message(),
            self.retry_after
        )
    }
}

impl Error for LimitError {}

/// The configured limits.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Options {
    /// `limits.max_streams_per_client`.
    pub max_streams: u32,
    /// `limits.requests_per_minute`.
    pub requests_per_minute: u32,
    /// `limits.tracked_clients`, the bound on the table.
    pub tracked_clients: usize,
    /// `compat.networkquality.max_flows_per_client`.
    pub max_flows: u32,
}

/// What an acquisition holds, and its permit gives back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Slot {
    Stream,
    WebSocket,
    Flow,
}

/// The neighbors of an idle entry on the idle list, by address.
#[derive(Debug, Clone, Copy, Default)]
struct Links {
    newer: Option<IpAddr>,
    older: Option<IpAddr>,
}

/// One client. It is on the idle list exactly when it has no active request, WebSocket or flow,
/// which is what makes it evictable.
#[derive(Debug)]
struct Entry {
    streams: u32,
    websockets: u32,
    flows: u32,
    tokens: f64,
    refilled_at: Instant,
    idle: Option<Links>,
}

impl Entry {
    fn active(&self) -> bool {
        self.streams > 0 || self.websockets > 0 || self.flows > 0
    }

    fn count_mut(&mut self, slot: Slot) -> &mut u32 {
        match slot {
            Slot::Stream => &mut self.streams,
            Slot::WebSocket => &mut self.websockets,
            Slot::Flow => &mut self.flows,
        }
    }
}

/// The map and the idle list. The idle list runs from the most recently seen idle entry to the
/// least recently seen one, linked through the map by address, so that moving or evicting an
/// entry never scans and every operation stays constant time.
#[derive(Debug, Default)]
struct Table {
    entries: HashMap<IpAddr, Entry>,
    newest_idle: Option<IpAddr>,
    oldest_idle: Option<IpAddr>,
}

impl Table {
    fn links_mut(&mut self, address: IpAddr) -> Option<&mut Links> {
        self.entries
            .get_mut(&address)
            .and_then(|entry| entry.idle.as_mut())
    }

    /// Takes an entry off the idle list, if it is on it.
    fn unlink(&mut self, address: IpAddr) {
        let Some(links) = self
            .entries
            .get_mut(&address)
            .and_then(|entry| entry.idle.take())
        else {
            return;
        };
        match links.newer.and_then(|newer| self.links_mut(newer)) {
            Some(newer) => newer.older = links.older,
            None => self.newest_idle = links.older,
        }
        match links.older.and_then(|older| self.links_mut(older)) {
            Some(older) => older.newer = links.newer,
            None => self.oldest_idle = links.newer,
        }
    }

    /// Puts an entry at the most recently seen end of the idle list.
    fn push_newest(&mut self, address: IpAddr) {
        let older = self.newest_idle;
        match older.and_then(|older| self.links_mut(older)) {
            Some(links) => links.newer = Some(address),
            None => self.oldest_idle = Some(address),
        }
        if let Some(entry) = self.entries.get_mut(&address) {
            entry.idle = Some(Links { newer: None, older });
        }
        self.newest_idle = Some(address);
    }

    /// Records that a client was just seen: an idle one moves to the most recently seen end of
    /// the idle list, an active one leaves it.
    fn settle(&mut self, address: IpAddr) {
        self.unlink(address);
        if self
            .entries
            .get(&address)
            .is_some_and(|entry| !entry.active())
        {
            self.push_newest(address);
        }
    }
}

#[derive(Debug)]
struct Inner {
    clock: Box<dyn Clock>,
    options: Options,
    refill_per_second: f64,
    burst: f64,
    table: Mutex<Table>,
}

impl Inner {
    fn lock(&self) -> MutexGuard<'_, Table> {
        // Every change under the lock is a few counter and link updates that cannot panic, so a
        // poisoned lock still guards a consistent table; and a permit's drop must not panic.
        self.table.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The client's entry, created with a full bucket. A new client at a full table takes the
    /// place of the least recently seen idle entry; with none idle it is refused, because an
    /// active entry's counters must never be lost.
    fn lookup<'table>(
        &self,
        table: &'table mut Table,
        address: IpAddr,
        now: Instant,
    ) -> Result<&'table mut Entry, LimitError> {
        if !table.entries.contains_key(&address)
            && table.entries.len() >= self.options.tracked_clients
        {
            let Some(oldest) = table.oldest_idle else {
                return Err(LimitError::concurrency(Limit::TableFull));
            };
            table.unlink(oldest);
            table.entries.remove(&oldest);
        }
        Ok(table.entries.entry(address).or_insert_with(|| Entry {
            streams: 0,
            websockets: 0,
            flows: 0,
            tokens: self.burst,
            refilled_at: now,
            idle: None,
        }))
    }

    /// Takes the slot for an entry, or says which limit refuses it. Only a stream spends a
    /// token: the bucket counts throughput requests, and a refused stream spends none.
    fn admit(&self, entry: &mut Entry, slot: Slot, now: Instant) -> Result<(), LimitError> {
        let (count, limit, max) = match slot {
            Slot::Stream => (entry.streams, Limit::Streams, self.options.max_streams),
            Slot::WebSocket => (entry.websockets, Limit::WebSockets, WEBSOCKETS_PER_CLIENT),
            Slot::Flow => (entry.flows, Limit::Flows, self.options.max_flows),
        };
        if count >= max {
            return Err(LimitError::concurrency(limit));
        }
        if slot == Slot::Stream {
            self.refill(entry, now);
            if entry.tokens < 1.0 {
                return Err(LimitError {
                    limit: Limit::Rate,
                    retry_after: self.until_next_token(entry.tokens),
                });
            }
            entry.tokens -= 1.0;
        }
        *entry.count_mut(slot) += 1;
        Ok(())
    }

    fn refill(&self, entry: &mut Entry, now: Instant) {
        let elapsed = now
            .saturating_duration_since(entry.refilled_at)
            .as_secs_f64();
        if elapsed > 0.0 {
            entry.tokens = self
                .burst
                .min(entry.tokens + elapsed * self.refill_per_second);
        }
        entry.refilled_at = now;
    }

    /// The time until a bucket holding `tokens` has one whole token, in whole seconds rounded
    /// up, at least 1 (configuration-security.md section 5).
    fn until_next_token(&self, tokens: f64) -> u32 {
        if self.refill_per_second <= 0.0 {
            return RETRY_AFTER_NEVER;
        }
        let seconds = ((1.0 - tokens) / self.refill_per_second).ceil();
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "a float-to-integer cast saturates; tokens below one make the value positive"
        )]
        let seconds = seconds as u32;
        seconds.max(1)
    }

    fn acquire(self: &Arc<Self>, address: IpAddr, slot: Slot) -> Result<Permit, LimitError> {
        let mut table = self.lock();
        let now = self.clock.now();
        let entry = self.lookup(&mut table, address, now)?;
        let admitted = self.admit(entry, slot, now);
        table.settle(address);
        admitted.map(|()| Permit {
            limiter: Arc::clone(self),
            address,
            slot,
        })
    }

    fn release(&self, address: IpAddr, slot: Slot) {
        let mut table = self.lock();
        // A held slot keeps its entry active, so the entry is still there; saturating keeps a
        // drop from ever panicking.
        if let Some(entry) = table.entries.get_mut(&address) {
            let count = entry.count_mut(slot);
            *count = count.saturating_sub(1);
        }
        table.settle(address);
    }
}

/// The table. One mutex guards it. It is cheap to clone: every clone is the same table.
#[derive(Debug, Clone)]
pub struct Limiter {
    inner: Arc<Inner>,
}

impl Limiter {
    /// An empty limiter on `clock`.
    #[must_use]
    pub fn new(options: Options, clock: impl Clock) -> Self {
        let requests_per_minute = f64::from(options.requests_per_minute);
        Self {
            inner: Arc::new(Inner {
                clock: Box::new(clock),
                options,
                refill_per_second: requests_per_minute / SECONDS_PER_MINUTE,
                burst: MIN_BURST.max(requests_per_minute / BURST_DIVISOR),
                // No size hint: the table is bounded by tracked_clients, not allocated at it.
                table: Mutex::new(Table::default()),
            }),
        }
    }

    /// Admits one throughput request (download or upload) for a client: a concurrency slot and a
    /// token. The slot is held until the permit is dropped, so an aborted transfer frees it.
    ///
    /// # Errors
    ///
    /// [`Limit::Streams`], [`Limit::Rate`] or [`Limit::TableFull`].
    pub fn acquire_stream(&self, address: IpAddr) -> Result<Permit, LimitError> {
        self.inner.acquire(address, Slot::Stream)
    }

    /// Admits one WebSocket for a client, held until the permit is dropped. A WebSocket does not
    /// spend a token: the token bucket counts throughput requests only.
    ///
    /// # Errors
    ///
    /// [`Limit::WebSockets`] or [`Limit::TableFull`].
    pub fn acquire_websocket(&self, address: IpAddr) -> Result<Permit, LimitError> {
        self.inner.acquire(address, Slot::WebSocket)
    }

    /// Admits one networkQuality flow for a client, held until the permit is dropped.
    ///
    /// # Errors
    ///
    /// [`Limit::Flows`] or [`Limit::TableFull`].
    pub fn acquire_flow(&self, address: IpAddr) -> Result<Permit, LimitError> {
        self.inner.acquire(address, Slot::Flow)
    }

    /// The number of tracked clients.
    #[must_use]
    pub fn tracked_clients(&self) -> usize {
        self.inner.lock().entries.len()
    }
}

/// One admitted request, WebSocket or flow. Dropping it gives the slot back, exactly once,
/// whether the work ended, failed, panicked or was cancelled.
#[derive(Debug)]
#[must_use = "dropping the permit releases its slot at once"]
pub struct Permit {
    limiter: Arc<Inner>,
    address: IpAddr,
    slot: Slot,
}

impl Drop for Permit {
    fn drop(&mut self) {
        self.limiter.release(self.address, self.slot);
    }
}

#[cfg(test)]
mod tests;
