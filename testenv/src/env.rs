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

//! Isolated, labeled environments driven through the docker CLI (testing.md section 5.1; Go's
//! `testenv` package).
//!
//! Every resource an environment creates carries four labels: its envid, its owner (hostname and
//! PID of the test process), when it started, and, on the marker of an environment kept after a
//! failure, `keep=true`. Cleanup is scoped by them: [`Provider::down`] removes only the current
//! envid, and the stale sweep ([`crate::sweep`]) removes another envid only when it is provably
//! abandoned.
//!
//! An environment goes when its test ends: [`Env::cleanup`] registers the teardown with the
//! runner's [`Test`], which tells it whether the test failed; outside the runner an [`EnvGuard`]
//! does the same on [`EnvGuard::finish`] or on drop.

use std::fmt;
use std::io;
use std::ops::Deref;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use jiff::Timestamp;

use crate::docker::{DockerCli, DockerError, Output, Runner};
use crate::envid::{
    LABEL_ENV_ID, LABEL_KEEP, LABEL_OWNER, LABEL_STARTED, Owner, current_owner, generate_env_id,
    label_filter, resource_name,
};
use crate::logger::{Logger, Value};
use crate::runner::Test;

/// Selects the provider; docker is the only one, and the default.
pub const ENV_PROVIDER: &str = "BITGAUGE_TEST_PROVIDER";
/// Keeps a failed environment's resources for inspection when set to `1`.
pub const ENV_KEEP_ON_FAILURE: &str = "BITGAUGE_TEST_KEEP_ON_FAILURE";

const PROVIDER_DOCKER: &str = "docker";
const KEEP_MARKER: &str = "keep";
/// The bound on each teardown command.
pub const DOWN_TIMEOUT: Duration = Duration::from_mins(2);

/// What can go wrong bringing an environment up or down, or sweeping.
#[derive(Debug)]
pub enum EnvError {
    /// `BITGAUGE_TEST_PROVIDER` names a provider that does not exist.
    UnknownProvider {
        /// The value.
        name: String,
    },
    /// The envid or the owner could not be read from the system.
    System {
        /// What was being read.
        what: &'static str,
        /// Why it failed.
        source: io::Error,
    },
    /// A docker command of an environment failed.
    Docker {
        /// The environment, or the operation when it is not one environment's.
        context: String,
        /// The command's error.
        source: DockerError,
    },
    /// `BITGAUGE_HARNESS_STALE_AFTER` is not a positive duration.
    BadStaleAfter {
        /// The value.
        value: String,
    },
}

impl fmt::Display for EnvError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownProvider { name } => write!(
                formatter,
                "unknown test provider {name:?}; supported: {PROVIDER_DOCKER}"
            ),
            Self::System { what, source } => write!(formatter, "{what}: {source}"),
            Self::Docker { context, source } => write!(formatter, "{context}: {source}"),
            Self::BadStaleAfter { value } => write!(
                formatter,
                "bad stale-after window: {}={value:?} is not a positive duration",
                crate::sweep::ENV_STALE_AFTER
            ),
        }
    }
}

impl std::error::Error for EnvError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::System { source, .. } => Some(source),
            Self::Docker { source, .. } => Some(source),
            Self::UnknownProvider { .. } | Self::BadStaleAfter { .. } => None,
        }
    }
}

/// Wraps a docker error with its context.
pub(crate) fn docker_error(context: impl Into<String>) -> impl FnOnce(DockerError) -> EnvError {
    let context = context.into();
    move |source| EnvError::Docker { context, source }
}

/// Configures one environment.
#[derive(Debug, Clone, Default)]
pub struct Spec {
    /// Generated when empty.
    pub env_id: String,
    /// Keeps the resources of a failed environment, marked `keep=true`.
    pub keep_on_failure: bool,
    /// Defaults to a redacting logger on stderr.
    pub logger: Option<Logger>,
}

impl Spec {
    /// A spec with `keep_on_failure` read from [`ENV_KEEP_ON_FAILURE`].
    #[must_use]
    pub fn from_env() -> Self {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// [`Spec::from_env`] with the variables read through `lookup`.
    #[must_use]
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        Self {
            keep_on_failure: lookup(ENV_KEEP_ON_FAILURE).as_deref() == Some("1"),
            ..Self::default()
        }
    }
}

/// Brings environments up and down.
pub trait Provider: Send + Sync {
    /// The provider's name, as [`ENV_PROVIDER`] spells it.
    fn name(&self) -> &'static str;

