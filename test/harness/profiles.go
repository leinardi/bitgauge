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

// Package harness is the accuracy harness of testing.md section 5: profiles that shape a client's
// link, a browser that runs a preset over it, and iperf3 measuring the same path as the reference.
//
// The profile table, the report, the tolerance evaluator and the image pins are plain Go,
// untagged, and unit-tested in every go test run. The runners that build the topology over the
// docker CLI carry the harness build tag. The evaluator judges each run against testing.md section
// 5 on the iperf3 reference method of decisions.md section 35.
package harness

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

// Tier is one of the three tiers of testing.md section 5.
type Tier string

// The tiers.
const (
	TierCI      Tier = "ci"
	TierFloor   Tier = "floor"
	TierCeiling Tier = "ceiling"
)

// Proxy is what sits between the browser and BitGauge.
type Proxy string

// The proxies of the CI tier. Traefik serves HTTP/1.1, Caddy HTTP/2 over its internal CA.
const (
	ProxyNone    Proxy = ""
	ProxyTraefik Proxy = "traefik-h1"
	ProxyCaddy   Proxy = "caddy-h2"
)

// The Playwright projects of web/playwright.harness.config.ts.
const (
	BrowserChromium = "chromium"
	BrowserFirefox  = "firefox"
	BrowserWebKit   = "webkit"
)

// The presets a profile runs (measurement.md section 8.5).
const (
	PresetStandard = "standard"
	PresetExtended = "extended"
)

const (
	kbit = 1_000
	mbit = 1_000_000
	gbit = 1_000_000_000
)

// The download minimum of each preset (measurement.md section 8.5).
const (
	standardDownloadMinimum = 10 * time.Second
	extendedDownloadMinimum = 20 * time.Second
)

var (
	errUnknownTier    = errors.New("unknown harness tier")
	errUnknownProfile = errors.New("unknown harness profile")
	errUnknownBrowser = errors.New("unknown harness browser")
)

// Profile is one shaped link.
type Profile struct {
	// Name is the stable identifier HARNESS_PROFILES selects by.
	Name string
	// DocPhrase is how testing.md section 5 writes this profile, word for word.
	DocPhrase string
	// RateBitsPerSecond is the link rate. On an unshaped profile it is the nominal rate of the
	// hardware, recorded but not applied.
	RateBitsPerSecond int64
	// RTT is the round-trip delay the shaper adds, applied as netem delay on the client's egress.
	RTT time.Duration
	// LossPercent is the netem loss on the client's egress.
	LossPercent float64
	Proxy       Proxy
	// WebSocketBlocked routes through the proxy entry point that refuses WebSocket upgrades,
	// forcing the HTTP latency fallback.
	WebSocketBlocked bool
	// ExpectFallback is the loaded-latency source the profile must report in each direction, with
	// the samples, streams and notice testing.md section 5 asks of it; empty for none.
	ExpectFallback string
	Preset         string
	// Shaped is false on the ceiling tier, which runs on bare metal or a veth without shaping:
	// shaping at 10 Gbit is CPU-bound and not representative.
	Shaped bool
}

// TierSpec is one row of the tier table.
type TierSpec struct {
	Tier     Tier
	Profiles []Profile
	// Browsers are the Playwright projects the runner drives.
	Browsers []string
	// Manual are the runs this tier requires that no runner can make; the report lists them.
	Manual []string
}

