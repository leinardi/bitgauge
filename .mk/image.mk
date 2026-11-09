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

# Adapted from swarm-scheduler-exporter/.mk/image.mk at 88394aa, MIT, Copyright (c) 2026 Roberto Leinardi


ifndef MK_LOCAL_IMAGE_INCLUDED
MK_LOCAL_IMAGE_INCLUDED := 1

# Local snippet (NOT part of make-common): the image's prebuilt target, the one CI tests and the
# release ships. It is built from the release binaries make rust-release-binaries wrote, named as
# the release assets, through the dist build context, so the image binary is the asset byte for
# byte, with the SPA that one web build embedded in it, and the Dockerfile's web and build stages
# (dhi.io/node, dhi.io/rust) are never used. The base (dhi.io/static) still needs a dhi.io login.
# make docker-build and make rust-test-image build the default target, with their own builds.
#
# The stamps are the Makefile's GIT_VERSION, GIT_COMMIT and BUILD_DATE, the ones
# rust-release-binaries compiles in: pass the same values to both.

# One platform per build, loaded into the local image store: the host's by default; another one
# needs QEMU (binfmt) to run its tests.
IMAGE_HOST_PLATFORM := linux/$(patsubst x86_64,amd64,$(patsubst aarch64,arm64,$(shell uname -m)))
IMAGE_PLATFORM ?= $(IMAGE_HOST_PLATFORM)
PREBUILT_IMAGE ?= $(IMAGE_REPO):prebuilt-$(subst /,-,$(IMAGE_PLATFORM))

.PHONY: image-build-prebuilt
image-build-prebuilt: ## Build the image's prebuilt target for IMAGE_PLATFORM from dist/ (make rust-release-binaries first)
	docker buildx build --load --platform "$(IMAGE_PLATFORM)" --target prebuilt \
	  --build-context dist="$(RUST_RELEASE_DIR)" -f "$(DOCKERFILE_bitgauge)" -t "$(PREBUILT_IMAGE)" \
	  --build-arg VERSION="$(GIT_VERSION)" --build-arg COMMIT="$(GIT_COMMIT)" --build-arg DATE="$(BUILD_DATE)" \
	  "$(DOCKER_CONTEXT)"

# smoke (the release's), reduced (CI's arm64, under QEMU) or full (CI's amd64):
# scripts/image-test.sh, and for full the image and netguard suites (.mk/image-test.mk) on the same
# image, which run it on the host's own platform.
IMAGE_TEST_TIER ?= full

.PHONY: image-test
image-test: ## Test the prebuilt image against its release binary (IMAGE_TEST_TIER smoke, reduced or full)
	@if [ "$(IMAGE_TEST_TIER)" = full ] && [ "$(IMAGE_PLATFORM)" != "$(IMAGE_HOST_PLATFORM)" ]; then \
	  echo "the full tier runs on the host's platform ($(IMAGE_HOST_PLATFORM)), not $(IMAGE_PLATFORM)" >&2; \
	  exit 1; \
	fi
	"$(REPO_ROOT)/scripts/image-test.sh" --tier "$(IMAGE_TEST_TIER)" --image "$(PREBUILT_IMAGE)" \
	  --platform "$(IMAGE_PLATFORM)" --binary "$(call rust_release_asset,$(IMAGE_PLATFORM))" \
	  --expect-version "$(GIT_VERSION) $(GIT_COMMIT) $(BUILD_DATE)"
	@if [ "$(IMAGE_TEST_TIER)" = full ]; then \
	  $(MAKE) --no-print-directory rust-test-image-suites BITGAUGE_TEST_IMPL=rust \
	    TEST_IMAGE="$(PREBUILT_IMAGE)" GIT_COMMIT="$(GIT_COMMIT)"; \
	fi

# The two above in order, for the same reason as rust-release-dist: under make -j,
# `make image-build-prebuilt image-test` could test a missing or previous image before the build
# has loaded the new one.
.PHONY: image-build-test
image-build-test: ## Build the prebuilt image for IMAGE_PLATFORM, then test it (ordered, safe under make -j)
	$(MAKE) --no-print-directory image-build-prebuilt
	$(MAKE) --no-print-directory image-test

endif  # MK_LOCAL_IMAGE_INCLUDED
