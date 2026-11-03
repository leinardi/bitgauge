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

//! The value types and the Go text forms they share with the Go binary.

use jiff::SignedDuration;

use crate::config::gofmt::{duration, float, quote};
use crate::config::url;
use crate::config::{Cidr, Listen, Size, ValueError};

/// Go: `TestParseSize`
#[test]
fn parse_size() {
    for (input, want) in [
        ("0", 0),
        ("1", 1),
        ("1024", 1024),
        ("1KiB", 1024),
        ("256MiB", 268_435_456),
        ("1GiB", 1_073_741_824),
        ("64GiB", 68_719_476_736),
        ("1kB", 1000),
        ("1MB", 1_000_000),
        ("1GB", 1_000_000_000),
        ("0.5KiB", 512),
        ("2.5MB", 2_500_000),
        ("9223372036854775807", 9_223_372_036_854_775_807),
    ] {
        assert_eq!(input.parse::<Size>(), Ok(Size::new(want)), "{input:?}");
    }
    for input in [
        "",
        " 1",
        "1 ",
        "+1",
        "1e3",
        "1_000",
        "1.KiB",
        ".5KiB",
        "1B",
        "1kb",
        "0x10",
        "9223372036854775808",
        "8EiB",
        "8589934592GiB",
    ] {
        assert!(
            matches!(input.parse::<Size>(), Err(ValueError::Size(_))),
            "{input:?} must not parse"
        );
    }
}

/// The text forms of the Go binary's problem lines (no Go test: Go printed them natively).
#[test]
fn go_text_forms() {
    for (nanos, want) in [
        (0, "0s"),
        (750, "750ns"),
        (1500, "1.5µs"),
        (500_000_000, "500ms"),
        (10_000_000_000, "10s"),
        (90_000_000_000, "1m30s"),
        (600_000_000_000, "10m0s"),
        (7_200_000_000_000, "2h0m0s"),
        (1_500_000_000, "1.5s"),
        (-1_500_000_000, "-1.5s"),
    ] {
        assert_eq!(duration(SignedDuration::from_nanos(nanos)), want);
    }
    for (value, want) in [
        (1e6, "1e+06"),
        (100_000.0, "100000"),
        (1_234_567.0, "1.234567e+06"),
        (0.0001, "0.0001"),
        (0.000_01, "1e-05"),
        (20.5, "20.5"),
        (-1.0, "-1"),
        (5.13, "5.13"),
        (f64::NAN, "NaN"),
        (f64::INFINITY, "+Inf"),
    ] {
        assert_eq!(float(value), want, "{value}");
    }
    assert_eq!(quote("a\tb\"c\u{1}\u{a0}é"), r#""a\tb\"c\x01\u00a0é""#);
    assert_eq!(Size::MIB.times(256).to_string(), "256 MiB");
    assert_eq!(Size::new(1000).to_string(), "1000 bytes");
    assert_eq!(Size::new(0).to_string(), "0 bytes");
}

#[test]
fn listen_and_cidr_forms() {
    let listen: Listen = "[fe80::1%eth0]:8080".parse().expect("a listen address");
    assert_eq!(listen.to_string(), "[fe80::1%eth0]:8080");
    for invalid in [
        "8080",
        ":http",
        "localhost:8080",
        "[::1]",
        "1.2.3.4%eth0:80",
        ":",
        "::1:80",
    ] {
        assert!(invalid.parse::<Listen>().is_err(), "{invalid:?}");
    }
    let mapped: Cidr = "::ffff:10.8.0.0/120".parse().expect("a CIDR");
    assert!(mapped.is_ipv4_mapped());
    assert_eq!(mapped.to_string(), "::ffff:10.8.0.0/120");
    let host_bits: Cidr = "10.0.0.1/8".parse().expect("a CIDR");
    assert_eq!(host_bits.masked().to_string(), "10.0.0.0/8");
    let everyone: Cidr = "0.0.0.0/0".parse().expect("a CIDR");
    assert_eq!(everyone.masked(), everyone);
    for invalid in [
        "10.0.0.1",
        "10.0.0.0/33",
        "10.0.0.0/08",
        "010.0.0.0/8",
        "fe80::/64%eth0",
        "::/129",
        "a/8",
    ] {
        assert!(invalid.parse::<Cidr>().is_err(), "{invalid:?}");
    }
}

/// Go's `url.Parse` decides what is a decode problem; these are the cases the origin rules lean
/// on (go1.26 behavior).
#[test]
fn go_url_parse() {
    for refused in [
        "http://[::1",
        "https://x/%zz",
        "https://x:abc",
        "https://a:b:80",
        "https://[10.0.0.1]",
        "https://x\u{7f}",
        ":foo",
        "https://a b",
        "https://%41.lan",
    ] {
        assert!(url::parse(refused).is_err(), "{refused:?}");
    }
    let parsed = url::parse("HTTPS://[::1]:8443").expect("parses");
    assert_eq!(parsed.scheme, "https");
    assert_eq!((parsed.hostname(), parsed.port()), ("::1", "8443"));
    for accepted in [
        "*",
        "speed.example.lan",
        "https://x:",
        "https://*.x.com",
        "https://user@x",
        "ftp://x",
    ] {
        assert!(url::parse(accepted).is_ok(), "{accepted:?}");
    }
}
