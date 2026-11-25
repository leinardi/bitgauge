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
//! The crates whose types cross rust-common's public API are one package each in this workspace's
//! graph, and the ones rust-common re-exports are taken through the re-export, not declared here:
//! tokio-util and tower-service as `service_kit::tokio_util` and `service_kit::tower_service`,
//! tracing-subscriber as `tracing_setup::tracing_subscriber`. Two copies compile apart and fail at
//! the boundary with E0277 or E0308. prometheus-client is BitGauge's own: service-kit's
//! `process-metrics` is off here, so rust-common brings no copy and the declaration stands. The
//! check is `repo_meta::boundary`'s, on `cargo metadata --locked --all-features` (CI runs
//! `cargo fetch --locked` first); the negative controls plant a split and a declaration into the
//! real metadata.

use repo_meta::boundary::{TABLE, check, check_metadata, metadata};
use repo_meta::git_pins::RUST_COMMON_URL;
use repo_meta::yaml::Value;
use repo_meta::{report, strings};

const DAEMON: &str = "bitgauge";

fn real_metadata() -> Value {
    metadata(meta::repo().root()).unwrap_or_else(|problem| panic!("{problem}"))
}

fn array<'value>(value: &'value mut Value, key: &str) -> &'value mut Vec<Value> {
    match value.get_mut(key) {
        Some(Value::Array(items)) => items,
        _ => panic!("cargo metadata has no {key} array"),
    }
}

/// The one package named `name`, cloned.
fn package(metadata: &Value, name: &str) -> Value {
    let found: Vec<&Value> = metadata["packages"]
        .as_array()
        .unwrap_or_else(|| panic!("cargo metadata has no packages array"))
        .iter()
        .filter(|package| package["name"] == name)
        .collect();
    assert_eq!(found.len(), 1, "want one {name} package");
    found[0].clone()
}

fn node_mut<'value>(metadata: &'value mut Value, id: &Value) -> &'value mut Value {
    array(array_parent(metadata), "nodes")
        .iter_mut()
        .find(|node| node["id"] == *id)
        .unwrap_or_else(|| panic!("no resolve node {id}"))
}

fn array_parent(metadata: &mut Value) -> &mut Value {
    metadata
        .get_mut("resolve")
        .unwrap_or_else(|| panic!("cargo metadata has no resolve graph"))
}

#[test]
fn every_boundary_crate_is_one_package_and_none_is_declared_beside_its_reexport() {
    let problems = check(meta::repo().root(), RUST_COMMON_URL, &[]);
    assert!(problems.is_empty(), "{}", report(&problems));
}

/// BitGauge's own tower-service 0.3.2 beside service-kit's: named, with both copies and the
/// re-export to take it through.
#[test]
fn a_tower_service_split_is_named() {
    let mut metadata = real_metadata();
    let ours = package(&metadata, "tower-service");
    let mut theirs = ours.clone();
    let id = Value::String(
        "registry+https://github.com/rust-lang/crates.io-index#tower-service@0.3.2".into(),
    );
    theirs["id"] = id.clone();
    theirs["version"] = Value::String("0.3.2".into());
    array(&mut metadata, "packages").push(theirs);
    let mut node = node_mut(&mut metadata, &ours["id"]).clone();
    node["id"] = id.clone();
    array(array_parent(&mut metadata), "nodes").push(node);
    let daemon = package(&metadata, DAEMON);
    let daemon_node = node_mut(&mut metadata, &daemon["id"]);
    let mut edge = array(daemon_node, "deps")[0].clone();
    edge["name"] = Value::String("tower_service".into());
    edge["pkg"] = id;
    array(daemon_node, "deps").push(edge);

    let problems = strings(&check_metadata(&metadata, TABLE, RUST_COMMON_URL, &[]));
    assert_eq!(problems.len(), 1, "{problems:#?}");
    let problem = &problems[0];
    assert!(
        problem.starts_with(&format!(
            "2 copies of tower-service: 0.3.2 (crates.io) via {DAEMON} -> tower-service; \
             {} (crates.io), rust-common's, via {DAEMON} -> axum -> tower-service;",
            ours["version"].as_str().expect("version")
        )),
        "{problem}"
    );
    assert!(
        problem.ends_with("(E0277/E0308); take it through service_kit::tower_service"),
        "{problem}"
    );
}

/// tokio-util declared by BitGauge, at the very package rust-common uses: refused all the same,
/// as a direct declaration of a re-exported crate.
#[test]
fn a_direct_tokio_util_declaration_is_refused() {
    let mut metadata = real_metadata();
    let packages = array(&mut metadata, "packages");
    let daemon = packages
        .iter_mut()
        .find(|package| package["name"] == DAEMON)
        .expect("the daemon package");
    let declared = array(daemon, "dependencies");
    let mut dependency = declared[0].clone();
    dependency["name"] = Value::String("tokio-util".into());
    dependency["rename"] = Value::Null;
    dependency["kind"] = Value::Null;
    dependency["target"] = Value::Null;
    declared.push(dependency);

    assert_eq!(
        strings(&check_metadata(&metadata, TABLE, RUST_COMMON_URL, &[])),
        [format!(
            "{DAEMON} declares tokio-util directly (normal dependency); take it through \
             service_kit::tokio_util, or pass an Exception with the reason"
        )]
    );
}

/// The positive control: BitGauge declares prometheus-client, a re-exported crate, and the check
/// passes because service-kit's `process-metrics` is off, so rust-common's copy is not in the
/// graph. The day a consumer turns it on, the declaration is refused.
#[test]
fn the_own_prometheus_client_passes_while_service_kit_brings_none() {
    let metadata = real_metadata();
    let daemon = package(&metadata, DAEMON);
    let declares = daemon["dependencies"]
        .as_array()
        .unwrap_or_else(|| panic!("{DAEMON} has no dependencies array"))
        .iter()
        .any(|dependency| dependency["name"] == "prometheus-client");
    assert!(
        declares,
        "{DAEMON} no longer declares prometheus-client: drop this control"
    );
    let service_kit = package(&metadata, "service-kit");
    let node = metadata["resolve"]["nodes"]
        .as_array()
        .unwrap_or_else(|| panic!("cargo metadata has no resolve nodes"))
        .iter()
        .find(|node| node["id"] == service_kit["id"])
        .unwrap_or_else(|| panic!("no resolve node for service-kit"));
    let features: Vec<&str> = node["features"]
        .as_array()
        .unwrap_or_else(|| panic!("service-kit has no features array"))
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert!(!features.contains(&"process-metrics"), "{features:?}");
    let problems = check_metadata(&metadata, TABLE, RUST_COMMON_URL, &[]);
    assert!(problems.is_empty(), "{}", report(&problems));
}
