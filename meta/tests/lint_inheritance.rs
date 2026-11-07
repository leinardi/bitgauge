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
// Adapted from swarm-scheduler-exporter/meta/tests/workspace_lints.rs at 722b8a3, MIT, Copyright (c) 2026 Roberto Leinardi

//! The lint set and the lint boundary reach every crate they should, and only those.
//!
//! - The shared lint set is declared once, in the root `[workspace.lints]`, and a package only
//!   obeys it when its own manifest opts in: `[lints]` is not inherited by workspace members.
//! - The boundary's lists live in clippy configuration files, and clippy reads the one nearest to
//!   each crate's manifest: the root `clippy.toml` governs the `bitgauge` package and must carry
//!   every production ban, while `meta/clippy.toml` and `testenv/clippy.toml` must exist (or the
//!   root one would reach those crates) and carry none.
//! - A scratch crate under the root `clippy.toml` with a file write in a plain module fails clippy,
//!   which proves the bans are live and not only listed.
//!
//! The workspace half (the root's lint tables, every member's opt-in and the expected member
//! list) is rust-common's `repo_meta::workspace`, run with this workspace's parameters; the clippy configuration files
//! are BitGauge's own lint boundary and stay here. The checks are functions of the files, so each
//! one is also run on input built to break it.

use std::fs;

use meta::cargo;
use repo_meta::workspace;
use repo_meta::{report, strings};
use toml::Table;

/// The workspace members, each with the clippy configuration that must govern it.
const MEMBERS: &[&str] = &[".", "meta", "testenv"];

/// Every path the root `clippy.toml` must disallow (`docs/rust-port.md`, Lint Boundary).
const PRODUCTION_METHOD_BANS: &[&str] = &[
    "std::fs::write",
    "std::fs::File::create",
    "std::fs::File::create_new",
    "std::fs::OpenOptions::open",
    "std::fs::create_dir",
    "std::fs::create_dir_all",
    "std::fs::remove_file",
    "std::fs::remove_dir",
    "std::fs::remove_dir_all",
    "std::fs::rename",
    "std::net::TcpStream::connect",
    "std::net::TcpStream::connect_timeout",
    "tokio::net::TcpStream::connect",
    "std::net::UdpSocket::bind",
    "tokio::net::UdpSocket::bind",
    "std::net::ToSocketAddrs::to_socket_addrs",
    "tokio::net::lookup_host",
    "std::time::SystemTime::now",
    "std::time::Instant::now",
    "jiff::Timestamp::now",
];

/// Every macro the root `clippy.toml` must disallow.
const PRODUCTION_MACRO_BANS: &[&str] = &[
    "std::print",
    "std::println",
    "std::eprint",
    "std::eprintln",
    "std::dbg",
];

/// Paths that must stay allowed: the injected clock's source follows tokio's paused clock.
const MUST_STAY_ALLOWED: &[&str] = &["tokio::time::Instant::now"];

fn parse(text: &str, origin: &str) -> Table {
    text.parse::<Table>()
        .unwrap_or_else(|error| panic!("parse {origin}: {error}"))
}

fn read_toml(relative: &str) -> Table {
    parse(&meta::repo().read(relative), relative)
}

/// The `path` of every entry of a clippy configuration list such as `disallowed-methods`.
fn listed_paths(config: &Table, key: &str) -> Vec<String> {
    config
        .get(key)
        .and_then(toml::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .as_str()
                .or_else(|| entry.get("path").and_then(toml::Value::as_str))
                .map(str::to_owned)
        })
        .collect()
}

/// What is wrong with the root `clippy.toml`, if anything.
fn root_config_problems(config: &Table) -> Vec<String> {
    let methods = listed_paths(config, "disallowed-methods");
    let macros = listed_paths(config, "disallowed-macros");
    let mut problems: Vec<String> = PRODUCTION_METHOD_BANS
        .iter()
        .filter(|path| !methods.iter().any(|listed| listed == *path))
        .map(|path| format!("clippy.toml does not disallow the method {path}"))
        .collect();
    problems.extend(
        PRODUCTION_MACRO_BANS
            .iter()
            .filter(|path| !macros.iter().any(|listed| listed == *path))
            .map(|path| format!("clippy.toml does not disallow the macro {path}")),
    );
    problems.extend(
        MUST_STAY_ALLOWED
            .iter()
            .filter(|path| methods.iter().any(|listed| listed == *path))
            .map(|path| format!("clippy.toml disallows {path}, the injected clock's source")),
    );
    for key in ["allow-unwrap-in-tests", "allow-expect-in-tests"] {
        if config.get(key).and_then(toml::Value::as_bool) != Some(true) {
            problems.push(format!("clippy.toml must set {key} = true"));
        }
    }
    problems
}

