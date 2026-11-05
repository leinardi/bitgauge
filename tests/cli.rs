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

//! The `bitgauge` binary's command line, run as a process: the identity check of the Docker
//! suites (`-help` is refused with exit 2), the help on stdout, and the exit statuses of a
//! command line or configuration that cannot run (`docs/rust-port.md` row 2).

use std::process::{Command, Output};

fn bitgauge(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_bitgauge"))
        .args(args)
        .env_clear()
        .output()
        .unwrap_or_else(|error| panic!("run bitgauge {args:?}: {error}"))
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// `-help` is refused with exit 2, naming `--help`: the answer the Go build differs on.
#[test]
fn single_dash_help_is_refused() {
    let output = bitgauge(&["-help"]);
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty(), "{}", text(&output.stdout));
    assert!(
        text(&output.stderr).starts_with("bitgauge: -help is not an option; write it as --help\n"),
        "{}",
        text(&output.stderr)
    );
}

/// `-h` and `--help` print the help on stdout and exit 0.
#[test]
fn help_is_printed_on_stdout() {
    for flag in ["-h", "--help"] {
        let output = bitgauge(&[flag]);
        assert_eq!(output.status.code(), Some(0), "{flag}");
        assert!(text(&output.stdout).contains("--config <PATH>"), "{flag}");
        assert!(output.stderr.is_empty(), "{flag}: {}", text(&output.stderr));
    }
}

/// Go: `TestServeExitsTwoOnInvalidConfig`, its process half: what cannot run exits 2, and a
/// health check that cannot read its configuration exits 1.
#[test]
fn exit_statuses_of_what_cannot_run() {
    let absent = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/command/testdata/absent.yaml"
    );
    for (line, want) in [
        (&["version"][..], 2),
        (&["serve", "extra"], 2),
        (&["--config"], 2),
        (&["--config", absent], 2),
        (&["serve", "--config", absent], 2),
        (&["healthcheck", "--config", absent], 1),
    ] {
        let output = bitgauge(line);
        assert_eq!(
            output.status.code(),
            Some(want),
            "{line:?}: {}",
            text(&output.stderr)
        );
    }
}

/// QA-138: `env -i` installs arguments in order; Command's own environment is sorted and would
/// mask the typo-first failure. Pure config tests cover both orders on every platform.
#[cfg(unix)]
#[test]
fn unknown_environment_descendant_exits_two_in_either_order() {
    use std::net::TcpListener;
    use std::process::Stdio;
    use std::time::Duration;
    use tokio::time::Instant;

    let probe = TcpListener::bind("127.0.0.1:0").expect("reserve a free loopback port");
    let listen = format!(
        "BITGAUGE_SERVER__LISTEN={}",
        probe.local_addr().expect("bound address")
    );
    drop(probe);
    let typo = "BITGAUGE_SERVER__LISTEN__TYPO=x";
    for entries in [[typo, listen.as_str()], [listen.as_str(), typo]] {
        let mut child = Command::new("env")
            .arg("-i")
            .args(entries)
            .args([env!("CARGO_BIN_EXE_bitgauge"), "serve"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("launch bitgauge through order-preserving env");
        let deadline = Instant::now() + Duration::from_secs(5);
        while child.try_wait().expect("query child status").is_none() {
            if Instant::now() >= deadline {
                child.kill().expect("stop erroneously accepted server");
                let output = child.wait_with_output().expect("reap accepted server");
                panic!(
                    "{entries:?}: invalid configuration started serving: {}{}",
                    text(&output.stdout),
                    text(&output.stderr)
                );
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let output = child
            .wait_with_output()
            .expect("read configuration diagnostic");
        assert_eq!(output.status.code(), Some(2), "{entries:?}");
        let diagnostic = format!("{}{}", text(&output.stdout), text(&output.stderr));
        assert!(
            diagnostic.contains("server.listen.typo"),
            "{entries:?}: {diagnostic}"
        );
        assert!(
            diagnostic.contains("unknown key"),
            "{entries:?}: {diagnostic}"
        );
    }
}
