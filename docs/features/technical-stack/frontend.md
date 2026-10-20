# Frontend Design

[Feature index](../README.md) / [Technical Stack](README.md) / Frontend

The frontend is a Vue 3 SPA built by Vite and embedded in the Go binary, plus a framework-free
measurement engine that runs in a Web Worker. Screens and flows are specified in
[../ui/README.md](../ui/README.md); the engine's rules in [../measurement.md](../measurement.md).
Everything here is planned.

## 1. SPA Layout

```text
web/
  index.html                  template; base path substituted by the server at startup
  vite.config.ts              SPA + Worker build
  src/
    engine/                   measurement engine (Worker); framework-free
      worker.ts               Worker entry: wires the message loop of loop.ts
      messages.ts             command and event types shared with the UI, re-exported
      messages/               from messages/, which holds the unions by topic
      run.ts, run/, phases/, upload/, download/, latency/, stats/, result.ts, result/
      clock.ts, transport.ts, wiring.ts   browser clock and transport, their pure helpers
    demo/                     demo builds only (section 9): the simulated link, its Worker entry
    api/                      generated OpenAPI types and a typed fetch helper for GET /info
    components/               app components (gauge, charts, result cards, notices)
    components/layout/        the header and the narrow-screen tab bar
    components/ui/            shadcn-vue components (copied, on Reka UI primitives)
    composables/              stateful UI logic: useRun, useSettings, useHistory, useShare,
                              useTheme, useInfo, useContextLabel, useWorker
    lib/                      plain helpers: class merging, server defaults as engine settings,
                              the base-path check, the project's links, number formatting,
                              the settings summary
    pages/                    route-level views: Test, ResultDetail, History, Settings, About
    router/                   Vue Router, HTML5 history under the base path
    i18n/                     vue-i18n setup and locale files, one directory per language
    history/                  idb database, schema migrations, export/import
    share/                    share content, summary lines, the share image's canvas, actions
    styles/                   Tailwind entry, design tokens from the design export
```

Pages orchestrate, components render, composables hold state, `api/` talks to the server, and
`engine/` measures. Nothing outside `engine/` measures anything.

## 2. Engine Package Rules

- **No DOM, no Vue, no imports from application code.** `engine/` may import only from itself and
  from the generated API types. An ESLint `no-restricted-imports` rule enforces the boundary in
  both directions: the app may import only `engine/messages.ts` and the Worker URL.
