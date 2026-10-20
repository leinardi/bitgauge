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
# The dist URL allowlist (docs/features/technical-stack/build-packaging.md section 4).
#
# Reads every file of a built SPA, binary files included, and fails on any http://, https://,
# ws:// or wss:// URL, the scheme in any case, that is not on the allowlist: the SPA calls nothing
# outside its own origin (docs/features/security.md section 3), and a URL in the dist is the first
# sign that something would. The allowlist lives in .dist-url-allowlist. An entry is an exact URL;
# an entry ending in /* allows the URL before it and anything under it (a path, a query or a
# fragment), never a longer name such as a repository with a suffix.
#
# A dist that is missing or empty fails: nothing passes on nothing.

set -euo pipefail

DIST="${1:-web/dist}"
ALLOWLIST="${DIST_URL_ALLOWLIST:-.dist-url-allowlist}"

fail() {
	printf 'check-dist-urls: %s\n' "$1" >&2
	exit 1
}

[[ -d "$DIST" ]] || fail "no dist at $DIST; build the SPA first (make web-build)"
[[ -f "$ALLOWLIST" ]] || fail "no allowlist at $ALLOWLIST"

exact=()
prefixes=()
while IFS= read -r line || [[ -n "$line" ]]; do
	line="${line%%#*}"
	line="${line//[[:space:]]/}"
	[[ -z "$line" ]] && continue
	case "$line" in
	http://* | https://*) ;;
	*) fail "allowlist entry '$line' is not an http or https URL" ;;
	esac
	if [[ "$line" == */\* ]]; then
		prefixes+=("${line%/\*}")
	else
		exact+=("$line")
	fi
done <"$ALLOWLIST"

# allowed answers whether one URL found in the dist is on the allowlist.
allowed() {
	local url="$1" entry
	for entry in "${exact[@]+"${exact[@]}"}"; do
		[[ "$url" == "$entry" ]] && return 0
	done
	for entry in "${prefixes[@]+"${prefixes[@]}"}"; do
		case "$url" in
		"$entry" | "$entry"/* | "$entry"\?* | "$entry"\#*) return 0 ;;
		esac
	done
	return 1
}

# A URL runs as long as it has the characters a URL is written with, brackets included for an
# IPv6 host: a quote, whitespace, a control byte or anything outside ASCII ends it. The scheme is
# matched in any case, as browsers accept it.
URL_PATTERN='(https?|wss?)://[][A-Za-z0-9._~:/?#@!$&*+,;=%-]+'
# A scheme followed by a byte outside printable ASCII starts a URL the pattern cannot read, such as
# one with a non-ASCII host; it fails as it is.
UNREADABLE_PATTERN='(https?|wss?)://[^ -~]'

# scan prints the URLs of one file, one per line, or fails when grep cannot read it.
scan() {
	local file="$1" pattern="$2" status=0 found
	found="$(LC_ALL=C grep -aoiE "$pattern" "$file")" || status=$?
	# grep answers 1 for a file without a match; anything above is a file it could not read.
	((status <= 1)) || fail "cannot read ${file}"
	printf '%s' "$found"
}

files=0
problems=0
while IFS= read -r -d '' file; do
	files=$((files + 1))
	urls="$(scan "$file" "$URL_PATTERN")"
	unreadable="$(scan "$file" "$UNREADABLE_PATTERN")"
	if [[ -n "$unreadable" ]]; then
		printf 'check-dist-urls: %s: a URL with characters outside ASCII is not on the dist URL allowlist\n' "${file#"$DIST"/}" >&2
		problems=$((problems + 1))
	fi
	while IFS= read -r url; do
		[[ -z "$url" ]] && continue
		# Punctuation that ends a sentence or a list is not part of the URL; the scheme is read in
		# lower case.
		url="${url%[.,;:]}"
		scheme="$(printf '%s' "${url%%://*}" | tr '[:upper:]' '[:lower:]')"
		url="${scheme}://${url#*://}"
		if ! allowed "$url"; then
			printf 'check-dist-urls: %s: %s is not on the dist URL allowlist\n' "${file#"$DIST"/}" "$url" >&2
			problems=$((problems + 1))
		fi
	done < <(sort -u <<<"$urls")
done < <(find "$DIST" -type f -print0)

((files > 0)) || fail "the dist at $DIST holds no file"
if ((problems > 0)); then
	fail "$problems URL(s) outside the allowlist; a new entry is argued in review (.dist-url-allowlist)"
fi
printf 'check-dist-urls: %d file(s), every URL on the allowlist\n' "$files"
