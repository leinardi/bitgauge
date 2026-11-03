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

// Adapted from swarm-device-access/testenv/src/identity.rs at 4cd31c4, MIT, Copyright (c) 2026 Roberto Leinardi

//! The implementation identity check: before any test, every Docker suite proves that the image
//! under test is the implementation and the commit it was asked to test, and fails -- never
//! skips -- when it is not.
//!
//! The expectation comes from three required variables, with no default: [`ENV_IMPL`] (`go` or
//! `rust`), [`ENV_IMAGE`] and [`ENV_COMMIT`]. [`check`] then runs, through the environment's
//! docker runner:
//!
//! 1. **The help flag.** `docker run --rm --pull never --entrypoint /bitgauge <image> -help`. The
//!    Go binary's `flag` package takes `-help`: it prints the flag defaults on stderr, then
//!    [`GO_USAGE`] on stdout, and exits 0. The Rust binary's argument pre-scan refuses a
//!    single-dash long option: [`RUST_REFUSAL`] on stderr, nothing on stdout, exit 2
//!    (`src/cli.rs`). Each answer is matched whole, so neither build can stand in for the other.
//! 2. **The revision label.** `docker image inspect` must show [`REVISION_LABEL`] equal to the
//!    expected commit.
//! 3. **The binary.** `/bitgauge` is copied out of a created, never started, container, and its
//!    sha256 must equal that of the `bitgauge` file in the image's own layers, read from `docker
//!    save` (the legacy layout and the OCI layout, plain or gzip layers, the last layer holding
//!    the file winning as an overlay would). The copy is the binary the image suite traces.
//!
//! Each judgment is a pure function of what docker printed and the bytes it wrote
//! ([`check_help`], [`check_revision`], [`check_binary`], [`layers::binary_in_archive`]), so every
//! mismatch is unit-tested without a daemon. The crossed negative controls (the Go expectation
//! against the Rust image and the reverse) are [`check`] with an [`Expectation`] built by hand.

pub mod layers;

use std::collections::BTreeMap;
use std::fmt::{self, Write as _};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use sha2::{Digest as _, Sha256};

use crate::docker::Output;
use crate::env::{Env, EnvError};

/// The implementation the suite expects: `go` or `rust`, required, no default.
pub const ENV_IMPL: &str = "BITGAUGE_TEST_IMPL";
/// The image under test, required, no default.
pub const ENV_IMAGE: &str = "BITGAUGE_TEST_IMAGE";
/// The commit the image must be built from, as its revision label spells it; required.
pub const ENV_COMMIT: &str = "BITGAUGE_TEST_COMMIT";

/// The OCI label that carries the commit (both Dockerfiles set it from the `COMMIT` build arg).
pub const REVISION_LABEL: &str = "org.opencontainers.image.revision";
/// The binary in the image, its entrypoint.
pub const BINARY_PATH: &str = "/bitgauge";
/// The binary's name in a layer.
pub const BINARY_NAME: &str = "bitgauge";
/// The argument the check runs the binary with.
pub const IDENTITY_FLAG: &str = "-help";

/// The exit code the Rust binary refuses [`IDENTITY_FLAG`] with: a command line that cannot run.
pub const RUST_REFUSAL_EXIT_CODE: i32 = 2;
/// What the Rust binary writes to stderr for [`IDENTITY_FLAG`], byte for byte: the pre-scan's
/// refusal (`CliError::SingleDash` in `src/cli.rs`) and clap's usage. Stdout stays empty.
pub const RUST_REFUSAL: &str = "bitgauge: -help is not an option; write it as --help\n\
                                Usage: bitgauge [OPTIONS]\n       bitgauge <COMMAND>\n";

/// The exit code the Go binary answers [`IDENTITY_FLAG`] with.
pub const GO_HELP_EXIT_CODE: i32 = 0;
/// What the Go binary writes to stdout for [`IDENTITY_FLAG`], byte for byte (`usage` in
/// `cmd/bitgauge/main.go`).
pub const GO_USAGE: &str =
    "usage: bitgauge [serve|healthcheck] [--config /etc/bitgauge/config.yaml]\n";
/// How the Go binary's stderr starts for [`IDENTITY_FLAG`]: the `flag` package's defaults.
pub const GO_FLAG_USAGE_PREFIX: &str = "Usage of bitgauge serve:\n";

