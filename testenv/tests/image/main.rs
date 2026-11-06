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

//! The image suite (feature `image`; Go's `test/image`, build tag `image`): what the image under
//! test does once started (testing.md section 5, build-packaging.md section 1): read-only and
//! unprivileged, healthy, serving the API and the SPA, sending no packet out, writing nothing,
//! and -- under strace from process start -- attempting no connection and no file write. The
//! probe proves the syscall analyser can see.
//!
//! The suite never builds BitGauge's image: the make target builds it and names it in
//! `BITGAUGE_TEST_IMAGE`, with `BITGAUGE_TEST_IMPL` (go or rust) and `BITGAUGE_TEST_COMMIT`. Before
//! any test the setup checks that the image is that implementation at that commit (the
//! [`testenv::identity`] check), and that the other implementation's expectation is refused, so
//! the check is shown to tell the two apart. A missing variable or any mismatch fails the run; it
//! never skips. Run it with `make rust-test-image BITGAUGE_TEST_IMPL=go|rust`; `--run <pattern>`
//! selects tests with Go's `-run` semantics.

mod image;
mod probe;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use tempfile::TempDir;
use testenv::docker::DockerCli;
use testenv::env::{Env, EnvGuard, Provider, Spec, new_provider};
use testenv::envid::TEMP_DIR_PREFIX;
use testenv::identity::{self, Expectation, Identity, IdentityError};
use testenv::logger::Logger;
use testenv::netguard;
use testenv::runner::{self, Fatal, OrFatal as _, Test, TestCase, TestResult};
use testenv::sweep;
use testenv::syscalltrace::{self, Event, TRACE_SET};
use testenv::toolgate::repo_root;

/// BitGauge's listen port in the image suite.
const LISTEN_PORT: u16 = 8080;
/// How often [`eventually`] retries.
const POLL_EVERY: Duration = Duration::from_millis(200);
/// How long [`eventually`] retries.
const POLL_TIMEOUT: Duration = Duration::from_mins(1);

/// What the setup prepared, shared by every test.
struct Suite {
    tools_image: String,
    provider: Arc<dyn Provider>,
    /// The image under test, checked.
    identity: Identity,
    /// Holds [`Identity::binary`]; removed when the suite ends.
    _binary_dir: TempDir,
}

const TESTS: &[TestCase<Suite>] = &[
    TestCase {
        name: "TestImage",
        run: image::image,
    },
    TestCase {
        name: "TestProbe",
        run: probe::probe,
    },
];

fn main() -> ExitCode {
    runner::main(TEMP_DIR_PREFIX, TESTS, setup)
}

/// Go's `TestMain`, and the identity check that replaces its `buildImage`: reads the
/// expectation, sweeps abandoned environments of earlier runs, builds the tools image, checks
/// the image under test, and runs the crossed negative control.
fn setup() -> Result<Suite, String> {
    // First, so a missing or invalid variable fails before any docker command.
    let expectation = Expectation::from_env().map_err(|error| error.to_string())?;
    let cli = DockerCli::new(Logger::stderr());
    let rules = sweep::default_rules("").map_err(|error| error.to_string())?;
    sweep::sweep(&cli, &rules).map_err(|error| format!("stale sweep: {error}"))?;
    let tools_image =
        netguard::build_tools_image(&cli, &repo_root()).map_err(|error| error.to_string())?;
    let provider = new_provider().map_err(|error| error.to_string())?;

    let env = provider
        .up(Spec::from_env())
        .map_err(|error| format!("the identity check's environment: {error}"))?;
    let env = EnvGuard::new(env, Arc::clone(&provider));
    let checked = check_identity(&env, &expectation);
    env.finish(checked.is_err())
        .map_err(|error| format!("tear down the identity check's environment: {error}"))?;
    let (identity, binary_dir) = checked?;

    Ok(Suite {
        tools_image,
        provider,
        identity,
        _binary_dir: binary_dir,
    })
}

