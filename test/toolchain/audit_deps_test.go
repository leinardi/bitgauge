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

package toolchain_test

import (
	"regexp"
	"strings"
	"testing"
)

// TestAuditGovulncheckIsPinned pins that the scanner is fetched at a fixed version. An unpinned
// go run @latest would make two runs of the same commit mean different things.
func TestAuditGovulncheckIsPinned(t *testing.T) {
	t.Parallel()

	const fragmentFile = ".mk/audit-deps.mk"

	fragment := readRepoFile(t, fragmentFile)

	if !regexp.MustCompile(`(?m)^GOVULNCHECK_VERSION \?= v\d+\.\d+\.\d+$`).MatchString(fragment) {
		t.Errorf("%s does not pin GOVULNCHECK_VERSION to an exact version", fragmentFile)
	}

	if strings.Contains(fragment, "@latest") {
		t.Errorf("%s fetches something @latest", fragmentFile)
	}
}
