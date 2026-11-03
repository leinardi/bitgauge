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

//! The strace `-f -yy` grammar: one call per line, a pid prefix, calls split by another
//! process's call into unfinished and resumed halves, and arguments with quoted strings, nested
//! brackets and `-yy` descriptor annotations.

use std::collections::HashMap;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read};
use std::sync::LazyLock;

use regex::Regex;

/// Bounds one line; strace abbreviates buffers, so a real line is far shorter. Go's scanner
/// refuses a longer one.
const MAX_LINE_LENGTH: usize = 16 << 20;

/// The name strace gives a call it could not identify.
pub const UNKNOWN_CALL: &str = "???";

const UNFINISHED: &str = " <unfinished ...>";

// Go's RE2 \s is ASCII whitespace; Rust's is Unicode, so it is spelled out.
static PID_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:\[pid[\t\n\f\r ]+([0-9]+)\]|([0-9]+))[\t\n\f\r ]+")
        .unwrap_or_else(|error| unreachable!("the pid prefix pattern compiles: {error}"))
});
static CALL_START: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([a-z_][a-z0-9_]*|\?{3})\(")
        .unwrap_or_else(|error| unreachable!("the call pattern compiles: {error}"))
});
static RESUMED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^<\.{3} ([a-z_][a-z0-9_]*|\?{3}) resumed>[\t\n\f\r ]?")
        .unwrap_or_else(|error| unreachable!("the resumed pattern compiles: {error}"))
});

/// One completed system call.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Event {
    /// The 1-based line of the trace where the call started.
    pub line: usize,
    /// The thread that made it; 0 when the line had no pid prefix.
    pub pid: u32,
    /// The call's name.
    pub name: String,
    /// The call's top-level arguments, exactly as strace printed them.
    pub args: Vec<String>,
    /// Everything after `= `, such as `0`, `-1 ENOENT (No such file or directory)` or
    /// `5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>`.
    pub result: String,
}

impl fmt::Display for Event {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "line {}, pid {}: {}({}) = {}",
            self.line,
            self.pid,
            self.name,
            self.args.join(", "),
            self.result
        )
    }
}

/// A trace this cannot read, which it therefore cannot vouch for.
#[derive(Debug)]
pub enum ParseError {
    /// A line that is not a call, a signal or an exit.
    Unparsable {
        /// The 1-based line.
        line: usize,
        /// What is wrong with it.
        detail: String,
    },
    /// The trace could not be read, or holds a line over the bound.
    Read(io::Error),
}

impl fmt::Display for ParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unparsable { line, detail } => {
                write!(formatter, "unparsable strace line {line}: {detail}")
            }
            Self::Read(error) => write!(formatter, "read the trace: {error}"),
        }
    }
}

impl std::error::Error for ParseError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Read(error) => Some(error),
            Self::Unparsable { .. } => None,
        }
    }
}

struct Pending {
    line: usize,
    name: String,
    head: String,
}

/// Reads the next line as Go's `bufio.Scanner` does: without its `\n` and one `\r` before it,
/// lossily decoded, refused over [`MAX_LINE_LENGTH`].
fn next_line(reader: &mut impl BufRead, buffer: &mut Vec<u8>) -> io::Result<Option<String>> {
    buffer.clear();
    let limit = u64::try_from(MAX_LINE_LENGTH).unwrap_or(u64::MAX) + 1;
    let read = reader.take(limit).read_until(b'\n', buffer)?;
    if read == 0 {
        return Ok(None);
    }
    if buffer.last() == Some(&b'\n') {
        buffer.pop();
    } else if buffer.len() > MAX_LINE_LENGTH {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "bufio.Scanner: token too long",
        ));
    }
    if buffer.last() == Some(&b'\r') {
        buffer.pop();
    }
    Ok(Some(String::from_utf8_lossy(buffer).into_owned()))
}

