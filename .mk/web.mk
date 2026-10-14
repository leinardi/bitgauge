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


ifndef MK_LOCAL_WEB_INCLUDED
MK_LOCAL_WEB_INCLUDED := 1

# The SPA tooling in web/ (build-packaging.md section 3). Until web/src exists these targets fail
# loudly -- ESLint finds no files, vue-tsc no inputs, Vitest no tests -- rather than passing on
# nothing; see the dormant gates in AGENTS.md.

WEB_DIR := $(REPO_ROOT)/web

# npm ci only when the lockfile, the manifest or the install policy changed since the last one.
# npm writes this hidden lockfile itself; the touch makes it newer than its prerequisites even when
# npm leaves it as it was.
WEB_INSTALLED := $(WEB_DIR)/node_modules/.package-lock.json

$(WEB_INSTALLED): $(WEB_DIR)/package.json $(WEB_DIR)/package-lock.json $(WEB_DIR)/.npmrc
	npm --prefix "$(WEB_DIR)" ci
	touch "$@"

.PHONY: web-install
web-install: ## Install the web dependencies exactly as locked (npm ci)
	npm --prefix "$(WEB_DIR)" ci

.PHONY: web-dev
web-dev: $(WEB_INSTALLED) ## Start the Vite dev server
	npm --prefix "$(WEB_DIR)" run dev

# The build is vite build only; the type check is its own gate, in web-lint.
.PHONY: web-build
web-build: $(WEB_INSTALLED) ## Install the dependencies when needed, then build the SPA into web/dist
	npm --prefix "$(WEB_DIR)" run build

.PHONY: web-demo
web-demo: $(WEB_INSTALLED) ## Start the Vite dev server in demo mode, the engine against a simulated link
	npm --prefix "$(WEB_DIR)" run dev:demo

.PHONY: web-build-demo
web-build-demo: $(WEB_INSTALLED) ## Install the dependencies when needed, then build the demo SPA into web/dist-demo, which never ships
	npm --prefix "$(WEB_DIR)" run build:demo

.PHONY: web-test
web-test: $(WEB_INSTALLED) ## Run the Vitest suites (unit, component, engine)
	npm --prefix "$(WEB_DIR)" run test

.PHONY: web-lint
web-lint: $(WEB_INSTALLED) ## Lint the web sources with ESLint, then vue-tsc
	npm --prefix "$(WEB_DIR)" run lint
	npm --prefix "$(WEB_DIR)" run typecheck

.PHONY: api-types
api-types: $(WEB_INSTALLED) ## Regenerate web/src/api/types.gen.ts from api/openapi.yaml
	npm --prefix "$(WEB_DIR)" run api-types

# The production binary embeds web/dist, so the SPA is built first. go-build runs from the recipe
# rather than as a second prerequisite, which make -j could start alongside web-build.
.PHONY: build
build: web-build ## Build the SPA, then the binary that embeds it
	$(MAKE) go-build

endif  # MK_LOCAL_WEB_INCLUDED
