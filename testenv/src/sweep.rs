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

// Adapted from swarm-scheduler-exporter/testenv/src/sweep_rules.rs at 722b8a3, MIT, Copyright (c) 2026 Roberto Leinardi

//! The stale sweep: environments of earlier runs that were killed before their teardown ran are
//! removed, and only when they are provably abandoned (Go's `testenv.Sweep`).

use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use jiff::fmt::friendly::SpanParser;
use jiff::{SignedDuration, Timestamp};

use crate::docker::Runner;
use crate::env::{EnvError, docker_error, remove_env};
use crate::envid::{LABEL_ENV_ID, LABEL_KEEP, LABEL_OWNER, LABEL_STARTED, hostname, parse_owner};

/// Overrides how old an abandoned environment must be before the sweep removes it.
pub const ENV_STALE_AFTER: &str = "BITGAUGE_HARNESS_STALE_AFTER";
/// The age below which no other environment is ever removed: six hours.
pub const DEFAULT_STALE_AFTER: SignedDuration = SignedDuration::from_hours(6);

const SECONDS_PER_MINUTE: i64 = 60;

/// One environment as its labels describe it. Every resource of an environment carries the same
/// envid, owner and started labels; `keep` is set when any of them is the keep marker.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Found {
    /// The envid.
    pub id: String,
    /// The owner label value.
    pub owner: String,
    /// The started label value.
    pub started: String,
    /// Whether the environment was kept after a failure.
    pub keep: bool,
}

/// The sweep's decision about one environment, with the reason a reader is shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verdict {
    /// The environment decided on.
    pub env: Found,
    /// Whether the sweep removes it.
    pub remove: bool,
    /// Why.
    pub reason: String,
}

/// Decides which environments are abandoned. Another envid is removed only when all of these
/// hold: it is older than `stale_after`, it is not kept, and its owner is provably dead -- on
/// this host and its PID does not exist. A foreign host is never assumed dead, and a label that
/// cannot be read proves nothing.
pub struct SweepRules {
    /// The time the ages are measured at.
    pub now: Timestamp,
    /// The age below which nothing is removed.
    pub stale_after: SignedDuration,
    /// This host.
    pub host: String,
    /// The current envid, which a sweep never touches; its teardown owns it.
    pub self_id: String,
    /// Whether a PID exists on this host.
    pub alive: Box<dyn Fn(u32) -> bool + Send + Sync>,
}

impl SweepRules {
    /// Applies the rules to one environment.
    #[must_use]
    pub fn decide(&self, env: Found) -> Verdict {
        let keep = |env: Found, reason: String| Verdict {
            env,
            remove: false,
            reason,
        };
        if env.id == self.self_id {
            return keep(env, "the current environment".to_owned());
        }
        if env.keep {
            return keep(env, "kept after a failure".to_owned());
        }
        // jiff reads RFC 3339 as Go's time.Parse does for every value written here; it is laxer
        // about case and the separator, which no label written here uses.
        let Ok(started) = env.started.parse::<Timestamp>() else {
            return keep(env, "its started label is unreadable".to_owned());
        };
        let age = self.now.duration_since(started);
        if age < self.stale_after {
            let minutes = SignedDuration::from_secs(
                (age.as_secs() + SECONDS_PER_MINUTE / 2).div_euclid(SECONDS_PER_MINUTE)
                    * SECONDS_PER_MINUTE,
            );
            return keep(
                env,
                format!("started {minutes:#} ago, under {:#}", self.stale_after),
            );
        }
        let Ok(owner) = parse_owner(&env.owner) else {
            return keep(env, "its owner label is unreadable".to_owned());
        };
        if owner.host != self.host {
            return keep(env, format!("owned by another host, {}", owner.host));
        }
        if (self.alive)(owner.pid) {
            return keep(
                env,
                format!("its owner, PID {}, is still running", owner.pid),
            );
        }
        Verdict {
            env,
            remove: true,
            reason: format!("stale, and its owner PID {} is gone", owner.pid),
        }
    }
}

