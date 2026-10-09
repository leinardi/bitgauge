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


ifndef MK_LOCAL_AUDIT_DEPS_INCLUDED
MK_LOCAL_AUDIT_DEPS_INCLUDED := 1

# Check the dependencies this repository uses against known vulnerabilities, with the tools their
# own ecosystems publish (build-packaging.md section 3).
#
# What this is and is not. govulncheck is source-aware: it reports a vulnerable module only when
# the build reaches the affected symbol, so it answers "is this repository exposed", not "does a
# vulnerable version appear in the graph". npm audit is the opposite -- it reads the lockfile, so it
# answers the graph question for the web app and its build tooling.
#
# govulncheck runs with -test, so the test packages count as entry points too. Until product code
# lands, the only Go dependency (go.yaml.in/yaml/v3) is imported from tests alone, and without -test
# a vulnerable yaml version could never be reported -- not even by the hook that fires on the very
# go.mod change that brings it in.
#
# Both need the network, and govulncheck over every package is too slow for every Go change. The
# pre-commit hooks run these same targets, but only when the dependency files themselves change;
# this target is the deliberate run, which the CI audit job, the scheduled scan and the release
# workflow make, and which the health audit and the going-public checklist require.
#
# The version is pinned so two runs mean the same thing. Bump it deliberately.

GOVULNCHECK_VERSION ?= v1.8.0
GOVULNCHECK         ?= golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION)

# The level at which npm audit fails. high and above is what gets acted on; a moderate advisory in
# a build-time devDependency is not worth failing a commit over.
NPM_AUDIT_LEVEL ?= high

.PHONY: audit-deps
audit-deps: audit-deps-go audit-deps-web ## Scan Go and web dependencies for known vulnerabilities (network required)

.PHONY: audit-deps-go
audit-deps-go: ## Run the pinned govulncheck over every Go package
	$(GO) run $(GOVULNCHECK) -test ./...

.PHONY: audit-deps-web
audit-deps-web: ## Run npm audit over the web lockfile
	npm --prefix "$(WEB_DIR)" audit --audit-level=$(NPM_AUDIT_LEVEL)

endif  # MK_LOCAL_AUDIT_DEPS_INCLUDED
