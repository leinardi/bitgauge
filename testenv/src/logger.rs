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

//! The suites' log: one `key=value` line per record on stderr, with every secret replaced before
//! it is written (Go's `testenv.NewLogger`, a redacting `slog` text handler).
//!
//! A [`Secret`] prints as a placeholder however it is formatted; a field keyed `secret` is
//! replaced whatever its value; and docker arguments logged as [`Value::Args`] keep the key of
//! every `-e`/`--env`, `--build-arg` and `--secret` value but not the value.

use std::fmt;
use std::io::{self, Write};
use std::sync::{Arc, Mutex, PoisonError};

const REDACTED: &str = "[redacted]";

/// A sensitive string, such as a registry token. It prints as `[redacted]` through both
/// `Display` and `Debug`, so a secret formatted by mistake does not leak.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    /// Wraps `value`.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The secret itself, for the one place that needs it.
    #[must_use]
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(REDACTED)
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(REDACTED)
    }
}

/// The value of one log field.
#[derive(Debug, Clone)]
pub enum Value {
    /// Plain text, logged as is unless its key is `secret`.
    Text(String),
    /// A secret, always logged as the placeholder.
    Secret(Secret),
    /// docker arguments, logged through [`redact_args`].
    Args(Vec<String>),
}

impl From<&str> for Value {
    fn from(value: &str) -> Self {
        Self::Text(value.to_owned())
    }
}

impl From<String> for Value {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<Secret> for Value {
    fn from(value: Secret) -> Self {
        Self::Secret(value)
    }
}

impl From<Vec<String>> for Value {
    fn from(value: Vec<String>) -> Self {
        Self::Args(value)
    }
}

impl From<&[&str]> for Value {
    fn from(value: &[&str]) -> Self {
        Self::Args(value.iter().map(|arg| (*arg).to_owned()).collect())
    }
}

/// The severity of a record.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    /// The docker commands.
    Debug,
    /// Progress.
    Info,
    /// Something a reader should act on, such as a kept environment.
    Warn,
}

impl Level {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "DEBUG",
            Self::Info => "INFO",
            Self::Warn => "WARN",
        }
    }
}

type Sink = Arc<Mutex<Box<dyn Write + Send>>>;

/// A redacting logger. Clones share the output; [`Logger::with`] adds fields to every record of
/// the returned logger.
#[derive(Clone)]
pub struct Logger {
    out: Sink,
    /// Fields already redacted and rendered as `key=value`.
    fields: Vec<String>,
}

impl fmt::Debug for Logger {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Logger")
            .field("fields", &self.fields)
            .finish_non_exhaustive()
    }
}

impl Logger {
    /// A logger writing to `out`.
    #[must_use]
    pub fn new(out: impl Write + Send + 'static) -> Self {
        Self {
            out: Arc::new(Mutex::new(Box::new(out))),
            fields: Vec::new(),
        }
    }

    /// A logger on stderr, the default of every environment.
    #[must_use]
    pub fn stderr() -> Self {
        Self::new(io::stderr())
    }

    /// A logger that writes nothing.
    #[must_use]
    pub fn discard() -> Self {
        Self::new(io::sink())
    }

    /// This logger with `key=value` on every record.
    #[must_use]
    pub fn with(&self, key: &str, value: impl Into<Value>) -> Self {
        let mut fields = self.fields.clone();
        fields.push(render(key, &value.into()));
        Self {
            out: Arc::clone(&self.out),
            fields,
        }
    }

    /// Writes one record. A write error is dropped: the log is not worth failing a test over.
    pub fn log(&self, level: Level, message: &str, fields: &[(&str, Value)]) {
        let mut line = format!(
            "time={} level={} msg={}",
            jiff::Timestamp::now(),
            level.as_str(),
            quote(message)
        );
        for field in self
            .fields
            .iter()
            .cloned()
            .chain(fields.iter().map(|(key, value)| render(key, value)))
        {
            line.push(' ');
            line.push_str(&field);
        }
        line.push('\n');
        let mut out = self.out.lock().unwrap_or_else(PoisonError::into_inner);
        let _ = out.write_all(line.as_bytes());
        let _ = out.flush();
    }

    /// A [`Level::Debug`] record.
    pub fn debug(&self, message: &str, fields: &[(&str, Value)]) {
        self.log(Level::Debug, message, fields);
    }