/// Which build of BitGauge an image holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Implementation {
    /// The Go binary, `cmd/bitgauge`.
    Go,
    /// The Rust binary, `src/main.rs`.
    Rust,
}

impl Implementation {
    /// Reads [`ENV_IMPL`]'s value: exactly `go` or `rust`.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "go" => Some(Self::Go),
            "rust" => Some(Self::Rust),
            _ => None,
        }
    }

    /// The value [`ENV_IMPL`] spells it with.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Go => "go",
            Self::Rust => "rust",
        }
    }

    /// The other implementation, for the crossed negative controls.
    #[must_use]
    pub const fn other(self) -> Self {
        match self {
            Self::Go => Self::Rust,
            Self::Rust => Self::Go,
        }
    }
}

impl fmt::Display for Implementation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Go => "Go",
            Self::Rust => "Rust",
        })
    }
}

/// What the suite was asked to test.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expectation {
    /// The implementation.
    pub implementation: Implementation,
    /// The image.
    pub image: String,
    /// The commit its revision label must name.
    pub commit: String,
}

impl Expectation {
    /// The expectation from [`ENV_IMPL`], [`ENV_IMAGE`] and [`ENV_COMMIT`].
    ///
    /// # Errors
    ///
    /// A variable that is missing or empty, or an implementation other than `go` or `rust`.
    pub fn from_env() -> Result<Self, IdentityError> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// [`Expectation::from_env`] with the variables read through `lookup`.
    ///
    /// # Errors
    ///
    /// A variable that is missing or empty, or an implementation other than `go` or `rust`.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, IdentityError> {
        let required = |name: &'static str| {
            lookup(name)
                .filter(|value| !value.is_empty())
                .ok_or(IdentityError::MissingVar { name })
        };
        let raw = required(ENV_IMPL)?;
        let implementation = Implementation::parse(&raw)
            .ok_or(IdentityError::InvalidImplementation { value: raw })?;
        Ok(Self {
            implementation,
            image: required(ENV_IMAGE)?,
            commit: required(ENV_COMMIT)?,
        })
    }
}

/// A checked image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    /// The implementation it holds.
    pub implementation: Implementation,
    /// The image.
    pub image: String,
    /// The commit its revision label names.
    pub commit: String,
    /// The binary copied out of it, the same bytes as its layer's.
    pub binary: PathBuf,
    /// The binary's sha256, in lowercase hex.
    pub sha256: String,
}

/// Why an image is not the expected one, or could not be checked. Every variant fails the run.
#[derive(Debug)]
pub enum IdentityError {
    /// A required variable is missing or empty.
    MissingVar {
        /// The variable.
        name: &'static str,
    },
    /// [`ENV_IMPL`] is neither `go` nor `rust`.
    InvalidImplementation {
        /// Its value.
        value: String,
    },
    /// The answer to [`IDENTITY_FLAG`] is not the expected implementation's.
    Help {
        /// The image.
        image: String,
        /// The implementation expected.
        expected: Implementation,
        /// What it answered.
        answer: Output,
    },
    /// The image has no [`REVISION_LABEL`].
    RevisionMissing {
        /// The image.
        image: String,
    },
    /// The [`REVISION_LABEL`] is another commit.
    RevisionMismatch {
        /// The image.
        image: String,
        /// The commit expected.
        expected: String,
        /// The label's value.
        found: String,
    },
    /// No layer of the image holds `bitgauge`, or the last that names it removes it.
    NoLayerBinary {
        /// The image.
        image: String,
    },
    /// The copied binary is not the one in the image's layers.
    ChecksumMismatch {
        /// The image.
        image: String,
        /// The copy's sha256.
        copied: String,
        /// The layer file's sha256.
        layer: String,
    },
    /// The `docker save` archive or the inspect output cannot be read.
    Unreadable(String),
    /// A docker command could not run or failed.
    Docker(EnvError),
    /// A local file could not be read or written.
    Io {
        /// What was being done.
        context: String,
        /// Why it failed.
        source: io::Error,
    },
}

