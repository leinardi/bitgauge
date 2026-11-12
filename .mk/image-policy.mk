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

# Repository policy: an image gate must not pass without building or testing an image.
.PHONY: image-targets-check
image-targets-check:
	@test -n "$(strip $(DOCKER_TARGETS))" || { echo "DOCKER_TARGETS is empty; image gates require an image" >&2; exit 1; }

.PHONY: image-build-prebuilt
image-build-prebuilt: image-targets-check

.PHONY: image-test
image-test: image-targets-check

.PHONY: image-build-test
image-build-test: image-targets-check
