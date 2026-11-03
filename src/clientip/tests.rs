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

//! The Go clientip tests, ported; each names the Go test it maps to.

use std::net::{IpAddr, SocketAddr, SocketAddrV6};

use http::HeaderMap;
use http::header::HeaderName;

use super::*;

fn address(text: &str) -> IpAddr {
    let (address, _zone) = parse_addr(text).expect("an address");
    address
}

fn prefixes(cidrs: &[&str]) -> Vec<Cidr> {
    cidrs
        .iter()
        .map(|cidr| cidr.parse().expect("a CIDR"))
        .collect()
}

/// The ranges of wire-protocol.md section 5: each class at its edges, the Tailscale ULA range,
/// and the neighbors that fall outside.
const CLASS_CASES: [(&str, Class, Option<&str>); 33] = [
    ("127.0.0.1", Class::Loopback, Some(LABEL_LAN)),
    ("127.255.255.254", Class::Loopback, Some(LABEL_LAN)),
    ("::1", Class::Loopback, Some(LABEL_LAN)),
    ("10.0.0.0", Class::Private, Some(LABEL_LAN)),
    ("10.255.255.255", Class::Private, Some(LABEL_LAN)),
    ("172.16.0.1", Class::Private, Some(LABEL_LAN)),
    ("172.31.255.255", Class::Private, Some(LABEL_LAN)),
    ("172.32.0.1", Class::Public, None),
    ("172.15.255.255", Class::Public, None),
    ("192.168.1.42", Class::Private, Some(LABEL_LAN)),
    ("192.169.0.1", Class::Public, None),
    ("169.254.0.1", Class::LinkLocal, Some(LABEL_LAN)),
    ("169.254.255.254", Class::LinkLocal, Some(LABEL_LAN)),
    ("fe80::1", Class::LinkLocal, Some(LABEL_LAN)),
    ("febf::1", Class::LinkLocal, Some(LABEL_LAN)),
    ("fec0::1", Class::Public, None),
    ("fc00::1", Class::Ula, Some(LABEL_LAN)),
    ("fd00::2", Class::Ula, Some(LABEL_LAN)),
    ("fdff:ffff::1", Class::Ula, Some(LABEL_LAN)),
    ("fd7a:115c:a1e0::1", Class::Ula, Some(LABEL_VPN)),
    ("fd7a:115c:a1e0:ffff::1", Class::Ula, Some(LABEL_VPN)),
    ("fd7a:115c:a1e1::1", Class::Ula, Some(LABEL_LAN)),
    ("100.64.0.0", Class::Cgnat, Some(LABEL_VPN)),
    ("100.101.4.17", Class::Cgnat, Some(LABEL_VPN)),
    ("100.127.255.255", Class::Cgnat, Some(LABEL_VPN)),
    ("100.63.255.255", Class::Public, None),
    ("100.128.0.0", Class::Public, None),
    ("203.0.113.9", Class::Public, None),
    ("8.8.8.8", Class::Public, None),
    ("2001:db8::1", Class::Public, None),
    ("::ffff:192.168.1.42", Class::Private, Some(LABEL_LAN)),
    ("::ffff:100.64.0.1", Class::Cgnat, Some(LABEL_VPN)),
    ("fe80::1%eth0", Class::LinkLocal, Some(LABEL_LAN)),
];

/// Go: `TestAddressClass`
#[test]
fn address_classes() {
    for (text, class, _) in CLASS_CASES {
        assert_eq!(address_class(address(text)), class, "{text}");
    }
    assert_eq!(Class::LinkLocal.as_str(), "link-local");
    assert_eq!(Class::Cgnat.as_str(), "cgnat");
}

/// Go: `TestSuggestedLabel`
#[test]
fn suggested_labels() {
    for (text, _, label) in CLASS_CASES {
        assert_eq!(suggested_label(address(text)), label, "{text}");
    }
}

/// Go: `TestVersion`
#[test]
fn versions() {
    for (text, want) in [
        ("10.0.0.1", 4),
        ("::ffff:10.0.0.1", 4),
        ("::1", 6),
        ("fe80::1%eth0", 6),
    ] {
        assert_eq!(version(address(text)), want, "{text}");
    }
}