/// What is wrong with a test crate's `clippy.toml`, if anything: it carries no boundary list.
fn test_config_problems(origin: &str, config: &Table) -> Vec<String> {
    let mut problems: Vec<String> = [
        "disallowed-methods",
        "disallowed-macros",
        "disallowed-types",
    ]
    .into_iter()
    .filter(|key| config.contains_key(*key))
    .map(|key| format!("{origin} sets {key}; the test crates carry no production bans"))
    .collect();
    for key in ["allow-unwrap-in-tests", "allow-expect-in-tests"] {
        if config.get(key).and_then(toml::Value::as_bool) != Some(true) {
            problems.push(format!("{origin} must set {key} = true"));
        }
    }
    problems
}

#[test]
fn root_manifest_declares_the_workspace_lints() {
    let problems = workspace::root_lint_problems(&read_toml("Cargo.toml"));
    assert!(problems.is_empty(), "{}", report(&problems));
}

/// Every member, listed explicitly and exactly as [`MEMBERS`], opts into the workspace lints
/// (`lint_opt_in` also checks the root's lint tables).
#[test]
fn every_workspace_member_opts_into_the_workspace_lints() {
    let problems = workspace::lint_opt_in(&meta::repo(), Some(MEMBERS));
    assert!(problems.is_empty(), "{}", report(&problems));
}

