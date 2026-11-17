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

//! The route table against `api/openapi.yaml`: every native route and the default `/metrics` is
//! documented, and every documented path is served, method by method (Go's
//! `TestOpenAPIRouteParity`). The SPA and the compatibility layers are not in the contract.

use std::collections::BTreeSet;

use serde_json::Value;

use crate::config::Config;
use crate::server::routes::{Owner, route_table};

const OPENAPI: &str = include_str!("../../../api/openapi.yaml");

/// The operation keys of a path item of the contract.
const METHODS: [&str; 8] = [
    "get", "put", "post", "delete", "options", "head", "patch", "trace",
];

/// A route as `METHOD path`, each `{param}` segment written `{}` so a parameter's name does not
/// matter.
fn key(method: &str, path: &str) -> String {
    let path: Vec<String> = path
        .split('/')
        .map(|segment| {
            if segment.starts_with('{') && segment.ends_with('}') {
                "{}".to_owned()
            } else {
                segment.to_owned()
            }
        })
        .collect();
    format!("{} {}", method.to_ascii_uppercase(), path.join("/"))
}

/// The documented routes of a contract.
fn documented(spec: &str) -> BTreeSet<String> {
    let document: Value = serde_saphyr::from_str(spec).expect("the contract parses");
    let paths = document["paths"].as_object().expect("paths");
    assert!(!paths.is_empty(), "the contract documents no path");
    paths
        .iter()
        .flat_map(|(path, item)| {
            let item = item.as_object().expect("a path item");
            METHODS
                .iter()
                .filter(|method| item.contains_key(**method))
                .map(move |method| key(method, path))
        })
        .collect()
}

/// The routes the contract covers: the native API's rows and `/metrics` at its default path.
fn implemented() -> BTreeSet<String> {
    let mut routes: BTreeSet<String> = route_table()
        .into_iter()
        .filter(|route| route.owner == Owner::Native)
        .flat_map(|route| {
            route
                .methods
                .iter()
                .map(|method| key(method.as_str(), &route.pattern))
                .collect::<Vec<_>>()
        })
        .collect();
    routes.insert(key("GET", &Config::default().metrics.path));
    routes
}

/// What differs between the routes of `spec` and the implemented ones, both ways.
fn parity_problems(spec: &str) -> Vec<String> {
    let documented = documented(spec);
    let implemented = implemented();
    let mut problems = Vec::new();
    let undocumented: Vec<&String> = implemented.difference(&documented).collect();
    if !undocumented.is_empty() {
        problems.push(format!(
            "undocumented implementation routes: {undocumented:?}"
        ));
    }
    let unimplemented: Vec<&String> = documented.difference(&implemented).collect();
    if !unimplemented.is_empty() {
        problems.push(format!(
            "documented but unimplemented routes: {unimplemented:?}"
        ));
    }
    problems
}

#[test]
fn route_table_matches_the_openapi_paths() {
    let problems = parity_problems(OPENAPI);
    assert!(problems.is_empty(), "{problems:#?}");
}

/// The control: a path the contract gains without a route, and a route it loses, both fail.
#[test]
fn a_drift_either_way_is_reported() {
    let phantom = OPENAPI.replacen(
        "\npaths:\n",
        "\npaths:\n  /api/v1/phantom/{id}:\n    get:\n      responses:\n        '200':\n          description: none\n",
        1,
    );
    assert_ne!(phantom, OPENAPI, "the control found no paths key");
    assert_eq!(
        parity_problems(&phantom),
        ["documented but unimplemented routes: [\"GET /api/v1/phantom/{}\"]"]
    );

    let lost = OPENAPI.replacen("\n    head:\n", "\n    x-head:\n", 1);
    assert_ne!(lost, OPENAPI, "the control found no head operation");
    assert_eq!(
        parity_problems(&lost),
        ["undocumented implementation routes: [\"HEAD /api/v1/ping\"]"]
    );
}