/// Reads [`ENV_STALE_AFTER`] through `getenv`, defaulting to [`DEFAULT_STALE_AFTER`]. The value
/// is a duration in jiff's friendly syntax (`90m`, `6h`, `1h30m`), as the server's configuration
/// reads durations.
///
/// # Errors
///
/// A value that is not a positive duration, rather than a default: a typo must not shorten the
/// window.
pub fn stale_after_from_env(
    getenv: impl Fn(&str) -> Option<String>,
) -> Result<SignedDuration, EnvError> {
    static PARSER: SpanParser = SpanParser::new();
    let raw = getenv(ENV_STALE_AFTER).unwrap_or_default();
    if raw.is_empty() {
        return Ok(DEFAULT_STALE_AFTER);
    }
    match PARSER.parse_duration(&raw) {
        Ok(value) if value.is_positive() => Ok(value),
        Ok(_) | Err(_) => Err(EnvError::BadStaleAfter { value: raw }),
    }
}

/// Whether `pid` exists on this host, read from `/proc`. Go sends signal 0; without libc the
/// equivalent is the process's `/proc` entry, which also exists for a process of another user.
/// Where `/proc` hides other users' processes (`hidepid`) or is not mounted, `/proc/1` is not
/// visible either, and then every PID counts as alive: a PID that cannot be checked is never
/// proven dead.
#[must_use]
pub fn process_alive(pid: u32) -> bool {
    let exists = |path: &str| match fs::metadata(Path::new(path)) {
        Ok(_) => true,
        // Any error but "not there" is not proof of absence.
        Err(error) => error.kind() != ErrorKind::NotFound,
    };
    pid != 0 && (exists(&format!("/proc/{pid}")) || !exists("/proc/1"))
}

/// The sweep rules for this process: now, this host, the configured window and a PID check on
/// this host.
///
/// # Errors
///
/// A bad [`ENV_STALE_AFTER`], or a hostname that cannot be read.
pub fn default_rules(self_id: &str) -> Result<SweepRules, EnvError> {
    let stale_after = stale_after_from_env(|key| std::env::var(key).ok())?;
    let host = hostname().map_err(|source| EnvError::System {
        what: "hostname",
        source,
    })?;
    Ok(SweepRules {
        now: Timestamp::now(),
        stale_after,
        host,
        self_id: self_id.to_owned(),
        alive: Box::new(process_alive),
    })
}

/// The `--format` that prints a resource's four labels.
fn label_format() -> String {
    format!(
        r#"{{{{.Label "{LABEL_ENV_ID}"}}}}|{{{{.Label "{LABEL_OWNER}"}}}}|{{{{.Label "{LABEL_STARTED}"}}}}|{{{{.Label "{LABEL_KEEP}"}}}}"#
    )
}

/// Every environment that has a resource on the daemon, from the labels of its containers,
/// networks and volumes, sorted by envid.
///
/// # Errors
///
/// A list command failed.
pub fn list(runner: &dyn Runner) -> Result<Vec<Found>, EnvError> {
    let format = label_format();
    let filter = format!("label={LABEL_ENV_ID}");
    let mut by_id: BTreeMap<String, Found> = BTreeMap::new();
    for command in [
        &["ps", "-a", "--filter", &filter, "--format", &format][..],
        &["network", "ls", "--filter", &filter, "--format", &format],
        &["volume", "ls", "--filter", &filter, "--format", &format],
    ] {
        let out = runner
            .run(command)
            .map_err(docker_error("list environments"))?;
        for line in out.lines() {
            let fields: Vec<&str> = line.split('|').collect();
            let [id, owner, started, keep] = fields[..] else {
                continue;
            };
            if id.is_empty() {
                continue;
            }
            let found = by_id.entry(id.to_owned()).or_insert_with(|| Found {
                id: id.to_owned(),
                owner: owner.to_owned(),
                started: started.to_owned(),
                keep: false,
            });
            found.keep = found.keep || keep == "true";
        }
    }
    Ok(by_id.into_values().collect())
}

