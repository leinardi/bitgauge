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
# Adapted from swarm-scheduler-exporter/scripts/image-test.sh at 88394aa, MIT, Copyright (c) 2026 Roberto Leinardi
#
# image-test.sh: tests a built BitGauge image of one platform, in three tiers, each including the
# one before it:
#
#   smoke    the release's short test: the image is the platform's, its binary is byte for byte
#            the given release binary (sha256), and the container, started with the default
#            configuration, logs the expected version and commit in its startup line, reports
#            all three stamps on /api/v1/info, passes its own healthcheck subcommand, and serves the
#            embedded SPA: the index page and every script and stylesheet it links. The binary has
#            no --version.
#   reduced  CI's arm64 test, under QEMU: smoke, plus the binary's ELF machine is the platform's
#            and the binary is static (no interpreter, no shared library), its mode and owner in
#            the image are 0755 root:root, and the image config (the fixed non-root user,
#            entrypoint, exposed port, health check, labels) is what the Dockerfile writes.
#   full     CI's amd64 test: reduced, plus the container hardened (read-only root,
#            no-new-privileges, every capability dropped) serves the API and the SPA and becomes
#            healthy by the image's HEALTHCHECK, stops cleanly on SIGTERM (exit code 0), and an
#            invalid configuration fails the start with exit code 2. make image-test then runs the
#            image and netguard suites (testenv, feature image) on the same image.
#
# Usage:
#   scripts/image-test.sh --tier smoke|reduced|full --image IMAGE --platform os/arch \
#     --binary FILE [--expect-version "VERSION COMMIT DATE"]
#
# IMAGE must already be in the local Docker image store, for PLATFORM. Every container it starts
# is removed on exit. Needs docker, curl, jq, sha256sum, tar and (reduced, full) readelf.

set -euo pipefail
# readelf and tar print in the C locale, the one the checks below read.
export LC_ALL=C

BINARY_PATH="bitgauge"
PORT=8080

usage() {
	sed -n '/^# Usage:/,/^# IMAGE/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
	exit 2
}

die() {
	echo "image-test: FAIL: $*" >&2
	exit 1
}

pass() {
	echo "image-test: ok: $*"
}

tier="" image="" platform="" binary="" expect_version=""
while [[ $# -gt 0 ]]; do
	case "$1" in
	--tier) tier="${2:-}" ;;
	--image) image="${2:-}" ;;
	--platform) platform="${2:-}" ;;
	--binary) binary="${2:-}" ;;
	--expect-version) expect_version="${2:-}" ;;
	*) usage ;;
	esac
	shift 2 || usage
done
case "${tier}" in
smoke) level=1 ;;
reduced) level=2 ;;
full) level=3 ;;
*) usage ;;
esac
[[ -n ${image} && -n ${platform} && -n ${binary} ]] || usage
[[ -f ${binary} ]] || die "the release binary ${binary} does not exist"
want_version="" want_commit="" want_date=""
if [[ -n ${expect_version} ]]; then
	read -r want_version want_commit want_date <<<"${expect_version}"
	[[ -n ${want_date} ]] || die "--expect-version takes \"VERSION COMMIT DATE\", got '${expect_version}'"
fi

