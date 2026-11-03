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

//! The checks every harness runner makes before it measures anything (testing.md section 5.1;
//! Go's `preflight.go`): the daemon's own cgroup claim, then a probe of the cgroup accounting the
//! client's CPU and memory come from and of the shaper's tc commands, in containers of an
//! environment of its own that is gone before anything is measured. [`prepare`] holds the order:
//! the claim before any build, the tools image, the probe, then BitGauge's image.
//!
//! Every docker command goes through a [`Runner`] or a [`ProbeEnv`], so the order and each way the
//! probe refuses are unit-tested with a fake daemon.

use std::fmt;
use std::sync::Arc;

use super::gofmt;
use super::profiles::{Profile, TierSpec};
use super::shaper::{loss_command, shaper_commands};
use super::usage::{CGROUP_CPU_STAT, CGROUP_MEMORY_PEAK, cpu_usage_micros, memory_peak};
use crate::docker::Runner;
use crate::env::{Env, Provider, Spec};

/// Asks `docker info` for the cgroup driver and version, tab-separated.
pub const DAEMON_CGROUPS_FORMAT: &str = "{{.CgroupDriver}}\t{{.CgroupVersion}}";
/// The cgroup v2 mount every container sees.
pub const CGROUP_ROOT: &str = "/sys/fs/cgroup";
/// The kernel modules the shaper's tc and ip commands need, which a container cannot load.
pub const SHAPING_MODULES: &str =
    "ifb sch_netem sch_tbf sch_fq_codel sch_ingress cls_u32 act_mirred";

/// `HARNESS_PREFLIGHT=accounting` probes the cgroup accounting only.
pub const PREFLIGHT_ACCOUNTING: &str = "accounting";
/// `HARNESS_PREFLIGHT=shaping` probes the shaper's commands only.
pub const PREFLIGHT_SHAPING: &str = "shaping";

/// Go's `ErrCgroupAccounting`.
const CGROUP_ACCOUNTING: &str = "per-container cgroup accounting is unreliable";
/// Go's `ErrShaping`.
const SHAPING: &str = "the shaper's kernel facilities are missing";

/// What a refusal is about, as Go's sentinel errors told them apart.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreflightKind {
    /// The daemon's containers' cgroup counters would not be the client's own.
    CgroupAccounting,
    /// The host's kernel cannot shape the client's link.
    Shaping,
    /// Anything else: a docker command, a build or the probe's environment failed.
    Other,
}

/// A refusal or a failure of the preflight, in the Go harness's words.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreflightError {
    kind: PreflightKind,
    message: String,
}

impl PreflightError {
    fn cgroups(detail: &str) -> Self {
        Self {
            kind: PreflightKind::CgroupAccounting,
            message: format!("{CGROUP_ACCOUNTING}: {detail}"),
        }
    }

    fn shaping(detail: &str) -> Self {
        Self {
            kind: PreflightKind::Shaping,
            message: format!("{SHAPING}: {detail}"),
        }
    }

    fn other(message: impl Into<String>) -> Self {
        Self {
            kind: PreflightKind::Other,
            message: message.into(),
        }
    }

    /// What the refusal is about.
    #[must_use]
    pub const fn kind(&self) -> PreflightKind {
        self.kind
    }

    /// Go's `errors.Join(err, next)`: the first error keeps its kind, the next adds its line.
    fn join(mut self, next: &Self) -> Self {
        self.message.push('\n');
        self.message.push_str(&next.message);
        self
    }
}

impl fmt::Display for PreflightError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PreflightError {}

/// The environment the probe's containers live in, labeling what they create; [`Env`] is one.
pub trait ProbeEnv {
    /// Runs a docker command and returns its standard output.
    ///
    /// # Errors
    ///
    /// The command failed, as text.
    fn docker(&self, args: &[&str]) -> Result<String, String>;

    /// The name of one of its resources.
    fn name(&self, base: &str) -> String;
}

impl ProbeEnv for Env {
    fn docker(&self, args: &[&str]) -> Result<String, String> {
        Self::docker(self, args).map_err(|error| error.to_string())
    }

    fn name(&self, base: &str) -> String {
        Self::name(self, base)
    }
}

/// Removes the probe's environment.
pub type ProbeDown = Box<dyn FnOnce() -> Result<(), String>>;

/// Brings up the probe's environment and returns it with what removes it.
pub type UpProbe<'a> = &'a dyn Fn() -> Result<(Box<dyn ProbeEnv>, ProbeDown), String>;