    /// Registers a new environment.
    ///
    /// # Errors
    ///
    /// The envid or the owner cannot be determined.
    fn up(&self, spec: Spec) -> Result<Env, EnvError>;

    /// Removes the environment's resources, or keeps them when it `failed` and asked to.
    ///
    /// # Errors
    ///
    /// A docker command failed.
    fn down(&self, env: &Env, failed: bool) -> Result<(), EnvError>;
}

/// The provider selected by [`ENV_PROVIDER`]; docker is the default and the only one, on the
/// docker CLI logging to stderr.
///
/// # Errors
///
/// [`EnvError::UnknownProvider`] for any other value.
pub fn new_provider() -> Result<Arc<dyn Provider>, EnvError> {
    provider_from_lookup(|key| std::env::var(key).ok())
}

/// [`new_provider`] with the variables read through `lookup`.
///
/// # Errors
///
/// [`EnvError::UnknownProvider`] for a provider other than docker.
pub fn provider_from_lookup(
    lookup: impl Fn(&str) -> Option<String>,
) -> Result<Arc<dyn Provider>, EnvError> {
    let name = lookup(ENV_PROVIDER).unwrap_or_default();
    if name.is_empty() || name == PROVIDER_DOCKER {
        return Ok(Arc::new(DockerProvider::new(
            Arc::new(DockerCli::default()),
        )));
    }
    Err(EnvError::UnknownProvider { name })
}

/// Creates environments on the local Docker daemon through a [`Runner`].
pub struct DockerProvider {
    runner: Arc<dyn Runner>,
    now: fn() -> Timestamp,
}

impl DockerProvider {
    /// A provider that runs docker commands through `runner`.
    #[must_use]
    pub fn new(runner: Arc<dyn Runner>) -> Self {
        Self {
            runner,
            now: Timestamp::now,
        }
    }
}

impl Provider for DockerProvider {
    fn name(&self) -> &'static str {
        PROVIDER_DOCKER
    }

    /// Creates nothing: resources are created by the test through [`Env::docker`], which labels
    /// them.
    fn up(&self, spec: Spec) -> Result<Env, EnvError> {
        let id = if spec.env_id.is_empty() {
            generate_env_id().map_err(|source| EnvError::System {
                what: "generate env ID",
                source,
            })?
        } else {
            spec.env_id
        };
        let owner = current_owner().map_err(|source| EnvError::System {
            what: "hostname",
            source,
        })?;
        let logger = spec.logger.unwrap_or_else(Logger::stderr);
        Ok(Env {
            logger: logger.with("envid", id.as_str()),
            id,
            owner,
            started: Timestamp::from_second((self.now)().as_second()).unwrap_or_default(),
            keep_on_failure: spec.keep_on_failure,
            runner: Arc::clone(&self.runner),
        })
    }

    /// A failed environment with `keep_on_failure` set is kept: a `keep=true` marker network is
    /// created, so the stale sweep leaves it alone, and its envid is logged for inspection.
    fn down(&self, env: &Env, failed: bool) -> Result<(), EnvError> {
        if failed && env.keep_on_failure {
            let keep = format!("{LABEL_KEEP}=true");
            let marker = resource_name(&env.id, KEEP_MARKER);
            env.docker_timeout(
                &["network", "create", "--internal", "--label", &keep, &marker],
                Some(DOWN_TIMEOUT),
            )
            .map_err(|error| match error {
                EnvError::Docker { source, .. } => EnvError::Docker {
                    context: format!("mark {} kept", env.id),
                    source,
                },
                other @ (EnvError::UnknownProvider { .. }
                | EnvError::System { .. }
                | EnvError::BadStaleAfter { .. }) => other,
            })?;
            env.logger.warn(
                "kept the failed environment for inspection; the stale sweep leaves it alone",
                &[("filter", Value::from(label_filter(&env.id)))],
            );
            return Ok(());
        }
        remove_env(self.runner.as_ref(), &env.id)
    }
}

/// One live environment. Clones share its runner.
#[derive(Clone)]
pub struct Env {
    /// The envid.
    pub id: String,
    /// The process that created it.
    pub owner: Owner,
    /// When it came up, to the second.
    pub started: Timestamp,
    /// Whether a failure keeps its resources.
    pub keep_on_failure: bool,
    /// Its logger, with the envid on every record.
    pub logger: Logger,
    runner: Arc<dyn Runner>,
}

