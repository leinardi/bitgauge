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

//! The raw tree: what the YAML file and the environment say, before any key is typed. The file
//! is read into it through serde-saphyr, the environment is merged over it key by key, and the
//! typed walker (`decode.rs`) reads it, so every bad key is a problem of its own instead of the
//! first error ending the load. Every value read from the file keeps the line and column
//! serde-saphyr gives it, which a problem carries beside its key, value and rule.

use std::collections::BTreeMap;
use std::fmt::{self, Write as _};

use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_saphyr::Spanned;

use super::{Location, gofmt};

/// A value as the file or the environment gave it.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum Raw {
    /// A key written without a value, or `~` or `null`.
    Null,
    Bool(bool),
    Int(i64),
    /// An integer outside the `i64` range, which no key accepts.
    Wide(i128),
    Float(f64),
    Text(String),
    List(Vec<Node>),
    Map(Map),
}

/// A value with where the file wrote it; a value from the environment has no location.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct Node {
    pub(super) value: Raw,
    pub(super) location: Option<Location>,
}

impl Node {
    /// A value from the environment.
    pub(super) const fn unplaced(value: Raw) -> Self {
        Self {
            value,
            location: None,
        }
    }
}

/// The keys of a mapping, sorted, as the problem lines list them.
pub(super) type Map = BTreeMap<String, Node>;

impl Raw {
    /// What kind of value this is, for a problem's rule.
    pub(super) const fn kind(&self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool(_) => "a boolean",
            Self::Int(_) | Self::Wide(_) | Self::Float(_) => "a number",
            Self::Text(_) => "text",
            Self::List(_) => "a list",
            Self::Map(_) => "a map",
        }
    }
}

impl fmt::Display for Raw {
    /// The value as the problem line shows it, as Go's `fmt.Sprint` writes the decoded YAML:
    /// text unquoted, `[a b]` for a list and `map[k:v]` for a map.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Null => formatter.write_str("null"),
            Self::Bool(value) => write!(formatter, "{value}"),
            Self::Int(value) => write!(formatter, "{value}"),
            Self::Wide(value) => write!(formatter, "{value}"),
            Self::Float(value) => formatter.write_str(&gofmt::float(*value)),
            Self::Text(text) => formatter.write_str(text),
            Self::List(items) => {
                let mut shown = String::from("[");
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        shown.push(' ');
                    }
                    let _ = write!(shown, "{}", Nested(&item.value));
                }
                shown.push(']');
                formatter.write_str(&shown)
            }
            Self::Map(entries) => {
                let mut shown = String::from("map[");
                for (index, (key, value)) in entries.iter().enumerate() {
                    if index > 0 {
                        shown.push(' ');
                    }
                    let _ = write!(shown, "{key}:{}", Nested(&value.value));
                }
                shown.push(']');
                formatter.write_str(&shown)
            }
        }
    }
}

/// A value inside a list or a map, where Go writes a null as `<nil>`.
struct Nested<'raw>(&'raw Raw);

impl fmt::Display for Nested<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            Raw::Null => formatter.write_str("<nil>"),
            other @ (Raw::Bool(_)
            | Raw::Int(_)
            | Raw::Wide(_)
            | Raw::Float(_)
            | Raw::Text(_)
            | Raw::List(_)
            | Raw::Map(_)) => write!(formatter, "{other}"),
        }
    }
}

impl<'de> Deserialize<'de> for Raw {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(RawVisitor)
    }
}

/// A value read with its location.
fn placed(spanned: Spanned<Raw>) -> Node {
    Node {
        value: spanned.value,
        location: Some(Location {
            line: spanned.defined.line(),
            column: spanned.defined.column(),
        }),
    }
}

struct RawVisitor;

impl<'de> Visitor<'de> for RawVisitor {
    type Value = Raw;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a YAML value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Raw, E> {
        Ok(Raw::Null)
    }

    fn visit_none<E: de::Error>(self) -> Result<Raw, E> {
        Ok(Raw::Null)
    }

