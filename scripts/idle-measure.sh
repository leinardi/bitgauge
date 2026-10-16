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
# Idle-footprint measurement of a running binary, made repeatable. Read-only: it reads /proc,
# listens to the Docker event stream when an engine is reachable, sends the bench's requests, and
# writes nothing but its own temporary directory.
#
#   idle-measure.sh windows   CPU and resident memory of the named processes over idle windows,
#                             each window with its own Docker event census
#   idle-measure.sh bench     what one request to each lightweight endpoint costs the server
#
# Dormant until a running binary exists: with nothing to name in IDLE_PIDS it fails before
# measuring anything.
#
# Inputs, all from the environment (make idle-measure and make idle-bench export them):
#
#   IDLE_PIDS      space-separated name=PID pairs, e.g. "bitgauge=123 dockerd=456". windows takes
#                  any number; bench takes exactly one, named bitgauge. The caller resolves the PIDs
#                  (ps -eo pid,comm,args): this script never guesses which process is which.
#   WINDOWS        windows mode: number of windows (default and minimum 5 -- median and range, or
#                  nothing)
#   WINDOW_S       windows mode: seconds per window (default 300)
#   WARMUP_S       windows mode: seconds to wait before the first window (default 30)
#   IDLE_EVENTS    windows mode: the Docker event census -- auto (default: when an engine answers),
#                  1 (required: fail without one) or 0 (off)
#   BATCHES        bench mode: batches per endpoint (default and minimum 5)
#   BENCH_URL      bench mode: the server's base URL, base path included (default
#                  http://127.0.0.1:8080)
#   BENCH_*_CALLS  bench mode: requests per batch for one endpoint (defaults below)
#
# CPU comes from utime+stime ("own") and cutime+cstime ("children": reaped forks, which the own
# fields never show) in /proc/<pid>/stat, reported as percent of one core. BitGauge forks nothing,
# but a container engine named next to it does: the image's HEALTHCHECK is an exec into the
# container every interval, paid for outside the server process, and the event census is what
# counts those execs. Memory comes from /proc/<pid>/status: VmRSS at the end of each window, and
# VmHWM (the peak resident set since the process started) once at the end.

set -euo pipefail

# EPOCHREALTIME, printf, awk and sort -g all follow the locale's decimal separator; a comma would
# turn every elapsed time into a whole number of seconds.
export LC_ALL=C

readonly MIN_WINDOWS=5
readonly MIN_BATCHES=5
# /proc/<pid>/stat counts in clock ticks, 10 ms on every Linux this runs on. A batch that cost the
# server fewer ticks than this is mostly rounding, so it is flagged rather than turned into a number.
readonly MIN_BATCH_TICKS=20

# Requests per bench batch. A host fast enough to push an endpoint under MIN_BATCH_TICKS gets told
# so in the output, and the matching variable raises that batch.
readonly BENCH_PING_CALLS=${BENCH_PING_CALLS:-2000}
readonly BENCH_SMALL_CALLS=${BENCH_SMALL_CALLS:-2000}
readonly BENCH_INFO_CALLS=${BENCH_INFO_CALLS:-1000}
readonly BENCH_INDEX_CALLS=${BENCH_INDEX_CALLS:-1000}

die() {
  echo "idle-measure: $*" >&2
  exit 1
}

usage() {
  echo "usage: IDLE_PIDS='name=PID ...' $0 windows|bench" >&2
  exit 2
}

workdir=$(mktemp -d)

