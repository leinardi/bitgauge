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

//! The network namespace BitGauge runs in during the image suite and the accuracy harness, with
//! a count of every packet that tries to leave it (testing.md section 5; Go's
//! `test/internal/netguard`).
//!
//! A holder container from the tools image starts on a Docker network with no route out. Before
//! anything else joins its namespace it installs nftables counters on the output hook, adds a
//! sink dummy interface with IPv4 and IPv6 default routes so that every non-local destination is
//! routable -- a packet then reaches the hook and is counted and dropped, instead of `connect()`
//! failing with "network unreachable" before any hook sees it -- runs four negative controls that
//! must each increment their counter, and resets the counters. BitGauge then joins with
//! `--network container:<holder>`, so its traffic is observed from process start.
//!
//! The claim is no packet egress. An attempt that fails before a packet is built is invisible
//! here; the image suite's syscall layer is what sees those.
//!
//! The command lists, the counter parsing and the tools image tag are pure and unit-tested; only
//! [`build_tools_image`] and [`start`] talk to Docker.

use std::collections::BTreeMap;
use std::fmt::{self, Write as _};
use std::fs;
use std::path::Path;
use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest as _, Sha256};

use crate::docker::Runner;
use crate::env::{Env, EnvError};

/// Counts new connections on any interface but loopback.
pub const EGRESS: &str = "egress";
/// Counts loopback traffic to Docker's embedded DNS, 127.0.0.11:53. BitGauge does no lookups.
pub const DNS: &str = "dns";
/// Counts new loopback connections other than to the listen port.
pub const LOOPBACK: &str = "loopback";

/// The three counters.
pub const COUNTERS: [&str; 3] = [EGRESS, DNS, LOOPBACK];

const TABLE: &str = "netguard";
const CONTROL_PORT: u16 = 9;
const TOOLS_REPO: &str = "bitgauge-test-tools";
/// The tools image's build context, relative to the repository root.
pub const TOOLS_CONTEXT: &str = "test/harness";
/// The tools image's Dockerfile, relative to the repository root.
pub const TOOLS_FILE: &str = "test/harness/tools.Dockerfile";
/// The bound on each command run in the holder.
const EXEC_TIMEOUT: Duration = Duration::from_mins(1);
/// Hex characters of the Dockerfile's sha256 in the tools image tag.
const TAG_HEX: usize = 16;

/// What can go wrong building, preparing or reading a guard.
#[derive(Debug)]
pub enum NetguardError {
    /// The tools Dockerfile cannot be read.
    ReadDockerfile(std::io::Error),
    /// A docker command failed.
    Env {
        /// What was being done.
        context: String,
        /// The environment's error.
        source: EnvError,
    },
    /// A negative control did not increment its counter: the guard would not have seen the
    /// traffic it exists to see.
    InstrumentBlind {
        /// The control.
        control: &'static str,
        /// The counter it should have moved.
        counter: &'static str,
    },
    /// `nft --json list counters` printed something this cannot read.
    Counters(String),
}

impl fmt::Display for NetguardError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ReadDockerfile(error) => write!(formatter, "read {TOOLS_FILE}: {error}"),
            Self::Env { context, source } => write!(formatter, "{context}: {source}"),
            Self::InstrumentBlind { control, counter } => write!(
                formatter,
                "instrument blind: {control} did not increment the {counter} counter"
            ),
            Self::Counters(detail) => write!(formatter, "unreadable nft counters: {detail}"),
        }
    }
}

impl std::error::Error for NetguardError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::ReadDockerfile(error) => Some(error),
            Self::Env { source, .. } => Some(source),
            Self::InstrumentBlind { .. } | Self::Counters(_) => None,
        }
    }
}

fn env_error(context: impl Into<String>) -> impl FnOnce(EnvError) -> NetguardError {
    let context = context.into();
    move |source| NetguardError::Env { context, source }
}

/// The packet counts of the three named counters.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Counters(pub BTreeMap<String, u64>);

impl Counters {
    /// Whether no counter has counted anything.
    #[must_use]
    pub fn zero(&self) -> bool {
        self.0.values().all(|&packets| packets == 0)
    }

    /// The count of one counter, 0 when it is absent.
    #[must_use]
    pub fn get(&self, name: &str) -> u64 {
        self.0.get(name).copied().unwrap_or_default()
    }
}

impl fmt::Display for Counters {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}", self.0)
    }
}

