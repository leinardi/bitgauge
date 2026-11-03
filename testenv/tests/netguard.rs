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

//! The network guard against Docker (feature `image`; Go's `netguard_test.go`, build tag
//! `image`): each control moves its counter, the listen port is not counted, and a guard without
//! the sink routes is caught blind.
//!
//! As Go's `TestMain` did, the setup sweeps the abandoned environments of earlier runs and builds
//! the tools image once. The suite tests the guard, not a BitGauge image, so it has no identity
//! check. Run it with `cargo test -p testenv --features image --test netguard`; `--run <pattern>`
//! selects tests with Go's `-run` semantics.

use std::process::ExitCode;
use std::sync::Arc;

use testenv::docker::DockerCli;
use testenv::env::{Env, Provider, Spec, new_provider};
use testenv::logger::Logger;
use testenv::netguard::{self, Guard, NetguardError, Options, controls, iperf3};
use testenv::runner::{self, OrFatal as _, Test, TestCase, TestResult};
use testenv::sweep;
use testenv::toolgate::repo_root;

/// BitGauge's listen port in the image suite.
const LISTEN_PORT: u16 = 8080;

/// What the setup prepared.
struct Suite {
    tools_image: String,
    provider: Arc<dyn Provider>,
}

const TESTS: &[TestCase<Suite>] = &[
    TestCase {
        name: "TestControlsIncrementTheirCounters",
        run: controls_increment_their_counters,
    },
    TestCase {
        name: "TestListenPortIsNotCounted",
        run: listen_port_is_not_counted,
    },
    TestCase {
        name: "TestWithoutTheSinkRoutesTheGuardIsBlind",
        run: without_the_sink_routes_the_guard_is_blind,
    },
];

fn main() -> ExitCode {
    runner::main(TESTS, setup)
}

/// Sweeps abandoned environments of earlier runs, then builds the tools image once.
fn setup() -> Result<Suite, String> {
    let cli = DockerCli::new(Logger::stderr());
    let rules = sweep::default_rules("").map_err(|error| error.to_string())?;
    sweep::sweep(&cli, &rules).map_err(|error| format!("stale sweep: {error}"))?;
    let tools_image =
        netguard::build_tools_image(&cli, &repo_root()).map_err(|error| error.to_string())?;
    let provider = new_provider().map_err(|error| error.to_string())?;
    Ok(Suite {
        tools_image,
        provider,
    })
}

/// An environment torn down when the test ends, with an `--internal` network on it.
fn environment(test: &Test, suite: &Suite) -> Result<(Env, String), runner::Fatal> {
    let env = suite.provider.up(Spec::from_env()).or_fatal(test)?;
    env.cleanup(test, Arc::clone(&suite.provider));
    let network = env.name("net");
    env.docker(&["network", "create", "--internal", &network])
        .or_fatal(test)?;
    Ok((env, network))
}

fn options(suite: &Suite, network: String) -> Options {
    Options {
        tools_image: suite.tools_image.clone(),
        network,
        listen_port: LISTEN_PORT,
        without_sink_routes: false,
    }
}

fn start_guard(test: &Test, suite: &Suite) -> Result<Guard, runner::Fatal> {
    let (env, network) = environment(test, suite)?;
    netguard::start(&env, &options(suite, network)).or_fatal(test)
}

fn words(command: &[String]) -> Vec<&str> {
    command.iter().map(String::as_str).collect()
}

/// Go: `TestControlsIncrementTheirCounters`: a prepared guard -- which already fails if a
/// control is not seen -- repeats each control on its own, so the test also says which counter
/// each one moves and that the reset leaves all three at zero.
fn controls_increment_their_counters(test: &Test, suite: &Suite) -> TestResult {
    let guard = start_guard(test, suite)?;
    let counters = guard.counters().or_fatal(test)?;
    if !counters.zero() {
        return Err(test.fatal(format!(
            "the counters are {counters} after the reset, want all zero"
        )));
    }
    for control in controls(LISTEN_PORT) {
        guard.reset().or_fatal(test)?;
        // The control fails -- nothing answers -- so only the counter says it was seen.
        let _ = guard.exec(&words(&control.command));
        let counters = guard.counters().or_fatal(test)?;
        if counters.get(control.counter) == 0 {
            test.error(format!(
                "{} left {} at zero: {counters}",
                control.name, control.counter
            ));
        }
    }
    Ok(())
}

/// Go: `TestListenPortIsNotCounted`: the one loopback exception, the healthcheck's connection to
/// the listen port.
fn listen_port_is_not_counted(test: &Test, suite: &Suite) -> TestResult {
    let guard = start_guard(test, suite)?;
    let _ = guard.exec(&words(&iperf3("127.0.0.1", LISTEN_PORT)));
    let counters = guard.counters().or_fatal(test)?;
    if !counters.zero() {
        test.error(format!(
            "a connection to the listen port was counted: {counters}"
        ));
    }
    Ok(())
}

/// Go: `TestWithoutTheSinkRoutesTheGuardIsBlind`: the negative test of the guard itself. Without
/// the sink's default routes a connect to a non-local address fails with "network unreachable"
/// before any packet is built, and the controls have to say so.
fn without_the_sink_routes_the_guard_is_blind(test: &Test, suite: &Suite) -> TestResult {
    let (env, network) = environment(test, suite)?;
    let options = Options {
        without_sink_routes: true,
        ..options(suite, network)
    };
    match netguard::start(&env, &options) {
        Err(NetguardError::InstrumentBlind { control, counter }) => {
            test.log(format!(
                "blind as expected: {control} left {counter} at zero"
            ));
            Ok(())
        }
        Err(error) => Err(test.fatal(format!(
            "a guard without sink routes failed for another reason: {error}"
        ))),
        Ok(_) => Err(test.fatal("a guard without sink routes was prepared")),
    }
}
