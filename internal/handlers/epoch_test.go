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

package handlers

import (
	"encoding/base64"
	"testing"
)

func TestNewEpoch(t *testing.T) {
	t.Parallel()

	first, second := NewEpoch(), NewEpoch()

	for _, epoch := range []Epoch{first, second} {
		decoded, err := base64.RawURLEncoding.DecodeString(epoch.ID)
		if err != nil || len(epoch.ID) != 12 || len(decoded) != 9 {
			t.Fatalf("ID %q, want 12 base64url characters of 9 random bytes", epoch.ID)
		}

		if epoch.GridOffset < 0 || epoch.GridOffset >= 1<<32 {
			t.Fatalf("GridOffset %d, want [0, 2^32)", epoch.GridOffset)
		}
	}

	// 72 random bits colliding would be a broken source, not bad luck.
	if first.ID == second.ID {
		t.Fatalf("two epochs share the ID %q", first.ID)
	}
}
