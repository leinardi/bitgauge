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


ifndef MK_LOCAL_DOCKER_RUN_INCLUDED
MK_LOCAL_DOCKER_RUN_INCLUDED := 1

# Run the image built by make docker-build the way it is meant to run in production: read-only
# root filesystem, every capability dropped, no privilege escalation, and nothing mounted -- the
# server writes nothing (build-packaging.md section 1).
#
# Published on loopback by default, so a local run is not reachable from the network; set
# DOCKER_RUN_BIND=0.0.0.0 to expose it. DOCKER_RUN_PORT is the host port.

DOCKER_RUN_BIND ?= 127.0.0.1
DOCKER_RUN_PORT ?= 8080

.PHONY: docker-run
docker-run: ## Run the built image read-only, on loopback by default (Ctrl+C stops it)
	docker run --rm \
		--read-only \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		-p "$(DOCKER_RUN_BIND):$(DOCKER_RUN_PORT):8080" \
		"$(IMAGE_NAME_bitgauge):$(IMAGE_TAG)"

endif  # MK_LOCAL_DOCKER_RUN_INCLUDED