    fn visit_some<D: Deserializer<'de>>(self, deserializer: D) -> Result<Raw, D::Error> {
        Raw::deserialize(deserializer)
    }

    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Raw, E> {
        Ok(Raw::Bool(value))
    }

    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Raw, E> {
        Ok(Raw::Int(value))
    }

    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Raw, E> {
        Ok(i64::try_from(value).map_or(Raw::Wide(i128::from(value)), Raw::Int))
    }

    fn visit_i128<E: de::Error>(self, value: i128) -> Result<Raw, E> {
        Ok(i64::try_from(value).map_or(Raw::Wide(value), Raw::Int))
    }

    fn visit_u128<E: de::Error>(self, value: u128) -> Result<Raw, E> {
        // Beyond i128 it is still only "too large" to every key.
        Ok(Raw::Wide(i128::try_from(value).unwrap_or(i128::MAX)))
    }

    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Raw, E> {
        Ok(Raw::Float(value))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Raw, E> {
        Ok(Raw::Text(value.to_owned()))
    }

    fn visit_string<E: de::Error>(self, value: String) -> Result<Raw, E> {
        Ok(Raw::Text(value))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut access: A) -> Result<Raw, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = access.next_element::<Spanned<Raw>>()? {
            items.push(placed(item));
        }
        Ok(Raw::List(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut access: A) -> Result<Raw, A::Error> {
        let mut entries = Map::new();
        while let Some(key) = access.next_key::<Raw>()? {
            let Raw::Text(key) = key else {
                return Err(de::Error::custom(format!(
                    "a mapping key must be text, not {}",
                    key.kind()
                )));
            };
            let value = access.next_value::<Spanned<Raw>>()?;
            entries.insert(key, placed(value));
        }
        Ok(Raw::Map(entries))
    }
}

/// Reads a configuration file into the raw tree. An empty file, or one that holds only comments
/// or a null, is an empty mapping; anything but a mapping at the top is an error, as is a
/// duplicate key.
pub(super) fn from_yaml(text: &str) -> Result<Map, serde_saphyr::Error> {
    let options = serde_saphyr::options! {
        // Only true and false are booleans; `yes`, `on` and `y` stay text, as yaml.v3 decodes
        // them into an untyped value.
        strict_booleans: true,
        // `010` is 8, as yaml.v3 reads an integer with base prefixes.
        legacy_octal_numbers: true,
        duplicate_keys: serde_saphyr::DuplicateKeyPolicy::Error,
        // .nan and .inf reach the walker, which refuses them with a rule of their own.
        non_finite_float_policy: serde_saphyr::NonFiniteFloatPolicy::PassThrough,
    };
    let root: Option<Raw> = serde_saphyr::from_str_with_options(text, options)?;
    match root {
        None | Some(Raw::Null) => Ok(Map::new()),
        Some(Raw::Map(entries)) => Ok(entries),
        Some(
            other @ (Raw::Bool(_)
            | Raw::Int(_)
            | Raw::Wide(_)
            | Raw::Float(_)
            | Raw::Text(_)
            | Raw::List(_)),
        ) => Err(de::Error::custom(format!(
            "the configuration must be a mapping, not {}",
            other.kind()
        ))),
    }
}

/// Merges `source` over `target` as koanf merges its providers: a mapping on both sides merges
/// key by key, anything else on the source side replaces the target's value.
pub(super) fn merge(target: &mut Map, source: Map) {
    for (key, node) in source {
        match (target.get_mut(&key), node) {
            (
                Some(Node {
                    value: Raw::Map(existing),
                    ..
                }),
                Node {
                    value: Raw::Map(nested),
                    ..
                },
            ) => merge(existing, nested),
            (_, node) => {
                target.insert(key, node);
            }
        }
    }
}

/// Sets `value` at a dotted key path, creating the mappings on the way and replacing a
/// non-mapping that stands in the path.
pub(super) fn insert_path(root: &mut Map, path: &[&str], value: Raw) {
    let Some((last, parents)) = path.split_last() else {
        return;
    };
    let mut current = root;
    for parent in parents {
        let slot = current
            .entry((*parent).to_owned())
            .or_insert_with(|| Node::unplaced(Raw::Map(Map::new())));
        if !matches!(slot.value, Raw::Map(_)) {
            *slot = Node::unplaced(Raw::Map(Map::new()));
        }
        let Raw::Map(nested) = &mut slot.value else {
            return;
        };
        current = nested;
    }
    current.insert((*last).to_owned(), Node::unplaced(value));
}

/// The key and location of every null in the tree, mappings in key order and list elements by
/// index.
pub(super) fn null_keys(root: &Map) -> Vec<(String, Option<Location>)> {
    let mut keys = Vec::new();
    for (name, node) in root {
        collect_nulls(node, name.clone(), &mut keys);
    }
    keys
}

fn collect_nulls(node: &Node, path: String, keys: &mut Vec<(String, Option<Location>)>) {
    match &node.value {
        Raw::Null => keys.push((path, node.location)),
        Raw::Map(entries) => {
            for (name, nested) in entries {
                collect_nulls(nested, format!("{path}.{name}"), keys);
            }
        }
        Raw::List(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_nulls(item, format!("{path}[{index}]"), keys);
            }
        }
        Raw::Bool(_) | Raw::Int(_) | Raw::Wide(_) | Raw::Float(_) | Raw::Text(_) => {}
    }
}
