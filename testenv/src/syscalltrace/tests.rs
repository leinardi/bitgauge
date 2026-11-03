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

//! The analyser's contract on recorded traces and on single lines (Go's
//! `syscalltrace_test.go`).
//!
//! The `probe-*.strace` fixtures are recorded runs of `test/image/testdata/probe` in the tools
//! image, under `strace -f -yy -e` [`TRACE_SET`], listening on 127.0.0.1:18080 and serving one
//! request; `wget-healthcheck.strace` is busybox wget fetching from it, a client that connects
//! once. They are copies of the Go tree's `test/internal/syscalltrace/testdata`, byte for byte.
//!
//! `rust-serve.strace` and `rust-healthcheck.strace` are recorded the same way from the Rust
//! candidate image's `/bitgauge`: `serve` with the default `:8080`, answering `GET /api/v1/info`,
//! `GET /` and the healthcheck's `GET /api/v1/ping`, and `healthcheck` run beside it in the same
//! namespace. Both pass with zero violations.

use std::fs::File;
use std::net::SocketAddr;
use std::path::PathBuf;

use super::{
    Event, TRACE_SET, UNKNOWN_CALL, Violation, check_healthcheck, check_serve, parse,
    parse_descriptor,
};

/// The probe's listen address.
const PROBE_LISTEN: &str = "127.0.0.1:18080";

