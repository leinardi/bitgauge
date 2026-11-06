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

//! The accuracy harness runners (feature `harness`; Go's `harness_test.go`,
//! `continuous_test.go` and `preflight_run_test.go`, build tag `harness`): the tiers, the
//! Continuous memory check, the preflight and the sweeps, each selected by make with
//! `--run '^Name$'` (`.mk/harness.mk`).
//!
//! The setup runs once before any test. As Go's `TestMain`, it sweeps the environments earlier
//! runs abandoned. It requires `BITGAUGE_TEST_IMPL` to be go or rust for every test. For the
//! runs that start BitGauge (`TestHarness`, `TestHarnessContinuous`) it then checks the image
//! named by `BITGAUGE_TEST_IMAGE` with [`identity::check_from_env`], which fails the whole run,
//! never skips it, on a mismatch or a missing variable. Unlike Go's runners, nothing here builds
//! BitGauge's image: make builds it (`test-impl-image`) and the runs take the checked one.

mod continuous;
mod preflight;

use std::env;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Instant;

use jiff::Timestamp;
use testenv::docker::DockerCli;
use testenv::env::{Env, EnvGuard, Provider, Spec, new_provider};
use testenv::envid::{TEMP_DIR_PREFIX, generate_env_id};
use testenv::harness::bringup::{Topology, report_dir, up};
use testenv::harness::evaluate::should_rerun;
use testenv::harness::gofmt;
use testenv::harness::ping::{artifacts_for, record_ping};
use testenv::harness::preflight::{Builds, PrepareOptions, env_probe, first_shaped, prepare};
use testenv::harness::profiles::{Profile, Tier, TierSpec, lookup, reference_duration, select};
use testenv::harness::report::{self, Report, Run, Status, summarize_export};
use testenv::harness::topology::Config;
use testenv::harness::usage::{USEC_PER_SECOND, Usage};
use testenv::identity::{self, ENV_IMPL, IdentityError, Implementation};
use testenv::logger::Logger;
use testenv::netguard;
use testenv::runner::{self, Fatal, OrFatal as _, Test, TestCase, TestResult};
use testenv::sweep;
use testenv::toolgate;

/// The variables `.mk/harness.mk` passes in.
const ENV_TIER: &str = "HARNESS_TIER";
const ENV_PROFILES: &str = "HARNESS_PROFILES";
const ENV_BROWSERS: &str = "HARNESS_BROWSERS";
const ENV_KEEP_ON_FAILURE: &str = "HARNESS_KEEP_ON_FAILURE";
const ENV_SHAPE: &str = "HARNESS_SHAPE";
const ENV_SWEEP_ALL: &str = "HARNESS_SWEEP_ALL_CONFIRM";

/// The tests that start BitGauge, and so check its image first.
const TEST_HARNESS: &str = "TestHarness";
const TEST_CONTINUOUS: &str = "TestHarnessContinuous";

pub(crate) const EGRESS: &str = "packets tried to leave BitGauge's namespace";

/// What the setup prepared.
pub(crate) struct Suite {
    pub(crate) cli: DockerCli,
    pub(crate) provider: Arc<dyn Provider>,
    /// The repository root, absolute.
    pub(crate) repo_root: PathBuf,
    /// The image the identity check passed; `None` when no selected test starts BitGauge.
    pub(crate) image: Option<String>,
}

const TESTS: &[TestCase<Suite>] = &[
    TestCase {
        name: TEST_HARNESS,
        run: test_harness,
    },
    TestCase {
        name: TEST_CONTINUOUS,
        run: continuous::test_harness_continuous,
    },
    TestCase {
        name: "TestPreflight",
        run: preflight::test_preflight,
    },
    TestCase {
        name: "TestSweep",
        run: test_sweep,
    },
    TestCase {
        name: "TestSweepAll",
        run: test_sweep_all,
    },
];

fn main() -> ExitCode {
    runner::main_selected(TEMP_DIR_PREFIX, TESTS, setup)
}

