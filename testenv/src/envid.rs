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

// Adapted from swarm-scheduler-exporter/testenv/src/envid.rs at 722b8a3, MIT, Copyright (c) 2026 Roberto Leinardi

//! An environment's identity: its envid, the labels every resource of it carries, its resource
//! names, and the owner process. The envid's bytes and the names derived from it are
//! [`ENV_IDS`], on rust-common's `testenv-core`; the labels and the owner stay BitGauge's.

use std::fmt;
use std::fs;
use std::io;
use std::process;

use testenv_core::envid::{EnvIds, random_hex};

/// Namespaces every label this crate applies.
pub const LABEL_PREFIX: &str = "io.github.leinardi.bitgauge.test";
/// Names the environment a resource belongs to; cleanup is scoped by it.
pub const LABEL_ENV_ID: &str = "io.github.leinardi.bitgauge.test.envid";
/// `<hostname>:<pid>` of the test process that created the resource.
pub const LABEL_OWNER: &str = "io.github.leinardi.bitgauge.test.owner";
/// When the environment came up, in RFC 3339.
pub const LABEL_STARTED: &str = "io.github.leinardi.bitgauge.test.started";
/// `true` on the marker of an environment kept after a failure.
pub const LABEL_KEEP: &str = "io.github.leinardi.bitgauge.test.keep";

/// How BitGauge names its environments: 4 random bytes (8 hex characters), [`LABEL_ENV_ID`], and
/// resource names `bitgauge-test-<envid>-<base>` ([`EnvIds::resource_name`]); the docker
/// `--filter` value that selects one environment's resources is [`EnvIds::cli_filter`].
pub const ENV_IDS: EnvIds = EnvIds {
    bytes: 4,
    label: LABEL_ENV_ID,
    prefix: "bitgauge-test",
};

/// The prefix of a test's temporary directories, the first argument of the runner's `main`.
pub const TEMP_DIR_PREFIX: &str = "bitgauge-test-";

/// A random 8-character hex identifier for one environment.
///
/// # Errors
///
/// `/dev/urandom` cannot be read.
pub fn generate_env_id() -> io::Result<String> {
    random_hex(ENV_IDS.bytes)
}

/// The process that created an environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Owner {
    /// Its host.
    pub host: String,
    /// Its PID on that host.
    pub pid: u32,
}

impl fmt::Display for Owner {
    /// The [`LABEL_OWNER`] value.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}:{}", self.host, self.pid)
    }
}

/// A [`LABEL_OWNER`] value that is not `<hostname>:<pid>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BadOwner(pub String);

impl fmt::Display for BadOwner {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "owner is not <hostname>:<pid>: {:?}", self.0)
    }
}

impl std::error::Error for BadOwner {}

/// This process on this host.
///
/// # Errors
///
/// The hostname cannot be read.
pub fn current_owner() -> io::Result<Owner> {
    Ok(Owner {
        host: hostname()?,
        pid: process::id(),
    })
}

/// Go's `os.Hostname` on Linux: the kernel's hostname, as `/proc` reports it.
///
/// # Errors
///
/// `/proc/sys/kernel/hostname` cannot be read.
pub fn hostname() -> io::Result<String> {
    let raw = fs::read_to_string("/proc/sys/kernel/hostname")?;
    Ok(raw.strip_suffix('\n').unwrap_or(&raw).to_owned())
}

/// Reads an owner label value. The PID is after the last colon, so a hostname may hold colons of
/// its own.
///
/// # Errors
///
/// No colon, nothing before it, or a PID that is not a positive integer.
pub fn parse_owner(value: &str) -> Result<Owner, BadOwner> {
    let bad = || BadOwner(value.to_owned());
    let colon = value
        .rfind(':')
        .filter(|&colon| colon > 0)
        .ok_or_else(bad)?;
    let pid: i64 = value[colon + 1..].parse().map_err(|_| bad())?;
    let pid = u32::try_from(pid)
        .ok()
        .filter(|&pid| pid > 0)
        .ok_or_else(bad)?;
    Ok(Owner {
        host: value[..colon].to_owned(),
        pid,
    })
}

#[cfg(test)]
mod tests {
    use super::{ENV_IDS, Owner, generate_env_id, parse_owner};

    /// Go: `TestGenerateEnvID`, for BitGauge's configuration (the randomness itself is tested in
    /// rust-common's `testenv-core`, `envid::tests::an_envid_is_random_lowercase_hex`).
    #[test]
    fn generate_env_id_is_random_hex() {
        let first = generate_env_id().unwrap();
        assert!(
            first.len() == 8
                && first
                    .chars()
                    .all(|char| char.is_ascii_digit() || ('a'..='f').contains(&char)),
            "env ID {first:?} is not 8 lowercase hex characters"
        );
        assert_ne!(
            first,
            generate_env_id().unwrap(),
            "two env IDs are the same"
        );
        assert_eq!(
            ENV_IDS.resource_name(&first, "bitgauge"),
            format!("bitgauge-test-{first}-bitgauge")
        );
        assert_eq!(
            ENV_IDS.cli_filter(&first),
            format!("label=io.github.leinardi.bitgauge.test.envid={first}")
        );
    }

    /// Go: `TestParseOwner`.
    #[test]
    fn parse_owner_reads_the_last_colon() {
        let owner = parse_owner("host:with:colons:4242").unwrap();
        assert_eq!(
            owner,
            Owner {
                host: "host:with:colons".to_owned(),
                pid: 4242
            }
        );
        assert_eq!(owner.to_string(), "host:with:colons:4242");
        let accepted: Vec<&str> = ["", "host", ":42", "host:", "host:abc", "host:0", "host:-1"]
            .into_iter()
            .filter(|bad| parse_owner(bad).is_ok())
            .collect();
        assert!(accepted.is_empty(), "accepted: {accepted:?}");
    }
}
