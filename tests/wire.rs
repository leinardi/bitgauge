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

//! The wire contract: the Go binary's answers to a request corpus, replayed against the Rust
//! server in process.
//!
//! `tests/testdata/wire/<profile>.json` holds, for each case, the exact request bytes, how much
//! of the answer to read, and what the Go binary answered: the status, every header but `Date`,
//! and the body as text, as JSON or as a length. The Go program that wrote it ran each profile
//! twice, and recorded what differed between the runs (a random body, the epoch, the telemetry's
//! timing) as volatile, which is compared by presence and type only. Each profile runs on a server
//! of its own with `<profile>.yaml` and the SPA of `tests/testdata/wire/spa`, which the Go binary
//! embedded too.
//!
//! Every difference must be in [`ALLOWED`], which cites its row of the differences table in
//! `docs/rust-port.md`; an entry no case needs fails the test too, so the table stays exact.

mod support;

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::{self, BufReader, Write as _};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::process::ExitCode;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tokio::time::Instant;

use bitgauge::command::{self, Mode, Process};
use bitgauge::config::Config;
use bitgauge::server::Lifecycle;
use bitgauge::web::{Files, RenderError, Spa};
use bytes::Bytes;
use serde_json::Value;

use support::dial_loopback;

/// How long a read of an answer may take.
const READ_TIMEOUT: Duration = Duration::from_secs(20);

/// How long the server may take to start answering, and an open request to settle.
const STARTUP: Duration = Duration::from_secs(10);

/// How many free ports a server start tries.
const STARTS: usize = 3;

/// Differences from the Go binary that the port allows on one case.
struct Allowed {
    /// The profile, or `None` for every profile that has the case.
    profile: Option<&'static str>,
    /// The case's name.
    case: &'static str,
    /// What may differ: `status`, `header <name>` or `body`. Each must differ somewhere.
    parts: &'static [&'static str],
    /// The row of the differences table in `docs/rust-port.md`.
    row: u8,
}

/// The differences the port allows, each with its row of `docs/rust-port.md`.
const ALLOWED: &[Allowed] = &[
    // Row 5: OpenMetrics only, as one sized body, so no Accept negotiation and no chunking.
    Allowed {
        profile: None,
        case: "metrics",
        parts: &[
            "header content-length",
            "header content-type",
            "header transfer-encoding",
            "header vary",
        ],
        row: 5,
    },
    // Row 6: hyper's 431 has an empty body, and so has its 400 for an unsupported
    // Transfer-Encoding or HTTP version, where Go answered 501 and 505.
    Allowed {
        profile: Some("default"),
        case: "header too large",
        parts: &["body", "header content-length", "header content-type"],
        row: 6,
    },
    Allowed {
        profile: Some("default"),
        case: "uri too long",
        parts: &["body", "header content-length", "header content-type"],
        row: 6,
    },
    Allowed {
        profile: Some("default"),
        case: "unsupported transfer coding",
        parts: &[
            "status",
            "body",
            "header content-length",
            "header content-type",
        ],
        row: 6,
    },
    Allowed {
        profile: Some("default"),
        case: "unsupported version",
        parts: &[
            "status",
            "body",
            "header content-length",
            "header content-type",
        ],
        row: 6,
    },
    // Row 12: the SPA's routes answer HEAD, so a HEAD gets the GET's headers and a 405 lists it.
    Allowed {
        profile: None,
        case: "spa index HEAD",
        parts: &[
            "status",
            "header allow",
            "header cache-control",
            "header content-length",
            "header content-type",
        ],
        row: 12,
    },
    Allowed {
        profile: None,
        case: "spa script HEAD",
        parts: &[
            "status",
            "header accept-ranges",
            "header allow",
            "header cache-control",
            "header content-length",
            "header content-type",
        ],
        row: 12,
    },
    Allowed {
        profile: Some("default"),
        case: "spa index POST",
        parts: &["header allow"],
        row: 12,
    },
    Allowed {
        profile: None,
        case: "spa script DELETE",
        parts: &["header allow"],
        row: 12,
    },
    // Row 12: several ranges get the whole file.
    Allowed {
        profile: None,
        case: "spa multi-range",
        parts: &["status", "header content-length", "body"],
        row: 12,
    },
    // Row 12: an unknown extension is application/octet-stream.
    Allowed {
        profile: None,
        case: "spa unknown extension",
        parts: &["header content-type"],
        row: 12,
    },
];