impl fmt::Display for IdentityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingVar { name } => write!(
                formatter,
                "{name} is required and has no default (the make targets set it)"
            ),
            Self::InvalidImplementation { value } => {
                write!(formatter, "{ENV_IMPL} must be go or rust, not {value:?}")
            }
            Self::Help {
                image,
                expected,
                answer,
            } => {
                let status = answer
                    .status
                    .map_or_else(|| "was killed".to_owned(), |code| format!("exited {code}"));
                write!(
                    formatter,
                    "image {image} is not the {expected} build: {IDENTITY_FLAG} {status} with \
                     stdout {} and stderr {}, want {}",
                    excerpt(&answer.stdout),
                    excerpt(&answer.stderr),
                    want(*expected)
                )
            }
            Self::RevisionMissing { image } => {
                write!(formatter, "image {image} has no {REVISION_LABEL} label")
            }
            Self::RevisionMismatch {
                image,
                expected,
                found,
            } => write!(
                formatter,
                "image {image} is built from {found:?} ({REVISION_LABEL}), want {expected:?}"
            ),
            Self::NoLayerBinary { image } => {
                write!(formatter, "no layer of image {image} holds {BINARY_NAME}")
            }
            Self::ChecksumMismatch {
                image,
                copied,
                layer,
            } => write!(
                formatter,
                "the binary copied out of image {image} (sha256 {copied}) is not its layer's \
                 (sha256 {layer})"
            ),
            Self::Unreadable(detail) => formatter.write_str(detail),
            Self::Docker(error) => write!(formatter, "identity check: {error}"),
            Self::Io { context, source } => write!(formatter, "{context}: {source}"),
        }
    }
}

impl std::error::Error for IdentityError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Docker(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            Self::MissingVar { .. }
            | Self::InvalidImplementation { .. }
            | Self::Help { .. }
            | Self::RevisionMissing { .. }
            | Self::RevisionMismatch { .. }
            | Self::NoLayerBinary { .. }
            | Self::ChecksumMismatch { .. }
            | Self::Unreadable(_) => None,
        }
    }
}

/// What the expected implementation answers.
fn want(implementation: Implementation) -> String {
    match implementation {
        Implementation::Go => format!(
            "exit {GO_HELP_EXIT_CODE} with {GO_USAGE:?} on stdout and stderr starting \
             {GO_FLAG_USAGE_PREFIX:?} (the Rust build refuses the flag with exit \
             {RUST_REFUSAL_EXIT_CODE})"
        ),
        Implementation::Rust => format!(
            "exit {RUST_REFUSAL_EXIT_CODE} with {RUST_REFUSAL:?} on stderr alone (the Go build \
             prints its usage and exits {GO_HELP_EXIT_CODE})"
        ),
    }
}

/// The first line of `text`, quoted, with the byte count when there is more.
fn excerpt(text: &str) -> String {
    let first = text.lines().next().unwrap_or_default();
    if first.len() + 1 >= text.len() {
        return format!("{text:?}");
    }
    format!("{first:?} (first line of {} bytes)", text.len())
}

/// Judges the answer `image` gave to [`IDENTITY_FLAG`] against `expected`, whole: the exit code,
/// stdout and stderr.
///
/// # Errors
///
/// [`IdentityError::Help`] for any other answer.
pub fn check_help(
    expected: Implementation,
    image: &str,
    answer: &Output,
) -> Result<(), IdentityError> {
    let matches = match expected {
        Implementation::Go => {
            answer.status == Some(GO_HELP_EXIT_CODE)
                && answer.stdout == GO_USAGE
                && answer.stderr.starts_with(GO_FLAG_USAGE_PREFIX)
        }
        Implementation::Rust => {
            answer.status == Some(RUST_REFUSAL_EXIT_CODE)
                && answer.stdout.is_empty()
                && answer.stderr == RUST_REFUSAL
        }
    };
    if matches {
        return Ok(());
    }
    Err(IdentityError::Help {
        image: image.to_owned(),
        expected,
        answer: answer.clone(),
    })
}

/// Judges `docker image inspect --format '{{json .Config.Labels}}'` output: the revision label
/// must be `commit`.
///
/// # Errors
///
/// The output is not a JSON object of strings (or `null`), the label is missing, or it names
/// another commit.
pub fn check_revision(image: &str, labels_json: &str, commit: &str) -> Result<(), IdentityError> {
    let labels: Option<BTreeMap<String, String>> = serde_json::from_str(labels_json.trim())
        .map_err(|error| {
            IdentityError::Unreadable(format!("read the labels of image {image}: {error}"))
        })?;
    match labels.unwrap_or_default().remove(REVISION_LABEL) {
        None => Err(IdentityError::RevisionMissing {
            image: image.to_owned(),
        }),
        Some(found) if found == commit => Ok(()),
        Some(found) => Err(IdentityError::RevisionMismatch {
            image: image.to_owned(),
            expected: commit.to_owned(),
            found,
        }),
    }
}

