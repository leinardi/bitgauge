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

//! The effective configuration, one entry per key, for the startup line at info
//! (configuration-security.md section 6). Nothing in it is secret.

use super::decode::{FIELDS, Slot};
use super::text::duration;
use super::{Config, Size};

/// One key's value on the startup line, typed so the text and JSON formats can each write it
/// their way.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum EffectiveValue {
    /// Text, and the values written as text: an address, an origin, a duration (empty when
    /// unset), the warm-up.
    Text(String),
    /// An integer.
    Int(i64),
    /// A float.
    Float(f64),
    /// A boolean.
    Bool(bool),
    /// A size.
    Size(Size),
    /// A list, each item as text; a label as `cidr=label`, as the environment writes it.
    List(Vec<String>),
}

/// The configuration as one entry per key, sorted by key (the key table's order).
#[must_use]
pub fn effective(config: &Config) -> Vec<(&'static str, EffectiveValue)> {
    // The slots lend mutable access, so they read a copy.
    let mut copy = config.clone();
    FIELDS
        .iter()
        .map(|field| (field.key, value((field.slot)(&mut copy))))
        .collect()
}

fn value(slot: Slot<'_>) -> EffectiveValue {
    match slot {
        Slot::Text(text) => EffectiveValue::Text(text.clone()),
        Slot::Int(number) => EffectiveValue::Int(*number),
        Slot::Float(number) => EffectiveValue::Float(*number),
        Slot::Bool(flag) => EffectiveValue::Bool(*flag),
        Slot::Size(size) => EffectiveValue::Size(*size),
        Slot::Listen(listen) => EffectiveValue::Text(listen.to_string()),
        Slot::Origin(origin) => EffectiveValue::Text(origin.to_string()),
        Slot::Duration(bound) => EffectiveValue::Text(bound.map(duration).unwrap_or_default()),
        Slot::Warmup(warmup) => EffectiveValue::Text(warmup.to_string()),
        Slot::Cidrs(prefixes) => {
            EffectiveValue::List(prefixes.iter().map(ToString::to_string).collect())
        }
        Slot::Labels(rules) => EffectiveValue::List(
            rules
                .iter()
                .map(|rule| {
                    let cidr = rule.cidr.map(|cidr| cidr.to_string()).unwrap_or_default();
                    format!("{cidr}={}", rule.label)
                })
                .collect(),
        ),
        Slot::Origins(origins) => {
            EffectiveValue::List(origins.iter().map(ToString::to_string).collect())
        }
        Slot::Texts(texts) => EffectiveValue::List(texts.clone()),
    }
}
