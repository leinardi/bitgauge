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

//! The shipped package's resolved dependency graph holds the lint boundary
//! (`docs/rust-port.md`, Lint Boundary): what cargo would actually build for `bitgauge`, with
//! features unified, not what the manifests ask for.
//!
//! - It reads the resolved production features with feature edges, through
//!   `cargo tree -p bitgauge -e features,normal,build --prefix none --format "{p} {f}"`.
//!   Dev-dependencies are excluded, so features only they unify are not counted.
//! - Neither `testenv` nor `meta` appears, and no crate `deny.toml` bans appears.
//! - hyper's `client` and `http2`, hyper-util's `client`, `client-legacy` and `http2`, tokio's `fs`
//!   and `process`, and axum's `ws` and `http2` are not enabled.
//! - The `bitgauge` dev-dependencies do not include `testenv`.
//! - The same check runs on the `x86_64-unknown-linux-musl` view the release builds.
//!
//! The negative controls run the same check on scratch copies of the workspace manifest, each
//! changed to break one rule. The scratch copies resolve offline: a crate a control adds is a local
//! path crate with the name and features of the real one, which is all the check reads.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use meta::{cargo, repo};
use toml::Table;

/// Crates that are test infrastructure and must never be in the shipped graph.
const TEST_CRATES: &[&str] = &["testenv", "meta"];

/// Features that must not be enabled in the shipped graph, by crate.
const FORBIDDEN_FEATURES: &[(&str, &[&str])] = &[
    ("hyper", &["client", "http2"]),
    ("hyper-util", &["client", "client-legacy", "http2"]),
    ("tokio", &["fs", "process"]),
    ("axum", &["ws", "http2"]),
];

/// The release target whose view is checked beside the host's.
const RELEASE_TARGET: &str = "x86_64-unknown-linux-musl";

/// How cargo is told to resolve: the repository against its lockfile, a scratch copy offline.
#[derive(Clone, Copy)]
enum Resolve {
    Locked,
    Offline,
}

