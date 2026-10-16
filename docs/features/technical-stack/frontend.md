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
      messages.ts             command and event types shared with the UI
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
    styles/                   Tailwind entry, design tokens from the design export
```

Pages orchestrate, components render, composables hold state, `api/` talks to the server, and
`engine/` measures. Nothing outside `engine/` measures anything.

## 2. Engine Package Rules

- **No DOM, no Vue, no imports from application code.** `engine/` may import only from itself and
  from the generated API types. An ESLint `no-restricted-imports` rule enforces the boundary in
  both directions: the app may import only `engine/messages.ts` and the Worker URL.
- **Message schema.** All traffic between the UI and the Worker uses the discriminated unions in
  `engine/messages.ts` ([../architecture.md §4](../architecture.md#4-engine--ui-message-contract)).
  `loop.ts` holds the message loop and `worker.ts` only wires it to the Worker's messages; every
  rule lives in plain modules. Besides the
  types, `engine/messages.ts` has one runtime export, `validateResult`, re-exported from
  `engine/result/validate.ts`: the structural check of the result object
  ([../measurement.md §17](../measurement.md#17-result-object)), so the application validates a
  result before exporting it without importing engine internals.
- **Synthetic clock injection.** The engine never calls `performance.now()`, `setTimeout`,
  `fetch`, `XMLHttpRequest` or `WebSocket` directly. It receives two interfaces:
  - `Clock`: `now()`, `setTimer(ms, fn)`, `clearTimer(id)`, `busyMs()` (the time spent in the
    Worker's own tasks, for the busy fraction of
    [../measurement.md §16](../measurement.md#16-confidence-and-notices)), and `resolutionMs` and
    `crossOriginIsolated` ([../edge-cases.md §9](../edge-cases.md#9-clock-and-timer-resolution));
  - `Transport`: `download(size, signal)` yielding timestamped chunks and the Resource Timing
    entry; `upload(size, onProgress, signal)` resolving to the telemetry JSON; `ws()` for the echo;
    `probe(path)` for HTTP probes with their timing entry; `info()`.

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
    that ended without one waits up to 50 ms for it, watching for new entries: the probe and
    upload answers and the end of a download body are delivered after that wait. A browser that
    missed the bound once is not waited for again until an entry is found at once, so one that
    never reports timing costs a single wait. The buffer holds 2000 entries and is cleared when
    full, which can cost a few requests their timing.
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
  `.chunk-budget` and is lowered once the engine's real size is known.

## 4. State Ownership

| State | Owner | Storage |
| --- | --- | --- |
| A running test (phases, buckets, streams, watermark, samples) | the engine | Worker memory, gone after `result` |
| Live view of a run (gauge, chart series, notices) | `useRun` | component memory, fed by `sample` and `phase` events |
| User settings | `useSettings` | `localStorage` key `bitgauge.settings.v1`; overridden by URL parameters ([../ui/url-params.md](../ui/url-params.md)); in v0.1, which has no Settings screen, `useTheme` writes its one field, `theme`, and keeps any other field as it is |
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
- **Export formats.**
  - JSON: `{ "format": "bitgauge.history", "formatVersion": 1, "exportedAt": "…", "results":
    [ …result objects… ] }`, including series, client IPs and notes. The v0.1 Test screen's
    single-result Download JSON uses the same format with one entry, so its serializer ships in
    v0.1 without IndexedDB ([../ui/screens.md §1](../ui/screens.md#1-test-home--)).
  - CSV: one row per result, UTF-8 with a header row; columns `id`, `startedAt`, `label`,
    `contextLabel`, `note`, `status`, `preset`, `protocol`, `clientIp`, `browser` (name, major
    version and OS as one text value), `serverName`, `serverVersion`,
    `downloadBitsPerSecond`, `downloadPeakBitsPerSecond`, `downloadStatus`, `downloadConfidence`,
    `uploadBitsPerSecond`, `uploadPeakBitsPerSecond`, `uploadStatus`, `uploadConfidence`,
    `idleMedianMs`, `idleP90Ms`, `jitterMs`, `idleLossPercent`, `downloadLoadedMedianMs`,
    `uploadLoadedMedianMs`, `bufferbloatGrade`, `rpm`, `rpmState`, `streamingBand`, `gamingBand`,
    `rtcBand`, `overheadCompensationPercent`, `dataUsedBytes`, `durationMs`. Series, samples and
    events are omitted.
  - **Scope.** Each format exports either every result or the results matching the current History
    filter; the export menu states which, with the count.
- **Import.** JSON only, at most 10 MB; validated against the schema; records with an unknown higher
  `schemaVersion` are rejected with a message; duplicates by `id` are skipped; text is rendered as
  text, never as HTML ([../security.md §7](../security.md#7-browser-only-history-and-privacy)).
- **Unavailable storage** disables history for the session
  ([../edge-cases.md §7](../edge-cases.md#7-indexeddb-unavailable-private-mode)).

## 6. Charts, Gauge and Share Image

- **uPlot** draws the live throughput chart (download series; upload `received` and faint `sending`
  lines), optional loaded-latency series, per-phase charts in the result detail and the history
  trend. Unknown buckets are `null` and render as gaps. Phase separators and event marks are
  drawn with uPlot hooks from the result's `events`. The live chart draws warm-up samples over a
  shaded band, since they are still in memory; in the result detail, warm-up is a hatched,
  empty interval ending at `warmupEndMs`, because warm-up samples are not stored, and the table
  view follows the row rules of [../ui/screens.md §2](../ui/screens.md#2-result-detail--resultid).
  For Continuous runs the chart picks the retention tier that keeps at most about 2000 points in
  view ([../measurement.md §15](../measurement.md#15-continuous-mode)).
- **Gauge.** Hand-rolled SVG: a logarithmic arc whose window of four decades follows the value
  as [../measurement.md §14](../measurement.md#14-units-and-gauge) specifies, ticks per decade,
  a recent-range band, the peak tick and, at completion, an inner arc for upload. The needle and
  window shifts animate with CSS transforms, disabled under `prefers-reduced-motion`. Every value,
  including the live average and peak, comes from the engine's `sample` messages; the one thing
  the gauge decides is its own window, which it derives from those values with the §14 rule (a
  pure function in the component's code, not in the engine). The numeric readout is not a live
  region; announcements go through the separate region of
  [../ui/i18n-a11y.md §2.1](../ui/i18n-a11y.md#21-live-region-for-the-gauge).
- **Share image.** Rendered client-side on a `<canvas>` with the embedded fonts, exported with
  `toBlob()` as PNG (the format is an open question tracked in
  [../open-questions.md](../open-questions.md)), downloaded through a `blob:` URL. Content rules are
  in [../security.md §7](../security.md#7-browser-only-history-and-privacy).

## 7. i18n

- vue-i18n in Composition API mode; one directory per language in `i18n/locales/`, holding one
  JSON file per screen whose single top-level key is that screen's namespace (`app.json` for the
  header and navigation, `test.json`, `about.json`, `notAvailable.json`); English as the source
  and fallback; non-default locales lazy-loaded.
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
  `GET /info` from the chosen scenario behind the same flag, and `App.vue` loads the panel behind
  it. `scripts/check-dist-demo-free.sh`, run by `web.yaml`'s build step, fails when a built dist
  holds any of the demo's sentinels: its storage key `bitgauge-demo`, `DEMO_SCENARIOS`,
  `Basement NAS` and `demo/worker`; a demo build fails it, which is its negative control.
- **Builds.** `npm run dev:demo` (`make web-demo`) and `npm run build:demo` (`make web-build-demo`,
  into `web/dist-demo/`, which never ships) set the flag.
- **Simulated link** (`demo/link.ts`, `demo/pacer.ts`, `demo/transport.ts`). Per direction, the
  requests in flight share a bottleneck's goodput equally, each up to an optional per-request
  ceiling, moved every 10 ms of demo time as counts, not bytes. When the Worker is busy and the
  pacer fires late, a download's bytes for the longer stretch arrive as one chunk per 10 ms of it,
  each stamped with its own simulated arrival, so they count in the 100 ms buckets they crossed and
  not all in the latest. A download's first byte arrives one round trip after it is sent; an
  upload's first byte reaches the server half a round trip after it is sent, and its answer, half a
  round trip after its last byte, carries the telemetry of
  [../wire-protocol.md §4](../wire-protocol.md#4-upload-telemetry) counted on a 100 ms server grid
  whose origin differs from the client clock's. The WebSocket echo and the probes answer one
  jittered round trip later, stamped with that simulated arrival, since a timer fires no earlier
  than the browser's floor of a few milliseconds, which would lengthen a LAN round trip; every
  simulated instant the transport reports is floored to the clock's resolution, as a reading of the
  clock would be. `GET /info` answers with the scenario's fixture and the current epoch; its client
  is 192.168.1.42, a private address suggested as LAN, on the LAN links, and 100.101.4.17, a CGNAT
  address suggested as VPN ([../wire-protocol.md §5](../wire-protocol.md#5-get-apiv1info)), on the VPN
  link. A link can
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
  names are the UI kit's `TEST_STATES` that v0.1 has, all but `continuous`, `cont-warmup` and
  `cont-done`; a test reads them from `App.jsx`. Each is a link, whether the run starts at once, the
  URL parameters the page applies, and a script: a user stop, a failure or a hold, each at an
  instant after a phase starts as the run's own `phase` events report it, at the kit's own defaults
  (`cancelled` stops 3.1 s into upload, `download` holds 7.5 s into download). A user stop is the
  page's: the session asks the page to press Stop, so the run ends through the page's own stop
  path, as when the user presses it. A failure is of the kind the demo panel selects: every request
  failing, the server unreachable, a restart, or a network change sent as the `network` command; a
  scenario may fix its own kind, as `error-early` does with a server that stops answering during
  idle latency, which [../ui/flows.md
  §5](../ui/flows.md#5-error-mid-test) ends as `network changed` once the WebSocket closes, and
  `upload-interrupted` does with every request failing from 8.2 s into upload. The fixtures are the
  kit's: "Basement NAS" over the LAN at 612 Mbit/s down and 438 Mbit/s up, 3.1 ms and HTTP/2, with
  a 110 Mbit/s ceiling per request so that the ramp settles on six streams; the same LAN over
  HTTP/1.1 for the upload-interrupted state, where the first failed upload request ends the upload
  ([../measurement.md §7.5](../measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark));
  over a VPN at 640 kbit/s and 210 kbit/s with 48 ms; and the 20 kbit/s and 19 kbit/s link of the
  insufficient-data state. `GET /info` answers what the server would send: both client addresses are
  private, so the suggested label is LAN for each.
- **Panel** (`demo/DemoPanel.vue`, with `demo/control.ts`). The v0.1 part of the kit's Demo state
  panel, collapsed by default: the scenario, the speed (1×, 2×, 4×), a forced state, a CPU-bound
  Worker, the error kind and the timer resolution (0.1 ms or 1 ms), in the kit's own words, not
  translated, since it never ships. A forced state plays that state's scenario and holds it; "follow
  run" plays the chosen scenario without its hold. The choice is kept in `localStorage` under
  `bitgauge-demo` and applied by loading the page again with the scenario's URL parameters, so every
  scenario starts from a fresh page: the panel hands the choice to each demo Worker and to the
  page's `GET /info` (unreachable for `offline`), and presses Start for a scenario that starts, and
  Stop when its script stops the run, as a user would.
- **Boundaries.** The demo's Worker-side files, `src/demo/**/*.ts`, follow the engine's import
  policy extended by `@/demo/`: framework-free, no DOM library, no application code; like
  `engine/worker.ts`, `demo/worker.ts` alone reaches the Worker's globals, which the engine's
  banned-globals rule keeps out of every other demo file; `control.ts` and `start.ts` run in the
  page under the same policy. `DemoPanel.vue` follows the application's policy. Every demo file
  obeys the production file ceiling of `.file-budgets`.

## Related

- [Architecture](../architecture.md)
- [Measurement methodology](../measurement.md)
- [UI structure](../ui/README.md)
- [Testing](testing.md)
- [Recommended stack](stack.md)
