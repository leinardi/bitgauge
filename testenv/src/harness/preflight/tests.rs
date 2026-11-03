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

//! Go's `preflight_test.go`: the probe and the order of [`prepare`] against a fake daemon.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::*;
use crate::docker::{DockerError, Output};
use crate::harness::profiles::tiers;
use crate::harness::shaper::caps_offload;

const TEARDOWN: &str = "teardown";
const CLIENT: &str = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const HOST: &str = "4040404040404040404040404040404040404040404040404040404040404040";
const TOOLS: &str = "tools:test";

fn probe_dir() -> String {
    format!("/sys/fs/cgroup/system.slice/docker-{CLIENT}.scope")
}

fn info() -> String {
    format!("info --format {DAEMON_CGROUPS_FORMAT}")
}

#[derive(Default)]
struct State {
    commands: Vec<String>,
    /// Overrides the answer to an exact command, joined by spaces.
    answers: BTreeMap<String, String>,
    /// Makes an exact command fail.
    fails: BTreeSet<String>,
}

/// Answers the probe's docker commands as a healthy rootful daemon does, except where a test
/// overrides one, and records every command, the fake builds' included.
#[derive(Default)]
struct ProbeDocker(Mutex<State>);

impl ProbeDocker {
    fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    fn answer(&self, command: impl Into<String>, answer: &str) {
        self.0
            .lock()
            .unwrap()
            .answers
            .insert(command.into(), answer.to_owned());
    }

    fn fail(&self, command: impl Into<String>) {
        self.0.lock().unwrap().fails.insert(command.into());
    }

    fn record(&self, command: &str) {
        self.0.lock().unwrap().commands.push(command.to_owned());
    }

    fn ran(&self) -> Vec<String> {
        self.0.lock().unwrap().commands.clone()
    }
}

impl Runner for ProbeDocker {
    fn output(&self, args: &[&str], _timeout: Option<Duration>) -> Result<Output, DockerError> {
        let mut state = self.0.lock().unwrap();
        let command = args.join(" ");
        state.commands.push(command.clone());
        if state.fails.contains(&command) {
            return Ok(Output {
                status: Some(1),
                stdout: String::new(),
                stderr: "fake docker failure".to_owned(),
            });
        }
        if let Some(answer) = state.answers.get(&command) {
            return Ok(Output::ok(answer.clone()));
        }
        Ok(Output::ok(healthy_answer(args, &command)))
    }
}

fn healthy_answer(args: &[&str], command: &str) -> String {
    let probe_dir = probe_dir();
    if command == info() {
        "systemd\t2\n".to_owned()
    } else if args[0] == "run" && command.contains("--cgroupns private") {
        format!("{CLIENT}\n")
    } else if args[0] == "run" && command.contains("--cgroupns host") {
        format!("{HOST}\n")
    } else if command.starts_with(&host_exec("find ")) {
        format!("{probe_dir}\n")
    } else if command == host_exec(&format!("stat -c %i {probe_dir}"))
        || command == client_exec(&format!("stat -c %i {CGROUP_ROOT}"))
    {
        "77915\n".to_owned()
    } else if command == client_exec(&format!("cat {CGROUP_CPU_STAT}")) {
        "usage_usec 24356\nuser_usec 15335\nsystem_usec 9021\n".to_owned()
    } else if command == client_exec(&format!("cat {CGROUP_MEMORY_PEAK}")) {
        "8982528\n".to_owned()
    } else {
        String::new()
    }
}

/// Records each build in the fake daemon's command log, so the order is one list.
struct FakeBuilds(Arc<ProbeDocker>);

impl Builds for FakeBuilds {
    fn tools(&mut self) -> Result<String, String> {
        self.0.record("build tools");
        Ok(TOOLS.to_owned())
    }

    fn shipped(&mut self) -> Result<String, String> {
        self.0.record("build shipped");
        Ok("bitgauge-harness:test".to_owned())
    }
}

/// The probe's environment over the fake daemon: names in its own namespace.
struct FakeEnv(Arc<ProbeDocker>);

