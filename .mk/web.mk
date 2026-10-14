#
# MIT License
#
# Copyright (c) 2026 Roberto Leinardi
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#

ifndef MK_COMMON_WEB_INCLUDED
MK_COMMON_WEB_INCLUDED := 1

# An npm web app in WEB_DIR (web/ by default): install, dev server, build, tests, lint, and the
# production build of a binary that embeds the app.
#
# The targets run the app's npm scripts, which every consumer defines in WEB_DIR/package.json:
#   dev, dev:demo        the Vite dev server, plain and in demo mode
#   build, build:demo    the production build (vite build only; the type check is web-lint's) and
#                        the demo build
#   test                 the unit tests
#   lint, typecheck      ESLint, then vue-tsc (or whatever the app type-checks with)
#   api-types            regenerate the typed API client
#
# npm ci runs only when package.json, package-lock.json or .npmrc changed since the last install:
# every target that needs node_modules depends on the hidden lockfile npm writes there. web-install
# still runs npm ci unconditionally.

# Paths / files (override these in your repo if needed)
WEB_DIR ?= $(REPO_ROOT)/web

# What `make build` makes once the app is built: a binary that embeds it (go-build from go.mk by
# default). Built from the recipe rather than as a second prerequisite, which make -j could start
# alongside web-build, before the app it embeds exists.
WEB_BUILD_NEXT ?= go-build

WEB_INSTALLED := $(WEB_DIR)/node_modules/.package-lock.json

# The touch makes the hidden lockfile newer than its prerequisites even when npm leaves it as it was.
# .npmrc counts only where it exists, so a missing one is not a missing prerequisite.
$(WEB_INSTALLED): $(WEB_DIR)/package.json $(WEB_DIR)/package-lock.json $(wildcard $(WEB_DIR)/.npmrc)
	npm --prefix "$(WEB_DIR)" ci
	touch "$@"

.PHONY: web-install
web-install: ## Install the web dependencies exactly as locked (npm ci)
	npm --prefix "$(WEB_DIR)" ci

.PHONY: web-update
web-update: ## Update the web dependencies within their declared version ranges
	npm --prefix "$(WEB_DIR)" update

.PHONY: web-dev
web-dev: $(WEB_INSTALLED) ## Start the Vite dev server
	npm --prefix "$(WEB_DIR)" run dev

.PHONY: web-demo
web-demo: $(WEB_INSTALLED) ## Start the Vite dev server in demo mode
	npm --prefix "$(WEB_DIR)" run dev:demo

.PHONY: web-build
web-build: $(WEB_INSTALLED) ## Install the dependencies when needed, then build the web app
	npm --prefix "$(WEB_DIR)" run build

.PHONY: web-build-demo
web-build-demo: $(WEB_INSTALLED) ## Install the dependencies when needed, then build the demo web app
	npm --prefix "$(WEB_DIR)" run build:demo

.PHONY: web-test
web-test: $(WEB_INSTALLED) ## Run the web unit tests
	npm --prefix "$(WEB_DIR)" run test

.PHONY: web-lint
web-lint: $(WEB_INSTALLED) ## Lint the web sources with ESLint, then type-check them
	npm --prefix "$(WEB_DIR)" run lint
	npm --prefix "$(WEB_DIR)" run typecheck

.PHONY: api-types
api-types: $(WEB_INSTALLED) ## Regenerate the typed API client (the api-types npm script)
	npm --prefix "$(WEB_DIR)" run api-types

.PHONY: build
build: web-build ## Build the web app, then WEB_BUILD_NEXT (go-build by default), which embeds it
	$(MAKE) $(WEB_BUILD_NEXT)

endif  # MK_COMMON_WEB_INCLUDED
