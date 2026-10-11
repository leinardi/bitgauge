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

# Usage: rebuild-bases.sh <version> <tag-dockerfile> <main-dockerfile>
#
# The weekly rebuild's base-image step (docs/release.md, "Weekly Rebuild"): it rebuilds the latest
# release, <version>, from its own source with the stage images main currently pins. This script
# checks that main's stage images are only a refresh of the release's, and prints the release's
# Dockerfile with each stage's image replaced by main's, matched by stage name.
#
# Per stage, main's FROM must keep:
#   web      the image repository, the Node major, and the tag shape apart from a patch version;
#   build    the image repository, the Go major.minor, and the tag shape apart from a patch version;
#   runtime  the image repository and the tag's variant; its date tag may move.
# The tag shape is the tag with its leading version taken out: 1.26.8-alpine3.23-dev and
# 1.26.9-alpine3.23-dev share it, 1.26-alpine3.24-dev does not, nor does 1.26.9 against 1.26.
# main's images must be pinned by digest. A digest or patch refresh passes; anything else fails
# with a notice naming the change and the two ways out: cut a release to ship it, or pin the old
# line on main.
#
# Only the image reference of each FROM line changes; the release's flags (--platform) and stage
# names stay as the release has them. Exits 0 with the rewritten Dockerfile on stdout, 1 with the
# notices on stderr, 2 on a usage error.

set -euo pipefail

usage() {
	echo "usage: $0 <version> <tag-dockerfile> <main-dockerfile>" >&2
	exit 2
}

if [ "$#" -ne 3 ]; then
	usage
fi

version=$1
tag_dockerfile=$2
main_dockerfile=$3

for file in "$tag_dockerfile" "$main_dockerfile"; do
	if [ ! -f "$file" ]; then
		echo "rebuild-bases: $file: not a file" >&2
		exit 2
	fi
done

stages=(web build runtime)

# from_image <dockerfile> <stage> prints the image reference of the stage's FROM line, and fails
# unless exactly one FROM line names the stage.
from_image() {
	local dockerfile=$1 stage=$2 matches
	matches=$(awk -v stage="$stage" '
		toupper($1) == "FROM" && NF >= 4 && toupper($(NF - 1)) == "AS" && tolower($NF) == stage {
			for (i = 2; i < NF - 1; i++) {
				if ($i !~ /^--/) {
					print $i
					break
				}
			}
		}
	' "$dockerfile")

	if [ -z "$matches" ]; then
		echo "rebuild-bases: $dockerfile has no FROM line for the $stage stage" >&2
		return 1
	fi

	if [ "$(printf '%s\n' "$matches" | wc -l)" -ne 1 ]; then
		echo "rebuild-bases: $dockerfile has more than one FROM line for the $stage stage" >&2
		return 1
	fi

	printf '%s\n' "$matches"
}

# Splitting an image reference repo:tag@sha256:digest. The repository is everything before the
# tag's colon; dhi.io and ghcr.io references carry no registry port.
repository_of() {
	local ref=${1%%@*}
	printf '%s\n' "${ref%:*}"
}

tag_of() {
	local ref=${1%%@*}
	case "$ref" in
	*:*) printf '%s\n' "${ref##*:}" ;;
	*) printf '\n' ;;
	esac
}

digest_of() {
	case "$1" in
	*@sha256:*) printf '%s\n' "${1##*@}" ;;
	*) printf '\n' ;;
	esac
}

# leading_version prints the version a tag starts with (24, 1.26, 1.26.9), shape_of the tag with
# that version replaced by one N per component (N-alpine3.23-dev, N.N-alpine3.23-dev).
leading_version() {
	[[ $1 =~ ^([0-9]+(\.[0-9]+)*) ]] && printf '%s\n' "${BASH_REMATCH[1]}"
}

