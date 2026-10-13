#!/usr/bin/env bash
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
# The engine chunk budget (docs/features/technical-stack/frontend.md section 3).
#
# Finds the engine's Worker chunk in a built SPA, the one file Vite emits as assets/worker-*.js,
# and fails when it is larger than the budget in .chunk-budget, in bytes of minified output. A
# dist without a Worker chunk fails, and so does one with several, so nothing passes on nothing.

set -euo pipefail

DIST="${1:-web/dist}"
BUDGET_FILE="${CHUNK_BUDGET:-.chunk-budget}"

fail() {
	printf 'check-chunk-size: %s\n' "$1" >&2
	exit 1
}

[[ -d "$DIST" ]] || fail "no dist at $DIST; build the SPA first (make web-build)"
[[ -f "$BUDGET_FILE" ]] || fail "no budget at $BUDGET_FILE"

budget=""
while IFS= read -r line || [[ -n "$line" ]]; do
	line="${line%%#*}"
	line="${line//[[:space:]]/}"
	[[ -z "$line" ]] && continue
	[[ -z "$budget" ]] || fail "$BUDGET_FILE holds more than one number"
	[[ "$line" =~ ^[1-9][0-9]*$ ]] || fail "$BUDGET_FILE holds '$line', not a number of bytes"
	budget="$line"
done <"$BUDGET_FILE"
[[ -n "$budget" ]] || fail "$BUDGET_FILE holds no number"

chunks=()
while IFS= read -r -d '' chunk; do
	chunks+=("$chunk")
done < <(find "$DIST/assets" -maxdepth 1 -type f -name 'worker-*.js' -print0 2>/dev/null)

((${#chunks[@]} > 0)) || fail "no Worker chunk (assets/worker-*.js) in $DIST"
((${#chunks[@]} == 1)) || fail "${#chunks[@]} Worker chunks in $DIST, expected the engine's one: ${chunks[*]}"

chunk="${chunks[0]}"
size="$(wc -c <"$chunk")"
size="${size//[[:space:]]/}"
if ((size > budget)); then
	fail "${chunk#"$DIST"/} is $size bytes, over the budget of $budget in $BUDGET_FILE"
fi
printf 'check-chunk-size: %s is %d bytes, within the budget of %d\n' "${chunk#"$DIST"/}" "$size" "$budget"
