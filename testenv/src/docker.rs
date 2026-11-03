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

//! The docker CLI behind a [`Runner`], so every rule above it is unit-tested with a fake (Go's
//! `testenv.Runner` and `DockerCLI`). Commands block; a timeout, when given, kills the command.

use std::fmt;
use std::io::{self, Read};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::logger::{Logger, Value, redact_args};

/// How often a command with a timeout is polled.
const POLL: Duration = Duration::from_millis(20);

/// What one command printed, and how it ended.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Output {
    /// The exit code; `None` when a signal ended the command.
    pub status: Option<i32>,
    /// Standard output, lossily decoded.
    pub stdout: String,
    /// Standard error, lossily decoded.
    pub stderr: String,
}

impl Output {
    /// A command that exited 0 and printed `stdout`.
    #[must_use]
    pub fn ok(stdout: impl Into<String>) -> Self {
        Self {
            status: Some(0),
            stdout: stdout.into(),
            stderr: String::new(),
        }
    }

    /// Whether the command exited 0.
    #[must_use]
    pub fn success(&self) -> bool {
        self.status == Some(0)
    }
}

/// A docker command that could not run, failed or timed out. The arguments are redacted.
#[derive(Debug)]
pub enum DockerError {
    /// The binary could not be started or waited for.
    Spawn {
        /// The redacted arguments.
        args: Vec<String>,
        /// Why.
        source: io::Error,
    },
    /// The command exited with a status other than 0, or was killed by a signal.
    Failed {
        /// The redacted arguments.
        args: Vec<String>,
        /// The exit code, `None` for a signal.
        status: Option<i32>,
        /// Its standard error, trimmed.
        stderr: String,
    },
    /// The command outlived its timeout and was killed.
    Timeout {
        /// The redacted arguments.
        args: Vec<String>,
        /// The timeout.
        after: Duration,
    },
}

impl fmt::Display for DockerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Spawn { args, source } => {
                write!(
                    formatter,
                    "docker command failed: docker {}: {source}",
                    args.join(" ")
                )
            }
            Self::Failed {
                args,
                status,
                stderr,
            } => {
                let status = status.map_or_else(
                    || "killed by a signal".to_owned(),
                    |code| format!("exit status {code}"),
                );
                write!(
                    formatter,
                    "docker command failed: docker {}: {status}: {stderr}",
                    args.join(" ")
                )
            }
            Self::Timeout { args, after } => write!(
                formatter,
                "docker command failed: docker {}: timed out after {after:?}",
                args.join(" ")
            ),
        }
    }
}

impl std::error::Error for DockerError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Spawn { source, .. } => Some(source),
            Self::Failed { .. } | Self::Timeout { .. } => None,
        }
    }
}

/// Runs one docker CLI command. Implementations must be shareable across threads, so a test may
/// drive several containers at once.
pub trait Runner: Send + Sync {
    /// Runs `docker <args>` and returns what it printed and how it ended, whatever the exit
    /// status. `timeout`, when set, kills a command that runs longer.
    ///
    /// # Errors
    ///
    /// [`DockerError::Spawn`] when docker cannot be started, [`DockerError::Timeout`] when it
    /// outlives `timeout`; never [`DockerError::Failed`].
    fn output(&self, args: &[&str], timeout: Option<Duration>) -> Result<Output, DockerError>;

    /// Runs `docker <args>` and returns its standard output.
    ///
    /// # Errors
    ///
    /// Any [`DockerError`], [`DockerError::Failed`] for a status other than 0.
    fn run(&self, args: &[&str]) -> Result<String, DockerError> {
        self.run_timeout(args, None)
    }

    /// [`Runner::run`] with a timeout.
    ///
    /// # Errors
    ///
    /// Any [`DockerError`], [`DockerError::Failed`] for a status other than 0.
    fn run_timeout(&self, args: &[&str], timeout: Option<Duration>) -> Result<String, DockerError> {
        let output = self.output(args, timeout)?;
        if output.success() {
            Ok(output.stdout)
        } else {
            Err(DockerError::Failed {
                args: redact_args(args),
                status: output.status,
                stderr: output.stderr.trim().to_owned(),
            })
        }
    }
}

/// The docker binary found on `PATH`. Each command's arguments are logged redacted at debug
/// level; its output is never logged.
#[derive(Debug, Clone)]
pub struct DockerCli {
    /// Where the commands are logged.
    pub logger: Logger,
    /// The program run, `docker` unless a test points it elsewhere.
    pub program: PathBuf,
}

impl DockerCli {
    /// The docker CLI on `PATH`, logging to `logger`.
    #[must_use]
    pub fn new(logger: Logger) -> Self {
        Self {
            logger,
            program: PathBuf::from("docker"),
        }
    }
}

impl Default for DockerCli {
    fn default() -> Self {
        Self::new(Logger::stderr())
    }
}

