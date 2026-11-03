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

//! The server as the binary runs it, through `command::run` in `Mode::Process`: SIGTERM and
//! SIGINT blocked before the multi-thread runtime, the global logger, and the signal thread on
//! the token the connection driver watches (`backend.md` §5). A first signal ends it with exit
//! status 0 after "stopped"; a second one during a held shutdown ends it by the signal.
//!
//! Signals are process-wide, so each case runs in a child: the test re-runs its own binary with
//! `BITGAUGE_PROCESS_CHILD` set, and the child calls `command::run` from its only thread with a
//! scratch SPA, since a checkout that has not built the SPA embeds none. A plain `main`
//! (`harness = false`), because libtest's own threads would not have the signals blocked.

mod support;

use std::ffi::OsString;
use std::io::{self, BufRead as _, BufReader, Read as _, Write as _};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::unix::process::ExitStatusExt as _;
use std::process::{Child, Command, ExitCode, ExitStatus, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use bitgauge::command::{self, Mode, Process};
use bitgauge::server::conn::Lifecycle;
use bitgauge::web::{Files, ROOT_ASSETS, RenderError, Spa};
use bytes::Bytes;
use nix::sys::signal::{Signal, kill};
use nix::unistd::Pid;
use serde_json::Value;

use support::dial_loopback;

const CHILD: &str = "BITGAUGE_PROCESS_CHILD";

/// How long the parent waits for each step of the child.
const STEP: Duration = Duration::from_secs(15);

/// The default `limits.max_download_bytes`: far more than the socket buffers hold, so an
/// unread download stays in flight for the whole grace.
const HELD_DOWNLOAD: u64 = 256 * 1024 * 1024;

fn render_scratch(base_path: &str) -> Result<Spa, RenderError> {
    let mut files = Files::new();
    files.insert(
        "index.html".to_owned(),
        Bytes::from_static(
            br#"<meta name="bitgauge-base-path" content="/" /><script type="module" src="./assets/index-a1.js"></script>"#,
        ),
    );
    files.insert(
        "assets/index-a1.js".to_owned(),
        Bytes::from_static(b"export {}"),
    );
    for (name, _) in ROOT_ASSETS {
        files.insert(name.to_owned(), Bytes::from_static(name.as_bytes()));
    }
    Spa::render_files(files, base_path)
}

/// The child: the server as `main.rs` runs it, with the parent's `BITGAUGE_` settings.
fn child() -> ExitCode {
    let fixture = format!(
        "{}/src/command/testdata/empty.yaml",
        env!("CARGO_MANIFEST_DIR")
    );
    command::run(
        [
            OsString::from("serve"),
            OsString::from("--config"),
            OsString::from(fixture),
        ],
        Process {
            stdout: io::stdout,
            stderr: io::stderr,
            environment: std::env::vars()
                .filter(|(name, _)| name.starts_with("BITGAUGE_") && name != CHILD)
                .collect(),
            render: render_scratch,
            mode: Mode::Process,
            lifecycle: Lifecycle::new(),
        },
    )
}

/// A running child, with its stdout read line by line on a thread of its own.
struct Server {
    process: Child,
    pid: Pid,
    records: mpsc::Receiver<Value>,
    address: SocketAddr,
}

impl Server {
    /// Starts a child on a free loopback port and waits for its startup line.
    fn start() -> Self {
        let exe = std::env::current_exe().unwrap_or_else(|error| panic!("own path: {error}"));
        // Validation refuses port 0, so a free port is taken and released for the child.
        let address = TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .unwrap_or_else(|error| panic!("a free port: {error}"));
        let mut process = Command::new(exe)
            .env_clear()
            .env(CHILD, "1")
            .env("BITGAUGE_SERVER__LISTEN", address.to_string())
            .env("BITGAUGE_LOG__FORMAT", "json")
            .stdout(Stdio::piped())
            .spawn()
            .unwrap_or_else(|error| panic!("start the child: {error}"));
        let pid =
            Pid::from_raw(i32::try_from(process.id()).unwrap_or_else(|error| panic!("{error}")));
        let stdout = process
            .stdout
            .take()
            .unwrap_or_else(|| panic!("the child's stdout"));
        let (sender, records) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                // A line that is not JSON is kept as text, so it still shows in a failure.
                let record = serde_json::from_str(&line).unwrap_or(Value::String(line));
                if sender.send(record).is_err() {
                    return;
                }
            }
        });
        let server = Self {
            process,
            pid,
            records,
            address,
        };
        let starting = server.expect("starting");
        assert_eq!(starting["listen"], address.to_string(), "{starting}");
        server
    }

    /// Waits for the record logged with `message`, and returns it.
    fn expect(&self, message: &str) -> Value {
        loop {
            let record = self.records.recv_timeout(STEP).unwrap_or_else(|error| {
                let _ = kill(self.pid, Signal::SIGKILL);
                panic!("the child did not log {message:?}: {error}")
            });
            if record["message"] == message {
                return record;
            }
        }
    }

    fn signal(&self, signal: Signal) {
        kill(self.pid, signal).unwrap_or_else(|error| panic!("send {signal}: {error}"));
    }

    /// Opens a connection and sends `request` on it.
    fn send(&self, request: &str) -> TcpStream {
        let mut stream = dial_loopback(self.address);
        stream
            .write_all(request.as_bytes())
            .unwrap_or_else(|error| panic!("send the request: {error}"));
        stream
    }

    /// Waits for the child to end, killing it if it outlives the step.
    fn wait(self) -> ExitStatus {
        let Self {
            mut process, pid, ..
        } = self;
        let (sender, done) = mpsc::channel();
        thread::spawn(move || {
            let _ = sender.send(process.wait());
        });
        done.recv_timeout(STEP)
            .unwrap_or_else(|error| {
                let _ = kill(pid, Signal::SIGKILL);
                panic!("the child did not end: {error}")
            })
            .unwrap_or_else(|error| panic!("wait for the child: {error}"))
    }
}

