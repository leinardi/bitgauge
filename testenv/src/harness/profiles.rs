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

//! The tiers and profiles of testing.md section 5: profiles that shape a client's link, the
//! browsers that run a preset over it, and the selection `HARNESS_PROFILES` and
//! `HARNESS_BROWSERS` make.

use std::fmt;
use std::time::Duration;

use super::gofmt::quote;
use serde::Serialize;

use super::latency::SOURCE_RESERVED;

/// One of the three tiers of testing.md section 5.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    /// The CI tier, every profile Docker can shape on a runner.
    Ci,
    /// The manual range floor, before each release.
    Floor,
    /// The manual range ceiling, unshaped, before each release.
    Ceiling,
}

impl Tier {
    /// The tier's name, as `make harness-<tier>` and the report directory carry it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ci => "ci",
            Self::Floor => "floor",
            Self::Ceiling => "ceiling",
        }
    }
}

impl fmt::Display for Tier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// What sits between the browser and BitGauge.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Proxy {
    /// The browser talks to BitGauge directly.
    #[default]
    None,
    /// Traefik, serving HTTP/1.1.
    Traefik,
    /// Caddy, serving HTTP/2 over its internal CA.
    Caddy,
}

impl Proxy {
    /// The proxy's name as the profile names carry it; empty for none.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "",
            Self::Traefik => "traefik-h1",
            Self::Caddy => "caddy-h2",
        }
    }

    /// Whether the proxy serves TLS: only Caddy does, on its internal CA.
    #[must_use]
    pub const fn https(self) -> bool {
        matches!(self, Self::Caddy)
    }
}

/// What testing.md section 5 holds a profile's path B to in each measured direction.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PathBRule {
    /// The state is recorded, not judged.
    #[default]
    Recorded,
    /// Path B must run over HTTP/2 and give an RPM, measured or uncertain alike: which of the two
    /// a direction reads rests on what the profile does not control (measurement.md section 12.4,
    /// open question 63).
    OverH2,
    /// Path B must read `unavailable_h1`.
    UnavailableH1,
}

/// The path B states the rules read (measurement.md section 12.4).
pub const RESPONSIVENESS_MEASURED: &str = "measured";
/// See [`RESPONSIVENESS_MEASURED`].
pub const RESPONSIVENESS_UNCERTAIN: &str = "uncertain";
/// See [`RESPONSIVENESS_MEASURED`].
pub const RESPONSIVENESS_H1: &str = "unavailable_h1";

/// The Playwright projects of `web/playwright.harness.config.ts`.
pub const BROWSER_CHROMIUM: &str = "chromium";
/// See [`BROWSER_CHROMIUM`].
pub const BROWSER_FIREFOX: &str = "firefox";
/// See [`BROWSER_CHROMIUM`].
pub const BROWSER_WEBKIT: &str = "webkit";

/// The preset a profile runs (measurement.md section 8.5).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Preset {
    /// The Standard preset.
    #[default]
    Standard,
    /// The Extended preset.
    Extended,
}

impl Preset {
    /// The preset's name, as `HARNESS_PRESET` and the result carry it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Extended => "extended",
        }
    }
}

pub(crate) const KBIT: i64 = 1_000;
pub(crate) const MBIT: i64 = 1_000_000;
pub(crate) const GBIT: i64 = 1_000_000_000;

/// The download minimum of each preset (measurement.md section 8.5).
const STANDARD_DOWNLOAD_MINIMUM: Duration = Duration::from_secs(10);
const EXTENDED_DOWNLOAD_MINIMUM: Duration = Duration::from_secs(20);

