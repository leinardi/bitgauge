---
name: wire-compat
description: >
  Wire contracts of BitGauge's native API under /api/v1 and its OpenSpeedTest, LibreSpeed and
  Apple networkQuality layers. Spec first: docs, api/openapi.yaml, handler and route, then make
  api-types for web/src/api/types.gen.ts. Covers route parity across docs, OpenAPI and chi, the
  error envelope, the no-copy rule, shared building blocks, per-route sizes, caps and clamps,
  CORS per layer, the route table and collision check, the exact upload telemetry JSON, and each
  layer's tests. Use when changing a route, schema or error code, or editing api/openapi.yaml,
  internal/handlers/*, internal/server routing, web/src/api/*, internal/compat/**,
  docs/features/wire-protocol.md or docs/features/compatibility.md, before writing the change.
---

# Wire Contracts — BitGauge

Four wire contracts: the native API under `/api/v1`
([wire-protocol.md](../../../docs/features/wire-protocol.md)) and the OpenSpeedTest, LibreSpeed
and Apple `networkQuality` layers ([compatibility.md](../../../docs/features/compatibility.md)).
`api/openapi.yaml` (OpenAPI 3.1) is the native contract; wire-protocol.md is its prose source and
wins when they disagree. A foreign contract is matched exactly, from its documented behavior, and
never bends the native API or the engine ([principles.md
§2.7](../../../docs/features/principles.md#27-compatibility-is-a-layer-not-the-core)). Every
layer is off by default, has one toggle, and answers the plain `404` of an unmatched path when
off. Client IP, the limiter, the WebSocket `Origin` rule, cap enforcement, CORS middleware and
logging belong to [`server-invariants`](../server-invariants/SKILL.md).

## 1. Spec-first order

1. Change the docs: wire-protocol.md for a native change, compatibility.md (and its
   [§5 route table](../../../docs/features/compatibility.md#5-route-table)) for a layer or any new
   route, configuration.md for a key. Native: then make `api/openapi.yaml` match.
2. Mark each of §2–§9 *applies* or *N/A*; write the tests of §9 first.
3. Implement the handler. Native routes register in `handlers.Routes()`, mounted by
   `internal/server` under `server.base_path`; a layer registers in its own package's `Routes()`.
4. Native: `make api-types` regenerates `web/src/api/types.gen.ts`; never hand-edit it, commit it
   with the spec.
5. `make verify-go` (and `make verify-web` after `make api-types`). On a failure fix the docs, the
   spec or the handler, never the test.

Within v1 changes are additive only ([wire-protocol.md
§12](../../../docs/features/wire-protocol.md#12-versioning)); a breaking change is `/api/v2`,
served alongside v1 for at least one minor release.

## 2. Native API: route parity, errors, frontend

Docs, spec and router list exactly these six, with these methods: `GET /api/v1/download`,
`POST /api/v1/upload`, `GET`/`HEAD /api/v1/ping`, `GET /api/v1/small`, `GET` (upgrade)
`/api/v1/ws`, `GET /api/v1/info`.

- **Docs:** [wire-protocol.md §2](../../../docs/features/wire-protocol.md#2-endpoint-table) and
  compatibility.md §5. `test/docs` (`NativeEndpoints` in `test/docs/facts.go`) fails when
  `docs/features` names another `/api/v1/<name>`; a seventh endpoint updates that list too.
- **Spec:** the paths of
  [wire-protocol.md §11](../../../docs/features/wire-protocol.md#11-openapi-outline), plus root
  `/metrics` (tag `operations`, `text/plain`, mounted by `metrics.Handler()`). `/api/v1/ws` is a
  `GET` with a `101`; OpenAPI does not model its messages. Compat routes never appear here.
- **Router:** review compares its routes with the spec's paths; no test does.
  `internal/handlers/info_schema_test.go` holds the JSON to the `Info`, `UploadTelemetry` and
  `Error` schemas; the `api-types-generate` hook and `web.yaml`'s `types-drift` catch a stale
  `types.gen.ts`.
- **Errors:** every `/api/v1` error, and every error status of an enabled layer, is
  `application/json` with exactly this shape
  ([wire-protocol.md §7](../../../docs/features/wire-protocol.md#7-error-envelope) lists each
  `code` and status; a new one is a docs change first). `message` is English, for logs; the SPA
  maps `code` to localized text. Never echo the request body or headers. Every `429` carries
  `Retry-After` in whole seconds.

  ```json
  { "error": { "code": "bytes_out_of_range", "message": "bytes must be between 1 and 268435456", "details": { "max": 268435456 } } }
  ```

- **Frontend:** `web/src/api/` holds the generated types and one `GET /info` helper typed with
  `components["schemas"]["Info"]`, never a hand-written API shape. The engine reaches the server
  only through its injected `Transport` and imports only `@/api/types.gen` from there.

## 3. Documented behavior only, never copied code

- Nothing from OpenSpeedTest, LibreSpeed (`speedtest`, `speedtest-go`, `librespeed-cli`) or
  Apple's reference configurations, whatever their license
  ([decisions.md](../../../docs/features/technical-stack/decisions.md) §33,
  [research/README.md](../../../docs/research/README.md#ideas-only-no-code)). Short identifiers
  (route names, parameters, JSON keys) are quoted only to describe the wire.
- A wire fact is recorded with its source on a research page
  ([openspeedtest.md](../../../docs/research/openspeedtest.md),
  [librespeed.md](../../../docs/research/librespeed.md),
  [networkquality.md](../../../docs/research/networkquality.md)), made contract in
  compatibility.md, then implemented. Behavior missing from compatibility.md is not implemented.
- BitGauge never ships or serves the OpenSpeedTest or LibreSpeed UI (OpenSpeedTest™ is a
  trademark of its owner). Deliberately **not** carried over: ISP and geolocation lookups
  (`isp=true` and `distance` ignored, `rawIspInfo` always `{}`); LibreSpeed's `/results`,
  `/results/telemetry`, `/stats`, `/results/json` and variants (`404`); the clients' overhead
  factors. `/getIP` derives the client IP through the trusted-proxy rule like any other consumer.
- In review, a block whose structure, names or comments mirror an upstream file is a finding
  even when it works.

## 4. Shared building blocks, dependencies pointing inwards

Layers translate a foreign contract onto the native building blocks
([backend.md §1](../../../docs/features/technical-stack/backend.md#1-package-map)):

| Building block | Package | Native user | Compat users |
| --- | --- | --- | --- |
| Random buffer: 4 MiB from `crypto/rand` at startup, written in slices, no allocation per request | `internal/handlers` | `GET /api/v1/download` | `/downloading`, `/garbage`, `/nq/large` |
| Body drainer: pooled 64 KiB buffer (`sync.Pool`), read and discard | `internal/handlers` | `POST /api/v1/upload` | OpenSpeedTest `POST /upload`, `/empty`, `/nq/upload` |
| Server grid counting | `internal/handlers` | `POST /api/v1/upload` only | none |
| One-byte object (one handler) | `internal/handlers` | `GET /api/v1/small` | `/nq/small` |
| Derived client IP | `internal/clientip` | limiter, `GET /info` | limiter, `/getIP` |
| Bounded per-IP limiter | `internal/ratelimit` | throughput routes, WebSocket | throughput routes, networkQuality flows |

- `internal/compat/*` imports `internal/handlers`, `internal/clientip` and `internal/ratelimit`,
  never the reverse (`test/boundary`: `go list -deps ./internal/handlers/...` lists no
  `internal/compat` package). Layers cannot reach the native telemetry.
- Each layer is a chi sub-router built by its own package (`openspeedtest.Routes()`,
  `librespeed.Routes()`, `nq.Routes()`), mounted only when its toggle is on.
- A layer that needs more from a building block extends it without changing what a native route
  observes; if the native API would change, change the docs first. Never copy the writer or the
  drainer into a layer.

## 5. Per-route sizes, caps and clamps

Every size is decided before the first byte (`server-invariants` owns how). Defaults, ranges and
limit values: [configuration.md §2.2](../../../docs/features/configuration.md#22-limits) and
[§2.4](../../../docs/features/configuration.md#24-compatibility-toggles); streaming and draining:
[backend.md §2.1][stream] and [§2.2][drain]. The table keeps the wire constants code needs:

[stream]: ../../../docs/features/technical-stack/backend.md#21-download-and-every-response-that-streams-random-bytes
[drain]: ../../../docs/features/technical-stack/backend.md#22-upload-and-every-route-that-drains-a-body

| Route | Size or cap | Beyond it |
| --- | --- | --- |
| `GET /api/v1/download?bytes=N` | `1 ≤ N ≤ limits.max_download_bytes` | `400` `bytes_out_of_range` |
| `POST /api/v1/upload` | `Content-Length` required, ≤ `limits.max_upload_bytes` | `411`; `413` without reading |
| `GET`, `HEAD /downloading` | always exactly 31 457 280 bytes (30 MiB); `n` ignored | — |
| `POST /upload` (OpenSpeedTest) | fixed 36 700 160 bytes (35 MiB); `Content-Length` optional | compat drain rule |
| `GET /garbage?ckSize=N` | `N` chunks of 1 MiB; absent: 4; clamped silently to `min(1024, floor(limits.max_download_bytes / 1 MiB))` | not a positive decimal integer: `400` `bad_request` |
| `GET`, `POST /empty` | ≤ `limits.max_upload_bytes`; `Content-Length` optional | compat drain rule |
| `GET /nq/large` | always `Content-Length: 8589934592` (8 GiB), streamed; not bounded by `limits.max_download_bytes`; ends on the client's close | only the flow limit |
| `POST /nq/upload` | ≤ `compat.networkquality.max_upload_bytes` | compat drain rule, but a streamed body is read to the cap, then `413` and close |
| `GET /api/v1/small`, `/nq/small` | one byte, `Content-Length: 1` | — |

- Compat drain rule: a declared over-cap `Content-Length` gets `413` without reading; a body
  without one is read to its end, or `413` and close once past the cap. Every drain, native
  included, is read whole before the response and answers `408` after the 120 s lifetime. Only
  the native upload returns telemetry (§8); the compat drains answer an empty `200`.
- Streamed bodies: `Content-Length` before the first write, no `Content-Encoding`,
  `Cache-Control: no-store`, a 30 s write deadline set before each write.
- Both OpenSpeedTest routes, `/garbage` and `/empty` count against the stream and request-rate
  limits; `/nq/large` and `/nq/upload` only against the networkQuality flow limit.
- Startup conflicts (caps below 30/35 MiB for OpenSpeedTest or 1 MiB for LibreSpeed;
  networkQuality without an `https` `server.public_url` or a `trusted_proxies` entry) exit 2
  ([configuration.md §4](../../../docs/features/configuration.md#4-fail-closed-validation)).

## 6. CORS per layer

Rules and reasons: [compatibility.md §1.2](../../../docs/features/compatibility.md#12-cors),
[§2.2](../../../docs/features/compatibility.md#22-cors-and-corstrue), [security.md §6][sec6].

[sec6]: ../../../docs/features/security.md#6-compatibility-layers-and-access-control-allow-origin-

| Group | Response headers | Preflight |
| --- | --- | --- |
| Native `/api/v1` | none by default; exact origins from `server.cors.allowed_origins`, never `*` | `204` |
| OpenSpeedTest | `Access-Control-Allow-Origin: *`, `-Methods: GET, POST, OPTIONS`, `-Headers: Content-Type` on every response | `OPTIONS` `200`, empty |
| LibreSpeed `/garbage`, `/empty` | `*`, `-Methods: GET, POST`, `-Headers: Content-Encoding, Content-Type`, only with `cors=true` | always answered with those headers |
| LibreSpeed `/getIP` | never `*`; with `cors=true` only an origin in `server.cors.allowed_origins`, with `Vary: Origin` | follows the `/getIP` origin rule |
| networkQuality, SPA | none | none answered |

CORS runs per group before the limiter, so a `429` is readable cross-origin and a preflight never
reaches the limiter. Nothing that returns a client IP (`/getIP`, `GET /api/v1/info`) gets `*`.

## 7. Route table and the collision check

[compatibility.md §5](../../../docs/features/compatibility.md#5-route-table) is the one route
table: every route, its methods, owner and toggle; no two rows match the same path and method.

- Collisions are impossible by construction
  ([compatibility.md §1.5](../../../docs/features/compatibility.md#15-route-clash-analysis):
  native under `/api/v1/`, the SPA's `index.html` never a catch-all, networkQuality under `/nq/`)
  **and** checked at startup against the router's own route list, which is also how
  `metrics.path` is validated ([backend.md §4][groups]).
- Anything else answers `404`: with the error envelope under `/api/v1`, plain elsewhere. A
  disabled layer's routes are not mounted. A mounted route answers a method its row does not list
  with `405`, `Allow` and `method_not_allowed`; `HEAD` exists only where the row lists it, and
  networkQuality has no `OPTIONS` and never redirects.
- With a non-root `server.base_path` every route moves under it together, `/.well-known/nq`
  included; the proxy must forward the base path unchanged.

[groups]: ../../../docs/features/technical-stack/backend.md#4-router-groups

## 8. Upload telemetry, exactly

The native `POST /api/v1/upload` answers `200` with exactly this object
([wire-protocol.md §4](../../../docs/features/wire-protocol.md#4-upload-telemetry)) and the header
`Server-Timing: bg-recv;dur=<durationMs>`:

```json
{ "epoch": "k3V9qW2rT0aY", "bucketMs": 100, "firstBucket": 1234567,
  "buckets": [6144, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 6144],
  "bytes": 122880, "startMs": 123456750, "durationMs": 1000 }
```

- Exactly these seven keys. `test/docs` (`UploadKeys`) fails when a page under `docs/features`
  shows another set; the OpenAPI `UploadTelemetry` schema must be identical.
- `bucketMs` is always 100, with no coarsening; `firstBucket = floor(startMs / 100)`; `buckets` has
  at most 1201 entries (1200 cells of the 120 s lifetime, plus one when it starts mid-cell);
  `Σ buckets == bytes`, which equals the request's `Content-Length`.
- `epoch` equals `server.epoch` of `GET /info`. `startMs` and `durationMs` are on the grid's
  timeline: the monotonic clock from process start plus a random whole number of cells, so neither
  wall-clock time nor uptime leaks. The counts exist only during the request; no layer reads them.

## 9. Tests

Table-driven `net/http/httptest` tests, `go test -race`, a fake clock for every lifetime and
deadline, never a sleep. Native handler tests:
[testing.md §1](../../../docs/features/technical-stack/testing.md#1-go-handler-tests). Layer tests,
spelled out from compatibility.md and its
[§6 shared rules](../../../docs/features/compatibility.md#6-rules-every-layer-shares):

### 9.1 Every layer

- With the toggle off, every route answers the plain `404`; an enabled layer's paths are in its
  classifier group (API headers, envelope on a recovered panic), a disabled layer's are not.
- Every error status carries the envelope; an unlisted method answers `405` as in §7; where the
  layer sends CORS headers, a `429` carries them too.
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` on every response; an empty
  `200` has `Content-Length: 0` and no `Content-Type`; random-data bodies are
  `application/octet-stream`.
- Every branch of the §5 drain rule, and a lying `Content-Length` stopping at the cap; the §5
  startup conflicts exit with status 2 (config tests).

### 9.2 OpenSpeedTest

- `GET /downloading` sends the exact §5 byte count with `Content-Length`, no `Content-Encoding`;
  `HEAD` sends headers only; `n` changes nothing.
- `GET` and `HEAD /upload` answer `200` with an empty body, never `204`; `POST /upload` drains,
  then `200`; the §5 cap passes, one byte more is `413`.
- The three CORS headers on every response, `429` included; `OPTIONS` answers `200`.

### 9.3 LibreSpeed

- Each route answers in all four spellings: bare, `backend/`, `.php`, both.
- `/garbage`: the default, the clamp following `limits.max_download_bytes`, and `400`
  `bad_request` for `0`, `-1`, `1.5`, `abc` and empty.
- `/empty`: `GET` and `POST` drain, then `200` empty with `Connection: keep-alive` on HTTP/1.1.
- `/getIP`: JSON `{processedString, rawIspInfo}` with `rawIspInfo: {}`; a public address alone;
  every classification string of [compatibility.md §2.1][ls21], a leading `::ffff:` stripped; the
  IP derived through trusted proxies only.
- CORS only with the exact value `cors=true` (`cors=1` sends none); `/getIP` only a listed origin
  with `Vary: Origin`, and a preflight from an unlisted origin answers `200` with no CORS headers.
- `/.well-known/librespeed`: `application/json`, `id: 1`, no CORS; every branch of the URL rule
  of [compatibility.md §2.4][wk], and an untrusted peer's forwarding headers ignored.

[ls21]: ../../../docs/features/compatibility.md#21-routes-and-parameters
[wk]: ../../../docs/features/compatibility.md#24-well-knownlibrespeed-bitgauge-convention

### 9.4 networkQuality

- `/nq/config` and `/.well-known/nq` return the same JSON with Apple's and the IETF draft's key
  sets; a URL ([compatibility.md §3.3][nq33]) whose scheme is not `https` answers `503`
  `public_url_required`; an untrusted peer's headers never reach a URL.
- `/nq/small` is the `/api/v1/small` handler; `/nq/large` and `/nq/upload` as in §5; the flow
  limit answers `429` with `Retry-After`; no CORS headers, `OPTIONS` answers `405`, no redirects,
  no `Content-Encoding`.

[nq33]: ../../../docs/features/compatibility.md#33-absolute-url-construction

## Checklist

- [ ] Docs first; OpenAPI, `handlers.Routes()` and regenerated `types.gen.ts` agree with them
- [ ] Documented error `code`s only; compat routes out of OpenAPI; no upstream code or text
- [ ] Building blocks shared; sizes and caps as in §5, CORS as in §6, no route collision
- [ ] Upload telemetry exactly the seven keys of §8
- [ ] The §9 tests exist; `make verify-go` (and `make verify-web`) green
