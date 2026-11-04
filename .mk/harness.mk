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

# The accuracy harness (testing.md section 5): the Rust runners of testenv (feature harness, the
# tests/harness target) drive the topology over the docker CLI and write
# dist/harness/<tier>-<UTC>-<envid>/report.{json,md}. Every target names the implementation it
# tests, BITGAUGE_TEST_IMPL=rust, with no default (image-test.mk); the targets that run BitGauge
# build the shipped image first.
#
# Prerequisites: Linux, a running Docker daemon with buildx, a dhi.io login, the ifb, sch_netem,
# sch_tbf, sch_fq_codel, sch_ingress, cls_u32 and act_mirred kernel modules loadable on the host (a
# container cannot load one), cgroup v2 with memory.peak (Linux 5.19 or later), and npm --prefix web
# ci on the host (the client mounts web/ with its node_modules; it has no route out to install
# anything). The daemon must give each container its own cgroup: rootful, or rootless with systemd
# delegating cpu and memory; a rootless daemon without cgroups (driver none, as docker:dind-rootless
# without --privileged) would report its own CPU and memory as the client's. The runners check this
# and refuse (testing.md section 5.1): the daemon's cgroup claim before any build, then a probe of
# the cgroup accounting and the shaper's tc commands once the tools image is built, before
# BitGauge's image. make harness-preflight runs only those checks.
#
# Inputs, all optional:
#   HARNESS_PROFILES         comma-separated profile names of the tier (default: all)
#   HARNESS_BROWSERS         comma-separated chromium, firefox, webkit (default: all three)
#   HARNESS_KEEP_ON_FAILURE  1 keeps the containers of a run that errored or failed its tolerances
#   HARNESS_SHAPE            none runs without the shaper (harness-ceiling sets it)
#   HARNESS_CONTINUOUS_MINUTES  harness-continuous only: the minutes it samples (default 60, at least 6)
#   HARNESS_PREFLIGHT        harness-preflight only: accounting or shaping (default: both)

HARNESS_TIMEOUT         ?= 120m
# The cargo invocation of the Rust runners; the arguments after -- go to the runner.
HARNESS_CARGO           = $(CARGO) test --locked -p testenv --features harness --test harness --
HARNESS_PROFILES        ?=
HARNESS_BROWSERS        ?=
HARNESS_KEEP_ON_FAILURE ?= 0
HARNESS_SHAPE           ?=
HARNESS_CONTINUOUS_MINUTES ?= 60
HARNESS_PREFLIGHT       ?=
# The image builds, the topology and the browser's setup around the sampled minutes.
HARNESS_CONTINUOUS_SETUP_MINUTES := 30

# harness_run runs one tier: $(1) is the tier, $(2) the shape setting.
define harness_run
	$(test_impl_guard)
	$(MAKE) --no-print-directory test-impl-image
	$(test_impl_env) \
	HARNESS_TIER=$(1) \
	HARNESS_PROFILES="$(HARNESS_PROFILES)" \
	HARNESS_BROWSERS="$(HARNESS_BROWSERS)" \
	HARNESS_KEEP_ON_FAILURE="$(HARNESS_KEEP_ON_FAILURE)" \
	HARNESS_SHAPE="$(2)" \
	timeout $(HARNESS_TIMEOUT) $(HARNESS_CARGO) --run '^TestHarness$$'
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
	$(test_impl_guard)
	@case "$(HARNESS_CONTINUOUS_MINUTES)" in ''|*[!0-9]*) \
	  echo "HARNESS_CONTINUOUS_MINUTES must be a whole number of at least 6, not '$(HARNESS_CONTINUOUS_MINUTES)'" >&2; exit 1;; \
	esac
	$(MAKE) --no-print-directory test-impl-image
	$(test_impl_env) \
	HARNESS_CONTINUOUS_MINUTES="$(HARNESS_CONTINUOUS_MINUTES)" \
	HARNESS_KEEP_ON_FAILURE="$(HARNESS_KEEP_ON_FAILURE)" \
	timeout $$(( $(HARNESS_CONTINUOUS_MINUTES) + $(HARNESS_CONTINUOUS_SETUP_MINUTES) ))m \
	  $(HARNESS_CARGO) --run '^TestHarnessContinuous$$'

.PHONY: harness-preflight
harness-preflight: ## Check the Docker daemon's cgroup accounting and shaping for the harness
	$(test_impl_guard)
	$(test_impl_env) HARNESS_PREFLIGHT="$(HARNESS_PREFLIGHT)" $(HARNESS_CARGO) --run '^TestPreflight$$'

.PHONY: harness-sweep
harness-sweep: ## Remove stale harness environments and list the kept ones
	$(test_impl_guard)
	$(test_impl_env) $(HARNESS_CARGO) --run '^TestSweep$$'

.PHONY: harness-sweep-all
harness-sweep-all: ## Remove every harness environment, kept or live (needs CONFIRM=1)
ifneq ($(CONFIRM),1)
	@echo "harness-sweep-all removes every harness environment, including kept and running ones; rerun with CONFIRM=1." >&2
	@exit 1
else
	$(test_impl_guard)
	$(test_impl_env) HARNESS_SWEEP_ALL_CONFIRM=1 $(HARNESS_CARGO) --run '^TestSweepAll$$'
endif

endif  # MK_LOCAL_HARNESS_INCLUDED
