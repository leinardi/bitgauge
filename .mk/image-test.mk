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

endif  # MK_LOCAL_IMAGE_TEST_INCLUDED
