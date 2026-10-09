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
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// envCheckActive makes TestHarnessActive enforce the prerequisites: .mk/harness.mk sets it before
// any runner starts, so a dormant harness fails there, loudly, before a container exists.
const envCheckActive = "HARNESS_CHECK_ACTIVE"

// TestHarnessActive fails, listing what is missing, while the harness is dormant. Outside the
// runners it only checks that the prerequisites can be established on this tree.
func TestHarnessActive(t *testing.T) {
	t.Parallel()

	unmet, err := Unmet(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	if os.Getenv(envCheckActive) == "1" && len(unmet) > 0 {
		t.Fatalf("the harness is dormant; unmet prerequisites:\n- %s", strings.Join(unmet, "\n- "))
	}
}
