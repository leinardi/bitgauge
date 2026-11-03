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

//! The health check's tests (Go's `TestHealthcheckAddress` and `TestHealthcheckExitCodes`, and
//! the deadline cases of `docs/rust-port.md`) against plain listeners on loopback threads.

use std::io::{Read as _, Write as _};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

use tokio::time::Instant;

use super::{TIMEOUT, address, answers, request};
use crate::config::Config;

fn config(listen: &str, base_path: &str) -> Config {
    let mut config = Config::default();
    config.server.listen = listen.parse().expect("a listen address");
    config.server.base_path = base_path.to_owned();
    config
}

/// Go: `TestHealthcheckAddress`: every `server.listen` shape of backend.md section 6, and the
/// ping under the base path.
#[test]
fn address_of_every_listen_shape() {
    for (listen, base_path, want_address, want_line) in [
        (":8080", "/", "127.0.0.1:8080", "GET /api/v1/ping HTTP/1.1"),
        (
            "0.0.0.0:8080",
            "/",
            "127.0.0.1:8080",
            "GET /api/v1/ping HTTP/1.1",
        ),
        ("[::]:8080", "/", "[::1]:8080", "GET /api/v1/ping HTTP/1.1"),
        (
            "[::ffff:0.0.0.0]:8080",
            "/",
            "127.0.0.1:8080",
            "GET /api/v1/ping HTTP/1.1",
        ),
        (
            "192.168.1.10:8080",
            "/",
            "192.168.1.10:8080",
            "GET /api/v1/ping HTTP/1.1",
        ),
        (
            "[::ffff:192.0.2.1]:8080",
            "/",
            "192.0.2.1:8080",
            "GET /api/v1/ping HTTP/1.1",
        ),
        (
            "[fd00::5]:8080",
            "/",
            "[fd00::5]:8080",
            "GET /api/v1/ping HTTP/1.1",
        ),
        (
            "127.0.0.1:9000",
            "/speed",
            "127.0.0.1:9000",
            "GET /speed/api/v1/ping HTTP/1.1",
        ),
        (
            ":8080",
            "/speed/",
            "127.0.0.1:8080",
            "GET /speed/api/v1/ping HTTP/1.1",
        ),
    ] {
        let config = config(listen, base_path);
        let derived = address(&config.server.listen).expect("an address");
        assert_eq!(derived.to_string(), want_address, "{listen}");
        let sent = String::from_utf8(request(&config, derived)).expect("a text request");
        assert_eq!(
            sent,
            format!("{want_line}\r\nHost: {want_address}\r\nConnection: close\r\n\r\n"),
            "{listen} under {base_path}"
        );
    }
}

/// A zone is the address's scope, and not part of the Host header.
#[test]
fn a_zone_is_the_scope() {
    let config = config("[fe80::1%7]:8080", "/");
    let derived = address(&config.server.listen).expect("an address");
    let SocketAddr::V6(v6) = derived else {
        panic!("not IPv6: {derived}");
    };
    assert_eq!(v6.scope_id(), 7);
    let sent = String::from_utf8(request(&config, derived)).expect("a text request");
    assert!(sent.contains("\r\nHost: [fe80::1]:8080\r\n"), "{sent}");
}

/// A server on loopback that accepts one connection, reads its request head and hands the
/// stream to `answer`; the thread returns the request it read.
fn server(
    answer: impl FnOnce(TcpStream) + Send + 'static,
) -> (Config, thread::JoinHandle<String>, TcpListener) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a listener");
    let address = listener.local_addr().expect("an address");
    let accepting = listener.try_clone().expect("a second handle");
    let handle = thread::spawn(move || {
        let (mut stream, _) = accepting.accept().expect("a connection");
        let mut head = Vec::new();
        let mut byte = [0_u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            if stream.read(&mut byte).expect("the request") == 0 {
                break;
            }
            head.push(byte[0]);
        }
        answer(stream);
        String::from_utf8(head).expect("a text request")
    });
    (config(&address.to_string(), "/"), handle, listener)
}

/// No second connection reached `listener`.
fn assert_one_connection(listener: &TcpListener) {
    listener.set_nonblocking(true).expect("non-blocking");
    assert!(listener.accept().is_err(), "a second connection");
}

/// Go: `TestHealthcheckExitCodes`: only 204 passes, one request is sent, and a redirect is not
/// followed.
#[test]
fn only_a_204_passes() {
    for (status_line, want) in [
        ("HTTP/1.1 204 No Content", true),
        ("HTTP/1.1 204", true),
        ("HTTP/1.0 204 No Content", true),
        ("HTTP/1.1 200 OK", false),
        ("HTTP/1.1 302 Found\r\nLocation: /elsewhere", false),
        ("HTTP/1.1 500 Internal Server Error", false),
        ("HTTP/1.1 2040 Odd", false),
        ("HTTP/2 204", false),
        ("HTTP/1.x 204", false),
    ] {
        let line = status_line.to_owned();
        let (config, handle, listener) = server(move |mut stream| {
            let _ = stream.write_all(format!("{line}\r\nContent-Length: 0\r\n\r\n").as_bytes());
        });
        assert_eq!(answers(&config), want, "{status_line}");
        let request = handle.join().expect("the server thread");
        assert!(
            request.starts_with("GET /api/v1/ping HTTP/1.1\r\n"),
            "{request}"
        );
        assert_one_connection(&listener);
    }
}

/// A server that accepts and never answers fails the check at the deadline.
#[test]
fn a_server_that_never_answers_fails_at_the_deadline() {
    let (config, _handle, _listener) = server(|stream| {
        thread::sleep(TIMEOUT * 2);
        drop(stream);
    });
    let start = Instant::now();
    assert!(!answers(&config));
    let elapsed = start.elapsed();
    assert!(
        elapsed + Duration::from_millis(50) >= TIMEOUT,
        "{elapsed:?}"
    );
    assert!(elapsed < TIMEOUT + Duration::from_secs(1), "{elapsed:?}");
}

/// One byte every 500 ms never completes the status line in time: the deadline holds across
/// reads, each of which alone would be in time.
#[test]
fn a_dribbled_answer_fails_by_the_deadline() {
    let (config, _handle, _listener) = server(|mut stream| {
        for byte in b"HTTP/1.1 204 No Content\r\n\r\n" {
            if stream.write_all(&[*byte]).is_err() {
                return;
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
    let start = Instant::now();
    assert!(!answers(&config));
    let elapsed = start.elapsed();
    assert!(elapsed < TIMEOUT + Duration::from_secs(1), "{elapsed:?}");
}

/// A status line longer than 512 bytes fails at once.
#[test]
fn an_oversized_status_line_fails() {
    let (config, _handle, _listener) = server(|mut stream| {
        let _ = stream.write_all(&[b'x'; 600]);
        thread::sleep(TIMEOUT * 2);
    });
    let start = Instant::now();
    assert!(!answers(&config));
    assert!(
        start.elapsed() < Duration::from_secs(1),
        "{:?}",
        start.elapsed()
    );
}

/// Nothing listening fails at once.
#[test]
fn a_refused_connection_fails() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a listener");
    let address = listener.local_addr().expect("an address");
    drop(listener);
    let start = Instant::now();
    assert!(!answers(&config(&address.to_string(), "/")));
    assert!(
        start.elapsed() < Duration::from_secs(1),
        "{:?}",
        start.elapsed()
    );
}
