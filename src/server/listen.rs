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

//! The server's listener, bound as Go's `net.Listen` bound `server.listen`: any wildcard host
//! (empty, `0.0.0.0`, `::`, `::ffff:0.0.0.0`) listens dual-stack on `[::]`, and on `0.0.0.0` where
//! the host has no IPv6; an IPv4-mapped address listens as IPv4; an IPv6 zone is an interface
//! name, else its number. The socket reuses its address, as Go's does.

use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV6};

use nix::sys::socket::{setsockopt, sockopt};
use tokio::net::{TcpListener, TcpSocket};

use crate::config::{Listen, parse_addr};

/// The listen backlog; the kernel caps it at `net.core.somaxconn`, as it capped Go's.
const BACKLOG: u32 = 65_535;

/// The scope of an IPv6 zone: the index of the interface it names, else the zone as a number.
#[must_use]
pub fn zone_index(zone: &str) -> Option<u32> {
    nix::net::if_::if_nametoindex(zone)
        .ok()
        .or_else(|| zone.parse().ok())
}

/// The addresses `listen` binds, in the order they are tried; `None` for a host that is not an
/// IP literal, a zone no interface has, or a port out of range, which validation refuses first.
#[must_use]
pub fn addresses(listen: &Listen) -> Option<Vec<SocketAddr>> {
    let port = u16::try_from(listen.port).ok()?;
    let wildcard = || {
        vec![
            SocketAddr::from((Ipv6Addr::UNSPECIFIED, port)),
            SocketAddr::from((Ipv4Addr::UNSPECIFIED, port)),
        ]
    };
    if listen.host.is_empty() {
        return Some(wildcard());
    }
    let (ip, zone) = parse_addr(&listen.host)?;
    if ip.to_canonical().is_unspecified() {
        return Some(wildcard());
    }
    let address = match (ip.to_canonical(), zone) {
        (IpAddr::V6(v6), Some(zone)) => {
            SocketAddr::V6(SocketAddrV6::new(v6, port, 0, zone_index(zone)?))
        }
        (ip, _) => SocketAddr::new(ip, port),
    };
    Some(vec![address])
}

/// Binds `listen`, trying each of its [`addresses`] until one binds; a wildcard falls back to
/// IPv4 unless its port is taken. Call it inside the runtime.
///
/// # Errors
///
/// The error of the last address tried, or `InvalidInput` for an address that cannot be bound.
pub fn bind(listen: &Listen) -> io::Result<TcpListener> {
    let addresses = addresses(listen).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "not an address this host can bind",
        )
    })?;
    let mut failure = None;
    for address in addresses {
        match bind_one(address) {
            Ok(listener) => return Ok(listener),
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => return Err(error),
            Err(error) => failure = Some(error),
        }
    }
    Err(failure.unwrap_or_else(|| io::Error::from(io::ErrorKind::AddrNotAvailable)))
}

fn bind_one(address: SocketAddr) -> io::Result<TcpListener> {
    let socket = if address.is_ipv4() {
        TcpSocket::new_v4()?
    } else {
        let socket = TcpSocket::new_v6()?;
        // Dual stack whatever net.ipv6.bindv6only says, as Go sets it.
        setsockopt(&socket, sockopt::Ipv6V6Only, &false)?;
        socket
    };
    socket.set_reuseaddr(true)?;
    socket.bind(address)?;
    socket.listen(BACKLOG)
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::{addresses, bind};
    use crate::config::Listen;
    use crate::test_support::dial_loopback;

    fn listen(text: &str) -> Listen {
        text.parse().expect("a listen address")
    }

    fn parsed(list: &[&str]) -> Vec<SocketAddr> {
        list.iter()
            .map(|address| address.parse().expect("an address"))
            .collect()
    }

    /// Every wildcard listens on `[::]` then `0.0.0.0`; a mapped address listens as IPv4; a
    /// numeric zone is the scope.
    #[test]
    fn addresses_of_every_listen_shape() {
        for (text, want) in [
            (":8080", &["[::]:8080", "0.0.0.0:8080"][..]),
            ("0.0.0.0:8080", &["[::]:8080", "0.0.0.0:8080"][..]),
            ("[::]:8080", &["[::]:8080", "0.0.0.0:8080"][..]),
            ("[::ffff:0.0.0.0]:8080", &["[::]:8080", "0.0.0.0:8080"][..]),
            ("[::ffff:192.0.2.1]:8080", &["192.0.2.1:8080"][..]),
            ("192.168.1.10:8080", &["192.168.1.10:8080"][..]),
            ("[fd00::5]:8080", &["[fd00::5]:8080"][..]),
            ("[fe80::1%7]:8080", &["[fe80::1%7]:8080"][..]),
        ] {
            assert_eq!(addresses(&listen(text)), Some(parsed(want)), "{text}");
        }
        assert_eq!(addresses(&listen("127.0.0.1:70000")), None);
        assert_eq!(addresses(&listen("[fe80::1%no-such-interface]:8080")), None);
    }

    /// A wildcard listener takes IPv4 connections too.
    #[tokio::test]
    async fn a_wildcard_listener_is_dual_stack() {
        let listener = bind(&listen(":0")).expect("a listener");
        let address = listener.local_addr().expect("an address");
        assert!(address.is_ipv6(), "{address}");
        let accept = tokio::spawn(async move { listener.accept().await.map(|(_, peer)| peer) });
        dial_loopback(SocketAddr::from(([127, 0, 0, 1], address.port()))).await;
        let peer = accept.await.expect("the accept").expect("a connection");
        assert!(peer.ip().to_canonical().is_loopback(), "{peer}");
    }

    /// A taken port is the error, without falling back.
    #[tokio::test]
    async fn a_taken_port_is_refused() {
        let taken = bind(&listen("127.0.0.1:0")).expect("a listener");
        let port = taken.local_addr().expect("an address").port();
        let error = bind(&listen(&format!("127.0.0.1:{port}"))).expect_err("the port is taken");
        assert_eq!(error.kind(), std::io::ErrorKind::AddrInUse);
    }
}