work="$(mktemp -d)"
containers=()
cleanup() {
	if [[ ${#containers[@]} -gt 0 ]]; then
		docker rm -f "${containers[@]}" >/dev/null 2>&1 || true
	fi
	rm -rf "${work}"
}
trap cleanup EXIT

# Sets NAME to a unique container name, which the exit trap removes. Not called through $( ): a
# subshell would add the name to its own copy of the list.
new_container() {
	NAME="bitgauge-image-test-$1-$$-${RANDOM}"
	containers+=("${NAME}")
}

# --- The image is the platform's -------------------------------------------------------------

got_platform="$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "${image}")"
[[ ${got_platform} == "${platform}" ]] || die "${image} is ${got_platform}, want ${platform}"
pass "image platform ${got_platform}"

# --- The binary in the image is the release binary --------------------------------------------

# The image's filesystem, exported from a container that never starts, so the binary's bytes,
# mode and owner are read without running anything.
new_container export
export_name="${NAME}"
docker create --platform "${platform}" --name "${export_name}" "${image}" >/dev/null
docker export -o "${work}/rootfs.tar" "${export_name}"
mkdir "${work}/rootfs"
tar -xf "${work}/rootfs.tar" -C "${work}/rootfs" "${BINARY_PATH}"
extracted="${work}/rootfs/${BINARY_PATH}"

want_sum="$(sha256sum "${binary}")"
want_sum="${want_sum%% *}"
got_sum="$(sha256sum "${extracted}")"
got_sum="${got_sum%% *}"
[[ ${got_sum} == "${want_sum}" ]] ||
	die "/${BINARY_PATH} in the image is sha256 ${got_sum}, the release binary ${binary} is ${want_sum}"
pass "/${BINARY_PATH} is the release binary (sha256 ${got_sum})"

# --- The server starts and reports its stamps -------------------------------------------------

# Starts the image as $1 with the listen port published on a free loopback port, and any further
# docker run options; prints the host port.
start_server() {
	local name="$1"
	shift
	docker run -d --platform "${platform}" --name "${name}" -p "127.0.0.1::${PORT}" "$@" \
		"${image}" >/dev/null
	local mapping
	mapping="$(docker port "${name}" "${PORT}/tcp")"
	mapping="${mapping%%$'\n'*}"
	printf '%s' "${mapping##*:}"
}

# Waits up to 60 s (QEMU is slow) for the startup line of container $1 and prints it; dies when the
# container exits or never logs it.
await_startup_line() {
	local name="$1" logs line running
	for _ in $(seq 1 60); do
		logs="$(docker logs "${name}" 2>&1)"
		if line="$(grep -m1 -E ' INFO starting ' <<<"${logs}")"; then
			printf '%s' "${line}"
			return 0
		fi
		running="$(docker inspect -f '{{.State.Running}}' "${name}")"
		if [[ ${running} != true ]]; then
			printf '%s\n' "${logs}" >&2
			die "the container ${name} exited before it logged its startup line"
		fi
		sleep 1
	done
	docker logs "${name}" >&2 || true
	die "the container ${name} logged no startup line within 60 s"
}

# Waits up to 60 s for path $3 of container $1 on host port $2 to answer with a success status, and
# writes the body to $4; dies when the container exits or never answers.
await_get() {
	local name="$1" port="$2" path="$3" out="$4" running
	for _ in $(seq 1 60); do
		if curl -fsS --max-time 5 -o "${out}" "http://127.0.0.1:${port}${path}" 2>/dev/null; then
			return 0
		fi
		running="$(docker inspect -f '{{.State.Running}}' "${name}")"
		if [[ ${running} != true ]]; then
			docker logs "${name}" >&2 || true
			die "the container ${name} exited before ${path} answered"
		fi
		sleep 1
	done
	docker logs "${name}" >&2 || true
	die "${path} of ${name} did not answer within 60 s"
}

# The SPA the binary embeds: the index page, and every script and stylesheet it links, each served
# with a success status and a body. A binary built over an empty web/dist serves no index page.
check_spa() {
	local name="$1" port="$2" assets asset count=0
	await_get "${name}" "${port}" / "${work}/index.html"
	grep -qi '<html' "${work}/index.html" || die "GET / did not serve the SPA: $(head -c 300 "${work}/index.html")"
	assets="$(grep -oE '(src|href)="[^"]*\.(js|css)"' "${work}/index.html" | sed -E 's/^[a-z]+="(.*)"$/\1/' | sort -u)"
	[[ -n ${assets} ]] || die "the index page links no script or stylesheet"
	while read -r asset; do
		[[ ${asset} == /* ]] || asset="/${asset#./}"
		curl -fsS --max-time 10 -o "${work}/asset" "http://127.0.0.1:${port}${asset}" ||
			die "GET ${asset}, which the index page links, failed"
		[[ -s ${work}/asset ]] || die "GET ${asset} served an empty body"
		count=$((count + 1))
	done <<<"${assets}"
	pass "the SPA: the index page and the ${count} scripts and stylesheets it links"
}

hardening=()
if ((level >= 3)); then
	# The posture the image is built for (build-packaging.md section 1): it needs no capability
	# and writes nothing.
	hardening=(--read-only --security-opt no-new-privileges:true --cap-drop ALL)
fi
new_container server
server="${NAME}"
port="$(start_server "${server}" "${hardening[@]}")"

line="$(await_startup_line "${server}")"
if [[ -n ${expect_version} ]]; then
	for pair in "version=${want_version}" "commit=${want_commit}"; do
		key="${pair%%=*}" want="${pair#*=}"
		[[ ${line} == *" ${key}=\"${want}\""* ]] ||
			die "the startup line does not report ${key} ${want}: ${line}"
	done
fi
pass "startup line: ${line}"

await_get "${server}" "${port}" /api/v1/info "${work}/info.json"
stamps="$(jq -r '[.server.version, .server.commit, .server.buildDate] | join(" ")' "${work}/info.json")" ||
	die "/api/v1/info is not the info document: $(head -c 300 "${work}/info.json")"
if [[ -n ${expect_version} ]]; then
	[[ ${stamps} == "${want_version} ${want_commit} ${want_date}" ]] ||
		die "/api/v1/info reports '${stamps}', want '${expect_version}'"
fi
pass "/api/v1/info: ${stamps}"

# The image has no shell: the probe is the binary itself, exec'd in the running container.
docker exec "${server}" /bitgauge healthcheck >/dev/null 2>&1 ||
	die "the healthcheck subcommand of a serving container failed"
pass "the healthcheck subcommand: exit code 0"

check_spa "${server}" "${port}"

if ((level >= 2)); then
	# --- The binary is the platform's, and static ------------------------------------------

	case "${platform}" in
	linux/amd64) want_machine="Advanced Micro Devices X86-64" ;;
	linux/arm64) want_machine="AArch64" ;;
	*) die "no ELF machine known for ${platform}" ;;
	esac
	header="$(readelf -h "${extracted}")"
	[[ ${header} == *"Machine:"*"${want_machine}"* ]] ||
		die "/${BINARY_PATH} is not a ${want_machine} binary"
	program_headers="$(readelf -lW "${extracted}")"
	[[ ${program_headers} != *INTERP* ]] || die "/${BINARY_PATH} has a program interpreter: it is not static"
	dynamic="$(readelf -dW "${extracted}")"
	[[ ${dynamic} != *"(NEEDED)"* ]] || die "/${BINARY_PATH} needs a shared library: it is not static"
	pass "/${BINARY_PATH} is a static ${want_machine} binary"

	# --- The binary's mode and owner ---------------------------------------------------------

	listing="$(tar --numeric-owner -tvf "${work}/rootfs.tar" "${BINARY_PATH}")"
	read -r mode owner _ <<<"${listing}"
	[[ ${mode} == -rwxr-xr-x && ${owner} == 0/0 ]] ||
		die "/${BINARY_PATH} is ${mode} ${owner}, want -rwxr-xr-x 0/0"
	pass "/${BINARY_PATH} is ${mode} ${owner}"

	# --- The image config ----------------------------------------------------------------------

	user="$(docker image inspect -f '{{.Config.User}}' "${image}")"
	[[ ${user} == 65532:65532 ]] || die "the image runs as '${user:-root}', want 65532:65532"
	entrypoint="$(docker image inspect -f '{{json .Config.Entrypoint}}' "${image}")"
	[[ ${entrypoint} == '["/bitgauge"]' ]] || die "the entrypoint is ${entrypoint}, want [\"/bitgauge\"]"
	ports="$(docker image inspect -f '{{json .Config.ExposedPorts}}' "${image}")"
	[[ ${ports} == "{\"${PORT}/tcp\":{}}" ]] || die "the exposed ports are ${ports}, want ${PORT}/tcp only"
	healthcheck="$(docker image inspect -f '{{json .Config.Healthcheck.Test}}' "${image}")"
	[[ ${healthcheck} == '["CMD","/bitgauge","healthcheck"]' ]] ||
		die "the health check is ${healthcheck}, want the binary's own healthcheck subcommand"
	volumes="$(docker image inspect -f '{{json .Config.Volumes}}' "${image}")"
	[[ ${volumes} == null || ${volumes} == '{}' ]] || die "the image declares the volumes ${volumes}, want none"
	if [[ -n ${expect_version} ]]; then
		for pair in "version=${want_version}" "revision=${want_commit}" "created=${want_date}"; do
			key="${pair%%=*}" want="${pair#*=}"
			got="$(docker image inspect -f "{{ index .Config.Labels \"org.opencontainers.image.${key}\" }}" "${image}")"
			[[ ${got} == "${want}" ]] || die "the label org.opencontainers.image.${key} is '${got}', want '${want}'"
		done
	fi
	pass "image config: user ${user}, entrypoint ${entrypoint}, ports ${ports}, health check, no volume, labels"
fi

if ((level >= 3)); then
	# --- Healthy by the image's own HEALTHCHECK ----------------------------------------------

	status=""
	for _ in $(seq 1 60); do
		status="$(docker inspect -f '{{.State.Health.Status}}' "${server}")"
		[[ ${status} != healthy ]] || break
		sleep 1
	done
	[[ ${status} == healthy ]] || die "the hardened container is '${status}', not healthy, after 60 s"
	pass "the hardened container is healthy by the image's HEALTHCHECK"

	# --- A stop is clean -------------------------------------------------------------------------

	docker stop -t 10 "${server}" >/dev/null
	exit_code="$(docker inspect -f '{{.State.ExitCode}}' "${server}")"
	[[ ${exit_code} == 0 ]] || die "docker stop: exit code ${exit_code}, want 0"
	pass "docker stop: exit code 0"

	# --- An invalid configuration fails the start ----------------------------------------------

	new_container invalid
	invalid="${NAME}"
	docker run --platform "${platform}" --name "${invalid}" -e BITGAUGE_SERVER__LISTEN=not-an-address \
		"${image}" >/dev/null 2>&1 || true
	exit_code="$(docker inspect -f '{{.State.ExitCode}}' "${invalid}")"
	[[ ${exit_code} == 2 ]] || die "an invalid server.listen exited ${exit_code}, want 2"
	pass "an invalid server.listen fails the start (exit code 2)"
fi

echo "image-test: ${tier}: every check passed for ${image} (${platform})"
