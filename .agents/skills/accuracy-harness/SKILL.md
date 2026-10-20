---
name: accuracy-harness
description: >
  How to run, change and read BitGauge's accuracy harness: the CI, floor and ceiling
  tiers and their profiles, the manual Continuous memory check, the make runners and
  their variables,
  the shaper self-test, netguard's negative controls and the two no-egress layers,
  envid-scoped cleanup, report.json and report.md, the environmental limits, and how
  manual runs are recorded for a release. The rule that outranks a green run: never
  widen a tolerance or count "inconclusive" as a pass. Use when editing test/harness/**,
  web/harness/**, web/playwright.harness.config.ts, .mk/harness.mk, test/internal/netguard/**,
  test/internal/testenv/**, docs/features/technical-stack/testing.md section 5, when reading
  a harness report, or when preparing a release.
---

# Accuracy Harness — BitGauge

The harness is the evidence behind the product's range claim: 300 kbit/s to 10 Gbit/s on Chromium,
Firefox and Safari. For each profile a shaper models the user's access link, a real browser runs a
preset over it through the documented URL parameters, and iperf3 measures the same path before and
after as the reference
([testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)). Its
value is that it cannot be talked into a pass: every rule below closes a way a run could look green
while measuring nothing.

[testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness) owns the
behavior; the code under `test/harness/` follows it. When they disagree, the docs win, and a change
to the method starts as a docs change (use the `spec-change` skill).

How to use it:

1. Changing the harness: walk sections 1–9, mark each *applies* or *N/A*, and keep the pins of
   section 9 green with `go test ./test/harness/ ./test/internal/testenv/` (untagged, no Docker).
2. Running it: sections 2–5. Reading a run: sections 6 and 7. Preparing a release: section 8.
3. Finish with the checklist at the end.

---

## 1. What the harness depends on

The driver, `web/harness/run.spec.ts`, extracts each result through the Test screen's **Download
JSON** button
([decisions.md §36](../../../docs/features/technical-stack/decisions.md#36-harness-extraction--download-json-on-the-test-screen)).
A change to that button, or to the result object it downloads, changes the driver in the same
commit.

## 2. Tiers and profiles

`test/harness/profiles.go` holds the table; `TestTiersFollowTestingMD` pins each `DocPhrase` to its
tier's row in testing.md §5 word for word, with exactly 7, 2 and 2 profiles.

| Tier | Profile name (`HARNESS_PROFILES`) | Link | Preset |
| --- | --- | --- | --- |
| `ci` | `ci-500k-300ms` | 500 kbit/s + 300 ms | Standard |
| `ci` | `ci-10m` | 10 Mbit | Standard |
| `ci` | `ci-100m-50ms` | 100 Mbit + 50 ms | Standard |
| `ci` | `ci-1g` | 1 Gbit (nightly if CI runners cannot sustain it) | Standard |
| `ci` | `ci-100m-50ms-traefik-h1` | 100 Mbit + 50 ms through Traefik, HTTP/1.1 | Standard |
| `ci` | `ci-100m-50ms-caddy-h2` | 100 Mbit + 50 ms through Caddy, HTTP/2 on its internal CA | Standard |
| `ci` | `ci-100m-50ms-traefik-h1-ws-blocked` | as Traefik, on the entry point that refuses WebSocket upgrades (HTTP latency fallback) | Standard |
| `floor` | `floor-300k-300ms-1pct-loss` | 300 kbit/s + 300 ms + 1 % loss | Standard |
| `floor` | `floor-300k-600ms-vpn` | 300 kbit/s + 600 ms (VPN over mobile) | Extended |
| `ceiling` | `ceiling-2.5g` | 2.5 Gbit, unshaped (bare metal or veth) | Standard |
| `ceiling` | `ceiling-10g` | 10 Gbit, unshaped | Standard |

Two profiles carry rules of their own (testing.md §5). `PathB` holds `ci-100m-50ms-caddy-h2` to
path B running over HTTP/2 with an RPM in each measured direction (`measured` or `uncertain`, the
choice recorded and not judged, as the maintainer amended it on 2026-10-19: a Standard download
window there holds fewer than 10 probes) and `ci-100m-50ms-traefik-h1` to `unavailable_h1`. `Compat`
is set on the Caddy profile alone (`TestCompatProfile`), and only on an HTTPS proxy
(`TestCompatNeedsHTTPS`): BitGauge starts there with the three compatibility toggles and
`server.trusted_proxies` set to the network's subnets (`Profile.BitGaugeEnv`), the OpenSpeedTest UI
container joins the network, and Caddy's internal root is appended to the shaper's trust store.
After each browser run, `compat.go` runs `librespeed-cli` and `goresponsiveness` in the shaper, on
the browser's path, and in Chromium only drives the OpenSpeedTest UI with
`web/harness/openspeedtest.spec.ts` (`?Host=`, every other origin aborted, so its results link is
never followed). The clients are built in `tools.Dockerfile` at the module versions
`test/dockerfiles` pins (`librespeed-cli` v1.0.14; `goresponsiveness`, which has no release tags, at
the pseudo-version of one commit). A missing or empty output, a parse failure, a non-zero exit, an
OpenSpeedTest UI that ends on its network error, or a zero download, upload or RPM fails the run
(`compatresult.go`); none is a skip.

Every tier drives the Playwright projects `chromium`, `firefox` and `webkit`, one at a time
(`workers: 1`: a second browser on the same link would measure the other one). Each tier also
lists the runs no runner can make, and the report repeats them:

- **Floor:** one real Android Chrome run and one real iOS Safari run over an actual VPN.
- **Ceiling:** real Safari on macOS, on a machine with at least 4 cores, with its CPU and memory
  counters. Shaping at 10 Gbit is CPU-bound and not representative, so the ceiling is unshaped.

The CI tier runs on every pull request through `harness.yaml` once the gate is active; floor and
ceiling are manual, before each release
([testing.md §6](../../../docs/features/technical-stack/testing.md#6-ci-placement)).

## 2a. The Continuous memory check

Beside the tiers and outside `Tiers()` (so `TestTiersFollowTestingMD` keeps its three rows),
testing.md §5 "Continuous memory (manual)" asks for one hour of a Continuous download on
`ci-100m-50ms` in Chromium, before each release, recorded with the floor and ceiling tiers
(section 8).

- **Runner.** `TestHarnessContinuous` (`test/harness/continuous_test.go`, `harness` tag): one
  topology with its shaper self-test and netguard, and the driver run within
  `ContinuousBrowseLimit` (the minutes plus setup), not the tiers' 20 min.
- **Driver.** `web/harness/continuous.spec.ts` opens the Continuous URL with a run length of the
  minutes plus 30 s, takes the steady start from the gauge note leaving "warming up", and every
  60 s forces `HeapProfiler.collectGarbage` and reads `Runtime.getHeapUsage` on the engine Worker.
  Playwright cannot address a flattened Worker session, so the page's session auto-attaches
  unflattened and talks through `Target.sendMessageToTarget`. Its timeout comes from the minutes.
- **Evaluation.** `test/harness/continuous.go`, untagged, table-tested in
  `continuous_eval_test.go`: every reading from minute 5 to the last within 2 MiB (2 097 152 bytes,
  inclusive) of the minute-5 one. A missing, empty or short sample file, a reading out of order or
  without a heap size, or a netguard counter that is missing or not zero fails; nothing skips. The
  report goes to `dist/harness/continuous-<UTC>-<envid>/`.

Never widen the 2 MiB bound, start the baseline later, or drop a reading to make a run pass.

## 3. Running it

| Target | What it does |
| --- | --- |
| `make harness-ci` | The CI tier |
| `make harness-floor` | The floor tier |
| `make harness-ceiling` | The ceiling tier, always with `HARNESS_SHAPE=none` |
| `make harness-continuous` | The Continuous memory check (section 2a), `HARNESS_CONTINUOUS_MINUTES` (default 60, at least 6) |
| `make harness-sweep` | The stale sweep (section 5), listing every environment kept and why |
| `make harness-sweep-all CONFIRM=1` | Removes **every** harness environment, kept or live, anyone's; without `CONFIRM=1` it refuses |
| `make go-vet-harness` | `go vet -tags=harness` over the harness and netguard |

Optional inputs (the tiers; `harness-continuous` takes `HARNESS_CONTINUOUS_MINUTES` and
`HARNESS_KEEP_ON_FAILURE` only): `HARNESS_PROFILES` and `HARNESS_BROWSERS` (comma-separated; empty
means all; a name the tier does not have is an error, never a silent no-op),
`HARNESS_KEEP_ON_FAILURE=1` (keeps a failed run's containers, section 5), `HARNESS_SHAPE=none` (no
shaper), `HARNESS_TIMEOUT` (default `120m`). A run with `HARNESS_SHAPE=none` on a `ci` or `floor`
profile has no shaper and no self-test, and its report says `unshaped`: it is a debugging run, not
a run of that profile, so it stays `recorded`, is not judged, and fails the tier.

Prerequisites (`.mk/harness.mk`): Linux, a Docker daemon with buildx, a `dhi.io` login, the `ifb`,
`netem`, `tbf` and `fq_codel` kernel modules, cgroup v2 with `memory.peak` (Linux 5.19 or later),
and `npm --prefix web ci` on the host: the client mounts `web/` read-only with its `node_modules`,
because it has no route out to install anything.

Topology per run (`topology.go`): an `--internal` network; the netguard holder owning BitGauge's
namespace, which the built image (read-only, `--cap-drop ALL`, `no-new-privileges`) and `iperf3 -s`
join; an optional Traefik or Caddy; the Playwright client; and a shaper sidecar in the **client's**
namespace (tbf and netem on egress, an `ifb` mirror for ingress, each tbf queueing into an fq_codel
of 80 ms of data, at least 64 KiB, whose CoDel target is that length: testing.md §5.1) that also
runs the iperf3 client and the ICMP ping, so they take the browser's path. fq_codel's limit counts
packets sized as full frames, so on a profile whose queue is the 64 KiB minimum (`CapsOffload`)
`OffloadCommand` caps segmentation offload at one segment per packet in the client's namespace and
in the one sending to it (BitGauge's, or the proxy's through a one-shot tools container): never
drop it, or two-segment packets double every slow profile's queue, and never widen it to fast
profiles, where it costs the 1 Gbit self-test about 10-20 %. Third-party images are pinned by
digest in `images.go`, refreshed by hand in each health audit.

## 4. Rules that outrank a green run

### Never widen a tolerance to make a run pass

The tolerances of testing.md §5 (headline against the iperf3 reference: ±15 % at or below
1 Mbit/s, ±10 % from 10 Mbit/s to 1 Gbit, ±20 % at 2.5 Gbit and above with `confidence: cpu-bound`
when the Worker's busy fraction exceeds 90 %; a loaded-latency increase within ±20 % or 5 ms of the
concurrent ICMP ping's increase, the grade on its letter or the adjacent one at a threshold) are
the claim. A run outside them is a finding about the engine, the shaper or the method,
never a reason to move a number. A tolerance changes only through testing.md, deliberately, with
its reason.

**The tolerance evaluator judges every run** (`test/harness/evaluate.go`, untagged and
table-tested in `evaluate_test.go`), on the iperf3 reference method of
[decisions.md §35](../../../docs/features/technical-stack/decisions.md#35-accuracy-harness-reference--iperf3-before-and-after-the-browser-run)
and testing.md §5. `Judge` turns a completed run into `pass`, `fail` or `inconclusive`, with its
reference (`mean(before, after)`, only when stable), its findings and a one-line `verdict`;
`failed` stays for a run that could not complete, and non-zero or missing netguard counters fail
any run. A pass needs a `complete` result with a headline in both directions, each within the
tolerance of the profile's rate; a rate between the table's rows has no tolerance and fails. At
2.5 Gbit and above, a headline outside ±20 % without `confidence: cpu-bound` is a finding of its
own. The loaded-latency rule of testing.md §5 is judged per direction measured with
`websocket` or `http-h1-reserved`, against the ping's increase over the phase windows the browser
driver records; an `http-h2` or `http-h3` direction is recorded with the ping figures, never
judged, the grade is judged against the larger ping increase of its basis, a missing loaded
latency or grade on a judged profile fails, and the ws-blocked profile must show
`http-h1-reserved` with at least 10 samples, at most 5 streams and the `probe-reservation` notice
(`ExpectFallback` in `profiles.go`). `latency.go` implements it (`judgeLoaded`, `judgeGrade`,
`gradeFor`, `allowedGrades`, the 5 ms floor), and every report states it (`LatencyRule`). The
ping's figures come from `ping.go`: `ping -D` replies placed by their send time in the windows of
the driver's `<browser>.phases.json`, each direction's after its first `I_s` (`max(1 s, 4 ×` the
idle ping median`)`). Never take a phase window from product code, and never judge an `http-h2` or
`http-h3` direction. An unshaped run of a shaped profile (`HARNESS_SHAPE=none`) is a debugging run and
stays `recorded`: never call it, or an inconclusive run, a pass. A run's `netguard` counters must
all be present (egress, DNS, loopback) and zero. The evaluator implements testing.md §5 exactly as
written, and nothing looser; its boundaries are inclusive, and its only slack is float rounding
(`1e-9`).

### "Inconclusive" is never a pass

testing.md's reference rule: iperf3 runs immediately **before** and **after** the browser, never
alongside it (that would split the link). If `|before − after| / mean(before, after)` exceeds 5 %,
or either run deviates from the configured goodput by more than 5 %, the profile is re-run once;
still unstable, it is **inconclusive**, a distinct status that fails CI and is never counted as a
pass. Only a stable profile uses `mean(before, after)` as the reference, and both raw values always
go into the report. The runner re-runs an inconclusive first attempt once (`ShouldRerun`); the
first attempt stays in the report, marked `rerun` (superseded) with its raw values, and only the
final attempt counts. The runner fails the tier on any final run that is not a `pass`, a
`recorded` debugging run included (`Failing`).

**The reference baseline is the configured goodput.** iperf3 reports TCP goodput, which a perfectly
shaped link holds about 4.4 % below the configured rate (`rate × 1448 / 1514`, `ExpectedGoodput`).
testing.md §5 therefore measures the reference rule's deviation check against the **configured
goodput**, not the configured rate; against the rate, the 5 % bound would leave about 0.6 % of
headroom and nearly every profile would go inconclusive. On a lossy profile the configured goodput
also takes off the loss (`ConfiguredGoodput`, `× (1 − loss)`): retransmitted segments use the link
but iperf3 counts each payload once. The self-test is the exception: it reads the tbf, which meters
whole frames, so it is held to the configured rate itself. Never move that baseline back, and never
resolve a borderline profile by widening the bound.

Each reference run lasts the preset's download minimum (Standard 10 s, Extended 20 s)
(`ReferenceDuration`): testing.md asks for the steady-window duration, which is adaptive and known
only after the run, so this is a recorded choice. Every iperf3 run, the self-test's included, first
settles for `max(2 s, 10 × RTT)` (`Iperf3Settle`), uses blocks of 10 ms of data
(`Iperf3Length`), and reads the receiver's one-second intervals, whose median from the settle on is
its rate (testing.md §5.1, iperf3 runs). Never go back to `--omit` or to iperf3's totals: `--omit`
carries the omitted seconds' bytes into them, and at 500 kbit/s over 300 ms a single loss recovery
moves a second's bytes into the next, so a 5 s total read 629 kbit/s on a 500 kbit/s link.

### The shaper self-test gates every shaped profile

Before a shaped profile counts, `checkShaper` saturates each direction with iperf3, **before** the
loss is added, and reads the bytes that direction's tbf sent (`TbfSentBytes`, the eth0 tbf for
upload, the ifb0 tbf for download) at the end of the settle and 5 s later. It refuses the profile
when either rate is more than 5 % (`SelfTestBound`) off the configured rate: tbf meters whole
frames, so no overhead is taken off. It never judges iperf3's received rate: on a 64 KiB queue,
TCP's first overflow can land in those 5 s, and the loss recovery after it holds the receiver's
bytes back for seconds, so a correct shaper read 266 kbit/s against 287 at 300 kbit/s, 300 ms.
A tbf left idle by an empty queue reads low and fails, as it should. TCP over a lossy link cannot
show whether the rate holds either, so `LossCommand` adds the netem loss only after the
self-test. Every `tc` and `ip` command must
succeed; a failed one fails the run. There is never a silently unshaped run. Do not loosen the
bound, swallow a `tc` error, or move the loss before the self-test.

### Netguard's negative controls must pass, or the run is instrument-blind

`test/internal/netguard` prepares the holder before BitGauge joins: nftables counters on the output
hook (`egress`: new connections on any interface but loopback; `dns`: traffic to Docker's embedded
DNS at `127.0.0.11:53`; `loopback`: new loopback connections except to the listen port) and a
`sink` dummy interface with IPv4 and IPv6 default routes, so an outgoing packet reaches the hook
and is counted and dropped instead of failing early with "network unreachable". Four negative
controls (TCP to `192.0.2.1`, TCP to `2001:db8::1`, a lookup through `127.0.0.11`, TCP to an unused
loopback port) must each increment their counter, or `Start` fails with `instrument blind`. The
counters are then reset and must stay at zero from BitGauge's start to the end of the run; any
packet fails it. A control that "fails" because nothing answered is the expected outcome; only the
counter says whether it was seen. Never skip, weaken or reorder the controls.

### Two no-egress layers make two different claims

- **No packet egress** (netguard, used by the harness and the image test): sees packets, so it
  cannot see an attempt that fails before a packet is built.
- **No connection or write attempt** (the image test's syscall layer only, `test/image` with
  `test/internal/syscalltrace`): `strace -f` from process start sees every `connect`, send and file
  write.

A harness report states its layer in `noEgressLayer`: `no packet egress (netguard counters, from
BitGauge's start to the end of the run)`. Never let a harness result claim the syscall layer's
guarantee ([security.md §3](../../../docs/features/security.md#3-no-outbound-calls)).

## 5. Cleanup touches only the run's own envid

`test/internal/testenv` labels every container, network and volume a run creates with
`io.github.leinardi.bitgauge.test.envid`, `.owner` (`<hostname>:<pid>` of the go test process) and
`.started` (RFC 3339); names are `bitgauge-test-<envid>-<base>`. Each profile-and-browser run has
its own envid, recorded in the report.

- **Down** removes only the run's own envid, containers first.
- **Keep on failure:** with `HARNESS_KEEP_ON_FAILURE=1`, the resources of a run that errored or
  failed its tolerances (judged inside its subtest, so an inconclusive one is not kept) stay, and a
  marker network `bitgauge-test-<envid>-keep` carrying `.keep=true` is created. The sweep never
  removes a kept environment; remove it yourself by its envid filter once inspected.
- **Stale sweep** (before every harness invocation, in `TestMain`, and in `make harness-sweep`):
  another envid is removed only when it is older than `BITGAUGE_HARNESS_STALE_AFTER` (default 6 h;
  a value that is not a positive duration is an error), not kept, and its owner is provably dead:
  on this host, with a PID that no longer exists. A foreign host is never assumed dead, and an
  unreadable label proves nothing, so either keeps the environment.
- `make harness-sweep-all CONFIRM=1` is the one project-wide removal; it also takes other people's
  live runs.

Never add cleanup by name pattern, by image or by age alone.

## 6. Reading a report

Each invocation writes `dist/harness/<tier>-<UTC>-<envid>/` (UTC as `20060102T150405Z`; this envid
is the invocation's own, distinct from each run's) holding `report.json`, `report.md` (also the CI
step summary), `exports/<profile>/<browser>.json` (the downloaded result) with
`<browser>.phases.json` (the phase transitions) and `<browser>.ping.txt` (the ping's output) beside
it, and `playwright/<profile>-<browser>/`. Once the images are built, the report is written even
when runs fail; a failed image build stops the test before any report exists.

Read each run in this order; stop at the first that fails:

1. **Status, verdict and error.** `pass`, `fail` or `inconclusive` with the `verdict` line and its
   `findings`; `failed` carries the error (`shaper self-test failed`, `instrument blind`,
   `packets tried to leave BitGauge's namespace`, a browser timeout). Playwright fails on its
   timeout when Download JSON never appears; Download JSON also exports a partial or error result,
   and the evaluator fails any result that is not `complete`. An attempt marked `(re-run)` was
   superseded by the next one.
2. **Egress.** Every counter zero (`0` in the Markdown). A dash means netguard never started, so
   nothing was observed.
3. **Self-test** (down / up): each tbf's sent rate, within 5 % of the configured rate, or
   `unshaped` on the ceiling.
4. **iperf3 before and after** (down / up), and the **reference** the evaluator took from them:
   none when the pair broke the 5 % stability rule of section 4.
5. **The browser result:** per direction the headline, its status and its steady window in
   seconds; in `report.json`, `result` also holds the preset, the negotiated protocol (HTTP/1.1
   through Traefik, HTTP/2 through Caddy), the streams, the loaded latency, the grade and the
   notices. A headline without its status and notices is not a result.
6. **Loaded latency:** per direction the engine's increase and source, the ping's idle median and
   each direction's increase, and the grade with its basis; the verdict says which were judged
   and which recorded. `exports/<profile>/<browser>.phases.json` and `<browser>.ping.txt` are the
   raw windows and replies behind them.
7. **Data used**, in MB.
8. **Client CPU and memory:** CPU seconds over wall seconds (mean cores busy) and the peak memory
   of the whole client container (browser and Playwright, from its cgroup v2). On the ceiling tier
   these are the documented counters; a run near the machine's core count is CPU-bound.
9. **Path B** (down / up): each direction's state, with its RPM, protocol and samples when it has
   a number; judged on the Caddy and Traefik profiles only.
10. **Compatibility clients** (Caddy profile): each client's download and upload, with
   `goresponsiveness`'s RPM and `(estimate)` when it did not run to stability; their raw outputs
   are in `exports/<profile>/<browser>-compat/` (`librespeed.json`, `goresponsiveness.txt` and the
   `goresponsiveness.json` read from it, `openspeedtest.json` in Chromium).

`report.json` keeps `ping` per run: ping's own closing summary, the path of its full output, and
its median per phase window with each direction's increase over idle, the loaded-latency
reference.

## 7. Environmental limits

Every report carries them, pinned to testing.md by `TestEnvironmentalLimitsFollowTestingMD`:

- `tc` shaping jitter (tbf burst sizes, netem timer granularity).
- Docker bridge overhead at high rates.
- Playwright WebKit ≠ Safari: Worker XHR and `nextHopProtocol` behavior must be re-checked on real
  Safari.
- Mobile power management: device runs happen with the screen on.

And the closing statement: the harness cannot prove real Wi-Fi behavior, real VPN MTU effects,
carrier-grade NAT, or anything about networks the project does not target. Never write a claim a
report cannot support.

## 8. Recording manual runs for a release

A release is blocked until the floor and ceiling tiers, the Continuous memory check, and the real
Safari and iOS checks, have passed for it ([release.md](../../../docs/release.md#how-to-release),
[testing.md §5.1](../../../docs/features/technical-stack/testing.md#51-implementation)):

- The maintainer commits the run's `report.md` as `docs/engineering/harness-runs/<version>.md`, one
  file per release, holding the floor and ceiling results, the Continuous memory check's readings
  and verdict, the real Safari and iOS checks (the report's "Manual runs this tier requires" list)
  and the environmental notes.
- The directory exists, with a
  [`README.md`](../../../docs/engineering/harness-runs/README.md) saying what each file holds; no
  run is recorded yet, and the first file is `0.1.0.md`. The lab runbook is
  [`accuracy-harness.md`](../../../docs/engineering/accuracy-harness.md).
- The evaluator judges the floor and ceiling runs too; the device runs (real Android Chrome, real
  iOS Safari, real Safari on macOS) have no runner, so their "passed" is a human judgment against
  testing.md's tolerances: record the numbers and the judgment, never only the verdict.

## 9. Changing the harness

- Profiles, tiers, the environmental limits and the closing statement are pinned to testing.md
  by `harness_unit_test.go`: change testing.md first, then `profiles.go` or `report.go`.
- The pure logic (profiles, report, shaper commands, iperf3 and ping parsing, phase windows, the
  loaded-latency rule, the Continuous memory evaluation, cgroup counters, testenv rules) is
  untagged and runs in every `go test ./...`; the runners and netguard carry the `harness` build
  tag (netguard also `image`). Check both with `make go-vet-harness`.
- The browser driver uses only what a user has: the URL parameters and the Download JSON button,
  and it reads the Test screen's phase steps as they change. No test-only hook in the SPA.
- No outbound call from any container: the client gets no route out, and nothing installs at run
  time.

---

## Checklist

- [ ] No tolerance widened, no self-test bound loosened, no evaluator looser than testing.md §5
- [ ] No report or summary calls a `recorded` run, or an inconclusive one, a pass
- [ ] The evaluator's table tests cover every tolerance boundary and the 5.0 % / 5.1 % stability edge
- [ ] The loaded-latency tests cover the ±20 % and 5 ms edges, grade adjacency at each threshold,
      `http-h2`/`http-h3` recorded, and the ws-blocked fallback's source, samples, streams and notice
- [ ] Every `tc` failure fails the run; loss added only after the self-test
- [ ] Netguard's four negative controls run before BitGauge starts; counters zero to the end
- [ ] The report names its no-egress layer; no syscall-layer claim from netguard
- [ ] Cleanup scoped to the run's own envid; kept and foreign environments untouched
- [ ] Profiles, limits and closing statement still match testing.md §5
- [ ] Harness gate prerequisites, CI job and workflow change together or not at all
- [ ] The Continuous memory check's 2 MiB bound and minute-5 baseline untouched; a short file fails
- [ ] Manual tiers recorded in `docs/engineering/harness-runs/<version>.md` before tagging