cleanup() {
  local -a jobs_left
  mapfile -t jobs_left < <(jobs -p)
  if ((${#jobs_left[@]} > 0)); then
    kill "${jobs_left[@]}" 2>/dev/null || true
  fi

  rm -rf "${workdir}"
}

trap 'cleanup' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

hz=$(getconf CLK_TCK)

# require_count refuses a leading zero rather than normalizing it: every count is used as given
# afterwards, and bash arithmetic would read 010 as octal 8 and reject 08 outright.
require_count() {
  local name=$1 value=$2 minimum=$3
  [[ ${value} =~ ^(0|[1-9][0-9]*)$ ]] || die "${name} must be a whole number without leading zeros, got '${value}'"
  ((value >= minimum)) || die "${name} must be at least ${minimum}, got ${value}"
}

# names[i], pids[i] and starts[i] are the processes to read, parsed from IDLE_PIDS; starts[i] is
# the process start time, so a PID recycled during a run is not read in place of the original.
names=()
pids=()
starts=()

parse_pids() {
  local pair
  local -a pairs
  read -r -a pairs <<<"${IDLE_PIDS:-}"
  ((${#pairs[@]} > 0)) || die "IDLE_PIDS is empty; start the binary and name it as bitgauge=PID"

  local name pid seen rest
  local -a fields
  for pair in "${pairs[@]}"; do
    [[ ${pair} =~ ^([A-Za-z][A-Za-z0-9_-]*)=([0-9]+)$ ]] || die "IDLE_PIDS entry '${pair}' is not name=PID"
    name=${BASH_REMATCH[1]}
    pid=${BASH_REMATCH[2]}
    for seen in "${names[@]}"; do
      [[ ${seen} != "${name}" ]] || die "IDLE_PIDS names ${name} twice"
    done
    [[ -r /proc/${pid}/stat ]] || die "no process ${pid} (${name})"
    rest=$(stat_fields "${pid}")
    read -r -a fields <<<"${rest}"
    [[ ${fields[0]} != [ZX] ]] || die "process ${pid} (${name}) is gone"
    names+=("${name}")
    pids+=("${pid}")
    starts+=("${fields[19]}")
  done
}

# stat_fields PID prints /proc/PID/stat from field 3 (the state) on. The command name is field 2
# and may hold spaces and parentheses, so the fields are counted from after its closing parenthesis.
stat_fields() {
  local stat
  stat=$(<"/proc/$1/stat") || die "process $1 is gone"
  echo "${stat##*) }"
}

# ticks I prints "own children" of process I in clock ticks: utime+stime, then cutime+cstime. A
# zombie or dead process, or one whose start time no longer matches (the PID was recycled), is
# gone: its counters would read as idle.
ticks() {
  local rest
  local -a fields
  rest=$(stat_fields "${pids[$1]}")
  read -r -a fields <<<"${rest}"
  [[ ${fields[0]} != [ZX] ]] || die "process ${pids[$1]} (${names[$1]}) is gone"
  [[ ${fields[19]} == "${starts[$1]}" ]] || die "process ${pids[$1]} (${names[$1]}) was replaced"
  echo "$((fields[11] + fields[12])) $((fields[13] + fields[14]))"
}

# status_kib I FIELD prints FIELD (VmRSS, VmHWM) of process I's /proc/PID/status in KiB. Callers
# assign it on its own line, so a failure here stops the run instead of reading as 0.
status_kib() {
  local value
  value=$(awk -v f="$2:" '$1 == f { print $2; found = 1 } END { exit !found }' "/proc/${pids[$1]}/status") ||
    die "process ${pids[$1]} (${names[$1]}) is gone or has no $2"
  echo "${value}"
}

# percent TICKS SECONDS prints TICKS as percent of one core over SECONDS.
percent() {
  awk -v t="$1" -v s="$2" -v hz="${hz}" 'BEGIN { printf "%.2f", t / hz / s * 100 }'
}

# mib KIB prints KIB in MiB.
mib() {
  awk -v k="$1" 'BEGIN { printf "%.2f", k / 1024 }'
}

# median_range prints "median (min–max)" of the numbers on stdin.
median_range() {
  sort -g | awk '
    { v[NR] = $1 }
    END {
      if (NR == 0) { print "n/a"; exit }
      m = (NR % 2) ? v[(NR + 1) / 2] : (v[NR / 2] + v[NR / 2 + 1]) / 2
      printf "%.2f (%.2f–%.2f)\n", m, v[1], v[NR]
    }'
}

# --- windows ----------------------------------------------------------------------------------------

# census_enabled decides once whether the windows carry a Docker event census, and says so: a
# window without one is reported as such, never as a window that saw no events.
census_enabled() {
  local mode=${IDLE_EVENTS:-auto}
  case ${mode} in
    0)
      echo "events: census off (IDLE_EVENTS=0)" >&2
      return 1
      ;;
    1 | auto) ;;
    *) die "IDLE_EVENTS must be auto, 1 or 0, got '${mode}'" ;;
  esac

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    return 0
  fi

  [[ ${mode} == auto ]] || die "IDLE_EVENTS=1, but no Docker engine answers 'docker info'"
  echo "events: no Docker engine answers 'docker info'; the windows carry no census" >&2
  return 1
}

run_windows() {
  local windows=${WINDOWS:-${MIN_WINDOWS}} window_s=${WINDOW_S:-300} warmup_s=${WARMUP_S:-30}
  require_count WINDOWS "${windows}" "${MIN_WINDOWS}"
  require_count WINDOW_S "${window_s}" 1
  require_count WARMUP_S "${warmup_s}" 0
  parse_pids

  local census=0
  if census_enabled; then
    census=1
  fi

  echo "warm-up: ${warmup_s}s, then ${windows} windows of ${window_s}s"
  echo "each window: name, cpu own/children in percent of one core, rss at the window's end"
  sleep "${warmup_s}"

  local w i started elapsed events_pid total kib
  local -a b a before after own kids rss
  for ((w = 1; w <= windows; w++)); do
    # Started first, so the census covers the whole CPU window; the Action is cut at its first
    # colon afterwards, because an exec event's action carries the command it ran.
    if ((census)); then
      timeout -s INT "${window_s}" docker events --format '{{.Type}} {{.Action}}' >"${workdir}/events.${w}" &
      events_pid=$!
    fi

    for i in "${!pids[@]}"; do
      before[i]=$(ticks "${i}")
    done
    started=${EPOCHREALTIME}

    sleep "${window_s}"

    for i in "${!pids[@]}"; do
      after[i]=$(ticks "${i}")
    done
    elapsed=$(awk -v a="${started}" -v b="${EPOCHREALTIME}" 'BEGIN { print b - a }')
    if ((census)); then
      wait "${events_pid}" || true
    fi

    printf 'window %d/%d (%.0fs):' "${w}" "${windows}" "${elapsed}"
    for i in "${!pids[@]}"; do
      read -r -a b <<<"${before[i]}"
      read -r -a a <<<"${after[i]}"
      own[i]=$(percent $((a[0] - b[0])) "${elapsed}")
      kids[i]=$(percent $((a[1] - b[1])) "${elapsed}")
      kib=$(status_kib "${i}" VmRSS)
      rss[i]=$(mib "${kib}")
      echo "${own[i]}" >>"${workdir}/own.${names[i]}"
      echo "${kids[i]}" >>"${workdir}/kids.${names[i]}"
      echo "${rss[i]}" >>"${workdir}/rss.${names[i]}"
      printf ' %s %s/%s%% %s MiB' "${names[i]}" "${own[i]}" "${kids[i]}" "${rss[i]}"
    done

    if ((census)); then
      total=$(wc -l <"${workdir}/events.${w}")
      awk -v n="${total}" -v s="${elapsed}" 'BEGIN { printf "%.2f\n", n / s }' >>"${workdir}/rate"
      printf ' | events %d (%s/s)\n' "${total}" "$(tail -n 1 "${workdir}/rate")"
      sed 's/:.*//' "${workdir}/events.${w}" | sort | uniq -c | sort -rn | sed 's/^/    /'
    else
      printf '\n'
    fi
  done

  echo
  echo "median (range) over ${windows} windows of ${window_s}s; cpu in percent of one core:"
  local peak
  for i in "${!names[@]}"; do
    ticks "${i}" >/dev/null
    kib=$(status_kib "${i}" VmHWM)
    peak=$(mib "${kib}")
    printf '  %-12s cpu own %s  children %s  rss %s MiB  peak rss %s MiB\n' "${names[i]}" \
      "$(median_range <"${workdir}/own.${names[i]}")" "$(median_range <"${workdir}/kids.${names[i]}")" \
      "$(median_range <"${workdir}/rss.${names[i]}")" "${peak}"
  done
  if ((census)); then
    printf '  %-12s %s events/s\n' "events" "$(median_range <"${workdir}/rate")"
  fi
}

# --- bench ------------------------------------------------------------------------------------------

# write_calls FILE N URL writes a curl config that requests URL N times.
write_calls() {
  local file=$1 count=$2 url=$3 n
  : >"${file}"
  for ((n = 0; n < count; n++)); do
    printf 'url = "%s"\noutput = "/dev/null"\n' "${url}" >>"${file}"
  done
}

# run_calls FILE: one connection, the requests in FILE in sequence.
run_calls() {
  curl -sS --fail -K "$1"
}

# server_ticks prints the server's own ticks; it forks nothing, so its children are always zero.
server_ticks() {
  local -a t
  read -r -a t <<<"$(ticks 0)"
  echo "${t[0]}"
}

# preflight URL STATUS fails unless URL answers STATUS once. A wrong base URL or base path would
# otherwise bench the 404 handler, which costs the server a request like any other.
preflight() {
  local got
  got=$(curl -sS -o /dev/null -w '%{http_code}' "$1") || die "GET $1 failed"
  [[ ${got} == "$2" ]] || die "GET $1 answered ${got}, want $2; is BENCH_URL the server's base URL?"
}

# bench_endpoint LABEL CALLS URL measures BATCHES batches of CALLS requests to URL, bracketed by two
# idle controls as long as an uncounted calibration batch.
bench_endpoint() {
  local label=$1 calls=$2 url=$3 file="${workdir}/calls"
  write_calls "${file}" "${calls}" "${url}"

  local started t0 duration c0 c1 n
  local -a batch_ticks batch_secs

  started=${EPOCHREALTIME}
  run_calls "${file}"
  duration=$(awk -v a="${started}" -v b="${EPOCHREALTIME}" 'BEGIN { print b - a }')

  t0=$(server_ticks)
  sleep "${duration}"
  c0=$(($(server_ticks) - t0))

  for ((n = 0; n < batches; n++)); do
    t0=$(server_ticks)
    started=${EPOCHREALTIME}
    run_calls "${file}"
    batch_secs[n]=$(awk -v a="${started}" -v b="${EPOCHREALTIME}" 'BEGIN { print b - a }')
    batch_ticks[n]=$(($(server_ticks) - t0))
  done

  t0=$(server_ticks)
  sleep "${duration}"
  c1=$(($(server_ticks) - t0))

  local rate below=0 per_call=()
  rate=$(awk -v a="${c0}" -v b="${c1}" -v d="${duration}" 'BEGIN { print (a + b) / (2 * d) }')
  for ((n = 0; n < batches; n++)); do
    if ((batch_ticks[n] < MIN_BATCH_TICKS)); then
      below=1
    fi
    per_call[n]=$(awk -v t="${batch_ticks[n]}" -v r="${rate}" -v s="${batch_secs[n]}" -v c="${calls}" -v hz="${hz}" \
      'BEGIN { printf "%.3f", (t - r * s) / c / hz * 1000 }')
  done

  printf '%-24s %5d calls/batch  ' "${label}" "${calls}"
  if ((below)); then
    printf 'below resolution (a batch under %d ticks; raise its batch size)' "${MIN_BATCH_TICKS}"
  else
    printf 'per call %s ms' "$(printf '%s\n' "${per_call[@]}" | median_range)"
  fi
  printf '\n    batch ticks: %s | idle controls (%.1fs each): %d, %d ticks\n' \
    "${batch_ticks[*]}" "${duration}" "${c0}" "${c1}"
}

run_bench() {
  batches=${BATCHES:-${MIN_BATCHES}}
  require_count BATCHES "${batches}" "${MIN_BATCHES}"
  local calls
  for calls in BENCH_PING_CALLS BENCH_SMALL_CALLS BENCH_INFO_CALLS BENCH_INDEX_CALLS; do
    require_count "${calls}" "${!calls}" 1
  done
  parse_pids
  ((${#pids[@]} == 1)) && [[ ${names[0]} == bitgauge ]] || die "bench takes exactly one IDLE_PIDS entry, bitgauge=PID"
  command -v curl >/dev/null 2>&1 || die "curl is required"

  local base=${BENCH_URL:-http://127.0.0.1:8080}
  base=${base%/}
  [[ ${base} =~ ^http://[^/]+(/.*)?$ ]] || die "BENCH_URL must be an http:// base URL, got '${base}'"

  # The endpoints a client or a healthcheck calls outside a test, none of them rate limited
  # (wire-protocol.md): the healthcheck's ping, path B's one-byte object, the info document and the
  # SPA's index. The throughput endpoints are measured by the accuracy harness, not here.
  preflight "${base}/api/v1/ping" 204
  preflight "${base}/api/v1/small" 200
  preflight "${base}/api/v1/info" 200
  preflight "${base}/" 200

  echo "bench: ${batches} batches per endpoint against ${base}"
  bench_endpoint "GET /api/v1/ping" "${BENCH_PING_CALLS}" "${base}/api/v1/ping"
  bench_endpoint "GET /api/v1/small" "${BENCH_SMALL_CALLS}" "${base}/api/v1/small"
  bench_endpoint "GET /api/v1/info" "${BENCH_INFO_CALLS}" "${base}/api/v1/info"
  bench_endpoint "GET / (SPA index)" "${BENCH_INDEX_CALLS}" "${base}/"
}

case ${1:-} in
  windows) run_windows ;;
  bench) run_bench ;;
  *) usage ;;
esac
