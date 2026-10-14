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


ifndef MK_LOCAL_RUN_INCLUDED
MK_LOCAL_RUN_INCLUDED := 1

# A local instance for a quick manual test: build the SPA and the binary, then serve them in the
# foreground until Ctrl+C. Published on loopback by default, like docker-run; set RUN_BIND=0.0.0.0
# to reach it from another device. ARGS reaches serve, so ARGS="--config path" reads a
# configuration file; without it the default path is read only if it exists. The server writes
# nothing, so there is no state to clean up afterwards.

RUN_BIND      ?= 127.0.0.1
RUN_PORT      ?= 8080
RUN_LOG_LEVEL ?= debug

.PHONY: run
run: build ## Build the SPA and the binary, then serve them on loopback until Ctrl+C (RUN_PORT, ARGS)
	@echo "BitGauge: http://$(RUN_BIND):$(RUN_PORT)/"
	BITGAUGE_SERVER__LISTEN="$(RUN_BIND):$(RUN_PORT)" \
	  BITGAUGE_LOG__LEVEL="$(RUN_LOG_LEVEL)" \
	  "$(DIST_DIR)/$(BIN_NAME)" serve $(ARGS)

endif  # MK_LOCAL_RUN_INCLUDED
