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

//! The serve and healthcheck policies, and the readers of the arguments they judge: `-yy`
//! descriptor annotations and socket addresses.

use std::fmt;
use std::net::{IpAddr, SocketAddr};
use std::sync::LazyLock;

use regex::Regex;

use super::gostr::unquote;
use super::parse::Event;

/// The strace `-e` argument the policies are written against: every call that opens, names or
/// writes a file, every network call, and the descriptor calls that move a socket to another
/// number.
pub const TRACE_SET: &str =
    "trace=%network,%file,write,writev,pwrite64,sendfile,dup,dup2,dup3,fcntl,close";

/// The descriptor kind of a file path.
pub const KIND_PATH: &str = "path";
/// The descriptor kind of an argument with no `-yy` annotation.
pub const KIND_UNANNOTATED: &str = "unannotated";

/// The index of `sendto`'s destination address argument.
const SENDTO_ADDRESS_ARG: usize = 4;

/// One call a policy forbids.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    /// The call; empty for a violation of the trace as a whole.
    pub event: Event,
    /// Why it is forbidden.
    pub reason: String,
}

impl Violation {
    fn new(event: &Event, reason: impl Into<String>) -> Self {
        Self {
            event: event.clone(),
            reason: reason.into(),
        }
    }
}

impl fmt::Display for Violation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.reason, self.event)
    }
}

/// How much of a trace a policy looked at, so a caller can tell a clean trace from an empty or
/// blind one.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Stats {
    /// The calls judged.
    pub events: usize,
    /// Sends on accepted connections (serve) or on the connection to the target (healthcheck):
    /// proof that the traffic the test drove is in the trace.
    pub accepted_sends: usize,
    /// The connect calls.
    pub connects: usize,
}

/// What a `-yy` annotation says a descriptor is.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Descriptor {
    /// The socket protocol (`TCP`, `TCPv6`, `UDP`, `UNIX`, ...), [`KIND_PATH`], or another strace
    /// kind such as `pipe` or `anon_inode`; [`KIND_UNANNOTATED`] when the argument carries no
    /// annotation.
    pub kind: String,
    /// Set for [`KIND_PATH`].
    pub path: String,
    /// Set for a bound or connected IP socket.
    pub local: Option<SocketAddr>,
    /// Set for a connected IP socket.
    pub remote: Option<SocketAddr>,
}

/// The descriptor kinds that are not a socket: files, pipes, devices, and the anonymous inodes
/// strace names either `anon_inode` or, with their details, `{eventfd-…}` and the like. Any other
/// kind counts as a socket, so a kind this list does not know is judged as one.
const NOT_SOCKETS: &[&str] = &[
    "",
    KIND_PATH,
    KIND_UNANNOTATED,
    "pipe",
    "anon_inode",
    "char",
    "eventfd",
    "eventpoll",
    "timerfd",
    "signalfd",
    "inotify",
    "pidfd",
];

impl Descriptor {
    /// Whether the descriptor is a socket of any family.
    #[must_use]
    pub fn is_socket(&self) -> bool {
        !NOT_SOCKETS.contains(&self.kind.as_str())
    }

    fn is_tcp(&self) -> bool {
        self.kind == "TCP" || self.kind == "TCPv6"
    }

    fn kind(kind: &str) -> Self {
        Self {
            kind: kind.to_owned(),
            ..Self::default()
        }
    }
}

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).unwrap_or_else(|error| unreachable!("{pattern} compiles: {error}"))
}

