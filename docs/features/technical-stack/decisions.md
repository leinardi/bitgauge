# Technical Decisions

[Feature index](../README.md) / [Technical Stack](README.md) / Technical Decisions

## Stack Decisions to Avoid

- Full Nuxt application, Nuxt routing, SSR, or any frontend-server behaviour.
- A React rewrite unless Vue becomes a blocker.
- Any database, ORM or migration tool on the server.
- Any outbound network client in the server, or any external URL in the SPA.
- Server-side storage of results, in any form.
- Measurement logic inside Vue components or stores.
- Copying code or assets from OpenSpeedTest, LibreSpeed or any other speed test.
- Fudge factors, hidden smoothing or any number the result does not explain.
- ECharts or other heavy chart libraries.
- GraphQL, ConnectRPC or other RPC layers for a six-endpoint API.

## Locked Technical Decisions

Decided before v0.1 implementation starts.

### 1. Delivery — One Go 1.26 binary with the SPA embedded

Module `github.com/leinardi/bitgauge`. The Vue SPA is built at image build time and embedded with
`embed.FS`; one binary, one container image, one port. Simple to deploy next to other homelab
services, nothing to keep in sync between a frontend and a backend deployment.

**Not chosen:** separate frontend container or static hosting (two artefacts and a CORS setup for
no benefit).

### 2. Server state — Stateless; history in the browser only

