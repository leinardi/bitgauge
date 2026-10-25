---
name: accuracy-harness
description: >
  How to run, change and read BitGauge's accuracy harness (tiers, profiles and tolerances live in
  testing.md section 5): the make runners and variables, the Continuous memory check, the shaper
  self-test, netguard's negative controls, envid-scoped cleanup, report.json and report.md, and
  recording manual runs for a release. The rule that outranks a green run: never widen a
  tolerance or count "inconclusive" as a pass. Use when editing test/harness/**, web/harness/**,
  web/playwright.harness.config.ts, .mk/harness.mk, test/internal/netguard/**,
  test/internal/testenv/**, docs/features/technical-stack/testing.md section 5, when reading a
  harness report, or when preparing a release.
---

# Accuracy Harness — BitGauge

The harness is the evidence behind the range claim, 300 kbit/s to 10 Gbit/s on Chromium, Firefox
and Safari. Its value is that it cannot be talked into a pass: every rule below closes a way a run
could look green while measuring nothing.

[testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness) owns the
behavior: the tiers and their profiles, the method, the tolerances, the latency rule, path B, the
compatibility clients and the Continuous memory check. Read it first; this skill does not repeat
it. The code under `test/harness/` follows it. When they disagree, the docs win, and a change to
the method starts as a docs change (use the `spec-change` skill). The lab runbook is
[`accuracy-harness.md`](../../../docs/engineering/accuracy-harness.md).

How to use it: changing the harness, walk sections 1–8 and keep the pins of section 8 green with
`go test ./test/harness/ ./test/internal/testenv/` (untagged, no Docker); running it, sections 2–4;
reading a run, section 5; preparing a release, section 7. Finish with the checklist.

## 1. What the harness depends on

The driver, `web/harness/run.spec.ts`, extracts each result through the Test screen's **Download
JSON** button
([decisions.md §36](../../../docs/features/technical-stack/decisions.md#36-harness-extraction--download-json-on-the-test-screen)).
A change to that button, or to the result object it downloads, changes the driver in the same
commit.

## 2. Running it

| Target | What it does |
| --- | --- |
| `make harness-ci` | The CI tier |
| `make harness-floor` | The floor tier |
| `make harness-ceiling` | The ceiling tier, always with `HARNESS_SHAPE=none` |
| `make harness-continuous` | The Continuous memory check, `HARNESS_CONTINUOUS_MINUTES` (default 60, at least 6) |
| `make harness-sweep` | The stale sweep (section 4), listing every environment kept and why |
| `make harness-sweep-all CONFIRM=1` | Removes **every** harness environment, kept or live, anyone's; without `CONFIRM=1` it refuses |
| `make go-vet-harness` | `go vet -tags=harness` over the harness and netguard |

Inputs for the tiers: `HARNESS_PROFILES` and `HARNESS_BROWSERS` (comma-separated; empty means all;
a name the tier does not have is an error, never a silent no-op), `HARNESS_KEEP_ON_FAILURE=1`
(section 4), `HARNESS_SHAPE=none` (no shaper), `HARNESS_TIMEOUT` (default `120m`).
`harness-continuous` takes only `HARNESS_CONTINUOUS_MINUTES` and `HARNESS_KEEP_ON_FAILURE`. A run
with `HARNESS_SHAPE=none` on a `ci` or `floor` profile has no shaper and no self-test, and its
report says `unshaped`: a debugging run, not a run of that profile, so it stays `recorded`, is not
judged, and fails the tier.

Prerequisites (`.mk/harness.mk`): Linux, Docker with buildx, a `dhi.io` login, the `ifb`,
`sch_netem`, `sch_tbf`, `sch_fq_codel`, `sch_ingress`, `cls_u32` and `act_mirred` kernel modules
loadable on the host, cgroup v2 with `memory.peak` (Linux 5.19 or later) and a daemon that gives
each container its own cgroup, and `npm --prefix web ci` on the host: the client mounts `web/`
read-only with its `node_modules`, because it has no route out to install anything.

**Preflight** (`preflight.go`, untagged, tested in `preflight_test.go`; `make harness-preflight`
runs it alone): `Prepare` reads the daemon's cgroup claim before any build, builds the tools image,
runs the probe (`Preflight`, its containers removed before it returns), and only then builds
BitGauge's image. The probe's identity check is an inode match between the client-mode
container's `/sys/fs/cgroup` and the directory a host-view container finds under its ID. Never
replace it with a statistic (process counts, memory sizes) or let a probe error pass: a daemon
whose identity cannot be established is refused.

Where things live: `profiles.go` (`TestTiers` pins the tier sizes), `topology.go`, `shaper.go`,
`evaluate.go` and `latency.go`, `compat.go` (clients built in `tools.Dockerfile`), `report.go`.
Third-party images are pinned by digest in `images.go`, refreshed by hand in each health audit.
Browsers run one at a time (`workers: 1`): a second one on the link would measure the other.

On a profile whose queue is the 64 KiB minimum (`CapsOffload`), `OffloadCommand` caps segmentation
offload at one segment per packet on both ends of the shaped link. Never drop it, or two-segment
packets double every slow profile's queue, and never widen it to fast profiles, where it costs the
1 Gbit self-test about 10–20 %.

**The Continuous memory check** (`TestHarnessContinuous`, outside `Tiers()` so `TestTiers` keeps
its three tiers) runs one topology with its self-test and netguard. `web/harness/continuous.spec.ts`
takes the steady start from the gauge note leaving "warming up", then every 60 s forces
`HeapProfiler.collectGarbage` and reads `Runtime.getHeapUsage` on the engine Worker; Playwright
cannot address a flattened Worker session, so the page's session auto-attaches unflattened and
talks through `Target.sendMessageToTarget`. `continuous.go` (untagged, table-tested in
`continuous_eval_test.go`) judges it: a missing, empty or short sample file, a reading out of order
or without a heap size, or a nonzero or missing netguard counter fails; nothing skips. The report
goes to `dist/harness/continuous-<UTC>-<envid>/`. Never widen the 2 MiB bound, start the baseline
later than minute 5, or drop a reading to make a run pass.

## 3. Rules that outrank a green run

### Never widen a tolerance to make a run pass

The tolerances of testing.md §5 are the claim. A run outside them is a finding about the engine,
the shaper or the method, never a reason to move a number. A tolerance changes only through
testing.md, deliberately, with its reason.

**The evaluator judges every run** (`evaluate.go`, table-tested in `evaluate_test.go`; the
loaded-latency rule in `latency.go`). `Judge` turns a completed run into `pass`, `fail` or
`inconclusive` with its reference, findings and a one-line `verdict`; `failed` is for a run that
could not complete. It implements testing.md §5 exactly as written and nothing looser: boundaries
inclusive, its only slack float rounding (`1e-9`), a rate between the table's rows has no
tolerance and fails, and a missing loaded latency or grade on a judged profile fails. The ping's
phase windows come from the driver's `<browser>.phases.json`, never from product code, and an
`http-h2` or `http-h3` direction is recorded, never judged.

### "Inconclusive" is never a pass

iperf3 runs immediately **before** and **after** the browser, never alongside it. An unstable pair
is re-run once (`ShouldRerun`); still unstable, it is **inconclusive**, which fails the tier and is
never counted as a pass. The first attempt stays in the report, marked `rerun` (superseded), with
its raw values; only the final attempt counts. The runner fails the tier on any final run that is
not a `pass`, a `recorded` debugging run included (`Failing`). Never call an inconclusive or
`recorded` run a pass, in a report, a summary or a commit message.

**The reference baseline is the configured goodput** (`ExpectedGoodput`, `rate × 1448 / 1514`;
`ConfiguredGoodput` also takes off a lossy profile's loss), not the configured rate: against the
rate, the 5 % stability bound would leave about 0.6 % of headroom and nearly every profile would
go inconclusive. Never move that baseline back, and never resolve a borderline profile by widening
the bound.

Each reference run lasts the preset's download minimum (`ReferenceDuration`), a recorded choice:
the steady window is known only after the run. iperf3 is read as testing.md §5.1 says
(`Iperf3Settle`, `Iperf3Length`, the median of the receiver's one-second intervals). Never go back
to `--omit` or iperf3's totals: at 500 kbit/s over 300 ms they read 629 kbit/s.

### The shaper self-test gates every shaped profile

Before a shaped profile counts, `checkShaper` saturates each direction with iperf3, **before** the
loss is added, and reads the bytes that direction's tbf sent (`TbfSentBytes`: eth0 for upload,
ifb0 for download) at the end of the settle and 5 s later. It refuses the profile when either rate
is more than 5 % (`SelfTestBound`) off the configured **rate** (tbf meters whole frames). It never
judges iperf3's received rate: on a 64 KiB queue a loss recovery holds the receiver's bytes back
for seconds, so a correct shaper read 266 kbit/s against 287 at 300 kbit/s, 300 ms. `LossCommand`
adds the netem loss only after the self-test. Every `tc` and `ip` command must succeed; there is
never a silently unshaped run. Do not loosen the bound, swallow a `tc` error, or move the loss
before the self-test.

### Netguard's negative controls must pass, or the run is instrument-blind

`test/internal/netguard` prepares the holder before BitGauge joins (the counters, the `sink`
interface and the four negative controls of testing.md §5). Each control must increment its
counter, or `Start` fails with `instrument blind`; the counters are then reset and must all be
present and zero from BitGauge's start to the end of the run. A control that "fails"
because nothing answered is the expected outcome; only the counter says whether it was seen. Never
skip, weaken or reorder the controls.

### Two no-egress layers make two different claims

Netguard sees packets, so it cannot see an attempt that fails before a packet is built; only the
image test's syscall layer (`test/image` with `test/internal/syscalltrace`) sees every attempt. A
harness report states its layer in `noEgressLayer`. Never let a harness result claim the syscall
layer's guarantee ([security.md §3](../../../docs/features/security.md#3-no-outbound-calls)).

## 4. Cleanup touches only the run's own envid

`test/internal/testenv` labels every container, network and volume a run creates with
`io.github.leinardi.bitgauge.test.envid`, `.owner` (`<hostname>:<pid>` of the go test process) and
`.started` (RFC 3339); names are `bitgauge-test-<envid>-<base>`. Each profile-and-browser run has
its own envid, recorded in the report.

- **Down** removes only the run's own envid, containers first.
- **Keep on failure:** with `HARNESS_KEEP_ON_FAILURE=1`, a run that errored or failed its
  tolerances (not an inconclusive one) keeps its resources and gets a marker network
  `bitgauge-test-<envid>-keep` with `.keep=true`. The sweep never removes it; remove it yourself by
  its envid filter once inspected.
- **Stale sweep** (in `TestMain` and `make harness-sweep`): another envid is removed only when it is
  older than `BITGAUGE_HARNESS_STALE_AFTER` (default 6 h; anything but a positive duration is an
  error), not kept, and its owner is provably dead: on this host, with a PID that no longer
  exists. A foreign host or an unreadable label proves nothing, so either keeps the environment.
- `make harness-sweep-all CONFIRM=1` is the one project-wide removal; it also takes other people's
  live runs.

Never add cleanup by name pattern, by image or by age alone.

## 5. Reading a report

Each invocation writes `dist/harness/<tier>-<UTC>-<envid>/` (the invocation's own envid, distinct
from each run's) holding `report.json`, `report.md` (also the CI step summary),
`exports/<profile>/<browser>.json` (the downloaded result) with `<browser>.phases.json` and
`<browser>.ping.txt` beside it, and `playwright/<profile>-<browser>/`. Once the images are built,
the report is written even when runs fail; a failed image build stops before any report exists.

Read each run in this order; stop at the first that fails:

1. **Status, verdict and error.** `pass`, `fail` or `inconclusive` with the `verdict` and its
   `findings`; `failed` carries the error (`shaper self-test failed`, `instrument blind`,
   `packets tried to leave BitGauge's namespace`, a browser timeout). An attempt marked
   `(re-run)` was superseded by the next one. Any result that is not `complete` fails.
2. **Egress.** Every counter `0`. A dash means netguard never started, so nothing was observed.
3. **Self-test** (down / up): each tbf's sent rate, within 5 % of the configured rate, or
   `unshaped` on the ceiling.
4. **iperf3 before and after**, and the **reference** taken from them: none when the pair was
   unstable.
5. **The browser result:** per direction the headline, its status and its steady window;
   `report.json` also holds the preset, the negotiated protocol, the streams, the loaded latency,
   the grade and the notices. A headline without its status and notices is not a result.
6. **Loaded latency:** the engine's increase and source, the ping's idle median and increases, the
   grade with its basis; the verdict says which were judged and which recorded. `report.json`
   keeps `ping` per run (its summary, the output's path, the median per phase window).
7. **Data used**, in MB.
8. **Client CPU and memory:** CPU seconds over wall seconds and the client container's peak memory
   (cgroup v2). On the ceiling tier these are the documented counters; a run near the machine's
   core count is CPU-bound.
9. **Path B** (down / up): state, with RPM, protocol and samples; judged on the Caddy and Traefik
   profiles only.
10. **Compatibility clients** (Caddy profile): each client's download and upload, with
    `goresponsiveness`'s RPM and `(estimate)` when it did not reach stability; raw outputs in
    `exports/<profile>/<browser>-compat/`.

## 6. Environmental limits

Every report carries the limits testing.md §5 lists (`EnvironmentalLimits` in `report.go`) and its
closing statement of what the harness cannot prove. Never write a claim a report cannot support.

## 7. Recording manual runs for a release

A release is blocked until the floor and ceiling tiers, the Continuous memory check, and the real
Safari and iOS checks have passed for it ([release.md](../../../docs/release.md#how-to-release),
[testing.md §6](../../../docs/features/technical-stack/testing.md#6-ci-placement)):

- The maintainer commits the run's `report.md` as `docs/engineering/harness-runs/<version>.md`,
  one file per release, holding the floor and ceiling results, the Continuous memory check's
  readings and verdict, the real-device checks (the report's "Manual runs this tier requires"
  list) and the environmental notes ([`README.md`](../../../docs/engineering/harness-runs/README.md)).
  The CI tier is not recorded there; its report is that run's artifact.
- A failed or inconclusive profile is recorded as such, with its re-run beside it, never replaced
  by a later pass.
- The device runs (real Android Chrome, real iOS Safari, real Safari on macOS) have no runner, so
  their "passed" is a human judgment against testing.md's tolerances: record the numbers and the
  judgment, never only the verdict.

## 8. Changing the harness

- Profiles, tiers, the environmental limits and the closing statement are pinned to testing.md by
  `harness_unit_test.go`: change testing.md first, then `profiles.go` or `report.go`.
- The pure logic (profiles, report, shaper commands, iperf3 and ping parsing, phase windows, the
  loaded-latency rule, the Continuous evaluation, cgroup counters, testenv rules) is untagged and
  runs in every `go test ./...`; the runners and netguard carry the `harness` tag (netguard also
  `image`). Check both with `make go-vet-harness`.
- The browser driver uses only what a user has: the URL parameters and the Download JSON button,
  and it reads the Test screen's phase steps as they change. No test-only hook in the SPA.
- No outbound call from any container: the client gets no route out, and nothing installs at run
  time.

## Checklist

- [ ] No tolerance widened, no self-test bound loosened, no evaluator looser than testing.md §5
- [ ] No report or summary calls a `recorded` run, or an inconclusive one, a pass
- [ ] Evaluator table tests cover every tolerance boundary and the 5.0 % / 5.1 % stability edge
- [ ] The loaded-latency tests cover the ±20 % and 5 ms edges, grade adjacency at each threshold,
  `http-h2`/`http-h3` recorded, and the ws-blocked fallback's source, samples, streams and notice
- [ ] Every `tc` failure fails the run; loss added only after the self-test
- [ ] Netguard's four negative controls run before BitGauge starts; counters zero to the end
- [ ] The report names its no-egress layer; no syscall-layer claim from netguard
- [ ] Cleanup scoped to the run's own envid; kept and foreign environments untouched
- [ ] Profiles, limits and closing statement still match testing.md §5
- [ ] The Continuous memory check's 2 MiB bound and minute-5 baseline untouched; a short file fails
- [ ] Manual tiers recorded in `docs/engineering/harness-runs/<version>.md` before tagging