/// One shaped link.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Profile {
    /// The stable identifier `HARNESS_PROFILES` selects by.
    pub name: String,
    /// The link rate. On an unshaped profile it is the nominal rate of the hardware, recorded but
    /// not applied.
    pub rate_bits_per_second: i64,
    /// The round-trip delay the shaper adds, applied as netem delay on the client's egress.
    pub rtt: Duration,
    /// The netem loss on the client's egress.
    pub loss_percent: f64,
    /// What sits between the browser and BitGauge.
    pub proxy: Proxy,
    /// Routes through the proxy entry point that refuses WebSocket upgrades, forcing the HTTP
    /// latency fallback.
    pub websocket_blocked: bool,
    /// The loaded-latency source the profile must report in each direction, with the samples,
    /// streams and notice testing.md section 5 asks of it; empty for none.
    pub expect_fallback: &'static str,
    /// The preset the browser runs.
    pub preset: Preset,
    /// The path B rule each measured direction is held to.
    pub path_b: PathBRule,
    /// Runs the compatibility clients after the browser (testing.md section 5): BitGauge starts
    /// with the three layers on and `server.trusted_proxies` set to the proxy network
    /// ([`Profile::bitgauge_env`]). It needs an HTTPS proxy, since networkQuality does.
    pub compat: bool,
    /// False on the ceiling tier, which runs on bare metal or a veth without shaping: shaping at
    /// 10 Gbit is CPU-bound and not representative.
    pub shaped: bool,
}

/// One row of the tier table.
#[derive(Clone, Debug, PartialEq)]
pub struct TierSpec {
    /// The tier.
    pub tier: Tier,
    /// Its profiles, in the table's order.
    pub profiles: Vec<Profile>,
    /// The Playwright projects the runner drives.
    pub browsers: Vec<String>,
    /// The runs this tier requires that no runner can make; the report lists them.
    pub manual: Vec<String>,
}

/// A name `lookup` or `select` does not know: never a silent no-op.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SelectError {
    /// No tier has this name.
    UnknownTier(String),
    /// The tier has no profile of this name.
    UnknownProfile {
        /// The name asked for.
        name: String,
        /// The tier searched.
        tier: Tier,
    },
    /// The tier runs no browser of this name.
    UnknownBrowser {
        /// The name asked for.
        name: String,
        /// The tier searched.
        tier: Tier,
    },
}

impl fmt::Display for SelectError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownTier(name) => write!(
                formatter,
                "unknown harness tier {}; want ci, floor or ceiling",
                quote(name)
            ),
            Self::UnknownProfile { name, tier } => write!(
                formatter,
                "unknown harness profile {} in tier {tier}",
                quote(name)
            ),
            Self::UnknownBrowser { name, tier } => write!(
                formatter,
                "unknown harness browser {} in tier {tier}",
                quote(name)
            ),
        }
    }
}

impl std::error::Error for SelectError {}

/// A shaped CI or floor profile on the Standard preset, its other settings off.
fn shaped(name: &str, rate_bits_per_second: i64, rtt_ms: u64) -> Profile {
    Profile {
        name: name.to_owned(),
        rate_bits_per_second,
        rtt: Duration::from_millis(rtt_ms),
        shaped: true,
        ..Profile::default()
    }
}

