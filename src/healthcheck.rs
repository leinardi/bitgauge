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

//! `bitgauge healthcheck` (backend.md section 6): one `GET /api/v1/ping` to the server the
//! configuration describes, with no runtime, no name lookup and no proxy. One 3 s deadline
//! covers the connect, every write and every read; the answer is read up to the end of its
//! status line, at most 512 bytes, and only an `HTTP/1.x 204` status line passes.

use std::io::{self, Read as _, Write as _};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV6, TcpStream};
use std::time::Duration;

use tokio::time::Instant;

use crate::config::{Config, Listen};
use crate::handlers::PREFIX;
use crate::server::listen::zone_index;

/// The deadline of the whole probe.
pub const TIMEOUT: Duration = Duration::from_secs(3);

/// The most of the answer read while looking for the end of its status line.
const STATUS_LINE_LIMIT: usize = 512;

/// Whether the server the configuration describes answers its ping with 204 within
/// [`TIMEOUT`].
#[must_use]
pub fn answers(config: &Config) -> bool {
    let deadline = Instant::now() + TIMEOUT;
    let Some(address) = address(&config.server.listen) else {
        return false;
    };
    probe(address, &request(config, address), deadline)
}

/// The address to ask, from `server.listen`: its host when that is a specific address,
/// `127.0.0.1` for an empty or IPv4 wildcard host (`0.0.0.0`, `::ffff:0.0.0.0`), and `::1` for
/// `::`. An IPv4-mapped host is its IPv4 address, and an IPv6 zone becomes the address's scope;
/// `None` for a zone no interface has, or a port out of range, which validation refuses first.
#[must_use]
pub fn address(listen: &Listen) -> Option<SocketAddr> {
    let port = u16::try_from(listen.port).ok()?;
    if listen.host.is_empty() {
        return Some(SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
    }
    let (ip, zone) = crate::config::parse_addr(&listen.host)?;
    let ip = match ip {
        IpAddr::V6(v6) if v6.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        other @ (IpAddr::V4(_) | IpAddr::V6(_)) if other.to_canonical().is_unspecified() => {
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        }
        // A mapped address is asked over IPv4, as the listener binds it and Go dialed it.
        other @ (IpAddr::V4(_) | IpAddr::V6(_)) => other.to_canonical(),
    };
    match (ip, zone) {
        (IpAddr::V6(v6), Some(zone)) => Some(SocketAddr::V6(SocketAddrV6::new(
            v6,
            port,
            0,
            zone_index(zone)?,
        ))),
        (ip, _) => Some(SocketAddr::new(ip, port)),
    }
}

/// The request: the ping under the base path, the address as its host without the zone, and
/// no keep-alive, as Go's client with keep-alives off sent it.
fn request(config: &Config, address: SocketAddr) -> Vec<u8> {
    let base = config.server.base_path.trim_end_matches('/');
    let host = match address {
        SocketAddr::V4(v4) => v4.to_string(),
        SocketAddr::V6(v6) => format!("[{}]:{}", v6.ip(), v6.port()),
    };
    format!("GET {base}{PREFIX}/ping HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n")
        .into_bytes()
}

/// The time left before `deadline`, or `None` once it has passed.
fn remaining(deadline: Instant) -> Option<Duration> {
    Some(deadline.checked_duration_since(Instant::now())?).filter(|left| !left.is_zero())
}

/// Sends `request` to `address` and reads the status line, all before `deadline`.
fn probe(address: SocketAddr, request: &[u8], deadline: Instant) -> bool {
    let Some(left) = remaining(deadline) else {
        return false;
    };
    let Ok(mut stream) = connect(&address, left) else {
        return false;
    };
    let mut unsent = request;
    while !unsent.is_empty() {
        let Some(left) = remaining(deadline) else {
            return false;
        };
        match stream
            .set_write_timeout(Some(left))
            .and_then(|()| stream.write(unsent))
        {
            Ok(0) | Err(_) => return false,
            Ok(written) => unsent = &unsent[written..],
        }
    }
    let mut answer = Vec::with_capacity(STATUS_LINE_LIMIT);
    let mut chunk = [0_u8; STATUS_LINE_LIMIT];
    loop {
        let Some(left) = remaining(deadline) else {
            return false;
        };
        let room = STATUS_LINE_LIMIT - answer.len();
        let read = match stream
            .set_read_timeout(Some(left))
            .and_then(|()| stream.read(&mut chunk[..room]))
        {
            Ok(0) | Err(_) => return false,
            Ok(read) => read,
        };
        answer.extend_from_slice(&chunk[..read]);
        if remaining(deadline).is_none() {
            return false;
        }
        if let Some(end) = answer.windows(2).position(|pair| pair == b"\r\n") {
            return is_no_content(&answer[..end]);
        }
        if answer.len() >= STATUS_LINE_LIMIT {
            return false;
        }
    }
}

/// Whether a status line is `HTTP/1.x 204`, with or without a reason phrase.
fn is_no_content(line: &[u8]) -> bool {
    let Some(rest) = line.strip_prefix(b"HTTP/1.") else {
        return false;
    };
    match rest {
        [minor, b' ', b'2', b'0', b'4', tail @ ..] => {
            minor.is_ascii_digit() && (tail.is_empty() || tail.first() == Some(&b' '))
        }
        _ => false,
    }
}

/// The health check's one connection.
#[expect(
    clippy::disallowed_methods,
    reason = "the health check's single connection, to the literal address derived from server.listen (backend.md section 6)"
)]
fn connect(address: &SocketAddr, timeout: Duration) -> io::Result<TcpStream> {
    TcpStream::connect_timeout(address, timeout)
}

#[cfg(test)]
mod tests;
