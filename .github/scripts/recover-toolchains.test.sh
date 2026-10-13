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

# Tests for recover-toolchains.sh. Plain bash, no network: stub go, node and curl lead a temporary
# PATH. The stub go answers the newer default patch unless GOTOOLCHAIN is exported to it, and the
# stub node on PATH answers the newer default too; only the node inside the unpacked tarball answers
# the recorded version, so a switch counts only when the script selected both in its own process.
# The stub curl serves the tarball and SHASUMS256.txt from a fixture directory, per Node version.
#
# Run: bash .github/scripts/recover-toolchains.test.sh

set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/recover-toolchains.sh"

# The test must not inherit a switch from the shell that runs it.
unset GOTOOLCHAIN GITHUB_ENV GITHUB_PATH

default_go=go1.26.9
default_node=v24.99.0
recorded_go=go1.26.3
recorded_node=v24.1.0

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir "$work/bin" "$work/fixtures"

cat >"$work/bin/go" <<'STUB'
#!/usr/bin/env bash
# Stub go: `go version` prints GOTOOLCHAIN when it is exported (unless STUB_GO_IGNORES_TOOLCHAIN
# is set, a toolchain switch that does not take), and the default patch otherwise.
set -euo pipefail
if [ "$*" != "version" ]; then
	echo "stub go: unexpected call: $*" >&2
	exit 98
fi
version=$STUB_GO_DEFAULT
if [ -n "${GOTOOLCHAIN:-}" ] && [ -z "${STUB_GO_IGNORES_TOOLCHAIN:-}" ]; then
	version=$GOTOOLCHAIN
fi
echo "go version $version linux/amd64"
STUB

cat >"$work/bin/node" <<'STUB'
#!/usr/bin/env bash
# Stub node on the default PATH: the newer default patch.
set -euo pipefail
echo "$STUB_NODE_DEFAULT"
STUB

cat >"$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
# Stub curl: serves https://nodejs.org/dist/<version>/<file> from STUB_FIXTURES/<version>/<file>
# to the -o path, logs every URL to STUB_LOG, and fails like curl -f on a missing file.
set -euo pipefail
out=""
url=""
while [ "$#" -gt 0 ]; do
	case "$1" in
	-o)
		out=$2
		shift 2
		;;
	--proto | --tlsv1.2 | -fsSL)
		if [ "$1" = --proto ]; then
			shift
		fi
		shift
		;;
	https://*)
		url=$1
		shift
		;;
	*)
		echo "stub curl: unexpected argument $1" >&2
		exit 98
		;;
	esac
