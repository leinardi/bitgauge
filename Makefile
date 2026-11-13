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

# Resolve repository root (Makefile can live anywhere)
REPO_ROOT := $(shell git rev-parse --show-toplevel 2>/dev/null || pwd)

MK_COMMON_REPO    ?= leinardi/make-common
MK_COMMON_VERSION ?= v1

MK_COMMON_DIR := $(REPO_ROOT)/.mk

# Shared snippets coming from make-common
MK_COMMON_FILES := docker.mk help.mk pre-commit.mk web.mk parity.mk rust.mk rust-release.mk image.mk

# Repo-local snippets that are NOT in make-common
MK_LOCAL_FILES := run.mk e2e.mk verify.mk audit-deps.mk docker-run.mk image-test.mk harness.mk idle-measure.mk

MK_COMMON_BOOTSTRAP_SCRIPT := $(REPO_ROOT)/scripts/bootstrap-mk-common.sh

# Bootstrap: the script will self-update and fetch the selected .mk snippets
MK_COMMON_BOOTSTRAP := $(shell "$(MK_COMMON_BOOTSTRAP_SCRIPT)" \
  "$(MK_COMMON_REPO)" \
  "$(MK_COMMON_VERSION)" \
  "$(MK_COMMON_DIR)" \
  "$(MK_COMMON_FILES)")

# -----------------------------------------------------------------------------
# Project-specific config
# -----------------------------------------------------------------------------
BIN_NAME ?= bitgauge
DIST_DIR ?= dist

# Stamped the way release.yaml stamps a release: the version is the tag without its v only when
# HEAD is exactly a tag and the tree is clean, and otherwise dev, what an unstamped binary reports
# (src/buildinfo.rs); the commit is a fixed 7-character prefix; the date is HEAD's commit date in
# UTC (rust.mk's GIT_COMMIT_DATE, the clock's only outside git), the date release.yaml stamps. A
# local build's About screen then reads "dev · 34c88f5 · <date>". rust.mk hands the three to the
# binary as BITGAUGE_VERSION, BITGAUGE_COMMIT and BITGAUGE_DATE (RUST_STAMP_PREFIX), docker.mk to
# the image. A stamp that moves only with a commit keeps a repeated build a cache hit: a new date
# on every make would recompile the crate that reads it each time.
GIT_VERSION ?= $(or $(patsubst v%,%,$(filter-out %-dirty,$(shell git describe --tags --exact-match --dirty 2>/dev/null))),dev)
GIT_COMMIT  ?= $(or $(shell git rev-parse HEAD 2>/dev/null | cut -c1-7),none)
BUILD_DATE  ?= $(or $(GIT_COMMIT_DATE),$(shell date -u +"%Y-%m-%dT%H:%M:%SZ"))
RUST_STAMP_PREFIX := BITGAUGE

# rust-build unstamped, as rust-test builds: the two share the bitgauge crate's units instead of
# each recompiling it after the other. rust-dist, rust-run and the release builds stay stamped.
RUST_BUILD_ENV :=

# Keep repository-authoritative release settings immune to inherited environment overrides.
RUST_RELEASE_ZIG_VERSION := 0.17.0
RUST_RELEASE_ZIG_SHA256_x86_64 := 1cbe9df9f27e6b78d14ccbca43b6703a404ef79ef1c463de901d7f088d4e2026
RUST_RELEASE_ZIG_SHA256_aarch64 := 9e8d11661d4ae3bd57702a3832781e23ad151dde5798e16a5ccd503f65234ff8
RUST_RELEASE_CARGO_ZIGBUILD_VERSION := 0.24.0
RUST_RELEASE_CARGO_ZIGBUILD_SHA256_x86_64-unknown-linux-musl := 52be2cb85ad3875682564a29bac1832b2ab3db68b1c504765c92d5249cc9b96f
RUST_RELEASE_CARGO_ZIGBUILD_SHA256_aarch64-unknown-linux-gnu := de42626985f428033078dfc12ac8a59ee713f8e5627235ec883b1c899bee895c
RUST_RELEASE_RUST_STD_VERSION := 1.98.1
RUST_RELEASE_RUST_STD_SHA256_x86_64-unknown-linux-musl := bd9f35880de21dab0e387e84009c00001ae7836a4ba565cb16823f13f75f325f
RUST_RELEASE_RUST_STD_SHA256_aarch64-unknown-linux-musl := 7e0ad2e67817f224b7a6331e48d6397303fc050edaccf81784ed786ffddc884a
RUST_RELEASE_TRIPLE_linux_amd64 := x86_64-unknown-linux-musl
RUST_RELEASE_TRIPLE_linux_arm64 := aarch64-unknown-linux-musl
RUST_RELEASE_SHIPPED_PLATFORMS := linux/amd64 linux/arm64
RUST_RELEASE_DIR := $(REPO_ROOT)/$(DIST_DIR)
RUST_RELEASE_PREREQS := web-build