impl fmt::Debug for Env {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Env")
            .field("id", &self.id)
            .field("owner", &self.owner)
            .field("started", &self.started)
            .field("keep_on_failure", &self.keep_on_failure)
            .finish_non_exhaustive()
    }
}

impl Env {
    /// The `--label` arguments every resource of the environment carries.
    #[must_use]
    pub fn labels(&self) -> Vec<String> {
        vec![
            "--label".to_owned(),
            format!("{LABEL_ENV_ID}={}", self.id),
            "--label".to_owned(),
            format!("{LABEL_OWNER}={}", self.owner),
            "--label".to_owned(),
            format!("{LABEL_STARTED}={}", self.started),
        ]
    }

    /// The name of one resource of the environment: `bitgauge-test-<envid>-<base>`.
    #[must_use]
    pub fn name(&self, base: &str) -> String {
        resource_name(&self.id, base)
    }

    /// The runner the environment's commands go through.
    #[must_use]
    pub fn runner(&self) -> &Arc<dyn Runner> {
        &self.runner
    }

    /// Runs a docker command and returns its standard output. For a command that creates a
    /// container, network or volume, the environment's labels are inserted after the subcommand,
    /// so nothing it creates is unlabeled.
    ///
    /// # Errors
    ///
    /// [`EnvError::Docker`], naming the environment, when the command fails.
    pub fn docker(&self, args: &[&str]) -> Result<String, EnvError> {
        self.docker_timeout(args, None)
    }

    /// [`Env::docker`] with a timeout.
    ///
    /// # Errors
    ///
    /// [`EnvError::Docker`], naming the environment, when the command fails or times out.
    pub fn docker_timeout(
        &self,
        args: &[&str],
        timeout: Option<Duration>,
    ) -> Result<String, EnvError> {
        let labels = self.labels();
        let labeled = with_labels(args, &labels);
        self.runner
            .run_timeout(&labeled, timeout)
            .map_err(docker_error(format!("environment {}", self.id)))
    }

    /// [`Env::docker`] that returns the output whatever the exit status, for a command whose
    /// failure is the point (a refused flag, an expected exit code).
    ///
    /// # Errors
    ///
    /// [`EnvError::Docker`] when docker cannot run or times out.
    pub fn output(&self, args: &[&str], timeout: Option<Duration>) -> Result<Output, EnvError> {
        let labels = self.labels();
        let labeled = with_labels(args, &labels);
        self.runner
            .output(&labeled, timeout)
            .map_err(docker_error(format!("environment {}", self.id)))
    }

    /// Registers the teardown with `test`: when the test ends, after its body and the cleanups
    /// registered later, the environment is brought down through `provider`, kept or not
    /// depending on whether the test failed. A teardown error fails the test.
    pub fn cleanup(&self, test: &Test, provider: Arc<dyn Provider>) {
        let env = self.clone();
        test.cleanup(move |test| {
            if let Err(error) = provider.down(&env, test.failed()) {
                test.error(format!("tear down environment {}: {error}", env.id));
            }
        });
    }
}

/// An environment that is brought down when the guard is finished or dropped, for code that does
/// not run under the [`crate::runner`]. A drop during a panic counts as a failure.
pub struct EnvGuard {
    env: Env,
    provider: Arc<dyn Provider>,
    done: bool,
}

impl EnvGuard {
    /// Guards `env`, to be brought down through `provider`.
    #[must_use]
    pub fn new(env: Env, provider: Arc<dyn Provider>) -> Self {
        Self {
            env,
            provider,
            done: false,
        }
    }

    /// Brings the environment down now, kept when it `failed` and asked to.
    ///
    /// # Errors
    ///
    /// The teardown failed.
    pub fn finish(mut self, failed: bool) -> Result<(), EnvError> {
        self.done = true;
        self.provider.down(&self.env, failed)
    }
}

impl Deref for EnvGuard {
    type Target = Env;

    fn deref(&self) -> &Env {
        &self.env
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        if self.done {
            return;
        }
        if let Err(error) = self.provider.down(&self.env, thread::panicking()) {
            self.env.logger.warn(
                "tear down the environment",
                &[("error", Value::from(error.to_string()))],
            );
        }
    }
}

/// The docker subcommands that create a labeled resource.
const CREATING: &[&[&str]] = &[
    &["run"],
    &["create"],
    &["container", "run"],
    &["container", "create"],
    &["network", "create"],
    &["volume", "create"],
];

