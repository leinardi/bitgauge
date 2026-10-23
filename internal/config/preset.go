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

package config

import "time"

// The stream modes of test_defaults.streams.mode.
const (
	streamsModeAuto   = "auto"
	streamsModeFixed  = "fixed"
	streamsModeSingle = "single"
)

// PresetValues are the values of a preset (measurement.md section 8.5) that an empty
// test_defaults key stands for: the download and upload minimum and maximum durations, the
// stream mode an empty streams.mode means, and the idle ping count that ping_count 0 means.
// Continuous is not Bounded: it has no minimum and no maximum, its durations are zero and its
// duration keys are ignored.
type PresetValues struct {
	StreamsMode string
	Download    [2]time.Duration
	Upload      [2]time.Duration
	PingCount   int
	Bounded     bool
}

// presets holds the presets of this release.
var presets = map[string]PresetValues{
	presetQuick: {
		StreamsMode: streamsModeFixed,
		Download:    [2]time.Duration{5 * time.Second, 10 * time.Second},
		Upload:      [2]time.Duration{5 * time.Second, 10 * time.Second},
		PingCount:   10,
		Bounded:     true,
	},
	presetStandard: {
		StreamsMode: streamsModeAuto,
		Download:    [2]time.Duration{10 * time.Second, 20 * time.Second},
		Upload:      [2]time.Duration{15 * time.Second, 25 * time.Second},
		PingCount:   20,
		Bounded:     true,
	},
	presetExtended: {
		StreamsMode: streamsModeAuto,
		Download:    [2]time.Duration{20 * time.Second, 40 * time.Second},
		Upload:      [2]time.Duration{20 * time.Second, 40 * time.Second},
		PingCount:   50,
		Bounded:     true,
	},
	presetContinuous: {
		StreamsMode: streamsModeAuto,
		PingCount:   20,
	},
}

// Preset returns the values of the named preset, and false for a preset this release does
// not have.
func Preset(name string) (PresetValues, bool) {
	values, known := presets[name]

	return values, known
}
