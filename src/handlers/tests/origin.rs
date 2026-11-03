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

//! The request origin, the host check and the origin normalization.

use http::Request;

use crate::clientip::Client;
use crate::handlers::{RequestOrigin, normalize_origin, request_origin, valid_host};

fn origin_request(peer_trusted: Option<bool>, headers: &[(&str, &str)]) -> Request<()> {
    let mut builder = Request::get("/nq/config").header("host", "speed.lan:8080");
    for &(name, value) in headers {
        builder = builder.header(name, value);
    }
    let mut request = builder.body(()).expect("a request");
    if let Some(peer_trusted) = peer_trusted {
        request.extensions_mut().insert(Client {
            address: "172.20.0.2".parse().expect("an address"),
            peer_trusted,
        });
    }
    request
}

/// One row of `request_origins`.
struct Case<'case> {
    name: &'case str,
    headers: &'case [(&'case str, &'case str)],
    peer_trusted: bool,
    public_url: &'case str,
    base_path: &'case str,
    want: &'case str,
    secure: bool,
}

/// Go: `TestRequestOrigin`
#[test]
fn request_origins() {
    let forwarded = [
        ("X-Forwarded-Proto", "HTTPS, http"),
        ("X-Forwarded-Host", " speed.example , internal:9000"),
    ];
    let cases = [
        Case {
            name: "an untrusted peer's own host",
            headers: &[],
            peer_trusted: false,
            public_url: "",
            base_path: "",
            want: "http://speed.lan:8080",
            secure: false,
        },
        Case {
            name: "an untrusted peer's forwarding headers are ignored",
            headers: &forwarded,
            peer_trusted: false,
            public_url: "",
            base_path: "",
            want: "http://speed.lan:8080",
            secure: false,
        },
        Case {
            name: "a trusted proxy's first values",
            headers: &forwarded,
            peer_trusted: true,
            public_url: "",
            base_path: "",
            want: "https://speed.example",
            secure: true,
        },
        Case {
            name: "a trusted proxy without forwarding headers",
            headers: &[],
            peer_trusted: true,
            public_url: "",
            base_path: "",
            want: "http://speed.lan:8080",
            secure: false,
        },
        Case {
            name: "a scheme neither http nor https",
            headers: &[("X-Forwarded-Proto", "ftp")],
            peer_trusted: true,
            public_url: "",
            base_path: "",
            want: "http://speed.lan:8080",
            secure: false,
        },
        Case {
            name: "an invalid forwarded host",
            headers: &[("X-Forwarded-Host", "evil.example/path")],
            peer_trusted: true,
            public_url: "",
            base_path: "",
            want: "http://speed.lan:8080",
            secure: false,
        },
        Case {
            name: "the base path without its trailing slash",
            headers: &[],
            peer_trusted: false,
            public_url: "",
            base_path: "/speed/",
            want: "http://speed.lan:8080/speed",
            secure: false,
        },
        Case {
            name: "public_url wins",
            headers: &forwarded,
            peer_trusted: true,
            public_url: "https://speed.example.org/",
            base_path: "/speed/",
            want: "https://speed.example.org/speed",
            secure: true,
        },
        Case {
            name: "an http public_url",
            headers: &[],
            peer_trusted: false,
            public_url: "http://10.0.0.5:8080",
            base_path: "",
            want: "http://10.0.0.5:8080",
            secure: false,
        },
    ];
    for case in cases {
        let request = origin_request(Some(case.peer_trusted), case.headers);
        assert_eq!(
            request_origin(&request, case.public_url, case.base_path),
            RequestOrigin {
                url: case.want.to_owned(),
                secure: case.secure,
            },
            "{}",
            case.name
        );
    }
}

/// Go: `TestRequestOriginWithoutTheMiddleware`
#[test]
fn request_origin_without_the_middleware() {
    let mut request = origin_request(
        None,
        &[
            ("X-Forwarded-Proto", "https"),
            ("X-Forwarded-Host", "speed.example"),
        ],
    );
    request
        .headers_mut()
        .insert("host", "speed.lan".parse().expect("a header value"));
    assert_eq!(
        request_origin(&request, "", "/"),
        RequestOrigin {
            url: "http://speed.lan".to_owned(),
            secure: false
        },
        "forwarding headers read without a trusted peer"
    );
}

/// An absolute-form target names the host, as Go's `Request.Host` does (no Go test).
#[test]
fn an_absolute_target_names_the_host() {
    let request = Request::get("http://direct.example:81/nq/config")
        .header("host", "ignored.example")
        .body(())
        .expect("a request");
    assert_eq!(
        request_origin(&request, "", "/").url,
        "http://direct.example:81"
    );
    let with_userinfo = Request::get("http://user:secret@direct.example:81/nq/config")
        .body(())
        .expect("a request");
    assert_eq!(
        request_origin(&with_userinfo, "", "/").url,
        "http://direct.example:81",
        "the userinfo is not part of the host"
    );
}

/// Go: `TestValidHost`
#[test]
fn valid_hosts() {
    let long_label = format!("{}.example", "a".repeat(63));
    for host in [
        "speed.example",
        "speed.example:8443",
        "localhost",
        "10.0.0.5:8080",
        "a-b.example",
        "host:1",
        "host:65535",
        &long_label,
    ] {
        assert!(valid_host(host), "{host:?}");
    }
    let too_long = format!("{}.example", "a".repeat(64));
    for host in [
        "",
        "evil.example; script-src *",
        "a b",
        "exa_mple.com",
        "-bad.example",
        "bad-.example",
        "bad..example",
        "host:",
        "host:0",
        "host:65536",
        "host:8a",
        "[::1]",
        "[::1]:8080",
        "evil.example/path",
        &too_long,
    ] {
        assert!(!valid_host(host), "{host:?}");
    }
}

/// `NormalizeOrigin` had no test of its own in Go (`TestWebSocketOrigin` covers it, phase 10);
/// these are its cases.
#[test]
fn normalized_origins() {
    for (origin, want) in [
        ("https://Speed.Example", Some("https://speed.example")),
        ("HTTP://speed.example:80", Some("http://speed.example")),
        ("https://speed.example:443", Some("https://speed.example")),
        ("http://speed.example:443", Some("http://speed.example:443")),
        (
            "https://speed.example:8443/path?q",
            Some("https://speed.example:8443"),
        ),
        ("http://[FD00::1]:8080", Some("http://[fd00::1]:8080")),
        ("http://[::1]", Some("http://[::1]")),
        ("null", None),
        ("speed.example", None),
        ("http://", None),
        ("http://%zz", None),
    ] {
        assert_eq!(normalize_origin(origin).as_deref(), want, "{origin:?}");
    }
}
