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

//! `GET /api/v1/info`.

use http::{Request, StatusCode};
use jiff::SignedDuration;
use serde_json::{Value, json};

use super::support::{body_bytes, envelope, header};
use crate::buildinfo::Build;
use crate::clientip::{Client, Labeler, Rule};
use crate::config::{Config, Size, Streams, Warmup};
use crate::handlers::{CODE_INTERNAL, Epoch, Info};

pub(super) const TEST_BUILD: Build = Build {
    version: "0.1.0",
    commit: "a1b2c3d",
    date: "2026-09-30T12:00:00Z",
};

pub(super) fn test_epoch() -> Epoch {
    Epoch {
        id: "k3V9qW2rT0aY".to_owned(),
        grid_offset: 1234,
    }
}

pub(super) fn info(config: &Config, labeler: Labeler) -> Info {
    Info::new(config, TEST_BUILD, &test_epoch(), labeler)
}

pub(super) fn request_from(client: &str) -> Request<()> {
    let mut request = Request::get("/api/v1/info").body(()).expect("a request");
    request.extensions_mut().insert(Client {
        address: client.parse().expect("an address"),
        peer_trusted: false,
    });
    request
}

/// The info response for `client`, decoded generically, so the assertions see the JSON keys
/// and null exactly as a client does.
pub(super) async fn fetch(info: &Info, client: &str) -> Value {
    let response = info.respond(&request_from(client));
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(header(&response, "cache-control"), "no-store");
    assert_eq!(header(&response, "content-type"), "application/json");
    serde_json::from_slice(&body_bytes(response).await).expect("JSON")
}

fn rule(prefix: &str, label: &str) -> Rule {
    Rule {
        prefix: prefix.parse().expect("a CIDR"),
        label: label.to_owned(),
    }
}

/// Go: `TestInfoEveryField`: the sample of wire-protocol.md section 5, with the default
/// configuration.
#[tokio::test]
async fn info_every_field() {
    let got = fetch(
        &info(&Config::default(), Labeler::default()),
        "100.101.4.17",
    )
    .await;
    assert_eq!(
        got,
        json!({
            "server": {
                "name": "BitGauge", "version": "0.1.0", "commit": "a1b2c3d",
                "buildDate": "2026-09-30T12:00:00Z", "epoch": "k3V9qW2rT0aY", "basePath": "/"
            },
            "client": {
                "ip": "100.101.4.17", "ipVersion": 4, "addressClass": "cgnat",
                "suggestedLabel": "VPN"
            },
            "limits": {
                "maxDownloadBytes": 268_435_456, "maxUploadBytes": 268_435_456,
                "maxStreamsPerClient": 8, "uploadLifetimeMs": 120_000, "bucketMs": 100
            },
            "defaults": {
                "preset": "standard", "phases": ["idle", "download", "upload"],
                "streams": { "mode": "auto", "fixed": 3, "max": 6 },
                "download": { "minMs": 10_000, "maxMs": 20_000 },
                "upload": { "minMs": 15_000, "maxMs": 25_000 },
                "dataCapBytes": null, "units": "bits", "warmup": "auto", "pingCount": 20,
                "overheadCompensationPercent": 0
            },
            "compat": { "openspeedtest": false, "librespeed": false, "networkquality": false }
        })
    );
}

