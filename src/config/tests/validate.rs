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

//! Validation, the problems `check` collects and the warnings.

use jiff::SignedDuration;

use super::{load, problem_keys, problems_for};
use crate::config::{
    Cidr, Config, DurationRange, EXIT_INVALID_CONFIG, PresetValues, check, preset, validate,
    warnings,
};

fn cidr(text: &str) -> Cidr {
    text.parse().expect("a CIDR")
}

/// Go: `TestRulesOfSection4`. One row per rule of configuration.md section 4, using the table's
/// own rejected examples, and rows for every range of section 2.
#[test]
#[expect(
    clippy::too_many_lines,
    reason = "one row per rule, as the Go table has"
)]
fn rules_of_section_4() {
    let cases: Vec<(&str, String, &[&str], &[&str])> = vec![
        (
            "unknown key in the file",
            String::from("server:\n  lisen: \":8080\"\n"),
            &[],
            &["server.lisen"],
        ),
        (
            "unknown key in the environment",
            String::new(),
            &["BITGAUGE_SERVER__LISTN=:8080"],
            &["server.listn"],
        ),
        (
            "size in words",
            String::from("limits:\n  max_upload_bytes: 256 megs\n"),
            &[],
            &["limits.max_upload_bytes"],
        ),
        (
            "enum outside its values",
            String::from("test_defaults:\n  units: nibbles\n"),
            &[],
            &["test_defaults.units"],
        ),
        (
            "CIDR beyond /32",
            String::from("server:\n  trusted_proxies: [10.0.0.0/33]\n"),
            &[],
            &["server.trusted_proxies[0]"],
        ),
        (
            "host name as a CIDR",
            String::from("server:\n  trusted_proxies: [proxy.lan]\n"),
            &[],
            &["server.trusted_proxies[0]"],
        ),
        (
            "IPv4-mapped trusted proxy",
            String::from("server:\n  trusted_proxies: [\"::ffff:127.0.0.2/128\"]\n"),
            &[],
            &["server.trusted_proxies[0]"],
        ),
        (
            "networkQuality behind only an IPv4-mapped trusted proxy",
            [
                "server:\n  trusted_proxies: [\"::ffff:127.0.0.2/128\"]\n",
                "compat:\n  networkquality: {enabled: true}\n",
            ]
            .concat(),
            &[],
            &["server.trusted_proxies[0]"],
        ),
        (
            "port 0",
            String::from("server:\n  listen: \":0\"\n"),
            &[],
            &["server.listen"],
        ),
        (
            "port 70000",
            String::from("server:\n  listen: \":70000\"\n"),
            &[],
            &["server.listen"],
        ),
        (
            "base path with a leading empty segment",
            String::from("server:\n  base_path: //speed\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "base path with an inner empty segment",
            String::from("server:\n  base_path: /a//b\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "metrics path with an empty segment",
            String::from("metrics:\n  path: //metrics\n"),
            &[],
            &["metrics.path"],
        ),
        (
            "relative base path",
            String::from("server:\n  base_path: speed\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "trailing slash",
            String::from("server:\n  base_path: /speed/\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "dot-dot segment",
            String::from("server:\n  base_path: /a/../b\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "dot segment",
            String::from("server:\n  base_path: /a/./b\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "query in the base path",
            String::from("server:\n  base_path: /speed?x=1\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "fragment in the base path",
            String::from("server:\n  base_path: \"/speed#top\"\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "space in the base path",
            String::from("server:\n  base_path: /my speed\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "empty base path",
            String::from("server:\n  base_path: \"\"\n"),
            &[],
            &["server.base_path"],
        ),
        (
            "public url without a scheme",
            String::from("server:\n  public_url: speed.example.lan\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a path",
            String::from("server:\n  public_url: https://x/speed\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a trailing slash",
            String::from("server:\n  public_url: https://x/\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a query",
            String::from("server:\n  public_url: https://x?a=1\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a fragment",
            String::from("server:\n  public_url: \"https://x#a\"\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a user",
            String::from("server:\n  public_url: https://user@x\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url over ftp",
            String::from("server:\n  public_url: ftp://x\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a port out of range",
            String::from("server:\n  public_url: https://x:99999\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with port 0",
            String::from("server:\n  public_url: https://x:0\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with an empty port",
            String::from("server:\n  public_url: \"https://x:\"\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with a wildcard host",
            String::from("server:\n  public_url: \"https://*.x.com\"\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "public url with an underscore host",
            String::from("server:\n  public_url: https://a_b.lan\n"),
            &[],
            &["server.public_url"],
        ),
        (
            "CORS origin with a port out of range",
            String::from("server:\n  cors:\n    allowed_origins: [https://x:99999]\n"),
            &[],
            &["server.cors.allowed_origins[0]"],
        ),
        (
            "CORS origin with an empty port",
            String::from("server:\n  cors:\n    allowed_origins: [\"https://x:\"]\n"),
            &[],
            &["server.cors.allowed_origins[0]"],
        ),
        (
            "CORS origin with a wildcard host",
            String::from("server:\n  cors:\n    allowed_origins: [\"https://*.x.com\"]\n"),
            &[],
            &["server.cors.allowed_origins[0]"],
        ),
        (
            "CORS star",
            String::from("server:\n  cors:\n    allowed_origins: [\"*\"]\n"),
            &[],
            &["server.cors.allowed_origins[0]"],
        ),
        (
            "CORS origin with a path",
            String::from(
                "server:\n  cors:\n    allowed_origins: [https://ok.lan, https://x/path]\n",
            ),
            &[],
            &["server.cors.allowed_origins[1]"],
        ),
        (
            "empty CORS origin",
            String::new(),
            &["BITGAUGE_SERVER__CORS__ALLOWED_ORIGINS=https://a.lan,"],
            &["server.cors.allowed_origins[1]"],
        ),
        (
            "download cap below 64 KiB",
            String::from("limits:\n  max_download_bytes: 32KiB\n"),
            &[],
            &["limits.max_download_bytes"],
        ),
        (
            "upload cap below 64 KiB",
            String::from("limits:\n  max_upload_bytes: 32KiB\n"),
            &[],
            &["limits.max_upload_bytes"],
        ),
        (
            "download cap above 4 GiB",
            String::from("limits:\n  max_download_bytes: 5GiB\n"),
            &[],
            &["limits.max_download_bytes"],
        ),
        (
            "streams per client 0",
            String::from("limits:\n  max_streams_per_client: 0\n"),
            &[],
            &["limits.max_streams_per_client", "test_defaults.streams.max"],
        ),
        (
            "streams per client 65",
            String::from("limits:\n  max_streams_per_client: 65\n"),
            &[],
            &["limits.max_streams_per_client"],
        ),
        (
            "requests per minute 59",
            String::from("limits:\n  requests_per_minute: 59\n"),
            &[],
            &["limits.requests_per_minute"],
        ),
        (
            "requests per minute 100001",
            String::from("limits:\n  requests_per_minute: 100001\n"),
            &[],
            &["limits.requests_per_minute"],
        ),
        (
            "tracked clients 15",
            String::from("limits:\n  tracked_clients: 15\n"),
            &[],
            &["limits.tracked_clients"],
        ),
        (
            "tracked clients 1000001",
            String::from("limits:\n  tracked_clients: 1000001\n"),
            &[],
            &["limits.tracked_clients"],
        ),
        (
            "networkQuality drain below 1 MiB",
            String::from("compat:\n  networkquality:\n    max_upload_bytes: 512KiB\n"),
            &[],
            &["compat.networkquality.max_upload_bytes"],
        ),
        (
            "networkQuality drain above 64 GiB",
            String::from("compat:\n  networkquality:\n    max_upload_bytes: 65GiB\n"),
            &[],
            &["compat.networkquality.max_upload_bytes"],
        ),
        (
            "networkQuality flows 0",
            String::from("compat:\n  networkquality:\n    max_flows_per_client: 0\n"),
            &[],
            &["compat.networkquality.max_flows_per_client"],
        ),
        (
            "networkQuality flows 257",
            String::from("compat:\n  networkquality:\n    max_flows_per_client: 257\n"),
            &[],
            &["compat.networkquality.max_flows_per_client"],
        ),
        (
            "empty display name",
            String::from("server:\n  display_name: \"\"\n"),
            &[],
            &["server.display_name"],
        ),
        (
            "display name of 65 characters",
            ["server:\n  display_name: ", "x".repeat(65).as_str(), "\n"].concat(),
            &[],
            &["server.display_name"],
        ),
        (
            "display name with a control character",
            String::from("server:\n  display_name: \"a\\tb\"\n"),
            &[],
            &["server.display_name"],
        ),
        (
            "unknown preset",
            String::from("test_defaults:\n  preset: turbo\n"),
            &[],
            &["test_defaults.preset"],
        ),
        (
            "unknown streams mode",
            String::from("test_defaults:\n  streams:\n    mode: many\n"),
            &[],
            &["test_defaults.streams.mode"],
        ),
        (
            "streams max 7",
            String::from("test_defaults:\n  streams:\n    max: 7\n"),
            &[],
            &["test_defaults.streams.max"],
        ),
        (
            "streams max 0",
            String::from("test_defaults:\n  streams:\n    max: 0\n"),
            &[],
            &["test_defaults.streams.max", "test_defaults.streams.fixed"],
        ),
        (
            "streams max above the per-client limit",
            String::from(
                "limits:\n  max_streams_per_client: 4\ntest_defaults:\n  streams:\n    max: 6\n    fixed: 3\n",
            ),
            &[],
            &["test_defaults.streams.max"],
        ),
        (
            "streams.max 8 with max_streams_per_client 4",
            String::from(
                "limits:\n  max_streams_per_client: 4\ntest_defaults:\n  streams:\n    max: 8\n",
            ),
            &[],
            &["test_defaults.streams.max", "test_defaults.streams.max"],
        ),
        (
            "fixed streams above max",
            String::from("test_defaults:\n  streams:\n    fixed: 7\n"),
            &[],
            &["test_defaults.streams.fixed"],
        ),
        (
            "fixed streams 0",
            String::from("test_defaults:\n  streams:\n    fixed: 0\n"),
            &[],
            &["test_defaults.streams.fixed"],
        ),
        (
            "download min below 5 s",
            String::from("test_defaults:\n  download:\n    min_duration: 4s\n"),
            &[],
            &["test_defaults.download.min_duration"],
        ),
        (
            "upload min above 10 m",
            String::from(
                "test_defaults:\n  upload:\n    min_duration: 11m\n    max_duration: 10m\n",
            ),
            &[],
            &[
                "test_defaults.upload.min_duration",
                "test_defaults.upload.max_duration",
            ],
        ),
        (
            "download max above 10 m",
            String::from("test_defaults:\n  download:\n    max_duration: 11m\n"),
            &[],
            &["test_defaults.download.max_duration"],
        ),
        (
            "data cap below 1 MiB",
            String::from("test_defaults:\n  data_cap: 512KiB\n"),
            &[],
            &["test_defaults.data_cap"],
        ),
        (
            "unknown units",
            String::from("test_defaults:\n  units: nibbles\n"),
            &[],
            &["test_defaults.units"],
        ),
        (
            "fixed warm-up below 1 s",
            String::from("test_defaults:\n  warmup: 500ms\n"),
            &[],
            &["test_defaults.warmup"],
        ),
        (
            "fixed warm-up above 60 s",
            String::from("test_defaults:\n  warmup: 61s\n"),
            &[],
            &["test_defaults.warmup"],
        ),
        (
            "ping count 5",
            String::from("test_defaults:\n  ping_count: 5\n"),
            &[],
            &["test_defaults.ping_count"],
        ),
        (
            "ping count 201",
            String::from("test_defaults:\n  ping_count: 201\n"),
            &[],
            &["test_defaults.ping_count"],
        ),
        (
            "negative overhead",
            String::from("test_defaults:\n  overhead_compensation_percent: -1\n"),
            &[],
            &["test_defaults.overhead_compensation_percent"],
        ),
        (
            "overhead above 20",
            String::from("test_defaults:\n  overhead_compensation_percent: 20.5\n"),
            &[],
            &["test_defaults.overhead_compensation_percent"],
        ),
        (
            "unknown log format",
            String::from("log:\n  format: logfmt\n"),
            &[],
            &["log.format"],
        ),
        (
            "unknown log level",
            String::from("log:\n  level: verbose\n"),
            &[],
            &["log.level"],
        ),
        (
            "label CIDR with host bits",
            String::from("server:\n  labels:\n    - {cidr: 10.0.0.1/8, label: LAN}\n"),
            &[],
            &["server.labels[0].cidr"],
        ),
        (
            "IPv4-mapped label CIDR",
            String::from("server:\n  labels:\n    - {cidr: \"::ffff:10.8.0.0/120\", label: VPN}\n"),
            &[],
            &["server.labels[0].cidr"],
        ),
        (
            "duplicate label CIDR",
            [
                "server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: VPN}\n",
                "    - {cidr: 10.8.0.0/24, label: WireGuard}\n",
            ]
            .concat(),
            &[],
            &["server.labels[1].cidr"],
        ),
        (
            "label of 65 characters",
            [
                "server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: ",
                "v".repeat(65).as_str(),
                "}\n",
            ]
            .concat(),
            &[],
            &["server.labels[0].label"],
        ),
        (
            "empty label",
            String::from("server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: \"\"}\n"),
            &[],
            &["server.labels[0].label"],
        ),
        (
            "label entry without its CIDR",
            String::from("server:\n  labels:\n    - {label: VPN}\n"),
            &[],
            &["server.labels[0].cidr"],
        ),
        (
            "label CIDR that does not parse",
            String::from("server:\n  labels:\n    - {cidr: 10.8.0.0, label: VPN}\n"),
            &[],
            &["server.labels[0].cidr"],
        ),
        (
            "label entry with an unknown key",
            String::from("server:\n  labels:\n    - {cidr: 10.8.0.0/24, lable: VPN}\n"),
            &[],
            &["server.labels[0].lable", "server.labels[0].label"],
        ),
        (
            "label entry written as text in the file",
            String::from("server:\n  labels: [\"10.8.0.0/24=VPN\"]\n"),
            &[],
            &["server.labels[0]"],
        ),
        (
            "environment label item without =",
            String::new(),
            &["BITGAUGE_SERVER__LABELS=10.8.0.0/24=VPN,10.9.0.0/24"],
            &["server.labels[1]"],
        ),
        (
            "environment label item with host bits",
            String::new(),
            &["BITGAUGE_SERVER__LABELS=10.8.0.1/24=VPN"],
            &["server.labels[0].cidr"],
        ),
        (
            "relative metrics path",
            String::from("metrics:\n  path: metrics\n"),
            &[],
            &["metrics.path"],
        ),
        (
            "metrics path with a trailing slash",
            String::from("metrics:\n  path: /metrics/\n"),
            &[],
            &["metrics.path"],
        ),
        (
            "idle after download",
            String::from("test_defaults:\n  phases: [download, idle]\n"),
            &[],
            &["test_defaults.phases"],
        ),
        (
            "no phase",
            String::from("test_defaults:\n  phases: []\n"),
            &[],
            &["test_defaults.phases"],
        ),
        (
            "duplicate phase",
            String::from("test_defaults:\n  phases: [download, download]\n"),
            &[],
            &["test_defaults.phases"],
        ),
        (
            "unknown phase",
            String::from("test_defaults:\n  phases: [info, download]\n"),
            &[],
            &["test_defaults.phases"],
        ),
        (
            "min 30s max 20s",
            String::from(
                "test_defaults:\n  download:\n    min_duration: 30s\n    max_duration: 20s\n",
            ),
            &[],
            &["test_defaults.download.max_duration"],
        ),
        (
            "min above the preset's max",
            String::from("test_defaults:\n  upload:\n    min_duration: 30s\n"),
            &[],
            &["test_defaults.upload.min_duration"],
        ),
        (
            "max below the preset's min",
            String::from(
                "test_defaults:\n  preset: extended\n  download:\n    max_duration: 15s\n",
            ),
            &[],
            &["test_defaults.download.max_duration"],
        ),
        (
            "OpenSpeedTest with a download cap under 30 MiB",
            String::from(
                "compat:\n  openspeedtest:\n    enabled: true\nlimits:\n  max_download_bytes: 16MiB\n",
            ),
            &[],
            &["limits.max_download_bytes"],
        ),
        (
            "OpenSpeedTest with an upload cap under 35 MiB",
            String::new(),
            &[
                "BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED=true",
                "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=36700159",
            ],
            &["limits.max_upload_bytes"],
        ),
        (
            "LibreSpeed with a download cap under one chunk",
            String::new(),
            &[
                "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=true",
                "BITGAUGE_LIMITS__MAX_DOWNLOAD_BYTES=1048575",
            ],
            &["limits.max_download_bytes"],
        ),
        (
            "networkQuality without public_url or a trusted proxy",
            String::from("compat:\n  networkquality:\n    enabled: true\n"),
            &[],
            &["compat.networkquality.enabled"],
        ),
        (
            "networkQuality with an http public_url",
            [
                "server:\n  public_url: http://speed.lan\n  trusted_proxies: [172.20.0.2/32]\n",
                "compat:\n  networkquality:\n    enabled: true\n",
            ]
            .concat(),
            &[],
            &["compat.networkquality.enabled"],
        ),
        (
            "Continuous with min 30s max 20s",
            String::from(
                "test_defaults:\n  preset: continuous\n  download:\n    min_duration: 30s\n    max_duration: 20s\n",
            ),
            &[],
            &["test_defaults.download.max_duration"],
        ),
        (
            "Continuous with a duration out of range",
            String::from(
                "test_defaults:\n  preset: continuous\n  upload:\n    max_duration: 11m\n",
            ),
            &[],
            &["test_defaults.upload.max_duration"],
        ),
    ];
    for (name, file, entries, want) in cases {
        let file = if file.is_empty() {
            "{}\n".to_owned()
        } else {
            file
        };
        let problems = problems_for(&file, entries);
        assert_eq!(problem_keys(&problems), want, "{name}: {problems:?}");
        for problem in &problems {
            let may_be_empty = ["server.base_path", "server.display_name"]
                .contains(&problem.key.as_str())
                || problem.key.starts_with("server.cors")
                || problem.key.starts_with("server.labels");
            assert!(
                !problem.rule.is_empty() && (!problem.value.is_empty() || may_be_empty),
                "{name}: problem without a value or a rule: {problem:?}"
            );
        }
    }
}

/// Go: `TestBoundariesAreAccepted`
#[test]
#[expect(clippy::too_many_lines, reason = "the Go test's files, kept whole")]
fn boundaries_are_accepted() {
    let wide = "é".repeat(64);
    let files = [
        (
            "lowest values",
            r#"
server:
  listen: ":1"
  display_name: x
limits:
  max_download_bytes: 64KiB
  max_upload_bytes: 65536
  max_streams_per_client: 1
  requests_per_minute: 60
  tracked_clients: 16
test_defaults:
  preset: quick
  phases: [upload]
  streams: {mode: single, fixed: 1, max: 1}
  download: {min_duration: 5s, max_duration: 5s}
  upload: {min_duration: 5s, max_duration: 5s}
  data_cap: 1MiB
  units: bytes
  warmup: 1s
  ping_count: 6
  overhead_compensation_percent: 0
compat:
  networkquality: {max_upload_bytes: 1MiB, max_flows_per_client: 1}
"#
            .to_owned(),
        ),
        (
            "highest values",
            format!(
                r#"
server:
  listen: "[::1]:65535"
  base_path: /a-b.c_d~e/f
  display_name: {wide}
  public_url: http://speed.example.lan:8443
  trusted_proxies: [172.20.0.2/32, "fd00::2/128", 127.0.0.2/32]
  labels:
    - {{cidr: 10.0.0.0/8, label: LAN}}
    - {{cidr: 10.8.0.0/24, label: {wide}}}
    - {{cidr: "fd7a:115c:a1e0::/48", label: Tailscale}}
  cors: {{allowed_origins: ["https://a.lan", "http://[::1]:5173", "http://10.0.0.1:1", "https://A-b.lan:65535"]}}
limits:
  max_download_bytes: 4GiB
  max_upload_bytes: 4GiB
  max_streams_per_client: 64
  requests_per_minute: 100000
  tracked_clients: 1000000
test_defaults:
  preset: extended
  phases: [idle, upload, download]
  streams: {{mode: fixed, fixed: 6, max: 6}}
  download: {{min_duration: 10m, max_duration: 10m}}
  upload: {{max_duration: 10m}}
  data_cap: 64GiB
  warmup: 60s
  ping_count: 200
  overhead_compensation_percent: 20
compat:
  openspeedtest: {{enabled: true}}
  networkquality: {{max_upload_bytes: 64GiB, max_flows_per_client: 256}}
log: {{format: json, level: debug}}
metrics: {{enabled: true, path: /internal/metrics}}
"#
            ),
        ),
        // The OpenSpeedTest and LibreSpeed layers at the lowest limits they accept.
        (
            "OpenSpeedTest at its minimums",
            "
compat:
  openspeedtest: {enabled: true}
limits: {max_download_bytes: 30MiB, max_upload_bytes: 36700160}
"
            .to_owned(),
        ),
        (
            "LibreSpeed at its minimum",
            "
compat:
  librespeed: {enabled: true}
limits: {max_download_bytes: 1MiB}
"
            .to_owned(),
        ),
        // networkQuality with either way to its https URLs.
        (
            "networkQuality with an https public_url",
            r#"
server: {public_url: "HTTPS://speed.example.lan"}
compat:
  networkquality: {enabled: true}
"#
            .to_owned(),
        ),
        (
            "networkQuality behind a trusted proxy",
            "
server: {trusted_proxies: [172.20.0.2/32]}
compat:
  networkquality: {enabled: true}
"
            .to_owned(),
        ),
        // Continuous, with a lone bound that has no preset value to be compared with.
        (
            "Continuous with a lone minimum",
            "
test_defaults:
  preset: continuous
  download: {min_duration: 30s}
"
            .to_owned(),
        ),
    ];
    for (name, file) in files {
        assert_eq!(problems_for(&file, &[]), [], "{name}");
    }
}

/// Go: `TestDefaultsAreValid`
#[test]
fn defaults_are_valid() {
    let defaults = Config::default();
    assert_eq!(validate(&defaults), []);
    assert_eq!(warnings(&defaults), []);
}

/// Go: `TestStreamsModeMayBeUnset`. Empty stands for the preset's mode, as an empty duration does;
/// anything else outside the three modes still fails closed.
#[test]
fn streams_mode_may_be_unset() {
    for file in [
        "test_defaults:\n  preset: quick\n",
        "test_defaults:\n  streams:\n    mode: \"\"\n",
    ] {
        assert_eq!(problems_for(file, &[]), [], "{file:?}");
    }
    let problems = problems_for("test_defaults:\n  streams:\n    mode: bogus\n", &[]);
    assert_eq!(problem_keys(&problems), ["test_defaults.streams.mode"]);
}

/// Go: `TestProblemsAreCollected`
#[test]
fn problems_are_collected() {
    let problems = problems_for(
        r#"
server:
  listen: ":0"
  lisen: ":8080"
  base_path: speed
limits:
  max_upload_bytes: 256 megs
  max_download_bytes: 32KiB
test_defaults:
  phases: [download, idle]
metrics:
  enabled: true
  path: metrics
"#,
        &["BITGAUGE_LOG__LEVEL=loud"],
    );
    assert_eq!(
        problem_keys(&problems),
        [
            "limits.max_upload_bytes",
            "server.lisen",
            "server.listen",
            "server.base_path",
            "limits.max_download_bytes",
            "test_defaults.phases",
            "log.level",
            "metrics.path",
        ]
    );
}

/// A problem line's float as Go's `%v` writes it: 951606.00048828125 lies exactly halfway between
/// the shortest candidates `…4882812` and `…4882813`, and Go takes the even one.
#[test]
fn problem_float_ties_round_to_even() {
    let problems = problems_for(
        "test_defaults:\n  overhead_compensation_percent: 951606.00048828125\n",
        &[],
    );
    let lines: Vec<(&str, &str)> = problems
        .iter()
        .map(|problem| (problem.key.as_str(), problem.value.as_str()))
        .collect();
    assert_eq!(
        lines,
        [(
            "test_defaults.overhead_compensation_percent",
            "951606.0004882812"
        )]
    );
}

/// Go: `TestDecodeFailureIsNotReportedTwice`. The listen value does not decode, so it keeps its
/// valid default and validation adds no port-range problem for the same key.
#[test]
fn decode_failure_is_not_reported_twice() {
    let problems = problems_for("server:\n  listen: \"8080\"\n  display_name:\n", &[]);
    assert_eq!(
        problem_keys(&problems),
        ["server.display_name", "server.listen"]
    );
}

/// Go: `TestWarnings`
#[test]
fn warnings_name_the_unintended_settings() {
    let mut metrics_on = Config::default();
    metrics_on.metrics.enabled = true;

    let mut metrics_behind_proxy = metrics_on.clone();
    metrics_behind_proxy.server.trusted_proxies = vec![cidr("172.20.0.2/32")];

    let mut continuous_plain = Config::default();
    continuous_plain.test_defaults.preset = "continuous".to_owned();

    let mut continuous = continuous_plain.clone();
    continuous.test_defaults.download.min_duration = Some(SignedDuration::from_secs(30));
    continuous.test_defaults.upload = DurationRange {
        min_duration: Some(SignedDuration::from_secs(20)),
        max_duration: Some(SignedDuration::from_secs(40)),
    };

    let mut bounded = continuous.clone();
    bounded.test_defaults.preset = "extended".to_owned();

    let mut everyone = Config::default();
    everyone.server.trusted_proxies = vec![cidr("10.0.0.0/8"), cidr("0.0.0.0/0"), cidr("::/0")];

    let cases: [(&str, Config, &[&str]); 6] = [
        (
            "metrics without trusted proxies",
            metrics_on,
            &["metrics.enabled"],
        ),
        ("metrics behind a trusted proxy", metrics_behind_proxy, &[]),
        (
            "trusting every address",
            everyone,
            &["server.trusted_proxies[1]", "server.trusted_proxies[2]"],
        ),
        (
            "duration keys with Continuous, which ignores them",
            continuous,
            &[
                "test_defaults.download.min_duration",
                "test_defaults.upload.min_duration",
                "test_defaults.upload.max_duration",
            ],
        ),
        ("Continuous without duration keys", continuous_plain, &[]),
        ("duration keys with a bounded preset", bounded, &[]),
    ];
    for (name, config, want) in cases {
        assert_eq!(problem_keys(&warnings(&config)), want, "{name}");
    }
}

/// Go: `TestInvalidLogKeysReportOnStderr`, the configuration half: log settings that never
/// decoded leave the default text and info behind, and the problem is still on a log key, so
/// the report goes to stderr. The reporting itself is ported with the logger (phase 6).
#[test]
fn invalid_log_keys_are_log_problems() {
    for (name, file, entries) in [
        ("null level", "log:\n  level:\n", &[][..]),
        ("number as the level", "log: {level: 1}\n", &[]),
        ("scalar log section", "log: text\n", &[]),
        (
            "a level below the level",
            "{}\n",
            &["BITGAUGE_LOG__LEVEL__X=debug"],
        ),
        ("unknown format", "log:\n  format: logfmt\n", &[]),
    ] {
        let loaded = load(file, entries);
        let problems = check(&loaded);
        assert!(
            problems.iter().any(crate::config::Problem::is_log_problem),
            "{name}: {problems:?}"
        );
    }
}

/// Go: `TestEveryDurationProblemInOneRun`
#[test]
fn every_duration_problem_in_one_run() {
    let problems = problems_for(
        "test_defaults:\n  preset: turbo\n  download:\n    min_duration: 1s\n  upload:\n    \
         max_duration: 11m\n",
        &[],
    );
    assert_eq!(
        problem_keys(&problems),
        [
            "test_defaults.preset",
            "test_defaults.download.min_duration",
            "test_defaults.upload.max_duration",
        ]
    );
}

/// Go: `TestListElementReportedOnce`
#[test]
fn list_element_reported_once() {
    for (name, file) in [
        (
            "malformed origin",
            "server:\n  cors:\n    allowed_origins: [https://ok.lan, \"https://x/%zz\"]\n",
        ),
        (
            "null origin",
            "server:\n  cors:\n    allowed_origins: [https://ok.lan, ~]\n",
        ),
        ("null phase", "test_defaults:\n  phases: [idle, ~, ~]\n"),
    ] {
        let problems = problems_for(file, &[]);
        assert!(!problems.is_empty(), "{name}: no problem reported");
        assert!(
            problems.iter().all(|problem| problem.key.contains('[')),
            "{name}: problems = {problems:?}, want only the failed elements"
        );
    }
}

/// Go: `TestExitStatus`, and the exit status half of `TestStreamsModeMayBeUnset`.
#[test]
fn exit_status() {
    assert_eq!(EXIT_INVALID_CONFIG, 2, "configuration.md section 4");
}

/// Go: `TestPreset`, the values of measurement.md section 8.5.
#[test]
fn presets() {
    let seconds = SignedDuration::from_secs;
    for (name, want) in [
        (
            "quick",
            PresetValues {
                streams_mode: "fixed",
                download: [seconds(5), seconds(10)],
                upload: [seconds(5), seconds(10)],
                ping_count: 10,
                bounded: true,
            },
        ),
        (
            "standard",
            PresetValues {
                streams_mode: "auto",
                download: [seconds(10), seconds(20)],
                upload: [seconds(15), seconds(25)],
                ping_count: 20,
                bounded: true,
            },
        ),
        (
            "extended",
            PresetValues {
                streams_mode: "auto",
                download: [seconds(20), seconds(40)],
                upload: [seconds(20), seconds(40)],
                ping_count: 50,
                bounded: true,
            },
        ),
        // No minimum, no maximum: zero durations, and the stream mode and 20 pings of Standard.
        (
            "continuous",
            PresetValues {
                streams_mode: "auto",
                download: [SignedDuration::ZERO; 2],
                upload: [SignedDuration::ZERO; 2],
                ping_count: 20,
                bounded: false,
            },
        ),
    ] {
        assert_eq!(preset(name), Some(want), "{name}");
    }
    for name in ["", "Standard", "custom"] {
        assert_eq!(preset(name), None, "{name:?}");
    }
}