impl ProbeEnv for FakeEnv {
    fn docker(&self, args: &[&str]) -> Result<String, String> {
        self.0.run(args).map_err(|error| error.to_string())
    }

    fn name(&self, base: &str) -> String {
        format!("probe-{base}")
    }
}

/// Brings up the fake probe, its teardown recorded as one command, so a test sees when it ran.
fn up_probe(
    docker: &Arc<ProbeDocker>,
) -> impl Fn() -> Result<(Box<dyn ProbeEnv>, ProbeDown), String> {
    let docker = Arc::clone(docker);
    move || {
        let teardown = Arc::clone(&docker);
        let down: ProbeDown = Box::new(move || {
            teardown.record(TEARDOWN);
            Ok(())
        });
        Ok((
            Box::new(FakeEnv(Arc::clone(&docker))) as Box<dyn ProbeEnv>,
            down,
        ))
    }
}

fn client_exec(command: &str) -> String {
    format!("exec {CLIENT} {command}")
}

fn host_exec(command: &str) -> String {
    format!("exec {HOST} {command}")
}

/// A lossy profile on the 64 KiB minimum queue, so the probe runs the offload cap and the loss.
fn shaped_profile() -> Profile {
    tiers()
        .into_iter()
        .flat_map(|tier| tier.profiles)
        .find(|profile| profile.shaped && profile.loss_percent > 0.0 && caps_offload(profile))
        .expect("a shaped, lossy profile on the minimum queue")
}

fn run_preflight(
    docker: &Arc<ProbeDocker>,
    cgroups: bool,
    shaped: Option<&Profile>,
) -> Result<(), PreflightError> {
    preflight(
        &up_probe(docker),
        PreflightOptions {
            tools_image: TOOLS,
            cgroups,
            shaped,
        },
    )
}

fn teardown_from(commands: &[String]) -> Option<usize> {
    commands.iter().position(|command| command == TEARDOWN)
}

/// The probe's environment was removed exactly once, after every command of the probe.
fn torn_down_last(commands: &[String]) -> bool {
    teardown_from(commands) == Some(commands.len() - 1)
        && commands
            .iter()
            .filter(|command| *command == TEARDOWN)
            .count()
            == 1
}

fn is_probe_run(command: &str) -> bool {
    command.starts_with("run ")
}