// Tiers returns the three tiers of testing.md section 5.
func Tiers() []TierSpec {
	playwright := []string{BrowserChromium, BrowserFirefox, BrowserWebKit}

	return []TierSpec{
		{
			Tier: TierCI,
			Profiles: []Profile{
				{
					Name:              "ci-500k-300ms",
					DocPhrase:         "500 kbit/s + 300 ms",
					RateBitsPerSecond: 500 * kbit,
					RTT:               300 * time.Millisecond,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-10m",
					DocPhrase:         "10 Mbit",
					RateBitsPerSecond: 10 * mbit,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-100m-50ms",
					DocPhrase:         "100 Mbit + 50 ms",
					RateBitsPerSecond: 100 * mbit,
					RTT:               50 * time.Millisecond,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-1g",
					DocPhrase:         "1 Gbit",
					RateBitsPerSecond: gbit,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-100m-50ms-traefik-h1",
					DocPhrase:         "through Traefik (h1)",
					RateBitsPerSecond: 100 * mbit,
					RTT:               50 * time.Millisecond,
					Proxy:             ProxyTraefik,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-100m-50ms-caddy-h2",
					DocPhrase:         "through Caddy (h2)",
					RateBitsPerSecond: 100 * mbit,
					RTT:               50 * time.Millisecond,
					Proxy:             ProxyCaddy,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "ci-100m-50ms-traefik-h1-ws-blocked",
					DocPhrase:         "with WebSocket upgrades blocked",
					RateBitsPerSecond: 100 * mbit,
					RTT:               50 * time.Millisecond,
					Proxy:             ProxyTraefik,
					WebSocketBlocked:  true,
					ExpectFallback:    SourceReserved,
					Preset:            PresetStandard,
					Shaped:            true,
				},
			},
			Browsers: playwright,
		},
		{
			Tier: TierFloor,
			Profiles: []Profile{
				{
					Name:              "floor-300k-300ms-1pct-loss",
					DocPhrase:         "300 kbit/s + 300 ms + 1 % loss",
					RateBitsPerSecond: 300 * kbit,
					RTT:               300 * time.Millisecond,
					LossPercent:       1,
					Preset:            PresetStandard,
					Shaped:            true,
				},
				{
					Name:              "floor-300k-600ms-vpn",
					DocPhrase:         "300 kbit/s + 600 ms (VPN over mobile)",
					RateBitsPerSecond: 300 * kbit,
					RTT:               600 * time.Millisecond,
					// Extended for the 600 ms profile, which the shortfall rule otherwise covers.
					Preset: PresetExtended,
					Shaped: true,
				},
			},
			Browsers: playwright,
			Manual: []string{
				"one real Android Chrome run over an actual VPN",
				"one real iOS Safari run over an actual VPN",
			},
		},
		{
			Tier: TierCeiling,
			Profiles: []Profile{
				{
					Name:              "ceiling-2.5g",
					DocPhrase:         "2.5 Gbit",
					RateBitsPerSecond: 2500 * mbit,
					Preset:            PresetStandard,
				},
				{
					Name:              "ceiling-10g",
					DocPhrase:         "10 Gbit",
					RateBitsPerSecond: 10 * gbit,
					Preset:            PresetStandard,
				},
			},
			Browsers: playwright,
			Manual: []string{
				"real Safari on macOS, on a machine with at least 4 cores, with its CPU and memory counters",
			},
		},
	}
}

// Lookup returns one tier.
func Lookup(tier Tier) (TierSpec, error) {
	for _, spec := range Tiers() {
		if spec.Tier == tier {
			return spec, nil
		}
	}

	return TierSpec{}, fmt.Errorf("%w %q; want ci, floor or ceiling", errUnknownTier, tier)
}

// Select narrows a tier to the profiles and browsers named in two comma-separated lists, as
// HARNESS_PROFILES and HARNESS_BROWSERS carry them; an empty list keeps everything. A name the tier
// does not have is an error, never a silent no-op.
func Select(tier *TierSpec, profiles, browsers string) (TierSpec, error) {
	spec := *tier

	if names := splitList(profiles); len(names) > 0 {
		var selected []Profile

		for _, name := range names {
			index := slices.IndexFunc(spec.Profiles, func(p Profile) bool { return p.Name == name })
			if index < 0 {
				return TierSpec{}, fmt.Errorf(
					"%w %q in tier %s",
					errUnknownProfile,
					name,
					spec.Tier,
				)
			}

			selected = append(selected, spec.Profiles[index])
		}

		spec.Profiles = selected
	}

	if names := splitList(browsers); len(names) > 0 {
		for _, name := range names {
			if !slices.Contains(spec.Browsers, name) {
				return TierSpec{}, fmt.Errorf(
					"%w %q in tier %s",
					errUnknownBrowser,
					name,
					spec.Tier,
				)
			}
		}

		spec.Browsers = names
	}

	return spec, nil
}

// ReferenceDuration is how long each iperf3 reference run lasts. testing.md asks for the preset's
// steady-window duration, but the steady window is adaptive (measurement.md section 8.4) and a run's
// own window is known only after it. The harness uses the preset's download minimum (section 8.5),
// the nominal phase the window sits in, for both directions; iperf3's own ramp is omitted on top.
// This is a recorded choice (the accuracy-harness skill, section 4).
func ReferenceDuration(preset string) time.Duration {
	if preset == PresetExtended {
		return extendedDownloadMinimum
	}

	return standardDownloadMinimum
}

func splitList(list string) []string {
	var names []string

	for name := range strings.SplitSeq(list, ",") {
		if trimmed := strings.TrimSpace(name); trimmed != "" {
			names = append(names, trimmed)
		}
	}

	return names
}
