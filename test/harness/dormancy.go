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

package harness

import (
	"fmt"

	"github.com/leinardi/bitgauge/test/toolchain"
)

// Unmet lists the harness prerequisites the tree under root does not meet yet, as the staged gate
// registry defines them: the image prerequisites, the engine's result object, the Test screen and
// the Download JSON extraction path. While any is unmet the harness is dormant and its runners
// refuse to start. An error means the list could not be established, which is not the same as
// dormant.
func Unmet(root string) ([]string, error) {
	unmet, err := toolchain.Unmet(root, toolchain.GateHarness)
	if err != nil {
		return nil, fmt.Errorf("the harness prerequisites: %w", err)
	}

	return unmet, nil
}
