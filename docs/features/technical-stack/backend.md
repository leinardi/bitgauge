# Backend Design

[Feature index](../README.md) / [Technical Stack](README.md) / Backend

The backend is one Rust binary that serves the SPA, the native API and the optional compatibility
layers. This page fixes the package boundaries and the rules every handler follows. Endpoint
contracts are in [wire-protocol.md](../wire-protocol.md) and
[compatibility.md](../compatibility.md).

## 1. Package Map

One Cargo package, `bitgauge`, with a library (`src/lib.rs`) and a binary (`src/main.rs`); the
workspace's other members, `meta` and `testenv`, are test-only ([testing.md](testing.md)). The
library's modules:

| Module | Responsibility |
| --- | --- |
| `main.rs`, `command`, `cli` | The `bitgauge` command: parses the subcommand (`serve`, the default, or `healthcheck`) and `--config`, wires the modules together in the startup order of §5. No other logic. |
| `buildinfo` | Version, commit and build date, read at compile time from `BITGAUGE_VERSION`, `BITGAUGE_COMMIT` and `BITGAUGE_DATE`; `dev` for the version and `unknown` for the others when unset. |
| `config` | Loading (defaults, file, env), strict decoding, fail-closed validation ([configuration-security.md §1](configuration-security.md#1-loading-order)). |
| `logger` | tracing and tracing-subscriber: text or JSON format, level. |
| `server` | The accept loop and connection driver with their deadlines, the middleware chain, router assembly from the route groups, graceful shutdown and the signals. |
| `handlers` | Native API handlers: download, upload (grid counting), ping, small, ws, info; the shared random buffer, body drainer and server grid. |
| `clientip` | Trusted-proxy client IP derivation ([configuration-security.md §4](configuration-security.md#4-trusted-proxies-and-client-ip-derivation)). |
| `ratelimit` | Bounded per-IP limiter for streams, request rate, WebSockets and networkQuality flows. |
| `metrics` | Prometheus registry and collectors (§7). |
| `healthcheck` | The `healthcheck` subcommand's probe (§6). |
| `compat::openspeedtest` | `/downloading`, `/upload`. |
| `compat::librespeed` | `/garbage`, `/empty`, `/getIP`, their `backend/` and `.php` variants, `/.well-known/librespeed`. |
| `compat::nq` | `/nq/config`, `/.well-known/nq`, `/nq/small`, `/nq/large`, `/nq/upload`. |
| `web` | `web/dist` embedded with include_dir, `index.html` templating with the base path, SPA route handler. |

Dependencies point inwards: the compat modules use the shared building blocks (the random-buffer
body and body drainer in `handlers`, plus `clientip` and `ratelimit`) but never the reverse, and
nothing depends on `command`.

The command line accepts `--config <path>` or `--config=<path>` only, and the value may start with
`-`. A single-dash long form such as `-config` or `-help` is refused with exit status 2, naming the
`--` spelling; `-h` and `--help` print the help on stdout and exit 0.

## 2. Handler Rules

### 2.1 Download (and Every Response That Streams Random Bytes)

- One random buffer of 4 MiB is generated at startup from the system random source (getrandom)
  and shared read-only by all downloads, OpenSpeedTest `/downloading`, LibreSpeed `/garbage` and
  `/nq/large`.
- A body of `N` bytes is a stream of consecutive slices of that buffer, at most 64 KiB each,
  wrapping around: **no per-request data buffer** and no copy into one. The tests check that every
  frame is a slice of the shared buffer.
- `Content-Length` is set before the first write; no `Content-Encoding`; `Cache-Control: no-store`.
- **Sizes and caps** are decided before any write, per route:
  - native `GET /api/v1/download`: `N` above `limits.max_download_bytes` answers `400`;
  - OpenSpeedTest `/downloading`: always exactly 30 MiB;
  - LibreSpeed `/garbage`: a `ckSize` that is not a positive decimal integer answers `400`, and
    one above its cap is clamped silently to it;
  - networkQuality `/nq/large`: always 8 GiB, not bounded by `limits.max_download_bytes`, only by
    the networkQuality flow limit ([../compatibility.md](../compatibility.md)).
- **Stall detection per write.** There is no global write timeout (responses can legitimately run
  for minutes: `/nq/large`, and third-party clients' fixed-size downloads on slow links; the native
  engine aborts its own requests after 30 s). Instead the connection holds every write to a stall
  rule: a write of any response, or of an upgraded socket, that makes no progress for 30 s ends the
  connection, so a client that stops reading for 30 s is disconnected. A slow link is never cut as
  long as each write makes progress; a frame is at most 64 KiB, which takes about 5 s at
  100 kbit/s.
- Client aborts end the handler on the next failed write; only the Prometheus counters record it
  (`bitgauge_http_aborts_total`, §7).

### 2.2 Upload (and Every Route That Drains a Body)

- **Drain before respond.** The handler reads the whole body and only then writes the response.
  Native upload, OpenSpeedTest `/upload`, LibreSpeed `/empty` and `/nq/upload` share one drainer.
- **Caps.** A missing `Content-Length` answers `411` on the native route only; a declared
  `Content-Length` above the route's cap answers `413` without reading, on every route. Reads are
  additionally bounded by a cap check on every frame read, so a lying `Content-Length`, or a body
  without one (allowed on OpenSpeedTest `/upload`, LibreSpeed `/empty` and `/nq/upload`, whose
  clients may stream), is read up to the cap and then answered `413` with the connection closed.
  The caps are the native and LibreSpeed `limits.max_upload_bytes`, OpenSpeedTest's fixed 35 MiB
  and `compat.networkquality.max_upload_bytes`.
- **Reading is discarding.** The drainer reads the body frame by frame, as hyper's read buffer
  delivers it, and drops the data; each frame's byte count is available for the grid. There is no
  per-request data buffer beyond the counts slice.
- **Grid counting** (native upload only): after each frame,
  `cell = floor((monotonic now − process start) / 100 ms) + K` and `counts[cell − firstCell] += n`,
  where `K` is a random whole number of cells chosen at startup (the grid origin is process start
  shifted by `K` cells). `startMs` uses the same timeline in milliseconds. Indices therefore reveal
  neither uptime nor wall-clock time. `K` is drawn uniformly from `[0, 2^32)`, which keeps every
  index and `startMs` far below `2^53`, exact as a JavaScript number. The counts slice grows at
  most to 1201 entries.
- **Lifetime.** One deadline, 120 s from **handler entry**, bounds every frame read, the first
  included, so a body that never starts is cut too; on expiry
  the handler stops reading and answers `408` with the error envelope and no telemetry, and the
  connection is closed. Because the deadline counts from entry, the counts slice still never
  exceeds 1201 cells, and a stalled request releases its rate-limit slot after at most 120 s.
- **Telemetry.** On success: `Server-Timing: bg-recv;dur=<durationMs>` is set, then the JSON of
  [wire-protocol.md §4](../wire-protocol.md#4-upload-telemetry) is written. The counts slice is
  dropped with the request.
- **Rate-limited** requests are answered `429` before reading, with `Connection: close` on
  HTTP/1.1 so the body need not be drained.
- **Client aborts.** A body that ends before its `Content-Length`, or a connection that fails
  mid-read, ends the handler with no response possible; only the Prometheus counters record it
  (`bitgauge_http_aborts_total`, §7). A body cut at the lifetime is a timeout, not an abort.

### 2.3 Other Handlers

- **ping** writes `204`; **small** writes one constant byte; neither uses a per-request data
  buffer.
- **ws** accepts with the `Origin` rule of
  [wire-protocol.md §6](../wire-protocol.md#6-websocket-apiv1ws), sets a 256-byte read limit (larger
  messages close with 1009), echoes `ping` messages as `pong`, and closes after 120 s without a
  message. Keys of a message are matched case-sensitively, and a duplicate key, a top-level `null`
  or invalid UTF-8 closes with 1007; `seq` and `t` are echoed byte for byte as raw JSON, `null`
  included. The per-IP WebSocket counter is released on close.
- **info** builds its JSON per request from the configuration, the build info, the epoch and the
  client IP; nothing is cached per client.
- **Handlers are thin.** No handler holds state beyond its request; shared state is limited to the
  inventory in [architecture.md §6](../architecture.md#6-in-memory-state-inventory).

## 3. Middleware Chain Order

The chain is one tower service around the axum router, applied in this order to every request,
before routing. A request with framing or headers hyper rejects reaches none of them and gets
hyper's answer ([../wire-protocol.md §7](../wire-protocol.md#7-error-envelope)): a `400` with an
empty body (an unsupported `Transfer-Encoding` or HTTP version included), and `431` for a head
over exactly 16 KiB, including the request target, or with more than 100 headers. An HTTP/2
prior-knowledge preface closes without an HTTP response. A malformed
`Host` is not rejected before routing.

1. **Panic recovery**: logs the panic with the route pattern and answers `500` (error envelope on
   API routes and on an enabled compatibility layer's routes, by the classifier's group:
   [configuration-security.md §3](configuration-security.md#3-security-headers-middleware)).
2. **Client IP**: derives the client IP once ([configuration-security.md
   §4](configuration-security.md#4-trusted-proxies-and-client-ip-derivation)) and stores it in the
   request context.
3. **Security headers**: per route group ([configuration-security.md
   §3](configuration-security.md#3-security-headers-middleware)).
4. **Logging and metrics**: request counters and durations by route pattern; a per-request log
   line at `debug` level only.

Then, per route group (not globally), in this order:

1. **CORS**: native API (allowed origins only), OpenSpeedTest (`*`), LibreSpeed (`cors=true` and
   `/getIP` rules), none for networkQuality and the SPA. CORS headers are set before the next step,
   so every later response, a `429` included, carries them and a cross-origin client can read its
   status and `Retry-After`. `OPTIONS` preflights are answered here and never reach the limiter.
2. **Rate limiting**: throughput groups only (native download/upload, OpenSpeedTest, LibreSpeed
   throughput routes, networkQuality flows, WebSocket handshake); `ping`, `small`, `info`, the SPA,
   `/metrics` and preflights are not limited.

## 4. Router Groups

```text
axum Router, every route under server.base_path
 ├─ web routes                GET and HEAD /, /result/{id}, /history, /settings, /about,
 │                            /assets/*, and the root assets: /favicon.svg, /favicon-16.png,
 │                            /favicon-32.png, /apple-touch-icon.png, /icon-192.png,
 │                            /icon-512.png, /icon-512-maskable.png, /site.webmanifest
 ├─ native routes             /api/v1/{download,upload,ping,small,ws,info}
 ├─ openspeedtest::routes()   if compat.openspeedtest.enabled
 ├─ librespeed::routes()      if compat.librespeed.enabled
 ├─ nq::routes()              if compat.networkquality.enabled
 └─ metrics endpoint          if metrics.enabled, at metrics.path
 everything else: 404 (error envelope under /api/v1, plain 404 elsewhere)
```

Route collisions are impossible by construction and are also checked at startup, which is how
`metrics.path` validation is implemented ([compatibility.md §5](../compatibility.md#5-route-table)).

The SPA's routes answer `GET` and `HEAD`; a file with an extension outside the fixed content-type
table is `application/octet-stream`, and a request with more than one range gets `200` with the
whole file.

## 5. Server Settings and Graceful Shutdown

- hyper's HTTP/1 server serves each connection from BitGauge's own accept loop, and a connection
  wrapper keeps its deadlines: a request head must complete within 10 s of the accept or of its
  first byte, a keep-alive connection may stay idle 120 s, a pipelined head gets 10 s with no idle
  phase, and neither a body (its handler owns that deadline, §2.2) nor an upgraded socket (the
  WebSocket idle timer owns it) has a connection deadline. Every write is held to the 30 s stall
  rule (§2.1). The request head is limited to exactly 16 KiB, with at most 100 headers. There is
  no global read or write timeout.
- On `SIGTERM` or `SIGINT` the server stops accepting connections, closes WebSockets with status
  1001 (going away), lets each connection finish the request in flight and then closes it, all
  within a 10 s grace. Transfers still running after that are cut, and the process exits 1; a
  second signal ends it at once. A test in progress then sees a network change or, after a
  restart, a new epoch ([edge-cases.md §11](../edge-cases.md#11-server-restart-mid-test)).
- Startup order: load and validate config, the `metrics.path` route collision included (exit 2 on
  error), generate the random buffer, epoch and grid origin, render `index.html` (exit 1 when the
  embedded SPA lacks `index.html`, a root asset or its single base-path meta element), build the
  router, listen.

## 6. `healthcheck` Subcommand

`bitgauge healthcheck` loads the same configuration as `serve` (file and environment) and requests
`GET /api/v1/ping` under the configured base path at an address derived from `server.listen`: the
configured host when it is a specific address (`192.168.1.10:8080`, `[fd00::5]:8080`); `127.0.0.1`
when the host is empty or `0.0.0.0` (`:8080` listens on all addresses); `::1` when it is `[::]`. The
probe is one connection to that literal address, with no name lookup, and one 3 s deadline over
the connect, the write and the read of the status line; it exits `0` only on an `HTTP/1.x 204`
status line, `1` otherwise. `healthcheck` takes `--config` under the same rules as `serve` (§1). It
needs no shell or `curl` in the image and is used by the image's `HEALTHCHECK` and by compose files
([deployment-example.md §1](../deployment-example.md#1-compose-bitgauge-alone)).

## 7. Prometheus Metric Set

The metrics are collected whether or not they are served: the instrumentation always runs, and only
the endpoint is gated by `metrics.enabled` (off by default). No metric carries a client IP or any
per-client label, and no measured result exists on the server to export.

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `bitgauge_http_requests_total` | counter | `group`, `route`, `code` | Requests by route group, route pattern and status. |
| `bitgauge_http_request_duration_seconds` | histogram | `group`, `route` | Request durations (throughput routes included, so long buckets). |
| `bitgauge_transfer_bytes_total` | counter | `group`, `direction` | Bytes sent (`download`, counted when handed to hyper, which can be up to about 400 KB ahead of the socket) and drained (`upload`). |
| `bitgauge_active_transfers` | gauge | `group`, `direction` | Transfers in progress. |
| `bitgauge_http_aborts_total` | counter | `group`, `direction` | Transfers the client abandoned before the body ended: a download whose write failed, an upload whose body ended early or whose connection failed mid-read. |
| `bitgauge_rate_limited_total` | counter | `limit` | Rejections by limit (`streams`, `rate`, `websocket`, `nq_flows`, `table_full`). |
| `bitgauge_upload_timeouts_total` | counter | `group` | Upload bodies cut at the 120 s lifetime. |
| `bitgauge_websocket_connections` | gauge | — | Open latency WebSockets. |
| `bitgauge_websocket_messages_total` | counter | — | Echoed ping messages. |
| `bitgauge_ratelimit_tracked_clients` | gauge | — | Entries in the rate-limit table. |
| `bitgauge_build_info` | gauge (1) | `version`, `commit` | Build information: `version` and `commit` from the build info. |

There are no runtime or process collectors: the families above are the whole set.

**Labels.**

- `group` is the owner of the route that matched, from the route table
  ([compatibility.md §5](../compatibility.md#5-route-table)): `spa` for the SPA's routes, `api` for
  the native API, `openspeedtest`, `librespeed` and `nq` for the compatibility layers, and
  `metrics` for the endpoint itself. A request no route matched takes the group of the
  security-header classifier ([configuration-security.md
  §3](configuration-security.md#3-security-headers-middleware)): `api` under `/api/v1`, the
  layer's group on an enabled compatibility layer's exact route path (a method its row does not
  list, for example), `spa` elsewhere, a disabled layer's paths included.
- `route` is the matched route pattern as the route table writes it, without `base_path`
  (`/api/v1/download`, `/assets/*`); a request no route matched counts as `unmatched`, so a
  scanner's paths never become label values.
- `code` is the response status as three digits when it is one BitGauge answers: `101`, `200`,
  `204`, `206`, `304`, `400`, `403`, `404`, `405`, `408`, `411`, `413`, `416`, `429`, `500` or
  `503`. Any other status counts as `other`, and so does a request that ends with no response at
  all, such as an upload whose client went away mid-body.
- Every label value therefore comes from a fixed set, and a request never formats or looks up a
  label value. The children of every metric except `bitgauge_http_requests_total` are created at
  startup, the duration histogram's one per route. A route's request counter for a status is
  created the first time the route answers that status and kept in the route's table from then
  on, so the series stay bounded by the routes times the statuses above, and a status a route
  never answers adds no zero-valued series.

**Request durations** use the buckets 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
60 and 120 s, so the throughput requests of a slow link, which last up to the 120 s upload
lifetime, still fall in a bucket.

**Registry and endpoint.**

- The metrics live in one prometheus-client registry built at startup and owned by the server;
  nothing registers into a global default.
- The endpoint is mounted at `metrics.path` under `base_path` and answers `GET` only; any other
  method answers a plain `405` with `Allow: GET`. With `metrics.enabled: false` the path is not
  mounted and answers the plain `404` of any unknown path outside `/api/v1`, with no error
  envelope.
- No format is negotiated: the response is always OpenMetrics text
  (`application/openmetrics-text; version=1.0.0; charset=utf-8`), whatever `Accept` says, so there
  is no `Vary: Accept`. It is never compressed, as no `/api/v1` response is
  ([wire-protocol.md §8](../wire-protocol.md#8-caching-cors-and-compression)), goes out as one body
  with its `Content-Length`, and carries `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`.
- The endpoint is not rate-limited and not counted by any limit.
- A failure to encode the metrics answers a plain `500` and is logged at `warn`, naming the error
  and nothing about the scraper.

## Related

- [Architecture](../architecture.md)
- [Wire protocol](../wire-protocol.md)
- [Compatibility layers](../compatibility.md)
- [Configuration and security internals](configuration-security.md)
- [Testing](testing.md)