/// The identity check, then the crossed control: the same image judged as the other
/// implementation must be refused for its answer to the help flag.
fn check_identity(env: &Env, expectation: &Expectation) -> Result<(Identity, TempDir), String> {
    let binary_dir = tempfile::Builder::new()
        .prefix("bitgauge-identity-")
        .tempdir()
        .map_err(|error| format!("create the identity check's directory: {error}"))?;
    let identity = identity::check(env, expectation, binary_dir.path())
        .map_err(|error| format!("identity check: {error}"))?;
    say(&format!(
        "identity: {} is the {} build at {}, /bitgauge sha256 {}",
        identity.image, identity.implementation, identity.commit, identity.sha256
    ));

    let crossed = Expectation {
        implementation: expectation.implementation.other(),
        ..expectation.clone()
    };
    let control_dir = tempfile::Builder::new()
        .prefix("bitgauge-identity-control-")
        .tempdir()
        .map_err(|error| format!("create the negative control's directory: {error}"))?;
    match identity::check(env, &crossed, control_dir.path()) {
        Err(error @ IdentityError::Help { .. }) => {
            say(&format!(
                "identity negative control: the {} expectation is refused as expected: {error}",
                crossed.implementation
            ));
            Ok((identity, binary_dir))
        }
        Err(error) => Err(format!(
            "identity negative control: the {} expectation against {} failed for another \
             reason than the help flag: {error}",
            crossed.implementation, expectation.image
        )),
        Ok(_) => Err(format!(
            "identity negative control: {} passed as the {} build too, so the check cannot tell \
             the implementations apart",
            expectation.image, crossed.implementation
        )),
    }
}

/// A line of the setup's own output, on standard error like the runner's.
fn say(line: &str) {
    use std::io::Write as _;
    let _ = writeln!(std::io::stderr(), "{line}");
}

/// An environment torn down when the test ends, kept on failure when
/// `BITGAUGE_TEST_KEEP_ON_FAILURE=1`.
fn environment(test: &Test, suite: &Suite) -> Result<Env, Fatal> {
    let env = suite.provider.up(Spec::from_env()).or_fatal(test)?;
    env.cleanup(test, Arc::clone(&suite.provider));
    Ok(env)
}

/// Runs one docker command in the environment and fails the test if it does not succeed.
fn docker(test: &Test, env: &Env, args: &[&str]) -> Result<String, Fatal> {
    env.docker(args)
        .map(|out| out.trim().to_owned())
        .or_fatal(test)
}

/// Retries `check` until it succeeds or [`POLL_TIMEOUT`] passes.
fn eventually(
    test: &Test,
    what: &str,
    mut check: impl FnMut() -> Result<(), String>,
) -> TestResult {
    let deadline = Instant::now() + POLL_TIMEOUT;
    loop {
        let Err(error) = check() else {
            return Ok(());
        };
        if Instant::now() > deadline {
            return Err(test.fatal(format!(
                "{what}: still failing after {}s: {error}",
                POLL_TIMEOUT.as_secs()
            )));
        }
        thread::sleep(POLL_EVERY);
    }
}

/// The `--user` value that lets a container write into a test's temporary directory: this
/// process's real uid and gid, as Go's `os.Getuid` and `os.Getgid` give them.
fn host_user() -> Result<String, String> {
    let status = fs::read_to_string("/proc/self/status")
        .map_err(|error| format!("read /proc/self/status: {error}"))?;
    let real = |key: &str| {
        status
            .lines()
            .find_map(|line| line.strip_prefix(key))
            .and_then(|ids| ids.split_whitespace().next())
            .map(str::to_owned)
            .ok_or_else(|| format!("/proc/self/status has no {key} line"))
    };
    Ok(format!("{}:{}", real("Uid:")?, real("Gid:")?))
}

/// The `docker run` arguments that trace `command` from process start in the tools image,
/// writing the trace to `/trace/<name>.strace` from `dir`.
fn strace(
    test: &Test,
    suite: &Suite,
    network: &str,
    dir: &Path,
    name: &str,
    command: &[&str],
) -> Result<Vec<String>, Fatal> {
    let mut args: Vec<String> = [
        "--network",
        network,
        "--cap-drop",
        "ALL",
        "--cap-add",
        "SYS_PTRACE",
        "--user",
        &host_user().or_fatal(test)?,
        "--volume",
        &format!("{}:/trace", dir.display()),
        &suite.tools_image,
        "strace",
        "-f",
        "-yy",
        "-e",
        TRACE_SET,
        "-o",
        &format!("/trace/{name}.strace"),
    ]
    .iter()
    .map(|&arg| arg.to_owned())
    .collect();
    args.extend(command.iter().map(|&arg| arg.to_owned()));
    Ok(args)
}

/// Runs `docker <prefix> <args>`, for the argument lists [`strace`] builds.
fn docker_with(test: &Test, env: &Env, prefix: &[&str], args: &[String]) -> Result<String, Fatal> {
    let mut all: Vec<&str> = prefix.to_vec();
    all.extend(args.iter().map(String::as_str));
    docker(test, env, &all)
}

/// Parses a trace the tracer wrote.
fn read_trace(test: &Test, dir: &Path, name: &str) -> Result<Vec<Event>, Fatal> {
    let path: PathBuf = dir.join(format!("{name}.strace"));
    let file = fs::File::open(&path)
        .map_err(|error| test.fatal(format!("open {}: {error}", path.display())))?;
    syscalltrace::parse(file).map_err(|error| test.fatal(format!("{name}: {error}")))
}
