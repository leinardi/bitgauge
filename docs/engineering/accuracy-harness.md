# Accuracy Harness Runbook

How to run the two manual tiers of the accuracy harness, the range floor and the range ceiling,
and from v0.3 the manual Continuous memory check, before each release, and where their results
go. The harness itself, its profiles, tolerances and
no-egress layers are specified in
[testing.md §5](../features/technical-stack/testing.md#5-accuracy-harness); this note is only the
procedure. The CI tier needs no runbook: `harness.yaml` runs it.

**The harness is active.** Its gate in `test/toolchain/gates.go` holds it to the image
prerequisites, the engine's result object, the Test screen and its JSON download: should any of
them go missing, `make harness-ci`, `make harness-floor` and `make harness-ceiling` fail before any
container starts and name what is missing.

---

## 1. Prepare the Host

- **Linux with Docker**, cgroup v2 and a kernel of 5.19 or later: the report's client CPU and
  memory come from the client container's `cpu.stat` and `memory.peak`.
- **The kernel modules** the shaper's `tc` commands use: `sch_tbf`, `sch_fq_codel`, `sch_netem`,
  `sch_ingress`, `cls_u32`, `act_mirred` and `ifb`. A missing one fails the run; there is never a
  silently unshaped run.
- **A `dhi.io` login** (`docker login dhi.io`): the harness runs the built image, and the image
  builds from `dhi.io` stages.
- **The ceiling tier** needs a machine with at least 4 cores that is otherwise idle. Close the
  browser, the IDE and anything else that competes for CPU; at 10 Gbit the browser's CPU is the
  limit, and a busy host measures itself.
- **A clean slate**: `make harness-sweep` removes stale environments of earlier runs and lists the
  kept ones. Remove a kept one you no longer need with `make harness-sweep-all CONFIRM=1`, which
  removes every harness environment, running ones included.

Build the image the harness runs: `make docker-build`.

## 2. Run the Range Floor

```bash
make harness-floor
```

Two profiles, each in Chromium, Firefox and WebKit: `floor-300k-300ms-1pct-loss` (Standard) and
`floor-300k-600ms-vpn` (Extended, because the shortfall rule otherwise covers it).

To repeat one profile or one browser: `HARNESS_PROFILES=floor-300k-600ms-vpn
HARNESS_BROWSERS=firefox make harness-floor`. To inspect a failure:
`HARNESS_KEEP_ON_FAILURE=1` keeps the containers of a run that errored or failed its tolerances,
labeled `keep=true`, until a sweep removes them.

Then the two manual floor runs the report lists, which no runner can make:

- one real **Android Chrome** run and one real **iOS Safari** run, each over an actual VPN from a
  mobile network to a host running the image (`make docker-run` with `DOCKER_RUN_BIND=0.0.0.0`, or
  the image behind the reverse proxy you use);
- the screen stays on for the whole test (mobile power management is one of the environmental
  limits);
- download the result's JSON from the device and keep it with the run.

## 3. Run the Range Ceiling

```bash
make harness-ceiling
```

Two profiles, `ceiling-2.5g` and `ceiling-10g`, unshaped (`HARNESS_SHAPE=none`): shaping at
10 Gbit is CPU-bound and not representative, so the client reaches BitGauge over the Docker
bridge's veth pair and the report carries the client's CPU and memory for each run.

Then the manual ceiling run the report lists: **real Safari on macOS**, on a machine with at least
4 cores, against the image on the same LAN, with Activity Monitor's CPU and memory readings for
the browser written down. Playwright WebKit is not Safari: Worker XHR and `nextHopProtocol`
behavior have to be seen on the real thing.

## 4. Read a Run

Each run writes `dist/harness/<tier>-<UTC>-<envid>/report.json` and `report.md`, with the raw
exports. Beside each export in `exports/<profile>/`, `<browser>.phases.json` holds the Test
screen's phase transitions the browser driver recorded on the page's wall clock, and
`<browser>.ping.txt` the full output of the ICMP ping that ran alongside, each reply with its
wall-clock time (`ping -D`).

- **Status**: the evaluator judges each completed run against testing.md §5: `pass`, `fail` or
  `inconclusive`, with a one-line verdict and its findings; `failed` carries the reason a run could
  not complete, or the egress it saw. `recorded` is left only on an unshaped run of a shaped
  profile (`HARNESS_SHAPE=none`), a debugging run that is never judged and fails the tier like
  every final run that is not a `pass`. An inconclusive first attempt is re-run once; the first
  stays in the report marked as a re-run, and only the second counts.
- **Self-test** (floor only): the rate each direction's tbf sent, in whole frames, while iperf3
  saturated it before the profile counts. The harness holds it within 5 % of the configured rate,
  as testing.md §5.1 requires. The reference runs are held to the configured goodput instead
  (`rate × 1448 / 1514 × (1 − loss)`), because iperf3 counts TCP payload sent once.
- **iperf3 before and after**: both raw values, always, and the reference the evaluator took from
  them. A profile that breaks either condition of the instability rule of testing.md §5 (before
  and after more than 5 % apart, or either more than 5 % off the configured goodput) has no
  reference; it is re-run once, and if it is still unstable it is **inconclusive**, never a pass.
- **Loaded latency** (v0.2): per direction the engine's increase over idle and its source, the
  ping's idle median and each direction's increase, and the grade with its basis. The evaluator
  places each ping by its send time (arrival less round trip) in the phase windows of
  `phases.json`: idle latency's whole window, and each direction's after its first `I_s`,
  `max(1 s, 4 ×` the idle ping median`)`. A `websocket` or `http-h1-reserved` direction passes
  within ±20 % or 5 ms, whichever is larger, of the ping's increase; the grade must be the letter of
  the larger ping increase its basis names, or the adjacent letter when that increase lies within
  the same tolerance of a threshold. An `http-h2` or `http-h3` direction, and a grade whose basis
  includes one, is recorded with the ping figures and not judged. On a judged direction a missing
  or unavailable loaded latency, a missing increase, a missing grade or a ping with no samples in
  the window fails the run. `ci-100m-50ms-traefik-h1-ws-blocked` must report `http-h1-reserved`
  with at least 10 samples in each direction, at most 5 streams and the `probe-reservation` notice
  (testing.md §5).
- **HTTP loaded responsiveness** (v0.3): each direction's path B state, with its RPM when it has
  one. On `ci-100m-50ms-caddy-h2` a measured direction must read `measured`, on
  `ci-100m-50ms-traefik-h1` `unavailable_h1`; every other profile records it unjudged
  (testing.md §5).
- **Compatibility clients** (v0.3, `ci-100m-50ms-caddy-h2` only): `librespeed-cli`,
  `goresponsiveness` and the OpenSpeedTest UI, each with its download and upload (and the RPM for
  `goresponsiveness`). Each must finish without an error with non-zero numbers, which follow the
  client's own method and are not held to the tolerances; a missing or unreadable output fails the
  profile.
- **Egress counters**: every one is zero, or the run is not evidence of anything. The report names
  the no-egress layer it comes from (netguard's packet layer, not the image test's syscall layer).
- **Client usage** (ceiling): the client container's CPU and memory over the browser run. At
  2.5 Gbit and above the browser's CPU is the expected limit, and the result must report
  `confidence: cpu-bound` when the Worker's busy fraction exceeds 90 %; a headline outside
  tolerance without that qualifier is a finding, which the evaluator reports.
- **Device runs**: the real Android Chrome, iOS Safari and macOS Safari runs have no runner and no
  evaluator; judge them by hand against the tolerance table of testing.md §5 and write the
  numbers and the verdict down.

## 5. Record the Results

The release waits for this file
([testing.md §6](../features/technical-stack/testing.md#6-ci-placement)):
**`docs/engineering/harness-runs/<version>.md`**, one per release, committed by the maintainer
before tagging. It holds, in this order:

1. the floor tier's `report.md`, as written, and the hand verdict per profile and browser;
2. the ceiling tier's `report.md`, as written, and the hand verdict;
3. the manual runs: device, OS and browser versions, the VPN and network used, the headline and
   its qualifiers from the downloaded JSON;
4. from v0.3, the Continuous memory check (§7): the browser version, the minute-by-minute heap
   readings and the verdict;
5. the environmental notes: the host (CPU, cores, kernel, Docker version), anything that differed
   from this runbook, and anything that looked wrong even if it passed.

A failed or inconclusive profile is recorded as such, with its re-run beside it, never replaced by
a later pass. The point of the file is that the next release can be
compared with this one.

## 6. Inject Upload Failures

A manual diagnostic, never a CI profile: it shows the upload failure rules of
[measurement.md §7.5](../features/measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)
at work, which no passing run can, since no upload fails in one. It kills the proxy's upstream
connection to BitGauge while an upload request is in flight, so the proxy answers that one request
with an error and the browser's own connection survives. An injected `429` would not do: it also
lowers the stream cap (measurement.md §4).

Start one proxy profile with its environment kept, for example
`HARNESS_PROFILES=ci-100m-50ms-caddy-h2 HARNESS_BROWSERS=chromium HARNESS_KEEP_ON_FAILURE=1 make
harness-ci`, and in a second terminal, while it starts, run the script below with the tools image
the harness built (`docker images bitgauge-test-tools`). It waits for the proxy container, joins
its network namespace with `NET_ADMIN` only, and after 10 s of upload traffic kills the `COUNT`
upstream sockets still sending; with `ROUNDS` above 1 it goes on killing every socket that sends,
every 300 ms, so the retries fail too. Nothing runs in BitGauge's namespace, so netguard's
counters keep their meaning: they must still read zero.

```sh
#!/bin/sh
# Usage: inject.sh TOOLS_IMAGE COUNT [ROUNDS]
TOOLS=$1; COUNT=$2; ROUNDS=${3:-1}
until P=$(docker ps --format '{{.Names}}' | grep -E '^bitgauge-test-.*-proxy$' | head -1) &&
  [ -n "$P" ]; do sleep 1; done
docker run --rm -i --network "container:$P" --cap-drop ALL --cap-add NET_ADMIN "$TOOLS" \
  sh -s "$COUNT" "$ROUNDS" <<'IN'
COUNT=$1; ROUNDS=$2
sample() { ss -tniH state established '( dport = :8080 )' | awk '
  /^[0-9]/ { n = split($3, a, ":"); port = a[n]; next }
  { for (i = 1; i <= NF; i++) if ($i ~ /^bytes_sent:/) { split($i, b, ":"); print port, b[2] } }'; }
sending() { sample > /tmp/a; sleep 0.2; sample > /tmp/b
  awk 'NR == FNR { p[$1] = $2; next } ($1 in p) && $2 > p[$1] { print $1, $2 - p[$1] }' \
    /tmp/a /tmp/b | sort -k2 -n -r; }
up=0
while [ "$up" -lt 20 ]; do
  sample > /tmp/a; sleep 0.5; sample > /tmp/b
  total=$(awk 'NR == FNR { p[$1] = $2; next } ($1 in p) { s += $2 - p[$1] } END { print s + 0 }' \
    /tmp/a /tmp/b)
  if [ "$total" -gt 2000000 ]; then up=$((up + 1)); else up=0; fi
done
for port in $(sending | head -n "$COUNT" | awk '{ print $1 }'); do
  echo "$(date +%T) kill sport $port"; ss -K '( dport = :8080 )' "sport = :$port" > /dev/null
done
round=1
while [ "$round" -lt "$ROUNDS" ]; do
  sleep 0.3; round=$((round + 1))
  for port in $(sending | awk '{ print $1 }'); do
    echo "round $round kill sport $port"; ss -K '( dport = :8080 )' "sport = :$port" > /dev/null
  done
done
IN
```

`ss -K` may print `RTNETLINK answers: Invalid argument` after a kill that worked; the exported
result says whether it did. A run that injects a failure may still pass or fail its tolerance; the
verdict is not the point. Read the exported result instead:

- **HTTP/1.1 (`ci-100m-50ms-traefik-h1`), one kill:** the upload phase stops issuing at the
  failure, carries the `upload-interrupted` notice, and reports the window up to the frozen end, or
  `insufficient data` when that window is too short.
- **HTTP/2 (`ci-100m-50ms-caddy-h2`), one or two kills:** the phase goes on; each failure leaves a
  failure-gap event, its cells are `null` in the exported series, never zero, and the headline is
  the known cells' bytes over their time.
- **HTTP/2, `ROUNDS=10`:** three consecutive failures end the phase with an error result,
  `requests-failed`.

The runs of 2026-10-16 that closed this question did exactly that:
`ci-20261016T211813Z-9c27074a` (Traefik, `upload-interrupted` at 10.5 s, a 3.7 s window),
`ci-20261016T212221Z-dba00eba` and `ci-20261016T212419Z-24a078c9` (Caddy, one and two failure
gaps, the phase continued), and `ci-20261016T212626Z-f09d157a` (Caddy, `requests-failed` at
12.5 s), every netguard counter at zero. The script as shown was checked once more on
`ci-20261016T213146Z-c97571bf` (Caddy, one kill: a 1.3 s failure gap, the phase continued).

## 7. Run the Continuous Memory Check

From v0.3, before each release. The target arrives with the v0.3 UI and does not exist before it.

```bash
make harness-continuous
```

One hour of a Continuous download on the `ci-100m-50ms` profile in Chromium. From the steady
start, every 60 s, the browser driver forces a garbage collection on the Worker's target through
the Chrome DevTools Protocol and reads `Runtime.getHeapUsage`. The check passes when every reading
from minute 5 to minute 60 lies within 2 MiB of the minute-5 reading
([testing.md §5](../features/technical-stack/testing.md#5-accuracy-harness)). Record the readings
and the verdict in the release's file (§5).