/// The lowercase hex sha256 of `bytes`.
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        })
}

/// Judges the copied binary against the `docker save` archive of `image`, and returns its
/// sha256.
///
/// # Errors
///
/// The archive cannot be read, holds no `bitgauge`, or holds other bytes than the copy.
pub fn check_binary(image: &str, copied: &[u8], archive: &[u8]) -> Result<String, IdentityError> {
    let layer = layers::binary_in_archive(archive, BINARY_NAME)
        .map_err(|error| {
            IdentityError::Unreadable(format!("read the docker save archive of {image}: {error}"))
        })?
        .ok_or_else(|| IdentityError::NoLayerBinary {
            image: image.to_owned(),
        })?;
    let copied = sha256_hex(copied);
    let layer = sha256_hex(&layer);
    if copied != layer {
        return Err(IdentityError::ChecksumMismatch {
            image: image.to_owned(),
            copied,
            layer,
        });
    }
    Ok(copied)
}

/// Checks `expectation.image` through `env`'s runner, in order: the help flag, the revision
/// label, then the binary, which is copied to `dest_dir/bitgauge` and stays there for the
/// caller.
///
/// # Errors
///
/// The first mismatch, or a docker command or file operation that failed.
pub fn check(
    env: &Env,
    expectation: &Expectation,
    dest_dir: &Path,
) -> Result<Identity, IdentityError> {
    let image = expectation.image.as_str();
    // --pull never: the image under test is the local one; a missing image must fail, not be
    // fetched from a registry.
    let answer = env
        .output(
            &[
                "run",
                "--rm",
                "--pull",
                "never",
                "--entrypoint",
                BINARY_PATH,
                image,
                IDENTITY_FLAG,
            ],
            None,
        )
        .map_err(IdentityError::Docker)?;
    check_help(expectation.implementation, image, &answer)?;

    let labels = env
        .docker(&[
            "image",
            "inspect",
            "--format",
            "{{json .Config.Labels}}",
            image,
        ])
        .map_err(IdentityError::Docker)?;
    check_revision(image, &labels, &expectation.commit)?;

    let binary = dest_dir.join(BINARY_NAME);
    copy_binary(env, image, &binary)?;
    let copied = fs::read(&binary).map_err(|source| IdentityError::Io {
        context: format!("read {}", binary.display()),
        source,
    })?;
    let saved = tempfile::tempdir().map_err(|source| IdentityError::Io {
        context: "create a directory for docker save".to_owned(),
        source,
    })?;
    let archive_path = saved.path().join("image.tar");
    let archive_arg = archive_path.to_string_lossy();
    env.docker(&["image", "save", "--output", &archive_arg, image])
        .map_err(IdentityError::Docker)?;
    let archive = fs::read(&archive_path).map_err(|source| IdentityError::Io {
        context: format!("read {}", archive_path.display()),
        source,
    })?;
    let sha256 = check_binary(image, &copied, &archive)?;
    Ok(Identity {
        implementation: expectation.implementation,
        image: image.to_owned(),
        commit: expectation.commit.clone(),
        binary,
        sha256,
    })
}

/// [`check`] with the expectation from the environment.
///
/// # Errors
///
/// As [`Expectation::from_env`] and [`check`].
pub fn check_from_env(env: &Env, dest_dir: &Path) -> Result<Identity, IdentityError> {
    check(env, &Expectation::from_env()?, dest_dir)
}

/// Copies [`BINARY_PATH`] out of a created, never started, container of `image`, and removes the
/// container whatever the copy did.
fn copy_binary(env: &Env, image: &str, binary: &Path) -> Result<(), IdentityError> {
    let container = env.name("identity");
    env.docker(&["create", "--pull", "never", "--name", &container, image])
        .map_err(IdentityError::Docker)?;
    let source = format!("{container}:{BINARY_PATH}");
    let target = binary.to_string_lossy();
    let copied = env.docker(&["cp", &source, &target]);
    let removed = env.docker(&["rm", "--force", &container]);
    copied.map_err(IdentityError::Docker)?;
    removed.map_err(IdentityError::Docker)?;
    Ok(())
}

#[cfg(test)]
mod tests;
