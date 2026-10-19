# Technical Decisions

[Feature index](../README.md) / [Technical Stack](README.md) / Technical Decisions

## Stack Decisions to Avoid

- Full Nuxt application, Nuxt routing, SSR, or any frontend-server behavior.
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

**Not chosen:** separate frontend container or static hosting (two artifacts and a CORS setup for
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
that yields `confidence: low`; the cap waits for a running ramp up to half the phase max
([measurement.md §8.3](../measurement.md#83-warm-up-end)).

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
path B (`GET /api/v1/small`, h2/h3 only) gives HTTP loaded responsiveness labeled as not
verifiable ([measurement.md §11–§12](../measurement.md#11-latency-under-load)). `/api/v1/small` is
an addition to the native API for this purpose; `/ping` stays 204.

### 20. Bufferbloat grade — Waveform thresholds

A+ < 5 ms, A < 30, B < 60, C < 200, D < 400, F ≥ 400 ms of added latency, worse direction.

### 21. Quality scores — Cloudflare AIM point tables

Packet loss fixed at 0 points and labeled "not measured"
([measurement.md §13](../measurement.md#13-quality-scores)).

### 22. Presets — Quick, Standard, Extended, Continuous

Durations and ping counts per [measurement.md §8.5](../measurement.md#85-presets).

### 23. Charts — uPlot for time series; hand-rolled SVG gauge

uPlot draws 100 ms series on canvas cheaply; the gauge is small enough to own. The share image is
also rendered client-side without a library, from a canvas to PNG (resolved; see "Resolved and
removed" in [open-questions.md](../open-questions.md)).

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

The `web` stage (`dhi.io/node`) builds the SPA, the `build` stage (`dhi.io/golang`) builds a
static binary, both dev images; runtime is `dhi.io/static` as user `65532:65532`, no shell,
read-only root filesystem, `healthcheck` subcommand ([build-packaging.md](build-packaging.md)).
Every `dhi.io` base is pinned by an explicit tag, never `latest`, and not by digest: `dhi.io`
republishes its tags with security fixes, so a build picks them up and the release scan checks
what it picked up. The `# syntax=` frontend stays pinned by digest. The `dhi.io` build stages were
decided by the user on 2026-10-09; tag pinning on 2026-10-12, as in gotilert, awtrix-controller and
swarm-scheduler-exporter.

**Not chosen:** digest-pinned `dhi.io` bases (every republish of a tag becomes a Dependabot pull
request, and the security fixes it carries wait for that pull request to merge).

### 27. Platforms — linux/amd64 and linux/arm64 only

`dhi.io/static` has no arm/v7; arm64 covers Raspberry Pi 3, 3B+, 4, 5 and Zero 2 W on a 64-bit OS.

**Not chosen:** armv7 now (possible later via `gcr.io/distroless/static-debian12` for that platform
only).

### 28. Registry and supply chain — GHCR only, cosign keyless, SBOM, provenance

Dependabot monthly (`gomod`, `npm`, `docker`, `github-actions`, `pre-commit`). Trivy scans every
platform image in `release.yaml` before anything is pushed, and the release binaries carry build
provenance attestations. A version tag, git or image, never moves: base-image fixes ship as a new
release, and the release model follows swarm-scheduler-exporter's, which has shipped releases
([release.md](../../release.md)). GHCR only was decided by the user on 2026-10-08; Trivy gating,
binary attestations and the build-before-tag release model on 2026-10-09; dropping the weekly
rebuild on 2026-10-11.

**Not chosen:** Docker Hub (a mirror can be added later if users ask); a scheduled weekly rebuild
of the latest release (it would move `X.Y.Z` to a new digest under a second signing identity,
which breaks the rule that a version tag only ever points at a digest the release workflow
scanned, attested and signed, and no released project runs one).

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

### 32. License — GPL-3.0-or-later

Used consistently in the README, the image label and source headers. Decided by the user on
2026-10-08.

### 33. Third-party code — Ideas and protocol compatibility only

No OpenSpeedTest or LibreSpeed code or assets; both are credited as inspiration in the README, and
the OpenSpeedTest™ trademark is noted.

### 34. Info phase — Always runs

Every later phase needs the server epoch and the limits, and the info phase costs one round trip,
so it cannot be skipped; only idle latency, download and upload can
([measurement.md §1](../measurement.md#1-phases-and-order)). Decided by the maintainer's approval
of the specification on 2026-10-12.

**Not chosen:** a skippable info phase (every measuring phase would need defaults for an epoch and
limits it never received).

### 35. Accuracy harness reference — iperf3 before and after the browser run

iperf3 runs immediately before and immediately after the browser run, each for the steady-window
duration of the preset; a profile whose two runs differ by more than 5 %, or deviate by more than
5 % from the configured goodput (the configured rate less Ethernet, IP and TCP overhead, and less
the share a lossy profile's loss spends on retransmissions), is re-run once and is
**inconclusive** if still unstable, which fails CI
([testing.md §5](testing.md#5-accuracy-harness)). Decided by the maintainer's approval of the
specification on 2026-10-12; the loss term added by the maintainer on 2026-10-16, after the
1 % loss floor profile went inconclusive at 272 kbit/s against 286.9.

**Not chosen:** iperf3 concurrently with the browser (the two would split the link).

### 36. v0.1 harness extraction — Download JSON on the Test screen

The accuracy harness reads a v0.1 result through the Test screen's single-result Download JSON
action, a real user path, with no test-only hook
([ui/screens.md §1](../ui/screens.md#1-test-home--)). Decided by the maintainer's approval of the
specification on 2026-10-12.

**Not chosen:** a machine-readable result element on the Test screen (a test-only surface);
deferring the harness CI tier to v0.2 (v0.1 would ship without automated accuracy evidence).

## Open Technical Decisions

Each item is tracked, with a recommendation, in [open-questions.md](../open-questions.md).

| # | Decision | Milestone |
| --- | --- | --- |
| 1 | Default drain limit for `/nq/upload` (`compat.networkquality.max_upload_bytes`, currently 1 GiB) | v0.3 |
| 2 | Configurable subnet-to-label mapping for the LAN/VPN context label, as `server.labels` | v0.2 |
| 3 | Continuous mode runs a single direction | v0.3 |
| 4 | Unshipped-feature toggles rejected with their milestone, none left in v0.3; empty duration bounds checked as the preset's value | v0.1 |
| 5 | `too_many_streams` as the `429` code of the WebSocket and networkQuality flow limits | v0.1 |
| 6 | A fixed warm-up in `GET /info` as whole milliseconds | v0.1 |
| 7 | Download allocates only the `Content-Length` header value and its slice per request | v0.1 |
| 8 | `bytes_out_of_range` for a zero or negative download `bytes` | v0.1 |
| 9 | An empty upload body answers `200` with empty telemetry timed at handler entry | v0.1 |
| 10 | Linear-interpolation percentiles and a population coefficient of variation over known buckets | v0.1 |
| 11 | Kebab-case notice codes and the five engine error codes | v0.1 |
| 12 | An upload request counts toward the three-request minimum only when all its cells are in the window | v0.1 |
| 13 | Ramp intervals in whole buckets, the upload trial anchored at the added streams' first bytes | v0.1 |
| 14 | Slow-link budgets recomputed on a shared link with per-request RTT gaps | v0.1 |
| 15 | Warm-up conditions read bucket by bucket on known buckets, measured from the series start | v0.1 |
| 16 | Settings overrides and preset switches resolved in the engine; idle-latency warm-up and fallback edge cases | v0.1 |
| 17 | The `stream-limit` notice for a `429`; failure counting, the data-cap budget and end instant, the reported protocol, late chunks; §19.2 at its goodput and §19.3 recomputed | v0.1 |
| 18 | Upload bounds on the client clock, the grace without a known rate, immediate aborts, telemetry checks; §19.4 recomputed with a per-request ceiling | v0.1 |
| 19 | The `network` command, the browser identity from the transport, and the run sequence's skips, samples, pauses and run-imposed errors | v0.1 |
| 20 | The v0.1 result field set with later fields absent, the timer resolution and isolation in `client`, `validateResult` as the one runtime function of `engine/messages.ts` | v0.1 |
| 21 | The Worker's message loop with one run at a time; busy time, timer resolution, timing-entry lookup and user-agent table of the browser wiring | v0.1 |
| 22 | The dist URL allowlist: the SVG, XLink and MathML namespaces, the GNU licenses URL, the Tailwind license comment, Vue's console error reference and the project repository; clicked links are not calls | v0.1 |
| 23 | The engine Worker chunk budget, 128 KiB minified, in `.chunk-budget` | v0.1 |
| 24 | v0.1 without a Settings screen: Test and About navigation, placeholder pages, server defaults plus URL parameters, the About screen before v0.3 | v0.1 |
| 25 | The design export's root assets served from the base path as an explicit file list | v0.1 |
| 26 | The v0.1 SPA shell: per-screen locale files, the header's reachability and theme button, the Worker configured from the server defaults, the engine type-checked on its own | v0.1 |
| 27 | Before a run: info on load and on Retry, the connection info's placeholders and label choices, the settings summary's line and chips, the base-path check before rendering, the About screen's repository links and no credits | v0.1 |
| 28 | `index.html` rendered once with absolute asset URLs under the base path; an incomplete embedded SPA exits 1 after configuration and route checks | v0.1 |
| 29 | A release recovery selects the recorded toolchains in a script after the setup actions; a tag without recorded versions warns; a dry run rehearses a fresh release only | v0.1 |
| 30 | The UI reads a run's end from the event order; an engine defect ends the run as `test failed`; the wake lock is requested again when the page becomes visible | v0.1 |
| 31 | Rates keep three significant digits with their trailing zeros; the gauge caption's round scale ends drop them | v0.1 |
| 32 | Upload `sample`s carry P_start and their own instant on the server grid, and every `sample` the warm-up end, for the live chart | v0.1 |
| 33 | Rates scale to the largest unit whose number is at least 1, from kbit/s up to Gbit/s; every v0.1 notice has a tone | v0.1 |
| 34 | The Download JSON file is named after the result's local start time, `exportedAt` is the download moment, and an invalid result is never exported | v0.1 |
| 35 | An `idle` event per ping feeds the idle-latency gauge, counter and median; a stopped direction names its window end, the notice its steady window; errors are worded by `errors.<code>` | v0.1 |
| 36 | URL parameters go to the engine with `configure`, resolved and answered with a `settings` event; ignored ones travel with each `start` as notices; the countdown waits for the answer | v0.1 |
| 37 | The harness evaluator judges each run pass, fail or inconclusive; a pass needs a complete result with both headlines; untabled rates fail; only a pass lets the tier pass, an unshaped debugging run included | v0.1 |
| 38 | A finished direction's `phase` event carries its headline for the live region; spoken numbers use the visual scale with long unit names; the v0.1 result summary and a skip link | v0.1 |
| 39 | The ramp's `I_m` spans a request cycle over 10 ms of RTT and is 100 RTT below it, at least 500 ms and 2 RTT | v0.1 |
| 40 | The harness's iperf3 runs settle, then take the receiver's median interval; the shaper queue is an 80 ms fq_codel; a failing verdict keeps its environment | v0.1 |
| 41 | E2E runs in parallel against one binary with a per-client stream limit of 64, own binaries for the base path and a stopped server, axe WCAG 2.2 AA after transitions | v0.1 |
| 42 | The demo build runs the engine through its own Worker entry against a seeded simulated link, one scenario per v0.1 kit state; its Worker-side files follow the engine's import policy plus `@/demo/` | v0.1 |
| 43 | The demo panel reloads the page to apply a scenario; the page reaches the demo only through dynamic imports behind `VITE_DEMO`, the demo Worker's constructor in a demo module, and the build step fails a dist holding a demo sentinel | v0.1 |
| 44 | The deployment examples show a setting of a later release commented out with that release, and every shipped compose file's BitGauge environment loads and validates with no problem | v0.1 |
| 45 | Prometheus endpoint details: an aborts counter, the route owner as `group`, `GET` only with plain `405` and `404`, promhttp negotiation without compression, a registry of its own, buckets up to 120 s, instrumentation always on | v0.2 |
| 46 | `server.labels` as `{cidr, label}` entries, `cidr=label` items in the environment, masked unique CIDRs, the `display_name` label rule, longest prefix first, `suggestedLabel` up to 64 characters or `null` | v0.2 |
| 47 | Loaded-latency shapes, reasons and sample minimum; the increase and grade only with an idle median; the series on the direction's timeline; no statistic over two sources; the reservation from the Info phase's protocol; the `probe-reservation` notice once | v0.2 |
| 48 | The demo link's loaded delay per direction, rising with τ while requests are in flight, and its six-connection HTTP/1.1 link | v0.2 |
| 49 | Sparse stored settings under `bitgauge.settings.v1` with the kit's ranges and a 2 MB cap floor; the shareable URL's order, `run`, `label`, `theme` and `lang`, and its "Not in the link" line; stored Auto-start as `run=1`; the preset table re-exported from `engine/messages.ts` | v0.2 |
| 50 | RFC 4180 CSV with a formula guard; whole-file and per-record import rejection with a summary; immediate delete with an 8 s undo; no retention limit; filters in the query string; recent labels; list sort and keys; the Safari hint in the page; the export file names | v0.2 |
| 51 | The unsaved in-memory result on the Result detail; loaded latency on each throughput chart's second axis and the table; Compare's ±2 %, 1 ms and grade-order wording; the Test screen's share dialog | v0.2 |
| 52 | The 1200 × 630 dark-theme PNG share image with its qualifiers, fonts loaded first, and the copied summary as the same translated lines | v0.2 |
| 53 | The harness judges each `websocket` or `http-h1-reserved` direction's increase against the ICMP ping increase within ±20 % or 5 ms and the grade against the larger ping increase of its basis, within one adjacent letter at a threshold; a missing loaded latency or grade fails; `http-h2` and `http-h3` are recorded unjudged; the ws-blocked profile is held to `http-h1-reserved` | v0.2 |
| 54 | Edited durations are kept as "custom", with no question, when another preset is chosen | v0.2 |
| 55 | An idle ping waits 50 ms after the previous answer as well as 100 ms after the previous send | v0.2 |
| 56 | Compatibility wire details: the native envelope for every layer error, `405` with `Allow`, the `ckSize` rule, `/getIP` and `cors=true` edges, one absolute-URL builder over trusted forwarding headers, empty-body headers, length-less bodies up to the cap, the classifier group and the startup field | v0.3 |
| 57 | Path B: state precedence with snake_case states, the sampling window from warm-up end, connect-field evidence, the result block, quantized `http_l`, a whole-number RPM | v0.3 |
| 58 | Quality scores: `basis`, `{points, band}` or named missing inputs, inputs from the result's own numbers, present on every v0.3 result | v0.3 |
| 59 | Continuous: one `continuousDirection` with an optional run length and `null` bounds, `measured` from 3 fully known 1 s cells else `insufficient-data` under `partial`, run-wide numbers from running sums, last-hour loaded latency, the last 64 path B probes | v0.3 |
| 60 | Continuous `sample` fields `continuous`, `cells` and `notices`, exported ring lengths, the live chart's tier by elapsed time, the `data-used` notice | v0.3 |
| 61 | The v0.3 demo: the Continuous scenarios with a fast-forward rate, a 921 Mbit/s fixture, path B controls and About layer switches | v0.3 |
| 62 | v0.3 UI: Continuous settings and URL mapping, About snippets per layer, the summary's responsiveness and scores, the Result detail's TM95, 7-day and skipped lines, Compare rows, per-direction CSV columns, the share image, the Continuous live view and endings | v0.3 |
| 63 | v0.3 harness rules: path B over h2 with an RPM (`measured` or `uncertain`, recorded) on the Caddy profile and `unavailable_h1` on the Traefik profile, the three compatibility clients on the Caddy profile, a manual one-hour Continuous heap check within 2 MiB | v0.3 |
| 64 | v0.3 UI details after the export: the kit's run length control, the latest data-used notice live, the scores' basis in the summary, the Continuous chart's overlay rings, clipping and re-binning, bounded live rings, the demo panel's v0.3 controls | v0.3 |
| 65 | Where a path B probe waits on a loaded HTTP/2 connection through Caddy | Unscheduled |
| 66 | An upload's path B starts at the learned warm-up end, so a short probing span can leave Firefox too few samples | v0.3 |

## Related

- [Recommended stack](stack.md)
- [Why this stack fits](rationale.md)
- [Roadmap](../roadmap.md)
- [Open questions](../open-questions.md)
- [Measurement methodology](../measurement.md)