/// The directory of the corpus.
fn corpus_dir() -> &'static Path {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/testdata/wire"))
}

/// The SPA of the corpus, which the Go binary that recorded it embedded.
fn render_fixture(base_path: &str) -> Result<Spa, RenderError> {
    fn walk(root: &Path, directory: &Path, files: &mut Files) {
        let entries = std::fs::read_dir(directory)
            .unwrap_or_else(|error| panic!("read {}: {error}", directory.display()));
        for entry in entries {
            let path = entry.unwrap_or_else(|error| panic!("{error}")).path();
            if path.is_dir() {
                walk(root, &path, files);
                continue;
            }
            let name = path
                .strip_prefix(root)
                .unwrap_or_else(|error| panic!("{error}"))
                .to_string_lossy()
                .replace('\\', "/");
            let contents = std::fs::read(&path)
                .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
            files.insert(name, Bytes::from(contents));
        }
    }
    let root = corpus_dir().join("spa");
    let mut files = Files::new();
    walk(&root, &root, &mut files);
    Spa::render_files(files, base_path)
}

/// What a server answered, as far as the case reads it.
#[derive(Debug)]
struct Answer {
    status: u16,
    headers: Vec<(String, String)>,
    /// `None` when the case reads the head only.
    body: Option<Vec<u8>>,
}

fn read_line(reader: &mut impl io::BufRead) -> io::Result<String> {
    let mut line = String::new();
    reader.read_line(&mut line)?;
    if line.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "end of answer",
        ));
    }
    Ok(line.trim_end_matches(['\r', '\n']).to_owned())
}

fn header<'answer>(headers: &'answer [(String, String)], name: &str) -> Option<&'answer str> {
    headers
        .iter()
        .find(|(header, _)| header == name)
        .map(|(_, value)| value.as_str())
}

/// Reads an answer the way the Go program did: the head, then, unless only the head is read,
/// the body by its framing.
fn read_answer(reader: &mut impl io::BufRead, method: &str, full: bool) -> io::Result<Answer> {
    let status_line = read_line(reader)?;
    let status = status_line
        .split(' ')
        .nth(1)
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| io::Error::other(format!("status line {status_line:?}")))?;
    let mut headers = Vec::new();
    loop {
        let line = read_line(reader)?;
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':').unwrap_or((&line, ""));
        headers.push((name.to_ascii_lowercase(), value.trim().to_owned()));
    }
    if !full {
        return Ok(Answer {
            status,
            headers,
            body: None,
        });
    }
    let mut body = Vec::new();
    if method == "HEAD" || status < 200 || status == 204 || status == 304 {
    } else if header(&headers, "transfer-encoding") == Some("chunked") {
        loop {
            let size_line = read_line(reader)?;
            let size = size_line.split(';').next().unwrap_or_default().trim();
            let size = usize::from_str_radix(size, 16).map_err(io::Error::other)?;
            if size == 0 {
                while !read_line(reader)?.is_empty() {}
                break;
            }
            let mut chunk = vec![0; size + 2];
            reader.read_exact(&mut chunk)?;
            chunk.truncate(size);
            body.extend_from_slice(&chunk);
        }
    } else if let Some(length) = header(&headers, "content-length") {
        let length: usize = length.parse().map_err(io::Error::other)?;
        body.resize(length, 0);
        reader.read_exact(&mut body)?;
    } else {
        reader.read_to_end(&mut body)?;
    }
    Ok(Answer {
        status,
        headers,
        body: Some(body),
    })
}

/// A Rust server on a profile, in this process.
struct Server {
    address: SocketAddr,
    lifecycle: Lifecycle,
    served: JoinHandle<ExitCode>,
    /// The connections a case keeps open until the profile ends.
    held: Vec<TcpStream>,
    /// When the server started answering, which bounds what a real-clock bucket refilled.
    started: Instant,
}