fn headers(entries: &[(&str, &str)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for &(name, value) in entries {
        map.append(
            HeaderName::from_bytes(name.as_bytes()).expect("a header name"),
            value.parse().expect("a header value"),
        );
    }
    map
}

/// Go: `TestDerive`, the algorithm of configuration-security.md section 4 step by step.
#[test]
#[expect(clippy::too_many_lines, reason = "one row per Go case")]
fn derive_follows_the_algorithm() {
    let proxy = prefixes(&["172.20.0.2/32"]);
    let chain = prefixes(&["172.20.0.0/24", "fd00::/64"]);
    let none: Vec<Cidr> = Vec::new();
    let peer: SocketAddr = "172.20.0.2:41000".parse().expect("a peer");
    let xff = "X-Forwarded-For";
    let cases: [(&str, &[Cidr], SocketAddr, HeaderMap, &str); 21] = [
        (
            "no trusted proxies ignores every header",
            &none,
            peer,
            headers(&[(xff, "203.0.113.9"), ("X-Real-IP", "203.0.113.10")]),
            "172.20.0.2",
        ),
        (
            "an untrusted peer's header is ignored",
            &proxy,
            "198.51.100.7:41000".parse().expect("a peer"),
            headers(&[(xff, "203.0.113.9")]),
            "198.51.100.7",
        ),
        (
            "trusted peer without the header is the client",
            &proxy,
            peer,
            headers(&[]),
            "172.20.0.2",
        ),
        (
            "trusted peer with a clean chain",
            &proxy,
            peer,
            headers(&[(xff, "203.0.113.9")]),
            "203.0.113.9",
        ),
        (
            "spoofed left-hand entries are never used",
            &proxy,
            peer,
            headers(&[(xff, "1.2.3.4, 5.6.7.8, 203.0.113.9")]),
            "203.0.113.9",
        ),
        (
            "trusted hops are skipped from the right",
            &chain,
            peer,
            headers(&[(xff, "9.9.9.9, 203.0.113.9, 172.20.0.5, fd00::7")]),
            "203.0.113.9",
        ),
        (
            "an all-trusted chain returns the leftmost entry",
            &chain,
            peer,
            headers(&[(xff, "172.20.0.9, 172.20.0.5")]),
            "172.20.0.9",
        ),
        (
            "a malformed entry falls back to the peer",
            &chain,
            peer,
            headers(&[(xff, "203.0.113.9, not-an-ip, 172.20.0.5")]),
            "172.20.0.2",
        ),
        (
            "an entry with a port is malformed",
            &proxy,
            peer,
            headers(&[(xff, "203.0.113.9:5555")]),
            "172.20.0.2",
        ),
        (
            "an empty entry is malformed",
            &proxy,
            peer,
            headers(&[(xff, "203.0.113.9,")]),
            "172.20.0.2",
        ),
        (
            "an empty header is malformed",
            &proxy,
            peer,
            headers(&[(xff, "")]),
            "172.20.0.2",
        ),
        (
            "several header lines are joined in order",
            &chain,
            peer,
            headers(&[(xff, "1.2.3.4, 203.0.113.9"), (xff, "172.20.0.5")]),
            "203.0.113.9",
        ),
        (
            "the right-most line counts first",
            &proxy,
            peer,
            headers(&[(xff, "203.0.113.9"), (xff, "198.51.100.1")]),
            "198.51.100.1",
        ),
        (
            "X-Real-IP, Client-IP, CF-Connecting-IP and Forwarded are ignored",
            &proxy,
            peer,
            headers(&[
                ("X-Real-IP", "203.0.113.1"),
                ("Client-IP", "203.0.113.2"),
                ("CF-Connecting-IP", "203.0.113.3"),
                ("CF-Connecting-IPv6", "2001:db8::3"),
                ("Forwarded", "for=203.0.113.4"),
            ]),
            "172.20.0.2",
        ),
        (
            "an IPv4-mapped peer is IPv4",
            &none,
            "[::ffff:10.0.0.1]:41000".parse().expect("a peer"),
            headers(&[]),
            "10.0.0.1",
        ),
        (
            "an IPv4-mapped peer is matched against IPv4 trusted ranges",
            &prefixes(&["10.0.0.1/32"]),
            "[::ffff:10.0.0.1]:41000".parse().expect("a peer"),
            headers(&[(xff, "203.0.113.9")]),
            "203.0.113.9",
        ),
        (
            "an IPv4-mapped entry is IPv4",
            &proxy,
            peer,
            headers(&[(xff, "::ffff:10.0.0.1")]),
            "10.0.0.1",
        ),
        (
            "an IPv4-mapped entry inside a trusted range is skipped",
            &chain,
            peer,
            headers(&[(xff, "203.0.113.9, ::ffff:172.20.0.5")]),
            "203.0.113.9",
        ),
        (
            "a zoned peer loses its zone",
            &none,
            SocketAddr::V6(SocketAddrV6::new(
                "fe80::1".parse().expect("an address"),
                41000,
                0,
                2,
            )),
            headers(&[]),
            "fe80::1",
        ),
        (
            "a zoned entry loses its zone",
            &proxy,
            peer,
            headers(&[(xff, "fe80::1%eth0")]),
            "fe80::1",
        ),
        (
            "an IPv6 peer",
            &chain,
            "[fd00::2]:41000".parse().expect("a peer"),
            headers(&[(xff, "2001:db8::9")]),
            "2001:db8::9",
        ),
    ];
    for (name, trusted, peer, headers, want) in cases {
        assert_eq!(
            Deriver::new(trusted).derive(peer, &headers).address,
            address(want),
            "{name}"
        );
    }
}

/// A header line that is not text is a malformed chain (no Go test: Go read it as bytes, which
/// never parse as an address either).
#[test]
fn a_binary_line_falls_back_to_the_peer() {
    let mut map = HeaderMap::new();
    map.append(
        X_FORWARDED_FOR,
        HeaderValue::from_bytes(b"203.0.113.9\xff").expect("a header value"),
    );
    let peer: SocketAddr = "172.20.0.2:1".parse().expect("a peer");
    let client = Deriver::new(&prefixes(&["172.20.0.2/32"])).derive(peer, &map);
    assert_eq!(client.address, address("172.20.0.2"));
}

/// Go: `TestDeriverCopiesTheTrustedRanges`. The deriver owns its copy, so the caller's list
/// cannot widen the trust afterwards; the borrow checker already forbids changing it while
/// borrowed, and this checks the copy is independent once the borrow ends.
#[test]
fn deriver_copies_the_trusted_ranges() {
    let mut trusted = prefixes(&["172.20.0.2/32"]);
    let deriver = Deriver::new(&trusted);
    trusted[0] = "0.0.0.0/0".parse().expect("a CIDR");
    let peer: SocketAddr = "198.51.100.7:1".parse().expect("a peer");
    let client = deriver.derive(peer, &headers(&[("X-Forwarded-For", "203.0.113.9")]));
    assert_eq!(client.address, address("198.51.100.7"));
}

/// Go: `TestMiddlewareRecordsWhetherThePeerIsTrusted`, the derivation half; storing it in the
/// request is the middleware's, ported with the router (phase 12).
#[test]
fn derive_records_whether_the_peer_is_trusted() {
    let deriver = Deriver::new(&prefixes(&["172.20.0.2/32"]));
    for (peer, want) in [
        ("172.20.0.2:41000", true),
        ("172.20.0.3:41000", false),
        ("[::ffff:172.20.0.2]:1", true),
    ] {
        let peer: SocketAddr = peer.parse().expect("a peer");
        assert_eq!(
            deriver.derive(peer, &HeaderMap::new()).peer_trusted,
            want,
            "{peer}"
        );
    }
}

/// Go: `TestLabelerLongestPrefixWins`
#[test]
fn labeler_longest_prefix_wins() {
    let rule = |prefix: &str, label: &str| Rule {
        prefix: prefix.parse().expect("a CIDR"),
        label: label.to_owned(),
    };
    let labeler = Labeler::new(&[
        rule("10.0.0.0/8", "LAN"),
        rule("10.8.0.0/24", "WireGuard"),
        rule("10.8.0.0/16", "Office"),
        rule("fd00:1::/64", "Lab"),
        rule("203.0.113.0/24", "Branch"),
    ]);
    for (text, want) in [
        ("10.8.0.7", Some("WireGuard")),
        ("10.8.1.7", Some("Office")),
        ("10.9.0.7", Some("LAN")),
        ("fd00:1::5", Some("Lab")),
        ("203.0.113.9", Some("Branch")),
        // IPv4-mapped IPv6 is normalized to IPv4 before matching.
        ("::ffff:10.8.0.7", Some("WireGuard")),
        // No rule matches: the address-class rule applies.
        ("192.168.1.20", Some(LABEL_LAN)),
        ("100.64.0.1", Some(LABEL_VPN)),
        ("fd7a:115c:a1e0::1", Some(LABEL_VPN)),
        ("fd00:2::5", Some(LABEL_LAN)),
        ("198.51.100.1", None),
    ] {
        assert_eq!(labeler.suggest(address(text)), want, "{text}");
    }
}

/// Go: `TestLabelerWithoutRulesIsTheAddressClassRule`
#[test]
fn labeler_without_rules_is_the_address_class_rule() {
    for labeler in [Labeler::default(), Labeler::new(&[])] {
        for text in ["10.0.0.1", "100.64.0.1", "8.8.8.8", "::1"] {
            assert_eq!(
                labeler.suggest(address(text)),
                suggested_label(address(text)),
                "{text}"
            );
        }
    }
}

/// Go: `TestNewLabelerKeepsTheCallersRules`
#[test]
fn labeler_keeps_the_callers_rules() {
    let rules = [
        Rule {
            prefix: "10.0.0.0/8".parse().expect("a CIDR"),
            label: "LAN".to_owned(),
        },
        Rule {
            prefix: "10.8.0.0/24".parse().expect("a CIDR"),
            label: "VPN".to_owned(),
        },
    ];
    let _labeler = Labeler::new(&rules);
    assert_eq!(rules[0].label, "LAN");
}
