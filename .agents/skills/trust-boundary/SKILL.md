---
name: trust-boundary
description: >
  Fail-closed checklist for BitGauge code that decides who a client is, how much it
  may do, or what the server believes about a request. Covers config validation
  (exit status 2), X-Forwarded-For through server.trusted_proxies only, the bounded
  per-IP rate limiter, the WebSocket Origin rule, per-route body and size caps,
  CORS per route group, what is never logged, and the unprivileged read-only image.
  Use when editing internal/config/**, internal/clientip/**, internal/ratelimit/**,
  internal/server/** middleware or router assembly, any handler that reads a body
  or a header, internal/compat/**, or the Dockerfile, before writing the change.
---

# Trust Boundary — BitGauge

A trust boundary is any place where something outside the server becomes something the server
believes: a config value becomes a limit, a header becomes a client IP, an `Origin` becomes a
WebSocket slot, a request body becomes work. Every item below exists because the cheap version of
that translation fails open: it grants more than intended when the input is empty, unknown,
hostile, or simply large.

BitGauge has no authentication, sessions or secrets: its boundaries are about identity for limits,
bytes, and what leaves the process. The Go packages named here exist since v0.1, except
`internal/metrics` (since v0.2) and `internal/compat/` (v0.3, not built yet); the image tests
exist.

How to use it, before writing the change:

1. Walk sections 1–9 and mark each one *applies* or *N/A* for this change.
2. For each item that applies, write the test it names first (the handler tests of
   [testing.md §1](../../../docs/features/technical-stack/testing.md#1-go-handler-tests) live
   beside their packages in `internal/`).
3. Make the change, then run `make verify-go` (a Dockerfile change: `make go-test-image`).
4. Fix and re-run until green; finish with the checklist at the end.

---

## 1. Configuration fails closed

`internal/config` validates the whole effective configuration before the listener opens
([configuration.md §4](../../../docs/features/configuration.md#4-fail-closed-validation),
[configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).

- Every error is collected, logged one line each with `key`, `value` and `rule`, and the process
  exits with status **2** without serving. Nothing is clamped or silently defaulted.
- Unknown keys are errors (koanf decode with `ErrorUnused`); a `BITGAUGE_*` variable without `__`
  is not a key and is ignored, so Kubernetes service links (`BITGAUGE_PORT`) cannot break startup.
- Enum-like values are rejected outside their set; `server.cors.allowed_origins` rejects `*`;
  `server.trusted_proxies` rejects an invalid CIDR. Suspicious but valid settings only `warn`.
- [ ] New key has a rule and a table test covering a rejected value, exit status 2 and the log line.

## 2. A header is believed only from a trusted proxy

`internal/clientip` derives the client IP once per request, in middleware, and stores it in the
context; the limiter, `/info`, `/getIP` and debug logs all use that value
([configuration-security.md §4](../../../docs/features/technical-stack/configuration-security.md#4-trusted-proxies-and-client-ip-derivation)).

- The client is the TCP peer unless the peer is inside `server.trusted_proxies` (empty by default).
  Only then is `X-Forwarded-For` walked from the right, skipping trusted entries; the first
  untrusted address is the client. A malformed entry falls back to the peer.
- `X-Real-IP`, `Client-IP`, `CF-Connecting-IP`, `CF-Connecting-IPv6` and `Forwarded` are **never**
  read. `::ffff:`-mapped addresses are normalized to IPv4.
- `X-Forwarded-Proto` and `X-Forwarded-Host` build networkQuality and LibreSpeed URLs only under
  the same trusted-peer condition, through one builder: the first comma-separated value of each,
  trimmed; `http` without a forwarded scheme; the request's `Host` when the forwarded host fails
  the CSP's `Host` validation
  ([compatibility.md §6](../../../docs/features/compatibility.md#6-rules-every-layer-shares)).
- [ ] A new header-derived fact goes through the trusted-peer check, never the raw header.
- [ ] A test proves an untrusted peer's header and a spoofed left-hand entry are ignored.

## 3. The rate limiter is bounded and keyed on the full address

`internal/ratelimit`
([configuration-security.md §5](../../../docs/features/technical-stack/configuration-security.md#5-bounded-rate-limiter)):

- **Key:** the derived client IP, the full IPv4 or IPv6 address. Keying IPv6 by `/64` was rejected:
  on a LAN every SLAAC host shares one `/64` and would share one budget.
- **Limits:** `limits.max_streams_per_client` (8), `limits.requests_per_minute` (1200), 4
  WebSockets (fixed), `compat.networkquality.max_flows_per_client` (32). `ping`, `small`, `info`,
  the SPA, `/metrics` and preflights are not limited.
- **Bound:** at most `limits.tracked_clients` (4096) entries; the least recently seen *idle* entry
  is evicted. Entries with active work are never evicted; when all are active the new client gets
  `429` (`table_full`) and a `warn` line.
- **Release** in `defer`, so an aborted transfer frees its slot. `429` carries `Retry-After` in
  whole seconds (at least 1) and is sent before any upload body is read, with `Connection: close`
  on HTTP/1.1.
- [ ] New limit declares its default, its key and how it is released.
- [ ] A test shows an untrusted spoofed header cannot select its own bucket.

## 4. The WebSocket handshake checks `Origin`

`/api/v1/ws` accepts an `Origin` whose host and port equal the request's `Host` (the scheme is not
compared: behind a TLS proxy BitGauge sees `http`), an origin in `server.cors.allowed_origins`, or
no `Origin` at all (non-browser clients). Anything else is `403`, so another site cannot use up a
visitor's four slots
([wire-protocol.md §6](../../../docs/features/wire-protocol.md#6-websocket-apiv1ws)).

- Read limit 256 bytes (close 1009); binary frames close 1003; malformed JSON 1007; 120 s without
  a message closes 1000. The fifth connection from one IP is `429`.
- [ ] Tests cover a foreign origin, another scheme, an allowed origin and no origin.

## 5. Every body and size has a cap, decided before the first byte

| Route | Cap |
| --- | --- |
| `GET /api/v1/download` | `bytes` ≤ `limits.max_download_bytes` (256 MiB), else `400` `bytes_out_of_range` |
| `POST /api/v1/upload` | `Content-Length` required (`411`); above `limits.max_upload_bytes` (256 MiB) `413` without reading; 120 s lifetime, then `408` |
| OpenSpeedTest `/downloading`, `/upload` | always 30 MiB down; upload bodies up to a fixed 35 MiB, else `413`; a length-less body read to its end or `413` and close past the cap; 120 s lifetime |
| LibreSpeed `/garbage`, `/empty` | `ckSize` clamped silently to its cap, `400` when not a positive decimal integer; `/empty` bodies ≤ `limits.max_upload_bytes`, a length-less body read to its end or `413` and close past the cap |
| networkQuality `/nq/upload`, `/nq/large` | upload ≤ `compat.networkquality.max_upload_bytes` (1 GiB), streamed bodies read to the cap then `413` and close; `/nq/large` bounded by the flow limit only |
| WebSocket message | 256 bytes |

- Every route that drains a body wraps it in `http.MaxBytesReader`, so a lying `Content-Length`
  stops at the cap
  ([backend.md §2.2](../../../docs/features/technical-stack/backend.md#22-upload-and-every-route-that-drains-a-body)).
- The upload lifetime is a read deadline from **handler entry** through `http.ResponseController`;
  downloads get a 30 s per-write stall deadline. The server has `ReadHeaderTimeout` 10 s,
  `IdleTimeout` 120 s, `MaxHeaderBytes` 16 KiB, and no global `ReadTimeout` or `WriteTimeout`.
- [ ] New route states its cap in the docs and enforces it before reading or writing.
- [ ] A test sends a lying `Content-Length` and an over-cap request.

## 6. CORS and headers are per route group

CORS runs per group, before the limiter, so a `429` is readable cross-origin and preflights never
reach the limiter
([backend.md §3](../../../docs/features/technical-stack/backend.md#3-middleware-chain-order)).

| Group | CORS |
| --- | --- |
| Native `/api/v1` | none by default; exact origins in `server.cors.allowed_origins` only, never `*`; includes `Timing-Allow-Origin`; preflights `204` |
| OpenSpeedTest | `Access-Control-Allow-Origin: *` on every response; `OPTIONS` `200` |
| LibreSpeed `/garbage`, `/empty` | `*`, only when the request carries `cors=true`; preflights always answered |
| LibreSpeed `/getIP` | never `*`: with `cors=true`, only an origin in `server.cors.allowed_origins`, with `Vary: Origin` |
| networkQuality, SPA | none; no preflights |

- API, compatibility and `/metrics` responses carry `X-Content-Type-Options: nosniff` and
  `Cache-Control: no-store`; the SPA gets the CSP and isolation headers of
  [security.md §5](../../../docs/features/security.md#5-content-security-policy-and-security-headers).
  The CSP's `ws://`/`wss://` host comes from `Host` only after validation as a hostname.
- [ ] A new route belongs to one group and inherits its CORS; nothing returns `*` with private data.

## 7. Headers, bodies and messages are never logged

Never, at any level: request or response bodies, upload data, WebSocket message contents, request
headers (`User-Agent`, `Referer`, cookies, forwarding headers), query strings beyond the route
pattern. The per-request line exists only at `debug`: method, route pattern, status, bytes,
duration, derived client IP
([configuration-security.md §6](../../../docs/features/technical-stack/configuration-security.md#6-what-is-logged-and-never-logged)).
Error responses never echo a body or a header; metrics carry no client IP or per-client label.

- [ ] New log line names only those fields; new metric has no per-client label.

## 8. Routes cannot collide or shadow each other

Each group is a chi sub-router; compatibility layers mount only when their toggle is on, and a
disabled layer answers `404`. The SPA answers `index.html` only for its fixed route list, never as a
catch-all, and `metrics.path` is checked against the route table at startup
([compatibility.md §5](../../../docs/features/compatibility.md#5-route-table)). A native route
change also follows the `api-contract` skill.

- [ ] Route added to compatibility.md §5 and, if native, to `api/openapi.yaml`.

## 9. The image stays unprivileged and read-only

`deployments/docker/Dockerfile` runs `dhi.io/static`, pinned by tag, as `USER 65532:65532`,
spelled out rather than inherited; no shell, `HEALTHCHECK` is `bitgauge healthcheck`
([security.md §9](../../../docs/features/security.md#9-container-hardening)). `test/dockerfiles`
asserts the declaration; `test/image` (`make go-test-image`) runs the image with `--read-only`,
`--cap-drop ALL` and `no-new-privileges`, checks it is not root, that it writes nothing and that it
makes no outbound connection.

- [ ] No new `USER root`, capability, volume or writable path.
- [ ] A Dockerfile change that touches the runtime stage is checked with `make go-test-image`.

---

## Two rules that outrank convenience

- **Stateless:** no database, no file write, no volume, nothing kept beyond the bounded in-memory
  counters. The depguard and forbidigo rules pinned by `test/boundary` guard the imports.
- **No outbound calls, ever:** no network client in the server, no external URL in the SPA.

## Checklist

- [ ] New config validated at load, fail closed, exit status 2, by key name
- [ ] Client IP from the trusted-proxy derivation only; never `X-Real-IP` and friends
- [ ] Limiter bounded, keyed on the full derived address, released in `defer`
- [ ] WebSocket `Origin` rule intact
- [ ] Every body and size capped before reading; `http.MaxBytesReader` on drains
- [ ] CORS per group; no `*` on anything carrying a client IP
- [ ] Nothing new logged beyond the debug line's fields
- [ ] Routes in the route table; no collision, no catch-all
- [ ] Image stays `65532`, read-only, capability-free