/// Configures one guard.
#[derive(Debug, Clone, Default)]
pub struct Options {
    /// The image [`build_tools_image`] returned.
    pub tools_image: String,
    /// The `--internal` network the holder starts on.
    pub network: String,
    /// BitGauge's listen port, the one loopback destination that is not counted: the
    /// healthcheck connects to it.
    pub listen_port: u16,
    /// Leaves the sink without default routes. Only for the negative test that shows the
    /// controls catch a guard that cannot see; never set it otherwise.
    pub without_sink_routes: bool,
}

/// A prepared holder whose namespace BitGauge can join.
#[derive(Debug, Clone)]
pub struct Guard {
    /// The holder container's name.
    pub name: String,
    env: Env,
}

/// The tag of the tools image built from `dockerfile`: `bitgauge-test-tools:<16 hex>` of its
/// sha256, so a changed Dockerfile is never answered by a stale image.
#[must_use]
pub fn tools_image_tag(dockerfile: &[u8]) -> String {
    let sum = Sha256::digest(dockerfile);
    let mut hex = String::with_capacity(TAG_HEX);
    for byte in sum.iter().take(TAG_HEX / 2) {
        let _ = write!(hex, "{byte:02x}");
    }
    format!("{TOOLS_REPO}:{hex}")
}

/// Builds `test/harness/tools.Dockerfile` under `repo_root`, tagged by [`tools_image_tag`], and
/// returns the tag.
///
/// # Errors
///
/// The Dockerfile cannot be read, or the build fails.
pub fn build_tools_image(runner: &dyn Runner, repo_root: &Path) -> Result<String, NetguardError> {
    let file = repo_root.join(TOOLS_FILE);
    let dockerfile = fs::read(&file).map_err(NetguardError::ReadDockerfile)?;
    let tag = tools_image_tag(&dockerfile);
    let file = file.to_string_lossy();
    let build_context = repo_root.join(TOOLS_CONTEXT);
    let build_context = build_context.to_string_lossy();
    runner
        .run(&[
            "build",
            "--quiet",
            "--tag",
            &tag,
            "--file",
            &file,
            &build_context,
        ])
        .map_err(|source| NetguardError::Env {
            context: "build the tools image".to_owned(),
            source: EnvError::Docker {
                context: "tools image".to_owned(),
                source,
            },
        })?;
    Ok(tag)
}

/// The commands that prepare the holder, one per line, split on spaces: nft and ip join their
/// arguments back into one statement. Priority -150 puts the chain after conntrack (-200), so
/// `ct state` is known, and before Docker's DNAT of 127.0.0.11:53 (-100), so the DNS destination
/// is still the original.
#[must_use]
pub fn setup_commands(listen_port: u16, sink_routes: bool) -> Vec<String> {
    let mut setup = vec![
        format!("nft add table inet {TABLE}"),
        format!("nft add counter inet {TABLE} {EGRESS}"),
        format!("nft add counter inet {TABLE} {DNS}"),
        format!("nft add counter inet {TABLE} {LOOPBACK}"),
        format!(
            "nft add chain inet {TABLE} output {{ type filter hook output priority -150 ; policy accept ; }}"
        ),
        format!(
            r#"nft add rule inet {TABLE} output oifname != "lo" ct state new counter name {EGRESS} drop"#
        ),
        format!(
            r#"nft add rule inet {TABLE} output oifname "lo" ip daddr 127.0.0.11 meta l4proto {{ tcp, udp }} th dport 53 counter name {DNS} accept"#
        ),
        format!(
            r#"nft add rule inet {TABLE} output oifname "lo" ct state new tcp dport {listen_port} accept"#
        ),
        format!(
            r#"nft add rule inet {TABLE} output oifname "lo" ct state new counter name {LOOPBACK}"#
        ),
        "ip link add sink type dummy".to_owned(),
        "ip link set sink up".to_owned(),
    ];
    if sink_routes {
        setup.push("ip route add default dev sink".to_owned());
        setup.push("ip -6 route add default dev sink".to_owned());
    }
    setup
}

/// One negative control: a command run inside the namespace, and the counter it must increment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Control {
    /// What it does.
    pub name: &'static str,
    /// The counter it must move.
    pub counter: &'static str,
    /// The command.
    pub command: Vec<String>,
}

/// The four negative controls. Their TCP port is 9 (discard), or 10 when that is the listen
/// port, which is not counted.
#[must_use]
pub fn controls(listen_port: u16) -> Vec<Control> {
    let port = if listen_port == CONTROL_PORT {
        CONTROL_PORT + 1
    } else {
        CONTROL_PORT
    };
    let tcp = |address: &str| iperf3(address, port);
    vec![
        Control {
            name: "TCP to a routed TEST-NET address",
            counter: EGRESS,
            command: tcp("192.0.2.1"),
        },
        Control {
            name: "TCP to an otherwise unroutable IPv6 address",
            counter: EGRESS,
            command: tcp("2001:db8::1"),
        },
        Control {
            name: "a DNS lookup through the embedded DNS",
            counter: DNS,
            command: ["nslookup", "netguard.invalid", "127.0.0.11"]
                .map(str::to_owned)
                .to_vec(),
        },
        Control {
            name: "TCP to an unused loopback port",
            counter: LOOPBACK,
            command: tcp("127.0.0.1"),
        },
    ]
}