impl Server {
    /// Starts a server on a free port, retrying with another port when something else took
    /// the one released for it.
    fn start(profile: &str, base_path: &str) -> Self {
        for _ in 0..STARTS {
            if let Some(server) = Self::try_start(profile, base_path) {
                return server;
            }
        }
        panic!("the {profile} server did not start in {STARTS} attempts");
    }

    /// One start: `None` when the server ended before answering, as when its port was taken.
    fn try_start(profile: &str, base_path: &str) -> Option<Self> {
        // Validation refuses port 0, so a free port is taken and released for the server.
        let address = TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .unwrap_or_else(|error| panic!("a free port: {error}"));
        let lifecycle = Lifecycle::new();
        let config = corpus_dir().join(format!("{profile}.yaml"));
        let process = Process {
            stdout: io::sink,
            stderr: io::sink,
            environment: vec![("BITGAUGE_SERVER__LISTEN".to_owned(), address.to_string())],
            render: render_fixture,
            mode: Mode::InProcess,
            lifecycle: lifecycle.clone(),
        };
        let args = [
            OsString::from("serve"),
            OsString::from("--config"),
            config.into_os_string(),
        ];
        let served = thread::spawn(move || command::run(args, process));
        let mut probe = Config::default();
        probe.server.listen = address
            .to_string()
            .parse()
            .unwrap_or_else(|error| panic!("{error:?}"));
        base_path.clone_into(&mut probe.server.base_path);
        let started = Instant::now();
        while !bitgauge::healthcheck::answers(&probe) {
            if served.is_finished() {
                return None;
            }
            assert!(
                started.elapsed() < STARTUP,
                "the {profile} server did not start"
            );
            thread::sleep(Duration::from_millis(20));
        }
        Some(Self {
            address,
            lifecycle,
            served,
            held: Vec::new(),
            started,
        })
    }

    /// Sends `settle` until it answers `status`, so the server has taken what an open request
    /// holds before the next case runs.
    fn settle(&self, request: &str, status: u16) {
        let method = request.split(' ').next().unwrap_or_default();
        let started = Instant::now();
        loop {
            let mut stream = dial_loopback(self.address);
            stream
                .set_read_timeout(Some(READ_TIMEOUT))
                .and_then(|()| stream.write_all(request.as_bytes()))
                .unwrap_or_else(|error| panic!("send: {error}"));
            let answer = read_answer(&mut BufReader::new(stream), method, true)
                .unwrap_or_else(|error| panic!("read the answer: {error}"));
            if answer.status == status {
                return;
            }
            assert!(
                started.elapsed() < STARTUP,
                "the open request did not settle"
            );
            thread::sleep(Duration::from_millis(10));
        }
    }

    /// Sends a case's request as many times as it repeats, and reads each answer as the case
    /// says.
    fn exchange(&mut self, request: &str, mode: &str, repeat: usize) -> Vec<Answer> {
        let method = request.split(' ').next().unwrap_or_default();
        let mut answers = Vec::new();
        for _ in 0..repeat.max(1) {
            let mut stream = dial_loopback(self.address);
            stream
                .set_read_timeout(Some(READ_TIMEOUT))
                .and_then(|()| stream.write_all(request.as_bytes()))
                .unwrap_or_else(|error| panic!("send: {error}"));
            if mode == "open" {
                self.held.push(stream);
                continue;
            }
            let reader = stream
                .try_clone()
                .unwrap_or_else(|error| panic!("clone the stream: {error}"));
            let answer = read_answer(&mut BufReader::new(reader), method, mode == "full")
                .unwrap_or_else(|error| panic!("read the answer: {error}"));
            if mode == "hold" {
                self.held.push(stream);
            }
            answers.push(answer);
        }
        answers
    }

    fn stop(self) {
        drop(self.held);
        self.lifecycle.stop();
        let code = self
            .served
            .join()
            .unwrap_or_else(|_| panic!("serve panicked"));
        assert_eq!(code, ExitCode::SUCCESS, "the server did not stop cleanly");
    }
}

