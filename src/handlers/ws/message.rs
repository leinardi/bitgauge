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

//! One echo message: the strict decode of a client message and the pong written from it
//! (wire-protocol.md section 6, `docs/rust-port.md` row 11).

use std::fmt;

use serde::de::{self, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde_json::value::RawValue;

const PING: &str = "ping";
const KEY_TYPE: &str = "type";
const KEY_SEQ: &str = "seq";
const KEY_T: &str = "t";

/// A client message. `seq` and `t` stay the raw JSON text the client sent, so the pong carries
/// them byte for byte: `t` is opaque to the server, and a float decoded and encoded again could
/// change its text.
#[derive(Debug, Default)]
pub(super) struct Message<'text> {
    kind: Option<String>,
    seq: Option<&'text RawValue>,
    time: Option<&'text RawValue>,
}

/// Why a message closes the connection with 1007.
#[derive(Debug, thiserror::Error)]
#[error("malformed JSON: {0}")]
pub(super) struct Malformed(#[from] serde_json::Error);

impl<'text> Message<'text> {
    /// Decodes one text message: a JSON object whose keys are matched case-sensitively and
    /// appear at most once. Unknown keys are ignored; `type` is a string or `null`.
    pub(super) fn parse(text: &'text str) -> Result<Self, Malformed> {
        Ok(serde_json::from_str(text)?)
    }

    /// The pong of a ping, or `None` for any other type, which is ignored.
    pub(super) fn pong(&self) -> Option<String> {
        if self.kind.as_deref() != Some(PING) {
            return None;
        }
        let mut pong = String::from(r#"{"type":"pong""#);
        for (key, value) in [(KEY_SEQ, self.seq), (KEY_T, self.time)] {
            if let Some(value) = value {
                pong.push_str(",\"");
                pong.push_str(key);
                pong.push_str("\":");
                pong.push_str(value.get());
            }
        }
        pong.push('}');
        Some(pong)
    }
}

impl<'de: 'text, 'text> serde::Deserialize<'de> for Message<'text> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(MessageVisitor)
    }
}

struct MessageVisitor;

impl<'de> Visitor<'de> for MessageVisitor {
    type Value = Message<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON object")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut message = Message::default();
        let mut seen: Vec<String> = Vec::new();
        while let Some(key) = map.next_key::<String>()? {
            if seen.contains(&key) {
                return Err(de::Error::custom(format_args!("duplicate key {key:?}")));
            }
            match key.as_str() {
                KEY_TYPE => message.kind = map.next_value()?,
                // A raw value keeps `null` as the text `null`, where an `Option` would drop it.
                KEY_SEQ => message.seq = Some(map.next_value()?),
                KEY_T => message.time = Some(map.next_value()?),
                _ => {
                    map.next_value::<IgnoredAny>()?;
                }
            }
            seen.push(key);
        }
        Ok(message)
    }
}
