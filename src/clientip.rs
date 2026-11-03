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

//! A request's client IP: the TCP peer, or, only when the peer is a trusted proxy, the first
//! untrusted hop of `X-Forwarded-For` counted from the right (configuration-security.md
//! section 4, security.md section 4). No other forwarding header is ever read. Also the address
//! class, the IP version and the suggested context label of `GET /api/v1/info`
//! (wire-protocol.md section 5).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use http::HeaderMap;
use http::header::{HeaderName, HeaderValue};

use crate::config::{Cidr, parse_addr};

/// The only forwarding header ever read.
const X_FORWARDED_FOR: HeaderName = HeaderName::from_static("x-forwarded-for");

/// Separates the hops of one `X-Forwarded-For` line, and joins several lines.
const ENTRY_SEPARATOR: char = ',';

/// The address class of `GET /api/v1/info`'s `client.addressClass`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Class {
    /// `127.0.0.0/8` and `::1`.
    Loopback,
    /// RFC 1918.
    Private,
    /// `169.254.0.0/16` and `fe80::/10`.
    LinkLocal,
    /// `fc00::/7`.
    Ula,
    /// `100.64.0.0/10`.
    Cgnat,
    /// Everything else.
    Public,
}

impl Class {
    /// The wire value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Loopback => "loopback",
            Self::Private => "private",
            Self::LinkLocal => "link-local",
            Self::Ula => "ula",
            Self::Cgnat => "cgnat",
            Self::Public => "public",
        }
    }
}

/// The suggested label of a LAN address.
pub const LABEL_LAN: &str = "LAN";
/// The suggested label of a VPN address.
pub const LABEL_VPN: &str = "VPN";

const RFC1918: [(Ipv4Addr, u8); 3] = [
    (Ipv4Addr::new(10, 0, 0, 0), 8),
    (Ipv4Addr::new(172, 16, 0, 0), 12),
    (Ipv4Addr::new(192, 168, 0, 0), 16),
];
const CGNAT: (Ipv4Addr, u8) = (Ipv4Addr::new(100, 64, 0, 0), 10);
const ULA: (Ipv6Addr, u8) = (Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 0), 7);
/// The ULA range Tailscale assigns, which is a VPN rather than a LAN.
const TAILSCALE: (Ipv6Addr, u8) = (Ipv6Addr::new(0xfd7a, 0x115c, 0xa1e0, 0, 0, 0, 0, 0), 48);

fn in_v4(address: Ipv4Addr, (network, bits): (Ipv4Addr, u8)) -> bool {
    let mask = u32::MAX.checked_shl(32 - u32::from(bits)).unwrap_or(0);
    u32::from(address) & mask == u32::from(network)
}

fn in_v6(address: Ipv6Addr, (network, bits): (Ipv6Addr, u8)) -> bool {
    let mask = u128::MAX.checked_shl(128 - u32::from(bits)).unwrap_or(0);
    u128::from(address) & mask == u128::from(network)
}

/// The class of a client address, an IPv4-mapped one read as IPv4. Anything that is not
/// loopback, link-local, CGNAT, RFC 1918 or ULA is public; the order of the checks is Go's.
#[must_use]
pub fn address_class(address: IpAddr) -> Class {
    match address.to_canonical() {
        IpAddr::V4(v4) if v4.is_loopback() => Class::Loopback,
        IpAddr::V4(v4) if v4.is_link_local() => Class::LinkLocal,
        IpAddr::V4(v4) if in_v4(v4, CGNAT) => Class::Cgnat,
        IpAddr::V4(v4) if RFC1918.iter().any(|&range| in_v4(v4, range)) => Class::Private,
        IpAddr::V6(v6) if v6.is_loopback() => Class::Loopback,
        IpAddr::V6(v6) if v6.is_unicast_link_local() => Class::LinkLocal,
        IpAddr::V6(v6) if in_v6(v6, ULA) => Class::Ula,
        IpAddr::V4(_) | IpAddr::V6(_) => Class::Public,
    }
}

/// The context label suggested for a client address: VPN for CGNAT and the Tailscale ULA range,
/// LAN for private, link-local, other ULA and loopback addresses, and none for public ones.
#[must_use]
pub fn suggested_label(address: IpAddr) -> Option<&'static str> {
    let address = address.to_canonical();
    if let IpAddr::V6(v6) = address
        && in_v6(v6, TAILSCALE)
    {
        return Some(LABEL_VPN);
    }
    match address_class(address) {
        Class::Cgnat => Some(LABEL_VPN),
        Class::Private | Class::LinkLocal | Class::Ula | Class::Loopback => Some(LABEL_LAN),
        Class::Public => None,
    }
}

