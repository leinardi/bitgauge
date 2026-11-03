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

//! The command line (backend.md sections 1 and 6, `docs/rust-port.md` row 2):
//! `bitgauge [serve|healthcheck] [--config <PATH>]`, read by clap behind a pre-scan.
//!
//! The pre-scan walks the arguments left to right before clap sees them. `--config` without `=`
//! takes the next argument as its value, whatever it starts with, and that value is not scanned;
//! `--config=<PATH>` is one argument; `--` ends the options, and clap refuses the positionals
//! after it as it refuses any. Any other single-dash argument longer than two characters
//! (`-config`, `-help`, `-hx`) is refused, naming its `--` spelling: Go's `flag` read those as
//! long options, and a refusal is clearer than clap reading `-config` as `-c -o ...`.

use std::ffi::OsString;
use std::path::PathBuf;

use clap::{Args, CommandFactory as _, Parser, Subcommand};

use crate::config::DEFAULT_PATH;

/// What the binary runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    /// The speed test server, the default.
    Serve,
    /// Asks the running server whether it answers.
    Healthcheck,
}

/// A command line that can run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Options {
    /// The command.
    pub command: Command,
    /// The configuration file: `--config`, else [`DEFAULT_PATH`].
    pub config: PathBuf,
    /// Whether `--config` was given, in which case the file must exist.
    pub explicit: bool,
}

/// A parsed command line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parsed {
    /// Run with these options.
    Run(Options),
    /// `-h` or `--help`: print this on stdout and exit 0.
    Help(String),
}

/// A command line that cannot run; the binary prints it on stderr and exits 2.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CliError {
    /// A single-dash long option, which only Go's `flag` read.
    #[error("bitgauge: {argument} is not an option; write it as -{argument}\n{usage}")]
    SingleDash {
        /// The argument as given.
        argument: String,
        /// The usage line.
        usage: String,
    },
    /// What clap refused, as clap renders it, its usage line included.
    #[error("{0}")]
    Refused(String),
}

/// BitGauge, a self-hosted network speed test.
#[derive(Debug, Parser)]
#[command(
    name = "bitgauge",
    args_conflicts_with_subcommands = true,
    disable_version_flag = true,
    disable_help_subcommand = true
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Sub>,
    #[command(flatten)]
    config: ConfigArg,
}

#[derive(Debug, Subcommand)]
enum Sub {
    /// Serve the speed test (the default).
    Serve(ConfigArg),
    /// Ask the running server for GET /api/v1/ping; exit 0 on 204, 1 otherwise.
    Healthcheck(ConfigArg),
}

#[derive(Debug, Args)]
struct ConfigArg {
    /// The YAML configuration file; without it the default path is read if it exists.
    #[arg(long, value_name = "PATH", allow_hyphen_values = true)]
    config: Option<PathBuf>,
}

/// Parses the arguments after the program name.
///
/// # Errors
///
/// [`CliError`] for a single-dash long option, and for anything clap refuses: an unknown
/// option or subcommand, a positional, `--config` without a value.
pub fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Parsed, CliError> {
    let args: Vec<OsString> = args.into_iter().collect();
    prescan(&args)?;
    let cli = match Cli::try_parse_from(std::iter::once(OsString::from("bitgauge")).chain(args)) {
        Ok(cli) => cli,
        Err(error) if !error.use_stderr() => return Ok(Parsed::Help(error.render().to_string())),
        Err(error) => return Err(CliError::Refused(error.render().to_string())),
    };
    let (command, config) = match cli.command {
        None => (Command::Serve, cli.config),
        Some(Sub::Serve(config)) => (Command::Serve, config),
        Some(Sub::Healthcheck(config)) => (Command::Healthcheck, config),
    };
    Ok(Parsed::Run(Options {
        command,
        explicit: config.config.is_some(),
        config: config.config.unwrap_or_else(|| PathBuf::from(DEFAULT_PATH)),
    }))
}

