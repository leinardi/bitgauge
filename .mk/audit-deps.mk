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
# What this is and is not. cargo deny reads Cargo.lock against the RustSec advisory database (and
# checks licenses, bans and sources, deny.toml): it answers "does a vulnerable version appear in the
# graph", not "does the build reach the affected code". npm audit reads the web lockfile, the same
# question for the web app and its build tooling.
#
# Both need the network. The pre-commit hooks run them only when the dependency files change; this
# target is the deliberate run, which the CI audit job, the scheduled scan and the release workflow
# make, and which the health audit and the going-public checklist require. The cargo-deny release
# is the one gh-composite-actions' setup-cargo-deny installs by default, by version and sha256.

# The level at which npm audit fails. high and above is what gets acted on; a moderate advisory in
# a build-time devDependency is not worth failing a commit over.
NPM_AUDIT_LEVEL ?= high

.PHONY: audit-deps
audit-deps: audit-deps-web rust-deny ## Scan the web and Rust dependencies for known vulnerabilities (network required)

.PHONY: audit-deps-web
audit-deps-web: ## Run npm audit over the web lockfile
	npm --prefix "$(WEB_DIR)" audit --audit-level=$(NPM_AUDIT_LEVEL)

endif  # MK_LOCAL_AUDIT_DEPS_INCLUDED