/// One difference between the corpus and the Rust server.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Difference {
    case: String,
    part: String,
    go: String,
    rust: String,
}

/// The headers by name, `date` left out, with the values of a repeated header in order.
fn by_name(headers: impl IntoIterator<Item = (String, String)>) -> BTreeMap<String, Vec<String>> {
    let mut named: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (name, value) in headers {
        if name != "date" {
            named.entry(name).or_default().push(value);
        }
    }
    named
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn json_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Compares an answer with what the corpus recorded, adding each difference to `found`.
fn compare(name: &str, expected: &Value, answer: &Answer, found: &mut Vec<Difference>) {
    let mut differ = |part: &str, go: String, rust: String| {
        found.push(Difference {
            case: name.to_owned(),
            part: part.to_owned(),
            go,
            rust,
        });
    };
    let status = expected["status"].as_u64().unwrap_or_default();
    if status != u64::from(answer.status) {
        differ("status", status.to_string(), answer.status.to_string());
    }
    let go_headers = by_name(
        expected["headers"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|pair| {
                let pair = strings(pair);
                (pair[0].clone(), pair[1].clone())
            }),
    );
    let rust_headers = by_name(answer.headers.iter().cloned());
    let volatile = strings(&expected["volatileHeaders"]);
    let names: std::collections::BTreeSet<&String> =
        go_headers.keys().chain(rust_headers.keys()).collect();
    for header_name in names {
        let go = go_headers.get(header_name);
        let rust = rust_headers.get(header_name);
        let same = if volatile.contains(header_name) {
            go.is_some() == rust.is_some()
        } else {
            go == rust
        };
        if !same {
            differ(
                &format!("header {header_name}"),
                go.map_or_else(|| "absent".to_owned(), |values| values.join(", ")),
                rust.map_or_else(|| "absent".to_owned(), |values| values.join(", ")),
            );
        }
    }
    let body = &expected["body"];
    let Some(actual) = &answer.body else {
        return;
    };
    let shown = |bytes: &[u8]| {
        let text = String::from_utf8_lossy(bytes);
        let mut shown: String = text.chars().take(300).collect();
        let _ = write!(shown, " ({} bytes)", bytes.len());
        shown
    };
    match body["kind"].as_str().unwrap_or_default() {
        "empty" if !actual.is_empty() => differ("body", "empty".to_owned(), shown(actual)),
        "text" => {
            let text = body["text"].as_str().unwrap_or_default();
            if text.as_bytes() != actual.as_slice() {
                differ("body", shown(text.as_bytes()), shown(actual));
            }
        }
        "bytes" => {
            let length = body["length"].as_i64().unwrap_or_default();
            if length >= 0 && i64::try_from(actual.len()).ok() != Some(length) {
                differ("body", format!("{length} bytes"), shown(actual));
            }
        }
        "json" => {
            let Ok(mut rust) = serde_json::from_slice::<Value>(actual) else {
                differ("body", body["json"].to_string(), shown(actual));
                return;
            };
            let mut go = body["json"].clone();
            for pointer in strings(&body["volatile"]) {
                let go_kind = go.pointer(&pointer).map(json_kind);
                let rust_kind = rust.pointer(&pointer).map(json_kind);
                if go_kind != rust_kind {
                    differ(
                        &format!("body {pointer}"),
                        format!("{go_kind:?}"),
                        format!("{rust_kind:?}"),
                    );
                }
                for value in [go.pointer_mut(&pointer), rust.pointer_mut(&pointer)]
                    .into_iter()
                    .flatten()
                {
                    *value = Value::Null;
                }
            }
            if go != rust {
                differ("body", go.to_string(), rust.to_string());
            }
        }
        _ => {}
    }
}

/// The tokens the rate limit's real-clock bucket can have refilled while a profile ran. It
/// refills continuously at `limits.requests_per_minute / 60` a second, one a second at the
/// smallest setting, so a request Go found `rate_limited` may pass in the Rust run, wherever it
/// falls, once for each token: at most one more than the whole seconds since the server started.
struct Refill {
    started: Instant,
    spent: usize,
}

impl Refill {
    fn new(started: Instant) -> Self {
        Self { started, spent: 0 }
    }

    /// Spends one refilled token, if the time elapsed can have refilled one more.
    fn take(&mut self) -> bool {
        self.take_after(self.started.elapsed())
    }

    fn take_after(&mut self, elapsed: Duration) -> bool {
        let refilled = usize::try_from(elapsed.as_secs())
            .unwrap_or(usize::MAX)
            .saturating_add(1);
        let available = self.spent < refilled;
        if available {
            self.spent += 1;
        }
        available
    }
}

/// Whether a repeated case's statuses match the recorded ones: exactly, except that where Go
/// was refused by the per-minute limit (`rate_limited`), a Rust 200 may stand for its 429 by
/// spending a refilled token.
fn same_statuses(
    go: &[u64],
    rust: &[u64],
    rate_limited: bool,
    refilled: &mut impl FnMut() -> bool,
) -> bool {
    go.len() == rust.len()
        && go.iter().zip(rust).all(|(&go, &rust)| {
            go == rust || (rate_limited && go == 429 && rust == 200 && refilled())
        })
}

/// Whether the recorded answer is the per-minute limit's 429.
fn is_rate_limited(expected: &Value) -> bool {
    expected["status"] == 429 && expected["body"]["json"]["error"]["code"] == "rate_limited"
}

/// What replaying a profile found: the differences no row allows, as text, and the allowed
/// ones it needed, as their index in [`ALLOWED`] and part.
struct Replayed {
    unexplained: String,
    used: Vec<(usize, &'static str)>,
}

/// Replays `profile` against a Rust server of its own.
fn replay(profile: &'static str, base_path: &str) -> Replayed {
    let path = corpus_dir().join(format!("{profile}.json"));
    let corpus: Value = serde_json::from_slice(
        &std::fs::read(&path).unwrap_or_else(|error| panic!("read {}: {error}", path.display())),
    )
    .unwrap_or_else(|error| panic!("parse {}: {error}", path.display()));
    let mut server = Server::start(profile, base_path);
    let mut refill = Refill::new(server.started);
    let mut found = Vec::new();
    for case in corpus["cases"].as_array().into_iter().flatten() {
        let name = case["name"].as_str().unwrap_or_default();
        let repeat = case["repeat"]
            .as_u64()
            .and_then(|repeat| usize::try_from(repeat).ok())
            .unwrap_or(1);
        let answers = server.exchange(
            case["request"].as_str().unwrap_or_default(),
            case["mode"].as_str().unwrap_or("full"),
            repeat,
        );
        if let Some(settle) = case.get("settle") {
            server.settle(
                settle["request"].as_str().unwrap_or_default(),
                settle["status"]
                    .as_u64()
                    .and_then(|status| u16::try_from(status).ok())
                    .unwrap_or_default(),
            );
        }
        let statuses: Vec<u64> = case["statuses"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_u64)
            .collect();
        let expected = case.get("response");
        let rate_limited = expected.is_some_and(is_rate_limited);
        if !statuses.is_empty() {
            let rust: Vec<u64> = answers
                .iter()
                .map(|answer| u64::from(answer.status))
                .collect();
            if !same_statuses(&statuses, &rust, rate_limited, &mut || refill.take()) {
                found.push(Difference {
                    case: name.to_owned(),
                    part: "statuses".to_owned(),
                    go: format!("{statuses:?}"),
                    rust: format!("{rust:?}"),
                });
            }
        }
        // A repeated case is compared on its last answer with the recorded status, which a
        // refilled token can have moved earlier.
        let answer = answers
            .iter()
            .rev()
            .find(|answer| expected.is_some_and(|expected| expected["status"] == answer.status))
            .or(answers.last());
        if let (Some(expected), Some(answer)) = (expected, answer) {
            let refilled =
                statuses.is_empty() && rate_limited && answer.status == 200 && refill.take();
            if !refilled {
                compare(name, expected, answer, &mut found);
            }
        }
    }
    server.stop();
    let mut replayed = Replayed {
        unexplained: String::new(),
        used: Vec::new(),
    };
    for difference in found {
        let allowed = ALLOWED.iter().enumerate().find_map(|(index, allowed)| {
            let applies = allowed.profile.is_none_or(|only| only == profile)
                && allowed.case == difference.case;
            let part = allowed
                .parts
                .iter()
                .find(|part| **part == difference.part)?;
            applies.then_some((index, *part))
        });
        if let Some(used) = allowed {
            replayed.used.push(used);
        } else {
            let _ = writeln!(
                replayed.unexplained,
                "{profile} / {} / {}:\n  go:   {}\n  rust: {}",
                difference.case, difference.part, difference.go, difference.rust
            );
        }
    }
    replayed
}

/// Every profile of the corpus, on servers of their own at once: only the differences
/// [`ALLOWED`] lists, and each of those is still needed.
#[test]
fn the_rust_server_answers_as_the_go_binary_did() {
    let profiles = [
        ("default", "/"),
        ("layers", "/"),
        ("base", "/speed"),
        ("streams", "/"),
        ("rate", "/"),
    ];
    let replays: Vec<Replayed> = thread::scope(|scope| {
        let running: Vec<_> = profiles
            .iter()
            .map(|&(profile, base_path)| scope.spawn(move || replay(profile, base_path)))
            .collect();
        running
            .into_iter()
            .map(|replay| {
                replay
                    .join()
                    .unwrap_or_else(|_| panic!("a replay panicked"))
            })
            .collect()
    });
    let unexplained: String = replays
        .iter()
        .map(|replayed| replayed.unexplained.as_str())
        .collect();
    assert!(
        unexplained.is_empty(),
        "differences from the Go binary that no row allows:\n{unexplained}"
    );
    for (index, allowed) in ALLOWED.iter().enumerate() {
        assert!(allowed.row > 0, "{} cites no row", allowed.case);
        for part in allowed.parts {
            assert!(
                replays
                    .iter()
                    .any(|replayed| replayed.used.contains(&(index, *part))),
                "{} / {part} is allowed by row {} but no longer differs",
                allowed.case,
                allowed.row
            );
        }
    }
}

/// The rate limit's statuses: a Rust 200 stands for a recorded `rate_limited` 429 only by
/// spending a token the elapsed time can have refilled, wherever it falls; any other status
/// matches exactly.
#[test]
fn repeated_statuses_allow_only_the_bucket_refill() {
    let go = [200, 200, 429, 429];
    let never = &mut || false;
    assert!(same_statuses(&go, &go, true, never));
    assert!(!same_statuses(&go, &[200, 200, 200, 429], true, never));
    let mut refill = Refill::new(Instant::now());
    let once = &mut || refill.take_after(Duration::from_millis(100));
    assert!(same_statuses(&go, &[200, 200, 429, 200], true, once));
    assert!(!same_statuses(&go, &[200, 200, 200, 200], true, once));
    let mut refill = Refill::new(Instant::now());
    let twice = &mut || refill.take_after(Duration::from_millis(1500));
    assert!(same_statuses(&go, &[200, 200, 200, 200], true, twice));
    let always = &mut || true;
    assert!(!same_statuses(&go, &[200, 429, 429, 429], true, always));
    assert!(!same_statuses(&go, &[200, 200, 200, 429], false, always));
    assert!(!same_statuses(&go, &[200, 200, 404, 429], true, always));
    assert!(!same_statuses(&go, &[200, 200, 429], true, always));
}

/// A refilled token is spent once, and the budget grows with the whole seconds elapsed.
#[test]
fn the_refill_budget_counts_whole_seconds() {
    let mut refill = Refill::new(Instant::now());
    assert!(refill.take_after(Duration::from_millis(10)));
    assert!(!refill.take_after(Duration::from_millis(990)));
    assert!(refill.take_after(Duration::from_secs(1)));
    assert!(!refill.take_after(Duration::from_millis(1999)));
}