/// Go: `TestJudgeDaemonCgroups`.
#[test]
fn judge_daemon_cgroups_cases() {
    let mut failures = Vec::new();
    for (answer, ok) in [
        ("systemd\t2\n", true),
        ("cgroupfs\t2\n", true),
        ("none\t2\n", false),
        ("none\t\n", false),
        ("\t2\n", false),
        ("cgroupfs\t1\n", false),
        ("systemd\t1\n", false),
        ("cgroupfs\t\n", false),
        ("systemd 2\n", false),
        ("", false),
    ] {
        let result = judge_daemon_cgroups(answer);
        match (ok, &result) {
            (true, Err(error)) => failures.push(format!("{answer:?} refused: {error}")),
            (false, Ok(())) => failures.push(format!("{answer:?} accepted")),
            (false, Err(error)) if error.kind() != PreflightKind::CgroupAccounting => {
                failures.push(format!("{answer:?}: err = {error}, want cgroup accounting"));
            }
            _ => {}
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

/// Go: `TestCheckDaemonCgroupsOnlyAsks`. The daemon's claim is read before anything is built or
/// started: docker info and nothing else, and a failed info refuses.
#[test]
fn check_daemon_cgroups_only_asks() {
    let docker = ProbeDocker::new();
    docker.answer(info(), "none\t\n");
    let error = check_daemon_cgroups(docker.as_ref()).unwrap_err();
    assert_eq!(error.kind(), PreflightKind::CgroupAccounting);
    assert!(error.to_string().contains(r#"driver "none""#), "{error}");
    assert_eq!(docker.ran(), vec![info()]);

    let docker = ProbeDocker::new();
    docker.fail(info());
    let error = check_daemon_cgroups(docker.as_ref()).unwrap_err();
    assert_eq!(error.kind(), PreflightKind::CgroupAccounting, "{error}");
}

/// Go: `TestCgroupDir`.
#[test]
fn cgroup_dir_cases() {
    let mut failures = Vec::new();
    for found in [
        format!("{}\n", probe_dir()),
        format!("/sys/fs/cgroup/docker/{CLIENT}\n"),
        format!(
            "/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/docker-\
             {CLIENT}.scope\n"
        ),
        format!("/sys/fs/cgroup/docker/{HOST}/docker/{CLIENT}\n"),
    ] {
        match cgroup_dir(&found) {
            Ok(dir) if dir == found.trim() => {}
            other => failures.push(format!("cgroup_dir({found:?}) = {other:?}")),
        }
    }
    for found in [
        String::new(),
        "\n".to_owned(),
        format!("{0}\n{0}/init\n", probe_dir()),
        "/sys/fs/cgroup\n".to_owned(),
        "/sys/fs/cgroup/\n".to_owned(),
    ] {
        match cgroup_dir(&found) {
            Err(error) if error.kind() == PreflightKind::CgroupAccounting => {}
            other => failures.push(format!("cgroup_dir({found:?}) = {other:?}")),
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

/// Go: `TestPreflightPassesAHealthyDaemon`.
#[test]
fn preflight_passes_a_healthy_daemon() {
    let docker = ProbeDocker::new();
    let profile = shaped_profile();
    run_preflight(&docker, true, Some(&profile)).unwrap();

    let commands = docker.ran();
    assert!(
        torn_down_last(&commands),
        "not torn down last, once: {commands:?}"
    );
    let mut wanted = shaper_commands(&profile);
    wanted.push(loss_command(&profile));
    for want in wanted {
        assert!(
            commands.contains(&client_exec(&want)),
            "the probe did not run {want:?} in the client-mode container"
        );
    }
    let client = commands
        .iter()
        .find(|command| command.starts_with("run ") && command.contains("--cgroupns private"));
    assert!(
        client.is_some_and(|command| command.contains("--network probe-preflight-net")),
        "the client-mode container is not on the probe's own network: {commands:?}"
    );
}

/// One refusal: its name, the answers and failures it overrides, the kind and a substring.
type RefusalCase<'a> = (
    &'a str,
    Vec<(String, &'a str)>,
    Vec<String>,
    PreflightKind,
    String,
);

/// Go: `TestPreflightRefuses`. Each way the probe refuses, and that it tears down after each.
#[test]
fn preflight_refuses() {
    let profile = shaped_profile();
    let first_shaper = shaper_commands(&profile)[0].clone();
    let probe_dir = probe_dir();
    let cases: Vec<RefusalCase<'_>> = vec![
        (
            "no cgroup of its own",
            vec![(
                host_exec(&format!("find /sys/fs/cgroup -type d -name *{CLIENT}*")),
                "",
            )],
            vec![],
            PreflightKind::CgroupAccounting,
            "0 directories".to_owned(),
        ),
        (
            "another cgroup",
            vec![(client_exec(&format!("stat -c %i {CGROUP_ROOT}")), "1\n")],
            vec![],
            PreflightKind::CgroupAccounting,
            "is not its own cgroup".to_owned(),
        ),
        (
            "an unparsable inode",
            vec![(client_exec(&format!("stat -c %i {CGROUP_ROOT}")), "?\n")],
            vec![],
            PreflightKind::CgroupAccounting,
            String::new(),
        ),
        (
            "a failed stat",
            vec![],
            vec![host_exec(&format!("stat -c %i {probe_dir}"))],
            PreflightKind::CgroupAccounting,
            String::new(),
        ),
        (
            "no memory.peak",
            vec![],
            vec![client_exec(&format!("cat {CGROUP_MEMORY_PEAK}"))],
            PreflightKind::CgroupAccounting,
            "memory.peak".to_owned(),
        ),
        (
            "an unreadable cpu.stat",
            vec![(
                client_exec(&format!("cat {CGROUP_CPU_STAT}")),
                "user_usec 1\n",
            )],
            vec![],
            PreflightKind::CgroupAccounting,
            String::new(),
        ),
        (
            "a missing module",
            vec![],
            vec![client_exec(&first_shaper)],
            PreflightKind::Shaping,
            first_shaper.clone(),
        ),
    ];
    let mut failures = Vec::new();
    for (name, answers, fails, want, says) in cases {
        let docker = ProbeDocker::new();
        for (command, answer) in answers {
            docker.answer(command, answer);
        }
        for command in fails {
            docker.fail(command);
        }
        match run_preflight(&docker, true, Some(&profile)) {
            Err(error) if error.kind() == want && error.to_string().contains(&says) => {}
            other => failures.push(format!("{name}: {other:?}, want {want:?} saying {says:?}")),
        }
        let commands = docker.ran();
        if !torn_down_last(&commands) {
            failures.push(format!("{name}: not torn down last, once: {commands:?}"));
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

/// Go: `TestPreflightNeverTrustsAStatistic`. Only the cgroup's identity counts: two views whose
/// cgroup.procs read the same, with every other check passing, still refuse on an inode mismatch.
#[test]
fn preflight_never_trusts_a_statistic() {
    let docker = ProbeDocker::new();
    docker.answer(client_exec(&format!("stat -c %i {CGROUP_ROOT}")), "77916\n");
    docker.answer(
        client_exec(&format!("cat {CGROUP_ROOT}/cgroup.procs")),
        "1\n",
    );
    docker.answer(
        host_exec(&format!("cat {}/cgroup.procs", probe_dir())),
        "1\n",
    );
    let error = run_preflight(&docker, true, None).unwrap_err();
    assert_eq!(error.kind(), PreflightKind::CgroupAccounting, "{error}");
}

/// Go: `TestPreflightUnshapedRunsNoTc`.
#[test]
fn preflight_unshaped_runs_no_tc() {
    let docker = ProbeDocker::new();
    run_preflight(&docker, true, None).unwrap();
    for command in docker.ran() {
        assert!(
            !command.starts_with("network create ")
                && !command.starts_with(&client_exec("tc "))
                && !command.starts_with(&client_exec("ip ")),
            "an unshaped probe ran {command}"
        );
        assert!(
            !command.starts_with("run ") || command.contains("--network none"),
            "an unshaped probe container is on a network: {command}"
        );
    }
}

/// Go: `TestPreflightWithoutCgroupsReadsNoCounters`.
#[test]
fn preflight_without_cgroups_reads_no_counters() {
    let docker = ProbeDocker::new();
    run_preflight(&docker, false, Some(&shaped_profile())).unwrap();
    for command in docker.ran() {
        assert!(
            !command.contains(CGROUP_ROOT) && !command.contains("--cgroupns host"),
            "a shaping-only probe looked at cgroups: {command}"
        );
    }
}

fn run_prepare(
    docker: &Arc<ProbeDocker>,
    cgroups: bool,
    shaped: Option<&Profile>,
) -> Result<Prepared, PreflightError> {
    prepare(
        docker.as_ref(),
        &up_probe(docker),
        &mut FakeBuilds(Arc::clone(docker)),
        PrepareOptions { cgroups, shaped },
    )
}

/// Go: `TestPrepareOrder`. testing.md section 5.1's order: the daemon's claim before any build,
/// the tools image, the probe and its teardown, then BitGauge's image; a refusal stops there.
#[test]
fn prepare_order() {
    let mut failures = Vec::new();

    // A refused claim builds nothing.
    let docker = ProbeDocker::new();
    docker.answer(info(), "none\t\n");
    if run_prepare(&docker, true, None)
        .err()
        .is_none_or(|error| error.kind() != PreflightKind::CgroupAccounting)
    {
        failures.push("a refused claim: not a cgroup accounting refusal".to_owned());
    }
    if docker.ran() != vec![info()] {
        failures.push(format!("ran {:?} after a refused claim", docker.ran()));
    }

    // A refused probe never builds BitGauge.
    let docker = ProbeDocker::new();
    docker.answer(client_exec(&format!("stat -c %i {CGROUP_ROOT}")), "1\n");
    if run_prepare(&docker, true, None)
        .err()
        .is_none_or(|error| error.kind() != PreflightKind::CgroupAccounting)
    {
        failures.push("a refused probe: not a cgroup accounting refusal".to_owned());
    }
    let commands = docker.ran();
    if commands.iter().any(|command| command == "build shipped") {
        failures.push(format!(
            "BitGauge's image was built after a refused probe: {commands:?}"
        ));
    }
    let tools = commands.iter().position(|command| command == "build tools");
    let probe = commands.iter().position(|command| is_probe_run(command));
    if tools.is_none() || probe.is_none() || tools > probe {
        failures.push(format!(
            "the probe ran before the tools image was built: {commands:?}"
        ));
    }
    if !torn_down_last(&commands) {
        failures.push(format!("not torn down last, once: {commands:?}"));
    }

    // A failed shaping probe never builds BitGauge.
    let docker = ProbeDocker::new();
    let profile = shaped_profile();
    docker.fail(client_exec(&shaper_commands(&profile)[0]));
    let result = run_prepare(&docker, false, Some(&profile));
    if result
        .err()
        .is_none_or(|error| error.kind() != PreflightKind::Shaping)
        || docker
            .ran()
            .iter()
            .any(|command| command == "build shipped")
    {
        failures.push(format!("a failed shaping probe: ran {:?}", docker.ran()));
    }

    // Success.
    let docker = ProbeDocker::new();
    match run_prepare(&docker, true, Some(&profile)) {
        Ok(prepared) => {
            if prepared
                != (Prepared {
                    tools_image: TOOLS.to_owned(),
                    bitgauge_image: "bitgauge-harness:test".to_owned(),
                })
            {
                failures.push(format!("prepared = {prepared:?}"));
            }
        }
        Err(error) => failures.push(format!("success: {error}")),
    }
    let commands = docker.ran();
    let at = |want: &str| commands.iter().position(|command| command == want);
    let info_at = at(&info());
    let tools = at("build tools");
    let probe = commands.iter().position(|command| is_probe_run(command));
    let teardown = teardown_from(&commands);
    let shipped = at("build shipped");
    let ordered = info_at == Some(0)
        && tools > info_at
        && probe > tools
        && teardown > probe
        && shipped > teardown
        && shipped == Some(commands.len() - 1);
    if !ordered {
        failures.push(format!(
            "order: info {info_at:?}, tools {tools:?}, probe {probe:?}, teardown {teardown:?}, \
             shipped {shipped:?} of {commands:?}"
        ));
    }

    // Nothing to probe.
    let docker = ProbeDocker::new();
    if let Err(error) = run_prepare(&docker, false, None) {
        failures.push(format!("nothing to probe: {error}"));
    }
    if docker.ran() != ["build tools", "build shipped"] {
        failures.push(format!("nothing to probe ran {:?}", docker.ran()));
    }

    assert!(failures.is_empty(), "{failures:#?}");
}

/// Go: `TestFirstShaped`.
#[test]
fn first_shaped_cases() {
    for tier in tiers() {
        let got = first_shaped(&tier, false);
        let want = tier.profiles.iter().find(|profile| profile.shaped);
        match (got, want) {
            (None, None) => {}
            (Some(got), Some(want)) => assert!(
                std::ptr::eq(got, want),
                "{}: first_shaped is not its first shaped profile",
                tier.tier
            ),
            (got, _) => panic!("{}: first_shaped = {got:?}", tier.tier),
        }
        assert!(
            first_shaped(&tier, true).is_none(),
            "{} with HARNESS_SHAPE=none still shapes",
            tier.tier
        );
    }
}

/// Go: `TestPreflightChecks`.
#[test]
fn preflight_checks_cases() {
    for (value, want) in [
        ("", (true, true)),
        (PREFLIGHT_ACCOUNTING, (true, false)),
        (PREFLIGHT_SHAPING, (false, true)),
    ] {
        assert_eq!(preflight_checks(value), Ok(want), "{value:?}");
    }
    assert!(
        preflight_checks("both").is_err(),
        "an unknown preflight was accepted"
    );
}