/// Go: `TestMain`, plus the implementation requirement and the identity check.
fn setup(selected: &[&'static str]) -> Result<Suite, String> {
    let raw = env::var(ENV_IMPL).unwrap_or_default();
    if raw.is_empty() {
        return Err(IdentityError::MissingVar { name: ENV_IMPL }.to_string());
    }
    if Implementation::parse(&raw).is_none() {
        return Err(IdentityError::InvalidImplementation { value: raw }.to_string());
    }

    let cli = DockerCli::new(Logger::stderr());
    let rules = sweep::default_rules("").map_err(|error| error.to_string())?;
    sweep::sweep(&cli, &rules).map_err(|error| format!("stale sweep: {error}"))?;
    let provider = new_provider().map_err(|error| error.to_string())?;
    let repo_root = toolgate::repo_root()
        .canonicalize()
        .map_err(|error| format!("resolve the repository root: {error}"))?;

    let mut image = None;
    if selected
        .iter()
        .any(|name| *name == TEST_HARNESS || *name == TEST_CONTINUOUS)
    {
        image = Some(check_identity(&provider)?);
    }
    Ok(Suite {
        cli,
        provider,
        repo_root,
        image,
    })
}

/// Checks `BITGAUGE_TEST_IMAGE` in an environment of its own, removed before any test.
fn check_identity(provider: &Arc<dyn Provider>) -> Result<String, String> {
    let env = provider
        .up(Spec::default())
        .map_err(|error| error.to_string())?;
    let guard = EnvGuard::new(env, Arc::clone(provider));
    let dest = tempfile::tempdir()
        .map_err(|error| format!("create a directory for the identity check: {error}"))?;
    let checked = identity::check_from_env(&guard, dest.path());
    let finished = guard.finish(checked.is_err());
    let identity = checked.map_err(|error| format!("identity check: {error}"))?;
    finished.map_err(|error| format!("tear down the identity check: {error}"))?;
    eprintln!(
        "identity: {} is {} at {} (bitgauge sha256 {})",
        identity.image, identity.implementation, identity.commit, identity.sha256
    );
    Ok(identity.image)
}

/// Go's `os.Getenv`.
pub(crate) fn var(key: &str) -> String {
    env::var(key).unwrap_or_default()
}

/// Go: `TestHarness`. Runs one tier: each profile, in each browser, on a fresh topology, judges
/// each run against testing.md section 5 (re-running an inconclusive one once), and writes the
/// report under dist/harness. Any final run that failed, failed its tolerances or stayed
/// inconclusive fails it.
fn test_harness(test: &Test, suite: &Suite) -> TestResult {
    let spec = selected_tier(test)?;
    let unshaped = var(ENV_SHAPE) == "none";
    let (tools_image, image, started) =
        prepare_images(test, suite, true, first_shaped(&spec, unshaped))?;
    let report_env = generate_env_id().or_fatal(test)?;
    let dir = report_dir(&report::dir(
        &dist_harness(suite),
        spec.tier.as_str(),
        started,
        &report_env,
    ))
    .or_fatal(test)?;
    let report = Arc::new(Mutex::new(Report::new(&spec, &report_env, started)));
    {
        let report = Arc::clone(&report);
        let dir = dir.clone();
        // A cleanup, as Go's defer: the report is written whatever the body did.
        test.cleanup(move |test| {
            let mut report = report.lock().unwrap_or_else(PoisonError::into_inner);
            report.finished = Timestamp::now();
            if let Err(error) = report.write(&dir) {
                test.error(error);
            }
            test.log(format!("report: {}", dir.display()));
        });
    }

    let cfg = Config {
        tools_image,
        bitgauge_image: image,
        repo_root: suite.repo_root.clone(),
        out_dir: dir,
        unshaped,
    };
    for profile in &spec.profiles {
        for browser in &spec.browsers {
            for attempt in 1.. {
                let mut run = run_profile(test, &cfg, profile, browser);
                run.attempt = attempt;
                run.rerun = should_rerun(&run, attempt);
                report
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .runs
                    .push(run.clone());
                if run.rerun {
                    continue;
                }
                if run.failing() {
                    test.error(format!(
                        "{} in {browser}: {} {}",
                        profile.name, run.verdict, run.error
                    ));
                }
                break;
            }
        }
    }
    Ok(())
}

pub(crate) fn dist_harness(suite: &Suite) -> PathBuf {
    suite.repo_root.join("dist").join("harness")
}

/// The builds of [`prepare`]: the tools image through netguard, and BitGauge's image the setup
/// checked, never built here. The instant it is handed over starts the invocation, where Go's
/// runner started it at its own build.
struct HarnessBuilds<'a> {
    cli: &'a DockerCli,
    repo_root: &'a Path,
    image: Option<&'a str>,
    started: Option<Timestamp>,
}

