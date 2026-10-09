# Backend Design

[Feature index](../README.md) / [Technical Stack](README.md) / Backend

The backend is one Go binary that serves the SPA, the native API and the optional compatibility
layers. It is planned, not written; this page fixes the package boundaries and the rules every
handler follows. Endpoint contracts are in [wire-protocol.md](../wire-protocol.md) and
[compatibility.md](../compatibility.md).

## 1. Package Map

| Package | Responsibility |
| --- | --- |
| `cmd/bitgauge` | `main`: parses the subcommand (`serve`, the default, or `healthcheck`) and `--config`, wires the packages together. No logic. |
| `internal/buildinfo` | Version, commit and build date, stamped with `-ldflags -X`. |
| `internal/config` | koanf loading (defaults, file, env), strict decoding, fail-closed validation ([configuration-security.md §1](configuration-security.md#1-loading-order)). |
| `internal/logger` | Small `log/slog` wrapper: text or JSON handler, level. |
| `internal/server` | `http.Server` construction and timeouts, the middleware chain, router assembly from the route groups, graceful shutdown. |
| `internal/handlers` | Native API handlers: download, upload (grid counting), ping, small, ws, info; the shared random buffer, body drainer and server grid. |
| `internal/clientip` | Trusted-proxy client IP derivation ([configuration-security.md §4](configuration-security.md#4-trusted-proxies-and-client-ip-derivation)). |
| `internal/ratelimit` | Bounded per-IP limiter for streams, request rate, WebSockets and networkQuality flows. |
| `internal/metrics` | Prometheus registry and collectors (§7). |
| `internal/compat/openspeedtest` | `/downloading`, `/upload`. |
| `internal/compat/librespeed` | `/garbage`, `/empty`, `/getIP`, their `backend/` and `.php` variants, `/.well-known/librespeed`. |
| `internal/compat/nq` | `/nq/config`, `/.well-known/nq`, `/nq/small`, `/nq/large`, `/nq/upload`. |
| `web` (Go file in `web/`) | `embed.FS` of `web/dist`, `index.html` templating with the base path, SPA route handler. |

Dependencies point inwards: compat packages use the shared building blocks (the random-buffer
writer and body drainer in `internal/handlers`, plus `internal/clientip` and `internal/ratelimit`)
but never the reverse, and nothing imports `cmd/`.

## 2. Handler Rules

### 2.1 Download (and Every Response That Streams Random Bytes)

- One random buffer of 4 MiB is generated at startup (`crypto/rand`) and shared read-only by all
  downloads, OpenSpeedTest `/downloading`, LibreSpeed `/garbage` and `/nq/large`.
- A body of `N` bytes is written as consecutive slices of that buffer, wrapping around; **no
  allocation per request** and no copy into a per-request buffer.
- `Content-Length` is set before the first write; no `Content-Encoding`; `Cache-Control: no-store`.
- **Sizes and caps** are decided before any write, per route:
  - native `GET /api/v1/download`: `N` above `limits.max_download_bytes` answers `400`;
  - OpenSpeedTest `/downloading`: always exactly 30 MiB;
  - LibreSpeed `/garbage`: `ckSize` is clamped silently to its cap, never rejected;
  - networkQuality `/nq/large`: always 8 GiB, not bounded by `limits.max_download_bytes`, only by
    the networkQuality flow limit ([../compatibility.md](../compatibility.md)).
- **Stall detection per write.** There is no global write timeout (responses can legitimately run
  for minutes: `/nq/large`, and third-party clients' fixed-size downloads on slow links; the native
engine aborts its own requests after 30 s). Instead, before each write the handler sets a write
  deadline of 30 s from now through `http.ResponseController`; a client that stops reading for 30 s
  is disconnected.
- Client aborts end the handler on the next failed write; only Prometheus counters record it.

### 2.2 Upload (and Every Route That Drains a Body)

- **Drain before respond.** The handler reads the whole body and only then writes the response.
  Native upload, OpenSpeedTest `/upload`, LibreSpeed `/empty` and `/nq/upload` share one drainer.
- **Caps.** A missing `Content-Length` answers `411` (native route); a declared `Content-Length`
  above the route's cap answers `413` without reading, on every route. Reads are additionally
  bounded with `http.MaxBytesReader`, so a lying `Content-Length`, or a body without one (allowed on
  `/nq/upload`, whose client may stream), is read up to the cap and then answered `413` with the
  connection closed.
- **Reading is discarding.** The drainer reads into a pooled 64 KiB buffer (`sync.Pool`) and drops
  the data, which is what `io.Copy(io.Discard, body)` does, except that each read's byte count is
  available for the grid. No allocation per request beyond the pooled buffer and the counts slice.
- **Grid counting** (native upload only): after each read,
  `cell = floor((monotonic now − process start) / 100 ms) + K` and `counts[cell − firstCell] += n`,
  where `K` is a random whole number of cells chosen at startup (the grid origin is process start
  shifted by `K` cells). `startMs` uses the same timeline in milliseconds. Indices therefore reveal
  neither uptime nor wall-clock time. The counts slice grows at most to
  1201 entries.
- **Lifetime.** A read deadline of 120 s from **handler entry** is set through
  `http.ResponseController` before the first read, so a body that never starts is cut too; on expiry
  the handler stops reading and answers `408` with the error envelope and no telemetry, and the
  connection is closed. Because the deadline counts from entry, the counts slice still never
  exceeds 1201 cells, and a stalled request releases its rate-limit slot after at most 120 s.
- **Telemetry.** On success: `Server-Timing: bg-recv;dur=<durationMs>` is set, then the JSON of
  [wire-protocol.md §4](../wire-protocol.md#4-upload-telemetry) is written. The counts slice is
  dropped with the request.
- **Rate-limited** requests are answered `429` before reading, with `Connection: close` on
  HTTP/1.1 so the body need not be drained.

### 2.3 Other Handlers

- **ping** writes `204`; **small** writes one constant byte; neither allocates.
- **ws** accepts with the `Origin` rule of
  [wire-protocol.md §6](../wire-protocol.md#6-websocket-apiv1ws), sets a 256-byte read limit (larger
  messages close with 1009), echoes `ping` messages as `pong`, and closes after 120 s without a
  message. The per-IP WebSocket counter is released on close.
- **info** builds its JSON per request from the configuration, the build info, the epoch and the
  client IP; nothing is cached per client.
- **Handlers are thin.** No handler holds state beyond its request; shared state is limited to the
  inventory in [architecture.md §6](../architecture.md#6-in-memory-state-inventory).

## 3. Middleware Chain Order

Applied in this order to every request, before routing:

1. **Panic recovery**: logs the panic with the route pattern and answers `500` (error envelope on
   API routes).
2. **Client IP**: derives the client IP once ([configuration-security.md
   §4](configuration-security.md#4-trusted-proxies-and-client-ip-derivation)) and stores it in the
   request context.
3. **Security headers**: per route group ([configuration-security.md
   §3](configuration-security.md#3-security-headers-middleware)).
4. **Logging and metrics**: request counters and durations by route pattern; a per-request log
   line at `debug` level only.

Then, per route group (not globally), in this order:

5. **CORS**: native API (allowed origins only), OpenSpeedTest (`*`), LibreSpeed (`cors=true` and
   `/getIP` rules), none for networkQuality and the SPA. CORS headers are set before the next step,
   so every later response, a `429` included, carries them and a cross-origin client can read its
   status and `Retry-After`. `OPTIONS` preflights are answered here and never reach the limiter.
6. **Rate limiting**: throughput groups only (native download/upload, OpenSpeedTest, LibreSpeed
   throughput routes, networkQuality flows, WebSocket handshake); `ping`, `small`, `info`, the SPA,
   `/metrics` and preflights are not limited.

## 4. Router Groups

```text
chi.Router mounted at server.base_path
 ├─ web.Routes()              GET /, /result/{id}, /history, /settings, /about, /assets/*
 ├─ handlers.Routes()         /api/v1/{download,upload,ping,small,ws,info}
 ├─ openspeedtest.Routes()    if compat.openspeedtest.enabled
 ├─ librespeed.Routes()       if compat.librespeed.enabled
 ├─ nq.Routes()               if compat.networkquality.enabled
 └─ metrics.Handler()         if metrics.enabled, at metrics.path
 everything else: 404 (error envelope under /api/v1, plain 404 elsewhere)
```

Route collisions are impossible by construction and are also checked at startup, which is how
`metrics.path` validation is implemented ([compatibility.md §5](../compatibility.md#5-route-table)).

## 5. Server Settings and Graceful Shutdown

- `ReadHeaderTimeout` 10 s, `IdleTimeout` 120 s, `MaxHeaderBytes` 16 KiB. No global `ReadTimeout`
  or `WriteTimeout`; per-request deadlines are set through `http.ResponseController` (§2).
- On `SIGTERM` or `SIGINT` the server stops accepting connections, closes WebSockets with status
  1001 (going away) and calls `Shutdown` with a 10 s grace. Transfers still running after that are
  cut. A test in progress then sees a network change or, after a restart, a new epoch
  ([edge-cases.md §11](../edge-cases.md#11-server-restart-mid-test)).
- Startup order: load and validate config (exit 2 on error), generate the random buffer, epoch and
  grid origin, render `index.html`, build the router, listen.

## 6. `healthcheck` Subcommand

`bitgauge healthcheck` loads the same configuration as `serve` (file and environment) and requests
`GET /api/v1/ping` under the configured base path at an address derived from `server.listen`: the
configured host when it is a specific address (`192.168.1.10:8080`, `[fd00::5]:8080`); `127.0.0.1`
when the host is empty or `0.0.0.0` (`:8080` listens on all addresses); `::1` when it is `[::]`. The
request has a 3 s timeout, and exits `0` on `204`, `1` otherwise. It needs no shell or `curl` in the
image and is used by the image's `HEALTHCHECK` and by compose files ([deployment-example.md
§1](../deployment-example.md#1-compose-bitgauge-alone)).

## 7. Prometheus Metric Set

Exposed only when `metrics.enabled` is true. No metric carries a client IP or any per-client label,
and no measured result exists on the server to export.

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `bitgauge_http_requests_total` | counter | `group`, `route`, `code` | Requests by route group (`spa`, `api`, `openspeedtest`, `librespeed`, `nq`, `metrics`), route pattern and status. |
| `bitgauge_http_request_duration_seconds` | histogram | `group`, `route` | Request durations (throughput routes included, so long buckets). |
| `bitgauge_transfer_bytes_total` | counter | `group`, `direction` | Bytes sent (`download`) and drained (`upload`). |
| `bitgauge_active_transfers` | gauge | `group`, `direction` | Transfers in progress. |
| `bitgauge_rate_limited_total` | counter | `limit` | Rejections by limit (`streams`, `rate`, `websocket`, `nq_flows`, `table_full`). |
| `bitgauge_upload_timeouts_total` | counter | `group` | Upload bodies cut at the 120 s lifetime. |
| `bitgauge_websocket_connections` | gauge | — | Open latency WebSockets. |
| `bitgauge_websocket_messages_total` | counter | — | Echoed ping messages. |
| `bitgauge_ratelimit_tracked_clients` | gauge | — | Entries in the rate-limit table. |
| `bitgauge_build_info` | gauge (1) | `version`, `commit`, `goversion` | Build information. |

Plus the standard Go runtime (`go_*`) and process (`process_*`) collectors.

## Related

- [Architecture](../architecture.md)
- [Wire protocol](../wire-protocol.md)
- [Compatibility layers](../compatibility.md)
- [Configuration and security internals](configuration-security.md)
- [Testing](testing.md)