done
echo "$url" >>"$STUB_LOG"
path=${url#https://nodejs.org/dist/}
if [ "$path" = "$url" ] || [ ! -f "$STUB_FIXTURES/$path" ]; then
	echo "curl: (22) The requested URL returned error: 404" >&2
	exit 22
fi
cp "$STUB_FIXTURES/$path" "$out"
STUB

chmod +x "$work/bin/go" "$work/bin/node" "$work/bin/curl"

export PATH="$work/bin:$PATH"
export STUB_LOG="$work/curl.log"
export STUB_FIXTURES="$work/fixtures"
export STUB_GO_DEFAULT="$default_go"
export STUB_NODE_DEFAULT="$default_node"

# release <version> <prints> builds the fixture of a Node release whose bin/node prints <prints>,
# with a matching SHASUMS256.txt that lists it among other files.
release() {
	local version=$1 prints=$2 name="node-$1-linux-x64"
	local build="$work/build/$name"
	mkdir -p "$build/bin" "$STUB_FIXTURES/$version"
	printf '#!/usr/bin/env bash\necho %s\n' "$prints" >"$build/bin/node"
	chmod +x "$build/bin/node"
	tar -cJf "$STUB_FIXTURES/$version/$name.tar.xz" -C "$work/build" "$name"
	(
		cd "$STUB_FIXTURES/$version"
		{
			echo "0000000000000000000000000000000000000000000000000000000000000000  $name.tar.gz"
			sha256sum "$name.tar.xz"
			echo "1111111111111111111111111111111111111111111111111111111111111111  node-$version-linux-arm64.tar.xz"
		} >SHASUMS256.txt
	)
}

release "$recorded_node" "$recorded_node"
# A release whose binary reports another version than the one it was published as.
release v24.2.0 v24.0.0
# A release whose tarball does not match its SHASUMS256.txt.
release v24.3.0 v24.3.0
sed -i -E 's/^[0-9a-f]{64}(  node-v24\.3\.0-linux-x64\.tar\.xz)$/2222222222222222222222222222222222222222222222222222222222222222\1/' \
	"$STUB_FIXTURES/v24.3.0/SHASUMS256.txt"

failures=0

pass() {
	echo "ok   $1"
}

fail_case() {
	echo "FAIL $1: $2"
	failures=$((failures + 1))
}

# run <annotation> runs the script on a fresh install directory and fresh GITHUB_ENV and
# GITHUB_PATH files, and sets status, out (stdout and stderr) and the persisted contents.
run() {
	printf '%s' "$1" >"$work/annotation"
	rm -rf "$work/install"
	: >"$work/github_env"
	: >"$work/github_path"
	: >"$STUB_LOG"
	status=0
	out=$(GITHUB_ENV="$work/github_env" GITHUB_PATH="$work/github_path" \
		"$script" "$work/annotation" "$work/install" 2>&1) || status=$?
	persisted_env=$(cat "$work/github_env")
	persisted_path=$(cat "$work/github_path")
}

# expect_nothing_persisted <name> checks that neither file was written.
expect_nothing_persisted() {
	if [ -n "$persisted_env" ] || [ -n "$persisted_path" ]; then
		fail_case "$1" "persisted GITHUB_ENV [$persisted_env] GITHUB_PATH [$persisted_path]"
		return
	fi
	pass "$1"
}

annotation() {
	printf 'bitgauge v1.2.3\n\nGo: %s\nNode: %s\n' "$1" "$2"
}

# A fresh release: no annotation, nothing fetched, nothing persisted.
run ""
if [ "$status" -eq 0 ] && [ ! -s "$STUB_LOG" ]; then
	pass "no annotation is a no-op"
else
	fail_case "no annotation is a no-op" "exit $status, curl calls [$(cat "$STUB_LOG")], output [$out]"
fi
expect_nothing_persisted "no annotation persists nothing"

# A tag this workflow did not create: a warning, no switch.
run "bitgauge v1.2.3"
if [ "$status" -eq 0 ] && grep -qF '::warning::' <<<"$out" && [ ! -s "$STUB_LOG" ]; then
	pass "an annotation without versions warns and switches nothing"
else
	fail_case "an annotation without versions warns and switches nothing" "exit $status, output [$out]"
fi
expect_nothing_persisted "an annotation without versions persists nothing"

# The recorded versions are already the current ones: nothing to switch.
STUB_GO_DEFAULT=$recorded_go STUB_NODE_DEFAULT=$recorded_node run "$(annotation "$recorded_go" "$recorded_node")"
if [ "$status" -eq 0 ] && [ ! -s "$STUB_LOG" ]; then
	pass "recorded versions already current is a no-op"
else
	fail_case "recorded versions already current is a no-op" "exit $status, output [$out]"
fi
expect_nothing_persisted "recorded versions already current persist nothing"

# The newer patch is the default; the recorded versions are selected, checked and persisted.
run "$(annotation "$recorded_go" "$recorded_node")"
if [ "$status" -eq 0 ]; then
	pass "a newer default patch is switched to the recorded versions"
else
	fail_case "a newer default patch is switched to the recorded versions" "exit $status, output [$out]"
fi
if grep -qF "Recorded: $recorded_go and Node $recorded_node." <<<"$out"; then
	pass "the annotation is parsed"
else
	fail_case "the annotation is parsed" "output [$out]"
fi
if [ "$persisted_env" = "GOTOOLCHAIN=$recorded_go" ]; then
	pass "GITHUB_ENV holds exactly GOTOOLCHAIN=$recorded_go"
else
	fail_case "GITHUB_ENV holds exactly GOTOOLCHAIN=$recorded_go" "got [$persisted_env]"
fi
want_path="$work/install/node-$recorded_node-linux-x64/bin"
if [ "$persisted_path" = "$want_path" ] && [ "$("$persisted_path/node")" = "$recorded_node" ]; then
	pass "GITHUB_PATH holds exactly the unpacked Node bin directory"
else
	fail_case "GITHUB_PATH holds exactly the unpacked Node bin directory" "got [$persisted_path], want [$want_path]"
fi
want_urls="https://nodejs.org/dist/$recorded_node/SHASUMS256.txt
https://nodejs.org/dist/$recorded_node/node-$recorded_node-linux-x64.tar.xz"
if [ "$(cat "$STUB_LOG")" = "$want_urls" ]; then
	pass "Node and its checksums come from the recorded release on nodejs.org"
else
	fail_case "Node and its checksums come from the recorded release on nodejs.org" "calls [$(cat "$STUB_LOG")]"
fi

# The stubs prove what the script relies on: neither answers the recorded version by itself.
if [ "$(go version | awk '{print $3}')" = "$default_go" ] && [ "$(node --version)" = "$default_node" ]; then
	pass "without the switch, go and node answer the newer default"
else
	fail_case "without the switch, go and node answer the newer default" "the stubs answer the recorded version unasked"
fi

# The annotation records more than one version of a tool, or one tool only: malformed.
run "$(annotation "$recorded_go" "$recorded_node")
Go: go1.26.4"
if [ "$status" -ne 0 ] && grep -qF "more than one version for Go" <<<"$out"; then
	pass "two Go versions fail"
else
	fail_case "two Go versions fail" "exit $status, output [$out]"
fi
expect_nothing_persisted "two Go versions persist nothing"

run "$(printf 'bitgauge v1.2.3\n\nGo: %s\n' "$recorded_go")"
if [ "$status" -ne 0 ] && grep -qF "only one of the Go and Node versions" <<<"$out"; then
	pass "a Go version without a Node version fails"
else
	fail_case "a Go version without a Node version fails" "exit $status, output [$out]"
fi
expect_nothing_persisted "a Go version without a Node version persists nothing"

# The tarball does not match SHASUMS256.txt.
run "$(annotation "$recorded_go" v24.3.0)"
if [ "$status" -ne 0 ] && grep -qF "but SHASUMS256.txt of Node v24.3.0 lists" <<<"$out"; then
	pass "a checksum mismatch fails"
else
	fail_case "a checksum mismatch fails" "exit $status, output [$out]"
fi
expect_nothing_persisted "a checksum mismatch persists nothing"

# A release that cannot be downloaded.
run "$(annotation "$recorded_go" v24.4.0)"
if [ "$status" -ne 0 ]; then
	pass "a failed download fails"
else
	fail_case "a failed download fails" "exit $status, output [$out]"
fi
expect_nothing_persisted "a failed download persists nothing"

# Installed, but node prints another version than the recorded one.
run "$(annotation "$recorded_go" v24.2.0)"
if [ "$status" -ne 0 ] && grep -qF "node --version prints v24.0.0, not the recorded v24.2.0" <<<"$out"; then
	pass "a Node version mismatch after installation fails"
else
	fail_case "a Node version mismatch after installation fails" "exit $status, output [$out]"
fi
expect_nothing_persisted "a Node version mismatch after installation persists nothing"

# The Go toolchain switch does not take.
STUB_GO_IGNORES_TOOLCHAIN=1 run "$(annotation "$recorded_go" "$recorded_node")"
if [ "$status" -ne 0 ] && grep -qF "go version prints $default_go, not the recorded $recorded_go" <<<"$out"; then
	pass "a Go version mismatch after the switch fails"
else
	fail_case "a Go version mismatch after the switch fails" "exit $status, output [$out]"
fi
expect_nothing_persisted "a Go version mismatch after the switch persists nothing"

# Usage errors.
status=0
"$script" "$work/annotation" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 2 ]; then
	pass "a missing argument is a usage error"
else
	fail_case "a missing argument is a usage error" "exit $status"
fi

status=0
"$script" "$work/no-such-file" "$work/install" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 1 ]; then
	pass "a missing annotation file fails"
else
	fail_case "a missing annotation file fails" "exit $status"
fi

if [ "$failures" -ne 0 ]; then
	echo "$failures case(s) failed" >&2
	exit 1
fi

echo "all cases passed"
