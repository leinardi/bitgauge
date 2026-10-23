# Wire Protocol — Native HTTP API

[Feature index](README.md) / Wire Protocol

This page specifies BitGauge's native HTTP API: every endpoint the SPA's measurement engine uses,
plus the Prometheus endpoint. Optional routes for third-party clients are specified in
[compatibility.md](compatibility.md). How the engine uses each endpoint is specified in
[measurement.md](measurement.md); configuration keys are in [configuration.md](configuration.md).

Requirement statements about what a server or client does on the wire use RFC 2119 keywords
(MUST, MUST NOT, SHOULD, MAY). Everywhere else this page uses the specification's ordinary
lowercase wording.

## 1. Conventions

- **Transport.** BitGauge speaks plain HTTP/1.1; h2c is not offered. TLS, HTTP/2 and HTTP/3
  terminate at the reverse proxy ([deployment-example.md](deployment-example.md)).
- **Base path.** Every route on this page and in [compatibility.md](compatibility.md) is mounted
  under the configured `server.base_path` (default `/`). With `base_path: /speed`, the info
  endpoint is `/speed/api/v1/info` and the metrics endpoint is `/speed/metrics`. Paths below are
  written for the default base path.
- **Prefix.** The native API lives under `/api/v1`. The metrics endpoint sits outside it, at
  `/metrics` under the base path (path configurable), following Prometheus convention.
- **Statelessness.** No endpoint stores anything that outlives the request, except the in-memory
  counters listed in [architecture.md](architecture.md). No endpoint accepts a result.
- **Client IP.** Wherever a client IP is used (rate limits, `GET /info`), it is the TCP peer
  address, or, only when the peer is a trusted proxy, the address derived from its forwarding
  headers ([technical-stack/configuration-security.md](technical-stack/configuration-security.md)).

## 2. Endpoint Table

