# Accuracy Harness Runbook

How to run the two manual tiers of the accuracy harness, the range floor and the range ceiling,
before each release, and where their results go. The harness itself, its profiles, tolerances and
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
labelled `keep=true`, until a sweep removes them.

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
behaviour have to be seen on the real thing.

## 4. Read a Run

Each run writes `dist/harness/<tier>-<UTC>-<envid>/report.json` and `report.md`, with the raw
exports.

- **Status**: the evaluator judges each completed run against testing.md §5: `pass`, `fail` or
  `inconclusive`, with a one-line verdict and its findings; `failed` carries the reason a run could
  not complete, or the egress it saw. `recorded` is left only on an unshaped run of a shaped
  profile (`HARNESS_SHAPE=none`), a debugging run that is never judged and fails the tier like
  every final run that is not a `pass`. An inconclusive first attempt is re-run once; the first
  stays in the report marked as a re-run, and only the second counts.
- **Self-test** (floor only): the shaped path's measured throughput before the profile counts. The
  harness holds it within 5 % of the configured goodput, the goodput the configured link rate can
  carry once Ethernet, IP and TCP overhead are taken off (`rate × 1448 / 1514`), as testing.md §5
  requires; not of the configured rate itself.
- **iperf3 before and after**: both raw values, always, and the reference the evaluator took from
  them. A profile that breaks either condition of the instability rule of testing.md §5 (before
  and after more than 5 % apart, or either more than 5 % off the configured goodput) has no
  reference; it is re-run once, and if it is still unstable it is **inconclusive**, never a pass.
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
4. the environmental notes: the host (CPU, cores, kernel, Docker version), anything that differed
   from this runbook, and anything that looked wrong even if it passed.

A failed or inconclusive profile is recorded as such, with its re-run beside it, never replaced by
a later pass. The point of the file is that the next release can be
compared with this one.
