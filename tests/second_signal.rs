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

//! A second SIGTERM during shutdown ends the process at once, by the signal (`backend.md` §5).
//!
//! Signals are process-wide, so this runs in a child process: the test re-runs its own binary
//! with `BITGAUGE_SIGNAL_CHILD` set. The child blocks the signals in its only thread before
//! starting any other, starts the signal thread, reports "ready", reports "stopping" once the
//! first signal cancelled `stop`, and then waits as a server inside its grace would. The parent
//! sends the second signal and expects the child to die by it. A plain `main` (`harness = false`),
//! because libtest's own threads would not have the signals blocked.

use std::io::{self, BufRead as _, BufReader, Write as _};
use std::process::{Command, ExitCode, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use bitgauge::server::signals::{block_shutdown_signals, spawn_signal_thread};
use nix::sys::signal::{Signal, kill};
use nix::unistd::Pid;
use std::os::unix::process::ExitStatusExt as _;
use tokio_util::sync::CancellationToken;

const CHILD: &str = "BITGAUGE_SIGNAL_CHILD";

/// How long the parent waits for each step of the child.
const STEP: Duration = Duration::from_secs(10);

fn child() -> ExitCode {
    block_shutdown_signals().unwrap_or_else(|error| panic!("block the signals: {error}"));
    let stop = CancellationToken::new();
    spawn_signal_thread(stop.clone()).unwrap_or_else(|error| panic!("start the thread: {error}"));
    let mut stdout = io::stdout();
    writeln!(stdout, "ready")
        .and_then(|()| stdout.flush())
        .unwrap_or_else(|error| panic!("{error}"));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .unwrap_or_else(|error| panic!("build the runtime: {error}"));
    runtime.block_on(stop.cancelled());
    writeln!(stdout, "stopping")
        .and_then(|()| stdout.flush())
        .unwrap_or_else(|error| panic!("{error}"));
    // Inside the grace: only the second signal can end this.
    thread::sleep(STEP * 3);
    ExitCode::SUCCESS
}

/// Waits for the child to print `line`.
fn expect_line(lines: &mpsc::Receiver<String>, line: &str) {
    let got = lines
        .recv_timeout(STEP)
        .unwrap_or_else(|error| panic!("the child did not print {line:?}: {error}"));
    assert_eq!(got, line);
}

fn parent() -> ExitCode {
    let exe = std::env::current_exe().unwrap_or_else(|error| panic!("own path: {error}"));
    let mut child = Command::new(exe)
        .env(CHILD, "1")
        .stdout(Stdio::piped())
        .spawn()
        .unwrap_or_else(|error| panic!("start the child: {error}"));
    let pid = Pid::from_raw(i32::try_from(child.id()).unwrap_or_else(|error| panic!("{error}")));
    let stdout = child
        .stdout
        .take()
        .unwrap_or_else(|| panic!("the child's stdout"));
    let (sender, lines) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                return;
            }
        }
    });
    expect_line(&lines, "ready");
    kill(pid, Signal::SIGTERM).unwrap_or_else(|error| panic!("first signal: {error}"));
    expect_line(&lines, "stopping");
    kill(pid, Signal::SIGTERM).unwrap_or_else(|error| panic!("second signal: {error}"));
    let (sender, done) = mpsc::channel();
    thread::spawn(move || {
        let _ = sender.send(child.wait());
    });
    let status = done
        .recv_timeout(STEP)
        .unwrap_or_else(|error| {
            let _ = kill(pid, Signal::SIGKILL);
            panic!("the child outlived the second signal: {error}")
        })
        .unwrap_or_else(|error| panic!("wait for the child: {error}"));
    assert_eq!(
        status.signal(),
        Some(Signal::SIGTERM as i32),
        "the child did not die by SIGTERM: {status:?}"
    );
    let mut stdout = io::stdout();
    let _ = writeln!(stdout, "second_signal: the child died by SIGTERM");
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    if std::env::var_os(CHILD).is_some() {
        child()
    } else {
        parent()
    }
}