/// Removes every environment the rules find abandoned and returns the verdict on each one,
/// removed or not, so a caller can list what was kept and why.
///
/// # Errors
///
/// A list or remove command failed.
pub fn sweep(runner: &dyn Runner, rules: &SweepRules) -> Result<Vec<Verdict>, EnvError> {
    let envs = list(runner)?;
    let mut verdicts = Vec::with_capacity(envs.len());
    for env in envs {
        let verdict = rules.decide(env);
        if verdict.remove {
            remove_env(runner, &verdict.env.id)?;
        }
        verdicts.push(verdict);
    }
    Ok(verdicts)
}

/// Removes every environment on the daemon, whoever owns it and whether or not it was kept: the
/// one project-wide removal, behind `make harness-sweep-all CONFIRM=1`. It returns the
/// environments it removed.
///
/// # Errors
///
/// A list or remove command failed.
pub fn remove_all(runner: &dyn Runner) -> Result<Vec<Found>, EnvError> {
    let envs = list(runner)?;
    for env in &envs {
        remove_env(runner, &env.id)?;
    }
    Ok(envs)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::sync::Arc;

    use jiff::{SignedDuration, Timestamp};

    use super::{
        DEFAULT_STALE_AFTER, Found, SweepRules, label_format, process_alive, remove_all,
        stale_after_from_env, sweep,
    };
    use crate::docker::tests::FakeDocker;
    use crate::envid::{LABEL_ENV_ID, label_filter};

    fn now() -> Timestamp {
        "2026-10-09T12:00:00Z".parse().unwrap()
    }

    fn rules(self_id: &str) -> SweepRules {
        SweepRules {
            now: now(),
            stale_after: DEFAULT_STALE_AFTER,
            host: "here".to_owned(),
            self_id: self_id.to_owned(),
            alive: Box::new(|pid| pid == 100),
        }
    }

    fn found(id: &str, owner: &str, started: &str, keep: bool) -> Found {
        Found {
            id: id.to_owned(),
            owner: owner.to_owned(),
            started: started.to_owned(),
            keep,
        }
    }

    /// Go: `TestSweepRules`: every way an environment is spared, and the one way it is removed.
    #[test]
    fn sweep_rules() {
        let old = (now() - SignedDuration::from_hours(7)).to_string();
        let young = (now() - SignedDuration::from_hours(5)).to_string();
        let rules = rules("self0000");
        let mut problems = Vec::new();
        for (name, env, remove) in [
            (
                "stale and its owner is gone",
                found("a", "here:200", &old, false),
                true,
            ),
            (
                "the current environment",
                found("self0000", "here:200", &old, false),
                false,
            ),
            (
                "kept after a failure",
                found("a", "here:200", &old, true),
                false,
            ),
            (
                "younger than the window",
                found("a", "here:200", &young, false),
                false,
            ),
            (
                "owner still running",
                found("a", "here:100", &old, false),
                false,
            ),
            (
                "owned by another host",
                found("a", "there:200", &old, false),
                false,
            ),
            (
                "unreadable owner",
                found("a", "nonsense", &old, false),
                false,
            ),
            (
                "unreadable start",
                found("a", "here:200", "yesterday", false),
                false,
            ),
            ("no start at all", found("a", "here:200", "", false), false),
        ] {
            let verdict = rules.decide(env);
            if verdict.remove != remove || verdict.reason.is_empty() {
                problems.push(format!(
                    "{name}: remove = {} ({}), want {remove}",
                    verdict.remove, verdict.reason
                ));
            }
        }
        assert!(problems.is_empty(), "{problems:#?}");
        let young = rules.decide(found("a", "here:200", &young, false));
        assert_eq!(young.reason, "started 5h ago, under 6h");
    }

    fn list_commands() -> [String; 3] {
        let format = label_format();
        let filter = format!("label={LABEL_ENV_ID}");
        [
            format!("ps -a --filter {filter} --format {format}"),
            format!("network ls --filter {filter} --format {format}"),
            format!("volume ls --filter {filter} --format {format}"),
        ]
    }

    /// The list format is Go's `{{.Label %q}}` for each label.
    #[test]
    fn label_format_quotes_each_label() {
        assert_eq!(
            label_format(),
            concat!(
                r#"{{.Label "io.github.leinardi.bitgauge.test.envid"}}|"#,
                r#"{{.Label "io.github.leinardi.bitgauge.test.owner"}}|"#,
                r#"{{.Label "io.github.leinardi.bitgauge.test.started"}}|"#,
                r#"{{.Label "io.github.leinardi.bitgauge.test.keep"}}"#
            )
        );
    }

    /// Go: `TestSweepRemovesOnlyTheAbandoned`: a whole sweep over a daemon holding three
    /// environments.
    #[test]
    fn sweep_removes_only_the_abandoned() {
        let old = (now() - SignedDuration::from_hours(24)).to_string();
        let row = |id: &str, owner: &str, keep: &str| format!("{id}|{owner}|{old}|{keep}");
        let [containers, networks, _] = list_commands();
        let container_rows = format!(
            "{}\n{}\n{}\n",
            row("dead0000", "here:200", ""),
            row("kept0000", "here:200", ""),
            row("live0000", "here:100", "")
        );
        let network_rows = format!("{}\n", row("kept0000", "here:200", "true"));
        let dead = format!("ps -aq --filter {}", label_filter("dead0000"));
        let runner = Arc::new(FakeDocker::answering(&[
            (&containers, &container_rows),
            (&networks, &network_rows),
            (&dead, "c-dead\n"),
        ]));
        let verdicts = sweep(runner.as_ref(), &rules("")).unwrap();
        let removed: BTreeMap<&str, bool> = verdicts
            .iter()
            .map(|verdict| (verdict.env.id.as_str(), verdict.remove))
            .collect();
        assert_eq!(
            removed,
            BTreeMap::from([("dead0000", true), ("kept0000", false), ("live0000", false)]),
            "{verdicts:#?}"
        );
        assert_eq!(runner.ran("rm "), ["rm -f -v c-dead"]);
        for list in runner.ran("ps -aq") {
            assert!(
                list.contains(&label_filter("dead0000")),
                "the sweep listed resources of an environment it spared: {list}"
            );
        }
    }

    /// Go: `TestRemoveAllTakesEveryEnvironment`: the one removal that ignores the rules, so kept
    /// and live environments go too.
    #[test]
    fn remove_all_takes_every_environment() {
        let [containers, networks, _] = list_commands();
        let live = format!("ps -aq --filter {}", label_filter("live0000"));
        let kept = format!("network ls -q --filter {}", label_filter("kept0000"));
        let runner = Arc::new(FakeDocker::answering(&[
            (&containers, "live0000|here:1|2026-10-09T12:00:00Z|\n"),
            (&networks, "kept0000|here:1|2026-10-09T12:00:00Z|true\n"),
            (&live, "c-live\n"),
            (&kept, "n-kept\n"),
        ]));
        let removed = remove_all(runner.as_ref()).unwrap();
        assert_eq!(removed.len(), 2, "{removed:#?}");
        let mut removals = runner.ran("rm ");
        removals.extend(runner.ran("network rm "));
        assert_eq!(removals, ["rm -f -v c-live", "network rm n-kept"]);
    }

    /// Go: `TestStaleAfterFromEnv`.
    #[test]
    fn stale_after_reads_a_positive_duration() {
        let read = |value: &str| {
            let value = value.to_owned();
            stale_after_from_env(move |_| Some(value.clone()))
        };
        assert_eq!(read("").unwrap(), DEFAULT_STALE_AFTER);
        assert_eq!(stale_after_from_env(|_| None).unwrap(), DEFAULT_STALE_AFTER);
        assert_eq!(read("90m").unwrap(), SignedDuration::from_mins(90));
        let accepted: Vec<&str> = ["6", "soon", "-1h", "0s"]
            .into_iter()
            .filter(|bad| read(bad).is_ok())
            .collect();
        assert!(accepted.is_empty(), "accepted: {accepted:?}");
    }

    /// Go: `TestProcessAlive`.
    #[test]
    fn process_alive_checks_the_pid() {
        assert!(
            process_alive(std::process::id()),
            "this process is not alive"
        );
        // Far above any pid_max, so no process can hold it.
        assert!(
            !process_alive(i32::MAX.unsigned_abs()),
            "an impossible PID is alive"
        );
    }
}
