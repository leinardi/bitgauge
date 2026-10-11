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
# Developer Certificate of Origin check, run as a commit-msg hook.
#
# CONTRIBUTING.md asks every commit to be signed off (git commit -s). This makes that a gate: the
# message must carry a Signed-off-by trailer for the commit's author, name and email exactly as git
# will record them. A trailer for somebody else does not certify the author's own change.
#
# Merge commits and fixup!/squash!/amend! commits are exempt: the first carries no change of its
# own, and the others are folded into a signed-off commit before they land. That holds locally,
# where the hook runs before the history is cleaned up; CI's signoff job runs with --strict, which
# exempts nothing, because there the commit is about to land as it is: an autosquash commit must be
# squashed first, and a real merge commit never reaches the script (git rev-list --no-merges).

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/check-signoff.sh [--strict] <commit-message-file>

Fails unless the commit message carries a "Signed-off-by: Name <email>" trailer matching the
commit's author identity. Run as a pre-commit commit-msg hook.

  --strict  exempt no subject: fail fixup!, squash! and amend! commits, and check a "Merge"
            subject like any other. CI runs it this way on the commits of a pull request.
EOF
}

strict=false
if [[ $# -eq 2 && $1 == --strict ]]; then
	strict=true
	shift
fi

if [[ $# -ne 1 || $1 == -h || $1 == --help || $1 == --strict ]]; then
	usage >&2
	exit 2
fi

message_file="$1"

# The message as git will store it. In verbose mode the file also holds a scissors line and the
# diff below it, which git cuts before storing the message: cut there too, then drop comments.
# The cut line starts with the comment character, which core.commentChar may change, so any one
# non-blank character is accepted; git stripspace reads core.commentChar itself.
message="$(sed '/^[^[:space:]] -\{24\} >8 -\{24\}$/,$d' "${message_file}" | git stripspace --strip-comments)"
subject="${message%%$'\n'*}"

case "${subject}" in
'fixup! '* | 'squash! '* | 'amend! '*)
	if [[ ${strict} == true ]]; then
		echo "Commit \"${subject}\" is an autosquash commit: squash it before merging." >&2
		exit 1
	fi
	exit 0
	;;
'Merge '*)
	if [[ ${strict} == false ]]; then
		exit 0
	fi
	;;
esac

# "Name <email> timestamp tz": the identity git uses for this commit's author.
ident="$(git var GIT_AUTHOR_IDENT)"
author="${ident% * *}"
expected="Signed-off-by: ${author}"

trailers="$(printf '%s\n' "${message}" | git interpret-trailers --parse)"

while IFS= read -r trailer; do
	if [[ ${trailer} == "${expected}" ]]; then
		exit 0
	fi
done <<<"${trailers}"

cat >&2 <<EOF
Commit is not signed off by its author.

Expected the trailer:
  ${expected}

Commit with "git commit -s" to certify the Developer Certificate of Origin
(https://developercertificate.org/), as CONTRIBUTING.md requires.
EOF
exit 1
