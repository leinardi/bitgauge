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

//! Go's `probe_test.go`: the negative control of the syscall layer.

use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::Path;
use std::process::Command;

use testenv::runner::{Test, TestResult};
use testenv::syscalltrace::check_serve;
use testenv::toolgate::repo_root;

use crate::{Suite, docker, docker_with, environment, eventually, read_trace, strace};

/// Where the probe listens, inside the tracer's own namespace.
const PROBE_LISTEN: SocketAddr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 18080));
/// The probe's source, relative to the repository root.
const PROBE_SOURCE: &str = "testenv/tests/image/testdata/probe.rs";

/// Each mode, and the reason the serve policy must reject it for; empty for the clean one.
const MODES: [(&str, &str); 4] = [
    ("serve", ""),
    ("connect-back", "serve may not connect"),
    ("sendto-peer", "a send with an explicit destination address"),
    ("file-create", "with write intent on /tmp/probe-was-here"),
];

/// Go: `TestProbe`: the negative control of the syscall layer. The probe is traced exactly the
/// way `bitgauge serve` is, in each of its modes, and the serve policy must pass the clean one
/// and reject each forbidden act for its own reason. A forbidden act that passes fails the test
/// as "analyser blind" -- the layer would then pass the real binary without having looked. The
/// subtests run one after another, where Go ran them in parallel.
pub fn probe(test: &Test, suite: &Suite) -> TestResult {
    let bin_dir = test.temp_dir()?;
    build_probe(test, &bin_dir)?;
    for (mode, reason) in MODES {
        test.run(mode, |test| probe_mode(test, suite, &bin_dir, mode, reason));
    }
    Ok(())
}

fn probe_mode(test: &Test, suite: &Suite, bin_dir: &Path, mode: &str, reason: &str) -> TestResult {
    let env = environment(test, suite)?;
    let dir = test.temp_dir()?;
    let tracer = env.name("probe");

    let listen = PROBE_LISTEN.to_string();
    let volume = format!("{}:/probe:ro", bin_dir.display());
    let args = strace(
        test,
        suite,
        "none",
        &dir,
        mode,
        &[
            "/probe/probe",
            "-mode",
            mode,
            "-listen",
            &listen,
            "-dir",
            "/tmp",
        ],
    )?;
    docker_with(
        test,
        &env,
        &["run", "--detach", "--name", &tracer, "--volume", &volume],
        &args,
    )?;

    // The probe serves one request and exits; until it listens, wget is refused.
    let url = format!("http://{listen}/");
    eventually(test, "the probe's request", || {
        env.docker(&["exec", &tracer, "wget", "-q", "-O", "/dev/null", &url])
            .map(drop)
            .map_err(|error| format!("request the probe: {error}"))
    })?;

    let code = docker(test, &env, &["wait", &tracer])?;
    if code != "0" {
        let logs = docker(test, &env, &["logs", &tracer])?;
        return Err(test.fatal(format!("the probe exited {code}:\n{logs}")));
    }

    let (violations, stats) = check_serve(&read_trace(test, &dir, mode)?, PROBE_LISTEN);
    if stats.accepted_sends == 0 {
        return Err(test.fatal(format!(
            "analyser blind: the trace shows no send on the accepted connection ({stats:?})"
        )));
    }

    if reason.is_empty() {
        if !violations.is_empty() {
            test.error(format!("the clean probe was rejected: {violations:#?}"));
        }
        return Ok(());
    }
    if !violations
        .iter()
        .any(|violation| violation.reason.contains(reason))
    {
        test.error(format!(
            "analyser blind: {mode} was not rejected for {reason:?}: {violations:#?}"
        ));
    }
    Ok(())
}

/// The Rust target of a static binary for this host's architecture, which the tools image runs.
fn musl_target() -> String {
    format!("{}-unknown-linux-musl", std::env::consts::ARCH)
}

/// Compiles the probe into `dir` as a static musl binary. `rustc` runs in the repository root,
/// so `rust-toolchain.toml` picks the toolchain and its musl targets; the probe is std-only, so
/// no Cargo target, lock file or registry is involved.
fn build_probe(test: &Test, dir: &Path) -> TestResult {
    let root = repo_root();
    let output = Command::new("rustc")
        .current_dir(&root)
        .args(["--edition", "2024", "-C", "opt-level=2", "--target"])
        .arg(musl_target())
        .arg("-o")
        .arg(dir.join("probe"))
        .arg(root.join(PROBE_SOURCE))
        .output()
        .map_err(|error| test.fatal(format!("run rustc to build the probe: {error}")))?;
    if !output.status.success() {
        return Err(test.fatal(format!(
            "build the probe ({}): {}\n{}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(())
}
