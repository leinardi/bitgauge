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


ifndef MK_LOCAL_VERIFY_INCLUDED
MK_LOCAL_VERIFY_INCLUDED := 1

# Umbrella validation targets: one command per area for fast agent and CI feedback.

.PHONY: verify-web
verify-web: web-lint web-test ## Verify the web code (ESLint, vue-tsc, Vitest)

.PHONY: verify
verify: verify-rust verify-web ## Verify everything (verify-rust lives in rust.mk)

endif  # MK_LOCAL_VERIFY_INCLUDED
