# Architecture

[Feature index](README.md) / Architecture

BitGauge is one Go binary that serves an embedded Vue SPA and a small HTTP API. All measuring
happens in the browser, in a framework-free engine running in a Web Worker; the server streams,
drains, echoes and describes itself. This page shows how the pieces fit. The stack is in
[technical-stack/stack.md](technical-stack/stack.md); endpoint contracts are in
[wire-protocol.md](wire-protocol.md); the methodology is in [measurement.md](measurement.md). All
packages and paths named here are **planned** until v0.1 implements them;
[`../STATUS.md`](../STATUS.md) says what exists.

## 1. One Binary

```text
                                 ┌─────────── bitgauge (one static Go binary) ───────────┐
 browser ──TLS/h2──▶ reverse ──HTTP/1.1──▶ net/http ─▶ middleware ─▶ chi router         │
 (SPA + Worker)      proxy       │                                    ├─ SPA (embed.FS)  │
                     (Traefik,   │                                    ├─ /api/v1/*       │
                      Caddy,     │                                    ├─ compat groups   │
                      nginx)     │                                    └─ /metrics        │
                                 └───────────────────────────────────────────────────────┘
```

- One process, one image, one port (8080). Subcommands: `serve` (the default) and `healthcheck`.
- No database, no files written, no outbound connections, no background jobs beyond the HTTP
  server itself.
- The SPA is built by Vite at image build time and embedded with `embed.FS`; the binary has no
  runtime dependency on Node.

## 2. Request Path

```text
browser ─▶ proxy: TLS, HTTP/2 or HTTP/1.1, X-Forwarded-For
        ─▶ BitGauge net/http server (plain HTTP/1.1, read-header and idle timeouts)
        ─▶ middleware chain
             1. panic recovery
             2. client IP (trusted proxies only)
             3. security headers: on SPA responses the full set (CSP, COOP/COEP/CORP,
                Referrer-Policy, …); on every response, API and compat included,
                X-Content-Type-Options: nosniff; CORS per route group
             4. structured logging (debug level only) and Prometheus instrumentation
             5. rate limiting (throughput route groups only)
        ─▶ chi router mounted at server.base_path
             ├─ SPA group:        /, /result/{id}, /history, /settings, /about, /assets/*,
             │                    and the root assets: /favicon.svg, /favicon-16.png,
             │                    /favicon-32.png, /apple-touch-icon.png, /icon-192.png,
             │                    /icon-512.png, /icon-512-maskable.png, /site.webmanifest
             ├─ native API group: /api/v1/{download,upload,ping,small,ws,info}
             ├─ compat groups:    OpenSpeedTest, LibreSpeed, networkQuality (each optional)
             └─ operations:       /metrics (optional)
        ─▶ handlers
```

