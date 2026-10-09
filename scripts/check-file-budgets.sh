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
# Per-file line budgets for the frontend.
#
# Every production .vue and .ts file under web/src is held under a single line ceiling. A file may
# only be exempted by an entry in the budget file, and an exemption is shrinking-only: the entry
# holds the file at the exact line count committed for it, so
#
#   - a budgeted file that grows fails, because its count no longer matches;
#   - a budgeted file that shrinks also fails, until the budget is lowered to the new count, which
#     is what stops a file from reclaiming room it gave back;
#   - a budgeted file that reaches the ceiling fails until its entry is deleted, after which the
#     ceiling holds it like every other file;
#   - a production file over the ceiling with no entry fails, so a new oversized file cannot be
#     born exempt.
#
# The ceiling itself lives in the budget file's data, on its "# ceiling" line: one number, changed
# in one place.
#
# Until web/src exists there are no governed files, so the check passes on the empty set -- that is
# the truth about the tree, not a skipped check: the ceiling is still read and validated, and an
# entry naming a file that does not exist still fails.
#
# --update rewrites the budget file, and can only lower a budget or delete an entry. It never
# raises one and never adds a path -- a file that grew has to be shortened, not re-blessed. --adopt
# does the same and additionally records a file that is over the ceiling and not yet listed, which
# is how a genuinely unavoidable exemption is recorded. It still cannot raise an existing budget.
# Either way the change lands in a diff someone reads.
#
# Paths are repository-relative and are resolved from the current directory, which is the
# repository root under pre-commit. scripts/check-file-budgets.sh is exercised by test/filebudgets,
# which drives it against scratch trees rather than this one.

set -euo pipefail

BUDGET_FILE="${FILE_BUDGETS:-.file-budgets}"

# The tree the ceiling governs. Everything outside it is out of scope by construction.
SCAN_ROOT="${FILE_BUDGETS_ROOT:-web/src}"

# Generated, vendored and test code: the API types generated from api/openapi.yaml, the shadcn-vue
# components copied in by its CLI, and the shared test helpers. A ceiling on a file nobody in this
# repository wrote by hand is not a design constraint, and test files are long for reasons that are
# not complexity.
EXCLUDED_PREFIXES=(
	"web/src/api/types.gen.ts"
	"web/src/components/ui/"
	"web/src/test/"
)

usage() {
	cat <<'EOF'
Usage: scripts/check-file-budgets.sh [--update | --adopt]

  (no argument)  Check every production frontend file against the ceiling and the budgets.
  --update       Rewrite the budget file, lowering and deleting entries only.
  --adopt        As --update, and record files over the ceiling that have no entry yet.
EOF
}

# is_excluded answers whether a path is one this ceiling deliberately says nothing about.
is_excluded() {
	local path="$1" prefix

	case "$path" in
	*.test.ts | *.spec.ts) return 0 ;;
	esac

	for prefix in "${EXCLUDED_PREFIXES[@]}"; do
		if [[ $path == "$prefix"* ]]; then
			return 0
		fi
	done

	return 1
}

# scanned_files prints every production frontend file, one per line, sorted.
scanned_files() {
	local path

	if [[ ! -d $SCAN_ROOT ]]; then
		return 0
	fi

	while IFS= read -r path; do
		is_excluded "$path" && continue
		printf '%s\n' "$path"
	done < <(find "$SCAN_ROOT" -type f \( -name '*.vue' -o -name '*.ts' \) | LC_ALL=C sort)
}

# count_lines prints the number of lines in a file, counting a last line that has no newline after
# it, so a file cannot drop a line from the count by leaving its trailing newline off.
count_lines() {
	local path="$1" lines

	lines=$(($(wc -l <"$path")))

	if [[ -s $path ]] && [[ "$(tail -c 1 -- "$path" | wc -l)" -eq 0 ]]; then
		lines=$((lines + 1))
	fi

	printf '%d\n' "$lines"
}

# read_ceiling prints the ceiling the budget file declares.
read_ceiling() {
	local ceiling

	if [[ ! -f $BUDGET_FILE ]]; then
		printf '%s does not exist, so there is no ceiling to check against.\n' "$BUDGET_FILE" >&2
		return 1
	fi

	# The first "# ceiling <number>" line; prose in the header that happens to start a line with the
	# word ceiling is not a declaration.
	ceiling="$(awk '$1 == "#" && $2 == "ceiling" && $3 ~ /^[0-9]+$/ && NF == 3 { print $3; exit }' \
		"$BUDGET_FILE")"

	if [[ ! $ceiling =~ ^[0-9]+$ ]]; then
		printf '%s declares no "# ceiling <lines>" line, so nothing can be checked.\n' \
			"$BUDGET_FILE" >&2
		return 1
	fi

	printf '%s\n' "$ceiling"
}

