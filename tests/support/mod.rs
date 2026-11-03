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

//! What the integration tests share.

use std::net::{SocketAddr, TcpStream};

/// Connects to a server the test started on a loopback address; any other address is a bug in
/// the test.
#[expect(
    clippy::disallowed_methods,
    reason = "the integration tests dial the servers they start, on loopback only"
)]
pub fn dial_loopback(address: SocketAddr) -> TcpStream {
    assert!(
        address.ip().is_loopback(),
        "{address} is not a loopback address"
    );
    TcpStream::connect(address).unwrap_or_else(|error| panic!("connect to {address}: {error}"))
}
