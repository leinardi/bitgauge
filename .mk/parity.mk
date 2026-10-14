#
# MIT License
#
# Copyright (c) 2026 Roberto Leinardi
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#

ifndef MK_COMMON_PARITY_INCLUDED
MK_COMMON_PARITY_INCLUDED := 1

# The demo parity harness: a design-system prototype and the app's demo build driven through the
# same Playwright scenarios and compared, the known differences held in a ratcheted baseline
# (.parity-baseline). Needs web.mk, listed before this file in MK_COMMON_FILES.
#
# The harness selects what runs itself, from SCENARIO= (scenario ids or prefix/*, comma-separated)
# and MATRIX=full; Playwright's own filters are refused, because the baseline is judged against what
# the selection says ran.
#
# What the consumer's web app provides:
#   npm scripts parity                  the harness (PARITY_MATRIX, PARITY_SCENARIOS,
#                                       PARITY_BASELINE=update|accept and PARITY_REASON from here)
#               parity:serve:prototype  the prototype on 127.0.0.1:5181
#               parity:serve:demo       the demo build on 127.0.0.1:5180
#   parity/triage/cli.ts                the triage helper over the last run
#   playwright-report/                  the HTML report the harness writes

# The prototype page demo-parity-servers points at, relative to the prototype server's root.
PARITY_PROTOTYPE_PAGE ?= index.html

PARITY_ENV = PARITY_MATRIX="$(MATRIX)" PARITY_SCENARIOS="$(SCENARIO)"

# The targets need web.mk's WEB_DIR and install stamp, which this file cannot provide; a parity goal
# without it stops here rather than running npm in the wrong directory.
ifndef MK_COMMON_WEB_INCLUDED
ifneq ($(filter demo-parity%,$(MAKECMDGOALS)),)
$(error parity.mk needs web.mk, listed before it in MK_COMMON_FILES)
endif
endif

# Installs the pinned Chromium only when it is missing: playwright install refuses to run on an OS
# release it does not list yet, even with the browser already in the cache and working.
.PHONY: demo-parity-browsers
demo-parity-browsers: $(WEB_INSTALLED) ## Install the Chromium the parity harness drives, when it is missing
	@cd "$(WEB_DIR)" && \
	  chrome="$$(node -e "import('@playwright/test').then((m) => process.stdout.write(m.chromium.executablePath()))")" && \
	  if [ ! -x "$$chrome" ]; then npm exec --no -- playwright install chromium; fi

.PHONY: demo-parity
demo-parity: demo-parity-browsers ## Compare the prototype with the demo build (SCENARIO=..., MATRIX=full)
	cd "$(WEB_DIR)" && $(PARITY_ENV) npm run parity

.PHONY: demo-parity-full
demo-parity-full: ## demo-parity over every project of the full matrix
	@$(MAKE) --no-print-directory demo-parity MATRIX=full SCENARIO="$(SCENARIO)"

.PHONY: demo-parity-update
demo-parity-update: demo-parity-browsers ## Drop .parity-baseline entries a complete run no longer finds
	cd "$(WEB_DIR)" && $(PARITY_ENV) PARITY_BASELINE=update npm run parity

# The reason reaches the harness through the environment, never through the shell, so a quote,
# a dollar sign or a backtick in it is kept as written; only the accept mode reads it. The empty
# check reads it unexpanded too, so a reason such as $x is not taken for an empty one.
export PARITY_REASON = $(value REASON)

.PHONY: demo-parity-accept
demo-parity-accept: demo-parity-browsers ## Accept a complete run's differences into .parity-baseline (REASON= required)
ifeq ($(strip $(value REASON)),)
	@echo "demo-parity-accept: REASON= is required: say why these differences are accepted" >&2; exit 2
else
	cd "$(WEB_DIR)" && $(PARITY_ENV) PARITY_BASELINE=accept npm run parity
endif

.PHONY: demo-parity-report
demo-parity-report: ## Open the last demo-parity HTML report (screenshots, heatmaps, snapshots)
	cd "$(WEB_DIR)" && npm exec --no -- playwright show-report playwright-report

# The triage helper over the last run: CMD="drafts", CMD="show <id>" and so on; status when CMD is
# unset. No dependency install: the helper loads only Node built-ins and the parity modules, so it
# needs no node_modules.
.PHONY: demo-parity-triage
demo-parity-triage: ## Triage the parity differences with the helper; status unless CMD names a command
	cd "$(WEB_DIR)" && node parity/triage/cli.ts $(or $(CMD),status)

# Both sides on the harness's own ports, in the foreground, for looking at a difference by hand.
# Ctrl+C stops both.
.PHONY: demo-parity-servers
demo-parity-servers: $(WEB_INSTALLED) ## Serve the prototype on port 5181 and the demo build on 5180, for triage
	@cd "$(WEB_DIR)" && { \
	  npm run parity:serve:prototype & proto=$$!; \
	  trap 'kill $$proto 2>/dev/null' EXIT INT TERM; \
	  echo "prototype: http://127.0.0.1:5181/$(PARITY_PROTOTYPE_PAGE)"; \
	  echo "demo:      http://127.0.0.1:5180/"; \
	  npm run parity:serve:demo; \
	}

endif  # MK_COMMON_PARITY_INCLUDED
