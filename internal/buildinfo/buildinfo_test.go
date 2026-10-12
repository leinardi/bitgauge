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

package buildinfo

import "testing"

func TestInfoDefaultsWhenUnstamped(t *testing.T) {
	t.Parallel()

	// The test binary is built without -ldflags -X, so every stamp is empty.
	got := Info()
	want := Build{Version: DefaultVersion, Commit: Unknown, Date: Unknown}

	if got != want {
		t.Fatalf("Info() = %+v, want %+v", got, want)
	}
}

func TestResolve(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                  string
		version, commit, date string
		want                  Build
	}{
		{
			name: "nothing stamped",
			want: Build{Version: "dev", Commit: "unknown", Date: "unknown"},
		},
		{
			name:    "everything stamped",
			version: "v0.1.0",
			commit:  "a1b2c3d4e5f6",
			date:    "2026-10-12T08:00:00Z",
			want:    Build{Version: "v0.1.0", Commit: "a1b2c3d4e5f6", Date: "2026-10-12T08:00:00Z"},
		},
		{
			name:    "only the version stamped",
			version: "v0.1.0-3-gabcdef0-dirty",
			want:    Build{Version: "v0.1.0-3-gabcdef0-dirty", Commit: "unknown", Date: "unknown"},
		},
		{
			name:   "commit and date stamped, version empty",
			commit: "abc",
			date:   "2026-10-12T08:00:00Z",
			want:   Build{Version: "dev", Commit: "abc", Date: "2026-10-12T08:00:00Z"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := resolve(tc.version, tc.commit, tc.date)
			if got != tc.want {
				t.Fatalf(
					"resolve(%q, %q, %q) = %+v, want %+v",
					tc.version,
					tc.commit,
					tc.date,
					got,
					tc.want,
				)
			}
		})
	}
}
