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

# Adapted from swarm-scheduler-exporter/.mk/rust.mk at 722b8a3, MIT, Copyright (c) 2026 Roberto Leinardi


ifndef MK_LOCAL_RUST_INCLUDED
MK_LOCAL_RUST_INCLUDED := 1

# Local snippet (NOT part of make-common): the Rust workspace, the server and its test crates
# (docs/rust-port.md). Every lint and test command runs workspace-wide, so the meta and
# testenv crates are held to the same lints and tests as the server: the lint set lives once in the
# root [workspace.lints], and a command scoped to one package would leave the others unchecked.
# --locked everywhere: Cargo.lock is the pin, and a command that rewrote it would test a dependency
# graph nobody reviewed. cargo deny takes --workspace for the same reason. Build and clippy take
# --all-features, so the code behind testenv's Docker features is compiled and linted like the
# rest; the tests do not, since those suites need Docker.

CARGO ?= cargo

# The version stamps the binary reads at compile time (BITGAUGE_VERSION, _COMMIT, _DATE), the same
# values the image and the release stamp (GIT_VERSION, GIT_COMMIT and BUILD_DATE in the Makefile).
# Only the builds stamp, so the tests see the defaults.
RUST_VERSION_ENV = \
  BITGAUGE_VERSION="$(GIT_VERSION)" \
  BITGAUGE_COMMIT="$(GIT_COMMIT)" \
  BITGAUGE_DATE="$(BUILD_DATE)"

.PHONY: rust-build
rust-build: ## Build the Rust workspace, with the version stamps
	$(RUST_VERSION_ENV) $(CARGO) build --workspace --all-targets --all-features --locked

.PHONY: rust-test
rust-test: ## Run the Rust tests, meta-tests included
	$(CARGO) test --workspace --locked

.PHONY: rust-clippy
rust-clippy: ## Lint the Rust workspace with clippy, warnings as errors
	$(CARGO) clippy --workspace --all-targets --all-features --locked -- -D warnings

.PHONY: rust-fmt
rust-fmt: ## Format the Rust code
	$(CARGO) fmt --all

.PHONY: rust-fmt-check
rust-fmt-check: ## Fail if the Rust code needs formatting
	$(CARGO) fmt --all --check

.PHONY: rust-doc
rust-doc: ## Check the Rust documentation, warnings as errors
	RUSTDOCFLAGS="$(RUSTDOCFLAGS) -D warnings" $(CARGO) doc --workspace --all-features --no-deps --locked

.PHONY: rust-deny
rust-deny: ## Check the Rust dependencies with cargo-deny (advisories, licenses, bans, sources; network)
	$(CARGO) deny --workspace check

# The release binary, with the SPA web-build leaves in web/dist embedded (build.rs makes cargo
# re-embed it whenever it changes), copied to dist/bitgauge, the binary make e2e, make run and the
# end-to-end fixtures (web/e2e/fixtures/server.ts) start.
RUST_BIN ?= $(REPO_ROOT)/$(DIST_DIR)/$(BIN_NAME)

.PHONY: rust-bin
rust-bin: web-build ## Build the web app, then the release binary that embeds it, with the version stamps, into dist/
	$(RUST_VERSION_ENV) $(CARGO) build --release --locked --bin $(BIN_NAME)
	mkdir -p "$(dir $(RUST_BIN))"
	cp "$(REPO_ROOT)/target/release/$(BIN_NAME)" "$(RUST_BIN)"

.PHONY: verify-rust
verify-rust: rust-build rust-fmt-check rust-clippy rust-test rust-doc ## Verify the Rust code (build, fmt, clippy, tests, docs)

endif  # MK_LOCAL_RUST_INCLUDED
