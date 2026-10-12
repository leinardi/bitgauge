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

import (
	"testing"
	"time"
)

func TestPreset(t *testing.T) {
	t.Parallel()

	// measurement.md section 8.5.
	for name, want := range map[string]PresetValues{
		"quick": {
			Download:  [2]time.Duration{5 * time.Second, 10 * time.Second},
			Upload:    [2]time.Duration{5 * time.Second, 10 * time.Second},
			PingCount: 10,
		},
		"standard": {
			Download:  [2]time.Duration{10 * time.Second, 20 * time.Second},
			Upload:    [2]time.Duration{15 * time.Second, 25 * time.Second},
			PingCount: 20,
		},
		"extended": {
			Download:  [2]time.Duration{20 * time.Second, 40 * time.Second},
			Upload:    [2]time.Duration{20 * time.Second, 40 * time.Second},
			PingCount: 50,
		},
	} {
		got, known := Preset(name)
		if !known || got != want {
			t.Fatalf("Preset(%q) = %+v, %v; want %+v", name, got, known, want)
		}
	}

	for _, name := range []string{"continuous", "", "Standard"} {
		if _, known := Preset(name); known {
			t.Fatalf("Preset(%q) is known, want unknown in this release", name)
		}
	}
}