# web-build syncs only the changed files into web/dist, which build.rs watches
# (rerun-if-changed): a rebuild of an unchanged SPA does not rebuild the binary that embeds it.
WEB_DIST_SYNC_DIR := $(REPO_ROOT)/web/dist

# The binary make build leaves (web.mk's web-build, then rust.mk's rust-dist), the one make e2e,
# make run and the end-to-end fixtures (web/e2e/fixtures/server.ts) start: the release profile's,
# or the dist-local profile's after make run (.mk/run.mk).
DIST_BIN := $(REPO_ROOT)/$(DIST_DIR)/$(BIN_NAME)

# Docker image coordinates: one image, built from the shipped Dockerfile.
IMAGE_REPO     ?= ghcr.io/leinardi/bitgauge
IMAGE_TAG      ?= $(GIT_VERSION)
DOCKER_CONTEXT ?= .

DOCKER_TARGETS      := bitgauge
IMAGE_NAME_bitgauge := $(IMAGE_REPO)
DOCKERFILE_bitgauge := deployments/docker/Dockerfile

# Retain the single-image override and the full tier's application/security suites.
IMAGE_HOST_PLATFORM := linux/$(patsubst x86_64,amd64,$(patsubst aarch64,arm64,$(shell uname -m)))
PREBUILT_IMAGE ?= $(IMAGE_REPO):prebuilt-$(subst /,-,$(IMAGE_PLATFORM))
PREBUILT_IMAGE_bitgauge ?= $(PREBUILT_IMAGE)
IMAGE_TEST_FULL_EXTRA = rust-test-image-suites BITGAUGE_TEST_IMPL=rust TEST_IMAGE="$(IMAGE_TEST_IMAGE)" GIT_COMMIT="$(GIT_COMMIT)"

# --load puts the host-platform image into the local daemon, so docker-run and the image tests can
# run what docker-build produced.
DOCKER_BUILD_CMD ?= docker buildx build --load

# The design-system page make demo-parity-servers points at.
PARITY_PROTOTYPE_PAGE := ui_kits/app/index.html

# The parity servers' ports, off runhold's 5180 and 5181 so both projects can run the harness at
# once. A single run moves them with PARITY_DEMO_PORT=... PARITY_PROTO_PORT=... on the command line.
PARITY_DEMO_PORT ?= 5182
PARITY_PROTO_PORT ?= 5183

# The arguments `make run` hands to serve.
ARGS ?=

# -----------------------------------------------------------------------------
# Include shared make logic (fetched from make-common)
# -----------------------------------------------------------------------------
include $(addprefix $(MK_COMMON_DIR)/,$(MK_COMMON_FILES))

# -----------------------------------------------------------------------------
# Include repo-local logic (no bootstrap; lives only in this repo)
# -----------------------------------------------------------------------------
-include $(addprefix $(REPO_ROOT)/.mk/,$(MK_LOCAL_FILES))

.PHONY: mk-common-update
mk-common-update: ## Check for remote updates of shared .mk files
	@echo "[mk] Checking for updates from $(MK_COMMON_REPO)@$(MK_COMMON_VERSION)"
	MK_COMMON_UPDATE=1 "$(MK_COMMON_BOOTSTRAP_SCRIPT)" \
	  "$(MK_COMMON_REPO)" \
	  "$(MK_COMMON_VERSION)" \
	  "$(MK_COMMON_DIR)" \
	  "$(MK_COMMON_FILES)"

# -----------------------------------------------------------------------------
# Adding new targets
# -----------------------------------------------------------------------------
# Do NOT add recipes directly to this file. Instead:
#   - Project-specific targets → new .mk/<fragment>.mk added to MK_LOCAL_FILES
#   - Generic targets (useful beyond this repo) → new or updated .mk/<fragment>.mk
#     added to MK_COMMON_FILES, then open a PR to port the change upstream at
#     https://github.com/leinardi/make-common so mk-common-update keeps working.
