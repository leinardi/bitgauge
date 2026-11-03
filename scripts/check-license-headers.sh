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
# License header checker.
#
# BitGauge is GPL-3.0-or-later (decisions.md section 32), and every source file says so in its own
# header. This fails on any tracked source file whose first lines do not carry the BitGauge notice
# with the "or (at your option) any later version" grant, so a header copied from a GPL-3.0-only
# project, or from another project altogether, is caught as surely as a missing one.
#
# Governed: Go, Rust, shell, TypeScript, JavaScript and Vue sources, Dockerfiles, the Makefile, the
# repo-local .mk fragments and the Rust workspace's own TOML (the Cargo manifests, clippy.toml,
# deny.toml, rustfmt.toml, rust-toolchain.toml). Exempt, each for a stated reason: the make-common files the bootstrap
# fetches (upstream, named in the Makefile's MK_COMMON_FILES), generated code, the shadcn-vue
# components (generated from upstream templates), the six vendored skills pinned in
# skills-lock.json and the design export. BitGauge's own skills are governed like any source.
#
# A governed file adapted from another repository (docs/rust-port.md, Reuse Ledger) says so in one
# provenance line right after its header, and that line must name its source exactly:
#   Adapted from <repo>/<path> at <commit>, <license>, Copyright (c) <year> <holder>
# A line that starts "Adapted from" in any other shape is refused, so a source cannot go unnamed.

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/check-license-headers.sh

Checks every tracked source file for the BitGauge GPL-3.0-or-later header and lists the files
that lack it. Run from anywhere inside the repository.
EOF
}

if [[ $# -gt 0 ]]; then
	usage >&2
	exit 2
fi

cd "$(git rev-parse --show-toplevel)"

# How many leading lines the header must sit in: a shebang and a blank line may precede it.
HEADER_WINDOW=25

# The one accepted provenance line, after its comment marker (//, # or *).
PROVENANCE_RE='^[[:space:]]*(//|#|\*)[[:space:]]*Adapted from [A-Za-z0-9._-]+/[^ ]+ at [0-9a-f]{7,40}, (MIT|Apache-2\.0), Copyright \(c\) [0-9]{4} [^ ].*[^ ,.]$'
# Any line that claims an adaptation.
PROVENANCE_CLAIM_RE='^[[:space:]]*(//|#|\*)[[:space:]]*Adapted from '

REQUIRED_LINES=(
	"This file is part of BitGauge."
	"Copyright (c) "
	"it under the terms of the GNU General Public License as published by"
	"the Free Software Foundation, either version 3 of the License, or"
	"(at your option) any later version."
)

# Path prefixes and exact paths that are not BitGauge's own source.
EXEMPT_PREFIXES=(
	".agents/skills/fallow/"
	".agents/skills/vue-best-practices/"
	".agents/skills/vue-router-best-practices/"
	".agents/skills/vue-testing-best-practices/"
	"docs/design_system/"
	"web/src/components/ui/"
)
EXEMPT_PATHS=(
	"scripts/bootstrap-mk-common.sh"
	"web/src/api/types.gen.ts"
)

# The shared make fragments, read from the Makefile so the list cannot drift from what the
# bootstrap actually fetches.
mk_common_files() {
	sed -n 's/^MK_COMMON_FILES[[:space:]]*:=[[:space:]]*//p' Makefile
}

is_governed() {
	local path="$1" base
	base="${path##*/}"

	case "${path}" in
	*.go | *.rs | *.sh | *.ts | *.tsx | *.mts | *.cts | *.js | *.mjs | *.cjs | *.vue | .mk/*.mk)
		return 0
		;;
	esac

	case "${base}" in
	Makefile | Dockerfile | *.Dockerfile | Cargo.toml | clippy.toml | deny.toml | rustfmt.toml | rust-toolchain.toml)
		return 0
		;;
	esac

	return 1
}

is_exempt() {
	local path="$1" entry

	for entry in "${EXEMPT_PREFIXES[@]}"; do
		if [[ ${path} == "${entry}"* ]]; then
			return 0
		fi
	done

	for entry in "${EXEMPT_PATHS[@]}"; do
		if [[ ${path} == "${entry}" ]]; then
			return 0
		fi
	done

	for entry in ${COMMON_FILES}; do
		if [[ ${path} == ".mk/${entry}" ]]; then
			return 0
		fi
	done

	return 1
}

has_header() {
	local path="$1" head line
	head="$(head -n "${HEADER_WINDOW}" -- "${path}")"

	for line in "${REQUIRED_LINES[@]}"; do
		if [[ ${head} != *"${line}"* ]]; then
			return 1
		fi
	done

	return 0
}

# Prints the provenance lines of the file's opening lines that do not have the accepted shape.
bad_provenance() {
	local path="$1"
	head -n "$((HEADER_WINDOW + 5))" -- "${path}" | grep -E "${PROVENANCE_CLAIM_RE}" | grep -Ev "${PROVENANCE_RE}" || [[ $? -eq 1 ]]
}

COMMON_FILES="$(mk_common_files)"
missing=()
malformed=()
checked=0

while IFS= read -r -d '' path; do
	if ! is_governed "${path}" || is_exempt "${path}"; then
		continue
	fi

	# A tracked file deleted in the working tree is not this check's concern.
	if [[ ! -f ${path} ]]; then
		continue
	fi

	checked=$((checked + 1))

	if ! has_header "${path}"; then
		missing+=("${path}")
	fi

	if [[ -n "$(bad_provenance "${path}")" ]]; then
		malformed+=("${path}")
	fi
done < <(git ls-files -z)

status=0

if [[ ${#missing[@]} -gt 0 ]]; then
	echo "These files lack the BitGauge GPL-3.0-or-later header:" >&2
	printf '  %s\n' "${missing[@]}" >&2
	echo "Copy the header from any Go or shell file (IntelliJ: the GNU GPLv3 copyright profile)." >&2
	status=1
fi

if [[ ${#malformed[@]} -gt 0 ]]; then
	echo "These files have a provenance line that does not name its source exactly:" >&2
	printf '  %s\n' "${malformed[@]}" >&2
	echo "Write: Adapted from <repo>/<path> at <commit>, <license>, Copyright (c) <year> <holder>" >&2
	status=1
fi

if [[ ${status} -ne 0 ]]; then
	exit "${status}"
fi

echo "License headers: ${checked} files checked, all carry the GPL-3.0-or-later header."