- **Message schema.** All traffic between the UI and the Worker uses the discriminated unions in
  `engine/messages.ts` ([../architecture.md §4](../architecture.md#4-engine--ui-message-contract)),
  which defines them in `engine/messages/` and re-exports them; the app imports only the former.
  `loop.ts` holds the message loop and `worker.ts` only wires it to the Worker's messages; every
  rule lives in plain modules. Besides the types, `engine/messages.ts` has two runtime exports:
  `validateResult`, re-exported from `engine/result/validate.ts`, the structural check of the
  result object ([../measurement.md §17](../measurement.md#17-result-object)), so the application
  validates a result before exporting it without importing engine internals; from v0.2
  `PRESETS`, re-exported from `engine/presets.ts`, the preset table of
  [../measurement.md §8.5](../measurement.md#85-presets), so the Settings screen states a preset's
  streams, durations and ping count and applies a stored preset as the engine resolves one; and
  from v0.3 `RING_LENGTHS`, the Continuous retention rings' lengths (`native` 6000, `hour` 3600,
  `day` 1440, `long` 1008) of [../measurement.md §15](../measurement.md#15-continuous-mode), so
  the live chart keeps fixed rings of the same lengths.
- **Synthetic clock injection.** The engine never calls `performance.now()`, `setTimeout`,
  `fetch`, `XMLHttpRequest` or `WebSocket` directly. It receives two interfaces:
  - `Clock`: `now()`, `setTimer(ms, fn)`, `clearTimer(id)`, `busyMs()` (the time spent in the
    Worker's own tasks, for the busy fraction of
    [../measurement.md §16](../measurement.md#16-confidence-and-notices)), and `resolutionMs` and
    `crossOriginIsolated` ([../edge-cases.md §9](../edge-cases.md#9-clock-and-timer-resolution));
  - `Transport`: `download(size, signal)` yielding timestamped chunks and the Resource Timing
    entry; `upload(size, onProgress, signal)` resolving to the telemetry JSON; `ws()` for the echo;
    `probe(path, signal)` for HTTP probes with their timing entry, aborted by the signal (the
    loaded-latency fallback aborts a probe after 30 s,
    [../measurement.md §11.6](../measurement.md#116-probe-bookkeeping)); `info()`.

  Production wires the browser implementations; tests wire fakes that replay a synthetic timeline
  ([testing.md §2](testing.md#2-engine-tests-with-synthetic-timelines)).
- **Browser wiring.** `clock.ts`, `transport.ts` and `worker.ts` are the only engine files that
  use the browser globals the engine bans; what they compute from browser values lives in
  `wiring.ts`, tested on plain values.
  - The busy time sums the Worker's own tasks, each timed with `performance.now()`: timer
    callbacks, message handling, the XHR, WebSocket and progress callbacks themselves, and for each
    download chunk the time from the read resolving to the next read, which is the engine handling
    it. The engine's continuations after an upload, probe or `GET /info` answer are not timed; they
    are a few per request, so leaving them out can only lower the fraction slightly.
  - The timer resolution is the median of about 20 consecutive differences between distinct
    `performance.now()` readings, sampled once per Worker for at most 50 ms; a clock that changes
    less than twice in that window reports 50 ms.
  - A request's Resource Timing entry is the earliest entry with its URL that started at or
    after the request was sent, since requests to one URL repeat; a missing `nextHopProtocol` is
    read as empty, not reported. The browser may add the entry after the response, so a request
    that ended without one waits for it, watching for new entries, with the two patiences of
    [../measurement.md §11.6](../measurement.md#116-probe-bookkeeping), one `TimingWaiter` each
    per transport: downloads and uploads wait up to 50 ms (`TIMING_WAIT_MS`) and, once one missed
    the bound, are not waited for again until an entry is found at once; probes wait up to 250 ms
    (`TIMING_PROBE_WAIT_MS`), once while the browser has reported no probe entry yet, then every
    time. The probe and upload answers and the end of a download body are delivered after that
    wait, so the short bound keeps a stream from idling, and a browser that never reports timing
    costs each waiter a single wait. The buffer holds 2000 entries and is cleared when full, which
    can cost a few requests their timing.
  - Every path sits under the configured base path on the page's origin; the WebSocket takes the
    `ws:` or `wss:` scheme matching the page. `client.browser` comes from a table of families
    (Edge, Opera, Samsung Internet, Firefox, Chrome, Safari) and systems (iOS, Android, ChromeOS,
    Windows, macOS, Linux), anything else `unknown` with major version 0; the user-agent string
    itself is never kept.
- **Pure statistics.** Bucketing, watermark, warm-up, ramp, TM95, grade and AIM scoring are pure
  functions over data, unit-tested in isolation.
- **Type checking.** The engine is type-checked on its own with `exactOptionalPropertyTypes`, so
  an optional field of a message or the result is either present or absent, never `undefined`.
  The application's program turns that option off: Vue's prop types and the copied shadcn-vue
  components pass optional props on as possibly `undefined`. Both programs are strict otherwise.

## 3. Worker Bundling With Vite

- The UI creates the Worker with
  `new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })`; Vite emits it
  as a separate hashed chunk under `assets/`, same-origin, so the CSP's `worker-src 'self'` and
  COEP are satisfied.
- Module Workers are supported by every target browser (current Chromium, Firefox and Safari).
- The engine chunk has no dependency on Vue, Tailwind or component code. Its budget is
  **128 KiB minified**, enforced by the `chunk-size` step of `web.yaml`
  ([build-packaging.md §4](build-packaging.md#4-ci-workflows)); the number, in bytes, lives in
  `.chunk-budget` and is lowered once the engine's real size is known. The v0.3 additions, the
  path B prober, the quality scores and the Continuous retention, stay inside that budget.
- The application's chunks take from the engine only `engine/messages.ts`'s runtime exports
  (`validateResult`, `PRESETS` and `RING_LENGTHS`, §2); the measurement logic itself ships only in
  the Worker chunk.

## 4. State Ownership

| State | Owner | Storage |
| --- | --- | --- |
| A running test (phases, buckets, streams, watermark, samples) | the engine | Worker memory, gone after `result` |
| Live view of a run (gauge, chart series, notices, the Continuous live figures) | `useRun` | component memory, fed by `sample` and `phase` events; fixed-length rings, so a Continuous run's view does not grow with its length |
| User settings | `useSettings` | `localStorage` key `bitgauge.settings.v1`: a sparse object holding only the fields the user set: `theme` and `lang`; `preset`, `phases`, `download` and `upload` (`{minMs, maxMs}`), `dataCapBytes`, `units`, `warmup` (`auto` or milliseconds), `pingCount` and `overheadCompensationPercent`, as the engine's settings hold them; from v0.3 `continuousDirection` (`download` or `upload`) and `runLengthS` (whole seconds, 60–604800; absent means no run length), which the URL's `test` and `duration` map onto under Continuous; `streams` as `{mode, fixed}` only, its maximum always the server's from `GET /info`; `autoStart` as `{enabled, countdownS}`; and `label`, the Settings screen's result label. A reset removes its field, and fields it does not know are kept as they are. The effective settings are the URL parameters over the stored fields over the server defaults ([../ui/url-params.md](../ui/url-params.md)). `useTheme` keeps writing `theme` there, as it did in v0.1, which had no Settings screen |
| Server defaults and info for display | `useInfo` | memory; `GET /info` fetched by the UI once for display and again on Retry, and by the engine at each start |
| Result history | `useHistory` and `history/` | IndexedDB (§5) |

There is no global store library: composables with module-level reactive state are enough for five
screens, and TanStack Query is not used ([decisions.md](decisions.md)).

## 5. History Module (`idb`)

- **Database.** Name `bitgauge`, IndexedDB version 1, one object store `results` with key path
  `id`, and indexes `startedAt` and `label`. One database per origin
  ([../edge-cases.md §8](../edge-cases.md#8-different-origins-give-separate-histories)).
- **Two versions.** The IndexedDB version changes only when stores or indexes change (upgrade in
  `onupgradeneeded`). The **record** version is the result's `schemaVersion`
  ([../measurement.md §17](../measurement.md#17-result-object)); older records are migrated forward
  when read, and written back in the current version when edited.
- **Persistence.** On first save the module calls `navigator.storage.persist()` where available.
- **Retention.** None: a result stays until the user deletes it or clears the history. The
  History header shows the count and, where `navigator.storage.estimate()` exists, the usage.
- **Delete and undo.** Deleting removes the records at once; the undo toast, shown for 8 s, puts
  the same records back. Clear all has no undo.
- **Export formats.**
  - JSON: `{ "format": "bitgauge.history", "formatVersion": 1, "exportedAt": "…", "results":
    [ …result objects… ] }`, including series, client IPs and notes. The v0.1 Test screen's
    single-result Download JSON uses the same format with one entry, so its serializer ships in
    v0.1 without IndexedDB ([../ui/screens.md §1](../ui/screens.md#1-test-home--)).
  - CSV: one row per result, UTF-8 without a byte order mark, a header row, lines ended by CRLF and
    fields quoted as RFC 4180 does (a field holding a comma, a quote, CR or LF is quoted, its quotes
    doubled); an absent value is an empty field. A text field that starts with `=`, `+`, `-`, `@`, a
    tab or CR gets a leading `'`, so a spreadsheet does not read it as a formula. Columns `id`,
    `startedAt`, `label`, `contextLabel`, `note`, `status`, `preset`, `protocol`, `clientIp`,
    `browser` (name, major version and OS as one text value), `serverName`, `serverVersion`,
    `downloadBitsPerSecond`, `downloadPeakBitsPerSecond`, `downloadStatus`, `downloadConfidence`,
    `uploadBitsPerSecond`, `uploadPeakBitsPerSecond`, `uploadStatus`, `uploadConfidence`,
    `idleMedianMs`, `idleP90Ms`, `jitterMs`, `idleLossPercent`, `downloadLoadedMedianMs`,
    `uploadLoadedMedianMs`, `bufferbloatGrade`, and from v0.3 (in place of v0.2's `rpm` and
    `rpmState`, never filled before v0.3) `downloadRpm`, `downloadRpmState`, `uploadRpm`,
    `uploadRpmState`, `downloadMinBitsPerSecond`, `downloadMaxBitsPerSecond`,
    `uploadMinBitsPerSecond`, `uploadMaxBitsPerSecond`, then `streamingBand`, `gamingBand`,
    `rtcBand`, `overheadCompensationPercent`, `dataUsedBytes`, `durationMs`. The RPM and its state
    are per direction, as `responsiveness` is; the minimum and maximum are a Continuous direction's
    and empty otherwise; every column is empty when its value is absent. Series, samples and events
    are omitted. The columns changed before any release that shipped CSV, so no CSV migration
    exists.
  - **Scope.** Each format exports either every result or the results matching the current History
    filter; the export menu states which, with the count.
  - **File names.** `bitgauge-history-<YYYY-MM-DD>-<HHMM>.json` or `.csv`, after the export moment
    in the browser's local time.
- **Import.** JSON only, at most 10 MB (10 000 000 bytes); text is rendered as text, never as
  HTML ([../security.md §7](../security.md#7-browser-only-history-and-privacy)). The file is
  refused as a whole when it is larger, is not JSON, or is not `format: "bitgauge.history"` with
  `formatVersion: 1`. Each record is then checked on its own: a higher `schemaVersion` than the
  current one, or a record the result validator rejects, is rejected by its position in `results`
  with the reason; a record whose `id` is already stored is skipped. The records are checked one
  at a time, yielding to the page after each, so the History screen counts them with a progress
  bar and Cancel stops the import; nothing is written until every record is checked, so a
  cancelled import leaves history as it was. The import ends with a summary
  `{added, skipped, rejected[]}`, each rejected entry its position and reason.
- **Unavailable storage** disables history for the session
  ([../edge-cases.md §7](../edge-cases.md#7-indexeddb-unavailable-private-mode)).

## 6. Charts, Gauge and Share Image

- **uPlot** draws the live throughput chart (download series; upload `received` and faint `sending`
  lines), optional loaded-latency series, per-phase charts in the result detail, where each
  direction's loaded-latency samples are a second axis in milliseconds of its throughput chart, and
  the history trend. Unknown buckets are `null` and render as gaps. Phase separators and event
  marks are drawn with uPlot hooks from the result's `events`. The live chart draws warm-up
  samples over a shaded band, since they are still in memory; in the result detail, warm-up is a
  hatched,
  empty interval ending at `warmupEndMs`, because warm-up samples are not stored, and the table
  view follows the row rules of [../ui/screens.md §2](../ui/screens.md#2-result-detail--resultid).
  For Continuous runs the live chart keeps fixed rings of the engine's `RING_LENGTHS`, fed by each
  `sample`'s native buckets and closed `cells`, and picks the tier by the run's elapsed time
  (native up to 10 min, hour up to 60 min, day up to 24 h, long beyond), which keeps at most about
  2000 points in view ([../measurement.md §15](../measurement.md#15-continuous-mode)).
  - **Live rings.** Every live structure of a run is a fixed ring allocated at its phase start,
    each keeping the absolute index of its first cell, since upload cells start far from 0 on the
    server timeline. A bounded direction's buckets hold `ceil((maxMs + 5000) / 100)` cells, the
    5 s covering the upload grace; its upload `sendingTrace` the same; its live pings
    `ceil((maxMs + 5000) / 300)`. A Continuous direction's buckets hold `RING_LENGTHS.native`
    and its live pings 2000, beside the tier rings.
  - **Loaded overlay per tier.** Four overlay rings fed in parallel from the direction's start:
    native, the raw pings, the last 2000; hour, 2 s bins, 1800; day, 1 min bins, 1440; long,
    10 min bins, 1008. A bin's value is the true median of its pings, taken when it closes from a
    scratch buffer of the open bin (at most 2000 pings at the 300 ms cadence). The chosen tier's
    overlay ring is drawn as it is, never re-binned.
  - **Anchoring and re-binning.** The chart builder starts each segment at
    `max(min(origin, firstBucket), evictedBefore)`, `evictedBefore` being the ring's lowest
    absolute index not yet overwritten, `-Infinity` until it has overwritten anything: before any
    eviction the anchoring is the bounded one, an upload's leading unknown cell included; after
    it the built arrays start at the oldest retained cell, `x` keeps the elapsed time, and sending
    and latency points before the start are dropped. A Continuous tier of n cells is drawn as at
    most 2000 points, k = ⌈n / 2000⌉ adjacent cells summed (bytes and known time, a native bucket
    counting a known 100 ms), each point's rate bytes × 8 / known time, unknown with no known
    time. Bounded runs are never re-binned, so their chart output is unchanged.
- **Gauge.** Hand-rolled SVG: a logarithmic arc whose window of four decades follows the value
  as [../measurement.md §14](../measurement.md#14-units-and-gauge) specifies, ticks per decade,
  a recent-range band, the peak tick and, at completion, an inner arc for upload. The needle and
  window shifts animate with CSS transforms, disabled under `prefers-reduced-motion`. Every value,
  including the live average and peak, comes from the engine's `sample` messages; the one thing
  the gauge decides is its own window, which it derives from those values with the §14 rule (a
  pure function in the component's code, not in the engine). The numeric readout is not a live
  region; announcements go through the separate region of
  [../ui/i18n-a11y.md §2.1](../ui/i18n-a11y.md#21-live-region-for-the-gauge).
- **Share image.** Rendered client-side on a 1200 × 630 `<canvas>`, always in the dark theme, with
  the dark palette's tokens and the embedded fonts, loaded first through `document.fonts.load`;
  exported with `toBlob()` as PNG and downloaded through a `blob:` URL. Each number keeps its
  qualifier: a direction status other than `measured`, a confidence other than `normal`, a
  non-zero overhead compensation, a loaded-latency source other than the WebSocket and an increase
  over idle latency measured on the other path. The copied summary holds the same lines as text,
  in the page's language. A Continuous result is one direction block, its headline without a peak
  ([../../design_system/components/share-panel.md](../../design_system/components/share-panel.md)).
  The HTTP loaded responsiveness and the quality scores are never on the share image or in the
  copied summary. Content rules are in
  [../security.md §7](../security.md#7-browser-only-history-and-privacy).

## 7. i18n

- vue-i18n in Composition API mode; one directory per language in `i18n/locales/`, holding one
  JSON file per screen whose single top-level key is that screen's namespace (`app.json` for the
  header and navigation, `test.json`, `history.json`, `result.json`, `settings.json`,
  `about.json`); English as the source and fallback; non-default locales lazy-loaded.
- Numbers, units and dates go through `Intl` with the active locale; the engine returns raw numbers
  and enum codes only, never text.
- The ESLint vue-i18n plugin flags raw strings in templates and missing keys, as in Runhold.

Details: [../ui/i18n-a11y.md](../ui/i18n-a11y.md).

## 8. Theming Hook

- Visual design comes from the Claude Design export in
  [../../design_system/README.md](../../design_system/README.md); shadcn-vue defaults cover what
  the export does not, and nothing visual is hand-authored.
- `styles/` imports the export's `colors_and_type.css` and maps its tokens into Tailwind 4 `@theme`
  variables; components use only those tokens. It imports the export's `base.css`, the element
  defaults (body type and line height, links, focus, selection), into Tailwind's base layer after
  the preflight, so every utility still overrides them.
- Light and dark themes switch with `data-theme="light"` or `data-theme="dark"` on `<html>`, the
  attribute the export's tokens key on, defaulting to the system preference; the `theme` URL
  parameter, the Settings screen and the header's theme toggle override it.
- The logo, favicons, app icons and web manifest come from the export's `assets/`. Claude Design
  embeds a C2PA provenance manifest in every SVG (`<metadata>` plus an `http://c2pa.org/manifest`
  namespace) and PNG (a `caBX` chunk), about 6–8 KB per file, more than a small icon's image data.
  The export keeps them, since it is never hand-edited; the web build strips them when it copies the
  assets, so the shipped files carry image data only and no external URL reaches the dist URL
  allowlist ([build-packaging.md §4](build-packaging.md#4-ci-workflows)).

## 9. Demo Build

- **Entry.** `VITE_DEMO=1` selects a demo Worker entry, `web/src/demo/worker.ts`, in place of
  `engine/worker.ts`: the same message loop (`engine/loop.ts`) and the same `Run`, on a demo clock
  and against a simulated link, so the UI shows real engine output without a server. Production
  builds contain none of it. `useWorker.ts` starts the engine's Worker, or under
  `import.meta.env.VITE_DEMO` imports `demo/start.ts`, which starts the demo's; commands posted
  meanwhile wait for it. The demo's constructor cannot sit beside the engine's: Vite bundles a
  Worker for every `new Worker(new URL(..., import.meta.url))` in a module it loads, dead branch or
  not, while a dynamic import in a branch the flag removes is never loaded. `api/info.ts` answers
  `GET /info` from the chosen scenario behind the same flag, `composables/useHistory.ts` opens
  the history from the panel's History variant behind it, and `App.vue` loads the panel behind
  it. `scripts/check-dist-demo-free.sh`, run by `web.yaml`'s build step, fails when a built dist
  holds any of the demo's sentinels: its storage key `bitgauge-demo`, `DEMO_SCENARIOS`,
  `Basement NAS` and `demo/worker`; a demo build fails it, which is its negative control.
- **Builds.** `npm run dev:demo` (`make web-demo`) and `npm run build:demo` (`make web-build-demo`,
  into `web/dist-demo/`, which never ships) set the flag.
- **Simulated link** (`demo/link.ts`, `demo/pacer.ts`, `demo/connections.ts`, `demo/transport.ts`,
  with the probes and `GET /info` in `demo/probes.ts`).
  Per direction, the requests in flight share a bottleneck's goodput equally, each up to an
  optional per-request ceiling, moved every 10 ms of demo time as counts, not bytes. When the
  Worker is busy and the pacer fires late, a download's bytes for the longer stretch arrive as one
  chunk per 10 ms of it, each stamped with its own simulated arrival, so they count in the 100 ms
  buckets they crossed and not all in the latest. A download's first byte arrives one round trip
  after it is sent; an upload's first byte reaches the server half a round trip after it is sent,
  and its answer, half a round trip after its last byte, carries the telemetry of
  [../wire-protocol.md §4](../wire-protocol.md#4-upload-telemetry) counted on a 100 ms server grid
  whose origin differs from the client clock's. The WebSocket echo and the probes answer one
  jittered round trip later, stamped with that simulated arrival, since a timer fires no earlier
  than the browser's floor of a few milliseconds, which would lengthen a LAN round trip; every
  simulated instant the transport reports is floored to the clock's resolution, as a reading of the
  clock would be. **Under load** a link's queue fills: each link has, per direction, a loaded
  delay `loaded: {downloadMs, uploadMs, tauMs}`, and while a direction has requests in flight,
  every round trip the link simulates (the echo and the probes) gains `loaded × (1 − e^(−t/τ))`,
  with `loaded` that direction's delay and `t` the time since its requests began to be in flight;
  with none in flight the delay is gone. A request's own round trip to its first byte gains it only
  while another request of its direction is moving, whose bytes hold the queue: with none moving
  the queue is empty, and two streams that end together would otherwise both wait a loaded round
  trip, idling the link and swinging the steady window. The LAN links' delays are 15 ms on
  download and 39 ms on upload, the VPN link's 114 ms and 262 ms, the kit's fixture numbers, all
  with τ = 1000 ms: a VPN queue filling more slowly leaves a run stopped in its download or upload
  near grade B's bound, where the kit's grades C. The HTTP/1.1 link holds the browser's six
  connections per origin: a request or probe beyond six in flight waits, first come first served,
  until one is free. `GET /info` answers with the scenario's fixture and the current epoch; its
  client is 192.168.1.42, a private address suggested as LAN, on the LAN links, and 100.101.4.17,
  a CGNAT address suggested as VPN ([../wire-protocol.md §5](../wire-protocol.md#5-get-apiv1info)),
  on the VPN link. A link can
  lose each request with a probability, fail every request from an instant, restart (a new epoch
  from an instant; the WebSocket closes with 1001 while requests in flight drain, as a graceful
  shutdown lets them) or become unreachable (requests in flight fail, the WebSocket closes with
  1006, nothing answers, and once the run has ended on it the page's `GET /info` fails too).
  Every random draw comes from one seeded generator, seeded by the run's number in its scenario,
  so a scenario plays the same way each time.
- **Demo clock** (`demo/clock.ts`): the wiring's clock run `speed` times faster; optionally a
  coarser timer, to whose multiples every reading is floored and which is reported as the
  resolution, not cross-origin isolated; optionally a busy share of 95 %, above the CPU-bound
  threshold of [../measurement.md §16](../measurement.md#16-confidence-and-notices). It can hold:
  time stops and no timer fires, so a screen stays in one state until the next scenario replaces
  the session.
- **Scenarios** (`demo/scenarios.ts`, `demo/fixtures.ts`, played by `demo/session.ts`). The scenario
  names are the UI kit's `TEST_STATES`, the four Continuous states (`continuous`, `cont-upload`,
  `cont-warmup` and `cont-done`) from v0.3 on, and its panel's loaded-latency cases: `ws-close`
  (the WebSocket closing after idle latency) and `ll-<reason>` for each reason of its `LL_GAPS`,
  which a test reads from `App.jsx`, and `upload-gap`, the run its Result detail shows
  (`ResultDetail.jsx`). Each is a link, whether the run starts at once, the URL parameters the
  page applies, and a script: a user stop, a failure, a WebSocket a proxy drops or a hold, each at
  an instant after a phase starts
  as the run's own `phase` events report it, at the kit's own defaults (`cancelled` stops 3.1 s into
  upload, `download` holds 7.5 s into download). A user stop is the page's: the session asks the
  page to press Stop, so the run ends through the page's own stop path, as when the user presses it.
  A failure is of the kind the demo panel selects: every request
  failing, the server unreachable, a restart, or a network change sent as the `network` command; a
  scenario may fix its own kind, and for failing requests how many upload requests fail, as
  `error-early` does with a server that stops answering during idle latency, which [../ui/flows.md
  §5](../ui/flows.md#5-error-mid-test) ends as `network changed` once the WebSocket closes,
  `upload-interrupted` with every request failing from 12 s into upload, and `upload-gap` with one
  upload request failing 10.4 s into the LAN upload, which over HTTP/2 carries on with that
  request's time left out as unknown. The fixtures are the kit's: "Basement NAS" over the LAN at
  612 Mbit/s down and 438 Mbit/s up, 3.1 ms and HTTP/2, with a ceiling per request of 110 Mbit/s
  down and 80 Mbit/s up, so that each trial gains and the ramp reaches six streams, plateau `cap`,
  in both directions; the same LAN over HTTP/1.1 for the
  upload-interrupted state, where the first failed upload request ends the upload
  ([../measurement.md §7.5](../measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)),
  and for the ws-fallback state, whose HTTP latency fallback therefore runs reserved and reports
  `http-h1-reserved` ([../measurement.md §11.2](../measurement.md#112-path-a-fallback--http-probe));
  over a VPN at 640 kbit/s and 210 kbit/s with 48 ms; and the 20 kbit/s and 19 kbit/s link of the
  insufficient-data state. A dropped WebSocket closes the open echo while the server and its
  requests stay up; from then on a new one is refused or, for `ll-no-probe-path`, left
  unanswered, so the close sequence of
  [../measurement.md §11.4](../measurement.md#114-loaded-latency-statistics-and-availability) runs
  to its timeout. `ws-close` drops it 3 s into download on the LAN, so loaded latency
  carries on over the HTTP/2 probe; `ll-reservation-broken` 3 s into upload on the HTTP/1.1 LAN,
  giving the upload two sources; `ll-insufficient-samples` 14 s into upload, a second before its
  15 s minimum, leaving the later source a handful of samples. A complete result has a steady
  window in each direction and none as short as the close sequence, so `ll-no-steady-window`
  stops 3.1 s into upload, before its window, and `ll-no-probe-path` drops the WebSocket 9.7 s into
  the LAN download, which ends at its 10 s minimum, and stops 0.8 s into upload, while the close
  sequence still covers it. A run is dated by the page's wall clock: the page sends its time with
  the scenario, and the Worker dates its runs from it, so a page whose clock is fixed, as the parity
  harness fixes it at the kit's instant, dates them from that instant.
- **Panel** (`demo/DemoPanel.vue`, its Test screen, History and Result detail sections in
  `demo/panel/`, with `demo/choice.ts` and `demo/control.ts`). The kit's Demo
  state panel as far as the app goes, collapsed by default: the scenario, the speed (1×, 2×, 4×),
  a forced state, a CPU-bound Worker, the error kind, the timer resolution (0.1 ms or 1 ms), the
  History variant and the Result detail's download and upload confidence, in the kit's own words,
  not translated, since it never ships. A forced
  state plays that state's scenario and holds it; "follow run" plays the chosen scenario without
  its hold. The choice is kept in `localStorage` under `bitgauge-demo` and applied by loading the
  page again with the scenario's URL parameters, so every scenario starts from a fresh page: the
  panel hands the choice to each demo Worker, to the page's `GET /info` (unreachable for
  `offline`) and to the page's history, and presses Start for a scenario that starts, and Stop
  when its script stops the run, as a user would.
- **Confidence** (`demo/confidence.ts`). The one place the demo sets a value the engine did not
  find: the kit's Result detail chooses each direction's confidence (`CONF_OPTS` in `App.jsx`:
  normal, low for one or two reasons, CPU-bound), which a link cannot be made to reach on demand.
  "normal" leaves the engine's own; any other choice replaces, on the run's finished result, the
  confidence of a direction that has a number, with the matching `low-confidence` notice in place
  of the engine's, so the Test screen's result, its Result detail and its share show the chosen
  state. The live events of the run keep the engine's.
- **History variants** (`demo/history.ts`). The kit's History variants the History screen's states
  need: `populated` replaces the browser's history with the kit's eight results over a VPN (the
  rows of `History.jsx`, each a valid result, with a stored steady window and loaded-latency
  samples per measured direction for the Result detail, graded as the engine grades them),
  `single` with one of them taken today, a fresh install's first result, `empty` with none,
  `unavailable` opens no database, so history is unavailable for the page load, and `loading`
  never finishes opening it, so the screen stays loading; "stored" leaves the browser's history
  as it is. The page writes the results itself (`composables/useHistory.ts`);
  the demo module only holds them.
- **Boundaries.** The demo's Worker-side files, `src/demo/**/*.ts`, follow the engine's import
  policy extended by `@/demo/`: framework-free, no DOM library, no application code; like
  `engine/worker.ts`, `demo/worker.ts` alone reaches the Worker's globals, which the engine's
  banned-globals rule keeps out of every other demo file; `control.ts`, `choice.ts` and `start.ts`
  run in the page under the same policy, `choice.ts` reading and writing the storage the panel
  hands it. `DemoPanel.vue` and the section components of `demo/panel/` follow the application's
  policy. Every demo file
  obeys the production file ceiling of `.file-budgets`.
- **v0.3 additions.** The demo grows with the v0.3 features, so the kit's v0.3 states play on the
  real engine, and its panel takes the kit's v0.3 controls (`App.jsx`):
  - **Continuous scenarios.** The kit's four Continuous states, `continuous` (a Continuous
    download running), `cont-upload` (a Continuous upload running, with failure gaps),
    `cont-warmup` (a Continuous run stopped during its warm-up, `partial`) and `cont-done` (a
    finished Continuous download), each a scenario like the others.
  - **Fast-forward.** A Continuous scenario runs the demo clock at a fast-forward rate of its
    own, on top of the panel's speed, so a run the kit shows after tens of minutes reaches that
    state in about a minute; the rate is a property of the scenario and changes no rule of the
    engine. The fast-forward's own load is not the device's: a fast-forwarded scenario reports a
    busy share of 0 unless the panel's CPU-bound is on, so it never raises `cpu-bound`. At that
    rate the browser's clamp of a nested timer to a few milliseconds would stretch each short wait
    by a quarter of a second of demo time, so the clock runs each due timer in a task of its own,
    at its instant; it slows to the panel's speed for the last 2 s before a scripted stop or hold,
    which then lands on its instant; and the page takes the Worker's messages, about a thousand a
    second, once per animation frame, so it renders once per batch.
  - **Link fixture.** A LAN link at 921 Mbit/s over HTTP/2, the kit's Continuous fixture
    (`TestScreen.jsx`), with the LAN's loaded delays.
  - **Test screen controls.** "Responsiveness" with the kit's five options (`RESP_OPTS`), each
    mapped onto the link: `ok` reports `h2`; `uncertain` makes the link's probes open a new
    connection (their timing shows `connectStart ≠ connectEnd`); `needs-h2` reports `http/1.1`;
    `not-reported` reports an empty protocol; `few-samples` starves `/small` during upload only,
    leaving path B too few samples there ([../measurement.md §12.4](../measurement.md#124-states)).
    It replaces separate protocol, new-connection and starvation controls, and `h3` is not offered.
    "Continuous run length", none or 2 h, sets `duration=7200` on the Continuous scenarios.
  - **History control.** "Compare B", `h1` or `h2 · measured`: the second compared result's
    download path B over HTTP/1.1 (`unavailable_h1`), or over HTTP/2 and `measured`.
  - **Result detail controls.** "Kind" (standard or continuous), "Continuous length" (2 h or
    9 days) and "Responsiveness" (the same five options, applied to the run its Result detail
    shows). The 2 h and 9-day Continuous results are demo fixtures built to pass `validateResult`
    and scored with the engine's own `result/scores.ts`, not played runs: 9 days cannot be played.
  - **About layer switches.** The panel turns each `compat` flag of the scenario's `GET /info` on
    or off, all on by default as in the kit, so the About screen's snippets show per layer
    ([../wire-protocol.md §5](../wire-protocol.md#5-get-apiv1info)). The demo never fakes the
    page's scheme: it is served over http, so its About always shows the HTTPS note, the parity
    harness drives the kit with `aboutInsecure: true`, and the https case is a component test.

## Related

- [Architecture](../architecture.md)
- [Measurement methodology](../measurement.md)
- [UI structure](../ui/README.md)
- [Testing](testing.md)
- [Recommended stack](stack.md)
