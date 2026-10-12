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
	"testing"
	"time"
)

func TestGridCellsAndMilliseconds(t *testing.T) {
	t.Parallel()

	origin := time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)
	clock := &fakeClock{now: origin}
	grid := NewGrid(clock, 7)

	for _, test := range []struct {
		after time.Duration
		cell  int64
		ms    int64
	}{
		// The origin is the start of cell K, at K × 100 ms.
		{0, 7, 700},
		{99*time.Millisecond + 999*time.Microsecond, 7, 799},
		// A cell's end is the next cell's start.
		{100 * time.Millisecond, 8, 800},
		{time.Hour + 50*time.Millisecond, 7 + 36000, 700 + 3600050},
	} {
		instant := origin.Add(test.after)
		if grid.Cell(instant) != test.cell || grid.Ms(instant) != test.ms ||
			grid.Cell(instant) != grid.Ms(instant)/100 {
			t.Fatalf("after %v: cell %d, ms %d; want %d and %d",
				test.after, grid.Cell(instant), grid.Ms(instant), test.cell, test.ms)
		}
	}

	clock.Set(origin.Add(time.Minute))

	if !grid.Now().Equal(origin.Add(time.Minute)) {
		t.Fatal("the grid does not read its clock")
	}
}
