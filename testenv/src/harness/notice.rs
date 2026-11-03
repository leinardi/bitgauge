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

//! A result's notice, kept whole: the Go harness held each as `json.RawMessage` and wrote it back
//! into report.json as it came, its keys in their order. `serde_json` without `raw_value` or
//! `preserve_order` keeps neither, so a notice is its own ordered tree.
//!
//! A number is kept as `serde_json` reads it, an integer or a float, and written in
//! `encoding/json`'s layout, where Go wrote the literal back unchanged. The two agree on every
//! number `JSON.stringify` writes, which is where the export comes from.

use std::fmt;

use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use super::gofmt;

/// One notice of an exported result (measurement.md section 17), any JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum Notice {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A non-negative integer.
    Unsigned(u64),
    /// A negative integer.
    Signed(i64),
    /// Any other number.
    Float(f64),
    /// A string.
    Text(String),
    /// An array.
    List(Vec<Notice>),
    /// An object, its keys in their order.
    Object(Vec<(String, Notice)>),
}

impl Notice {
    /// A notice from its JSON text.
    ///
    /// # Errors
    ///
    /// The text is not JSON, in Go's words for a syntax error.
    pub fn parse(text: &str) -> Result<Self, String> {
        gofmt::unmarshal(text.as_bytes())
    }

    /// The notice's code, as Go read it into `struct{ Code string }`: `Some("")` for an object
    /// without one or for `null`, `None` where that decoding fails, a non-object or a code that
    /// is not a string. A key matches `code` in any ASCII case, the last match winning, as
    /// `encoding/json` matches it.
    #[must_use]
    pub fn code(&self) -> Option<String> {
        match self {
            Self::Null => Some(String::new()),
            Self::Object(entries) => {
                let mut code = String::new();
                for (key, value) in entries {
                    if !key.eq_ignore_ascii_case("code") {
                        continue;
                    }
                    match value {
                        Self::Text(text) => code.clone_from(text),
                        Self::Null => {}
                        Self::Bool(_)
                        | Self::Unsigned(_)
                        | Self::Signed(_)
                        | Self::Float(_)
                        | Self::List(_)
                        | Self::Object(_) => return None,
                    }
                }
                Some(code)
            }
            Self::Bool(_)
            | Self::Unsigned(_)
            | Self::Signed(_)
            | Self::Float(_)
            | Self::Text(_)
            | Self::List(_) => None,
        }
    }
}

impl Serialize for Notice {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Bool(value) => serializer.serialize_bool(*value),
            Self::Unsigned(value) => serializer.serialize_u64(*value),
            Self::Signed(value) => serializer.serialize_i64(*value),
            Self::Float(value) => serializer.serialize_f64(*value),
            Self::Text(value) => serializer.serialize_str(value),
            Self::List(values) => {
                let mut seq = serializer.serialize_seq(Some(values.len()))?;
                for value in values {
                    seq.serialize_element(value)?;
                }
                seq.end()
            }
            Self::Object(entries) => {
                let mut map = serializer.serialize_map(Some(entries.len()))?;
                for (key, value) in entries {
                    map.serialize_entry(key, value)?;
                }
                map.end()
            }
        }
    }
}

impl<'de> Deserialize<'de> for Notice {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(NoticeVisitor)
    }
}

struct NoticeVisitor;

impl<'de> Visitor<'de> for NoticeVisitor {
    type Value = Notice;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("any JSON value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Notice, E> {
        Ok(Notice::Null)
    }

    fn visit_none<E: de::Error>(self) -> Result<Notice, E> {
        Ok(Notice::Null)
    }

    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Notice, E> {
        Ok(Notice::Bool(value))
    }

    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Notice, E> {
        Ok(Notice::Unsigned(value))
    }

    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Notice, E> {
        Ok(Notice::Signed(value))
    }

    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Notice, E> {
        Ok(Notice::Float(value))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Notice, E> {
        Ok(Notice::Text(value.to_owned()))
    }

    fn visit_string<E: de::Error>(self, value: String) -> Result<Notice, E> {
        Ok(Notice::Text(value))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Notice, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = seq.next_element()? {
            values.push(value);
        }
        Ok(Notice::List(values))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Notice, A::Error> {
        let mut entries = Vec::new();
        while let Some(entry) = map.next_entry()? {
            entries.push(entry);
        }
        Ok(Notice::Object(entries))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notices_keep_their_order_and_codes() {
        let notice = Notice::parse(r#"{"streams":5,"code":"probe-reservation","x":[-1,0.5,null]}"#)
            .expect("a notice");
        assert_eq!(notice.code().as_deref(), Some("probe-reservation"));
        assert_eq!(
            gofmt::to_json_indent(&notice).expect("encodes"),
            "{\n  \"streams\": 5,\n  \"code\": \"probe-reservation\",\n  \"x\": [\n    -1,\n    \
             0.5,\n    null\n  ]\n}"
        );
        let mut failures = Vec::new();
        for (text, want) in [
            (r#"{"id":"websocket-unavailable"}"#, Some("")),
            (r#"{"Code":"a","code":"b"}"#, Some("b")),
            (r#"{"code":null}"#, Some("")),
            (r#"{"code":5}"#, None),
            ("null", Some("")),
            (r#""text""#, None),
        ] {
            let got = Notice::parse(text).expect("a notice").code();
            if got.as_deref() != want {
                failures.push(format!("{text}: {got:?}, want {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
