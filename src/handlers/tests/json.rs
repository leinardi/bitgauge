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

//! The JSON writer against what Go's `encoding/json` writes (no Go test: Go's was the standard
//! library's). The expected texts are `json.Marshal`'s, from go1.26.

use crate::handlers::to_json;

fn written<T: serde::Serialize + ?Sized>(value: &T) -> String {
    String::from_utf8(to_json(value).expect("JSON")).expect("UTF-8")
}

#[test]
fn strings_are_escaped_as_go_escapes_them() {
    for (text, want) in [
        ("plain", r#""plain""#),
        ("Speed <Lab> & co", r#""Speed \u003cLab\u003e \u0026 co""#),
        ("line\u{2028}para\u{2029}", r#""line\u2028para\u2029""#),
        ("q\"b\\s/", r#""q\"b\\s/""#),
        ("\n\r\t", r#""\n\r\t""#),
        ("\u{8}\u{c}\u{1}\u{1f}", r#""\u0008\u000c\u0001\u001f""#),
        ("é ✓ \u{7f}", "\"é ✓ \u{7f}\""),
    ] {
        assert_eq!(written(text), want, "{text:?}");
    }
}

#[test]
fn floats_take_go_s_layout() {
    for (value, want) in [
        (0.0, "0"),
        (-0.0, "-0"),
        (5.13, "5.13"),
        (20.0, "20"),
        (0.000_001, "0.000001"),
        (0.000_000_1, "1e-7"),
        (1.5e-10, "1.5e-10"),
        (123_456_789_012.5, "123456789012.5"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (-2.5e22, "-2.5e+22"),
    ] {
        assert_eq!(written(&value), want, "{value}");
    }
}

#[test]
fn integers_keys_and_nulls_are_serde_json_s() {
    let mut map = serde_json::Map::new();
    map.insert("max".to_owned(), 268_435_456_u64.into());
    map.insert("a&b".to_owned(), serde_json::Value::Null);
    assert_eq!(written(&map), r#"{"a\u0026b":null,"max":268435456}"#);
}
