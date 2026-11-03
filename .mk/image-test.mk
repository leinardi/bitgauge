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


ifndef MK_LOCAL_IMAGE_TEST_INCLUDED
MK_LOCAL_IMAGE_TEST_INCLUDED := 1

# The image tests (testing.md section 5): build the shipped image and assert what it does once
# started, plus the netguard and syscall-analyser negative controls they rely on. They carry
# //go:build image and drive the docker CLI, so an untagged go test never compiles them. Until
# cmd/bitgauge exists there is no image to build, and TestImage fails saying so; TestProbe and the
# netguard tests run today.
#
# Prerequisites: a running Docker daemon with buildx, a dhi.io login, and network access on a cold
# build cache.
#
# Select tests with RUN:
#   make go-test-image RUN=TestProbe

IMAGE_TEST_TIMEOUT ?= 20m
IMAGE_TEST_PKG     ?= ./test/image/... ./test/internal/netguard/...

.PHONY: go-test-image
go-test-image: ## Build the shipped image and test it (requires Docker)
	$(GO) test \
	  -tags=image \
	  -timeout=$(IMAGE_TEST_TIMEOUT) \
	  -v \
	  $(if $(RUN),-run $(RUN),) \
	  $(IMAGE_TEST_PKG)

.PHONY: go-vet-image
go-vet-image: ## Static checks for the image-tagged packages
	$(GO) vet -tags=image $(IMAGE_TEST_PKG)

# The Rust ports of the Docker suites (testenv/, docs/rust-port.md, Implementation identity) test
# one named implementation, never a default: BITGAUGE_TEST_IMPL=go builds the shipped Dockerfile as
# GO_TEST_IMAGE, BITGAUGE_TEST_IMPL=rust builds the candidate (make rust-image, RUST_IMAGE). The
# suite checks, before any test, that the image is that implementation at GIT_COMMIT, and fails
# otherwise. Recursive (=), so the rust-release.mk values are read whatever the include order.
BITGAUGE_TEST_IMPL ?=
GO_TEST_IMAGE      ?= bitgauge:go-test
test_impl_image = $(if $(filter go,$(BITGAUGE_TEST_IMPL)),$(GO_TEST_IMAGE),$(RUST_IMAGE))
test_impl_env = \
  BITGAUGE_TEST_IMPL="$(BITGAUGE_TEST_IMPL)" \
  BITGAUGE_TEST_IMAGE="$(test_impl_image)" \
  BITGAUGE_TEST_COMMIT="$(GIT_COMMIT)"

# The first line of every recipe that runs a Rust Docker suite.
define test_impl_guard
@case "$(BITGAUGE_TEST_IMPL)" in go|rust) ;; *) \
  echo "BITGAUGE_TEST_IMPL must be go or rust, not '$(BITGAUGE_TEST_IMPL)'" >&2; exit 1;; \
esac
endef

.PHONY: test-impl-image
test-impl-image: ## Build the image of BITGAUGE_TEST_IMPL (go: the shipped Dockerfile, rust: the candidate)
	$(test_impl_guard)
ifeq ($(BITGAUGE_TEST_IMPL),go)
	$(DOCKER_BUILD_CMD) -f "$(DOCKERFILE)" -t "$(GO_TEST_IMAGE)" $(DOCKER_BUILD_ARGS) "$(DOCKER_CONTEXT)"
else
	$(MAKE) --no-print-directory rust-image
endif

# The Rust image suite and the netguard tests (testenv, feature image), on the image of
# BITGAUGE_TEST_IMPL. RUST_IMAGE_TESTS names the suites (default both: image netguard), each run as
# its own cargo test; RUN is the runner's Go-style --run pattern, and since a pattern that selects
# no test fails a suite, narrow RUST_IMAGE_TESTS to the suite it names:
#   make rust-test-image BITGAUGE_TEST_IMPL=rust RUST_IMAGE_TESTS=image RUN='^TestProbe$'
RUST_IMAGE_TESTS ?= image netguard

.PHONY: rust-test-image
rust-test-image: ## Build the BITGAUGE_TEST_IMPL image and run the Rust image suite on it (Docker)
	$(test_impl_guard)
	$(MAKE) --no-print-directory test-impl-image
	@set -e; for suite in $(RUST_IMAGE_TESTS); do \
	  echo "== testenv --test $$suite"; \
	  $(test_impl_env) timeout $(IMAGE_TEST_TIMEOUT) \
	    $(CARGO) test --locked -p testenv --features image --test "$$suite" \
	    $(if $(RUN),-- --run '$(RUN)',); \
	done

endif  # MK_LOCAL_IMAGE_TEST_INCLUDED
