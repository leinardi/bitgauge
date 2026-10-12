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
	"time"

	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// cellDuration is the length of one cell of the server grid.
const cellDuration = BucketMs * time.Millisecond

// Grid is the global 100 ms server grid of measurement.md section 7.3. Its timeline is the
// injected clock's monotonic time since origin, the instant the grid was made at startup,
// shifted by offset whole cells, so that neither uptime nor wall-clock time can be read from
// it. Every request shares the same cell boundaries; the grid itself holds no counts.
type Grid struct {
	clock  ratelimit.Clock
	origin time.Time
	offset int64
}

// NewGrid starts the grid now, shifted by offsetCells cells (the epoch's K).
func NewGrid(clock ratelimit.Clock, offsetCells int64) *Grid {
	return &Grid{clock: clock, origin: clock.Now(), offset: offsetCells}
}

// Now is the grid's clock reading.
func (g *Grid) Now() time.Time {
	return g.clock.Now()
}

// Ms is instant on the grid's timeline, in whole milliseconds.
func (g *Grid) Ms(instant time.Time) int64 {
	return instant.Sub(g.origin).Milliseconds() + g.offset*BucketMs
}

// Cell is the index of the cell instant falls in: floor(Ms / 100), so a cell's start is
// inclusive and its end exclusive.
func (g *Grid) Cell(instant time.Time) int64 {
	return int64(instant.Sub(g.origin)/cellDuration) + g.offset
}
