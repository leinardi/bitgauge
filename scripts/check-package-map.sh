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
# Package map checker.
#
# backend.md section 1 carries a map of every Go package in the module. A map is only worth reading
# if it is complete, and that does not survive by itself: a new package is added without a row, and
# after a while the map describes a repository that no longer exists. This compares the table
# against the compiler's answer.
#
# The two directions are treated differently, because the map is part of a specification written
# before the code:
#
#   - package -> row is blocking: every package that exists needs a row. Until code exists this is
#     vacuously true, which is correct.
#   - row -> package is informational: a row whose package does not exist yet is a planned package,
#     printed as "planned, not implemented" and not a failure.
#
# The authoritative set is `go list` over the whole module, with the image and harness build tags
# so packages that only build under them are still seen, minus the test-only tree under test/,
# which is scaffolding rather than architecture, and any package listed in EXCLUDED_PACKAGES below.
#
# The table lives between the package-map markers in DOC_FILE. Its first column is the package path
# relative to the module root, in backquotes (`internal/config`, `cmd/bitgauge`, `web`), and a
# trailing "/*" covers a whole subtree.

set -euo pipefail

DOC_FILE="${PACKAGE_MAP_DOC:-docs/features/technical-stack/backend.md}"
MARKER_START="<!-- package-map start -->"
MARKER_END="<!-- package-map end -->"

# Packages the map deliberately does not carry, as module-relative paths. Generated code would go
# here; listing it explicitly rather than pattern-matching makes adding one a visible decision.
EXCLUDED_PACKAGES=()

usage() {
	cat <<'EOF'
Usage: scripts/check-package-map.sh

Compares the package map in backend.md section 1 against `go list` over the module (test/ aside).
Fails on a package with no row; lists rows whose package does not exist yet as planned.
EOF
}

# is_excluded answers whether a package is one the map deliberately omits.
is_excluded() {
	local package="$1" excluded

	# node_modules is npm's, not ours: go.mod ignores web/node_modules, and this is the second line
	# of defense for an npm package that ships Go source (flatted does) anywhere else.
	case "$package" in
	test | test/* | node_modules/* | */node_modules/*) return 0 ;;
	esac

	for excluded in "${EXCLUDED_PACKAGES[@]}"; do
		if [[ $package == "$excluded" ]]; then
			return 0
		fi
	done

	return 1
}

# actual_packages prints every mapped package as a module-relative path, one per line, sorted.
#
# The listing is captured rather than piped in: a process substitution's failure is invisible to
# errexit, and a go missing from the hook's PATH would otherwise look exactly like a repository
# with no packages at all -- which this check accepts.
actual_packages() {
	local module listed package

	if ! module="$(go list -m 2>&1)"; then
		printf 'go list -m failed, so there is no module to compare the map against:\n%s\n' \
			"$module" >&2
		return 1
	fi

	if ! listed="$(go list -tags=image,harness ./... 2>&1)"; then
		printf 'go list failed, so there is nothing to compare the map against:\n%s\n' \
			"$listed" >&2
		return 1
	fi

	while IFS= read -r package; do
		[[ -n $package ]] || continue

		if [[ $package == "$module" ]]; then
			package="."
		elif [[ $package == "$module"/* ]]; then
			package="${package#"$module"/}"
		else
			continue
		fi

		is_excluded "$package" && continue

		printf '%s\n' "$package"
	done < <(printf '%s\n' "$listed" | LC_ALL=C sort)
}

# mapped_rows prints the first column of every table row between the markers, sorted.
#
# A row is a line starting with "|" whose first cell starts with a backquoted path; the header and
# its separator do not, so they filter themselves out.
mapped_rows() {
	awk -v start="$MARKER_START" -v end="$MARKER_END" '
		index($0, start) { inside = 1; next }
		index($0, end)   { inside = 0; next }
		!inside { next }
		/^\|/ {
			line = $0
			sub(/^\|[[:space:]]*/, "", line)
			if (substr(line, 1, 1) != "`") next
			line = substr(line, 2)
			cell = substr(line, 1, index(line, "`") - 1)
			if (cell != "") print cell
		}
	' "$DOC_FILE" | LC_ALL=C sort
}

# covers answers whether one row covers one package.
covers() {
	local row="$1" package="$2"

	if [[ $row == "$package" ]]; then
		return 0
	fi

	if [[ $row == */\* && $package == "${row%/\*}"/* ]]; then
		return 0
	fi

	return 1
}

# covered_by_any answers whether any line of the second argument covers the first, in the
# direction the third argument names: "row" checks a package against rows, "package" a row
# against packages.
covered_by_any() {
	local subject="$1" candidates="$2" direction="$3" candidate

	while IFS= read -r candidate; do
		[[ -n $candidate ]] || continue

		if [[ $direction == row ]] && covers "$candidate" "$subject"; then
			return 0
		fi

		if [[ $direction == package ]] && covers "$subject" "$candidate"; then
			return 0
		fi
	done <<<"$candidates"

	return 1
}

main() {
	case "${1-}" in
	-h | --help)
		usage
		return 0
		;;
	"") ;;
	*)
		printf 'unknown argument: %s\n\n' "$1" >&2
		usage >&2
		return 2
		;;
	esac

	if [[ ! -f $DOC_FILE ]]; then
		printf '%s does not exist, so there is no package map to check.\n' "$DOC_FILE" >&2
		return 1
	fi

	if ! grep -qF -- "$MARKER_START" "$DOC_FILE" || ! grep -qF -- "$MARKER_END" "$DOC_FILE"; then
		printf '%s has no package-map markers, so there is no table to check.\n' "$DOC_FILE" >&2
		return 1
	fi

	local packages rows failed=0 package row
	packages="$(actual_packages)" || return 1
	rows="$(mapped_rows)"

	if [[ -z $rows ]]; then
		printf 'the package map in %s has no rows between its markers.\n' "$DOC_FILE" >&2
		return 1
	fi

	while IFS= read -r package; do
		[[ -n $package ]] || continue

		if ! covered_by_any "$package" "$rows" row; then
			printf '%s: no row in the package map\n' "$package" >&2
			failed=1
		fi
	done <<<"$packages"

	while IFS= read -r row; do
		[[ -n $row ]] || continue

		if ! covered_by_any "$row" "$packages" package; then
			printf '%s: planned, not implemented\n' "$row"
		fi
	done <<<"$rows"

	if ((failed != 0)); then
		printf '\nThe package map in %s lacks the packages named above. Add a row for each,\n' \
			"$DOC_FILE" >&2
		printf 'between the package-map markers, with a docs change that says what it does. A\n' >&2
		printf 'package genuinely not worth mapping -- generated code -- goes in EXCLUDED_PACKAGES\n' >&2
		printf 'in scripts/check-package-map.sh, which is a decision a reviewer can see.\n' >&2
		return 1
	fi

	return 0
}

main "$@"
