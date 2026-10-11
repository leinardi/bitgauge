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


ifndef MK_LOCAL_VERIFY_INCLUDED
MK_LOCAL_VERIFY_INCLUDED := 1

# Umbrella validation targets: one command per area for fast agent and CI feedback.

# go-build joins once cmd/bitgauge exists; before that it can only fail, which says nothing about
# the Go that does exist.
VERIFY_GO_BUILD := $(if $(wildcard $(REPO_ROOT)/cmd/bitgauge/main.go),go-build)

# go-vet sees only untagged files. The image- and harness-tagged packages are vetted on their own,
# so a Go change that breaks them fails here and not first on a machine with Docker.
.PHONY: verify-go
verify-go: $(VERIFY_GO_BUILD) go-test go-vet go-vet-image go-vet-harness go-lint ## Verify the Go code (build once it exists, race tests, vet untagged and tagged, lint)

.PHONY: verify-web
verify-web: web-lint web-test ## Verify the web code (ESLint, vue-tsc, Vitest)

.PHONY: verify
verify: verify-go verify-web ## Verify everything

endif  # MK_LOCAL_VERIFY_INCLUDED