/// The policy a recorded trace is judged by.
#[derive(Debug, Clone, Copy)]
enum Policy {
    /// [`check_serve`], with the listen address.
    Serve(&'static str),
    /// [`check_healthcheck`], with the target.
    Healthcheck(&'static str),
}

/// Every recorded trace, the policy it is judged by and the reason it must be rejected for, or
/// `None` when it must pass. A new fixture is one line here.
const RECORDED: &[(&str, Policy, Option<&str>)] = &[
    ("probe-serve.strace", Policy::Serve(PROBE_LISTEN), None),
    (
        "probe-connect-back.strace",
        Policy::Serve(PROBE_LISTEN),
        Some("serve may not connect"),
    ),
    (
        "probe-sendto-peer.strace",
        Policy::Serve(PROBE_LISTEN),
        Some("a send with an explicit destination address"),
    ),
    (
        "probe-file-create.strace",
        Policy::Serve(PROBE_LISTEN),
        Some("openat with write intent on /tmp/probe-was-here"),
    ),
    (
        "wget-healthcheck.strace",
        Policy::Healthcheck(PROBE_LISTEN),
        None,
    ),
    ("rust-serve.strace", Policy::Serve("0.0.0.0:8080"), None),
    (
        "rust-healthcheck.strace",
        Policy::Healthcheck("127.0.0.1:8080"),
        None,
    ),
];

fn address(text: &str) -> SocketAddr {
    text.parse()
        .unwrap_or_else(|error| panic!("{text}: {error}"))
}

fn fixture(name: &str) -> Vec<Event> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/testdata/syscalltrace")
        .join(name);
    let file = File::open(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let events = parse(file).unwrap_or_else(|error| panic!("{name}: {error}"));
    assert!(!events.is_empty(), "{name} holds no calls");
    events
}

fn contains_reason(violations: &[Violation], want: &str) -> bool {
    violations
        .iter()
        .any(|violation| violation.reason.contains(want))
}

fn parse_text(text: &str) -> Vec<Event> {
    parse(text.as_bytes()).unwrap_or_else(|error| panic!("{text}: {error}"))
}

/// Go: `TestRecordedProbeTraces`, with every recorded trace: the clean ones pass, each forbidden
/// act is rejected for its own reason, and every trace shows the traffic the test drove.
#[test]
fn recorded_traces() {
    let mut problems = Vec::new();
    for (name, policy, reason) in RECORDED {
        let events = fixture(name);
        let (violations, stats) = match policy {
            Policy::Serve(listen) => check_serve(&events, address(listen)),
            Policy::Healthcheck(target) => check_healthcheck(&events, address(target)),
        };
        if stats.accepted_sends == 0 {
            problems.push(format!(
                "{name}: no send on the expected connection, so the trace proves nothing"
            ));
        }
        if matches!(policy, Policy::Healthcheck(_)) && reason.is_none() && stats.connects != 1 {
            problems.push(format!("{name}: {stats:?}, want one connect"));
        }
        match reason {
            None if !violations.is_empty() => {
                problems.push(format!(
                    "{name}: the clean trace was rejected: {violations:#?}"
                ));
            }
            Some(_) if violations.is_empty() => {
                problems.push(format!("{name}: analyser blind, the trace passed"));
            }
            Some(want) if !contains_reason(&violations, want) => {
                problems.push(format!(
                    "{name}: rejected, but not for {want:?}: {violations:#?}"
                ));
            }
            None | Some(_) => {}
        }
    }
    assert!(problems.is_empty(), "{problems:#?}");
}

/// Go: `TestRecordedHealthcheckTrace`: the single connect passes, and the same client is a
/// violation under the serve policy and against any other target.
#[test]
fn recorded_healthcheck_trace() {
    let events = fixture("wget-healthcheck.strace");
    let (violations, stats) = check_healthcheck(&events, address(PROBE_LISTEN));
    assert!(violations.is_empty(), "{violations:#?}");
    assert!(stats.connects == 1 && stats.accepted_sends > 0, "{stats:?}");
    let (violations, _) = check_serve(&events, address(PROBE_LISTEN));
    assert!(
        contains_reason(&violations, "serve may not connect"),
        "{violations:#?}"
    );
    let (violations, _) = check_healthcheck(&events, address("127.0.0.1:9"));
    assert!(
        contains_reason(&violations, "may connect only to 127.0.0.1:9"),
        "{violations:#?}"
    );
}

/// The serve policy's single-line cases: a name, the line, and the reason it must be rejected
/// for, empty when it must pass.
const SERVE_LINES: &[(&str, &str, &str)] = &[
    (
        "write on an accepted IPv4 connection",
        r#"write(5<TCP:[172.18.0.2:8080->172.18.0.3:40000]>, "x", 1) = 1"#,
        "",
    ),
    (
        "writev on an accepted dual-stack connection",
        r#"writev(7<TCPv6:[[::ffff:127.0.0.1]:8080->[::ffff:127.0.0.1]:41000]>, [{iov_base="x", iov_len=1}], 1) = 1"#,
        "",
    ),
    (
        "sendfile to an accepted connection",
        "sendfile(5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>, 6</proc/self/fd/0>, NULL, 1) = 1",
        "",
    ),
    (
        "write to stderr",
        r#"write(2<pipe:[123]>, "log", 3) = 3"#,
        "",
    ),
    (
        "write to the netpoller",
        r#"write(4<anon_inode:[eventfd]>, "\1\0\0\0\0\0\0\0", 8) = 8"#,
        "",
    ),
    (
        "write to the netpoller, with its details",
        r#"write(5<{eventfd-count=0, eventfd-id=110, eventfd-semaphore=0}>, "\1\0\0\0\0\0\0\0", 8) = 8"#,
        "",
    ),
    (
        "send on a socket whose kind is unknown",
        r#"write(5<{weird-thing=1}>, "x", 1) = 1"#,
        "not an allowed connection",
    ),
    (
        "read-only open",
        r#"openat(AT_FDCWD</>, "/etc/hosts", O_RDONLY|O_CLOEXEC) = 3</etc/hosts>"#,
        "",
    ),
    (
        "write-open under /proc",
        r#"openat(AT_FDCWD</>, "/proc/self/attr/current", O_WRONLY) = -1 EACCES (Permission denied)"#,
        "",
    ),
    (
        "write-open of /dev/null",
        r#"openat(AT_FDCWD</>, "/dev/null", O_RDWR|O_CLOEXEC) = 3</dev/null<char 1:3>>"#,
        "",
    ),
    (
        "connect that failed",
        r#"connect(8<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("192.0.2.1")}, 16) = -1 ENETUNREACH (Network is unreachable)"#,
        "serve may not connect",
    ),
    (
        "connect over IPv6",
        r#"connect(8<TCPv6:[1]>, {sa_family=AF_INET6, sin6_port=htons(53), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:db8::1", &sin6_addr), sin6_scope_id=0}, 28) = -1 EINPROGRESS (Operation in progress)"#,
        "serve may not connect",
    ),
    (
        "send on a dialed connection",
        r#"write(8<TCP:[172.18.0.2:40000->192.0.2.1:443]>, "x", 1) = 1"#,
        "not an allowed connection",
    ),
    (
        "send on an accepted connection on another port",
        r#"write(8<TCP:[127.0.0.1:9090->127.0.0.1:40000]>, "x", 1) = 1"#,
        "not an allowed connection",
    ),
    (
        "send on a UDP socket",
        r#"write(8<UDP:[127.0.0.1:5000->127.0.0.1:53]>, "x", 1) = 1"#,
        "not an allowed connection",
    ),
    (
        "send on a unix socket",
        r#"sendmsg(8<UNIX:[1->2]>, {msg_iov=[{iov_base="x", iov_len=1}], msg_iovlen=1}, 0) = 1"#,
        "not an allowed connection",
    ),
    (
        "sendmsg with a destination on an accepted connection",
        r#"sendmsg(5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>, {msg_name={sa_family=AF_INET, sin_port=htons(9), sin_addr=inet_addr("192.0.2.1")}, msg_namelen=16, msg_iov=[{iov_base="x", iov_len=1}], msg_iovlen=1}, 0) = 1"#,
        "explicit destination",
    ),
    (
        "sendto with a destination",
        r#"sendto(8<UDP:[0.0.0.0:5000]>, "x", 1, 0, {sa_family=AF_INET, sin_port=htons(9), sin_addr=inet_addr("192.0.2.1")}, 16) = 1"#,
        "explicit destination",
    ),
    (
        "write to an unannotated descriptor",
        r#"write(9, "x", 1) = 1"#,
        "could not name",
    ),
    (
        "write to a file descriptor",
        r#"pwrite64(9</var/lib/state>, "x", 1, 0) = 1"#,
        "outside /dev and /proc",
    ),
    (
        "create",
        r#"creat("/tmp/x", 0644) = -1 EROFS (Read-only file system)"#,
        "creat with write intent on /tmp/x",
    ),
    (
        "relative open for writing",
        r#"openat(AT_FDCWD</srv>, "data/out", O_WRONLY|O_CREAT, 0600) = -1 EROFS (Read-only file system)"#,
        "on /srv/data/out",
    ),
    (
        "relative open with no directory",
        r#"openat(9, "out", O_APPEND) = -1 EBADF (Bad file descriptor)"#,
        "on out",
    ),
    (
        "open escaping /dev",
        r#"open("/dev/../etc/passwd", O_WRONLY) = -1 EACCES (Permission denied)"#,
        "on /etc/passwd",
    ),
    (
        "mkdir",
        r#"mkdirat(AT_FDCWD</>, "/tmp/d", 0755) = 0"#,
        "mkdirat",
    ),
    (
        "rename",
        r#"renameat2(AT_FDCWD</>, "/tmp/a", AT_FDCWD</>, "/tmp/b", 0) = 0"#,
        "renameat2",
    ),
    (
        "unlink",
        r#"unlinkat(AT_FDCWD</>, "/tmp/a", 0) = 0"#,
        "unlinkat",
    ),
    ("truncate", r#"truncate("/tmp/a", 0) = 0"#, "truncate"),
    (
        "a write-intent call with no path",
        "utimensat(5</tmp/a>, NULL, [UTIME_NOW, UTIME_NOW], 0) = 0",
        "could not name",
    ),
    (
        "a shared-memory file",
        r#"openat(AT_FDCWD</>, "/dev/shm/state", O_RDWR|O_CREAT, 0600) = 3</dev/shm/state>"#,
        "on /dev/shm/state",
    ),
    (
        "a unix socket node",
        r#"bind(3<UNIX:[1]>, {sa_family=AF_UNIX, sun_path="/tmp/s.sock"}, 110) = 0"#,
        "socket node /tmp/s.sock",
    ),
    (
        "an abstract unix socket",
        r#"bind(3<UNIX:[1]>, {sa_family=AF_UNIX, sun_path=@"bitgauge"}, 11) = 0"#,
        "",
    ),
    (
        "an IP bind",
        r#"bind(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(8080), sin_addr=inet_addr("0.0.0.0")}, 16) = 0"#,
        "",
    ),
];

/// Go: `TestServePolicyLines`: the calls the recorded traces do not exercise, one line each.
#[test]
fn serve_policy_lines() {
    let listen = address("0.0.0.0:8080");
    let mut problems = Vec::new();
    for &(name, line, reason) in SERVE_LINES {
        let events = match parse(format!("1 {line}\n").as_bytes()) {
            Ok(events) => events,
            Err(error) => {
                problems.push(format!("{name}: {error}"));
                continue;
            }
        };
        let (violations, _) = check_serve(&events, listen);
        if reason.is_empty() && !violations.is_empty() {
            problems.push(format!("{name} was rejected: {violations:?}"));
        } else if !reason.is_empty() && !contains_reason(&violations, reason) {
            problems.push(format!(
                "{name} was not rejected for {reason:?}: {violations:?}"
            ));
        }
    }
    assert!(problems.is_empty(), "{problems:#?}");
}

/// Go: `TestServeOnASpecificAddress`: a specific listen address allows only connections
/// accepted on that address.
#[test]
fn serve_on_a_specific_address() {
    let events = parse_text(concat!(
        "1 write(5<TCP:[10.0.0.1:8080->10.0.0.9:40000]>, \"x\", 1) = 1\n",
        "1 write(6<TCP:[10.0.0.2:8080->10.0.0.9:40001]>, \"x\", 1) = 1\n"
    ));
    let (violations, stats) = check_serve(&events, address("10.0.0.1:8080"));
    assert!(
        violations.len() == 1 && violations[0].event.line == 2 && stats.accepted_sends == 1,
        "violations = {violations:?}, stats = {stats:?}; want only the second write rejected"
    );
}

/// Go: `TestHealthcheckPolicyLines`.
#[test]
fn healthcheck_policy_lines() {
    let target = address("127.0.0.1:8080");
    let connect = "connect(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(8080), sin_addr=inet_addr(\"127.0.0.1\")}, 16) = 0\n";
    let send = "write(3<TCP:[127.0.0.1:40000->127.0.0.1:8080]>, \"GET\", 3) = 3\n";
    let mut problems = Vec::new();
    for (name, trace, target, reason) in [
        ("one connect and its request", format!("{connect}{send}"), target, ""),
        (
            "IPv6 loopback",
            "connect(3<TCPv6:[1]>, {sa_family=AF_INET6, sin6_port=htons(8080), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, \"::1\", &sin6_addr), sin6_scope_id=0}, 28) = 0\n".to_owned(),
            address("[::1]:8080"),
            "",
        ),
        ("no connect", send.to_owned(), target, "connected 0 times"),
        ("two connects", format!("{connect}{connect}"), target, "connected 2 times"),
        ("a non-loopback target", connect.to_owned(), address("192.0.2.1:8080"), "not loopback"),
        (
            "a send elsewhere",
            format!("{connect}write(4<TCP:[127.0.0.1:40001->127.0.0.1:9090]>, \"x\", 1) = 1\n"),
            target,
            "not an allowed connection",
        ),
        (
            "a file write",
            format!("{connect}openat(AT_FDCWD</>, \"/tmp/x\", O_WRONLY|O_CREAT, 0600) = 3</tmp/x>\n"),
            target,
            "outside /dev and /proc",
        ),
    ] {
        let events = match parse(trace.as_bytes()) {
            Ok(events) => events,
            Err(error) => {
                problems.push(format!("{name}: {error}"));
                continue;
            }
        };
        let (violations, _) = check_healthcheck(&events, target);
        if reason.is_empty() && !violations.is_empty() {
            problems.push(format!("{name} was rejected: {violations:?}"));
        } else if !reason.is_empty() && !contains_reason(&violations, reason) {
            problems.push(format!("{name} was not rejected for {reason:?}: {violations:?}"));
        }
    }
    assert!(problems.is_empty(), "{problems:#?}");
}

/// Go: `TestParse`: the shapes of strace output the fixtures may not have: interleaved calls
/// split into unfinished and resumed halves, pid prefixes in both forms, signals and exits,
/// nested annotations, and a call cut off by the process exiting.
#[test]
fn parse_shapes() {
    let trace = [
        r#"[pid  12] connect(3<TCP:[1]>, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("192.0.2.1")}, 16 <unfinished ...>"#,
        r#"13    write(1<pipe:[5]>, "a) = 1, (\"b", 7) = 7"#,
        "--- SIGURG {si_signo=SIGURG, si_code=SI_TKILL, si_pid=12, si_uid=0} ---",
        "[pid  12] <... connect resumed>) = -1 EINPROGRESS (Operation in progress)",
        "13    fcntl(0</dev/null<char 1:3>>, F_GETFL) = 0x8002 (flags O_RDWR|O_LARGEFILE)",
        "13    +++ exited with 0 +++",
        r#"14    openat(AT_FDCWD</>, "/tmp/x", O_WRONLY <unfinished ...>"#,
        "",
    ]
    .join("\n");
    let events = parse_text(&trace);
    assert_eq!(events.len(), 4, "{events:#?}");
    let connect = &events[1];
    assert!(
        connect.name == "connect"
            && connect.pid == 12
            && connect.line == 1
            && connect.args.len() == 3
            && connect.result.starts_with("-1 EINPROGRESS"),
        "{connect:?}"
    );
    let write = &events[0];
    assert!(
        write.name == "write" && write.args.len() == 3 && write.args[1] == r#""a) = 1, (\"b""#,
        "{write:?}"
    );
    assert_eq!(parse_descriptor(&events[2].args[0]).path, "/dev/null");
    assert!(
        events[3].name == "openat" && events[3].result == "?",
        "an interrupted call = {:?}",
        events[3]
    );
    assert_eq!(
        events[3].to_string(),
        r#"line 7, pid 14: openat(AT_FDCWD</>, "/tmp/x", O_WRONLY) = ?"#
    );

    // A call strace could not identify is read, with no arguments, and judged by no policy.
    let unknown =
        parse_text("7 ???()                                   = ?\n8 ???( <unfinished ...>\n");
    assert!(
        unknown.len() == 2
            && unknown[0].name == UNKNOWN_CALL
            && unknown[0].args.is_empty()
            && unknown[1].result == "?",
        "{unknown:?}"
    );

    // A trailing \r is dropped as Go's scanner drops it.
    assert_eq!(parse_text("1 close(3) = 0\r\n")[0].result, "0");

    let parsed: Vec<&str> = [
        "1 not a call\n",
        "1 write(1, \"x\", 1\n",
        "1 <... write resumed>) = 1\n",
        "1 ???(5<TCP:[1]>, \"x\", 1) = 1\n",
    ]
    .into_iter()
    .filter(|bad| parse(bad.as_bytes()).is_ok())
    .collect();
    assert!(parsed.is_empty(), "parsed: {parsed:?}");
}

/// The trace set is the one the policies are written against, as the image suite passes it to
/// strace.
#[test]
fn trace_set_names_every_judged_call() {
    for call in [
        "%network", "%file", "write", "writev", "pwrite64", "sendfile", "close",
    ] {
        assert!(
            TRACE_SET.split([',', '=']).any(|item| item == call),
            "{call}"
        );
    }
}
