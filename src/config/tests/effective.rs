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

//! The effective configuration of the startup line.

use jiff::SignedDuration;

use crate::config::{Config, EffectiveValue, LabelRule, Size, Warmup, effective};

/// Go: `TestEffective`. The Go test rendered the list through slog's text and JSON handlers; the
/// rendering is the logger's (phase 6), so this checks the typed entries it renders.
#[test]
fn effective_lists_every_key() {
    let mut config = Config::default();
    config.server.trusted_proxies = vec!["172.20.0.2/32".parse().expect("a CIDR")];
    config.server.labels = vec![
        LabelRule {
            cidr: Some("10.8.0.0/24".parse().expect("a CIDR")),
            label: "VPN".to_owned(),
        },
        LabelRule {
            cidr: Some("fd7a:115c:a1e0::/48".parse().expect("a CIDR")),
            label: "Tailscale".to_owned(),
        },
    ];
    config.test_defaults.download.max_duration = Some(SignedDuration::from_secs(30));
    config.test_defaults.warmup = Warmup::Fixed(SignedDuration::from_secs(3));

    let entries = effective(&config);
    let value = |key: &str| {
        entries
            .iter()
            .find(|(name, _)| *name == key)
            .map(|(_, value)| value.clone())
    };
    let text = |text: &str| Some(EffectiveValue::Text(text.to_owned()));
    let list = |items: &[&str]| {
        Some(EffectiveValue::List(
            items.iter().map(|&item| item.to_owned()).collect(),
        ))
    };

    assert_eq!(value("server.listen"), text(":8080"));
    assert_eq!(value("server.trusted_proxies"), list(&["172.20.0.2/32"]));
    assert_eq!(
        value("server.labels"),
        list(&["10.8.0.0/24=VPN", "fd7a:115c:a1e0::/48=Tailscale"])
    );
    assert_eq!(value("test_defaults.download.max_duration"), text("30s"));
    assert_eq!(value("test_defaults.download.min_duration"), text(""));
    assert_eq!(value("test_defaults.warmup"), text("3s"));
    assert_eq!(
        value("limits.max_download_bytes"),
        Some(EffectiveValue::Size(Size::MIB.times(256)))
    );
    assert_eq!(value("metrics.path"), text("/metrics"));
    assert_eq!(value("metrics.enabled"), Some(EffectiveValue::Bool(false)));

    let keys: Vec<&str> = entries.iter().map(|&(key, _)| key).collect();
    let mut sorted = keys.clone();
    sorted.sort_unstable();
    assert_eq!(keys, sorted, "sorted by key");
    assert_eq!(
        keys.len(),
        35,
        "one entry per key of configuration.md section 2"
    );

    let defaults = effective(&Config::default());
    assert!(defaults.contains(&(
        "test_defaults.warmup",
        EffectiveValue::Text("auto".to_owned())
    )));
    assert!(defaults.contains(&("server.labels", EffectiveValue::List(Vec::new()))));
}
