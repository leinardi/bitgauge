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


ifndef MK_LOCAL_HARNESS_INCLUDED
MK_LOCAL_HARNESS_INCLUDED := 1

# The accuracy harness (testing.md section 5): Go runners behind the harness build tag drive the
# topology over the docker CLI and write dist/harness/<tier>-<UTC>-<envid>/report.{json,md}.
#
# Held to the image prerequisites, the engine's result object, the Test screen and its Download
# JSON extraction path (the accuracy harness gate of test/toolchain/gates.go): without any of them
# the runners fail, naming what is missing, before any container starts.
#
# Prerequisites: Linux, a running Docker daemon with buildx, a dhi.io login, the ifb, netem, tbf and
# fq_codel kernel modules loadable, cgroup v2 with memory.peak (Linux 5.19 or later), and npm --prefix web
# ci on the host (the client mounts web/ with its node_modules; it has no route out to install
# anything).
#
# Inputs, all optional:
#   HARNESS_PROFILES         comma-separated profile names of the tier (default: all)
#   HARNESS_BROWSERS         comma-separated chromium, firefox, webkit (default: all three)
#   HARNESS_KEEP_ON_FAILURE  1 keeps the containers of a run that errored or failed its tolerances
#   HARNESS_SHAPE            none runs without the shaper (harness-ceiling sets it)
#   HARNESS_CONTINUOUS_MINUTES  harness-continuous only: the minutes it samples (default 60, at least 6)

HARNESS_TIMEOUT         ?= 120m
HARNESS_PKG             := ./test/harness/
HARNESS_PROFILES        ?=
HARNESS_BROWSERS        ?=
HARNESS_KEEP_ON_FAILURE ?= 0
HARNESS_SHAPE           ?=
HARNESS_CONTINUOUS_MINUTES ?= 60
# The image builds, the topology and the browser's setup around the sampled minutes.
HARNESS_CONTINUOUS_SETUP_MINUTES := 30

# harness_run runs one tier: $(1) is the tier, $(2) the shape setting.
define harness_run
	HARNESS_CHECK_ACTIVE=1 $(GO) test -count=1 -run '^TestHarnessActive$$' $(HARNESS_PKG)
	HARNESS_TIER=$(1) \
	HARNESS_PROFILES="$(HARNESS_PROFILES)" \
	HARNESS_BROWSERS="$(HARNESS_BROWSERS)" \
	HARNESS_KEEP_ON_FAILURE="$(HARNESS_KEEP_ON_FAILURE)" \
	HARNESS_SHAPE="$(2)" \
	$(GO) test -tags=harness -run '^TestHarness$$' -timeout $(HARNESS_TIMEOUT) -v $(HARNESS_PKG)
endef

.PHONY: harness-ci
harness-ci: ## Run the accuracy harness CI tier (Docker)
	$(call harness_run,ci,$(HARNESS_SHAPE))

.PHONY: harness-floor
harness-floor: ## Run the manual range-floor harness tier (Docker)
	$(call harness_run,floor,$(HARNESS_SHAPE))

.PHONY: harness-ceiling
harness-ceiling: ## Run the manual range-ceiling harness tier, unshaped (bare metal or veth)
	$(call harness_run,ceiling,none)

.PHONY: harness-continuous
harness-continuous: ## Run the manual Continuous memory check, Chromium on ci-100m-50ms (Docker)
	@case "$(HARNESS_CONTINUOUS_MINUTES)" in ''|*[!0-9]*) \
	  echo "HARNESS_CONTINUOUS_MINUTES must be a whole number of at least 6, not '$(HARNESS_CONTINUOUS_MINUTES)'" >&2; exit 1;; \
	esac
	HARNESS_CHECK_ACTIVE=1 $(GO) test -count=1 -run '^TestHarnessActive$$' $(HARNESS_PKG)
	HARNESS_CONTINUOUS_MINUTES="$(HARNESS_CONTINUOUS_MINUTES)" \
	HARNESS_KEEP_ON_FAILURE="$(HARNESS_KEEP_ON_FAILURE)" \
	$(GO) test -tags=harness -count=1 -run '^TestHarnessContinuous$$' \
	  -timeout $$(( $(HARNESS_CONTINUOUS_MINUTES) + $(HARNESS_CONTINUOUS_SETUP_MINUTES) ))m -v $(HARNESS_PKG)

.PHONY: harness-sweep
harness-sweep: ## Remove stale harness environments and list the kept ones
	$(GO) test -tags=harness -count=1 -run '^TestSweep$$' -v $(HARNESS_PKG)

.PHONY: harness-sweep-all
harness-sweep-all: ## Remove every harness environment, kept or live (needs CONFIRM=1)
ifneq ($(CONFIRM),1)
	@echo "harness-sweep-all removes every harness environment, including kept and running ones; rerun with CONFIRM=1." >&2
	@exit 1
else
	HARNESS_SWEEP_ALL_CONFIRM=1 $(GO) test -tags=harness -count=1 -run '^TestSweepAll$$' -v $(HARNESS_PKG)
endif

.PHONY: go-vet-harness
go-vet-harness: ## Static checks for the harness-tagged packages
	$(GO) vet -tags=harness ./test/harness/... ./test/internal/netguard/...

endif  # MK_LOCAL_HARNESS_INCLUDED
