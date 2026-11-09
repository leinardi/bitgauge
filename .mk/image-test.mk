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

# The image tests (testing.md section 5): the testenv suites behind the image feature build nothing
# themselves; they run on the image test-impl-image builds from the shipped Dockerfile and assert
# what it does once started, plus the netguard and syscall-analyser negative controls they rely on.
#
# Every Docker suite names the implementation it tests, never a default (docs/rust-port.md,
# Implementation identity): BITGAUGE_TEST_IMPL=rust, the one the shipped Dockerfile builds since
# the cutover. The suite checks, before any test, that the image answers -help as that
# implementation, carries GIT_COMMIT as its revision label and holds the binary it copies out, and
# fails otherwise; its crossed control checks that the Go expectation is refused. go is refused here,
# because no Dockerfile builds the Go server any more.
#
# Prerequisites: a running Docker daemon with buildx, a dhi.io login, and network access on a cold
# build cache.

IMAGE_TEST_TIMEOUT ?= 20m
BITGAUGE_TEST_IMPL ?=
TEST_IMAGE         ?= bitgauge:test
test_impl_env = \
  BITGAUGE_TEST_IMPL="$(BITGAUGE_TEST_IMPL)" \
  BITGAUGE_TEST_IMAGE="$(TEST_IMAGE)" \
  BITGAUGE_TEST_COMMIT="$(GIT_COMMIT)"

# The first line of every recipe that runs a Docker suite.
define test_impl_guard
@case "$(BITGAUGE_TEST_IMPL)" in rust) ;; \
  go) echo "BITGAUGE_TEST_IMPL=go: the Go server is gone since the cutover; test rust" >&2; exit 1;; \
  *) echo "BITGAUGE_TEST_IMPL must be rust, not '$(BITGAUGE_TEST_IMPL)'" >&2; exit 1;; \
esac
endef

.PHONY: test-impl-image
test-impl-image: ## Build the shipped image as TEST_IMAGE for the Docker suites (BITGAUGE_TEST_IMPL=rust)
	$(test_impl_guard)
	$(DOCKER_BUILD_CMD) -f "$(DOCKERFILE_bitgauge)" -t "$(TEST_IMAGE)" $(DOCKER_BUILD_ARGS) "$(DOCKER_CONTEXT)"

# The image suite and the netguard tests (testenv, feature image), on TEST_IMAGE. RUST_IMAGE_TESTS
# names the suites (default both: image netguard), each run as its own cargo test; RUN is the
# runner's Go-style --run pattern, and since a pattern that selects no test fails a suite, narrow
# RUST_IMAGE_TESTS to the suite it names:
#   make rust-test-image BITGAUGE_TEST_IMPL=rust RUST_IMAGE_TESTS=image RUN='^TestProbe$'
RUST_IMAGE_TESTS ?= image netguard

.PHONY: rust-test-image
rust-test-image: ## Build the shipped image and run the image suite on it (BITGAUGE_TEST_IMPL=rust, Docker)
	$(test_impl_guard)
	$(MAKE) --no-print-directory test-impl-image
	$(MAKE) --no-print-directory rust-test-image-suites

# The suites alone, on a TEST_IMAGE already built: CI's full tier runs them on the prebuilt image
# (make image-test IMAGE_TEST_TIER=full, .mk/image.mk), the one the release ships.
.PHONY: rust-test-image-suites
rust-test-image-suites: ## Run the image suites on the already built TEST_IMAGE (BITGAUGE_TEST_IMPL=rust, Docker)
	$(test_impl_guard)
	@set -e; for suite in $(RUST_IMAGE_TESTS); do \
	  echo "== testenv --test $$suite"; \
	  $(test_impl_env) timeout $(IMAGE_TEST_TIMEOUT) \
	    $(CARGO) test --locked -p testenv --features image --test "$$suite" \
	    $(if $(RUN),-- --run '$(RUN)',); \
	done

endif  # MK_LOCAL_IMAGE_TEST_INCLUDED