/// The kind of an anonymous inode that strace shows by its details, such as `{eventfd-count=0,
/// eventfd-id=110, eventfd-semaphore=0}`.
static ANONYMOUS_DETAIL: LazyLock<Regex> = LazyLock::new(|| regex(r"^\{([a-z]+)[-_]"));
static ANNOTATION: LazyLock<Regex> = LazyLock::new(|| regex(r"^(?:-?[0-9]+|AT_FDCWD)<(.*)>$"));
static IPV4_ADDRESS: LazyLock<Regex> =
    LazyLock::new(|| regex(r#"sin_port=htons\(([0-9]+)\), sin_addr=inet_addr\("([^"]+)"\)"#));
static IPV6_ADDRESS: LazyLock<Regex> =
    LazyLock::new(|| regex(r#"sin6_port=htons\(([0-9]+)\).*inet_pton\(AF_INET6, "([^"]+)""#));
// Go's \b is ASCII; Rust's is Unicode unless (?-u:).
static WRITE_FLAGS: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?-u:\b)O_(WRONLY|RDWR|CREAT|TRUNC|APPEND|TMPFILE)(?-u:\b)"));
static UNIX_PATH: LazyLock<Regex> = LazyLock::new(|| regex(r#"sun_path="((?:[^"\\]|\\.)*)""#));

/// Reads an argument such as `5<TCP:[127.0.0.1:8080->127.0.0.1:40000]>`, `3</etc/hosts>` or
/// `1<pipe:[123]>`.
#[must_use]
pub fn parse_descriptor(arg: &str) -> Descriptor {
    let Some(inner) = ANNOTATION
        .captures(arg)
        .and_then(|captures| captures.get(1))
        .map(|inner| inner.as_str())
    else {
        return Descriptor::kind(KIND_UNANNOTATED);
    };
    if let Some(detail) = ANONYMOUS_DETAIL
        .captures(inner)
        .and_then(|captures| captures.get(1))
    {
        return Descriptor::kind(detail.as_str());
    }
    if inner.starts_with('/') {
        // A device carries a nested annotation: /dev/null<char 1:3>.
        let path = inner.split_once('<').map_or(inner, |(path, _)| path);
        return Descriptor {
            kind: KIND_PATH.to_owned(),
            path: path.to_owned(),
            ..Descriptor::default()
        };
    }
    let Some((kind, rest)) = inner.split_once(":[") else {
        return Descriptor::kind(inner.split_once(':').map_or(inner, |(kind, _)| kind));
    };
    let endpoints = rest.strip_suffix(']').unwrap_or(rest);
    let (local, remote) = match endpoints.split_once("->") {
        Some((local, remote)) => (local, Some(remote)),
        None => (endpoints, None),
    };
    // An endpoint that is not an address -- an inode number, a unix path -- stays unset.
    Descriptor {
        kind: kind.to_owned(),
        path: String::new(),
        local: local.parse().ok(),
        remote: remote.and_then(|remote| remote.parse().ok()),
    }
}

/// Go's `Addr.Unmap`: an IPv4-mapped IPv6 address as IPv4.
fn unmap(address: IpAddr) -> IpAddr {
    match address {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(address, IpAddr::V4),
        IpAddr::V4(_) => address,
    }
}

fn unmapped(address: SocketAddr) -> SocketAddr {
    SocketAddr::new(unmap(address.ip()), address.port())
}

/// Go's `netip.Addr.IsLoopback`, which unmaps first.
fn is_loopback(address: IpAddr) -> bool {
    unmap(address).is_loopback()
}

/// Reads a sockaddr argument such as `{sa_family=AF_INET, sin_port=htons(8080),
/// sin_addr=inet_addr("127.0.0.1")}`, unmapped.
#[must_use]
pub fn socket_address(arg: &str) -> Option<SocketAddr> {
    let captures = IPV4_ADDRESS
        .captures(arg)
        .or_else(|| IPV6_ADDRESS.captures(arg))?;
    let port: u16 = captures.get(1)?.as_str().parse().ok()?;
    let address: IpAddr = captures.get(2)?.as_str().parse().ok()?;
    Some(SocketAddr::new(unmap(address), port))
}

/// The calls that write to a descriptor named by their first argument (`sendfile`: its
/// `out_fd`).
const SEND_CALLS: &[&str] = &[
    "write", "writev", "pwrite64", "pwritev", "pwritev2", "sendto", "sendmsg", "sendmmsg",
    "sendfile",
];

/// The calls that create, change or remove a name in the filesystem; any of them on a path
/// outside `/dev` and `/proc` is a write attempt, whatever its flags.
const PATH_WRITERS: &[&str] = &[
    "creat",
    "mkdir",
    "mkdirat",
    "rename",
    "renameat",
    "renameat2",
    "unlink",
    "unlinkat",
    "rmdir",
    "link",
    "linkat",
    "symlink",
    "symlinkat",
    "mknod",
    "mknodat",
    "truncate",
    "chmod",
    "fchmodat",
    "fchmodat2",
    "chown",
    "lchown",
    "fchownat",
    "utime",
    "utimes",
    "utimensat",
    "futimesat",
    "setxattr",
    "lsetxattr",
    "removexattr",
    "lremovexattr",
];

/// The calls that open a path; they write when their flags say so.
const OPEN_CALLS: &[&str] = &["open", "openat", "openat2"];

/// How a policy counts sends.
enum Send {
    /// Not a send.
    No,
    /// A send that is allowed; `expected` when it is on the connection the policy counts.
    Allowed { expected: bool },
    /// A forbidden send.
    Forbidden(&'static str),
}

/// Judges `serve`'s trace while it listens on `listen`. An unspecified listen address (`0.0.0.0`
/// or `::`) accepts on any local address with that port.
#[must_use]
pub fn check_serve(events: &[Event], listen: SocketAddr) -> (Vec<Violation>, Stats) {
    let mut violations = Vec::new();
    let mut stats = Stats {
        events: events.len(),
        ..Stats::default()
    };
    for event in events {
        if event.name == "connect" {
            stats.connects += 1;
            violations.push(Violation::new(event, "serve may not connect"));
            continue;
        }
        match judge_send(event, |descriptor| is_accepted_on(descriptor, listen)) {
            Send::Allowed { expected } => stats.accepted_sends += usize::from(expected),
            Send::Forbidden(reason) => violations.push(Violation::new(event, reason)),
            Send::No => {
                if let Some(reason) = judge_file(event) {
                    violations.push(Violation::new(event, reason));
                }
            }
        }
    }
    (violations, stats)
}

/// Judges `healthcheck`'s trace, which must connect exactly once, to `target`, and send only on
/// that connection.
#[must_use]
pub fn check_healthcheck(events: &[Event], target: SocketAddr) -> (Vec<Violation>, Stats) {
    let mut violations = Vec::new();
    let mut stats = Stats {
        events: events.len(),
        ..Stats::default()
    };
    if !is_loopback(target.ip()) {
        violations.push(Violation::new(
            &Event::default(),
            format!("the healthcheck target {target} is not loopback"),
        ));
    }
    for event in events {
        if event.name == "connect" {
            stats.connects += 1;
            if socket_address(argument(event, 1)) != Some(target) {
                violations.push(Violation::new(
                    event,
                    format!("the healthcheck may connect only to {target}"),
                ));
            }
            continue;
        }
        let on_target = |descriptor: &Descriptor| {
            descriptor.is_tcp() && descriptor.remote.map(unmapped) == Some(target)
        };
        match judge_send(event, on_target) {
            Send::Allowed { expected } => stats.accepted_sends += usize::from(expected),
            Send::Forbidden(reason) => violations.push(Violation::new(event, reason)),
            Send::No => {
                if let Some(reason) = judge_file(event) {
                    violations.push(Violation::new(event, reason));
                }
            }
        }
    }
    if stats.connects != 1 {
        violations.push(Violation::new(
            &Event::default(),
            format!(
                "the healthcheck connected {} times, want exactly once",
                stats.connects
            ),
        ));
    }
    (violations, stats)
}

/// Whether `event` writes to a descriptor, and if so whether it is allowed and on the connection
/// `expected` names.
fn judge_send(event: &Event, expected: impl Fn(&Descriptor) -> bool) -> Send {
    if !SEND_CALLS.contains(&event.name.as_str()) {
        return Send::No;
    }
    if has_destination(event) {
        return Send::Forbidden("a send with an explicit destination address");
    }
    let descriptor = parse_descriptor(argument(event, 0));
    if descriptor.kind == KIND_UNANNOTATED {
        return Send::Forbidden("a write to a descriptor strace could not name");
    }
    if descriptor.is_socket() {
        if expected(&descriptor) {
            return Send::Allowed { expected: true };
        }
        return Send::Forbidden("a send on a socket that is not an allowed connection");
    }
    if descriptor.kind == KIND_PATH && !under_dev_or_proc(&descriptor.path) {
        return Send::Forbidden("a write to a file outside /dev and /proc");
    }
    Send::Allowed { expected: false }
}

fn has_destination(event: &Event) -> bool {
    match event.name.as_str() {
        "sendto" => {
            let address = argument(event, SENDTO_ADDRESS_ARG);
            !address.is_empty() && address != "NULL"
        }
        "sendmsg" | "sendmmsg" => argument(event, 1).contains("msg_name={"),
        _ => false,
    }
}

/// Why a filesystem call is a forbidden write, if it is one.
fn judge_file(event: &Event) -> Option<String> {
    let name = event.name.as_str();
    if OPEN_CALLS.contains(&name) {
        let flags = argument(event, if name == "open" { 1 } else { 2 });
        if !WRITE_FLAGS.is_match(flags) {
            return None;
        }
    } else if name == "bind" {
        return judge_unix_bind(event);
    } else if !PATH_WRITERS.contains(&name) {
        return None;
    }
    let names = paths(event);
    // A write that names no path strace could print -- a descriptor-relative call with a NULL
    // path, an unreadable pointer -- cannot be placed, so it is not allowed.
    if names.is_empty() {
        return Some(format!(
            "{name} with write intent on a path strace could not name"
        ));
    }
    names
        .iter()
        .find(|path| !under_dev_or_proc(path))
        .map(|path| format!("{name} with write intent on {path}, outside /dev and /proc"))
}

/// Binding a unix socket to a filesystem path is a write: it creates the node. An abstract
/// socket (`sun_path=@"..."`) has no node and is not a file write.
fn judge_unix_bind(event: &Event) -> Option<String> {
    let address = argument(event, 1);
    if !address.contains("sa_family=AF_UNIX") {
        return None;
    }
    let path = UNIX_PATH.captures(address)?.get(1)?.as_str();
    (!under_dev_or_proc(path))
        .then(|| format!("bind creates the socket node {path}, outside /dev and /proc"))
}

/// The filesystem paths a call names, each resolved against the directory descriptor before it
/// when it is relative. A relative path with no directory to resolve against comes back as is,
/// which [`under_dev_or_proc`] refuses.
fn paths(event: &Event) -> Vec<String> {
    let mut names = Vec::new();
    for (index, arg) in event.args.iter().enumerate() {
        let Some(bytes) = unquote(arg) else {
            continue;
        };
        let mut path = String::from_utf8_lossy(&bytes).into_owned();
        if !path.starts_with('/') && index > 0 {
            let dir = parse_descriptor(&event.args[index - 1]);
            if dir.kind == KIND_PATH {
                path = clean(&format!("{}/{path}", dir.path));
            }
        }
        names.push(clean(&path));
    }
    names
}

/// `path` cleaned lexically: `.` and empty elements dropped, `..` resolved against the elements
/// before it (at the root, dropped), the result `/`-rooted when the path was and `.` when empty.
fn clean(path: &str) -> String {
    let rooted = path.starts_with('/');
    let mut kept: Vec<&str> = Vec::new();
    for element in path.split('/') {
        match element {
            "" | "." => {}
            ".." => match kept.last() {
                Some(&last) if last != ".." => {
                    kept.pop();
                }
                _ if rooted => {}
                _ => kept.push(".."),
            },
            name => kept.push(name),
        }
    }
    match (rooted, kept.is_empty()) {
        (true, _) => format!("/{}", kept.join("/")),
        (false, true) => ".".to_owned(),
        (false, false) => kept.join("/"),
    }
}

/// Whether a path is under `/dev` or `/proc`, where a write changes no stored state -- except
/// `/dev/shm` and `/dev/mqueue`, which are writable tmpfs mounts even on a read-only root and
/// which `docker diff` does not show, so a write there would be stored state no other check sees.
fn under_dev_or_proc(name: &str) -> bool {
    if !name.starts_with('/') {
        return false;
    }
    let clean = clean(name);
    let under = |root: &str| {
        clean == root
            || clean
                .strip_prefix(root)
                .is_some_and(|rest| rest.starts_with('/'))
    };
    if under("/dev/shm") || under("/dev/mqueue") {
        return false;
    }
    under("/dev") || under("/proc")
}

/// Whether a descriptor is a TCP connection whose local end is the listen address: one that was
/// accepted, not dialed.
fn is_accepted_on(descriptor: &Descriptor, listen: SocketAddr) -> bool {
    let (Some(local), Some(_)) = (descriptor.local, descriptor.remote) else {
        return false;
    };
    if !descriptor.is_tcp() {
        return false;
    }
    let local = unmapped(local);
    local.port() == listen.port()
        && (listen.ip().is_unspecified() || local.ip() == unmap(listen.ip()))
}

fn argument(event: &Event, index: usize) -> &str {
    event.args.get(index).map_or("", String::as_str)
}
