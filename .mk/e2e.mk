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
# on the host -- no image, so no dhi.io credentials. With no spec the target fails and says why,
# rather than passing on nothing.

E2E_PORT ?= 18080
# The specs run in parallel from one address, which the server's per-client stream limit counts as
# one client (measurement.md section 4): room for six streams on each of the ten workers that
# web/playwright.config.ts allows at most.
E2E_MAX_STREAMS ?= 64
# make's wildcard reads ** as *, so it would miss a spec two folders down; find does not.
E2E_SPECS := $(shell [ -d "$(REPO_ROOT)/web/e2e" ] && find "$(REPO_ROOT)/web/e2e" -name '*.spec.ts' -type f)
# The binary under test: empty builds the release binary of make rust-bin, which embeds the web app
# it builds first; BIN=<path> runs a binary built beforehand.
BIN ?=
E2E_BIN = $(if $(strip $(BIN)),$(BIN),$(RUST_BIN))

.PHONY: e2e
e2e: ## Run the Playwright end-to-end tests against a host-built binary, or the prebuilt BIN
ifeq ($(strip $(E2E_SPECS)),)
	@echo "e2e is dormant: web/e2e/ holds no *.spec.ts yet." >&2
	@exit 1
else
	$(if $(strip $(BIN)),test -x "$(BIN)" || { echo "BIN=$(BIN) is not an executable" >&2; exit 1; },$(MAKE) rust-bin)
	export BITGAUGE_SERVER__LISTEN="127.0.0.1:$(E2E_PORT)" \
	  BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT="$(E2E_MAX_STREAMS)"; \
	  "$(E2E_BIN)" serve & server=$$!; \
	  trap 'kill $$server' EXIT; \
	  for _ in $$(seq 50); do "$(E2E_BIN)" healthcheck && break; sleep 0.2; done; \
	  "$(E2E_BIN)" healthcheck || { echo "bitgauge did not become healthy" >&2; exit 1; }; \
	  BITGAUGE_E2E_URL="http://127.0.0.1:$(E2E_PORT)" npm --prefix "$(REPO_ROOT)/web" run e2e
endif

# The browsers the end-to-end tests and `playwright cli` (the QA rounds' driver) share: both run on
# the playwright-core that @playwright/test pins. No --with-deps: the system libraries need root,
# so CI installs them itself and a development host provides them.
.PHONY: e2e-browsers
e2e-browsers: $(WEB_INSTALLED) ## Install the Chromium, Firefox and WebKit the e2e tests and playwright cli drive
	cd "$(WEB_DIR)" && npm exec --no -- playwright install chromium firefox webkit

endif  # MK_LOCAL_E2E_INCLUDED
