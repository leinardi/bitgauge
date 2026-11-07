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

//! What the unit tests share. Compiled under `#[cfg(test)]` only
//! (`meta/tests/test_support_boundary.rs`).

use std::net::SocketAddr;

use tokio::net::TcpStream;

/// Connects to a test server on the loopback interface: the one connect the unit tests make.
///
/// # Panics
///
/// The connection is refused, naming the address.
#[expect(
    clippy::disallowed_methods,
    reason = "unit tests dial their own loopback server; the shipped code never connects"
)]
pub(crate) async fn dial_loopback(address: SocketAddr) -> TcpStream {
    assert!(
        address.ip().is_loopback(),
        "{address} is not a loopback address"
    );
    TcpStream::connect(address)
        .await
        .unwrap_or_else(|error| panic!("connect to {address}: {error}"))
}
