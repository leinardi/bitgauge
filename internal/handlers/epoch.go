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
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
)

// epochBytes is the entropy of the epoch identifier: 72 bits, 12 characters of base64url.
const epochBytes = 9

// Epoch identifies one run of the process (wire-protocol.md section 4). The engine compares ID
// with the one GET /info reported at test start to detect a restart, and GridOffset is K, the
// random whole number of 100 ms cells that shifts the upload grid's origin away from process
// start, so that grid indices reveal neither uptime nor wall-clock time (backend.md section
// 2.2). Both are generated once at startup and never change.
type Epoch struct {
	ID         string
	GridOffset int64
}

// NewEpoch draws a fresh epoch from crypto/rand: the identifier, and K uniform in [0, 2^32).
func NewEpoch() Epoch {
	var entropy [epochBytes + 4]byte
	// crypto/rand.Read never returns an error: it crashes the program instead.
	_, _ = rand.Read(entropy[:])

	return Epoch{
		ID:         base64.RawURLEncoding.EncodeToString(entropy[:epochBytes]),
		GridOffset: int64(binary.BigEndian.Uint32(entropy[epochBytes:])),
	}
}