/// `args` with `labels` inserted after a creating subcommand.
fn with_labels<'arg>(args: &[&'arg str], labels: &'arg [String]) -> Vec<&'arg str> {
    for subcommand in CREATING {
        if args.starts_with(subcommand) {
            let words = subcommand.len();
            let mut labeled = Vec::with_capacity(args.len() + labels.len());
            labeled.extend_from_slice(&args[..words]);
            labeled.extend(labels.iter().map(String::as_str));
            labeled.extend_from_slice(&args[words..]);
            return labeled;
        }
    }
    args.to_vec()
}

/// Removes every container, network and volume labeled with `env_id`, containers first so the
/// networks and volumes they hold are free.
///
/// # Errors
///
/// A list or remove command failed.
pub fn remove_env(runner: &dyn Runner, env_id: &str) -> Result<(), EnvError> {
    let filter = label_filter(env_id);
    let kinds: [(&[&str], &[&str]); 3] = [
        (&["ps", "-aq", "--filter", &filter], &["rm", "-f", "-v"]),
        (
            &["network", "ls", "-q", "--filter", &filter],
            &["network", "rm"],
        ),
        (
            &["volume", "ls", "-q", "--filter", &filter],
            &["volume", "rm", "-f"],
        ),
    ];
    for (list, remove) in kinds {
        let out = runner
            .run_timeout(list, Some(DOWN_TIMEOUT))
            .map_err(docker_error(format!("list resources of {env_id}")))?;
        let ids: Vec<&str> = out.split_whitespace().collect();
        if ids.is_empty() {
            continue;
        }
        let command: Vec<&str> = remove.iter().copied().chain(ids).collect();
        runner
            .run_timeout(&command, Some(DOWN_TIMEOUT))
            .map_err(docker_error(format!("remove resources of {env_id}")))?;
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use std::sync::Arc;

    use super::{DockerProvider, Env, EnvGuard, Provider, Spec, provider_from_lookup};
    use crate::docker::tests::FakeDocker;
    use crate::envid::{LABEL_ENV_ID, LABEL_KEEP, LABEL_OWNER, LABEL_STARTED, label_filter};
    use crate::logger::Logger;

    pub(crate) fn up_env(runner: &Arc<FakeDocker>, env_id: &str, keep_on_failure: bool) -> Env {
        DockerProvider::new(Arc::clone(runner) as _)
            .up(Spec {
                env_id: env_id.to_owned(),
                keep_on_failure,
                logger: Some(Logger::discard()),
            })
            .unwrap()
    }

    /// Go: `TestEveryCreatedResourceIsLabeled`: nothing an environment creates escapes its
    /// labels, since an unlabeled resource is one no cleanup or sweep can ever find.
    #[test]
    fn every_created_resource_is_labeled() {
        let runner = Arc::new(FakeDocker::default());
        let env = up_env(&runner, "abcd1234", false);
        for command in [
            &["run", "-d", "image"][..],
            &["create", "image"],
            &["container", "run", "image"],
            &["container", "create", "image"],
            &["network", "create", "--internal", "net"],
            &["volume", "create", "vol"],
            &["exec", "container", "true"],
        ] {
            env.docker(command).unwrap();
        }
        let mut problems = Vec::new();
        for command in runner.ran("") {
            let labeled = command.contains(&format!("--label {LABEL_ENV_ID}=abcd1234"))
                && command.contains(&format!("--label {LABEL_OWNER}="))
                && command.contains(&format!("--label {LABEL_STARTED}="));
            if command.starts_with("exec ") {
                if command.contains("--label") {
                    problems.push(format!(
                        "a command that creates nothing was labeled: {command}"
                    ));
                }
            } else if !labeled {
                problems.push(format!(
                    "created without the environment's labels: {command}"
                ));
            }
        }
        let first = &runner.ran("")[0];
        if !first.starts_with("run --label ") || !first.ends_with(" -d image") {
            problems.push(format!(
                "the labels are not inserted after the subcommand: {first}"
            ));
        }
        assert!(problems.is_empty(), "{problems:#?}");
    }

    /// Go: `TestDownRemovesOnlyItsOwnEnvironment`: the scope of normal cleanup.
    #[test]
    fn down_removes_only_its_own_environment() {
        let filter = label_filter("mine0000");
        let runner = Arc::new(FakeDocker::answering(&[
            (&format!("ps -aq --filter {filter}"), "c1\nc2\n"),
            (&format!("network ls -q --filter {filter}"), "n1\n"),
        ]));
        let env = up_env(&runner, "mine0000", false);
        DockerProvider::new(Arc::clone(&runner) as _)
            .down(&env, false)
            .unwrap();
        for list in runner.ran("") {
            assert!(
                !list.contains("--filter") || list.contains(&filter),
                "Down listed beyond its own envid: {list}"
            );
        }
        assert_eq!(runner.ran("rm "), ["rm -f -v c1 c2"]);
        assert_eq!(runner.ran("network rm "), ["network rm n1"]);
        assert!(
            runner.ran("volume rm ").is_empty(),
            "removed unlisted volumes"
        );
    }

    /// Go: `TestDownKeepsAFailedEnvironmentOnlyWhenAsked`: a kept environment gets a `keep=true`
    /// marker and loses nothing; a failure without the flag is cleaned up like a pass.
    #[test]
    fn down_keeps_a_failed_environment_only_when_asked() {
        let mut problems = Vec::new();
        for (name, keep, failed, want_kept, want_remove) in [
            ("failed and kept", true, true, true, false),
            ("failed, not asked to keep", false, true, false, true),
            ("passed with keep set", true, false, false, true),
        ] {
            let runner = Arc::new(FakeDocker::answering(&[(
                &format!("ps -aq --filter {}", label_filter("env00000")),
                "c1\n",
            )]));
            let env = up_env(&runner, "env00000", keep);
            DockerProvider::new(Arc::clone(&runner) as _)
                .down(&env, failed)
                .unwrap();
            let marker = runner.ran(&format!("network create --label {LABEL_ENV_ID}=env00000"));
            let kept = marker.len() == 1
                && marker[0].contains(&format!("--label {LABEL_KEEP}=true"))
                && marker[0].ends_with("bitgauge-test-env00000-keep");
            if kept != want_kept {
                problems.push(format!("{name}: kept = {kept}: {:?}", runner.ran("")));
            }
            let removed = !runner.ran("rm ").is_empty();
            if removed != want_remove {
                problems.push(format!("{name}: removed = {removed}: {:?}", runner.ran("")));
            }
        }
        assert!(problems.is_empty(), "{problems:#?}");
    }

    /// The guard brings its environment down once: on `finish`, or on drop when it was not
    /// finished, kept when the drop comes from a panic and the spec asked to keep.
    #[test]
    fn guard_tears_down_once() {
        let runner = Arc::new(FakeDocker::answering(&[(
            &format!("ps -aq --filter {}", label_filter("guard000")),
            "c1\n",
        )]));
        let provider: Arc<dyn Provider> = Arc::new(DockerProvider::new(Arc::clone(&runner) as _));
        let guard = EnvGuard::new(up_env(&runner, "guard000", true), Arc::clone(&provider));
        guard.finish(false).unwrap();
        assert_eq!(runner.ran("rm "), ["rm -f -v c1"]);
        drop(EnvGuard::new(
            up_env(&runner, "guard000", true),
            Arc::clone(&provider),
        ));
        assert_eq!(
            runner.ran("rm ").len(),
            2,
            "a dropped guard did not tear down"
        );
        let kept = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = EnvGuard::new(up_env(&runner, "guard000", true), provider);
            panic!("the test failed");
        }));
        assert!(kept.is_err());
        assert_eq!(
            runner.ran("network create").len(),
            1,
            "a panic did not keep"
        );
        assert_eq!(runner.ran("rm ").len(), 2);
    }

    /// Go: `TestNewSelectsDocker`.
    #[test]
    fn new_selects_docker() {
        let provider = provider_from_lookup(|_| Some(String::new())).unwrap();
        assert_eq!(provider.name(), "docker");
        assert_eq!(provider_from_lookup(|_| None).unwrap().name(), "docker");
        assert!(
            provider_from_lookup(|_| Some("multipass".to_owned())).is_err(),
            "an unknown provider was accepted"
        );
    }

    /// `Spec::from_lookup` keeps on failure only for exactly `1`.
    #[test]
    fn spec_reads_keep_on_failure() {
        for (value, want) in [(None, false), (Some("1"), true), (Some("true"), false)] {
            let spec = Spec::from_lookup(|_| value.map(str::to_owned));
            assert_eq!(spec.keep_on_failure, want, "{value:?}");
        }
    }
}
