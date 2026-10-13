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


ifndef MK_LOCAL_E2E_INCLUDED
MK_LOCAL_E2E_INCLUDED := 1

# End-to-end tests on Chromium, Firefox and WebKit (testing.md section 4), against the binary built
# on the host -- no image, so no dhi.io credentials. Dormant until both a binary and a spec exist;
# until then the target fails and says why, rather than passing on nothing.

E2E_PORT ?= 18080
# The specs run in parallel from one address, which the server's per-client stream limit counts as
# one client (measurement.md section 4): room for six streams on each of the ten workers that
# web/playwright.config.ts allows at most.
E2E_MAX_STREAMS ?= 64
# make's wildcard reads ** as *, so it would miss a spec two folders down; find does not.
E2E_SPECS := $(shell [ -d "$(REPO_ROOT)/web/e2e" ] && find "$(REPO_ROOT)/web/e2e" -name '*.spec.ts' -type f)
E2E_MAIN := $(wildcard $(REPO_ROOT)/cmd/bitgauge/main.go)

.PHONY: e2e
e2e: ## Run the Playwright end-to-end tests against a host-built binary
ifeq ($(strip $(E2E_SPECS)),)
	@echo "e2e is dormant: web/e2e/ holds no *.spec.ts yet." >&2
	@exit 1
else ifeq ($(strip $(E2E_MAIN)),)
	@echo "e2e is dormant: cmd/bitgauge/main.go does not exist yet." >&2
	@exit 1
else
	$(MAKE) build
	export BITGAUGE_SERVER__LISTEN="127.0.0.1:$(E2E_PORT)" \
	  BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT="$(E2E_MAX_STREAMS)"; \
	  "$(DIST_DIR)/$(BIN_NAME)" serve & server=$$!; \
	  trap 'kill $$server' EXIT; \
	  for _ in $$(seq 50); do "$(DIST_DIR)/$(BIN_NAME)" healthcheck && break; sleep 0.2; done; \
	  "$(DIST_DIR)/$(BIN_NAME)" healthcheck || { echo "bitgauge did not become healthy" >&2; exit 1; }; \
	  BITGAUGE_E2E_URL="http://127.0.0.1:$(E2E_PORT)" npm --prefix "$(REPO_ROOT)/web" run e2e
endif

endif  # MK_LOCAL_E2E_INCLUDED