impl Builds for HarnessBuilds<'_> {
    fn tools(&mut self) -> Result<String, String> {
        netguard::build_tools_image(self.cli, self.repo_root).map_err(|error| error.to_string())
    }

    fn shipped(&mut self) -> Result<String, String> {
        self.started = Some(Timestamp::now());
        self.image
            .map(str::to_owned)
            .ok_or_else(|| "no identity-checked image: the setup did not check one".to_owned())
    }
}

/// Checks the daemon and builds netguard's tools image, then takes the identity-checked image,
/// and returns them with the instant the invocation started. A daemon it refuses ends the test
/// before any BitGauge container starts.
pub(crate) fn prepare_images(
    test: &Test,
    suite: &Suite,
    cgroups: bool,
    shaped: Option<&Profile>,
) -> Result<(String, String, Timestamp), Fatal> {
    let mut builds = HarnessBuilds {
        cli: &suite.cli,
        repo_root: &suite.repo_root,
        image: suite.image.as_deref(),
        started: None,
    };
    let prepared = prepare(
        &suite.cli,
        &env_probe(Arc::clone(&suite.provider)),
        &mut builds,
        PrepareOptions { cgroups, shaped },
    )
    .or_fatal(test)?;
    let started = builds.started.unwrap_or_else(Timestamp::now);
    Ok((prepared.tools_image, prepared.bitgauge_image, started))
}

/// A fresh environment for one run, gone when the subtest ends -- kept, marked keep=true, when
/// it failed and `HARNESS_KEEP_ON_FAILURE=1`.
pub(crate) fn run_env(test: &Test) -> Result<Env, Fatal> {
    let provider = new_provider().or_fatal(test)?;
    let mut spec = Spec::from_env();
    spec.keep_on_failure = var(ENV_KEEP_ON_FAILURE) == "1";
    let env = provider.up(spec).or_fatal(test)?;
    env.cleanup(test, provider);
    Ok(env)
}

/// Measures and judges one profile in one browser on its own environment. A run that fails its
/// tolerances fails the subtest, so its environment can be kept to look into; an inconclusive one
/// does not, since its re-run may still pass.
fn run_profile(test: &Test, cfg: &Config, profile: &Profile, browser: &str) -> Run {
    let mut run = Run {
        profile: profile.name.clone(),
        browser: browser.to_owned(),
        status: Status::Failed,
        shaped: profile.shaped && !cfg.unshaped,
        ..Run::default()
    };
    test.run(&format!("{}/{browser}", profile.name), |test| {
        let env = run_env(test)?;
        run.env_id.clone_from(&env.id);
        match measure(&env, cfg, profile, browser, &mut run) {
            Ok(()) => run.status = Status::Recorded,
            Err(error) => {
                test.error(&error);
                run.error = error;
            }
        }
        run.judge(profile);
        if run.status == Status::Fail {
            test.error(&run.verdict);
        }
        Ok(())
    });
    run
}

