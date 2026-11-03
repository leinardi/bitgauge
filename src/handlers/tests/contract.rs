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

//! The handlers' JSON against `api/openapi.yaml`, by shape.

use http::StatusCode;
use jiff::SignedDuration;
use serde_json::{Map, Value};

use super::info::{fetch, info};
use super::support::{body_bytes, data};
use super::upload::{EXAMPLE_ENTRY, run};
use crate::clientip::{Labeler, Rule};
use crate::config::{Config, Size, Warmup};
use crate::handlers::{CODE_BYTES_OUT_OF_RANGE, Details, error_response};

const OPENAPI: &str = include_str!("../../../api/openapi.yaml");
const SCHEMA_PREFIX: &str = "#/components/schemas/";

/// `components.schemas` of the contract.
fn contract_schemas() -> Map<String, Value> {
    let document: Value = serde_saphyr::from_str(OPENAPI).expect("the contract parses");
    document["components"]["schemas"]
        .as_object()
        .expect("components.schemas")
        .clone()
}

/// Checks `value` against the schema by shape: every required key present, no key the schema
/// does not list where it allows no others, and the same for every nested object and array
/// element. It is not a full JSON Schema validator; the handlers' own tests check values.
fn conforms(schemas: &Map<String, Value>, node: &Value, value: &Value, at: &str) {
    let node = match node["$ref"]
        .as_str()
        .and_then(|reference| reference.strip_prefix(SCHEMA_PREFIX))
    {
        Some(name) => schemas
            .get(name)
            .unwrap_or_else(|| panic!("{at}: unknown schema {name}")),
        None => node,
    };
    if let Some(items) = node.get("items") {
        for (index, element) in value.as_array().into_iter().flatten().enumerate() {
            conforms(schemas, items, element, &format!("{at}[{index}]"));
        }
        return;
    }
    let Some(properties) = node.get("properties").and_then(Value::as_object) else {
        return;
    };
    let object = value
        .as_object()
        .unwrap_or_else(|| panic!("{at}: {value} is not an object"));
    for key in node["required"].as_array().into_iter().flatten() {
        let key = key.as_str().expect("a required key");
        assert!(
            object.contains_key(key),
            "{at}: the handler omits the required key {key}"
        );
    }
    for (key, property) in object {
        match properties.get(key) {
            Some(schema) => conforms(schemas, schema, property, &format!("{at}.{key}")),
            None => assert!(
                node.get("additionalProperties") != Some(&Value::Bool(false)),
                "{at}: the handler sends {key}, which the contract does not list"
            ),
        }
    }
}

/// Go: `TestInfoMatchesTheContract`
#[tokio::test]
async fn info_matches_the_contract() {
    let schemas = contract_schemas();
    // The contract lists exactly what the handler always sends: every property is required.
    for name in [
        "Info",
        "InfoServer",
        "InfoClient",
        "InfoLimits",
        "TestDefaults",
        "DurationBounds",
        "CompatFlags",
        "UploadTelemetry",
    ] {
        let node = schemas
            .get(name)
            .unwrap_or_else(|| panic!("the contract has no schema {name}"));
        let required: Vec<&str> = node["required"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect();
        for property in node["properties"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(key, _)| key)
        {
            assert!(
                required.contains(&property.as_str()),
                "{name}.{property} is optional in the contract, but the handler always sends it"
            );
        }
    }

    let labeler = Labeler::new(&[Rule {
        prefix: "203.0.113.0/24".parse().expect("a CIDR"),
        label: "é".repeat(64),
    }]);
    let plain = Config::default();
    let mut capped = Config::default();
    capped.test_defaults.data_cap = Size::MIB.times(500);
    capped.test_defaults.warmup = Warmup::Fixed(SignedDuration::from_secs(3));
    for config in [&plain, &capped] {
        let info = info(config, labeler.clone());
        for client in ["100.101.4.17", "203.0.113.9", "fd00::5"] {
            conforms(
                &schemas,
                &schemas["Info"],
                &fetch(&info, client).await,
                "Info",
            );
        }
    }
}

/// Go: `TestSuggestedLabelContract`: the label is any `server.labels` label, 1 to 64
/// characters, or null, so the contract lists no fixed set.
#[test]
fn suggested_label_contract() {
    let label = &contract_schemas()["InfoClient"]["properties"]["suggestedLabel"];
    assert!(label.get("enum").is_none(), "{label}");
    assert_eq!(
        (&label["minLength"], &label["maxLength"]),
        (&1.into(), &64.into())
    );
}

/// Go: `TestUploadTelemetryMatchesTheContract`
#[tokio::test(start_paused = true)]
async fn upload_telemetry_matches_the_contract() {
    let schemas = contract_schemas();
    let (response, _) = run(EXAMPLE_ENTRY, Some(200), &[data(50, 100), data(250, 100)]).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = serde_json::from_slice(&body_bytes(response).await).expect("JSON");
    conforms(
        &schemas,
        &schemas["UploadTelemetry"],
        &body,
        "UploadTelemetry",
    );
    let properties = schemas["UploadTelemetry"]["properties"]
        .as_object()
        .expect("properties");
    assert_eq!(properties.len(), 7, "the seven keys of section 4");
}

/// Go: `TestErrorEnvelopeMatchesTheContract`
#[tokio::test]
async fn error_envelope_matches_the_contract() {
    let schemas = contract_schemas();
    let mut details = Details::new();
    details.insert("max".to_owned(), 5.into());
    for details in [None, Some(&details)] {
        let response = error_response(
            StatusCode::BAD_REQUEST,
            CODE_BYTES_OUT_OF_RANGE,
            "out of range",
            details,
        );
        let body: Value = serde_json::from_slice(&body_bytes(response).await).expect("JSON");
        conforms(&schemas, &schemas["Error"], &body, "Error");
    }
}
