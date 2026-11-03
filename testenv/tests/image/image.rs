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

//! Go's `image_test.go`: the plan's sequence over the image under test.

use std::fs;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};

use testenv::env::Env;
use testenv::identity::{self, BINARY_NAME};
use testenv::netguard::{self, Guard, Options};
use testenv::runner::{OrFatal as _, Test, TestResult};
use testenv::syscalltrace::{check_healthcheck, check_serve};

use crate::{LISTEN_PORT, Suite, docker, docker_with, environment, eventually, read_trace, strace};

/// The uid and gid the image runs as.
const RUNTIME_UID: &str = "65532";
/// The default `server.listen`, `:8080`, as the serve policy reads it.
const LISTEN_ALL: SocketAddr =
    SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, LISTEN_PORT));
/// Where the healthcheck connects for `:8080` (backend.md section 6).
const HEALTHCHECK_TARGET: SocketAddr =
    SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, LISTEN_PORT));

/// Go: `TestImage`: the plan's sequence over the image under test. The steps share the image and
/// the guard, and each depends on the one before, so they are one test rather than independent
/// ones.
pub fn image(test: &Test, suite: &Suite) -> TestResult {
    let env = environment(test, suite)?;
    let image = suite.identity.image.as_str();

    let network = env.name("net");
    docker(test, &env, &["network", "create", "--internal", &network])?;

    // 1. The guard is prepared -- rules, sink, negative controls, reset -- before BitGauge starts.
    let guard = netguard::start(
        &env,
        &Options {
            tools_image: suite.tools_image.clone(),
            network: network.clone(),
            listen_port: LISTEN_PORT,
            without_sink_routes: false,
        },
    )
    .or_fatal(test)?;

    let server = env.name("bitgauge");
    let network_mode = guard.network_mode();
    docker(
        test,
        &env,
        &[
            "run",
            "--detach",
            "--pull",
            "never",
            "--name",
            &server,
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            &network_mode,
            "--health-interval",
            "1s",
            image,
        ],
    )?;

    // 2. Unprivileged, and healthy both by the image's HEALTHCHECK and by the subcommand, run
    // once the server is known to be up so a slow start is not a failure.
    assert_unprivileged(test, &env, &server)?;
    wait_healthy(test, &env, &server)?;
    docker(test, &env, &["exec", &server, "/bitgauge", "healthcheck"])?;

    // 3. The API and the SPA answer, fetched from inside the guard's namespace.
    assert_serves(test, |path| guard_get(&guard, path))?;

    docker(test, &env, &["rm", "--force", &server])?;

    // 6. The syscall layer, on the same guard: serve traced from process start, the healthcheck
    // in its own session.
    trace_syscalls(test, suite, &env, &guard)?;

    // 4. No packet left the namespace, from the server's start to here.
    let counters = guard.counters().or_fatal(test)?;
    if !counters.zero() {
        test.error(format!(
            "packets tried to leave BitGauge's namespace: {counters}"
        ));
    }

    // 5. Writable, it still writes nothing.
    assert_writes_nothing(test, suite, &env, &network)
}

/// `wget` of `path` on the listen port, from inside the guard's namespace.
fn guard_get(guard: &Guard, path: &str) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{LISTEN_PORT}{path}");
    guard
        .exec(&["wget", "-q", "-O", "-", &url])
        .map_err(|error| error.to_string())
}

fn assert_unprivileged(test: &Test, env: &Env, container: &str) -> TestResult {
    let user = docker(
        test,
        env,
        &["inspect", "--format", "{{.Config.User}}", container],
    )?;
    if user != format!("{RUNTIME_UID}:{RUNTIME_UID}") {
        test.error(format!(
            "the container runs as {user:?}, want {RUNTIME_UID}:{RUNTIME_UID}"
        ));
    }

    // docker top refuses a format without the PID column, so it is asked for and skipped.
    let processes = docker(test, env, &["top", container, "-eo", "pid,uid,gid"])?;
    let lines: Vec<&str> = processes.split('\n').collect();
    if lines.len() < 2 {
        return Err(test.fatal(format!("docker top shows no process:\n{processes}")));
    }
    for line in &lines[1..] {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() != 3 {
            return Err(test.fatal(format!("unexpected docker top line {line:?}")));
        }
        for id in &fields[1..] {
            if *id != RUNTIME_UID {
                test.error(format!(
                    "a process runs with uid/gid {id:?}, want {RUNTIME_UID}: {line}"
                ));
            }
        }
    }
    Ok(())
}