/// An iperf3 client that tries `address:port` for one second.
#[must_use]
pub fn iperf3(address: &str, port: u16) -> Vec<String> {
    [
        "iperf3",
        "--client",
        address,
        "--port",
        &port.to_string(),
        "--connect-timeout",
        "500",
        "--time",
        "1",
    ]
    .map(str::to_owned)
    .to_vec()
}

/// Reads `nft --json list counters`: the packets of each named counter. All three must be there.
///
/// # Errors
///
/// [`NetguardError::Counters`] for JSON this cannot read or a missing counter.
pub fn parse_counters(json: &str) -> Result<Counters, NetguardError> {
    #[derive(Deserialize)]
    struct Listing {
        nftables: Vec<BTreeMap<String, serde_json::Value>>,
    }
    #[derive(Deserialize)]
    struct Counter {
        name: String,
        packets: u64,
    }
    let listing: Listing =
        serde_json::from_str(json).map_err(|error| NetguardError::Counters(error.to_string()))?;
    let mut counters = BTreeMap::new();
    for entry in listing.nftables {
        let Some(raw) = entry.get("counter") else {
            continue;
        };
        let counter = Counter::deserialize(raw)
            .map_err(|error| NetguardError::Counters(error.to_string()))?;
        counters.insert(counter.name, counter.packets);
    }
    for name in COUNTERS {
        if !counters.contains_key(name) {
            return Err(NetguardError::Counters(format!(
                "no {name} counter in {json}"
            )));
        }
    }
    Ok(Counters(counters))
}

/// Brings a holder up on `options.network` and prepares it: rules, sink, controls, reset. On an
/// error the holder is left to the environment's cleanup.
///
/// # Errors
///
/// A docker command failed, or [`NetguardError::InstrumentBlind`] when a control was not seen.
pub fn start(env: &Env, options: &Options) -> Result<Guard, NetguardError> {
    let guard = Guard {
        name: env.name("netguard"),
        env: env.clone(),
    };
    env.docker(&[
        "run",
        "--detach",
        "--name",
        &guard.name,
        "--network",
        &options.network,
        "--cap-drop",
        "ALL",
        "--cap-add",
        "NET_ADMIN",
        // Docker disables IPv6 in a container on a network without it; the IPv6 control needs
        // it.
        "--sysctl",
        "net.ipv6.conf.all.disable_ipv6=0",
        &options.tools_image,
        "sleep",
        "infinity",
    ])
    .map_err(env_error("start the holder"))?;
    for command in setup_commands(options.listen_port, !options.without_sink_routes) {
        let words: Vec<&str> = command.split_whitespace().collect();
        guard.exec(&words).map_err(prepare_error)?;
    }
    guard.run_controls(options.listen_port)?;
    guard.reset()?;
    Ok(guard)
}

/// An error of the holder's preparation, saying so.
fn prepare_error(error: NetguardError) -> NetguardError {
    match error {
        NetguardError::Env { context, source } => NetguardError::Env {
            context: format!("prepare the holder: {context}"),
            source,
        },
        other @ (NetguardError::ReadDockerfile(_)
        | NetguardError::InstrumentBlind { .. }
        | NetguardError::Counters(_)) => other,
    }
}

impl Guard {
    /// The `--network` value that joins the guard's namespace.
    #[must_use]
    pub fn network_mode(&self) -> String {
        format!("container:{}", self.name)
    }

    /// Reads the three counters.
    ///
    /// # Errors
    ///
    /// The command failed or printed counters this cannot read.
    pub fn counters(&self) -> Result<Counters, NetguardError> {
        let out = self.exec(&["nft", "--json", "list", "counters", "table", "inet", TABLE])?;
        parse_counters(&out)
    }

    /// Zeroes the counters.
    ///
    /// # Errors
    ///
    /// The command failed.
    pub fn reset(&self) -> Result<(), NetguardError> {
        self.exec(&["nft", "reset", "counters", "table", "inet", TABLE])
            .map(drop)
    }