/// Refuses a single-dash long option before clap reads the arguments.
fn prescan(args: &[OsString]) -> Result<(), CliError> {
    let mut arguments = args.iter();
    while let Some(argument) = arguments.next() {
        let text = argument.to_string_lossy();
        if text == "--config" {
            // Its value is the next argument, whatever it starts with.
            arguments.next();
        } else if text == "--" {
            break;
        } else if text.starts_with('-') && !text.starts_with("--") && text.chars().count() > 2 {
            return Err(CliError::SingleDash {
                argument: text.into_owned(),
                usage: Cli::command().render_usage().to_string(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::PathBuf;

    use super::{CliError, Command, Options, Parsed, parse};
    use crate::config::DEFAULT_PATH;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    fn run(command: Command, config: Option<&str>) -> Parsed {
        Parsed::Run(Options {
            command,
            config: PathBuf::from(config.unwrap_or(DEFAULT_PATH)),
            explicit: config.is_some(),
        })
    }

    /// Go: `TestParseArgs`, with the Rust spellings (`docs/rust-port.md` row 2): `--config`
    /// only, its value free to start with `-`.
    #[test]
    fn parse_accepts_the_command_lines_that_run() {
        for (line, want) in [
            (&[][..], run(Command::Serve, None)),
            (&["serve"][..], run(Command::Serve, None)),
            (&["healthcheck"][..], run(Command::Healthcheck, None)),
            (
                &["--config", "/x.yaml"][..],
                run(Command::Serve, Some("/x.yaml")),
            ),
            (
                &["--config=/x.yaml"][..],
                run(Command::Serve, Some("/x.yaml")),
            ),
            (&["--config", "x"][..], run(Command::Serve, Some("x"))),
            (&["--config=x"][..], run(Command::Serve, Some("x"))),
            (
                &["--config", "-local.yaml"][..],
                run(Command::Serve, Some("-local.yaml")),
            ),
            (
                &["--config=-local.yaml"][..],
                run(Command::Serve, Some("-local.yaml")),
            ),
            (
                &["--config", "-config"][..],
                run(Command::Serve, Some("-config")),
            ),
            (
                &["serve", "--config", "/x.yaml"][..],
                run(Command::Serve, Some("/x.yaml")),
            ),
            (
                &["healthcheck", "--config", "/x.yaml"][..],
                run(Command::Healthcheck, Some("/x.yaml")),
            ),
            (
                &["healthcheck", "--config", "-x.yaml"][..],
                run(Command::Healthcheck, Some("-x.yaml")),
            ),
            // An explicit default path is still explicit: then it must exist.
            (
                &["--config", DEFAULT_PATH][..],
                run(Command::Serve, Some(DEFAULT_PATH)),
            ),
        ] {
            assert_eq!(parse(args(line)), Ok(want), "{line:?}");
        }
    }

    /// `-h` and `--help`, on the command and on a subcommand, ask for the help.
    #[test]
    fn help_is_asked_with_h_and_help() {
        for line in [
            &["--help"][..],
            &["-h"],
            &["healthcheck", "-h"],
            &["serve", "--help"],
        ] {
            let Ok(Parsed::Help(text)) = parse(args(line)) else {
                panic!("{line:?} is not a help request");
            };
            assert!(text.contains("--config <PATH>"), "{line:?}: {text}");
        }
    }

    /// Go: `TestParseArgs`, its failures: an unknown subcommand or option, an extra positional,
    /// `--config` without a value, an option before the subcommand, and a positional after `--`.
    #[test]
    fn parse_refuses_what_cannot_run() {
        for line in [
            &["version"][..],
            &["serve", "extra"],
            &["--config"],
            &["serve", "--config"],
            &["--verbose"],
            &["--config", "/x.yaml", "healthcheck"],
            &["-c", "x"],
            &["--", "serve"],
            &["-"],
        ] {
            let Err(CliError::Refused(text)) = parse(args(line)) else {
                panic!("{line:?} was not refused by clap");
            };
            assert!(text.starts_with("error: "), "{line:?}: {text}");
        }
    }

    /// A single-dash long option is refused, naming its `--` spelling; Go's `flag` read it.
    #[test]
    fn single_dash_long_options_are_refused() {
        for (line, argument) in [
            (&["-config", "x"][..], "-config"),
            (&["-config=x"][..], "-config=x"),
            (&["-help"][..], "-help"),
            (&["-hx"][..], "-hx"),
            (&["healthcheck", "-config", "x"][..], "-config"),
        ] {
            let Err(error) = parse(args(line)) else {
                panic!("{line:?} was accepted");
            };
            let text = error.to_string();
            assert!(
                text.starts_with(&format!(
                    "bitgauge: {argument} is not an option; write it as -{argument}\n"
                )),
                "{line:?}: {text}"
            );
            assert!(text.contains("Usage: bitgauge"), "{line:?}: {text}");
        }
    }
}