/// 4 or 6, the `client.ipVersion` of `GET /api/v1/info`; an IPv4-mapped address is 4.
#[must_use]
pub fn version(address: IpAddr) -> u8 {
    match address.to_canonical() {
        IpAddr::V4(_) => 4,
        IpAddr::V6(_) => 6,
    }
}

/// One `server.labels` entry: client addresses in `prefix` get `label`. The prefix is masked and
/// not IPv4-mapped, as configuration validation guarantees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    /// The client range.
    pub prefix: Cidr,
    /// The label.
    pub label: String,
}

/// Suggests the context label of `GET /api/v1/info`: the label of the longest configured prefix
/// that contains the client address, else the address-class rule of [`suggested_label`]. It is
/// built once at startup and only read afterwards.
#[derive(Debug, Clone, Default)]
pub struct Labeler {
    /// Longest prefix first, so the first rule that contains an address is its longest match.
    rules: Vec<Rule>,
}

impl Labeler {
    /// A labeler over a copy of `rules`; equal lengths keep their order.
    #[must_use]
    pub fn new(rules: &[Rule]) -> Self {
        let mut rules = rules.to_vec();
        rules.sort_by_key(|rule| std::cmp::Reverse(rule.prefix.bits()));
        Self { rules }
    }

    /// The label suggested for a client address, an IPv4-mapped one read as IPv4 first.
    #[must_use]
    pub fn suggest(&self, address: IpAddr) -> Option<&str> {
        let address = address.to_canonical();
        self.rules
            .iter()
            .find(|rule| rule.prefix.contains(address))
            .map(|rule| rule.label.as_str())
            .or_else(|| suggested_label(address))
    }
}

/// What the client IP middleware records about a request: its client IP and whether its TCP
/// peer is a trusted proxy, which decides whether a compatibility layer may read forwarding
/// headers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Client {
    /// The client IP, normalized: no port, no zone, an IPv4-mapped address as IPv4.
    pub address: IpAddr,
    /// Whether the TCP peer is inside `server.trusted_proxies`.
    pub peer_trusted: bool,
}

/// Derives client IPs for one set of trusted proxy ranges. It holds no per-request state.
#[derive(Debug, Clone, Default)]
pub struct Deriver {
    trusted: Vec<Cidr>,
}

impl Deriver {
    /// A deriver trusting a copy of `trusted` (`server.trusted_proxies`). With none, forwarding
    /// headers are never believed.
    #[must_use]
    pub fn new(trusted: &[Cidr]) -> Self {
        Self {
            trusted: trusted.to_vec(),
        }
    }

    /// The request's client and whether its TCP peer is trusted. The peer's zone (an IPv6 scope)
    /// is not part of the address, and an IPv4-mapped peer is IPv4, so one client has one
    /// address whatever path it took (security.md section 4).
    #[must_use]
    pub fn derive(&self, peer: SocketAddr, headers: &HeaderMap) -> Client {
        let peer = peer.ip().to_canonical();
        if !self.is_trusted(peer) {
            return Client {
                address: peer,
                peer_trusted: false,
            };
        }
        Client {
            address: self.walk_chain(headers.get_all(X_FORWARDED_FOR).iter(), peer),
            peer_trusted: true,
        }
    }

    /// Walks a trusted peer's `X-Forwarded-For` from the right to the first untrusted hop. A
    /// chain whose lines are all trusted gives its leftmost entry; no line gives the peer.
    fn walk_chain<'header>(
        &self,
        lines: impl Iterator<Item = &'header HeaderValue>,
        peer: IpAddr,
    ) -> IpAddr {
        let mut joined = Vec::new();
        for line in lines {
            // A line that is not text cannot hold an address: the chain is malformed.
            let Ok(line) = line.to_str() else {
                return peer;
            };
            joined.push(line);
        }
        if joined.is_empty() {
            return peer;
        }
        let joined = joined.join(&ENTRY_SEPARATOR.to_string());
        let mut leftmost = peer;
        for entry in joined.split(ENTRY_SEPARATOR).rev() {
            // A malformed chain fails closed to the proxy's own address: nothing to the left of
            // a hop that does not parse can be attributed to anyone.
            let Some((address, _zone)) = parse_addr(entry.trim()) else {
                return peer;
            };
            let address = address.to_canonical();
            if !self.is_trusted(address) {
                return address;
            }
            leftmost = address;
        }
        leftmost
    }

    fn is_trusted(&self, address: IpAddr) -> bool {
        self.trusted.iter().any(|prefix| prefix.contains(address))
    }
}

#[cfg(test)]
mod tests;
