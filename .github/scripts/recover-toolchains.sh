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

# Usage: recover-toolchains.sh <annotation-file> <install-dir>
#
# The recovery's switch to the tag's toolchains in release.yaml (docs/release.md, "Check the tag"):
# a release tag's annotation records the exact Go and Node versions its binaries were built with,
#
#   Go: go1.26.N
#   Node: v24.N.N
#
# while .go-version and the Node major resolve to the newest patch on the day of the run. A
# recovery rebuilds with exactly the recorded versions, so its binaries are byte-identical to the
# first attempt's and the published assets can be checked by SHA-256.
#
# <annotation-file> holds the annotation of the existing release tag, as
# `git tag -l --format='%(contents)' vX.Y.Z` prints it. A fresh release has nothing to recover, and
# the workflow passes an empty file: the script is then a no-op. <install-dir> is where a Node
# release is unpacked (release.yaml passes $RUNNER_TEMP).
#
# For each tool whose current version differs from the recorded one, the script first selects the
# recorded version in its own process:
#   - Go: GOTOOLCHAIN=go1.26.N is exported, so the go command fetches exactly that toolchain from
#     the module proxy and checks it against the checksum database;
#   - Node: node-v24.N.N-linux-x64.tar.xz is downloaded from https://nodejs.org/dist/v24.N.N/,
#     checked against that release's SHASUMS256.txt, unpacked under <install-dir>, and its bin
#     directory is put at the front of PATH. The release job runs on an x64 runner.
# It then checks, in that same process, that `go version` and `node --version` print the recorded
# versions, and only then persists the switch for the later steps of the job: GOTOOLCHAIN=go1.26.N
# is appended to the file named by GITHUB_ENV, the Node bin directory to the file named by
# GITHUB_PATH. Any failure (a malformed annotation, a download or checksum failure, a version that
# does not match after the switch) exits non-zero and persists nothing.
#
# An annotation with neither line belongs to a tag this workflow did not create: the script warns
# and switches nothing, and the release's asset check then stops the run if the rebuilt binaries
# differ from the published ones. An annotation with one line and not the other is malformed and
# fails.

set -euo pipefail

usage() {
	echo "usage: $0 <annotation-file> <install-dir>" >&2
	exit 2
}

if [ "$#" -ne 2 ]; then
	usage
fi

annotation_file=$1
install_dir=$2

fail() {
	echo "recover-toolchains: $*" >&2
	exit 1
}

if [ ! -f "$annotation_file" ]; then
	fail "$annotation_file is not a file"
fi

# recorded <pattern> prints the one version the annotation records for a tool, nothing when it
# records none, and fails when it records more than one.
recorded() {
	local pattern=$1 matches
	matches=$(sed -n -E "s/^${pattern}\$/\\1/p" "$annotation_file")
	if [ "$(grep -c . <<<"$matches")" -gt 1 ]; then
		fail "the annotation records more than one version for ${pattern%%:*}: $(tr '\n' ' ' <<<"$matches")"
	fi
	echo "$matches"
}

want_go=$(recorded 'Go: (go[0-9]+\.[0-9]+(\.[0-9]+)?)')
want_node=$(recorded 'Node: (v[0-9]+\.[0-9]+\.[0-9]+)')

if [ -z "$want_go" ] && [ -z "$want_node" ]; then
	if [ -s "$annotation_file" ]; then
		echo "::warning::The tag annotation records no Go and no Node version, so the binaries are rebuilt with the current toolchains. If they differ from the published assets, the asset check stops the run for a human - docs/release.md."
	else
		echo "No tag annotation: a fresh release, nothing to recover."
	fi
	exit 0
fi

if [ -z "$want_go" ] || [ -z "$want_node" ]; then
	fail "the annotation records only one of the Go and Node versions (Go: '${want_go}', Node: '${want_node}')"
fi

go_version() {
	go version | awk '{print $3}'
}

current_go=$(go_version)
current_node=$(node --version)
echo "Recorded: $want_go and Node $want_node. Current: $current_go and Node $current_node."

switch_go=false
if [ "$current_go" != "$want_go" ]; then
	switch_go=true
fi

switch_node=false
if [ "$current_node" != "$want_node" ]; then
	switch_node=true
fi

if [ "$switch_go" = false ] && [ "$switch_node" = false ]; then
	echo "Both toolchains are already the recorded ones: nothing to switch."
	exit 0
fi

# Checked before anything is fetched, so a run that could not persist the switch fails up front.
if [ -z "${GITHUB_ENV:-}" ] || [ -z "${GITHUB_PATH:-}" ]; then
	fail "GITHUB_ENV and GITHUB_PATH must name the files the switch is persisted to"
fi

if [ "$switch_go" = true ]; then
	export GOTOOLCHAIN="$want_go"
fi

node_bin=""
if [ "$switch_node" = true ]; then
	release="node-${want_node}-linux-x64"
	tarball="${release}.tar.xz"
	base_url="https://nodejs.org/dist/${want_node}"
	downloads=$(mktemp -d)
	trap 'rm -rf "$downloads"' EXIT

	curl -fsSL --proto '=https' --tlsv1.2 -o "$downloads/SHASUMS256.txt" "$base_url/SHASUMS256.txt"
	curl -fsSL --proto '=https' --tlsv1.2 -o "$downloads/$tarball" "$base_url/$tarball"

	expected=$(awk -v name="$tarball" '$2 == name {print $1}' "$downloads/SHASUMS256.txt")
	if [ -z "$expected" ] || [ "$(grep -c . <<<"$expected")" -ne 1 ]; then
		fail "SHASUMS256.txt of Node $want_node does not list $tarball exactly once"
	fi
	actual=$(sha256sum "$downloads/$tarball" | cut -d' ' -f1)
	if [ "$actual" != "$expected" ]; then
		fail "$tarball has sha256 $actual, but SHASUMS256.txt of Node $want_node lists $expected"
	fi

	mkdir -p "$install_dir"
	tar -xJf "$downloads/$tarball" -C "$install_dir"
	node_bin="$install_dir/$release/bin"
	if [ ! -x "$node_bin/node" ]; then
		fail "$tarball has no executable bin/node"
	fi
	export PATH="$node_bin:$PATH"
	hash -r
fi

# The same process that selected them must see exactly the recorded versions before anything is
# persisted: a switch that did not take would otherwise reach the build.
got_go=$(go_version)
if [ "$got_go" != "$want_go" ]; then
	fail "after the switch, go version prints $got_go, not the recorded $want_go"
fi
got_node=$(node --version)
if [ "$got_node" != "$want_node" ]; then
	fail "after the switch, node --version prints $got_node, not the recorded $want_node"
fi

if [ "$switch_go" = true ]; then
	echo "GOTOOLCHAIN=$want_go" >>"$GITHUB_ENV"
fi
if [ "$switch_node" = true ]; then
	echo "$node_bin" >>"$GITHUB_PATH"
fi

echo "Switched to $want_go and Node $want_node for the rest of the job."