No database, no disk writes, no volume, read-only configuration. In-memory state is limited to the
items in [architecture.md §6](../architecture.md#6-in-memory-state-inventory). Result history exists
only in the browser (IndexedDB), with JSON/CSV export and JSON import. This removes a whole class
of privacy, backup and migration concerns and makes the container trivially safe to run read-only.

**Not chosen:** SQLite (or any) server-side history (state, volumes, migrations, and results
leaving the browser).

### 3. HTTP and API — `net/http` + `go-chi/chi`, REST + OpenAPI 3

Plain HTTP and JSON under `/api/v1`; the contract is `api/openapi.yaml`, and the SPA's types are
generated with `openapi-typescript`. chi gives route groups and middleware on top of `net/http`
without hiding the `ResponseWriter` the throughput handlers need.

**Not chosen:** ConnectRPC/gRPC (codegen and framing for six endpoints); heavier frameworks that
abstract the response writer.

### 4. Throughput transport — HTTP requests, timed by the browser (download) and the server (upload)

Download and upload are ordinary HTTP requests through the user's proxy, so the measurement covers
the same path the user's traffic takes. Server-side TCP statistics are unavailable behind a reverse
proxy.

**Not chosen:** a WebSocket throughput transport like ndt7 (it measures a different transport than
the user's HTTP traffic and needs message-level framing); server-side `TCP_INFO` (behind a proxy it
describes the proxy-to-server hop, not the user's link).

### 5. Configuration — `knadh/koanf`

YAML file plus `BITGAUGE_` environment overrides with `__` as the nesting separator, exactly like
Runhold; defaults < file < env; fail-closed validation ([configuration.md](../configuration.md)).

**Not chosen:** Viper (heavier, case-insensitive keys); flags-only configuration (not IaC-friendly).

### 6. Logging — `internal/logger` package (slog wrapper)

`log/slog` with a small wrapper for format and level, as in Runhold. Logs go to stdout/stderr only.

**Not chosen:** zerolog/zap (no need beyond slog).

### 7. Metrics — Prometheus `client_golang`, root `/metrics`, off by default

Server-side counters only; path configurable; disabled unless enabled, because it is
unauthenticated. Root placement follows Prometheus convention and Runhold, not `/api/v1`.

**Not chosen:** `/api/v1/metrics` (mixes an operations endpoint into the versioned API).

### 8. WebSocket — `coder/websocket`

Minimal, context-aware, maintained; used only for the latency echo at `/api/v1/ws`.

**Not chosen:** `gorilla/websocket` (heavier API surface for a ping/pong echo).

### 9. Lint policy — golangci-lint v2 with `default: all`

Every linter enabled, with justified, documented exclusions only, as in Runhold.

### 10. Frontend — Vue 3 + Vite + TypeScript + Tailwind 4 + shadcn-vue (Reka UI)

Plus `@lucide/vue`, vue-i18n and vue-sonner, as in Runhold. Plain Vite SPA with Vue Router; no
Nuxt, no SSR. Testing uses **vitest** (unit, component and engine tests) and **Playwright**
(end-to-end and the accuracy harness driver), as in Runhold ([testing.md](testing.md)).

**Not chosen:** Nuxt (routing and server features BitGauge does not need); React; Jest or Cypress
(a second toolchain beside Vite).

### 11. Server state on the client — no TanStack Query

The SPA makes one `GET /api/v1/info` call per run and has no server state to cache, invalidate or
refetch. A plain typed `fetch` helper is enough. Can be revisited if the API grows.

**Not chosen:** TanStack Query (adds a cache layer with nothing to cache).

### 12. Measurement engine — Framework-free TypeScript in a Web Worker

No DOM, no Vue, no imports from application code; typed messages only
([architecture.md §4](../architecture.md#4-engine--ui-message-contract)); injectable clock and
transport so it is unit-testable with synthetic timelines. The Worker keeps measurement timing off
the main thread.

**Not chosen:** engine on the main thread (UI rendering distorts timing); engine inside Vue
composables (untestable without a DOM).

### 13. Upload measurement — Server-timed with grid-aligned arrival counts

The server counts bytes per 100 ms cell of a global grid while draining each body and returns the
counts; the headline is computed only from confirmed counts
([measurement.md §7](../measurement.md#7-upload-mechanics)). Uploads use XHR in the Worker for
`upload.onprogress`, which drives the gauge only.

**Not chosen:** client-side upload measurement (send buffers make it overestimate badly on slow
links); `fetch` upload progress (no cross-browser upload progress; streaming request bodies need
HTTP/2 and are not universally supported).

### 14. Request sizing — Adaptive, 64 KiB start, 1 s target, growth at most 8×

16 KiB floor, server cap 256 MiB per request by default
([measurement.md §3](../measurement.md#3-adaptive-request-size)).

**Not chosen:** fixed request sizes (never complete at sub-Mbit rates or waste time on overhead at
multi-Gbit rates).

### 15. Streams — Auto ramp 1 → 2 → 4 → 6, max 6

Baseline, trial, settle, compare with a 5 % gain rule; modes auto, fixed N and single; the cap
drops to 5 while the HTTP/1.1 probe reservation is active
([measurement.md §4, §8](../measurement.md#4-adaptive-stream-count)).

### 16. Warm-up — Hybrid with guards

Ends on ramp settled, meaningful observations, stability and a minimum elapsed time, with a cap
that yields `confidence: low` ([measurement.md §8.3](../measurement.md#83-warm-up-end)).

**Not chosen:** a fixed warm-up time (wrong at one end of the range); stability alone (false
positives during startup).

### 17. Headline — Steady-window average; p90 of buckets as "peak"

Bytes ÷ time over the full 100 ms buckets after warm-up
([measurement.md §9](../measurement.md#9-final-value)).

Decided by the user on 2026-10-08.

**Not chosen:** request-percentile headline (with parallel streams a request sees a share of the
link, not the link).

### 18. Overhead compensation — Default 0, shown when non-zero

LibreSpeed's factors are offered as presets only.

**Not chosen:** a non-zero default factor such as 1.06 or 1.04 (the headline would then include an
assumption the user did not choose).

### 19. Latency probes — WebSocket echo plus a separate HTTP responsiveness probe

300 ms schedule; path A (WebSocket echo, HTTP fallback with reservation rules) grades bufferbloat;
path B (`GET /api/v1/small`, h2/h3 only) gives HTTP loaded responsiveness labelled as not
verifiable ([measurement.md §11–§12](../measurement.md#11-latency-under-load)). `/api/v1/small` is
an addition to the native API for this purpose; `/ping` stays 204.

### 20. Bufferbloat grade — Waveform thresholds

A+ < 5 ms, A < 30, B < 60, C < 200, D < 400, F ≥ 400 ms of added latency, worse direction.

### 21. Quality scores — Cloudflare AIM point tables

Packet loss fixed at 0 points and labelled "not measured"
([measurement.md §13](../measurement.md#13-quality-scores)).

### 22. Presets — Quick, Standard, Extended, Continuous

Durations and ping counts per [measurement.md §8.5](../measurement.md#85-presets).

### 23. Charts — uPlot for time series; hand-rolled SVG gauge

uPlot draws 100 ms series on canvas cheaply; the gauge is small enough to own. The share image is
also rendered client-side without a library; its format is open decision 3 (current answer: Canvas
to PNG, [open-questions.md](../open-questions.md)).

**Not chosen:** ECharts (large bundle for two charts).

### 24. History wrapper — `idb`

Small, typed, promise-based IndexedDB wrapper; the schema is simple enough not to need more.

**Not chosen:** Dexie (larger API and bundle than needed).

### 25. TLS — At the reverse proxy only

BitGauge speaks plain HTTP; TLS, HTTP/2 and HTTP/3 are the proxy's job
([deployment-example.md](../deployment-example.md)).

**Not chosen:** own TLS termination (certificate management inside a stateless, read-only
container).

### 26. Image — Multi-stage build on `dhi.io/static`

Node stage builds the SPA, Go stage builds a static binary, runtime is `dhi.io/static` as user
`65532:65532`, no shell, read-only root filesystem, `healthcheck` subcommand
([build-packaging.md](build-packaging.md)).

### 27. Platforms — linux/amd64 and linux/arm64 only

`dhi.io/static` has no arm/v7; arm64 covers Raspberry Pi 3, 3B+, 4, 5 and Zero 2 W on a 64-bit OS.

**Not chosen:** armv7 now (possible later via `gcr.io/distroless/static-debian12` for that platform
only).

### 28. Registry and supply chain — GHCR only, cosign keyless, SBOM, provenance

Dependabot weekly (`gomod`, `npm`, `docker`, `github-actions`, `pre-commit`) and a scheduled
weekly rebuild. Trivy scans every platform image in `release.yaml` and `rebuild.yaml` before
anything is pushed, and the release binaries carry build provenance attestations
([release.md](../../release.md)). GHCR only was decided by the user on 2026-10-08; Trivy gating,
binary attestations and the build-before-tag release model on 2026-10-09.

**Not chosen:** Docker Hub (a mirror can be added later if users ask).

### 29. Default listen port — 8080

8080 is the conventional unprivileged alternative HTTP port, so the binary needs no capability to
bind it as user `65532`, and it is what most homelab proxies expect for an HTTP upstream. Decided by
the user on 2026-10-08.

**Not chosen:** port 80 (needs `CAP_NET_BIND_SERVICE` or root); OpenSpeedTest's 3000/3001 (no
reason to inherit them, since compatibility is by route, not by port).

### 30. Compatibility layers — Off by default, one toggle each

Each layer adds routes, and two of them answer with `Access-Control-Allow-Origin: *`, so enabling
one is a deliberate choice the operator makes for a client they actually use. Off by default keeps
the default surface to the SPA and the native API ([principles.md
§2.8](../principles.md#28-small-surface)). Decided by the user on 2026-10-08.

**Not chosen:** layers on by default (wider surface and CORS `*` routes nobody asked for); one
toggle for all layers (enables CORS `*` routes for an operator who only wanted networkQuality).

### 31. Multi-server selection — Dropped

A test always runs against the server that served the page. Decided by the user on 2026-10-08.

**Not chosen:** a server list with lowest-latency selection (complexity and a `server` URL parameter
for a single-server homelab tool).

### 32. Licence — GPL-3.0-or-later

Used consistently in the README, the image label and source headers. Decided by the user on
2026-10-08.

### 33. Third-party code — Ideas and protocol compatibility only

No OpenSpeedTest or LibreSpeed code or assets; both are credited as inspiration in the README, and
the OpenSpeedTest™ trademark is noted.

## Open Technical Decisions

Each item is tracked, with a recommendation, in [open-questions.md](../open-questions.md).

| # | Decision | Milestone |
| --- | --- | --- |
| 1 | Default drain limit for `/nq/upload` (`compat.networkquality.max_upload_bytes`, currently 1 GiB) | v0.3 |
| 2 | Configurable subnet-to-label mapping for the LAN/VPN context label | v0.2 |
| 3 | Share image format (PNG or SVG) | v0.2 |
| 4 | Upload grace based on the in-flight request's expected duration | v0.1 |
| 5 | Upload failure gaps on HTTP/2 and HTTP/3; phase end on the first failure over HTTP/1.1 | v0.1 |
| 6 | Continuous mode runs a single direction | v0.3 |
| 7 | The info phase cannot be skipped | v0.1 |

## Related

- [Recommended stack](stack.md)
- [Why this stack fits](rationale.md)
- [Roadmap](../roadmap.md)
- [Open questions](../open-questions.md)
- [Measurement methodology](../measurement.md)