The exact middleware order and handler rules are in
[technical-stack/backend.md](technical-stack/backend.md); client IP derivation in
[security.md §4](security.md#4-client-ip-and-trusted-proxies).

## 3. SPA Embedding and Base Path

- Vite emits `index.html` plus content-hashed assets under `assets/`. The Go package that owns the
  embed exposes them read-only.
- `index.html` is a template. Once, at startup, the server substitutes `server.base_path` into the
  asset URLs and into `<meta name="bitgauge-base-path">`, and keeps the result in memory. No
  `<base href>` and no inline script are used, so the CSP stays strict
  ([edge-cases.md §20](edge-cases.md#20-base-path-mismatches)).
- The SPA router uses HTML5 history mode with the base path as its base. The server answers
  `index.html` only for the fixed list of SPA routes, never as a catch-all, so compatibility routes
  are never shadowed ([compatibility.md §1.5](compatibility.md#15-route-clash-analysis)).
- Hashed assets are cacheable forever; `index.html` is `no-cache`. Assets may be embedded
  precompressed (Brotli, gzip) and served when `Accept-Encoding` allows.
- The design export's root assets are served from the base path itself, as its README requires:
  `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`,
  `icon-512.png`, `icon-512-maskable.png` and `site.webmanifest`. They are an explicit file list
  in the SPA group's routes, never a catch-all, with `Cache-Control: public, max-age=86400`, since
  their names are not content-hashed.

## 4. Engine ↔ UI Message Contract

The measurement engine runs in a dedicated Web Worker. It has no DOM, no Vue and no imports from
application code; the UI talks to it only through typed messages defined in one shared module
(`web/src/engine/messages.ts`). Both directions are discriminated unions on `type`.

**Commands (UI → engine):**

| Message | Payload | Effect |
| --- | --- | --- |
| `configure` | resolved settings (preset, phases, streams, durations, data cap, units, warm-up, ping count, overhead compensation), optional override of the URL parameters' settings, base path | Resolves the override over the settings, validates and stores them for the next run; answered by `settings` with what it stored, or by `error` if invalid. |
| `start` | optional settings override (with the result's label, the context label and the URL parameters ignored), `visible` flag | Starts a run with the configured settings. The engine's own Info phase then calls `GET /api/v1/info`; that response, fetched at the start of this run, is the only source of the epoch and limits the run uses ([measurement.md §1](measurement.md#1-phases-and-order)). The UI may fetch `/info` separately for display, but never hands it to the engine. |
| `stop` | — | Stops the run as a user stop: in-flight requests aborted, partial result emitted. |
| `visibility` | `visible: boolean` | Forwards `visibilitychange` ([edge-cases.md §5](edge-cases.md#5-tab-hidden-mid-test)). |
| `network` | `event: 'offline' \| 'type-changed'` | Forwards the page's `offline` event and changes of `navigator.connection.type`, the two network signals of [edge-cases.md §6](edge-cases.md#6-network-change-mid-test); the run ends with the `network-changed` error. |

The Worker keeps the last valid `configure`: an invalid one is answered with `invalid-settings`
and changes nothing, and a `start` before any valid `configure` fails the same way. One run is in
progress at a time; a `start` meanwhile is ignored, and `stop`, `visibility` and `network` with no
run in progress do nothing. A run that fails inside the engine, a defect rather than any of the
error codes below, is reported as the Worker's uncaught error, which reaches the `error` event of
the page's `Worker` object; the next `start` may begin another run.

**Events (engine → UI):**

| Message | Payload | Used for |
| --- | --- | --- |
| `settings` | scope (`configured` or `run`), the resolved settings | The settings shown before a run (`configured`, answering each valid `configure`) and during and after it (`run`, sent as a run starts, its override applied). |
| `phase` | phase name (`info`, `idle`, `download`, `upload`), state (`started`, `finished`, `skipped`, `failed`), protocol, stream count, notices so far; a `finished` idle latency, download or upload, and a `failed` download or upload, carries its part of the result object, the `idle` or direction object the result will report, so its tile shows at once; a `failed` phase carries how long it ran (display only) | Phase indicator, connection info, the headline announced as a direction finishes ([ui/i18n-a11y.md §2.1](ui/i18n-a11y.md#21-live-region-for-the-gauge)), the download's share of the data used while upload runs ([ui/screens.md §1](ui/screens.md#1-test-home--)). |
| `sample` | direction; a **range** of newly known buckets (`fromBucket` plus `values[]`); for upload, the current window end; gauge value; upload `sending` value; the steady-window average and peak so far (absent while warming up; Continuous adds "p90, last hour"); the warm-up end and, for upload, P_start and the sample's instant on the server grid (display only); the stream count the ramp has reached; how long its phase has run on the client clock (display only); latest loaded-latency samples; data used | Live gauge, tiles and chart, at most every 100 ms. |
| `idle` | the path (`websocket` or `http`); pings answered or lost so far, of the ping count (the warm-up ping included); the last RTT; the running median, min, p90 and jitter of the samples so far and their probe-timeout share; how long its phase has run on the client clock (display only) | The idle-latency gauge in milliseconds, ping counter, live tiles and latency samples chart, after each ping. |
| `result` | the versioned result object ([measurement.md §17](measurement.md#17-result-object)) | Result screen, history, export. |
| `error` | code, message key, phase, whether partial results exist | Error states and retry ([ui/flows.md](ui/flows.md)). |

```ts
// Shape sketch, not code to copy.
type PhaseName = 'info' | 'idle' | 'download' | 'upload';

type EngineCommand =
  | { type: 'configure'; settings: TestSettings; override?: ConfigureOverride; basePath: string }
  | { type: 'start'; override?: SettingsOverride; visible: boolean }
  | { type: 'stop' }
  | { type: 'visibility'; visible: boolean }
  | { type: 'network'; event: 'offline' | 'type-changed' };

type EngineEvent =
  | { type: 'settings'; scope: 'configured' | 'run'; settings: TestSettings }
  | { type: 'phase'; phase: PhaseName; state: PhaseState; protocol?: string; streams?: number;
      headlineBitsPerSecond?: number;  // a finished direction with a number: the result's headline
      bytes?: number;                  // a finished or failed direction: the result's bytes for it
      notices: Notice[] }
  | { type: 'sample'; direction: Direction;
      fromBucket: number;              // download: client bucket index; upload: server grid cell
      values: (number | null)[];       // bytes per bucket; null = unknown (failure gap)
      windowEnd?: number;              // upload only: current W_end on the server grid
      gauge: number; sending?: number;
      steady?: { avgBitsPerSecond: number; peakBitsPerSecond: number;
                 peakLastHourBitsPerSecond?: number };  // absent during warm-up
      warmupEndBucket?: number;        // once warm-up has ended, on the same axis as fromBucket
      startBucket?: number;            // upload only: P_start on the server grid, in cells
      sendingBucket?: number;          // upload only: this instant on the grid, by the offset
      loadedLatencyMs?: number[]; dataUsedBytes: number }
  | { type: 'idle'; pings: number; count: number;  // pings answered or lost, of the count
      rttMs?: number; medianMs?: number }          // the last RTT; the running median
  | { type: 'result'; result: Result }
  | { type: 'error'; code: EngineErrorCode; messageKey: string; phase?: PhaseName;
      partial: boolean };
```

**Sample ranges.** On download, buckets are on the client timeline (index from the phase start)
and each `sample` usually carries the one or two buckets completed since the last message. On
upload, buckets are server grid cells, and cells become known in batches: when a request confirms,
the window end jumps forward by about one request's worth of cells, and the next `sample` carries
all newly confirmed cells at once (`values` entries inside a failure gap are `null`). The live
`sending` line comes from `upload.onprogress` on the client timeline and is drawn with the
display-only offset of [measurement.md §7.4](measurement.md#74-common-timeline-and-aggregation):
since the UI does not share the Worker's clock, the engine applies the offset itself and sends
each upload `sample`'s own instant on the server grid as `sendingBucket`, in fractional cells,
with `startBucket`, the phase start P_start on the same grid; both are absent until a request has
confirmed, because there is no offset before. Once warm-up has ended, every `sample` carries
`warmupEndBucket`, the bucket (download) or cell (upload) where it ended, which bounds the live
chart's warm-up band. All three are display-only and feed no number.

**Error codes.** The `error` event's `code` is one of `invalid-settings` (a `configure` or
`start` whose settings fail validation), `requests-failed` (three consecutive failed requests,
[measurement.md §5](measurement.md#5-adaptive-duration)), `network-changed`, `server-restarted`
and `server-unreachable` (the causes of [ui/flows.md §5](ui/flows.md#5-error-mid-test)). Its
`messageKey` is `errors.<code>`, the catalog key the UI words it with. A notice carries a code of
[measurement.md §16](measurement.md#16-confidence-and-notices) with the raw values it names.

**Settings resolution.** An override replaces the configured value of each field it sets, and
may also carry `durationMs` (the `duration` URL parameter,
[ui/url-params.md §2](ui/url-params.md#2-parameters)). A `configure` override carries the URL
parameters' settings and is resolved over the settings it comes with, which are then stored as
the configured settings; a `start` override is resolved over the configured settings for that run
only, and may also carry the result's `label`, the `contextLabel` and `ignoredParameters`, the
URL parameters whose values the page ignored: the run carries a `url-parameter-ignored` notice
for each, from its first `phase` event to the result. An override that selects another preset
takes that preset's durations, ping count and stream mode from
[measurement.md §8.5](measurement.md#85-presets) unless it sets them too (a fixed count no larger
than the configured maximum): the durations and ping count in the configured settings belong to
the configured preset. `durationMs` sets both directions' maximum to it and their minimum to the
smaller of the minimum and it. The resolved settings are checked against the ranges of
[configuration.md §2.3](configuration.md#23-test-defaults), the `duration` range of the URL
parameter (5–600 s for the bounded presets), the 64-character `label` and the parameter names of
the URL parameters' table, each at most once; Continuous is not a v0.1 preset. Any invalid value
fails the `configure` or `start` with `invalid-settings`. The `settings` event gives the UI the
outcome, which it shows rather than resolving presets itself: after a valid `configure` with
scope `configured`, and as a run starts with scope `run`, without the labels.

The engine takes an injectable clock and transport, so tests drive it with synthetic timelines
([technical-stack/testing.md](technical-stack/testing.md)). The transport's `info()` returns the
`GET /info` answer together with the browser's family, major version and operating system, which
the wiring parses from the user agent for `client.browser`
([measurement.md §17](measurement.md#17-result-object)): the engine never reads `navigator`.

**Run sequence.** The Info phase calls `GET /info`, opens the WebSocket (or falls back to
`GET /api/v1/ping` with the `websocket-unavailable` notice) and sends the one idle
`GET /api/v1/small`, whose answer only records the protocol in v0.1. A `phase` event marks each
measuring phase `skipped` when the settings leave it out, and again when a stop, an error or the
data cap prevents it. While idle latency runs, an `idle` event follows each answered or lost ping:
the warm-up ping counts toward `pings` but carries no RTT, a lost ping carries none either, and
`medianMs` is the running median the timeout policy uses, absent before the first sample; an idle
latency restarted after a pause counts from the first ping again. While a throughput phase runs,
the housekeeping tick sends at most one `sample` per 100 ms. A run in which no phase has a result
to keep (stopped or failed during Info or idle latency) emits no `result`; one that ends in Info
marks Info `failed` on an error and every measuring phase `skipped`. A page the browser paused
while hidden stops the run as [edge-cases.md §5](edge-cases.md#5-tab-hidden-mid-test) describes. A
WebSocket close that the close sequence survives during idle latency restarts it on the new path,
like a page that becomes visible again; the sequence's timeout uses the running idle median. When
the run ends with a network change or a restart, the current direction reports nothing measured:
no window, warm-up or series, its stop mark is an `error` event, and a restart adds the
`server-restarted` notice, whichever path detected it. Commands after the run has ended are
ignored.

**The end of a run, as the UI reads it.** No event marks the end of a run; `useRun` reads it from
the order above. Each measuring phase gets exactly one `finished`, `failed` or `skipped` event,
except idle latency when a stop interrupts it, which gets none; Info gets `finished`, `failed` or,
when a stop interrupts it, nothing. A `result` follows the last `phase` event exactly when one
measuring phase is `finished`. The run has ended for the UI when its `result` arrives, or when
every measuring phase has had its event, idle latency excepted once the UI has sent `stop`, and
none is `finished`: an `error` before it makes the run's end an error with nothing to keep, and a
stop returns the screen to Idle ([ui/flows.md §4](ui/flows.md#4-cancel-mid-test)). A `phase`
event or a `result` that arrives after the UI has already returned to Idle, from a phase that
finished just before the stop reached the Worker, still applies, and the result is shown. A
`start` the Worker refuses is answered by an `invalid-settings` `error` with no `phase` event
before or after it, and that error ends the run. An `invalid-settings` that answers a `configure`
arrives with no run in progress; the UI keeps it until its next `configure`, and a `start` meanwhile
ends at once with that error, because the Worker would run its last valid settings instead of the
ones the screen shows. The Worker's uncaught `error` during a run ends it with no result
([ui/flows.md §5](ui/flows.md#5-error-mid-test)); outside a run it means the Worker failed to load
or to start, and every later `start` ends at once the same way.

## 5. Data Flow

### 5.1 Download

```text
Worker (stream k)                        proxy                      BitGauge
  │ fetch GET /api/v1/download?bytes=N ───▶│──────────────────────────▶│ write N bytes from the
  │                                        │                           │ random buffer (no alloc)
  │◀── chunk ──────────────────────────────│◀──────────────────────────│
  │ t = performance.now(); S_down[bucket(t)] += chunk.length; discard chunk
  │◀── chunk … last chunk ─────────────────│◀──────────────────────────│
  │ request done: rate_s, next size; issue next request on stream k immediately
```

Every chunk lands in a client-side 100 ms bucket; the series is exact and live
([measurement.md §6](measurement.md#6-download-mechanics)).

### 5.2 Upload (Grid-Aligned Server Arrival Counts)

```text
Worker (stream k)                        proxy                      BitGauge
  │ t_send; XHR POST /api/v1/upload ──────▶│──── body (streamed) ─────▶│ for each read:
  │   upload.onprogress ─▶ gauge only      │                           │   cell = grid(now)
  │                                        │                           │   counts[cell] += n
  │                                        │                           │ body fully drained
  │◀── 200 {epoch, bucketMs, firstBucket, buckets[], bytes, startMs, durationMs} + Server-Timing: bg-recv ──│
  │ t_done; validate bytes and epoch; S_up[firstBucket + i] += buckets[i]
  │ recompute watermark C and window end W_end; issue next request on stream k
```

The per-request counts exist only while the body is read. The client sums them on the shared
server grid; cells after `W_end` stay `unknown`
([measurement.md §7](measurement.md#7-upload-mechanics)).

### 5.3 Latency: Two Probe Paths

```text
Path A — WebSocket echo (idle latency, loaded latency, bufferbloat grade)
  Worker ── {"type":"ping","seq":n,"t":…} ──▶ /api/v1/ws ── {"type":"pong","seq":n,"t":…} ──▶ Worker
           every 300 ms under load; up to 4 outstanding; RTT = arrival − t
  fallback: GET /api/v1/ping (204), single-outstanding, Resource Timing; 5-stream reservation on h1

Path B — HTTP loaded responsiveness (RPM-style), h2/h3 only
  Worker ── GET /api/v1/small ──▶ (multiplexed with the load on the shared connection, unverifiable)
           every 300 ms, single-outstanding; http_l = responseStart − requestStart
```

Path B never feeds the grade; path A never feeds RPM
([measurement.md §11–§12](measurement.md#11-latency-under-load)).

## 6. In-Memory State Inventory

Everything the server holds, all of it in memory and gone on restart:

| State | Size | Lifetime | Purpose |
| --- | --- | --- | --- |
| Random buffer | 4 MiB, generated at startup | process | Source of every download body (written in slices). |
| Epoch and grid origin | two values | process | Upload telemetry; restart detection. |
| Rendered `index.html` and embedded assets | the SPA build | process | Serving the SPA. |
| Effective configuration | small | process | Read once at startup. |
| Rate-limit table | ≤ `limits.tracked_clients` entries | sliding, evicted LRU | Per-IP stream, request, WebSocket and flow counters. |
| Prometheus counters | fixed set, no per-client labels | process | `/metrics`. |
| Per-request upload arrival counts | ≤ 1201 integers | one request | Returned in the response, then dropped. |
| Open connections (HTTP, WebSocket) | bounded by limits | one connection | Echo has no per-connection state beyond the socket. |

**Explicitly not kept:** results, result history, per-client history, which requests belong to
which test, client IPs beyond the rate-limit table's sliding window, request bodies, upload
telemetry after the response, access logs (request logging exists only at `debug` level and goes
to stdout, never to a file).

## 7. History Storage in the Browser

- History lives in IndexedDB, through the `idb` wrapper, in one database per origin
  (`bitgauge`, planned object store `results` keyed by result `id`, indexed by `startedAt` and
  `label`).
- Records are the versioned result object; the schema version is stored per record and migrated
  forward on read or import ([measurement.md §17](measurement.md#17-result-object)).
- Export writes JSON (full records) or CSV (flattened); import accepts JSON only, validates it and
  deduplicates by `id` ([security.md §7](security.md#7-browser-only-history-and-privacy)).
- The engine never touches storage; the UI's history module does, after a `result` event.
- When IndexedDB is unavailable, history is disabled for the session
  ([edge-cases.md §7](edge-cases.md#7-indexeddb-unavailable-private-mode)).

## 8. Compatibility Layers as Router Groups

Each layer is a chi sub-router built by its own package and mounted only when its toggle is on.
A layer translates a third-party contract onto shared building blocks (the random-buffer writer,
the body drainer, the client IP, the rate limiter) and adds its own headers and paths. Layers
cannot reach into the native handlers' telemetry, and the native API never depends on a layer
([compatibility.md](compatibility.md)).

```text
router (base_path)
 ├─ web.Routes()            SPA, always (package web/)
 ├─ handlers.Routes()       /api/v1, always (package internal/handlers)
 ├─ openspeedtest.Routes()  if compat.openspeedtest.enabled
 ├─ librespeed.Routes()     if compat.librespeed.enabled
 ├─ nq.Routes()             if compat.networkquality.enabled
 └─ metrics.Handler()       if metrics.enabled, at metrics.path
```

## 9. Planned Package Layout

The Go side follows Runhold's conventions: one command, everything else under `internal/`, small
packages with one job each. The SPA lives in `web/`, whose Go file embeds the build output. Details
per package are in [technical-stack/backend.md](technical-stack/backend.md) and
[technical-stack/frontend.md](technical-stack/frontend.md).

```text
cmd/bitgauge/                 main: serve (default) and healthcheck subcommands
internal/
  buildinfo/                  version, commit, build date (ldflags)
  config/                     koanf loading, defaults, fail-closed validation
  logger/                     small slog wrapper (text/json, level)
  server/                     http.Server, middleware chain, router assembly, graceful shutdown
  handlers/                   native API: download, upload (grid counting), ping, small, ws, info
  clientip/                   trusted-proxy client IP derivation
  ratelimit/                  bounded per-IP limiter
  metrics/                    Prometheus collectors
  compat/
    openspeedtest/            /downloading, /upload
    librespeed/               /garbage, /empty, /getIP, variants, server list
    nq/                       /nq/*, /.well-known/nq
api/
  openapi.yaml                native API contract
web/
  embed.go                    //go:embed of dist/, index.html templating
  src/
    engine/                   framework-free measurement engine (Worker)
    api/                      generated OpenAPI types, fetch helpers
    components/  components/ui/  composables/  pages/  router/  i18n/  history/  styles/
```

## Related

- [Measurement methodology](measurement.md)
- [Wire protocol](wire-protocol.md)
- [Compatibility layers](compatibility.md)
- [Security model](security.md)
- [Technical stack](technical-stack/README.md)
- [Backend design](technical-stack/backend.md)
- [Frontend design](technical-stack/frontend.md)
