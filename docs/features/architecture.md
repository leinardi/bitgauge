# Architecture

[Feature index](README.md) / Architecture

BitGauge is one Go binary that serves an embedded Vue SPA and a small HTTP API. All measuring
happens in the browser, in a framework-free engine running in a Web Worker; the server streams,
drains, echoes and describes itself. This page shows how the pieces fit. The stack is in
[technical-stack/stack.md](technical-stack/stack.md); endpoint contracts are in
[wire-protocol.md](wire-protocol.md); the methodology is in [measurement.md](measurement.md). All
packages and paths named here are **planned**: no code exists yet.

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
             ├─ SPA group:        /, /result/{id}, /history, /settings, /about, /assets/*
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

## 4. Engine ↔ UI Message Contract

The measurement engine runs in a dedicated Web Worker. It has no DOM, no Vue and no imports from
application code; the UI talks to it only through typed messages defined in one shared module
(`web/src/engine/messages.ts`, planned). Both directions are discriminated unions on `type`.

**Commands (UI → engine):**

| Message | Payload | Effect |
| --- | --- | --- |
| `configure` | resolved settings (preset, phases, streams, durations, data cap, units, warm-up, ping count, overhead compensation), base path | Validates and stores settings for the next run; answered by `error` if invalid. |
| `start` | optional settings override, `visible` flag | Starts a run with the configured settings. The engine's own Info phase then calls `GET /api/v1/info`; that response, fetched at the start of this run, is the only source of the epoch and limits the run uses ([measurement.md §1](measurement.md#1-phases-and-order)). The UI may fetch `/info` separately for display, but never hands it to the engine. |
| `stop` | — | Stops the run as a user stop: in-flight requests aborted, partial result emitted. |
| `visibility` | `visible: boolean` | Forwards `visibilitychange` ([edge-cases.md §5](edge-cases.md#5-tab-hidden-mid-test)). |

**Events (engine → UI):**

| Message | Payload | Used for |
| --- | --- | --- |
| `phase` | phase name (`info`, `idle`, `download`, `upload`), state (`started`, `finished`, `skipped`, `failed`), protocol, stream count, notices so far | Phase indicator, connection info. |
| `sample` | direction; a **range** of newly known buckets (`fromBucket` plus `values[]`); for upload, the current window end; gauge value; upload `sending` value; the steady-window average and peak so far (absent while warming up; Continuous adds "p90, last hour"); latest loaded-latency samples; data used | Live gauge, tiles and chart, at most every 100 ms. |
| `result` | the versioned result object ([measurement.md §17](measurement.md#17-result-object)) | Result screen, history, export. |
| `error` | code, message key, phase, whether partial results exist | Error states and retry ([ui/flows.md](ui/flows.md)). |

```ts
// Shape sketch, not code to copy.
type PhaseName = 'info' | 'idle' | 'download' | 'upload';

type EngineCommand =
  | { type: 'configure'; settings: TestSettings; basePath: string }
  | { type: 'start'; override?: Partial<TestSettings>; visible: boolean }
  | { type: 'stop' }
  | { type: 'visibility'; visible: boolean };

type EngineEvent =
  | { type: 'phase'; phase: PhaseName; state: PhaseState; protocol?: string; streams?: number;
      notices: Notice[] }
  | { type: 'sample'; direction: Direction;
      fromBucket: number;              // download: client bucket index; upload: server grid cell
      values: (number | null)[];       // bytes per bucket; null = unknown (failure gap)
      windowEnd?: number;              // upload only: current W_end on the server grid
      gauge: number; sending?: number;
      steady?: { avgBitsPerSecond: number; peakBitsPerSecond: number;
                 peakLastHourBitsPerSecond?: number };  // absent during warm-up
      loadedLatencyMs?: number[]; dataUsedBytes: number }
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
display-only offset of [measurement.md §7.4](measurement.md#74-common-timeline-and-aggregation).

The engine takes an injectable clock and transport, so tests drive it with synthetic timelines
([technical-stack/testing.md](technical-stack/testing.md)).

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