/// Reads a trace written by `strace -f -yy` (to a file with `-o`, or to stderr) into the calls
/// it records, in the order they completed. Signal and exit lines are skipped; a call split by
/// another process's call is joined from its unfinished and resumed halves. A call still
/// unfinished at the end was interrupted by the process exiting: it was attempted, so it is
/// returned, with the result `?`, after the others in the order they started.
///
/// # Errors
///
/// A line this cannot read is an error, never a skip.
pub fn parse(reader: impl Read) -> Result<Vec<Event>, ParseError> {
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();
    let mut events = Vec::new();
    let mut open: HashMap<u32, Pending> = HashMap::new();
    let mut number = 0;
    while let Some(line) = next_line(&mut reader, &mut buffer).map_err(ParseError::Read)? {
        number += 1;
        if line.trim().is_empty() {
            continue;
        }
        let mut text = line.as_str();
        let mut pid = 0;
        if let Some(captures) = PID_PREFIX.captures(text) {
            let digits = captures
                .get(1)
                .or_else(|| captures.get(2))
                .map_or("", |digits| digits.as_str());
            pid = digits.parse().unwrap_or_default();
            text = &text[captures.get(0).map_or(0, |whole| whole.end())..];
        }
        if text.starts_with("--- ") || text.starts_with("+++ ") {
            continue;
        }
        let unparsable = |detail: String| ParseError::Unparsable {
            line: number,
            detail,
        };
        if let Some(head) = text.strip_suffix(UNFINISHED) {
            let Some(name) = CALL_START
                .captures(head)
                .and_then(|captures| captures.get(1))
            else {
                return Err(unparsable(text.to_owned()));
            };
            open.insert(
                pid,
                Pending {
                    line: number,
                    name: name.as_str().to_owned(),
                    head: head.to_owned(),
                },
            );
            continue;
        }
        let mut start = number;
        let joined;
        if let Some(captures) = RESUMED.captures(text) {
            let name = captures.get(1).map_or("", |name| name.as_str());
            let Some(started) = open.remove(&pid).filter(|started| started.name == name) else {
                return Err(unparsable(format!(
                    "{name} resumed with nothing unfinished"
                )));
            };
            let rest = &text[captures.get(0).map_or(0, |whole| whole.end())..];
            joined = format!("{}{rest}", started.head);
            text = &joined;
            start = started.line;
        }
        let mut event = parse_call(text).map_err(unparsable)?;
        event.line = start;
        event.pid = pid;
        events.push(event);
    }
    let mut interrupted: Vec<(u32, Pending)> = open.into_iter().collect();
    interrupted.sort_by_key(|(_, started)| started.line);
    for (pid, started) in interrupted {
        let mut event = parse_call(&format!("{}) = ?", started.head)).map_err(|detail| {
            ParseError::Unparsable {
                line: started.line,
                detail,
            }
        })?;
        event.line = started.line;
        event.pid = pid;
        events.push(event);
    }
    Ok(events)
}

/// Reads `name(arg, arg, ...) = result`.
fn parse_call(text: &str) -> Result<Event, String> {
    let malformed = |why: &str| format!("malformed call: {why}{text}");
    let Some(captures) = CALL_START.captures(text) else {
        return Err(malformed(""));
    };
    let name = captures.get(1).map_or("", |name| name.as_str());
    let body = &text[captures.get(0).map_or(0, |whole| whole.end())..];
    let end = closing_paren(body).ok_or_else(|| malformed("unbalanced: "))?;
    let Some(result) = body[end + 1..].trim_start_matches(' ').strip_prefix("= ") else {
        return Err(malformed("no result: "));
    };
    if name == UNKNOWN_CALL && !body[..end].trim().is_empty() {
        return Err(malformed("an unidentified call with arguments: "));
    }
    Ok(Event {
        name: name.to_owned(),
        args: split_args(&body[..end]),
        result: result.trim().to_owned(),
        ..Event::default()
    })
}

/// The argument grammar's state: quoted strings, nested brackets, and the `<...>` annotations
/// that `-yy` attaches to descriptors, which may themselves nest.
#[derive(Default)]
struct Nesting {
    quoted: bool,
    escaped: bool,
    depth: i32,
    angle: i32,
}

impl Nesting {
    fn top_level(&self) -> bool {
        !self.quoted && self.angle == 0 && self.depth == 0
    }

    /// Advances the state over the byte at `index`.
    fn step(&mut self, text: &[u8], index: usize) {
        let byte = text[index];
        if self.quoted {
            self.step_quoted(byte);
        } else if self.angle > 0 {
            self.step_annotation(text, index);
        } else if byte == b'"' {
            self.quoted = true;
        } else if byte == b'<' && index > 0 && opens_annotation(text[index - 1]) {
            self.angle += 1;
        } else if matches!(byte, b'(' | b'{' | b'[') {
            self.depth += 1;
        } else if matches!(byte, b')' | b'}' | b']') {
            self.depth -= 1;
        }
    }

    fn step_quoted(&mut self, byte: u8) {
        if self.escaped {
            self.escaped = false;
        } else if byte == b'\\' {
            self.escaped = true;
        } else if byte == b'"' {
            self.quoted = false;
        }
    }

    /// Inside a `-yy` annotation, which may nest.
    fn step_annotation(&mut self, text: &[u8], index: usize) {
        if text[index] == b'<' {
            self.angle += 1;
        } else if text[index] == b'>' && text[index - 1] != b'-' {
            // The arrow between a socket's endpoints, 1.2.3.4:5->6.7.8.9:10, closes nothing.
            self.angle -= 1;
        }
    }
}

/// Whether a `<` after this byte starts a `-yy` annotation: they follow a descriptor number, or
/// the D of `AT_FDCWD`.
fn opens_annotation(previous: u8) -> bool {
    previous.is_ascii_digit() || previous == b'D'
}

fn closing_paren(body: &str) -> Option<usize> {
    let bytes = body.as_bytes();
    let mut state = Nesting::default();
    for index in 0..bytes.len() {
        if state.top_level() && bytes[index] == b')' {
            return Some(index);
        }
        state.step(bytes, index);
    }
    None
}

fn split_args(body: &str) -> Vec<String> {
    if body.trim().is_empty() {
        return Vec::new();
    }
    let bytes = body.as_bytes();
    let mut args = Vec::new();
    let mut state = Nesting::default();
    let mut start = 0;
    for index in 0..bytes.len() {
        if state.top_level() && bytes[index] == b',' {
            args.push(body[start..index].trim().to_owned());
            start = index + 1;
            continue;
        }
        state.step(bytes, index);
    }
    args.push(body[start..].trim().to_owned());
    args
}
