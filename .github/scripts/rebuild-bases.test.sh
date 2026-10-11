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

# Tests for rebuild-bases.sh. Plain bash: each case writes the release's Dockerfile and main's, runs
# the script, and checks its exit status, its output and its notice.
#
# Run: bash .github/scripts/rebuild-bases.test.sh

set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/rebuild-bases.sh"
repo_root=$(cd "$here/../.." && pwd)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failures=0

# Digests: any 64 hex characters do; only their place in the reference matters.
d1=sha256:1111111111111111111111111111111111111111111111111111111111111111
d2=sha256:2222222222222222222222222222222222222222222222222222222222222222

# dockerfile <path> <web image> <build image> <runtime image> writes a Dockerfile shaped like the
# shipped one: flags on the build stages, instructions between the stages.
dockerfile() {
	cat >"$1" <<EOF
# syntax=docker/dockerfile:1
FROM --platform=\$BUILDPLATFORM $2 AS web
RUN npm ci

FROM --platform=\$BUILDPLATFORM $3 AS build
ARG VERSION="dev"
COPY --from=web /src/web/dist web/dist

FROM $4 AS runtime
COPY --from=build /out/bitgauge /bitgauge
ENTRYPOINT ["/bitgauge"]
EOF
}

release_web="dhi.io/node:24-alpine3.23-dev@$d1"
release_build="dhi.io/golang:1.26-alpine3.23-dev@$d1"
release_runtime="dhi.io/static:20250419@$d1"

# check <name> <want-exit> <want-notice> <web> <build> <runtime> runs the script on the release's
# Dockerfile and main's built from the three images. want-notice is a substring of stderr, or
# empty when the run must pass. A passing run must print the release's Dockerfile with main's
# images, and nothing else changed.
check() {
	local name=$1 want_exit=$2 want_notice=$3
	dockerfile "$work/tag.Dockerfile" "$release_web" "$release_build" "$release_runtime"
	dockerfile "$work/main.Dockerfile" "$4" "$5" "$6"

	local status=0
	"$script" v1.2.3 "$work/tag.Dockerfile" "$work/main.Dockerfile" >"$work/out" 2>"$work/err" || status=$?

	local ok=true
	if [ "$status" -ne "$want_exit" ]; then
		ok=false
	fi

	if [ -n "$want_notice" ] && ! grep -qF -- "$want_notice" "$work/err"; then
		ok=false
	fi

	if [ "$want_exit" -eq 0 ] && ! diff -u "$work/main.Dockerfile" "$work/out" >"$work/diff"; then
		ok=false
	fi

	if [ "$ok" = true ]; then
		echo "ok   $name"
	else
		echo "FAIL $name: exit $status (want $want_exit), stderr [$(cat "$work/err")], diff [$(cat "$work/diff" 2>/dev/null)]"
		failures=$((failures + 1))
	fi
}

# Allowed: a refresh.
check "an unchanged Dockerfile passes" 0 "" \
	"$release_web" "$release_build" "$release_runtime"
check "digest refreshes on every stage pass" 0 "" \
	"dhi.io/node:24-alpine3.23-dev@$d2" "dhi.io/golang:1.26-alpine3.23-dev@$d2" "dhi.io/static:20250419@$d2"
check "a moved runtime date passes" 0 "" \
	"$release_web" "$release_build" "dhi.io/static:20251003@$d2"

release_web="dhi.io/node:24.21.0-alpine3.23-dev@$d1"
release_build="dhi.io/golang:1.26.8-alpine3.23-dev@$d1"
check "patch refreshes pass" 0 "" \
	"dhi.io/node:24.21.1-alpine3.23-dev@$d2" "dhi.io/golang:1.26.9-alpine3.23-dev@$d2" "$release_runtime"
check "a Node minor within its major passes" 0 "" \
	"dhi.io/node:24.22.0-alpine3.23-dev@$d2" "$release_build" "$release_runtime"
release_web="dhi.io/node:24-alpine3.23-dev@$d1"
release_build="dhi.io/golang:1.26-alpine3.23-dev@$d1"

# Rejected: a new line, repository, variant or tag shape, with the actionable notice.
check "a Go minor change is rejected" 1 \
	"main moved build from Go 1.26 to Go 1.27; v1.2.3 keeps Go 1.26, so cut a release to ship the new line, or pin the old one on main" \
	"$release_web" "dhi.io/golang:1.27-alpine3.23-dev@$d2" "$release_runtime"
check "a Node major change is rejected" 1 \
	"main moved web from Node 24 to Node 26; v1.2.3 keeps Node 24, so cut a release to ship the new line" \
	"dhi.io/node:26-alpine3.23-dev@$d2" "$release_build" "$release_runtime"
check "a build repository change is rejected" 1 \
	"main moved build from dhi.io/golang to docker.io/library/golang; v1.2.3 keeps dhi.io/golang, so cut a release to ship the new image" \
	"$release_web" "docker.io/library/golang:1.26-alpine3.23@$d2" "$release_runtime"