/// The three tiers of testing.md section 5.
#[must_use]
pub fn tiers() -> Vec<TierSpec> {
    let playwright: Vec<String> = [BROWSER_CHROMIUM, BROWSER_FIREFOX, BROWSER_WEBKIT]
        .map(str::to_owned)
        .to_vec();

    vec![
        TierSpec {
            tier: Tier::Ci,
            profiles: vec![
                shaped("ci-500k-300ms", 500 * KBIT, 300),
                shaped("ci-10m", 10 * MBIT, 0),
                shaped("ci-100m-50ms", 100 * MBIT, 50),
                shaped("ci-1g", GBIT, 0),
                Profile {
                    proxy: Proxy::Traefik,
                    path_b: PathBRule::UnavailableH1,
                    ..shaped("ci-100m-50ms-traefik-h1", 100 * MBIT, 50)
                },
                Profile {
                    proxy: Proxy::Caddy,
                    path_b: PathBRule::OverH2,
                    compat: true,
                    ..shaped("ci-100m-50ms-caddy-h2", 100 * MBIT, 50)
                },
                Profile {
                    proxy: Proxy::Traefik,
                    websocket_blocked: true,
                    expect_fallback: SOURCE_RESERVED,
                    ..shaped("ci-100m-50ms-traefik-h1-ws-blocked", 100 * MBIT, 50)
                },
            ],
            browsers: playwright.clone(),
            manual: Vec::new(),
        },
        TierSpec {
            tier: Tier::Floor,
            profiles: vec![
                Profile {
                    loss_percent: 1.0,
                    ..shaped("floor-300k-300ms-1pct-loss", 300 * KBIT, 300)
                },
                // Extended for the 600 ms profile, which the shortfall rule otherwise covers.
                Profile {
                    preset: Preset::Extended,
                    ..shaped("floor-300k-600ms-vpn", 300 * KBIT, 600)
                },
            ],
            browsers: playwright.clone(),
            manual: vec![
                "one real Android Chrome run over an actual VPN".to_owned(),
                "one real iOS Safari run over an actual VPN".to_owned(),
            ],
        },
        TierSpec {
            tier: Tier::Ceiling,
            profiles: vec![
                Profile {
                    name: "ceiling-2.5g".to_owned(),
                    rate_bits_per_second: 2500 * MBIT,
                    ..Profile::default()
                },
                Profile {
                    name: "ceiling-10g".to_owned(),
                    rate_bits_per_second: 10 * GBIT,
                    ..Profile::default()
                },
            ],
            browsers: playwright,
            manual: vec![
                "real Safari on macOS, on a machine with at least 4 cores, with its CPU and \
                 memory counters"
                    .to_owned(),
            ],
        },
    ]
}

/// One tier, by its name.
///
/// # Errors
///
/// [`SelectError::UnknownTier`] for a name no tier has.
pub fn lookup(tier: &str) -> Result<TierSpec, SelectError> {
    tiers()
        .into_iter()
        .find(|spec| spec.tier.as_str() == tier)
        .ok_or_else(|| SelectError::UnknownTier(tier.to_owned()))
}

/// Narrows a tier to the profiles and browsers named in two comma-separated lists, as
/// `HARNESS_PROFILES` and `HARNESS_BROWSERS` carry them; an empty list keeps everything.
///
/// # Errors
///
/// A name the tier does not have, never a silent no-op.
pub fn select(tier: &TierSpec, profiles: &str, browsers: &str) -> Result<TierSpec, SelectError> {
    let mut spec = tier.clone();

    let names = split_list(profiles);
    if !names.is_empty() {
        let mut selected = Vec::with_capacity(names.len());
        for name in names {
            let profile = spec
                .profiles
                .iter()
                .find(|profile| profile.name == name)
                .ok_or_else(|| SelectError::UnknownProfile {
                    name: name.to_owned(),
                    tier: spec.tier,
                })?;
            selected.push(profile.clone());
        }
        spec.profiles = selected;
    }

    let names = split_list(browsers);
    if !names.is_empty() {
        if let Some(unknown) = names
            .iter()
            .find(|name| !spec.browsers.iter().any(|browser| browser == *name))
        {
            return Err(SelectError::UnknownBrowser {
                name: (*unknown).to_owned(),
                tier: spec.tier,
            });
        }
        spec.browsers = names.into_iter().map(str::to_owned).collect();
    }

    Ok(spec)
}

impl Profile {
    /// The environment BitGauge starts with on this profile: none, or on a Compat profile the
    /// three compatibility toggles and `server.trusted_proxies` set to the proxy network's
    /// subnets, so the layers' absolute URLs come from the proxy's forwarding headers (testing.md
    /// section 5).
    #[must_use]
    pub fn bitgauge_env(&self, proxy_subnets: &[String]) -> Vec<String> {
        if !self.compat {
            return Vec::new();
        }
        vec![
            "BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED=true".to_owned(),
            "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=true".to_owned(),
            "BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true".to_owned(),
            format!(
                "BITGAUGE_SERVER__TRUSTED_PROXIES={}",
                proxy_subnets.join(",")
            ),
        ]
    }
}