    /// Runs a command inside the guard's namespace, from the holder, within a minute, and
    /// returns its standard output.
    ///
    /// # Errors
    ///
    /// The command failed or timed out.
    pub fn exec(&self, command: &[&str]) -> Result<String, NetguardError> {
        let args: Vec<&str> = ["exec", self.name.as_str()]
            .into_iter()
            .chain(command.iter().copied())
            .collect();
        self.env
            .docker_timeout(&args, Some(EXEC_TIMEOUT))
            .map_err(env_error(format!("{command:?} in the holder")))
    }

    /// Runs each control on zeroed counters and fails as instrument blind when one leaves its
    /// counter at zero.
    fn run_controls(&self, listen_port: u16) -> Result<(), NetguardError> {
        for control in controls(listen_port) {
            self.reset()?;
            // The control is expected to fail -- nothing answers -- so only the counter says
            // whether it was seen.
            let words: Vec<&str> = control.command.iter().map(String::as_str).collect();
            let _ = self.exec(&words);
            if self.counters()?.get(control.counter) == 0 {
                return Err(NetguardError::InstrumentBlind {
                    control: control.name,
                    counter: control.counter,
                });
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        COUNTERS, DNS, EGRESS, LOOPBACK, NetguardError, controls, parse_counters, setup_commands,
        tools_image_tag,
    };

    /// The tag is the first 16 hex characters of the Dockerfile's sha256, so a changed file is
    /// never answered by a stale image.
    #[test]
    fn tools_image_tag_hashes_the_dockerfile() {
        assert_eq!(tools_image_tag(b""), "bitgauge-test-tools:e3b0c44298fc1c14");
        assert_ne!(tools_image_tag(b"FROM a\n"), tools_image_tag(b"FROM b\n"));
    }

    /// Each control names the counter it must move, all three counters are covered, and a
    /// listen port of 9 moves the controls to 10, since the listen port is not counted.
    #[test]
    fn controls_cover_every_counter() {
        let on_8080 = controls(8080);
        let counters: Vec<&str> = on_8080.iter().map(|control| control.counter).collect();
        assert_eq!(counters, [EGRESS, EGRESS, DNS, LOOPBACK]);
        assert!(COUNTERS.iter().all(|counter| counters.contains(counter)));
        let ports = |listen: u16| -> Vec<String> {
            controls(listen)
                .into_iter()
                .filter(|control| control.command[0] == "iperf3")
                .map(|control| control.command[4].clone())
                .collect()
        };
        assert_eq!(ports(8080), ["9", "9", "9"]);
        assert_eq!(ports(9), ["10", "10", "10"]);
    }

    /// The setup lets only the listen port through on loopback, and only the sink routes make
    /// non-local destinations reach the hook: without them the guard is blind, which the
    /// controls catch under Docker.
    #[test]
    fn setup_commands_route_through_the_sink() {
        let setup = setup_commands(8080, true);
        assert!(setup.contains(
            &r#"nft add rule inet netguard output oifname "lo" ct state new tcp dport 8080 accept"#
                .to_owned()
        ));
        assert!(setup.ends_with(&[
            "ip route add default dev sink".to_owned(),
            "ip -6 route add default dev sink".to_owned()
        ]));
        let blind = setup_commands(8080, false);
        assert_eq!(blind.len() + 2, setup.len());
        assert!(!blind.iter().any(|command| command.contains("route")));
    }

    /// The counters are read from nft's JSON; a missing counter or unreadable JSON is an error,
    /// never a zero.
    #[test]
    fn parse_counters_reads_nft_json() {
        let listing = r#"{"nftables": [
            {"metainfo": {"version": "1.1.1", "json_schema_version": 1}},
            {"counter": {"family": "inet", "name": "egress", "table": "netguard", "handle": 1, "packets": 3, "bytes": 180}},
            {"counter": {"family": "inet", "name": "dns", "table": "netguard", "handle": 2, "packets": 0, "bytes": 0}},
            {"counter": {"family": "inet", "name": "loopback", "table": "netguard", "handle": 3, "packets": 1, "bytes": 60}}
        ]}"#;
        let counters = parse_counters(listing).unwrap();
        assert_eq!(
            (
                counters.get(EGRESS),
                counters.get(DNS),
                counters.get(LOOPBACK)
            ),
            (3, 0, 1)
        );
        assert!(!counters.zero());
        let without_dns = listing.replace(r#""name": "dns""#, r#""name": "other""#);
        let error = parse_counters(&without_dns).unwrap_err();
        assert!(
            matches!(&error, NetguardError::Counters(detail) if detail.starts_with("no dns counter")),
            "{error}"
        );
        assert!(parse_counters("not json").is_err());
        let zeroed = listing
            .replace(r#""packets": 3"#, r#""packets": 0"#)
            .replace(r#""packets": 1"#, r#""packets": 0"#);
        assert!(parse_counters(&zeroed).unwrap().zero());
    }
}
