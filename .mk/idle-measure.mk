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

ifndef MK_LOCAL_IDLE_MEASURE_INCLUDED
MK_LOCAL_IDLE_MEASURE_INCLUDED := 1

# Local snippet (NOT part of make-common): the idle CPU and memory footprint of a running binary,
# measured by scripts/idle-measure.sh. Read-only.
#
#   make idle-measure IDLE_PIDS="bitgauge=PID"   CPU and resident memory over idle windows
#
# Dormant until a running binary exists: with no process to name, the script fails before it
# measures anything. The caller resolves the PIDs (ps -eo pid,comm,args); nothing here guesses
# which process is which. WINDOWS, WINDOW_S and WARMUP_S are read by the script from the
# environment; see its header.

IDLE_PIDS ?=

# Handed to the script through the environment, never as recipe text, and only for this goal.
ifneq ($(filter idle-measure,$(MAKECMDGOALS)),)
export IDLE_PIDS
endif

.PHONY: idle-measure
idle-measure: ## Measure idle CPU and memory of IDLE_PIDS="name=PID ..." over five 5-minute windows
	@"$(REPO_ROOT)/scripts/idle-measure.sh" windows

endif  # MK_LOCAL_IDLE_MEASURE_INCLUDED