shape_of() {
	local version
	version=$(leading_version "$1") || return 1
	local components=${version//[0-9]/}
	printf '%s\n' "N${components//./.N}${1#"$version"}"
}

# line_of <version> <components> prints the first <components> components of the version.
line_of() {
	printf '%s\n' "$1" | cut -d. -f"1-$2"
}

notices=()

# notice <stage> <what main moved> <what the release keeps>
notice() {
	notices+=("main moved $1 from $2 to $3; $version keeps $2, so cut a release to ship the new $4, or pin the old one on main")
}

check_stage() {
	local stage=$1 tag_ref=$2 main_ref=$3

	if [ -z "$(digest_of "$main_ref")" ]; then
		notices+=("main's $stage image $main_ref is not pinned by digest; pin it before a rebuild")
		return
	fi

	local tag_repo main_repo tag_tag main_tag
	tag_repo=$(repository_of "$tag_ref")
	main_repo=$(repository_of "$main_ref")
	tag_tag=$(tag_of "$tag_ref")
	main_tag=$(tag_of "$main_ref")

	if [ "$tag_repo" != "$main_repo" ]; then
		notice "$stage" "$tag_repo" "$main_repo" "image"
		return
	fi

	case "$stage" in
	web | build)
		local tool components tag_version main_version
		if [ "$stage" = web ]; then
			tool=Node components=1
		else
			tool=Go components=2
		fi

		if ! tag_version=$(leading_version "$tag_tag") || ! main_version=$(leading_version "$main_tag"); then
			notices+=("cannot read the $tool line of the $stage stage from $tag_tag and $main_tag")
			return
		fi

		local tag_line main_line
		tag_line=$(line_of "$tag_version" "$components")
		main_line=$(line_of "$main_version" "$components")
		if [ "$tag_line" != "$main_line" ]; then
			notice "$stage" "$tool $tag_line" "$tool $main_line" "line"
			return
		fi

		if [ "$(shape_of "$tag_tag")" != "$(shape_of "$main_tag")" ]; then
			notice "$stage" "the tag $tag_tag" "$main_tag" "tag"
		fi
		;;
	runtime)
		# A date tag (20250419), optionally with a variant after it; the date may move.
		if [[ ! $tag_tag =~ ^[0-9]{8}(.*)$ ]]; then
			notices+=("cannot read the date of the runtime tag $tag_tag")
			return
		fi
		local tag_variant=${BASH_REMATCH[1]}

		if [[ ! $main_tag =~ ^[0-9]{8}(.*)$ ]]; then
			notice "$stage" "the dated tag $tag_tag" "$main_tag" "tag"
			return
		fi
		local main_variant=${BASH_REMATCH[1]}

		if [ "$tag_variant" != "$main_variant" ]; then
			notice "$stage" "the variant '${tag_variant}'" "'${main_variant}'" "variant"
		fi
		;;
	esac
}

declare -A main_refs=()

for stage in "${stages[@]}"; do
	tag_ref=$(from_image "$tag_dockerfile" "$stage")
	main_ref=$(from_image "$main_dockerfile" "$stage")
	main_refs[$stage]=$main_ref
	check_stage "$stage" "$tag_ref" "$main_ref"
done

if [ "${#notices[@]}" -ne 0 ]; then
	for message in "${notices[@]}"; do
		echo "::notice::$message" >&2
		echo "rebuild-bases: $message" >&2
	done
	exit 1
fi

# Replace the image reference, the first argument that is not a flag, of each stage's FROM line.
awk -v web="${main_refs[web]}" -v build="${main_refs[build]}" -v runtime="${main_refs[runtime]}" '
	toupper($1) == "FROM" && NF >= 4 && toupper($(NF - 1)) == "AS" {
		stage = tolower($NF)
		image = ""
		if (stage == "web") image = web
		if (stage == "build") image = build
		if (stage == "runtime") image = runtime
		if (image != "") {
			for (i = 2; i < NF - 1; i++) {
				if ($i !~ /^--/) {
					$i = image
					break
				}
			}
		}
	}
	{ print }
' "$tag_dockerfile"