/// The default configuration's body byte for byte, as Go's `json.Marshal` writes it: `0`, not
/// `0.0` (no Go test: Go's encoder was the standard library's).
#[tokio::test]
async fn info_bytes_are_go_s() {
    let mut config = Config::default();
    config.server.display_name = "Speed <Lab> & co".to_owned();
    let response = info(&config, Labeler::default()).respond(&request_from("10.0.0.1"));
    let body = String::from_utf8(body_bytes(response).await.to_vec()).expect("UTF-8");
    assert!(
        body.starts_with(r#"{"server":{"name":"Speed \u003cLab\u003e \u0026 co","#),
        "{body}"
    );
    assert!(
        body.contains(r#""overheadCompensationPercent":0}"#),
        "{body}"
    );
}

/// Go: `TestInfoAddressClassAndLabel`
#[tokio::test]
async fn info_address_class_and_label() {
    let info = info(&Config::default(), Labeler::default());
    for (ip, class, label, version) in [
        ("127.0.0.1", "loopback", json!("LAN"), 4),
        ("::1", "loopback", json!("LAN"), 6),
        ("10.1.2.3", "private", json!("LAN"), 4),
        ("172.16.0.9", "private", json!("LAN"), 4),
        ("192.168.1.42", "private", json!("LAN"), 4),
        ("169.254.10.1", "link-local", json!("LAN"), 4),
        ("fe80::1", "link-local", json!("LAN"), 6),
        ("fd00::5", "ula", json!("LAN"), 6),
        ("fd7a:115c:a1e0::17", "ula", json!("VPN"), 6),
        ("100.64.0.1", "cgnat", json!("VPN"), 4),
        ("100.127.255.254", "cgnat", json!("VPN"), 4),
        ("100.128.0.1", "public", Value::Null, 4),
        ("203.0.113.9", "public", Value::Null, 4),
        ("2001:db8::9", "public", Value::Null, 6),
    ] {
        assert_eq!(
            fetch(&info, ip).await["client"],
            json!({ "ip": ip, "ipVersion": version, "addressClass": class, "suggestedLabel": label }),
            "{ip}"
        );
    }
}

/// Go: `TestInfoLabelsFromServerLabels`
#[tokio::test]
async fn info_labels_from_server_labels() {
    let labeler = Labeler::new(&[
        rule("10.0.0.0/8", "LAN"),
        rule("10.8.0.0/24", "VPN"),
        rule("203.0.113.0/24", "Branch office"),
    ]);
    let info = info(&Config::default(), labeler);
    for (ip, want) in [
        ("10.8.0.7", json!("VPN")),
        ("10.9.0.7", json!("LAN")),
        ("203.0.113.9", json!("Branch office")),
        ("198.51.100.1", Value::Null),
        ("100.64.0.1", json!("VPN")),
    ] {
        assert_eq!(
            fetch(&info, ip).await["client"]["suggestedLabel"],
            want,
            "{ip}"
        );
    }
}

/// Go: `TestInfoDefaultsPerPreset`
#[tokio::test]
async fn info_defaults_per_preset() {
    for (preset, download, upload, ping_count) in [
        ("quick", json!([5000, 10_000]), json!([5000, 10_000]), 10),
        (
            "standard",
            json!([10_000, 20_000]),
            json!([15_000, 25_000]),
            20,
        ),
        (
            "extended",
            json!([20_000, 40_000]),
            json!([20_000, 40_000]),
            50,
        ),
        // No minimum and no maximum, and the preset's 20 pings.
        ("continuous", json!([null, null]), json!([null, null]), 20),
    ] {
        let mut config = Config::default();
        config.test_defaults.preset = preset.to_owned();
        let defaults =
            fetch(&info(&config, Labeler::default()), "10.0.0.1").await["defaults"].clone();
        for (name, want) in [("download", &download), ("upload", &upload)] {
            assert_eq!(
                defaults[name],
                json!({ "minMs": want[0], "maxMs": want[1] }),
                "{preset}: {name}"
            );
        }
        assert_eq!(defaults["preset"], preset);
        assert_eq!(defaults["pingCount"], ping_count, "{preset}");
    }
}

/// Go: `TestInfoContinuousIgnoresTheDurationKeys`
#[tokio::test]
async fn info_continuous_ignores_the_duration_keys() {
    let mut config = Config::default();
    let defaults = &mut config.test_defaults;
    defaults.preset = "continuous".to_owned();
    defaults.download.min_duration = Some(SignedDuration::from_secs(30));
    defaults.upload.max_duration = Some(SignedDuration::from_secs(90));
    defaults.ping_count = 30;
    let resolved = fetch(&info(&config, Labeler::default()), "10.0.0.1").await["defaults"].clone();
    let none = json!({ "minMs": null, "maxMs": null });
    assert_eq!((&resolved["download"], &resolved["upload"]), (&none, &none));
    assert_eq!(resolved["pingCount"], 30, "the configured 30");
}

/// Go: `TestInfoDefaultsFromConfiguration`
#[tokio::test]
async fn info_defaults_from_configuration() {
    let mut config = Config::default();
    let defaults = &mut config.test_defaults;
    defaults.preset = "quick".to_owned();
    defaults.phases = vec!["upload".to_owned(), "download".to_owned()];
    defaults.streams = Streams {
        mode: "fixed".to_owned(),
        fixed: 2,
        max: 4,
    };
    // One bound set per range: the other keeps the preset's value.
    defaults.download.min_duration = Some(SignedDuration::from_secs(7));
    defaults.upload.max_duration = Some(SignedDuration::from_secs(90));
    defaults.data_cap = Size::MIB.times(500);
    defaults.units = "bytes".to_owned();
    defaults.warmup = Warmup::Fixed(SignedDuration::from_secs(3));
    defaults.ping_count = 30;
    defaults.overhead_compensation_percent = 5.13;
    let got = fetch(&info(&config, Labeler::default()), "10.0.0.1").await;
    assert_eq!(
        got["defaults"],
        json!({
            "preset": "quick", "phases": ["upload", "download"],
            "streams": { "mode": "fixed", "fixed": 2, "max": 4 },
            "download": { "minMs": 7000, "maxMs": 10_000 },
            "upload": { "minMs": 5000, "maxMs": 90_000 },
            "dataCapBytes": 524_288_000_u64, "units": "bytes", "warmup": 3000, "pingCount": 30,
            "overheadCompensationPercent": 5.13
        })
    );
}

/// Go: `TestInfoStreamsModeFollowsThePreset`
#[tokio::test]
async fn info_streams_mode_follows_the_preset() {
    for (preset, mode, want) in [
        // An unset mode is the preset's: Quick's fixed 3 streams.
        ("quick", "", "fixed"),
        // A mode set in the configuration stands, whatever the preset.
        ("quick", "auto", "auto"),
        ("standard", "", "auto"),
        ("continuous", "", "auto"),
    ] {
        let mut config = Config::default();
        config.test_defaults.preset = preset.to_owned();
        config.test_defaults.streams.mode = mode.to_owned();
        let got = fetch(&info(&config, Labeler::default()), "10.0.0.1").await;
        assert_eq!(
            got["defaults"]["streams"],
            json!({ "mode": want, "fixed": 3, "max": 6 }),
            "{preset}, {mode:?}"
        );
    }
}

/// Go: `TestInfoWithoutClientAddressIs500`
#[tokio::test]
async fn info_without_a_client_is_500() {
    let request = Request::get("/api/v1/info").body(()).expect("a request");
    let response = info(&Config::default(), Labeler::default()).respond(&request);
    envelope(response, StatusCode::INTERNAL_SERVER_ERROR, CODE_INTERNAL).await;
}

/// Go: `TestInfoReportsTheCompatibilityToggles`
#[tokio::test]
async fn info_reports_the_compatibility_toggles() {
    let mut config = Config::default();
    config.compat.openspeedtest.enabled = true;
    config.compat.librespeed.enabled = true;
    let got = fetch(&info(&config, Labeler::default()), "10.0.0.5").await;
    assert_eq!(
        got["compat"],
        json!({ "openspeedtest": true, "librespeed": true, "networkquality": false })
    );
    config.compat.networkquality.enabled = true;
    let got = fetch(&info(&config, Labeler::default()), "10.0.0.5").await;
    assert_eq!(
        got["compat"],
        json!({ "openspeedtest": true, "librespeed": true, "networkquality": true })
    );
}
