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
# The demo-free dist check (docs/features/technical-stack/frontend.md section 9).
#
# A production build leaves the demo out: the SPA chooses the demo's Worker entry, its panel and its
# GET /info answer only behind import.meta.env.VITE_DEMO, which dead-code elimination removes when
# the flag is unset. This reads every file of a built SPA, binary files included, and fails on any
# of the demo's sentinels: its storage key, its scenario table, its fixture server's name and its
# Worker entry's path. The two strings survive minification; the identifier and the path catch an
# unminified build or a source map. A demo build (npm run build:demo) carries them, which is the
# negative control.
#
# A dist that is missing or empty fails: nothing passes on nothing.

set -euo pipefail

DIST="${1:-web/dist}"
SENTINELS=('bitgauge-demo' 'DEMO_SCENARIOS' 'Basement NAS' 'demo/worker')

fail() {
	printf 'check-dist-demo-free: %s\n' "$1" >&2
	exit 1
}

[[ -d "$DIST" ]] || fail "no dist at $DIST; build the SPA first (make web-build)"

files=0
problems=0
while IFS= read -r -d '' file; do
	files=$((files + 1))
	for sentinel in "${SENTINELS[@]}"; do
		status=0
		LC_ALL=C grep -aqF -- "$sentinel" "$file" || status=$?
		# grep answers 1 for a file without the sentinel; anything above is a file it could not read.
		case "$status" in
		0)
			printf 'check-dist-demo-free: %s: contains the demo sentinel %s\n' "${file#"$DIST"/}" "$sentinel" >&2
			problems=$((problems + 1))
			;;
		1) ;;
		*) fail "cannot read ${file}" ;;
		esac
	done
done < <(find "$DIST" -type f -print0)

((files > 0)) || fail "the dist at $DIST holds no file"
if ((problems > 0)); then
	fail "$problems demo sentinel(s) in the dist; a production build must leave the demo out"
fi
printf 'check-dist-demo-free: %d file(s), no demo sentinel\n' "$files"