fn wait_healthy(test: &Test, env: &Env, container: &str) -> TestResult {
    eventually(test, "the health status", || {
        let status = env
            .docker(&["inspect", "--format", "{{.State.Health.Status}}", container])
            .map_err(|error| format!("inspect {container}: {error}"))?;
        let status = status.trim();
        if status == "healthy" {
            Ok(())
        } else {
            Err(format!("not healthy: {status}"))
        }
    })
}

/// Fetches `/api/v1/info` and `/`. wget exits non-zero on any status of 400 and above, so a body
/// coming back is a success status.
fn assert_serves(test: &Test, get: impl Fn(&str) -> Result<String, String>) -> TestResult {
    let mut info = serde_json::Map::new();
    eventually(test, "GET /api/v1/info", || {
        let body = get("/api/v1/info")?;
        info = serde_json::from_str(&body)
            .map_err(|error| format!("decode the info response: {error}"))?;
        Ok(())
    })?;
    if info.is_empty() {
        test.error("GET /api/v1/info returned an empty object");
    }

    let page = get("/").map_err(|error| test.fatal(format!("GET /: {error}")))?;
    if !page.to_lowercase().contains("<html") {
        test.error(format!("GET / did not serve the SPA:\n{page}"));
    }
    Ok(())
}

/// Runs the image without `--read-only` and checks that its filesystem did not change: it does
/// not even try to write.
fn assert_writes_nothing(test: &Test, suite: &Suite, env: &Env, network: &str) -> TestResult {
    let server = env.name("writable");
    docker(
        test,
        env,
        &[
            "run",
            "--detach",
            "--pull",
            "never",
            "--name",
            &server,
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            network,
            "--health-interval",
            "1s",
            &suite.identity.image,
        ],
    )?;

    wait_healthy(test, env, &server)?;
    assert_serves(test, |path| {
        let url = format!("http://{server}:{LISTEN_PORT}{path}");
        env.docker(&[
            "run",
            "--rm",
            "--network",
            network,
            &suite.tools_image,
            "wget",
            "-q",
            "-O",
            "-",
            &url,
        ])
        .map_err(|error| error.to_string())
    })?;

    let diff = docker(test, env, &["diff", &server])?;
    if !diff.is_empty() {
        test.error(format!("the container changed its filesystem:\n{diff}"));
    }
    Ok(())
}

/// Runs the binary the identity check copied out of the image, and proved to be the layer's,
/// under strace in the tools image on the guard's namespace.
fn trace_syscalls(test: &Test, suite: &Suite, env: &Env, guard: &Guard) -> TestResult {
    let dir = test.temp_dir()?;
    let binary = dir.join(BINARY_NAME);
    // A copy into the trace directory, which the tracer mounts; checked again, so what runs is
    // the checked binary byte for byte.
    fs::copy(&suite.identity.binary, &binary).map_err(|error| {
        test.fatal(format!(
            "copy {} to {}: {error}",
            suite.identity.binary.display(),
            binary.display()
        ))
    })?;
    let copied = fs::read(&binary)
        .map_err(|error| test.fatal(format!("read {}: {error}", binary.display())))?;
    let sum = identity::sha256_hex(&copied);
    if sum != suite.identity.sha256 {
        return Err(test.fatal(format!(
            "the traced binary (sha256 {sum}) is not the checked one ({})",
            suite.identity.sha256
        )));
    }

    let network_mode = guard.network_mode();
    let tracer = env.name("trace-serve");
    let serve = strace(
        test,
        suite,
        &network_mode,
        &dir,
        "serve",
        &["/trace/bitgauge", "serve"],
    )?;
    docker_with(test, env, &["run", "--detach", "--name", &tracer], &serve)?;

    assert_serves(test, |path| guard_get(guard, path))?;

    let healthcheck = strace(
        test,
        suite,
        &network_mode,
        &dir,
        "healthcheck",
        &["/trace/bitgauge", "healthcheck"],
    )?;
    docker_with(test, env, &["run", "--rm"], &healthcheck)?;

    docker(test, env, &["stop", "--time", "10", &tracer])?;

    let (violations, stats) = check_serve(&read_trace(test, &dir, "serve")?, LISTEN_ALL);
    if stats.accepted_sends == 0 {
        test.error(format!(
            "analyser blind: the serve trace shows no send on an accepted connection ({stats:?})"
        ));
    }
    for violation in &violations {
        test.error(format!("serve: {violation}"));
    }

    let (violations, stats) =
        check_healthcheck(&read_trace(test, &dir, "healthcheck")?, HEALTHCHECK_TARGET);
    if stats.accepted_sends == 0 {
        test.error(format!(
            "analyser blind: the healthcheck trace shows no request sent ({stats:?})"
        ));
    }
    for violation in &violations {
        test.error(format!("healthcheck: {violation}"));
    }
    Ok(())
}
