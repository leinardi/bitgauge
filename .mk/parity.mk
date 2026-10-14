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


ifndef MK_LOCAL_PARITY_INCLUDED
MK_LOCAL_PARITY_INCLUDED := 1

# The demo parity harness: the design kit's prototype and the Vue demo driven through the same
# scenarios and compared (web/parity/, docs/engineering/demo-parity.md). On demand only, never in CI.
# The harness selects what runs itself, from SCENARIO= (scenario ids or prefix/*, comma-separated)
# and MATRIX=full; Playwright's own filters are refused, because the baseline is judged against what
# the selection says ran.
PARITY_ENV = PARITY_MATRIX="$(MATRIX)" PARITY_SCENARIOS="$(SCENARIO)"

# Installs the pinned Chromium only when it is missing: playwright install refuses to run on an OS
# release it does not list yet, even with the browser already in the cache and working.
.PHONY: demo-parity-browsers
demo-parity-browsers: $(WEB_INSTALLED) ## Install the Chromium the parity harness drives, when it is missing
	@cd "$(WEB_DIR)" && \
	  chrome="$$(node -e "import('@playwright/test').then((m) => process.stdout.write(m.chromium.executablePath()))")" && \
	  if [ ! -x "$$chrome" ]; then npm exec --no -- playwright install chromium; fi

.PHONY: demo-parity
demo-parity: demo-parity-browsers ## Compare the design kit's prototype with the Vue demo (SCENARIO=..., MATRIX=full)
	cd "$(WEB_DIR)" && $(PARITY_ENV) npm run parity

.PHONY: demo-parity-full
demo-parity-full: ## demo-parity over all four theme x viewport projects
	@$(MAKE) --no-print-directory demo-parity MATRIX=full SCENARIO="$(SCENARIO)"

.PHONY: demo-parity-update
demo-parity-update: demo-parity-browsers ## Drop .parity-baseline entries a complete run no longer finds
	cd "$(WEB_DIR)" && $(PARITY_ENV) PARITY_BASELINE=update npm run parity

# The reason reaches the harness through the environment, never through the shell, so a quote,
# a dollar sign or a backtick in it is kept as written; only the accept mode reads it.
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

# The triage helper over .parity-triage.json and the last run (web/parity/triage/cli.ts):
# CMD="drafts", CMD="show <id>", CMD="snapshot <id>" and so on; status when CMD is unset.
# PARITY_TRIAGE_LEDGER and PARITY_BASELINE_FILE point it at scratch copies instead; a relative path
# is taken from the repository root, not from web/ where the helper runs. No dependency install: the
# helper loads only Node built-ins and the parity modules, so it needs no node_modules.
.PHONY: demo-parity-triage
demo-parity-triage: ## Triage the parity differences with the helper; status unless CMD names a command
	cd "$(WEB_DIR)" && node parity/triage/cli.ts $(or $(CMD),status)

# Both sides on the harness's own ports, in the foreground, for looking at a difference by hand.
# Ctrl+C stops both.
.PHONY: demo-parity-servers
demo-parity-servers: $(WEB_INSTALLED) ## Serve the prototype on port 5181 and the Vue demo build on 5180, for triage
	@cd "$(WEB_DIR)" && { \
	  npm run parity:serve:prototype & proto=$$!; \
	  trap 'kill $$proto 2>/dev/null' EXIT INT TERM; \
	  echo "prototype: http://127.0.0.1:5181/ui_kits/app/index.html"; \
	  echo "vue demo:  http://127.0.0.1:5180/"; \
	  npm run parity:serve:demo; \
	}

endif  # MK_LOCAL_PARITY_INCLUDED