impl Runner for DockerCli {
    fn output(&self, args: &[&str], timeout: Option<Duration>) -> Result<Output, DockerError> {
        self.logger.debug("docker", &[("args", Value::from(args))]);
        let spawn_error = |source| DockerError::Spawn {
            args: redact_args(args),
            source,
        };
        let mut child = Command::new(&self.program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(spawn_error)?;
        // Both pipes are drained on threads of their own, so a chatty command never blocks on a
        // full pipe while it is waited for.
        let stdout = drain(child.stdout.take());
        let stderr = drain(child.stderr.take());
        let status = match wait(&mut child, timeout) {
            Ok(Some(status)) => status,
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(DockerError::Timeout {
                    args: redact_args(args),
                    after: timeout.unwrap_or_default(),
                });
            }
            Err(error) => return Err(spawn_error(error)),
        };
        Ok(Output {
            status: status.code(),
            stdout: collect(stdout),
            stderr: collect(stderr),
        })
    }
}

/// Waits for `child`; `None` when it is still running at the timeout.
fn wait(child: &mut Child, timeout: Option<Duration>) -> io::Result<Option<ExitStatus>> {
    let Some(timeout) = timeout else {
        return child.wait().map(Some);
    };
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(status));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        thread::sleep(POLL);
    }
}

fn drain(pipe: Option<impl Read + Send + 'static>) -> Option<JoinHandle<Vec<u8>>> {
    pipe.map(|mut pipe| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    })
}

fn collect(reader: Option<JoinHandle<Vec<u8>>>) -> String {
    reader
        .and_then(|reader| reader.join().ok())
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
pub(crate) mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::Duration;

    use super::{DockerCli, DockerError, Output, Runner};
    use crate::logger::Logger;

    /// Answers docker commands from a table and records every command it was given, so the rules
    /// are tested without a daemon. An unknown command exits 0 with no output.
    #[derive(Default)]
    pub(crate) struct FakeDocker {
        pub(crate) answers: HashMap<String, Output>,
        pub(crate) commands: Mutex<Vec<String>>,
    }

    impl FakeDocker {
        /// A fake that prints `stdout` for each listed command.
        pub(crate) fn answering(answers: &[(&str, &str)]) -> Self {
            Self {
                answers: answers
                    .iter()
                    .map(|(command, stdout)| ((*command).to_owned(), Output::ok(*stdout)))
                    .collect(),
                commands: Mutex::default(),
            }
        }

        /// The commands that start with `prefix`, in order.
        pub(crate) fn ran(&self, prefix: &str) -> Vec<String> {
            self.commands
                .lock()
                .unwrap()
                .iter()
                .filter(|command| command.starts_with(prefix))
                .cloned()
                .collect()
        }
    }

    impl Runner for FakeDocker {
        fn output(&self, args: &[&str], _: Option<Duration>) -> Result<Output, DockerError> {
            let command = args.join(" ");
            self.commands.lock().unwrap().push(command.clone());
            Ok(self
                .answers
                .get(&command)
                .cloned()
                .unwrap_or_else(|| Output::ok("")))
        }
    }

    fn shell() -> DockerCli {
        DockerCli {
            logger: Logger::discard(),
            program: PathBuf::from("sh"),
        }
    }

    /// The CLI runner collects both streams and the status, and `run` turns a failure into an
    /// error that carries the redacted arguments and the standard error.
    #[test]
    fn cli_collects_the_output_and_the_status() {
        let output = shell()
            .output(&["-c", "echo out; echo err >&2; exit 3"], None)
            .unwrap();
        assert_eq!(
            output,
            Output {
                status: Some(3),
                stdout: "out\n".to_owned(),
                stderr: "err\n".to_owned(),
            }
        );
        let error = shell()
            .run(&["-c", "echo err >&2; exit 3", "-e", "TOKEN=secret"])
            .unwrap_err();
        let text = error.to_string();
        assert!(
            text.contains("exit status 3: err") && text.contains("TOKEN=[redacted]"),
            "{text}"
        );
        assert!(!text.contains("secret"), "{text}");
        assert_eq!(shell().run(&["-c", "echo ok"]).unwrap(), "ok\n");
    }

    /// A command that outlives its timeout is killed and reported.
    #[test]
    fn cli_kills_a_command_at_its_timeout() {
        let error = shell()
            .output(&["-c", "sleep 5"], Some(Duration::from_millis(100)))
            .unwrap_err();
        assert!(matches!(error, DockerError::Timeout { .. }), "{error}");
        let spawn = DockerCli {
            logger: Logger::discard(),
            program: PathBuf::from("/nonexistent/docker"),
        }
        .run(&["ps"])
        .unwrap_err();
        assert!(matches!(spawn, DockerError::Spawn { .. }), "{spawn}");
    }
}