/// The probe as an environment of its own from `provider`, labeled like every other, removed
/// when the preflight is done with it.
pub fn env_probe(
    provider: Arc<dyn Provider>,
) -> impl Fn() -> Result<(Box<dyn ProbeEnv>, ProbeDown), String> {
    move || {
        let env = provider
            .up(Spec::default())
            .map_err(|error| format!("bring up the probe: {error}"))?;
        let provider = Arc::clone(&provider);
        let down_env = env.clone();
        let down: ProbeDown = Box::new(move || {
            provider
                .down(&down_env, false)
                .map_err(|error| error.to_string())
        });
        Ok((Box::new(env) as Box<dyn ProbeEnv>, down))
    }
}

/// Reads the daemon's own claim about its cgroups and refuses one without a cgroup driver (a
/// rootless daemon without cgroups) or without cgroup v2. It builds and starts nothing, so a tier
/// run can refuse before any build; the probe of [`preflight`] has the last word.
///
/// # Errors
///
/// [`PreflightKind::CgroupAccounting`] for a refused claim or a failed `docker info`.
pub fn check_daemon_cgroups(runner: &dyn Runner) -> Result<(), PreflightError> {
    let out = runner
        .run(&["info", "--format", DAEMON_CGROUPS_FORMAT])
        .map_err(|error| {
            PreflightError::cgroups(&format!("read the daemon's cgroup driver: {error}"))
        })?;
    judge_daemon_cgroups(&out)
}

fn judge_daemon_cgroups(out: &str) -> Result<(), PreflightError> {
    let Some((driver, version)) = out.trim_end_matches(['\r', '\n']).split_once('\t') else {
        return Err(PreflightError::cgroups(&format!(
            "unreadable docker info answer {}",
            gofmt::quote(out)
        )));
    };
    if driver == "none" || driver.is_empty() {
        return Err(PreflightError::cgroups(&format!(
            "the daemon reports cgroup driver {} (rootless without cgroups?), so a container's \
             cgroup counters would be the daemon's, not the client's",
            gofmt::quote(driver)
        )));
    }
    if version != "2" {
        return Err(PreflightError::cgroups(&format!(
            "the daemon reports cgroup version {}, and the client's cpu.stat and memory.peak \
             need cgroup v2",
            gofmt::quote(version)
        )));
    }
    Ok(())
}

/// Selects what [`preflight`] probes.
#[derive(Clone, Copy, Debug)]
pub struct PreflightOptions<'a> {
    /// The tools image the probe runs.
    pub tools_image: &'a str,
    /// Probes the cgroup accounting the client's CPU and memory come from.
    pub cgroups: bool,
    /// The profile whose shaper commands the probe runs, `None` on an unshaped run.
    pub shaped: Option<&'a Profile>,
}

/// Probes the daemon with containers of its own environment, which it removes before it returns,
/// whatever the outcome, so nothing of it is left while anything is measured.
///
/// With `cgroups`, a container in the client's mode (a private cgroup namespace) must be the
/// cgroup a second container, in the host's cgroup namespace, finds under the first one's ID: the
/// same directory by inode, since under a private namespace every container sees itself at the
/// root, whether that root is its own cgroup or the daemon's. That cgroup's cpu.stat and
/// memory.peak must read. With `shaped`, the client-mode container gets an eth0 of its own and
/// runs the profile's shaper and loss commands, as the shaper will.
///
/// # Errors
///
/// The probe refused the daemon, or a step or the teardown failed.
pub fn preflight(up_probe: UpProbe<'_>, opts: PreflightOptions<'_>) -> Result<(), PreflightError> {
    let (env, down) =
        up_probe().map_err(|error| PreflightError::other(format!("preflight: {error}")))?;
    let result = probe(env.as_ref(), opts);
    let removed = down()
        .map_err(|error| PreflightError::other(format!("remove the preflight probe: {error}")));
    match (result, removed) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(error), Ok(())) | (Ok(()), Err(error)) => Err(error),
        (Err(error), Err(next)) => Err(error.join(&next)),
    }
}

fn probe(env: &dyn ProbeEnv, opts: PreflightOptions<'_>) -> Result<(), PreflightError> {
    let mut probe = Probe {
        env,
        image: opts.tools_image,
        client: String::new(),
    };
    probe.start_client(opts.shaped.is_some())?;
    if opts.cgroups {
        probe.check_cgroups()?;
    }
    if let Some(profile) = opts.shaped {
        probe.check_shaping(profile)?;
    }
    Ok(())
}

/// The preflight's containers.
struct Probe<'a> {
    env: &'a dyn ProbeEnv,
    image: &'a str,
    /// The client-mode container's full ID.
    client: String,
}