/// Go's `errors.Join`: the non-empty messages, one per line; `Ok` when there is none.
pub(crate) fn join(errors: impl IntoIterator<Item = Option<String>>) -> Result<(), String> {
    let errors: Vec<String> = errors.into_iter().flatten().collect();
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

fn measure(
    env: &Env,
    cfg: &Config,
    profile: &Profile,
    browser: &str,
    run: &mut Run,
) -> Result<(), String> {
    let (topology, result) = up(env, cfg, profile);
    let Some(topology) = topology else {
        // Netguard never started, so nothing ran that it would have watched.
        return result;
    };
    run.self_test = topology.self_test();
    let result = result.and_then(|()| observe(cfg, &topology, browser, run));
    // Whatever happened once BitGauge could have started, its namespace's counters are read.
    let egress = read_egress(&topology, run);
    join([result.err(), egress.err()])
}

/// One run on a ready topology: the iperf3 reference before, the browser with the ping and the
/// client's counters, the iperf3 reference after, the export, and on a Compat profile the
/// compatibility step.
fn observe(cfg: &Config, topology: &Topology, browser: &str, run: &mut Run) -> Result<(), String> {
    let reference = reference_duration(topology.profile().preset);
    run.reference_before = Some(topology.iperf3(reference)?);
    let (cpu_before, _) = topology.client_counters()?;
    let artifacts = artifacts_for(&topology.profile().name, browser);

    let browse_started = Instant::now();
    let (ping_output, browse) = topology.browse(browser);
    let browse_seconds = browse_started.elapsed().as_secs_f64();

    let recorded = record_ping(&cfg.out_dir, &artifacts, &ping_output);
    run.ping = recorded.ping;

    let usage = topology.client_counters();
    if let Ok((cpu_after, peak)) = usage {
        run.client_usage = Some(Usage {
            cpu_seconds: micros_as_f64(cpu_after.saturating_sub(cpu_before)) / USEC_PER_SECOND,
            wall_seconds: browse_seconds,
            peak_memory_bytes: peak,
        });
    }
    let after = topology.iperf3(reference);
    run.reference_after = after.as_ref().ok().copied();
    join([browse.err(), recorded.error, usage.err(), after.err()])?;

    run.export.clone_from(&artifacts.export);
    let path = cfg.out_dir.join(&artifacts.export);
    let data = std::fs::read(&path).map_err(|error| {
        format!(
            "read the export: {}",
            gofmt::path_error("open", &path, &error)
        )
    })?;
    run.result = Some(summarize_export(&data)?);

    if !topology.profile().compat {
        return Ok(());
    }
    // The compatibility step's failure fails the run, with whatever it recorded kept.
    let (compat, result) = topology.compat(browser);
    run.compat = compat;
    result
}

#[expect(
    clippy::cast_precision_loss,
    reason = "Go's float64 of the CPU microseconds"
)]
const fn micros_as_f64(micros: u64) -> f64 {
    micros as f64
}

/// Records the guard's counters, and fails the run when any is not zero.
fn read_egress(topology: &Topology, run: &mut Run) -> Result<(), String> {
    let counters = topology
        .guard()
        .counters()
        .map_err(|error| format!("read the netguard counters: {error}"))?;
    run.egress = Some(counters.0.clone());
    if !counters.zero() {
        return Err(format!("{EGRESS}: {}", gofmt::counters(&counters.0)));
    }
    Ok(())
}

/// Go: `TestSweep`. make harness-sweep: the stale sweep, under the same rules the setup applies,
/// listing what it kept and why.
fn test_sweep(test: &Test, suite: &Suite) -> TestResult {
    let rules = sweep::default_rules("").or_fatal(test)?;
    let verdicts = sweep::sweep(&suite.cli, &rules).or_fatal(test)?;
    for verdict in verdicts {
        let action = if verdict.remove { "removed" } else { "kept" };
        test.log(format!("{action} {}: {}", verdict.env.id, verdict.reason));
    }
    Ok(())
}

/// Go: `TestSweepAll`. make harness-sweep-all CONFIRM=1: every environment, kept or live, goes.
/// It does nothing unless the make target passed the confirmation through; the runner has no
/// skip, so that is a pass that says so.
fn test_sweep_all(test: &Test, suite: &Suite) -> TestResult {
    if var(ENV_SWEEP_ALL) != "1" {
        test.log(
            "skipped: removes every harness environment; run it through make harness-sweep-all \
             CONFIRM=1",
        );
        return Ok(());
    }
    for env in sweep::remove_all(&suite.cli).or_fatal(test)? {
        test.log(format!(
            "removed {} (owner {}, started {}, kept {})",
            env.id, env.owner, env.started, env.keep
        ));
    }
    Ok(())
}

/// The tier `HARNESS_TIER` names (ci by default), narrowed by `HARNESS_PROFILES` and
/// `HARNESS_BROWSERS`.
fn selected_tier(test: &Test) -> Result<TierSpec, Fatal> {
    let mut tier = var(ENV_TIER);
    if tier.is_empty() {
        Tier::Ci.as_str().clone_into(&mut tier);
    }
    let spec = lookup(&tier).or_fatal(test)?;
    select(&spec, &var(ENV_PROFILES), &var(ENV_BROWSERS)).or_fatal(test)
}
