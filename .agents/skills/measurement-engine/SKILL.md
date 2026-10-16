---
name: measurement-engine
description: >
  Measurement engine rules for BitGauge: the framework-free TypeScript engine in a Web Worker.
  Engine purity (no DOM, Vue or app imports; the ESLint banned-globals list; the real clock,
  transport and Worker wired only in clock.ts, transport.ts and worker.ts), the discriminated
  unions of engine/messages.ts, engine tests as synthetic timelines with worked examples A and B
  reproduced exactly, unknown cells never treated as zero, and honest numbers (no smoothing or
  fudge factors, every number with its status, confidence and notices, raw numbers and enum codes
  only, never display text). A rule change starts in measurement.md. Use when writing, editing or
  reviewing anything under web/src/engine/**, docs/features/measurement.md, or an engine
  test.
---

# Measurement Engine — BitGauge

The engine is the product: it is the only code that measures, and every number BitGauge shows is a
documented computation in
[measurement.md](../../../docs/features/measurement.md), whose rules are all engine rules. This
skill covers how the engine is shaped and tested; the methodology itself stays in measurement.md
and is cited by section, never restated as a new rule.

`web/src/engine/` holds the v0.1 engine (the message contract and loop, the injected interfaces,
the phases, the statistics and the result) in the layout of
[frontend.md §1](../../../docs/features/technical-stack/frontend.md#1-spa-layout), the package rules
are [frontend.md §2](../../../docs/features/technical-stack/frontend.md#2-engine-package-rules), the
message contract is
[architecture.md §4](../../../docs/features/architecture.md#4-engine--ui-message-contract), and the
boundary is already enforced by [`web/eslint.config.ts`](../../../web/eslint.config.ts). The locked
decision is
[decisions.md §12](../../../docs/features/technical-stack/decisions.md#12-measurement-engine--framework-free-typescript-in-a-web-worker).

---

## 1. Spec first: a rule change starts in measurement.md

The approved specification is the contract the engine implements, and a change in behavior starts
as a docs change; code follows the docs, and when they disagree the docs win
([AGENTS.md](../../../AGENTS.md), "Project rules";
[ai-guidelines.md](../../../docs/features/technical-stack/ai-guidelines.md)). For the engine that
means:

1. Change the rule in measurement.md first, including the defaults table at its top when a default
   moves. A technical choice that conflicts with
   [decisions.md](../../../docs/features/technical-stack/decisions.md) changes there too, because
   decisions.md wins on technical choices.
2. Run the docs validation from AGENTS.md: numbers, probe-path names and the upload JSON shape
   still agree across measurement.md, wire-protocol.md, configuration.md, `ui/` and glossary.md.
3. Some rules are "the current answer to an item tracked in open-questions.md" (Continuous running
   one direction, §8.5 and §15); changing one means revisiting that item in
   [open-questions.md](../../../docs/features/open-questions.md). Info not being skippable (§1) is
   locked as decisions.md §34. The upload grace (§5), the failure gaps and the HTTP/1.1 rule (§7.5)
   were confirmed with harness evidence on 2026-10-16 and sit under its "Resolved and removed";
   changing one reopens it as a new question with new evidence.
4. [testing.md §2](../../../docs/features/technical-stack/testing.md#2-engine-tests-with-synthetic-timelines)
   quotes the worked examples' numbers and the §19.1 budget tables; a change that moves them updates
   those scenarios.
5. Only then do the engine and its tests follow.

An engine change with no measurement.md section behind it is a spec gap, not an implementation
detail: stop and raise it.

## 2. Engine purity

`web/src/engine/` has no DOM, no Vue and no imports from application code, and talks to the UI only
through typed messages
([frontend.md §2](../../../docs/features/technical-stack/frontend.md#2-engine-package-rules),
[principles.md §2.6](../../../docs/features/principles.md#26-engine-independent-of-the-ui)).
`web/eslint.config.ts` enforces it on `src/engine/**/*.ts` (paths relative to `web/`):

- **Imports.** Only from the engine itself and from `@/api/types.gen`. Banned: `vue`, `vue/**`,
  `@vue/**`, `vue-*`, `@vueuse/**`, `reka-ui`, `reka-ui/**`, `idb`, `uplot`; any `@/` path other
  than `@/engine/...` and `@/api/types.gen`; and any relative path starting with `../`. Inside the
  engine a path that leaves the current folder is written `@/engine/...`.
- **Globals.** `no-restricted-globals` bans exactly this list:

  ```ts
  'window', 'document', 'navigator', 'location', 'self', 'globalThis', 'postMessage',
  'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB',
  ```

- **The three wiring files.** The globals rule ignores `src/engine/clock.ts`,
  `src/engine/transport.ts` and `src/engine/worker.ts` (`engineWiringFiles`): `clock.ts` and
  `transport.ts` are the production `Clock` and `Transport`, and `worker.ts` wires the message loop
  of `loop.ts` to the Worker's messages it receives and posts. The import restrictions still apply
  to them. `loop.ts` holds only the message loop; every rule lives in plain modules.
- **`Date` stays allowed**: the result's `startedAt` is wall-clock time
  ([measurement.md §17](../../../docs/features/measurement.md#17-result-object)), which is not what
  the `Clock` measures.
- The glob has no test exclusion, so an engine test under `src/engine/` is held to the same list.

Where measurement.md says `performance.now()` (§6 chunk timestamps, §10 ping send times, §16 the
busy fraction), `fetch`, `XMLHttpRequest` or `WebSocket`, the engine reaches it through the injected
interfaces of frontend.md §2:

- `Clock`: `now()`, `setTimer(ms, fn)`, `clearTimer(id)`;
- `Transport`: `download(size, signal)` yielding timestamped chunks and the Resource Timing entry;
  `upload(size, onProgress, signal)` resolving to the telemetry JSON; `ws()` for the echo;
  `probe(path)` for HTTP probes with their timing entry; `info()`.

Bucketing, watermark, warm-up, ramp, TM95, grade and AIM scoring are pure functions over data,
unit-tested in isolation (frontend.md §2).

The other direction: application code imports `@/engine/messages` and nothing else under `engine/`,
and starts the Worker by URL, which is not an import. A page never computes a measured number
(vue-page-patterns §4).

## 3. Typed messages: discriminated unions in `messages.ts`

All traffic between the UI and the Worker uses the discriminated unions in `engine/messages.ts`,
both directions keyed on `type`
([architecture.md §4](../../../docs/features/architecture.md#4-engine--ui-message-contract)):

| Direction | `type` values |
| --- | --- |
| Commands, UI → engine | `configure`, `start`, `stop`, `visibility` |
| Events, engine → UI | `phase`, `sample`, `result`, `error` |

- The architecture.md sketch is a "shape sketch, not code to copy"; the payload tables beside it
  are the contract. A new message or field is an architecture.md change first (§1 above).
- The engine's own Info phase calls `GET /api/v1/info` at each `start`; that response is the only
  source of the run's epoch and limits. The UI never hands its own `/info` to the engine.
- `sample` carries a **range** of newly known buckets (`fromBucket` plus `values[]`), at most every
  100 ms. On upload the buckets are server grid cells that become known in batches as requests
  confirm, with the current window end; a `values` entry inside a failure gap is `null` (§5 below).
- `result` carries the versioned result object of
  [measurement.md §17](../../../docs/features/measurement.md#17-result-object), the same schema
  history and export use. Renames or removals bump `schemaVersion`; additions do not.
- `error` carries a `code`, a `messageKey`, the phase and whether partial results exist: a catalog
  key, never a sentence.

Narrow on `type` in both the Worker loop and the app, so a message added to the union and handled
nowhere fails the type check rather than being dropped at run time.

## 4. Engine tests are synthetic timelines

The engine runs in vitest against a fake `Clock` and a fake `Transport`
([testing.md §2](../../../docs/features/technical-stack/testing.md#2-engine-tests-with-synthetic-timelines)).
No real timers, no network, no `vi.mock` of `fetch`.

- **A scenario is a timeline**: link rate per direction over time, RTT, protocol, per-request
  failures, server grid offset and epoch.
- **The fake transport turns it into** chunks, upload telemetry, probe timings and WebSocket
  echoes; the fake clock advances the timeline.
- **Each scenario asserts the emitted events and the final result object exactly.** Not "about
  0.69": the value the spec computes.
- Pure functions (aggregation, watermark, TM95, grades, scores) also get direct table tests; the
  overlapping-histogram case is additionally checked on random overlaps against a brute-force
  reference.
- The scenario list in testing.md §2 is the coverage contract: slow link, h2 vs h1, cancel
  mid-request, overlapping histograms, failures, data cap, warm-up guards, ramp, epoch change,
  loss, latency paths and grades, scores, Continuous, visibility, result object.

### Worked examples A and B, reproduced exactly

Both come from measurement.md and testing.md requires each one "reproduced exactly". The full text
with its table, copied verbatim, is in
[references/worked-examples.md](references/worked-examples.md).

**Example A**
([§7.7](../../../docs/features/measurement.md#77-worked-example-a--two-overlapping-streams-with-non-aligned-starts),
two overlapping streams with non-aligned starts), on 100 ms cells where cell *k* covers
`[100k, 100k + 100)` ms:

- **r1**: first byte at 1050 ms, last at 2100 ms, 64 KiB at a steady ≈ 61 KiB/s → `firstBucket` 10,
  counts ≈ [3.0, 6.1 × 10] KiB (cell 10 holds 50 ms of arrivals, cells 11–20 a full 100 ms each).
- **r2**: first byte at 1620 ms, last at 2720 ms, 64 KiB at ≈ 58 KiB/s → `firstBucket` 16,
  counts ≈ [4.7, 5.8 × 10, 1.2] KiB (cell 16 holds 80 ms, cell 27 the last 20 ms).
- `S_up` per cell is the plain sum. If the window were `[1600, 2700)`, *W* is cells 16–26 (11 full
  cells) and the headline is Σ ≈ 93.3 KiB (from the unrounded counts; the rounded cells above add
  to 93.2) / 1.1 s ≈ 85 KiB/s ≈ 0.69 Mbit/s, read straight off the grid ("above" is the per-cell
  table in the reference copy).
- Assert: cells 10–27, 93.3 KiB over 11 cells, 0.69 Mbit/s. Generate the counts from the stated
  steady rates; the table's rounded values sum to 93.2.

**Example B**
([§7.8](../../../docs/features/measurement.md#78-worked-example-b--cancellation-mid-request),
cancellation mid-request), two streams, requests of about 1 s:

- Stream 1: **r7** confirmed (`startMs` 6000, `durationMs` 1000, done on the client at t ≈ 7.15 s);
  **r9** sent at 7.15 s.
- Stream 2: **r8** confirmed (`startMs` 6400, `durationMs` 1000, done on the client at ≈ 7.55 s);
  **r10** sent at 7.55 s.
- The user stops at 7.8 s; r9 and r10 are aborted and have no telemetry.
- `lb(r9)` = max end of confirmed requests done by 7.15 s = r7's end = 7000 (r8 finished later on
  the client, so it does not qualify).
- `lb(r10)` = max(r7 end 7000, r8 end 7400) = 7400.
- `C = min(7000, 7400) = 7000`; `M_end = 7400`; `W_end_final = min(7000, 7400) = 7000`.
- r8's cells from 7000 to 7400 are known, but they sit after `W_end` because r9 might have been
  active there, so they are excluded. The window is the full cells inside `[warm-up end, 7000)`;
  the result is `partial`.
- Had the phase instead ended cleanly (r9 and r10 confirmed, say ending at 8200 and 8600), *U*
  would be empty, `M_end = 8600`, `W_end_final = 8600`, and the window would be every full cell up
  to 8600.
- Assert: `C = 7000`, `W_end_final = 7000`, `partial`.

## 5. Unknown is never zero

- Upload cells after the window end are `unknown`, "which is distinct from a confirmed zero"
  ([measurement.md §2](../../../docs/features/measurement.md#2-sampling-model)).
- Cells at or after `W_end`, and cells overlapping a failure gap, are `unknown` and are never
  treated as zero; interval means and the "last 10 confirmed buckets" skip them
  ([§8.1](../../../docs/features/measurement.md#81-evaluation-series-and-confirmation-delay)).
- Cells overlapping a failure gap are excluded from every statistic, bytes and time alike; the
  series continues after the gap
  ([§7.5](../../../docs/features/measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)).
  The headline's *W* holds only full cells inside the window that overlap no failure gap; partial
  edge cells are not counted on either side of the ratio, and no intra-cell split is ever estimated
  ([§7.6](../../../docs/features/measurement.md#76-headline-peak-and-minimum-window)).
- Continuous: native cells enter the rings only once confirmed; a coarser cell stores bytes and
  known time, its rate is bytes ÷ known time, a cell with no known time is a gap, and run-wide
  aggregates and "p90, last hour" use only 1 s cells whose ten native cells are all known
  ([§15](../../../docs/features/measurement.md#15-continuous-mode)).
- In messages an unknown cell is `null`, never `0`; the chart renders `null` as a gap
  ([frontend.md §6](../../../docs/features/technical-stack/frontend.md#6-charts-gauge-and-share-image)).
- Download has no unknown buckets (§2, §7.9); do not invent them there.

Test it: a warm-up-guards scenario evaluates on confirmed cells only and must fail if an unknown
cell is read as zero (testing.md §2).

## 6. Honest numbers

No fudge factors, no hidden smoothing, no number without the qualifiers the methodology requires
([principles.md §2.1](../../../docs/features/principles.md#21-honest-numbers),
[decisions.md](../../../docs/features/technical-stack/decisions.md#stack-decisions-to-avoid)):

- **Only documented computations.** The headline is the steady-window average and the peak is the
  p90 of bucket rates over the same window, labeled "peak", never the headline
  ([§9.2](../../../docs/features/measurement.md#9-final-value)). A window that measurement.md
  defines (the gauge's last 5 buckets, §14) is the spec; any averaging, clamping or correction it
  does not define is hidden smoothing.
- **No fudge factor.** Overhead compensation defaults to 0 %. When non-zero, headline and peak are
  multiplied by `1 + p / 100`, the uncompensated values stay in the result, and the setting is
  shown next to every compensated number
  ([§9.3](../../../docs/features/measurement.md#93-overhead-compensation)).
- **Upload from the server only.** The upload number comes only from server-reported arrival
  counts of confirmed requests (§7.1). `upload.onprogress` drives the gauge and the `sending` line
  and never feeds a number (§2); the display offset is cosmetic (§7.4).
- **Every number carries its qualifiers.** A direction has a `status` (`measured`,
  `insufficient-data`, `partial`, `skipped`, `error`) and a `confidence` (`normal`, `low` with
  reasons `ramp-unsettled`, `unstable`, `insufficient-samples`, or `cpu-bound`); the result has a
  `status` (`complete`, `partial`, `error`) and its `notices`
  ([§16](../../../docs/features/measurement.md#16-confidence-and-notices),
  [§17](../../../docs/features/measurement.md#17-result-object)).
- **No number when the data is not there.** Below the minimum window the direction is
  `insufficient-data` with no number and data used shown; a phase never reports a number from one
  request (§7.6, §8.6). Packet loss is "not measured", and the probe-timeout percentage is never
  presented as packet loss (§10, §13.4, §18). Latencies keep the timer's resolution, never false
  precision (§10).
- **Raw numbers and enum codes, never text.** The engine returns raw numbers and enum codes only;
  numbers, units and dates are formatted in the app through `Intl` and vue-i18n
  ([frontend.md §7](../../../docs/features/technical-stack/frontend.md#7-i18n)). The quoted labels
  in measurement.md ("stopped early, upload based on the first 7.0 s", the §16 notice wording) are UI
  copy: the engine emits the code and the raw values (the covered duration in ms), and the app's
  catalog words them.

---

## Standing constraints

- The engine never touches storage; the UI's history module saves after a `result` event
  ([architecture.md §7](../../../docs/features/architecture.md#7-history-storage-in-the-browser)).
- No copied code from OpenSpeedTest, LibreSpeed or any other speed test; their documented behavior
  is for ideas and wire compatibility only.
- Engine `.ts` files count against the `.file-budgets` 400-line ceiling like the rest of `web/src`
  (vue-page-patterns §2); a growing phase module splits into plain modules.

## Checklist

- [ ] The rule changed in measurement.md first; cross-page numbers, open questions and testing.md §2
      updated with it
- [ ] Engine imports only `@/engine/...` and `@/api/types.gen`; no `../`
- [ ] No banned global outside `clock.ts`, `transport.ts` and `worker.ts`; time and I/O through
      `Clock` and `Transport`
- [ ] Messages are `type`-discriminated unions in `messages.ts`; the app imports only that module
- [ ] Each scenario asserts emitted events and the final result exactly; examples A and B match
      their numbers
- [ ] Unknown cells stay `null`/unknown and are skipped, never zero
- [ ] No smoothing, factor or correction measurement.md does not define; every number has its
      status, confidence and notices
- [ ] The engine emits numbers, enum codes and catalog keys, never display text
- [ ] `make verify-web` (ESLint, vue-tsc, Vitest) clean; for a docs change,
      `go test -count=1 ./test/docs/` and markdownlint clean