/// The crates of the resolved production graph of `bitgauge` in the workspace at `directory`,
/// each with the union of its enabled features, for the host or for `target`.
fn resolved_features(
    directory: &Path,
    target: Option<&str>,
    resolve: Resolve,
) -> BTreeMap<String, BTreeSet<String>> {
    let mut command = cargo::command(directory);
    command.args([
        "tree",
        "-p",
        "bitgauge",
        "-e",
        "features,normal,build",
        "--prefix",
        "none",
        "--format",
        "{p} {f}",
    ]);
    command.arg(match resolve {
        Resolve::Locked => "--locked",
        Resolve::Offline => "--offline",
    });
    if let Some(target) = target {
        command.args(["--target", target]);
    }
    let output = cargo::output(&mut command);
    assert!(
        output.status.success(),
        "cargo tree failed in {}:\n{}",
        directory.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_tree(&String::from_utf8_lossy(&output.stdout))
}

/// Reads `cargo tree --prefix none --format "{p} {f}"` output: a package line is
/// `name vX.Y.Z [(source)] [features] [(*)]`; a feature-edge line (`name feature "x"`) only
/// repeats what the package lines list, so it is skipped.
fn parse_tree(output: &str) -> BTreeMap<String, BTreeSet<String>> {
    let mut crates: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for line in output.lines() {
        let mut words = line.split_whitespace();
        let (Some(name), Some(version)) = (words.next(), words.next()) else {
            continue;
        };
        if !version.starts_with('v') {
            continue;
        }
        let features = crates.entry(name.to_owned()).or_default();
        for word in words {
            if word.starts_with('(') || word.ends_with(')') {
                continue;
            }
            features.extend(
                word.split(',')
                    .filter(|feature| !feature.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    crates
}

/// The crate names `deny.toml` bans.
fn banned_crates(deny: &Table) -> Vec<String> {
    deny.get("bans")
        .and_then(|bans| bans.get("deny"))
        .and_then(toml::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .as_str()
                .or_else(|| entry.get("name").and_then(toml::Value::as_str))
                .or_else(|| entry.get("crate").and_then(toml::Value::as_str))
                .map(str::to_owned)
        })
        .collect()
}

/// What is wrong with a resolved production graph, if anything.
fn graph_problems(crates: &BTreeMap<String, BTreeSet<String>>, banned: &[String]) -> Vec<String> {
    let mut problems = Vec::new();
    if !crates.contains_key("bitgauge") {
        problems.push("the resolved graph does not contain bitgauge itself".to_owned());
    }
    for name in TEST_CRATES {
        if crates.contains_key(*name) {
            problems.push(format!("the shipped graph contains the test crate {name}"));
        }
    }
    for name in banned {
        if crates.contains_key(name) {
            problems.push(format!(
                "the shipped graph contains {name}, which deny.toml bans"
            ));
        }
    }
    for (name, forbidden) in FORBIDDEN_FEATURES {
        let Some(enabled) = crates.get(*name) else {
            continue;
        };
        for feature in *forbidden {
            if enabled.contains(*feature) {
                problems.push(format!(
                    "the shipped graph enables {name}'s {feature} feature"
                ));
            }
        }
    }
    problems
}

/// What is wrong with the root manifest's dev-dependencies, if anything: none may be `testenv`,
/// under its own name or renamed, plain or per target.
fn dev_dependency_problems(manifest: &Table) -> Vec<String> {
    let mut tables: Vec<&Table> = Vec::new();
    if let Some(dev) = manifest
        .get("dev-dependencies")
        .and_then(toml::Value::as_table)
    {
        tables.push(dev);
    }
    if let Some(targets) = manifest.get("target").and_then(toml::Value::as_table) {
        tables.extend(targets.values().filter_map(|target| {
            target
                .get("dev-dependencies")
                .and_then(toml::Value::as_table)
        }));
    }
    tables
        .into_iter()
        .flat_map(|table| table.iter())
        .filter(|(key, value)| {
            *key == "testenv"
                || value.get("package").and_then(toml::Value::as_str) == Some("testenv")
        })
        .map(|(key, _)| format!("the bitgauge dev-dependencies include testenv (as {key})"))
        .collect()
}

fn parse(text: &str, origin: &str) -> Table {
    text.parse::<Table>()
        .unwrap_or_else(|error| panic!("parse {origin}: {error}"))
}

fn banned() -> Vec<String> {
    let banned = banned_crates(&parse(&repo::read("deny.toml"), "deny.toml"));
    assert!(!banned.is_empty(), "deny.toml bans no crate");
    banned
}

#[test]
fn the_host_production_graph_holds_the_boundary() {
    let crates = resolved_features(&repo::root(), None, Resolve::Locked);
    let problems = graph_problems(&crates, &banned());
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

#[test]
fn the_release_target_production_graph_holds_the_boundary() {
    let crates = resolved_features(&repo::root(), Some(RELEASE_TARGET), Resolve::Locked);
    let problems = graph_problems(&crates, &banned());
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

#[test]
fn the_dev_dependencies_do_not_include_testenv() {
    let problems = dev_dependency_problems(&parse(&repo::read("Cargo.toml"), "Cargo.toml"));
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Writes `path` under `directory`, creating its parents.
fn write(directory: &Path, path: &str, text: &str) {
    let file = directory.join(path);
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)
            .unwrap_or_else(|error| panic!("create {path}'s parent: {error}"));
    }
    fs::write(&file, text).unwrap_or_else(|error| panic!("write {path}: {error}"));
}

/// A local crate named `name` declaring `features`, standing in for the real one.
fn stub_crate(directory: &Path, name: &str, features: &[&str]) {
    let features: String = features
        .iter()
        .flat_map(|feature| [*feature, " = []\n"])
        .collect();
    write(
        directory,
        &format!("stubs/{name}/Cargo.toml"),
        &format!(
            "[package]\nname = \"{name}\"\nversion = \"1.0.0\"\nedition = \"2024\"\n\
             publish = false\n\n[features]\n{features}"
        ),
    );
    write(directory, &format!("stubs/{name}/src/lib.rs"), "");
}

/// A scratch copy of the workspace: the real root, `meta` and `testenv` manifests and lockfile,
/// with stub sources, after `change` has edited the root manifest's `[dependencies]`.
fn scratch_workspace(change: impl FnOnce(&Path, &mut Table)) -> tempfile::TempDir {
    let scratch =
        tempfile::tempdir().unwrap_or_else(|error| panic!("create a scratch dir: {error}"));
    let dir = scratch.path();
    for member in ["meta", "testenv"] {
        let manifest = format!("{member}/Cargo.toml");
        write(dir, &manifest, &repo::read(&manifest));
        write(dir, &format!("{member}/src/lib.rs"), "");
    }
    write(dir, "src/lib.rs", "");
    write(dir, "src/main.rs", "fn main() {}\n");
    fs::copy(repo::path("Cargo.lock"), dir.join("Cargo.lock"))
        .unwrap_or_else(|error| panic!("copy Cargo.lock: {error}"));
    let mut root = parse(&repo::read("Cargo.toml"), "Cargo.toml");
    let dependencies = root
        .entry("dependencies")
        .or_insert_with(|| toml::Value::Table(Table::new()))
        .as_table_mut()
        .unwrap_or_else(|| panic!("[dependencies] is not a table"));
    change(dir, dependencies);
    write(dir, "Cargo.toml", &root.to_string());
    scratch
}

fn scratch_problems(change: impl FnOnce(&Path, &mut Table)) -> Vec<String> {
    let scratch = scratch_workspace(change);
    let crates = resolved_features(scratch.path(), None, Resolve::Offline);
    graph_problems(&crates, &banned())
}

/// A dependency on a local path, with `features`.
fn path_dependency(path: &str, features: &[&str]) -> toml::Value {
    let mut table = Table::new();
    table.insert("path".to_owned(), toml::Value::String(path.to_owned()));
    table.insert(
        "features".to_owned(),
        toml::Value::Array(
            features
                .iter()
                .map(|feature| toml::Value::String((*feature).to_owned()))
                .collect(),
        ),
    );
    toml::Value::Table(table)
}

/// The control of the controls: the unchanged scratch copy passes, so a refusal below comes from
/// the change and not from the copy.
#[test]
fn an_unchanged_scratch_workspace_passes() {
    assert_eq!(scratch_problems(|_, _| {}), Vec::<String>::new());
}

/// Negative control: `testenv` added as a normal dependency is refused.
#[test]
fn testenv_as_a_normal_dependency_is_refused() {
    let problems = scratch_problems(|_, dependencies| {
        dependencies.insert("testenv".to_owned(), path_dependency("testenv", &[]));
    });
    assert_eq!(
        problems,
        ["the shipped graph contains the test crate testenv"]
    );
}

/// Negative control: hyper's `client` feature enabled on the `bitgauge` package is refused.
#[test]
fn hyper_client_on_bitgauge_is_refused() {
    let problems = scratch_problems(|dir, dependencies| {
        stub_crate(dir, "hyper", &["client", "http1", "http2", "server"]);
        dependencies.insert(
            "hyper".to_owned(),
            path_dependency("stubs/hyper", &["http1", "server", "client"]),
        );
    });
    assert_eq!(
        problems,
        ["the shipped graph enables hyper's client feature"]
    );
}

/// Negative control: a crate `deny.toml` bans, added as a dependency, is refused.
#[test]
fn a_banned_crate_is_refused() {
    let problems = scratch_problems(|dir, dependencies| {
        stub_crate(dir, "reqwest", &[]);
        dependencies.insert("reqwest".to_owned(), path_dependency("stubs/reqwest", &[]));
    });
    assert_eq!(
        problems,
        ["the shipped graph contains reqwest, which deny.toml bans"]
    );
}

/// Negative control: `testenv` as a dev-dependency, plain, renamed or per target, is refused.
#[test]
fn testenv_as_a_dev_dependency_is_refused() {
    for manifest in [
        "[dev-dependencies]\ntestenv = { path = \"testenv\" }\n",
        "[dev-dependencies]\nharness = { path = \"testenv\", package = \"testenv\" }\n",
        "[target.'cfg(unix)'.dev-dependencies]\ntestenv = { path = \"testenv\" }\n",
    ] {
        let problems = dev_dependency_problems(&parse(manifest, "fixture"));
        assert_eq!(problems.len(), 1, "{manifest}: {problems:?}");
    }
}

/// The parser reads package lines, skips feature edges and the repeat marker.
#[test]
fn the_tree_parser_reads_package_lines() {
    let crates = parse_tree(
        "bitgauge v0.0.0 (/repo) \nhyper feature \"server\"\nhyper v1.12.0 http1,server\n\
         tokio v1.54.1 rt,time (*)\n",
    );
    let hyper: Vec<&str> = crates["hyper"].iter().map(String::as_str).collect();
    assert_eq!(hyper, ["http1", "server"]);
    let tokio: Vec<&str> = crates["tokio"].iter().map(String::as_str).collect();
    assert_eq!(tokio, ["rt", "time"]);
    assert!(crates["bitgauge"].is_empty());
}