impl Probe<'_> {
    /// Starts the client-mode container: a private cgroup namespace and the shaper's
    /// capabilities, on a network of its own when it shapes, so it has an eth0, and on none
    /// otherwise.
    fn start_client(&mut self, shaped: bool) -> Result<(), PreflightError> {
        let mut network = "none".to_owned();
        if shaped {
            network = self.env.name("preflight-net");
            self.env
                .docker(&["network", "create", "--internal", &network])
                .map_err(|error| {
                    PreflightError::other(format!("preflight: create the network: {error}"))
                })?;
        }
        self.client = self.start(
            "preflight-client",
            &network,
            "private",
            &["--cap-add", "NET_ADMIN"],
        )?;
        Ok(())
    }

    /// Runs one idle probe container and returns its full ID.
    fn start(
        &self,
        base: &str,
        network: &str,
        cgroupns: &str,
        extra: &[&str],
    ) -> Result<String, PreflightError> {
        let name = self.env.name(base);
        let mut args = vec![
            "run",
            "--detach",
            "--name",
            &name,
            "--network",
            network,
            "--cgroupns",
            cgroupns,
            "--cap-drop",
            "ALL",
        ];
        args.extend_from_slice(extra);
        args.extend([self.image, "sleep", "infinity"]);
        let out = self
            .env
            .docker(&args)
            .map_err(|error| PreflightError::other(format!("preflight: start {base}: {error}")))?;
        let id = out.trim();
        if id.is_empty() {
            return Err(PreflightError::cgroups(&format!(
                "docker run printed no ID for {base}"
            )));
        }
        Ok(id.to_owned())
    }

    /// Holds the client-mode container's view of /sys/fs/cgroup to its own cgroup, found from the
    /// host's cgroup namespace by its ID, and reads its counters.
    fn check_cgroups(&self) -> Result<(), PreflightError> {
        let host = self.start("preflight-host", "none", "host", &[])?;
        let pattern = format!("*{}*", self.client);
        let found = self
            .exec(
                &host,
                &["find", CGROUP_ROOT, "-type", "d", "-name", &pattern],
            )
            .map_err(|error| {
                PreflightError::cgroups(&format!("find the probe's cgroup: {error}"))
            })?;
        let dir = cgroup_dir(&found)?;
        let host_view = self.inode(&host, &dir)?;
        let client_view = self.inode(&self.client, CGROUP_ROOT)?;
        if host_view != client_view {
            return Err(PreflightError::cgroups(&format!(
                "the client's {CGROUP_ROOT} (inode {client_view}) is not its own cgroup {dir} \
                 (inode {host_view})"
            )));
        }

        let cpu_stat = self
            .exec(&self.client, &["cat", CGROUP_CPU_STAT])
            .map_err(|error| PreflightError::cgroups(&format!("read cpu.stat: {error}")))?;
        cpu_usage_micros(&cpu_stat).map_err(|error| PreflightError::cgroups(&error))?;
        let peak = self
            .exec(&self.client, &["cat", CGROUP_MEMORY_PEAK])
            .map_err(|error| {
                PreflightError::cgroups(&format!(
                    "read memory.peak (Linux 5.19 or later, with the memory controller): {error}"
                ))
            })?;
        memory_peak(&peak).map_err(|error| PreflightError::cgroups(&error))?;
        Ok(())
    }

    /// A cgroup directory's inode in one container, the cgroup's identity in any mount of the
    /// hierarchy.
    fn inode(&self, container: &str, dir: &str) -> Result<u64, PreflightError> {
        let out = self
            .exec(container, &["stat", "-c", "%i", dir])
            .map_err(|error| PreflightError::cgroups(&format!("stat {dir}: {error}")))?;
        gofmt::parse_uint(out.trim()).map_err(|error| {
            PreflightError::cgroups(&format!("inode of {dir} {}: {error}", gofmt::quote(&out)))
        })
    }

    /// Runs the profile's shaper and loss commands, the same ones on the same device as the run's
    /// shaper, so a module the kernel cannot load fails here, once.
    fn check_shaping(&self, profile: &Profile) -> Result<(), PreflightError> {
        let mut commands = shaper_commands(profile);
        let loss = loss_command(profile);
        if !loss.is_empty() {
            commands.push(loss);
        }
        for command in &commands {
            let words: Vec<&str> = command.split_whitespace().collect();
            self.exec(&self.client, &words).map_err(|error| {
                PreflightError::shaping(&format!(
                    "{command}: {error} (load them on the host: sudo modprobe -a \
                     {SHAPING_MODULES})"
                ))
            })?;
        }
        Ok(())
    }

    fn exec(&self, container: &str, command: &[&str]) -> Result<String, String> {
        let mut args = vec!["exec", container];
        args.extend_from_slice(command);
        self.env
            .docker(&args)
            .map_err(|error| format!("exec in {container}: {error}"))
    }
}