    /// A [`Level::Info`] record.
    pub fn info(&self, message: &str, fields: &[(&str, Value)]) {
        self.log(Level::Info, message, fields);
    }

    /// A [`Level::Warn`] record.
    pub fn warn(&self, message: &str, fields: &[(&str, Value)]) {
        self.log(Level::Warn, message, fields);
    }
}

/// One field as `key=value`, redacted.
fn render(key: &str, value: &Value) -> String {
    let text = if key == "secret" {
        REDACTED.to_owned()
    } else {
        match value {
            Value::Text(text) => text.clone(),
            Value::Secret(_) => REDACTED.to_owned(),
            Value::Args(args) => format!("[{}]", redact_args(args).join(" ")),
        }
    };
    format!("{key}={}", quote(&text))
}

/// The value as slog's text handler writes it: bare when it needs no quoting.
fn quote(text: &str) -> String {
    let bare = !text.is_empty()
        && text
            .chars()
            .all(|char| char.is_ascii_graphic() && char != '"' && char != '=' && char != '\\');
    if bare {
        text.to_owned()
    } else {
        format!("{text:?}")
    }
}

/// docker arguments safe to log: the value of every `-e`/`--env` `KEY=VALUE`, and of every
/// `--build-arg` and `--secret`, is replaced, keeping the key so the log still says what was set.
#[must_use]
pub fn redact_args<S: AsRef<str>>(args: &[S]) -> Vec<String> {
    let mut cleaned = Vec::with_capacity(args.len());
    let mut redact_next = false;
    for arg in args {
        let arg = arg.as_ref();
        if redact_next {
            cleaned.push(redact_value(arg));
            redact_next = false;
        } else if matches!(arg, "-e" | "--env" | "--build-arg" | "--secret") {
            cleaned.push(arg.to_owned());
            redact_next = true;
        } else if ["--env=", "--build-arg=", "--secret="]
            .iter()
            .any(|prefix| arg.starts_with(prefix))
        {
            let (flag, value) = arg.split_once('=').unwrap_or((arg, ""));
            cleaned.push(format!("{flag}={}", redact_value(value)));
        } else {
            cleaned.push(arg.to_owned());
        }
    }
    cleaned
}

fn redact_value(value: &str) -> String {
    match value.split_once('=') {
        Some((key, _)) => format!("{key}={REDACTED}"),
        None => REDACTED.to_owned(),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::{self, Write};
    use std::sync::{Arc, Mutex};

    use super::{Logger, Secret, Value};

    /// A cloneable in-memory sink.
    #[derive(Clone, Default)]
    pub(crate) struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Buffer {
        pub(crate) fn text(&self) -> String {
            String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
        }
    }

    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    /// Go: `TestLoggerRedacts`: a secret never reaches the log, however it is handed over.
    #[test]
    fn logger_redacts() {
        let buffer = Buffer::default();
        let logger = Logger::new(buffer.clone()).with("token", Secret::new("with-attrs"));
        logger.info(
            "run",
            &[
                ("secret", Value::from("plain-secret")),
                ("password", Value::from(Secret::new("typed-secret"))),
                (
                    "args",
                    Value::from(
                        &[
                            "run",
                            "-e",
                            "TOKEN=env-secret",
                            "--env=KEY=env-eq-secret",
                            "--build-arg",
                            "ARG=build-secret",
                            "image",
                        ][..],
                    ),
                ),
            ],
        );
        let written = buffer.text();
        let mut problems = Vec::new();
        for secret in [
            "with-attrs",
            "plain-secret",
            "typed-secret",
            "env-secret",
            "env-eq-secret",
            "build-secret",
        ] {
            if written.contains(secret) {
                problems.push(format!("{secret:?} reached the log"));
            }
        }
        for kept in [
            "TOKEN=[redacted]",
            "KEY=[redacted]",
            "ARG=[redacted]",
            "image",
        ] {
            if !written.contains(kept) {
                problems.push(format!(
                    "{kept:?} is missing, the log should say what was set"
                ));
            }
        }
        let printed = format!(
            "{} {:?} {:#?}",
            Secret::new("x"),
            Secret::new("x"),
            Secret::new("x")
        );
        if printed.contains('x') {
            problems.push(format!("fmt printed a Secret: {printed}"));
        }
        assert!(problems.is_empty(), "{problems:#?}\n{written}");
    }
}
