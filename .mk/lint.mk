#
# This file is part of BitGauge.
#
# Copyright (c) 2026 Roberto Leinardi
#
# BitGauge is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# BitGauge is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
#

# Go lint through the same pinned golangci-lint the pre-commit hook runs, over the whole module
# (golangci-lint v2, all linters; decisions.md section 9). Kept local until make-common's go.mk
# gains a go-lint target upstream.

.PHONY: go-lint
go-lint: check-installed-pre-commit ## Lint all Go code with golangci-lint (pre-commit pin)
	@pre-commit run golangci-lint-full --all-files
