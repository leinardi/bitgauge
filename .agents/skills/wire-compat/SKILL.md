---
name: wire-compat
description: >
  Wire-contract checklist for BitGauge's native handlers and its OpenSpeedTest, LibreSpeed
  and Apple networkQuality compatibility layers. Covers the no-copy rule (documented
  behavior only), the shared building blocks with dependencies pointing inwards, the
  per-route sizes, caps and clamps with their config keys, CORS per layer, the route table
  and its collision check, the exact upload telemetry JSON, and the tests each layer needs.
  Use when editing internal/handlers/**, internal/compat/**, docs/features/wire-protocol.md
  or docs/features/compatibility.md, before writing the change.
---

# Wire Compatibility — BitGauge

BitGauge speaks four wire contracts: its own native API
([wire-protocol.md](../../../docs/features/wire-protocol.md)) and three foreign ones, the
OpenSpeedTest web UI, LibreSpeed clients and Apple `networkQuality`
([compatibility.md](../../../docs/features/compatibility.md)). A foreign contract is matched
exactly, from its documented behavior, and never bends the native API or the engine
([principles.md §2.7](../../../docs/features/principles.md#27-compatibility-is-a-layer-not-the-core)).
Every layer is off by default, has exactly one toggle, and answers the plain `404` of an unmatched
path when disabled.

`internal/handlers` and the three packages under `internal/compat/` exist
([STATUS.md](../../../docs/STATUS.md)).

This skill owns what is specific to the wire. It links instead of repeating:

- [`trust-boundary`](../trust-boundary/SKILL.md): `X-Forwarded-For` and `server.trusted_proxies`,
  the limiter, the WebSocket `Origin` rule, how caps are enforced, CORS details, logging.
- [`api-contract`](../api-contract/SKILL.md): `api/openapi.yaml`, the six native routes and the
  native error envelope.
- [`go-style-guide`](../go-style-guide/SKILL.md): Go and lint rules.
- [`stateless-guard`](../stateless-guard/SKILL.md): no state, no outbound calls, no logging of
  bodies or headers.

How to use it, before writing the change:

1. Change the docs first: wire-protocol.md for a native change, compatibility.md (and its §5
   route table) for a layer, configuration.md for a key.
2. Walk §1–§7 and mark each *applies* or *N/A*.
3. Write the tests of §7 first, then the handler.
4. Run `make verify-go`; on a failure fix the handler or the docs, never the test, and re-run.

---

## 1. Documented behavior only, never copied code

- No code, assets, configuration files or text from OpenSpeedTest, LibreSpeed (`speedtest`,
  `speedtest-go`, `librespeed-cli`) or Apple's reference configurations, whatever their license
  ([decisions.md](../../../docs/features/technical-stack/decisions.md), "Stack Decisions to
  Avoid" and §33; [research/README.md](../../../docs/research/README.md#ideas-only-no-code)).
  Short identifiers (route names, parameters, JSON keys) are quoted only to describe the wire.
- The path of a wire fact: a research page records it with its source
  ([openspeedtest.md](../../../docs/research/openspeedtest.md),
  [librespeed.md](../../../docs/research/librespeed.md),
  [networkquality.md](../../../docs/research/networkquality.md)); compatibility.md turns it into
  the contract; code implements compatibility.md. Behavior missing from compatibility.md is not
  implemented until it is added there.
- BitGauge never ships or serves the OpenSpeedTest or LibreSpeed UI; the user hosts them. The
  names only describe compatibility; OpenSpeedTest™ is a trademark of its owner.
- Deliberately **not** carried over: `/getIP` derives the client IP through the trusted-proxy
  rule of `trust-boundary` §2, like every other consumer; ISP and geolocation lookups
  (`isp=true` and `distance` are ignored, `rawIspInfo` is always `{}`); LibreSpeed's `/results`,
  `/results/telemetry`, `/stats`, `/results/json` and variants (`404`); the clients' overhead
  factors (1.04, 1.06) stay theirs.
- In review, a block whose structure, names or comments mirror an upstream file is a finding
  even when it works.
- [ ] Every wire fact the change relies on is in compatibility.md or wire-protocol.md.

## 2. Shared building blocks, dependencies pointing inwards

Layers translate a foreign contract onto the native building blocks
([backend.md §1](../../../docs/features/technical-stack/backend.md#1-package-map),
[architecture.md §8](../../../docs/features/architecture.md#8-compatibility-layers-as-router-groups)):

| Building block | Package | Native user | Compat users |
| --- | --- | --- | --- |
| Random buffer: 4 MiB from `crypto/rand` at startup, written in slices, no allocation per request | `internal/handlers` | `GET /api/v1/download` | `/downloading`, `/garbage`, `/nq/large` |
| Body drainer: pooled 64 KiB buffer (`sync.Pool`), read and discard | `internal/handlers` | `POST /api/v1/upload` | OpenSpeedTest `POST /upload`, `/empty`, `/nq/upload` |
| Server grid counting | `internal/handlers` | `POST /api/v1/upload` only | none |
| One-byte object (one handler) | `internal/handlers` | `GET /api/v1/small` | `/nq/small` |
| Derived client IP | `internal/clientip` | limiter, `GET /info` | limiter, `/getIP` |
| Bounded per-IP limiter | `internal/ratelimit` | throughput routes, WebSocket | throughput routes, networkQuality flows |

- `internal/compat/*` imports `internal/handlers`, `internal/clientip` and `internal/ratelimit`,
  never the reverse; nothing imports `cmd/`. No lint rule enforces the direction; `test/boundary`
  does: `go list -deps ./internal/handlers/...` must not list an `internal/compat` package.
- Layers cannot reach the native handlers' telemetry, and the native API never depends on a layer.
- Each layer is a chi sub-router built by its own package (`openspeedtest.Routes()`,
  `librespeed.Routes()`, `nq.Routes()`) and mounted only when its toggle is on.
- A layer that needs something a building block lacks extends the block without changing what a
  native route observes; if the native API would change, stop and change the docs. Never copy
  the writer or the drainer into a layer (`dupl`, `go-style-guide` §11).

## 3. Per-route sizes, caps and clamps

Every size is decided before the first byte; `trust-boundary` §5 owns how (`http.MaxBytesReader`,
the read deadline from handler entry, `413` before reading). The values
([compatibility.md](../../../docs/features/compatibility.md),
[backend.md §2.1](../../../docs/features/technical-stack/backend.md#21-download-and-every-response-that-streams-random-bytes),
[configuration.md §2.2](../../../docs/features/configuration.md#22-limits)):

| Route | Size or cap | Config key | Beyond it |
| --- | --- | --- | --- |
| `GET /api/v1/download?bytes=N` | `N` ≥ 1, ≤ cap (default 256 MiB) | `limits.max_download_bytes` | `400` `bytes_out_of_range` |
| `POST /api/v1/upload` | `Content-Length` required, ≤ cap (default 256 MiB) | `limits.max_upload_bytes` | `411`; `413` without reading; `408` after 120 s |
| `GET`, `HEAD /downloading` | always exactly 30 MiB (31 457 280 bytes); `n` ignored | none; startup fails if `limits.max_download_bytes` < 30 MiB | — |
| `POST /upload` (OpenSpeedTest) | body up to 35 MiB (36 700 160 bytes), fixed; `Content-Length` optional | none; startup fails if `limits.max_upload_bytes` < 35 MiB | declared above: `413` without reading; length-less body: read to its end, or `413` and close once past the cap; `408` after 120 s |
| `GET /garbage?ckSize=N` | `N` chunks of 1 MiB; absent: 4; clamped silently to `min(1024, floor(limits.max_download_bytes / 1 MiB))` = 256 with defaults | `limits.max_download_bytes`; startup fails below 1 MiB | above the cap: clamped; not a positive decimal integer: `400` `bad_request` |
| `GET`, `POST /empty` | body ≤ cap; `Content-Length` optional | `limits.max_upload_bytes` | declared above: `413` without reading; length-less body: read to its end, or `413` and close once past the cap; `408` after 120 s |
| `GET /nq/large` | always `Content-Length: 8589934592` (8 GiB), streamed; clients close early | none: not bounded by `limits.max_download_bytes` | only the flow limit |
| `POST /nq/upload` | body ≤ cap (default 1 GiB, range 1 MiB–64 GiB; the default is open decision 1) | `compat.networkquality.max_upload_bytes` | declared `Content-Length` above: `413` without reading; streamed body: read to the cap, then `413` and close; `408` after 120 s |
| `GET /api/v1/small`, `/nq/small` | one byte, `Content-Length: 1` | — | — |

- Streamed bodies: `Content-Length` before the first write, no `Content-Encoding`,
  `Cache-Control: no-store`, a 30 s write deadline set before each write.
- Drained bodies: the whole body is read before the response, on every layer. Only the native
  upload returns telemetry (§6); OpenSpeedTest `/upload`, `/empty` and `/nq/upload` answer an
  empty `200`.
- Limits: both OpenSpeedTest routes, `/garbage` and `/empty` count against
  `limits.max_streams_per_client` (8) and `limits.requests_per_minute` (1200); `/nq/large` and
  `/nq/upload` count only against `compat.networkquality.max_flows_per_client` (32). Every `429`
  carries `Retry-After` in whole seconds.
- Startup conflicts (OpenSpeedTest 30/35 MiB, LibreSpeed 1 MiB, networkQuality needing an `https`
  `server.public_url` or a `trusted_proxies` entry) exit with status 2
  ([configuration.md §4](../../../docs/features/configuration.md#4-fail-closed-validation)).
- A size the docs leave open, such as a zero, negative or non-integer `ckSize`, is a docs change
  first, not a choice made in code.

## 4. CORS per layer

Summary only; the rules, the middleware order and the reasons are in `trust-boundary` §6,
[compatibility.md §1.2](../../../docs/features/compatibility.md#12-cors),
[§2.2](../../../docs/features/compatibility.md#22-cors-and-corstrue) and
[security.md §6](../../../docs/features/security.md#6-compatibility-layers-and-access-control-allow-origin-).

| Group | Response headers | Preflight |
| --- | --- | --- |
| Native `/api/v1` | none by default; exact origins from `server.cors.allowed_origins`, never `*` | `204` |
| OpenSpeedTest | `Access-Control-Allow-Origin: *`, `-Methods: GET, POST, OPTIONS`, `-Headers: Content-Type` on every response | `OPTIONS` `200`, empty |
| LibreSpeed `/garbage`, `/empty` | `*`, `-Methods: GET, POST`, `-Headers: Content-Encoding, Content-Type`, only with `cors=true` | always answered with those headers |
| LibreSpeed `/getIP` | never `*`; with `cors=true` only an origin in `server.cors.allowed_origins`, with `Vary: Origin` | follows the `/getIP` origin rule |
| networkQuality, SPA | none | none answered |

- CORS runs per group before the limiter, so a `429` is readable cross-origin and a preflight
  never reaches the limiter.
- Nothing that returns a client IP (`/getIP`, `GET /api/v1/info`) ever gets `*`.

## 5. Route table and the collision check

[compatibility.md §5](../../../docs/features/compatibility.md#5-route-table) is the one route
table: every route, its methods, owner and toggle; "no two rows match the same path and method". A
new route gets its row there before code, and a native one also follows `api-contract`.

- Why the layers cannot collide
  ([compatibility.md §1.5](../../../docs/features/compatibility.md#15-route-clash-analysis)): the
  native API is entirely under `/api/v1/`, so OpenSpeedTest's `/upload` and `/downloading` at the
  base path root do not overlap `/api/v1/upload`. The SPA answers `index.html` only for `/`,
  `/result/{id}`, `/history`, `/settings` and `/about`, plus `/assets/*`, never as a catch-all.
  LibreSpeed (`/garbage`, `/empty`, `/getIP`, their `backend/` and `.php` spellings,
  `/.well-known/librespeed`) and networkQuality (`/nq/…`, `/.well-known/nq`) use other names;
  networkQuality has its own `/nq/` prefix because Apple's default paths would collide with
  `/api/v1`.
- Collisions are impossible by construction **and** checked at startup; that check is how
  `metrics.path` validation works, and it reuses the router's own route list
  ([backend.md §4](../../../docs/features/technical-stack/backend.md#4-router-groups),
  [configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).
  `metrics.path: /api/v1/info` or `/upload` exits with status 2; configuration.md lists `/upload`
  as rejected without tying it to the OpenSpeedTest toggle.
- Anything else answers `404`: with the error envelope under `/api/v1`, plain elsewhere. A
  disabled layer's routes are not mounted and answer that plain `404`. A mounted route answers a
  method its row does not list with `405`, `Allow` and the envelope; `HEAD` exists only where the
  row lists it, and networkQuality has no `OPTIONS`. networkQuality routes never redirect.
- With a non-root `server.base_path` every route moves under it together, `/.well-known/nq`
  included; the proxy must forward the base path unchanged.

## 6. Upload telemetry, exactly

The native `POST /api/v1/upload` answers `200` with exactly this object
([wire-protocol.md §4](../../../docs/features/wire-protocol.md#4-upload-telemetry)) and the header
`Server-Timing: bg-recv;dur=<durationMs>`:

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

- Exactly these seven keys. `test/docs` (`UploadKeys`) fails when a page under `docs/features`
  shows another set; the OpenAPI `UploadTelemetry` schema must be identical (`api-contract`).
- `bucketMs` is always 100, with no coarsening; `firstBucket = floor(startMs / 100)`; `buckets` has
  at most 1201 entries (1200 cells of the 120 s lifetime, plus one when it starts mid-cell);
  `Σ buckets == bytes`, which equals the request's `Content-Length`.
- `epoch` equals `server.epoch` of `GET /info`. `startMs` and `durationMs` are on the grid's
  timeline: the monotonic clock from process start plus a random whole number of cells, so neither
  wall-clock time nor uptime leaks.
- The response comes only after the body is fully drained. After the 120 s lifetime (a read
  deadline from handler entry) the answer is `408` with the error envelope and no telemetry.
- The counts exist only during the request; no layer reads them.

## 7. Tests each layer needs

Table-driven `net/http/httptest` tests, `go test -race`, a fake clock for every lifetime and
deadline, never a sleep (`go-style-guide` §18). The native handler tests (download, upload,
ping/small, ws, info) are listed in
[testing.md §1](../../../docs/features/technical-stack/testing.md#1-go-handler-tests). For the
layers, testing.md names each layer's routes, statuses, CORS headers (including `/getIP`'s origin
rule), `ckSize` clamping, the networkQuality config JSON and URL construction, and the
route-collision checks. Spelled out from compatibility.md:

### 7.1 Every layer

The shared rules are [compatibility.md
§6](../../../docs/features/compatibility.md#6-rules-every-layer-shares).

- With the toggle off, every route of the layer answers the plain `404` of an unmatched path.
- Every error status carries the native error envelope.
- A method the route-table row does not list answers `405` with `Allow` and `method_not_allowed`;
  `HEAD` only where the row lists it.
- Where the layer sends CORS headers, a `429` carries them too (CORS runs before the limiter).
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` on every response; an empty
  `200` has `Content-Length: 0` and no `Content-Type`; random-data bodies are
  `application/octet-stream`.
- A lying `Content-Length` stops at the cap; an over-cap `Content-Length` gets `413` without the
  body being read; a body without `Content-Length` under the cap is read to its end and answered
  `200`, and one over it gets `413` and a closed connection; `408` after 120 s on every drain.
- An enabled layer's paths are in its classifier group (API headers, envelope on a recovered
  panic); a disabled layer's are not.
- The startup conflicts of §3 exit with status 2 (config tests).

### 7.2 OpenSpeedTest

- `GET /downloading` sends exactly 31 457 280 bytes with `Content-Length`, no `Content-Encoding`;
  `HEAD` sends headers only; `n` changes nothing.
- `GET` and `HEAD /upload` answer `200` with an empty body, never `204`.
- `POST /upload` drains, then `200`; 36 700 160 bytes pass, one byte more is `413`.
- The three CORS headers on every response; `OPTIONS` answers `200`.
- Both routes count against the stream and request-rate limits.

### 7.3 LibreSpeed

- Each route answers in all four spellings: bare, `backend/`, `.php`, both.
- `/garbage`: default 4 chunks of 1 MiB; a `ckSize` above the cap is clamped to it; one that is
  not a positive decimal integer (`0`, `-1`, `1.5`, `abc`, empty) answers `400` `bad_request`; the
  cap follows `limits.max_download_bytes`.
- `/empty`: `GET` and `POST` drain, then `200` empty with `Connection: keep-alive` on HTTP/1.1.
- `/getIP`: JSON `{processedString, rawIspInfo}` with `rawIspInfo: {}`; a public address alone;
  every classification string of compatibility.md §2.1, a leading `::ffff:` stripped; the IP
  derived through trusted proxies only; `isp` and `distance` ignored.
- CORS only with the exact value `cors=true` (`cors=1` sends none); `/getIP` never `*`, only a
  listed origin with `Vary: Origin`, and a preflight from an unlisted origin answers `200` with no
  CORS headers; preflights on `/garbage` and `/empty` always answered.
- `/results`, `/results/telemetry`, `/stats`, `/results/json` and variants answer `404`.
- `/.well-known/librespeed`: `application/json`, `id: 1`, no CORS; the server URL from
  `server.public_url`, else from a trusted peer the first comma-separated, trimmed value of
  `X-Forwarded-Proto` (`http` when absent) and of `X-Forwarded-Host` (the request's `Host` when
  absent or failing the CSP's `Host` validation), else the request's `Host` with `http`; an
  untrusted peer's forwarding headers are ignored.

### 7.4 networkQuality

- `/nq/config` and `/.well-known/nq` return the same JSON with both key sets (Apple's and the
  IETF draft's), all pointing at the same routes.
- URL construction: the shared builder of compatibility.md §6 (`server.public_url` first; then
  only a trusted peer's first, trimmed `X-Forwarded-Proto` and validated `X-Forwarded-Host`);
  a resulting scheme other than `https` answers `503` with code `public_url_required`. An
  untrusted peer's headers never reach a URL.
- `/nq/small` is the `/api/v1/small` handler; `/nq/large` declares 8 589 934 592 bytes and ends on
  the client's close.
- `/nq/upload`: declared over-cap `413` without reading; a streamed over-cap body is read to the
  cap, then `413` and close.
- The flow limit answers `429` with `Retry-After`; no CORS headers, no preflights (`OPTIONS`
  answers `405`), no redirects, no `Content-Encoding`.

---

## Checklist

- [ ] Docs changed first; every wire fact is in wire-protocol.md or compatibility.md
- [ ] No upstream code, assets, configuration or text; research pages cite the source
- [ ] Layers use the native building blocks; nothing in `internal/handlers` imports a layer
- [ ] Every route's size, cap or clamp matches §3 and is decided before the first byte
- [ ] CORS per group as in §4; nothing carrying a client IP gets `*`
- [ ] Route in compatibility.md §5; no collision; disabled layer answers `404`
- [ ] Native upload telemetry exactly the seven keys of wire-protocol.md §4
- [ ] The §7 tests for the touched layer exist and `make verify-go` is green