/// How long each iperf3 reference run lasts. testing.md asks for the preset's steady-window
/// duration, but the steady window is adaptive (measurement.md section 8.4) and a run's own window
/// is known only after it. The harness uses the preset's download minimum (section 8.5), the
/// nominal phase the window sits in, for both directions; iperf3's own ramp is omitted on top.
/// This is a recorded choice (the accuracy-harness skill, section 4).
#[must_use]
pub const fn reference_duration(preset: Preset) -> Duration {
    match preset {
        Preset::Extended => EXTENDED_DOWNLOAD_MINIMUM,
        Preset::Standard => STANDARD_DOWNLOAD_MINIMUM,
    }
}

/// The non-empty, trimmed names of a comma-separated list.
fn split_list(list: &str) -> Vec<&str> {
    list.split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn by_name(name: &str) -> Option<Profile> {
        tiers()
            .into_iter()
            .flat_map(|spec| spec.profiles)
            .find(|profile| profile.name == name)
    }

    /// Go: `TestTiers`. Each tier's profile count and browsers, unique profile names, and only the
    /// ceiling tier unshaped.
    #[test]
    fn tiers_follow_testing_md() {
        let mut failures = Vec::new();
        let mut seen = Vec::new();
        for spec in tiers() {
            let count = match spec.tier {
                Tier::Ci => 7,
                Tier::Floor | Tier::Ceiling => 2,
            };
            if spec.profiles.len() != count {
                failures.push(format!(
                    "tier {} has {} profiles, testing.md lists {count}",
                    spec.tier,
                    spec.profiles.len()
                ));
            }
            if spec.browsers != [BROWSER_CHROMIUM, BROWSER_FIREFOX, BROWSER_WEBKIT] {
                failures.push(format!("tier {} runs {:?}", spec.tier, spec.browsers));
            }
            for profile in spec.profiles {
                if seen.contains(&profile.name) {
                    failures.push(format!("profile name {} is used twice", profile.name));
                }
                if profile.shaped == (spec.tier == Tier::Ceiling) {
                    failures.push(format!(
                        "{}: shaped = {}; only the ceiling tier runs unshaped",
                        profile.name, profile.shaped
                    ));
                }
                seen.push(profile.name);
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestProfileValues`.
    #[test]
    fn profile_values() {
        let ms = Duration::from_millis;
        let mut failures = Vec::new();
        for (name, want) in [
            (
                "ci-500k-300ms",
                Profile {
                    rate_bits_per_second: 500_000,
                    rtt: ms(300),
                    ..Profile::default()
                },
            ),
            (
                "ci-1g",
                Profile {
                    rate_bits_per_second: 1_000_000_000,
                    ..Profile::default()
                },
            ),
            (
                "ci-100m-50ms-caddy-h2",
                Profile {
                    rate_bits_per_second: 100_000_000,
                    rtt: ms(50),
                    proxy: Proxy::Caddy,
                    path_b: PathBRule::OverH2,
                    compat: true,
                    ..Profile::default()
                },
            ),
            (
                "ci-100m-50ms-traefik-h1",
                Profile {
                    rate_bits_per_second: 100_000_000,
                    rtt: ms(50),
                    proxy: Proxy::Traefik,
                    path_b: PathBRule::UnavailableH1,
                    ..Profile::default()
                },
            ),
            (
                "ci-100m-50ms-traefik-h1-ws-blocked",
                Profile {
                    rate_bits_per_second: 100_000_000,
                    rtt: ms(50),
                    proxy: Proxy::Traefik,
                    websocket_blocked: true,
                    expect_fallback: SOURCE_RESERVED,
                    ..Profile::default()
                },
            ),
            (
                "floor-300k-300ms-1pct-loss",
                Profile {
                    rate_bits_per_second: 300_000,
                    rtt: ms(300),
                    loss_percent: 1.0,
                    ..Profile::default()
                },
            ),
            (
                "floor-300k-600ms-vpn",
                Profile {
                    rate_bits_per_second: 300_000,
                    rtt: ms(600),
                    preset: Preset::Extended,
                    ..Profile::default()
                },
            ),
            (
                "ceiling-10g",
                Profile {
                    rate_bits_per_second: 10_000_000_000,
                    ..Profile::default()
                },
            ),
        ] {
            let mut got = by_name(name).unwrap_or_default();
            got.name = String::new();
            got.shaped = false;
            if got != want {
                failures.push(format!("{name} = {got:?}, want {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestCompatProfile`. ci-100m-50ms-caddy-h2 is the only profile with Compat.
    #[test]
    fn compat_profile() {
        let compat: Vec<String> = tiers()
            .into_iter()
            .flat_map(|spec| spec.profiles)
            .filter(|profile| profile.compat)
            .map(|profile| profile.name)
            .collect();
        assert_eq!(compat, ["ci-100m-50ms-caddy-h2"]);
    }

    /// Go: `TestCompatNeedsHTTPS`. A Compat profile runs behind an HTTPS proxy, and only a Compat
    /// profile starts BitGauge with an environment.
    #[test]
    fn compat_needs_https() {
        let mut failures = Vec::new();
        let subnets = ["172.30.0.0/16".to_owned(), "fd00:30::/64".to_owned()];
        for profile in tiers().into_iter().flat_map(|spec| spec.profiles) {
            let env = profile.bitgauge_env(&subnets);
            if !profile.compat {
                if !env.is_empty() {
                    failures.push(format!(
                        "{} is not Compat but starts BitGauge with {env:?}",
                        profile.name
                    ));
                }
                continue;
            }
            if !profile.proxy.https() {
                failures.push(format!(
                    "{} is Compat behind {:?}, which serves no HTTPS",
                    profile.name, profile.proxy
                ));
            }
            let want = [
                "BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED=true",
                "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=true",
                "BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true",
                "BITGAUGE_SERVER__TRUSTED_PROXIES=172.30.0.0/16,fd00:30::/64",
            ];
            if env != want {
                failures.push(format!("{} starts BitGauge with {env:?}", profile.name));
            }
        }
        for (proxy, https) in [
            (Proxy::None, false),
            (Proxy::Traefik, false),
            (Proxy::Caddy, true),
        ] {
            if proxy.https() != https {
                failures.push(format!("{proxy:?}.https() != {https}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    /// Go: `TestSelect`.
    #[test]
    fn select_narrows_or_refuses() {
        let spec = lookup("ci").expect("the CI tier");
        let selected = select(&spec, " ci-10m , ci-1g", "firefox").expect("a selection");
        assert_eq!(selected.profiles.len(), 2);
        assert_eq!(selected.profiles[1].name, "ci-1g");
        assert_eq!(selected.browsers, ["firefox"]);

        let everything = select(&spec, "", "").expect("everything");
        assert_eq!(everything.profiles.len(), 7);
        assert_eq!(everything.browsers.len(), 3);

        let mut failures = Vec::new();
        for (profiles, browsers) in [
            ("ci-typo", ""),
            ("", "safari"),
            ("floor-300k-600ms-vpn", ""),
        ] {
            if select(&spec, profiles, browsers).is_ok() {
                failures.push(format!(
                    "select({profiles:?}, {browsers:?}) accepted a name the tier does not have"
                ));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));

        let unknown = lookup("nightly").expect_err("an unknown tier");
        assert_eq!(
            unknown.to_string(),
            "unknown harness tier \"nightly\"; want ci, floor or ceiling"
        );
        assert_eq!(
            select(&spec, "ci-typo", "")
                .expect_err("an unknown profile")
                .to_string(),
            "unknown harness profile \"ci-typo\" in tier ci"
        );
    }
}
