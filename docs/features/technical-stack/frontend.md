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
      worker.ts               Worker entry: message loop only
      messages.ts             command and event types shared with the UI
      run.ts, run/, phases/, upload/, download/, latency/, stats/, result.ts, result/
      clock.ts, transport.ts, wiring.ts   browser clock and transport, their pure helpers
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
  `worker.ts` contains only the message loop; every rule lives in plain modules. Besides the
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
  variables; components use only those tokens.
- Light and dark themes switch with `data-theme="light"` or `data-theme="dark"` on `<html>`, the
  attribute the export's tokens key on, defaulting to the system preference; the `theme` URL
  parameter, the Settings screen and the header's theme toggle override it.
- The logo, favicons, app icons and web manifest come from the export's `assets/`. Claude Design
  embeds a C2PA provenance manifest in every SVG (`<metadata>` plus an `http://c2pa.org/manifest`
  namespace) and PNG (a `caBX` chunk), about 6–8 KB per file, more than a small icon's image data.
  The export keeps them, since it is never hand-edited; the web build strips them when it copies the
  assets, so the shipped files carry image data only and no external URL reaches the dist URL
  allowlist ([build-packaging.md §4](build-packaging.md#4-ci-workflows)).

## Related

- [Architecture](../architecture.md)
- [Measurement methodology](../measurement.md)
- [UI structure](../ui/README.md)
- [Testing](testing.md)
- [Recommended stack](stack.md)