/// One SIGINT: the server answers before it, logs "shutting down" and "stopped", and exits 0.
fn one_signal_stops_with_exit_zero() {
    let server = Server::start();
    let mut stream =
        server.send("GET /api/v1/ping HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
    let mut answer = String::new();
    stream
        .read_to_string(&mut answer)
        .unwrap_or_else(|error| panic!("read the answer: {error}"));
    assert!(answer.starts_with("HTTP/1.1 204 "), "{answer}");
    server.signal(Signal::SIGINT);
    server.expect("shutting down");
    server.expect("stopped");
    let status = server.wait();
    assert_eq!(status.code(), Some(0), "{status:?}");
}

/// A second SIGTERM while a download holds the shutdown inside its grace ends the process by
/// the signal.
fn a_second_signal_ends_a_held_shutdown() {
    let server = Server::start();
    let mut stream = server.send(&format!(
        "GET /api/v1/download?bytes={HELD_DOWNLOAD} HTTP/1.1\r\nHost: x\r\n\r\n"
    ));
    // The response has started, and the rest is left unread.
    let mut head = [0_u8; 12];
    stream
        .read_exact(&mut head)
        .unwrap_or_else(|error| panic!("read the head: {error}"));
    assert_eq!(&head, b"HTTP/1.1 200");
    server.signal(Signal::SIGTERM);
    server.expect("shutting down");
    server.signal(Signal::SIGTERM);
    let status = server.wait();
    assert_eq!(
        status.signal(),
        Some(Signal::SIGTERM as i32),
        "the child did not die by SIGTERM: {status:?}"
    );
    drop(stream);
}

fn main() -> ExitCode {
    if std::env::var_os(CHILD).is_some() {
        return child();
    }
    one_signal_stops_with_exit_zero();
    a_second_signal_ends_a_held_shutdown();
    let mut stdout = io::stdout();
    let _ = writeln!(
        stdout,
        "process_mode: one signal exits 0, a second one ends a held shutdown"
    );
    ExitCode::SUCCESS
}
