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
# foreground until Ctrl+C. It listens on every interface by default, so a phone or another machine
# on the LAN can test against it; set RUN_BIND=127.0.0.1 to keep it on loopback. ARGS reaches
# serve, so ARGS="--config path" reads a configuration file; without it the default path is read
# only if it exists. The server writes nothing, so there is no state to clean up afterwards.

RUN_BIND      ?= 0.0.0.0
RUN_PORT      ?= 8080
RUN_LOG_LEVEL ?= debug

.PHONY: run
run: rust-bin ## Build the SPA and the release binary, then serve them on the LAN until Ctrl+C (RUN_BIND, RUN_PORT, ARGS)
	@if [ "$(RUN_BIND)" = "0.0.0.0" ]; then \
	  echo "BitGauge: http://localhost:$(RUN_PORT)/"; \
	  if command -v ip >/dev/null 2>&1; then \
	    ip -4 -o addr show scope global \
	      | awk '$$2 !~ /^(docker|br-|veth|virbr)/ { sub(/\/.*/, "", $$4); print $$4 }'; \
	  else \
	    ifconfig 2>/dev/null | awk '/inet / && $$2 != "127.0.0.1" { print $$2 }'; \
	  fi | while read -r addr; do echo "BitGauge: http://$$addr:$(RUN_PORT)/"; done; \
	else \
	  echo "BitGauge: http://$(RUN_BIND):$(RUN_PORT)/"; \
	fi
	BITGAUGE_SERVER__LISTEN="$(RUN_BIND):$(RUN_PORT)" \
	  BITGAUGE_LOG__LEVEL="$(RUN_LOG_LEVEL)" \
	  "$(RUST_BIN)" serve $(ARGS)

endif  # MK_LOCAL_RUN_INCLUDED