check "a runtime repository change is rejected" 1 \
	"main moved runtime from dhi.io/static to gcr.io/distroless/static" \
	"$release_web" "$release_build" "gcr.io/distroless/static:20250419@$d2"
check "an Alpine change in the tag is rejected" 1 \
	"main moved build from the tag 1.26-alpine3.23-dev to 1.26-alpine3.24-dev" \
	"$release_web" "dhi.io/golang:1.26-alpine3.24-dev@$d2" "$release_runtime"
check "a more precise version is a new tag shape" 1 \
	"main moved web from the tag 24-alpine3.23-dev to 24.21.0-alpine3.23-dev" \
	"dhi.io/node:24.21.0-alpine3.23-dev@$d2" "$release_build" "$release_runtime"
check "a runtime variant change is rejected" 1 \
	"main moved runtime from the variant '' to '-dev'" \
	"$release_web" "$release_build" "dhi.io/static:20250419-dev@$d2"
check "an unpinned image on main is rejected" 1 \
	"main's build image dhi.io/golang:1.26-alpine3.23-dev is not pinned by digest" \
	"$release_web" "dhi.io/golang:1.26-alpine3.23-dev" "$release_runtime"
check "every change is reported, not only the first" 1 \
	"main moved web from Node 24 to Node 26" \
	"dhi.io/node:26-alpine3.23-dev@$d2" "dhi.io/golang:1.27-alpine3.23-dev@$d2" "$release_runtime"
if ! grep -qF "main moved build from Go 1.26 to Go 1.27" "$work/err"; then
	echo "FAIL every change is reported: the Go change is missing from [$(cat "$work/err")]"
	failures=$((failures + 1))
fi

# The stage name decides, not the order: a Dockerfile whose stages come in another order is
# rewritten stage by stage, keeping its own flags.
cat >"$work/tag.Dockerfile" <<EOF
FROM dhi.io/static:20250419@$d1 AS runtime
FROM --platform=\$BUILDPLATFORM dhi.io/golang:1.26-alpine3.23-dev@$d1 AS build
FROM --platform=\$BUILDPLATFORM dhi.io/node:24-alpine3.23-dev@$d1 AS web
EOF
dockerfile "$work/main.Dockerfile" "dhi.io/node:24-alpine3.23-dev@$d2" \
	"dhi.io/golang:1.26-alpine3.23-dev@$d2" "dhi.io/static:20250419@$d2"
if "$script" v1.2.3 "$work/tag.Dockerfile" "$work/main.Dockerfile" >"$work/out" 2>"$work/err" &&
	grep -qxF "FROM --platform=\$BUILDPLATFORM dhi.io/golang:1.26-alpine3.23-dev@$d2 AS build" "$work/out" &&
	grep -qxF "FROM dhi.io/static:20250419@$d2 AS runtime" "$work/out" &&
	[ "$(head -n 1 "$work/out")" = "FROM dhi.io/static:20250419@$d2 AS runtime" ]; then
	echo "ok   FROM lines are rewritten by stage name"
else
	echo "FAIL FROM lines are rewritten by stage name: [$(cat "$work/out")] [$(cat "$work/err")]"
	failures=$((failures + 1))
fi

# A stage missing from either file, or named twice, fails rather than being skipped.
printf 'FROM dhi.io/static:20250419@%s AS runtime\n' "$d1" >"$work/tag.Dockerfile"
if "$script" v1.2.3 "$work/tag.Dockerfile" "$work/main.Dockerfile" >/dev/null 2>"$work/err" ||
	! grep -qF "has no FROM line for the web stage" "$work/err"; then
	echo "FAIL a missing stage fails: [$(cat "$work/err")]"
	failures=$((failures + 1))
else
	echo "ok   a missing stage fails"
fi

dockerfile "$work/tag.Dockerfile" "$release_web" "$release_build" "$release_runtime"
printf 'FROM %s AS web\n' "$release_web" >>"$work/tag.Dockerfile"
if "$script" v1.2.3 "$work/tag.Dockerfile" "$work/main.Dockerfile" >/dev/null 2>"$work/err" ||
	! grep -qF "more than one FROM line for the web stage" "$work/err"; then
	echo "FAIL a stage named twice fails: [$(cat "$work/err")]"
	failures=$((failures + 1))
else
	echo "ok   a stage named twice fails"
fi

# The shipped Dockerfile has the three stages the script reads, and passes against itself.
dockerfile_path="$repo_root/deployments/docker/Dockerfile"
if "$script" v1.2.3 "$dockerfile_path" "$dockerfile_path" >"$work/out" 2>"$work/err" &&
	diff -q "$dockerfile_path" "$work/out" >/dev/null; then
	echo "ok   the shipped Dockerfile passes against itself, unchanged"
else
	echo "FAIL the shipped Dockerfile against itself: [$(cat "$work/err")]"
	failures=$((failures + 1))
fi

status=0
"$script" v1.2.3 "$work/tag.Dockerfile" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 2 ]; then
	echo "ok   a missing argument is a usage error"
else
	echo "FAIL a missing argument is a usage error: exit $status"
	failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
	echo "$failures case(s) failed" >&2
	exit 1
fi

echo "all cases passed"
