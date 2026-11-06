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

//! The logger of decisions.md section 6: tracing's text or JSON format at the configured level
//! (configuration.md section 2.5), with UTC timestamps, writing to stdout. What may and may never
//! be logged is configuration-security.md section 6; this module parses the log settings and
//! builds the logger with rust-common's `tracing-setup`, the target and the JSON span fields
//! hidden. The rendering is tracing's, not slog's (rust-port.md, row 1): the messages, the fields
//! and the levels are kept.

use std::str::FromStr;

use tracing::{Dispatch, Level};
use tracing_setup::Options;
use tracing_subscriber::fmt::MakeWriter;

/// The `log.format` values.
pub const FORMATS: [&str; 2] = [FORMAT_TEXT, FORMAT_JSON];
/// The `log.level` values, lowest first.
pub const LEVELS: [&str; 4] = ["debug", "info", "warn", "error"];

const FORMAT_TEXT: &str = "text";
const FORMAT_JSON: &str = "json";

/// A `log.format` or `log.level` the logger does not have. Configuration is validated
/// fail-closed (configuration-security.md section 2), so neither is ever a silent default.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum LogError {
    /// A `log.format` other than `text` or `json`.
    #[error("unknown log format: {0:?} (want \"text\" or \"json\")")]
    UnknownFormat(String),
    /// A `log.level` other than `debug`, `info`, `warn` or `error`.
    #[error("unknown log level: {0:?} (want \"debug\", \"info\", \"warn\" or \"error\")")]
    UnknownLevel(String),
}

/// The `log.format` values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// tracing's text lines.
    Text,
    /// One JSON object per line, the fields at the top level.
    Json,
}

impl FromStr for Format {
    type Err = LogError;

    /// Only the two documented lower-case values.
    fn from_str(text: &str) -> Result<Self, LogError> {
        match text {
            FORMAT_TEXT => Ok(Self::Text),
            FORMAT_JSON => Ok(Self::Json),
            _ => Err(LogError::UnknownFormat(text.to_owned())),
        }
    }
}

/// The minimum level a `log.level` value names; only the four documented lower-case values.
///
/// # Errors
///
/// [`LogError::UnknownLevel`] for any other value.
pub fn parse_level(text: &str) -> Result<Level, LogError> {
    match text {
        "debug" => Ok(Level::DEBUG),
        "info" => Ok(Level::INFO),
        "warn" => Ok(Level::WARN),
        "error" => Ok(Level::ERROR),
        _ => Err(LogError::UnknownLevel(text.to_owned())),
    }
}

/// A logger writing to stdout with the format and the minimum level named by the
/// configuration.
///
/// # Errors
///
/// As [`to_writer`].
pub fn stdout(format: &str, level: &str) -> Result<Dispatch, LogError> {
    to_writer(std::io::stdout, format, level)
}

/// [`stdout`] writing to `writer` instead. The level is checked before the format.
///
/// # Errors
///
/// [`LogError::UnknownLevel`] or [`LogError::UnknownFormat`].
pub fn to_writer<W>(writer: W, format: &str, level: &str) -> Result<Dispatch, LogError>
where
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    let level = parse_level(level)?;
    let format = Format::from_str(format)?;
    Ok(build(writer, format, level))
}

/// The text logger at info on stderr, for when the configuration cannot provide one: its log
/// settings are invalid, or it could not be loaded at all.
#[must_use]
pub fn stderr_text() -> Dispatch {
    text_to(std::io::stderr)
}

/// [`stderr_text`] writing to `writer` instead.
#[must_use]
pub fn text_to<W>(writer: W) -> Dispatch
where
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    build(writer, Format::Text, Level::INFO)
}

/// rust-common's subscriber, without the target and the JSON span fields.
fn build<W>(writer: W, format: Format, level: Level) -> Dispatch
where
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    let format = match format {
        Format::Text => tracing_setup::Format::Text,
        Format::Json => tracing_setup::Format::Json,
    };
    tracing_setup::build(
        writer,
        format,
        level,
        Options::new().target(false).span_fields(false),
    )
}

#[cfg(test)]
mod tests;