#[test]
fn root_clippy_config_carries_every_production_ban() {
    let problems = root_config_problems(&read_toml("clippy.toml"));
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

#[test]
fn test_crates_have_their_own_clippy_config_without_the_bans() {
    let mut problems = Vec::new();
    for member in ["meta", "testenv"] {
        let origin = format!("{member}/clippy.toml");
        if !meta::repo().path(&origin).is_file() {
            problems.push(format!(
                "{origin} is missing, so the root clippy.toml and its production bans govern {member}"
            ));
            continue;
        }
        problems.extend(test_config_problems(&origin, &read_toml(&origin)));
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Only the three configuration files of the boundary exist: a `.clippy.toml` beside one of them
/// would replace it, and one anywhere else would govern nothing yet look as if it did.
#[test]
fn no_other_clippy_configuration_exists() {
    let repo = meta::repo();
    let found = repo.tracked_or_new(&["*clippy.toml"]);
    assert_eq!(
        found,
        ["clippy.toml", "meta/clippy.toml", "testenv/clippy.toml"],
        "unexpected clippy configuration files"
    );
}

/// Negative control: a root without the lint tables is refused.
#[test]
fn a_root_without_the_lint_tables_is_refused() {
    let missing = parse("[workspace]\nmembers = [\".\"]\n", "fixture");
    assert_eq!(
        strings(&workspace::root_lint_problems(&missing)),
        ["the root Cargo.toml has no [workspace.lints] table"]
    );
}

/// Negative control: a member that does not opt in, one that opts out, a glob and a member list
/// that is not the expected one are each refused.
#[test]
fn a_member_without_the_opt_in_is_refused() {
    let root = parse(
        "[workspace]\nmembers = [\".\", \"meta\", \"testenv\", \"crates/*\"]\n",
        "fixture",
    );
    let problems = workspace::member_opt_in_problems(
        &root,
        |member| {
            Ok(match member {
                "." => parse("[lints]\nworkspace = true\n", member),
                "meta" => parse("[lints]\nworkspace = false\n", member),
                _ => parse("[package]\nname = \"testenv\"\n", member),
            })
        },
        Some(MEMBERS),
    );
    assert_eq!(
        strings(&problems),
        [
            "meta/Cargo.toml does not declare [lints] workspace = true",
            "testenv/Cargo.toml does not declare [lints] workspace = true",
            "member \"crates/*\" is a glob; list members explicitly so this check sees each one",
        ]
    );
    let extra = parse(
        "[workspace]\nmembers = [\".\", \"meta\", \"testenv\", \"tools\"]\n",
        "fixture",
    );
    let problems = workspace::member_opt_in_problems(
        &extra,
        |member| Ok(parse("[lints]\nworkspace = true\n", member)),
        Some(MEMBERS),
    );
    assert_eq!(problems.len(), 1, "{problems:?}");
}

/// Negative control: a root clippy configuration missing a ban, or banning the clock source, is
/// refused; a test crate's configuration carrying a ban is refused.
#[test]
fn a_weakened_clippy_config_is_refused() {
    let root = read_toml("clippy.toml");
    let mut weakened = root.clone();
    let methods = weakened
        .get_mut("disallowed-methods")
        .and_then(toml::Value::as_array_mut)
        .expect("the root clippy.toml has a disallowed-methods list");
    methods
        .retain(|entry| entry.get("path").and_then(toml::Value::as_str) != Some("std::fs::write"));
    methods.push(toml::Value::String("tokio::time::Instant::now".to_owned()));
    assert_eq!(
        root_config_problems(&weakened),
        [
            "clippy.toml does not disallow the method std::fs::write",
            "clippy.toml disallows tokio::time::Instant::now, the injected clock's source",
        ]
    );
    let banned = parse(
        "allow-unwrap-in-tests = true\nallow-expect-in-tests = true\n\
         disallowed-methods = [\"std::fs::write\"]\n",
        "fixture",
    );
    assert_eq!(
        test_config_problems("meta/clippy.toml", &banned),
        ["meta/clippy.toml sets disallowed-methods; the test crates carry no production bans"]
    );
}

/// The lints of the root manifest, as a TOML table for a scratch workspace.
fn workspace_lints_table() -> toml::Value {
    read_toml("Cargo.toml")
        .get("workspace")
        .and_then(|workspace| workspace.get("lints"))
        .cloned()
        .unwrap_or_else(|| panic!("the root Cargo.toml has no [workspace.lints]"))
}

/// Runs clippy on a scratch crate that carries the root `clippy.toml`, `rust-toolchain.toml` and
/// workspace lints, with `body` as a plain (non-test) module. Returns whether clippy passed, and
/// its output.
fn clippy_on_scratch_crate(body: &str) -> (bool, String) {
    let scratch =
        tempfile::tempdir().unwrap_or_else(|error| panic!("create a scratch directory: {error}"));
    let dir = scratch.path();
    let mut workspace = Table::new();
    workspace.insert("members".to_owned(), toml::Value::Array(Vec::new()));
    workspace.insert("lints".to_owned(), workspace_lints_table());
    let mut manifest = parse(
        "[package]\nname = \"scratch\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\
         publish = false\n[lints]\nworkspace = true\n",
        "fixture",
    );
    manifest.insert("workspace".to_owned(), toml::Value::Table(workspace));
    fs::write(dir.join("Cargo.toml"), manifest.to_string())
        .unwrap_or_else(|error| panic!("write the scratch manifest: {error}"));
    for config in ["clippy.toml", "rust-toolchain.toml"] {
        fs::copy(meta::repo().path(config), dir.join(config))
            .unwrap_or_else(|error| panic!("copy the configuration: {error}"));
    }
    fs::create_dir(dir.join("src")).unwrap_or_else(|error| panic!("create src: {error}"));
    fs::write(
        dir.join("src/lib.rs"),
        "//! Scratch crate.\n\nmod plain;\n\npub use plain::store;\n",
    )
    .unwrap_or_else(|error| panic!("write lib.rs: {error}"));
    fs::write(dir.join("src/plain.rs"), body)
        .unwrap_or_else(|error| panic!("write the plain module: {error}"));
    let output = cargo::output(
        cargo::command(dir)
            .args(["clippy", "--offline", "--quiet", "--", "-D", "warnings"])
            .env("CARGO_TARGET_DIR", dir.join("target")),
    );
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    (output.status.success(), text)
}

/// The root bans are live: a file write in a plain module of a crate under the root `clippy.toml`
/// fails clippy, naming the lint, while the same crate without it passes.
#[test]
fn a_file_write_under_the_root_clippy_config_fails_clippy() {
    let (passed, output) = clippy_on_scratch_crate(
        "//! A plain module.\n\n/// Stores a result.\n///\n/// # Errors\n///\n/// The write \
         fails.\npub fn store() -> std::io::Result<()> {\n    std::fs::write(\"result.json\", \"{}\")\n}\n",
    );
    assert!(!passed, "clippy accepted std::fs::write:\n{output}");
    assert!(
        output.contains("disallowed_methods") && output.contains("std::fs::write"),
        "clippy failed, but not on the ban:\n{output}"
    );
    let (passed, output) = clippy_on_scratch_crate(
        "//! A plain module.\n\n/// Stores nothing.\n///\n/// # Errors\n///\n/// Never.\n\
         pub fn store() -> std::io::Result<()> {\n    Ok(())\n}\n",
    );
    assert!(
        passed,
        "the scratch crate fails clippy without the write:\n{output}"
    );
}