| Method | Path | Query | Request | Response | Notable headers | Status codes | Caps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/download` | `bytes=N` (required, integer ≥ 1) | — | `N` random bytes, `application/octet-stream` | `Content-Length: N`, `Cache-Control: no-store`, no `Content-Encoding` | 200, 400, 429 | `N ≤ limits.max_download_bytes` (default 256 MiB) |
| `POST` | `/api/v1/upload` | — | body of `N` bytes, `application/octet-stream`, `Content-Length` required | upload telemetry JSON (§4) | `Server-Timing: bg-recv;dur=D`, `Cache-Control: no-store` | 200, 408, 411, 413, 429 | `N ≤ limits.max_upload_bytes` (default 256 MiB); 120 s lifetime |
| `GET`, `HEAD` | `/api/v1/ping` | — | — | empty | `Cache-Control: no-store` | 204 | — |
| `GET` | `/api/v1/small` | — | — | 1 byte, `application/octet-stream` | `Content-Length: 1`, `Cache-Control: no-store` | 200 | — |
| `GET` (upgrade) | `/api/v1/ws` | — | WebSocket handshake | WebSocket, JSON text frames (§6) | — | 101, 400, 403, 429 | 4 WebSocket connections per client IP |
| `GET` | `/api/v1/info` | — | — | info JSON (§5) | `Cache-Control: no-store` | 200 | — |
| `GET` | `/metrics` | — | — | Prometheus text exposition, or OpenMetrics when `Accept` asks for it | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, no `Content-Encoding` | 200, 405, 500; 404 when disabled | path from `metrics.path`; off by default |

Any other method on these paths answers `405` with an `Allow` header (a plain `405` on
`/metrics`). Unknown paths under `/api/v1` answer `404` with the error envelope (§7). The
compatibility layers' routes are outside this table and this API; they answer their errors with
the same envelope ([compatibility.md §6](compatibility.md#6-rules-every-layer-shares)).

## 3. Throughput Endpoints

### 3.1 `GET /api/v1/download?bytes=N`

- The server MUST respond with exactly `N` bytes drawn from an in-memory random buffer generated at
  startup, sending them by repeatedly writing slices of that buffer. The body allocates nothing per
  request; the only per-request allocations are the formatted `Content-Length` value and the
  one-element header slice that holds it.
- The response MUST carry `Content-Length: N` and `Cache-Control: no-store`, and MUST NOT carry a
  `Content-Encoding`. The content is incompressible random data, so a compressing proxy gains
  nothing and only adds latency.
- A missing, non-integer, zero or negative `N` MUST yield `400`; an `N` above
  `limits.max_download_bytes` MUST yield `400` with code `bytes_out_of_range` and the limit in
  `details`. The code is `bad_request` when `N` is missing or not an integer, and
  `bytes_out_of_range`, with the limit in `details`, for any integer outside 1 to the limit. The
  query is percent-decoded as usual, so `bytes=%35` asks for 5 bytes.
- When the client aborts, the server stops writing; nothing is recorded beyond the Prometheus
  counters (`bitgauge_http_aborts_total`, §10).

### 3.2 `POST /api/v1/upload`

- The client MUST send `Content-Length` and MUST NOT use chunked transfer encoding; a request
  without `Content-Length` MUST yield `411`. A `Content-Length` above `limits.max_upload_bytes` MUST
  yield `413` without reading the body.
- The server MUST read and discard the whole body **before** responding. Responding early would
  measure buffers instead of the link and, on HTTP/1.1 through a proxy, force a connection close.
- While reading, the server MUST count each read's bytes into the cell of the global 100 ms server
  grid in which the read returned ([measurement.md
  §7.3](measurement.md#73-server-telemetry-per-request)). The counts live only for the duration of
  the request.
- **Lifetime.** The server MUST stop reading a body after 120 s (1200 cells) and answer `408` with
  the error envelope and no telemetry.
- On success the server MUST answer `200` with the telemetry JSON of §4 and the header
  `Server-Timing: bg-recv;dur=<durationMs>`.
- If fewer than `Content-Length` bytes arrive before the connection closes, no response is
  possible; nothing is recorded beyond the Prometheus counters (`bitgauge_http_aborts_total`,
  §10).

### 3.3 Latency and Probe Endpoints

- `GET /api/v1/ping` MUST answer `204` with no body and `Cache-Control: no-store`. It is the HTTP
  fallback for idle and loaded latency (path A fallback); `HEAD` behaves identically.
- `GET /api/v1/small` MUST answer `200` with a one-byte body, `Content-Length: 1` and
  `Cache-Control: no-store`. It is the HTTP responsiveness probe target (path B) and the path B
  capability check. It is the same object the networkQuality layer serves at `/nq/small`.
- Neither endpoint is rate-limited by `limits.requests_per_minute` (§9); they are cheap and their
  timing must not be distorted by limiter queuing.

## 4. Upload Telemetry

```json
{
  "epoch": "k3V9qW2rT0aY",
  "bucketMs": 100,
  "firstBucket": 1234567,
  "buckets": [6144, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 6144],
  "bytes": 122880,
  "startMs": 123456750,
  "durationMs": 1000
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `epoch` | string | Random identifier generated at process start; identical to `server.epoch` in `GET /info`. A different value means the server restarted. |
| `bucketMs` | integer | Grid cell length. **Always 100**; there is no coarsening. |
| `firstBucket` | integer | Absolute grid index of `buckets[0]`; equals `floor(startMs / 100)`. |
| `buckets` | integer array | Bytes read in each consecutive cell from `firstBucket` on. At most 1201 entries: the 120 s lifetime covers 1200 cells, plus one when it starts mid-cell. |
| `bytes` | integer | Total bytes read; `Σ buckets == bytes` and equals the request's `Content-Length`. |
| `startMs` | integer | Instant the first byte was read, in milliseconds on the grid's timeline. Diagnostic and watermark input. |
| `durationMs` | integer | First to last byte read, in milliseconds. Diagnostic and watermark input; also sent as `Server-Timing: bg-recv;dur=…`. |

The grid's timeline is the server's monotonic clock with origin at process start plus a random
whole number of cells, so it reveals neither wall-clock time nor uptime. An empty body
(`Content-Length: 0`) has no first byte: it answers `200` with `buckets: []`, `bytes: 0`,
`durationMs: 0` and `startMs` at the instant the handler was entered. The client MUST reject
(count as a failed request) a response whose `bytes` differs from what it sent, and MUST abort the
test when `epoch` differs from the one `GET /info` reported at test start.

## 5. `GET /api/v1/info`

```json
{
  "server": {
    "name": "home",
    "version": "0.1.0",
    "commit": "a1b2c3d",
    "buildDate": "2026-09-30T12:00:00Z",
    "epoch": "k3V9qW2rT0aY",
    "basePath": "/"
  },
  "client": {
    "ip": "100.101.4.17",
    "ipVersion": 4,
    "addressClass": "cgnat",
    "suggestedLabel": "VPN"
  },
  "limits": {
    "maxDownloadBytes": 268435456,
    "maxUploadBytes": 268435456,
    "maxStreamsPerClient": 8,
    "uploadLifetimeMs": 120000,
    "bucketMs": 100
  },
  "defaults": {
    "preset": "standard",
    "phases": ["idle", "download", "upload"],
    "streams": { "mode": "auto", "fixed": 3, "max": 6 },
    "download": { "minMs": 10000, "maxMs": 20000 },
    "upload": { "minMs": 15000, "maxMs": 25000 },
    "dataCapBytes": null,
    "units": "bits",
    "warmup": "auto",
    "pingCount": 20,
    "overheadCompensationPercent": 0
  },
  "compat": {
    "openspeedtest": false,
    "librespeed": false,
    "networkquality": false
  }
}
```

- `server.name` is `server.display_name`; `version`, `commit` and `buildDate` are the build
  information stamped into the binary (`internal/buildinfo`), shown on the About screen;
  `basePath` lets the SPA build URLs when it is served under a sub-path.
- **Context label inputs.** `client.addressClass` is one of `loopback`, `private` (RFC 1918),
  `link-local`, `ula` (fc00::/7), `cgnat` (100.64.0.0/10) or `public`. `client.suggestedLabel` is
  a string of 1–64 characters or `null`. When the client IP, IPv4-mapped IPv6 normalized to IPv4
  first, lies in a `server.labels` entry, it is that entry's label, the longest prefix winning
  ([configuration.md §2.1](configuration.md#21-server)); this is how a WireGuard range in RFC 1918
  space is labeled `VPN`. Otherwise it follows the address class: `VPN` for `cgnat` and for the
  Tailscale ULA range `fd7a:115c:a1e0::/48` (the ranges mesh VPNs such as Tailscale assign), `LAN`
  for `private`, `link-local`, `ula` and `loopback`, and `null` for `public`. The UI shows the
  suggestion and the user can change it.
- `defaults` are the test defaults exposed to the client from configuration; the SPA applies them
  unless the user's settings or URL parameters override them. They arrive resolved: an empty
  duration bound is sent as the preset's value and `ping_count: 0` as the preset's idle ping count
  ([measurement.md §8.5](measurement.md#85-presets)). With `preset: "continuous"`, which has no
  bounds, `download` and `upload` are `{"minMs": null, "maxMs": null}` whatever the duration keys
  say, and `pingCount` is 20 unless `ping_count` sets another; the run length is chosen per run in
  the browser and is not part of `defaults`. `dataCapBytes` is `null` without a cap, and `warmup`
  is `"auto"` or the fixed warm-up in whole milliseconds (`3000`).
- `compat` lists which compatibility layers are enabled, for the About screen's snippets.
- The response contains nothing about other clients and nothing that outlives the request.

## 6. WebSocket `/api/v1/ws`

- JSON **text** frames only. Client to server:

  ```json
  { "type": "ping", "seq": 17, "t": 48213.512 }
  ```

  Server to client:

  ```json
  { "type": "pong", "seq": 17, "t": 48213.512 }
  ```

- The server MUST echo `seq` and `t` unchanged and immediately; `t` is the client's
  `performance.now()` at send time and is opaque to the server. The server keeps no state per
  connection beyond the connection itself.
- A message larger than 256 bytes MUST cause the server to close the connection with status 1009
  (message too big); a binary frame with 1003 (unsupported data); malformed JSON with 1007 (invalid
  payload). Unknown `type` values are ignored.
- The server closes a connection that has received no message for 120 s (status 1000), so an idle
  tab does not hold resources.
- At most 4 WebSocket connections per client IP; the fifth handshake answers `429`.
- The server MUST check the handshake's `Origin` header: an origin whose host and port equal the
  request's `Host` header (the scheme is not compared, because behind a TLS proxy BitGauge sees
  `http` while the origin is `https`), an origin listed in `server.cors.allowed_origins`, or an
  absent `Origin` (non-browser clients) is accepted; any other origin MUST be refused with `403`
  ([security.md §2](security.md#2-bandwidth-abuse-limits)).
- WebSocket connections do not count against the browser's six HTTP/1.1 connections per origin,
  which is why path A uses this endpoint ([measurement.md
  §11](measurement.md#11-latency-under-load)).
- The proxy MUST forward `Upgrade` and `Connection` headers; without WebSocket support the engine
  falls back to `GET /api/v1/ping`.

## 7. Error Envelope

Every error response from `/api/v1` (except `204`/`200` success paths and the WebSocket close
codes), and every error status of an enabled compatibility layer's routes
([compatibility.md §6](compatibility.md#6-rules-every-layer-shares)), carries
`Content-Type: application/json` and:

```json
{
  "error": {
    "code": "bytes_out_of_range",
    "message": "bytes must be between 1 and 268435456",
    "details": { "max": 268435456 }
  }
}
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request`, `bytes_out_of_range` | malformed query or parameter outside its range (LibreSpeed's malformed `ckSize`: `bad_request`) |
| 404 | `not_found` | unknown path under `/api/v1` |
| 405 | `method_not_allowed` | wrong method (with `Allow`) |
| 408 | `request_timeout` | upload body not complete within the 120 s lifetime |
| 411 | `length_required` | upload without `Content-Length` |
| 413 | `payload_too_large` | upload `Content-Length` above the route's cap (`limits.max_upload_bytes` on the native route), or a compatibility layer's body without `Content-Length` that exceeds it |
| 429 | `rate_limited`, `too_many_streams`, `table_full` | a limit of §9 was hit, or the rate-limit table is full of active clients (with `Retry-After`) |
| 500 | `internal` | unexpected server error |
| 503 | `public_url_required` | networkQuality's `/nq/config` or `/.well-known/nq` cannot build an `https` origin ([compatibility.md §3.3](compatibility.md#33-absolute-url-construction)); never on `/api/v1` |

`message` is English, for logs and debugging; the SPA maps `code` to localized text. Error responses
never echo request bodies or headers.

## 8. Caching, CORS and Compression

- **Caching.** Every `/api/v1` response and `/metrics` MUST carry `Cache-Control: no-store`. SPA
  assets with content-hashed names are served with `Cache-Control: public, max-age=31536000,
  immutable`; `index.html` with `Cache-Control: no-cache`.
- **CORS.** The native API is same-origin: the SPA is served by the same binary. By default no CORS
  headers are sent. Origins listed in `server.cors.allowed_origins` receive
  `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Access-Control-Allow-Methods: GET, POST,
  OPTIONS`, `Access-Control-Allow-Headers: Content-Type` and `Access-Control-Expose-Headers:
  Server-Timing` and `Timing-Allow-Origin: <origin>`, and `OPTIONS` preflights on `/api/v1/*` answer
  `204`. `Timing-Allow-Origin` is required: without it the browser zeroes `requestStart` and
  `responseStart` and blanks `nextHopProtocol` in the Resource Timing entries of cross-origin
  requests, which the engine reads for the HTTP latency fallback, path B and the protocol
  ([measurement.md §12](measurement.md#12-http-loaded-responsiveness)). Compatibility layers send
  their own CORS headers ([compatibility.md](compatibility.md)).
- **Compression.** The server MUST NOT compress any `/api/v1` response, nor `/metrics`, whatever
  the request's `Accept-Encoding`. Throughput bodies are random
  and incompressible, and compression would add CPU cost and latency. SPA assets MAY be served
  precompressed (Brotli or gzip variants embedded at build time) when the request's
  `Accept-Encoding` allows. Proxies SHOULD exclude the API and compatibility routes from
  compression ([edge-cases.md](edge-cases.md)).

## 9. Rate Limits

Limits are per client IP (§1) and held in a bounded in-memory table
([technical-stack/configuration-security.md](technical-stack/configuration-security.md)):

| Limit | Key | Default | Applies to |
| --- | --- | --- | --- |
| Concurrent throughput requests | `limits.max_streams_per_client` | 8 | native download and upload, OpenSpeedTest and LibreSpeed throughput routes |
| New throughput requests per minute | `limits.requests_per_minute` | 1200 | same routes as above |
| WebSocket connections | fixed | 4 | `/api/v1/ws` |
| networkQuality flows | `compat.networkquality.max_flows_per_client` | 32 | `/nq/large`, `/nq/upload` |

- A request over a limit MUST be answered `429` with the error envelope and a `Retry-After` header
  in whole seconds, without reading an upload body. The connection is closed after the response on
  HTTP/1.1 so an unread body does not have to be drained.
- The `429` code is `rate_limited` for the per-minute limit, `table_full` when the rate-limit table
  is full of active clients, and `too_many_streams` for the three concurrency limits: throughput
  requests, WebSocket connections and networkQuality flows.
- `/api/v1/ping`, `/api/v1/small`, `/api/v1/info` and `/metrics` are not counted.
- The engine treats a `429` as a failed request and reads its envelope's `code`. On upload over
  HTTP/1.1 or an unreported protocol any failure ends the phase. Otherwise, on download and on
  upload over HTTP/2 or HTTP/3:
  - `too_many_streams`, or a code that is absent or unknown: it lowers its stream cap and
    continues;
  - `rate_limited` or `table_full`: the stream waits the `Retry-After` and continues, with the
    stream cap unchanged. The engine reads the header on a same-origin response; when it cannot
    read it (a cross-origin response that does not expose it, or a value that is not whole
    seconds) it waits 1 s.

  See [measurement.md §4](measurement.md#4-adaptive-stream-count) and
  [§7.5](measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark).

## 10. `GET /metrics`

- Off by default (`metrics.enabled: false`); when off the path is not mounted and answers a plain
  `404`, without the error envelope. The counters are kept either way; only the endpoint is
  gated.
- `GET` only, mounted under `server.base_path`; any other method answers a plain `405` with
  `Allow: GET`. The endpoint is not rate-limited (§9).
- The format is negotiated from `Accept`: the Prometheus text exposition by default, OpenMetrics
  when the scraper asks for it. The response is never compressed and carries
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- Exposes server-side counters only: requests and bytes per route group, active streams, client
  aborts, rate-limit rejections, upload lifetime timeouts, WebSocket connections, build
  information, Go runtime and process metrics. No per-client label, no client IP, and no measured
  result ever appears, because results never reach the server. The metric set, its labels and its
  buckets are in [technical-stack/backend.md
  §7](technical-stack/backend.md#7-prometheus-metric-set).
- Anyone who can reach the port can read it; deployments that enable it should restrict it at the
  proxy ([security.md](security.md)).

## 11. OpenAPI Outline

The contract is maintained as OpenAPI 3.1 in `api/openapi.yaml` (planned) and drives
`openapi-typescript` types for the SPA. It contains:

- **Paths:** `/api/v1/download`, `/api/v1/upload`, `/api/v1/ping`, `/api/v1/small`,
  `/api/v1/info`, `/api/v1/ws` (documented as a `GET` with a `101` response and the message schemas
  referenced in its description, because OpenAPI does not model WebSocket messages), and
  `/metrics` (tagged `operations`; a `text/plain` or `application/openmetrics-text` response,
  `405` with `Allow: GET` and `500`).
- **Components / schemas:** `UploadTelemetry` (§4), `Info`, `InfoServer`, `InfoClient`,
  `InfoLimits`, `TestDefaults`, `CompatFlags` (§5), `WsPing`, `WsPong` (§6), `Error`, `ErrorBody`
  (§7).
- **Components / headers:** `ServerTiming`, `RetryAfter`, `CacheControlNoStore`.
- **Components / responses:** `BadRequest`, `NotFound`, `MethodNotAllowed`, `RequestTimeout`,
  `LengthRequired`, `PayloadTooLarge`, `RateLimited`, `InternalError`.
- **Tags:** `throughput`, `latency`, `info`, `operations`.

Compatibility routes are not part of the OpenAPI document: they mirror third-party contracts and
are specified in [compatibility.md](compatibility.md). The upload telemetry schema in
`api/openapi.yaml` MUST be identical to §4 here and to
[measurement.md §7.3](measurement.md#73-server-telemetry-per-request).

## 12. Versioning

- The path carries the major version: `/api/v1`. Within v1, changes are additive only (new
  endpoints, new optional query parameters, new response fields); clients MUST ignore unknown
  response fields.
- A breaking change introduces `/api/v2`, served alongside `/api/v1` for at least one minor release
  of BitGauge. Because the SPA is embedded in the same binary, the bundled SPA always matches its
  server; the overlap protects third-party scripts and cached tabs.
- `server.version` in `GET /info` is the BitGauge release version. The result object has its own
  `schemaVersion` ([measurement.md §17](measurement.md#17-result-object)), independent of the API
  version.

## Related

- [Measurement methodology](measurement.md)
- [Compatibility layers](compatibility.md)
- [Configuration](configuration.md)
- [Security model](security.md)
- [Architecture](architecture.md)
- [Backend](technical-stack/backend.md)