/// The one cgroup directory find matched by the client's ID. None means the container has no
/// cgroup of its own; more than one, or the root itself, identifies nothing.
fn cgroup_dir(found: &str) -> Result<String, PreflightError> {
    let dirs: Vec<&str> = found.split_whitespace().collect();
    let [dir] = dirs.as_slice() else {
        let quoted: Vec<String> = dirs.iter().map(|dir| gofmt::quote(dir)).collect();
        return Err(PreflightError::cgroups(&format!(
            "the host's cgroup tree holds {} directories named after the container, not one: [{}]",
            dirs.len(),
            quoted.join(" ")
        )));
    };
    if dir.trim_end_matches('/') == CGROUP_ROOT {
        return Err(PreflightError::cgroups(
            "the container's cgroup is the root",
        ));
    }
    Ok((*dir).to_owned())
}

/// Builds or names the two images a run needs, in the order [`prepare`] asks for them.
pub trait Builds {
    /// The tools image the probe and netguard run.
    ///
    /// # Errors
    ///
    /// The build failed.
    fn tools(&mut self) -> Result<String, String>;

    /// BitGauge's image. The Rust runners never build it: they hand over the image the setup's
    /// identity check passed.
    ///
    /// # Errors
    ///
    /// The image cannot be had.
    fn shipped(&mut self) -> Result<String, String>;
}

/// Selects what [`prepare`] checks.
#[derive(Clone, Copy, Debug, Default)]
pub struct PrepareOptions<'a> {
    /// Checks the cgroup accounting, for a runner that reports the client's counters.
    pub cgroups: bool,
    /// The profile the shaping probe runs, `None` when nothing is shaped.
    pub shaped: Option<&'a Profile>,
}

/// What [`prepare`] built.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Prepared {
    /// The tools image.
    pub tools_image: String,
    /// BitGauge's image.
    pub bitgauge_image: String,
}

/// Checks the daemon and builds the images, in the order testing.md section 5.1 gives: the
/// daemon's cgroup claim before any build, the tools image, the probe, then BitGauge's image. A
/// refusal returns before the next step, so no topology can start on a daemon it refused.
///
/// # Errors
///
/// The first refusal or failure.
pub fn prepare(
    runner: &dyn Runner,
    up_probe: UpProbe<'_>,
    builds: &mut dyn Builds,
    opts: PrepareOptions<'_>,
) -> Result<Prepared, PreflightError> {
    if opts.cgroups {
        check_daemon_cgroups(runner)?;
    }
    let tools_image = builds
        .tools()
        .map_err(|error| PreflightError::other(format!("build the tools image: {error}")))?;
    if opts.cgroups || opts.shaped.is_some() {
        preflight(
            up_probe,
            PreflightOptions {
                tools_image: &tools_image,
                cgroups: opts.cgroups,
                shaped: opts.shaped,
            },
        )?;
    }
    let bitgauge_image = builds
        .shipped()
        .map_err(|error| PreflightError::other(format!("build BitGauge's image: {error}")))?;
    Ok(Prepared {
        tools_image,
        bitgauge_image,
    })
}

/// The first profile of the tier this invocation shapes, `None` when it shapes none (the ceiling
/// tier, or `HARNESS_SHAPE=none`).
#[must_use]
pub fn first_shaped(spec: &TierSpec, unshaped: bool) -> Option<&Profile> {
    if unshaped {
        return None;
    }
    spec.profiles.iter().find(|profile| profile.shaped)
}

/// Reads `HARNESS_PREFLIGHT`: accounting, shaping, or empty for both; returns (accounting,
/// shaping).
///
/// # Errors
///
/// Any other value.
pub fn preflight_checks(value: &str) -> Result<(bool, bool), String> {
    match value {
        "" => Ok((true, true)),
        PREFLIGHT_ACCOUNTING => Ok((true, false)),
        PREFLIGHT_SHAPING => Ok((false, true)),
        _ => Err(format!(
            "unknown preflight {}; use {PREFLIGHT_ACCOUNTING}, {PREFLIGHT_SHAPING} or nothing \
             for both",
            gofmt::quote(value)
        )),
    }
}

#[cfg(test)]
mod tests;
