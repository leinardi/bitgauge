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
# Idle-footprint measurement of a running binary, made repeatable. Read-only: it reads /proc and
# writes nothing but its own temporary directory.
#
#   idle-measure.sh windows   CPU and resident memory of the named processes over idle windows
#
# Dormant until a running binary exists: with nothing to name in IDLE_PIDS it fails before
# measuring anything.
#
# Inputs, all from the environment (make idle-measure exports them):
#
#   IDLE_PIDS   space-separated name=PID pairs, e.g. "bitgauge=123". The caller resolves the PIDs
#               (ps -eo pid,comm,args): this script never guesses which process is which.
#   WINDOWS     number of windows (default and minimum 5 -- median and range, or nothing)
#   WINDOW_S    seconds per window (default 300)
#   WARMUP_S    seconds to wait before the first window (default 30)
#
# CPU comes from utime+stime in /proc/<pid>/stat, reported as percent of one core. Memory comes
# from /proc/<pid>/status: VmRSS at the end of each window, and VmHWM (the peak resident set since
# the process started) once at the end.

set -euo pipefail

# EPOCHREALTIME, printf, awk and sort -g all follow the locale's decimal separator; a comma would
# turn every elapsed time into a whole number of seconds.
export LC_ALL=C

readonly MIN_WINDOWS=5

die() {
  echo "idle-measure: $*" >&2
  exit 1
}

usage() {
  echo "usage: IDLE_PIDS='name=PID ...' $0 windows" >&2
  exit 2
}

workdir=$(mktemp -d)

cleanup() {
  rm -rf "${workdir}"
}

trap 'cleanup' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

hz=$(getconf CLK_TCK)

# require_count refuses a leading zero rather than normalising it: every count is used as given
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

# ticks I prints utime+stime of process I in clock ticks. A zombie or dead process, or one whose
# start time no longer matches (the PID was recycled), is gone: its counters would read as idle.
ticks() {
  local rest
  local -a fields
  rest=$(stat_fields "${pids[$1]}")
  read -r -a fields <<<"${rest}"
  [[ ${fields[0]} != [ZX] ]] || die "process ${pids[$1]} (${names[$1]}) is gone"
  [[ ${fields[19]} == "${starts[$1]}" ]] || die "process ${pids[$1]} (${names[$1]}) was replaced"
  echo "$((fields[11] + fields[12]))"
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

run_windows() {
  local windows=${WINDOWS:-${MIN_WINDOWS}} window_s=${WINDOW_S:-300} warmup_s=${WARMUP_S:-30}
  require_count WINDOWS "${windows}" "${MIN_WINDOWS}"
  require_count WINDOW_S "${window_s}" 1
  require_count WARMUP_S "${warmup_s}" 0
  parse_pids

  echo "warm-up: ${warmup_s}s, then ${windows} windows of ${window_s}s"
  sleep "${warmup_s}"

  local w i started elapsed cpu kib rss
  local -a before after
  for ((w = 1; w <= windows; w++)); do
    for i in "${!pids[@]}"; do
      before[i]=$(ticks "${i}")
    done
    started=${EPOCHREALTIME}

    sleep "${window_s}"

    for i in "${!pids[@]}"; do
      after[i]=$(ticks "${i}")
    done
    elapsed=$(awk -v a="${started}" -v b="${EPOCHREALTIME}" 'BEGIN { print b - a }')

    printf 'window %d/%d (%.0fs):' "${w}" "${windows}" "${elapsed}"
    for i in "${!pids[@]}"; do
      cpu=$(percent $((after[i] - before[i])) "${elapsed}")
      kib=$(status_kib "${i}" VmRSS)
      rss=$(mib "${kib}")
      echo "${cpu}" >>"${workdir}/cpu.${names[i]}"
      echo "${rss}" >>"${workdir}/rss.${names[i]}"
      printf ' %s %s%% %s MiB' "${names[i]}" "${cpu}" "${rss}"
    done
    printf '\n'
  done

  echo
  echo "median (range) over ${windows} windows of ${window_s}s:"
  local peak
  for i in "${!names[@]}"; do
    ticks "${i}" >/dev/null
    kib=$(status_kib "${i}" VmHWM)
    peak=$(mib "${kib}")
    printf '  %-12s cpu %s %% of one core  rss %s MiB  peak rss %s MiB\n' "${names[i]}" \
      "$(median_range <"${workdir}/cpu.${names[i]}")" "$(median_range <"${workdir}/rss.${names[i]}")" \
      "${peak}"
  done
}

case ${1:-} in
  windows) run_windows ;;
  *) usage ;;
esac
