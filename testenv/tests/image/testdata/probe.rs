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

//! The probe, the negative control of the image suite's syscall analyser (testing.md section 5;
//! Go's `test/image/testdata/probe`). It serves one HTTP request the way `bitgauge serve` does,
//! then does one thing the serve policy forbids, chosen by `-mode`, so the analyser can be shown
//! to reject it:
//!
//! - `serve`: nothing more; the trace must pass, or the analyser rejects a clean server;
//! - `connect-back`: connect to the peer that just connected in;
//! - `sendto-peer`: send a UDP datagram to the peer's address from an unconnected socket;
//! - `file-create`: create a file.
//!
//! It is one std-only file under `testdata`, so no Cargo target builds it: the image suite
//! compiles it with `rustc` as a static musl binary, which runs in the Alpine tools image.

use std::fs::File;
use std::io::{self, BufRead as _, BufReader, Write as _};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::process::ExitCode;

/// The modes, the forbidden act each one adds after the request.
const MODES: [&str; 4] = ["serve", "connect-back", "sendto-peer", "file-create"];

/// The one answer, the same bytes as the Go probe's.
const RESPONSE: &[u8] = b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nok\n";

/// Go's flag package exits 2 on a usage error.
const USAGE_EXIT: u8 = 2;

struct Flags {
    listen: String,
    mode: String,
    dir: PathBuf,
}

fn main() -> ExitCode {
    let flags = match parse_flags(std::env::args().skip(1)) {
        Ok(flags) => flags,
        Err(error) => {
            let _ = writeln!(
                io::stderr(),
                "probe: {error}\nusage: probe [-listen addr] [-mode {}] [-dir dir]",
                MODES.join("|")
            );
            return ExitCode::from(USAGE_EXIT);
        }
    };
    match run(&flags) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let _ = writeln!(io::stderr(), "probe: {error}");
            ExitCode::FAILURE
        }
    }
}

/// Go's flag syntax: `-name value`, `-name=value`, and the same with two dashes.
fn parse_flags(args: impl Iterator<Item = String>) -> Result<Flags, String> {
    let mut flags = Flags {
        listen: "127.0.0.1:18080".to_owned(),
        mode: "serve".to_owned(),
        dir: std::env::temp_dir(),
    };
    let mut args = args;
    while let Some(arg) = args.next() {
        let name = arg
            .strip_prefix("--")
            .or_else(|| arg.strip_prefix('-'))
            .ok_or_else(|| format!("unexpected argument {arg:?}"))?;
        let (name, value) = if let Some((name, value)) = name.split_once('=') {
            (name.to_owned(), value.to_owned())
        } else {
            let value = args
                .next()
                .ok_or_else(|| format!("flag needs an argument: -{name}"))?;
            (name.to_owned(), value)
        };
        match name.as_str() {
            "listen" => flags.listen = value,
            "mode" => flags.mode = value,
            "dir" => flags.dir = PathBuf::from(value),
            _ => return Err(format!("flag provided but not defined: -{name}")),
        }
    }
    Ok(flags)
}

fn run(flags: &Flags) -> Result<(), String> {
    if !MODES.contains(&flags.mode.as_str()) {
        return Err(format!("unknown mode: {:?}", flags.mode));
    }
    let listener =
        TcpListener::bind(flags.listen.as_str()).map_err(|error| format!("listen: {error}"))?;
    let (mut conn, peer) = listener
        .accept()
        .map_err(|error| format!("accept: {error}"))?;
    let mut line = String::new();
    BufReader::new(&conn)
        .read_line(&mut line)
        .map_err(|error| format!("read the request: {error}"))?;
    if !line.ends_with('\n') {
        return Err("read the request: the connection closed before a line".to_owned());
    }
    conn.write_all(RESPONSE)
        .map_err(|error| format!("respond: {error}"))?;

    // The forbidden act is attempted, and its outcome does not matter: the analyser judges the
    // attempt, so a refused connect or an undelivered datagram must fail the trace all the same.
    match flags.mode.as_str() {
        "connect-back" => connect_back(peer),
        "sendto-peer" => send_to_peer(peer)?,
        "file-create" => {
            let path = flags.dir.join("probe-was-here");
            File::create(&path).map_err(|error| format!("create: {error}"))?;
        }
        _ => {}
    }
    Ok(())
}

fn connect_back(peer: SocketAddr) {
    // Dropped at once: only the attempt counts.
    drop(TcpStream::connect(peer));
}

fn send_to_peer(peer: SocketAddr) -> Result<(), String> {
    let socket = UdpSocket::bind(SocketAddr::new(peer.ip(), 0))
        .map_err(|error| format!("open a UDP socket: {error}"))?;
    let _ = socket.send_to(b"probe", peer);
    Ok(())
}