# budget_entries prints the budget file's data lines, as "<path><TAB><lines>".
budget_entries() {
	awk -F'\t' '
		/^[[:space:]]*(#|$)/ { next }
		{ print }
	' "$BUDGET_FILE"
}

# load_budgets fills the budgets map and the order array, rejecting entries that are not entries.
load_budgets() {
	local path lines failed=0

	unset budgets budget_order
	declare -gA budgets=()
	declare -ga budget_order=()

	while IFS=$'\t' read -r path lines; do
		[[ -n $path ]] || continue

		if [[ ! $lines =~ ^[0-9]+$ ]]; then
			printf '%s: budget "%s" is not a line count\n' "$path" "$lines" >&2
			failed=1
			continue
		fi

		if [[ -n ${budgets[$path]+set} ]]; then
			printf '%s: listed twice\n' "$path" >&2
			failed=1
			continue
		fi

		budgets["$path"]="$lines"
		budget_order+=("$path")
	done < <(budget_entries)

	return "$failed"
}

# check compares the tree against the budget file. Every disagreement is reported; the exit status
# is the only thing that is not per file.
check() {
	local ceiling path lines budget scanned failed=0
	local -A governed=()

	ceiling="$(read_ceiling)" || return 1
	load_budgets || failed=1
	scanned="$(scanned_files)"

	while IFS= read -r path; do
		[[ -n $path ]] || continue

		governed[$path]=1
		lines="$(count_lines "$path")"
		budget="${budgets[$path]-}"

		if [[ -z $budget ]]; then
			if ((lines > ceiling)); then
				printf '%s: %d lines, over the ceiling of %d, and %s does not exempt it\n' \
					"$path" "$lines" "$ceiling" "$BUDGET_FILE" >&2
				failed=1
			fi

			continue
		fi

		if ((lines <= ceiling)); then
			printf '%s: %d lines, at or below the ceiling of %d -- delete its budget entry\n' \
				"$path" "$lines" "$ceiling" >&2
			failed=1
			continue
		fi

		if ((lines > budget)); then
			printf '%s: %d lines, budget is %d -- a budgeted file may only shrink\n' \
				"$path" "$lines" "$budget" >&2
			failed=1
			continue
		fi

		if ((lines < budget)); then
			printf '%s: %d lines, budget still claims %d -- run --update\n' \
				"$path" "$lines" "$budget" >&2
			failed=1
		fi
	done <<<"$scanned"

	# A lookup, not printf | grep -q: grep exits on the match, the printf still writing takes
	# SIGPIPE, and pipefail reports a file that is there as missing.
	for path in "${budget_order[@]}"; do
		if [[ -z ${governed[$path]+set} ]]; then
			printf '%s: budgeted at %s, but it is not a file this ceiling governs -- run --update\n' \
				"$path" "${budgets[$path]}" >&2
			failed=1
		fi
	done

	if ((failed != 0)); then
		printf '\nThe frontend file budgets and the tree disagree. Shorten the file, or run\n' >&2
		printf 'scripts/check-file-budgets.sh --update and commit %s with the change.\n' \
			"$BUDGET_FILE" >&2
		printf 'Budgets may be lowered and deleted, never raised: that is what keeps the\n' >&2
		printf 'exemptions shrinking.\n' >&2
		return 1
	fi

	return 0
}

# write_budgets rewrites the budget file from the tree. Entries only ever shrink or disappear;
# --adopt may add a path that has none yet, and neither mode raises an existing budget.
write_budgets() {
	local adopt="$1"
	local ceiling path lines budget failed=0
	local -a kept=()

	ceiling="$(read_ceiling)" || return 1
	load_budgets || return 1

	for path in "${budget_order[@]}"; do
		budget="${budgets[$path]}"

		if [[ ! -f $path ]] || is_excluded "$path" || [[ $path != "$SCAN_ROOT"/* ]]; then
			printf 'dropping %s: no longer a file this ceiling governs\n' "$path"
			continue
		fi

		lines="$(count_lines "$path")"

		if ((lines <= ceiling)); then
			printf 'dropping %s: %d lines, at or below the ceiling of %d\n' \
				"$path" "$lines" "$ceiling"
			continue
		fi

		if ((lines > budget)); then
			printf '%s: %d lines, budget is %d -- a budget is never raised, shorten the file\n' \
				"$path" "$lines" "$budget" >&2
			failed=1
			continue
		fi

		if ((lines < budget)); then
			printf 'lowering %s: %d -> %d\n' "$path" "$budget" "$lines"
		fi

		kept+=("$(printf '%s\t%d' "$path" "$lines")")
	done

	if ((adopt != 0)); then
		while IFS= read -r path; do
			[[ -n $path ]] || continue
			[[ -z ${budgets[$path]+set} ]] || continue

			lines="$(count_lines "$path")"

			if ((lines > ceiling)); then
				printf 'adopting %s at %d lines\n' "$path" "$lines"
				kept+=("$(printf '%s\t%d' "$path" "$lines")")
			fi
		done < <(scanned_files)
	fi

	if ((failed != 0)); then
		printf '\n%s was left unchanged.\n' "$BUDGET_FILE" >&2
		return 1
	fi

	local header
	header="$(awk '/^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next } { exit }' "$BUDGET_FILE")"

	{
		printf '%s\n' "$header"
		if ((${#kept[@]} > 0)); then
			printf '%s\n' "${kept[@]}" | LC_ALL=C sort
		fi
	} >"$BUDGET_FILE"

	return 0
}

main() {
	declare -gA budgets=()
	declare -ga budget_order=()

	case "${1-}" in
	--update)
		write_budgets 0
		;;
	--adopt)
		write_budgets 1
		;;
	-h | --help)
		usage
		;;
	"")
		check
		;;
	*)
		printf 'unknown argument: %s\n\n' "$1" >&2
		usage >&2
		return 2
		;;
	esac
}

main "$@"
