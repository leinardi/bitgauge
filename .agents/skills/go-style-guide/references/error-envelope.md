# Error envelope — BitGauge

Detail for §17 of [the Go style guide](../SKILL.md). Read it before writing an error response, a
`429`, a panic-recovery path or a compatibility route's failure. The contract is
[wire-protocol.md §7](../../../../docs/features/wire-protocol.md#7-error-envelope); this page
quotes it and adds the coding rules around it. When the two disagree, the wire protocol wins.

## The shape

Every error response from `/api/v1`, except the `204`/`200` success paths and the WebSocket close
codes, and every error status of an enabled compatibility layer's routes
([compatibility.md §6](../../../../docs/features/compatibility.md#6-rules-every-layer-shares)),
carries `Content-Type: application/json` and:

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
| 503 | `public_url_required` | networkQuality's `/nq/config` or `/.well-known/nq` cannot build an `https` origin; never on `/api/v1` |

- `code` is the stable contract: the SPA maps it to localized text. `message` is English, for logs
  and debugging. `details` carries machine-readable context, such as the limit for
  `bytes_out_of_range`.
- Error responses never echo request bodies or headers, and neither do the log lines written for
  them ([configuration-security.md
  §6](../../../../docs/features/technical-stack/configuration-security.md#6-what-is-logged-and-never-logged)).
- The OpenAPI document models the envelope as `Error` and `ErrorBody`, with the shared responses
  `BadRequest`, `NotFound`, `MethodNotAllowed`, `RequestTimeout`, `LengthRequired`,
  `PayloadTooLarge`, `RateLimited` and `InternalError`
  ([wire-protocol.md §11](../../../../docs/features/wire-protocol.md#11-openapi-outline)). A new
  code starts as a docs change to §7 and lands in `api/openapi.yaml`, which the SPA's
  types are generated from; never invent one in a handler.

## Statuses with extra rules

- **`429`** carries a `Retry-After` header in whole seconds, and is answered without reading an
  upload body; on HTTP/1.1 the connection is closed after the response so the unread body need not
  be drained ([wire-protocol.md §9](../../../../docs/features/wire-protocol.md#9-rate-limits)). The
  limiter runs after the route group's CORS step, so a cross-origin client can read the status and
  `Retry-After`
  ([backend.md §3](../../../../docs/features/technical-stack/backend.md#3-middleware-chain-order)).
- **`413`** is decided from the declared `Content-Length` without reading the body. A lying
  `Content-Length` is caught by `http.MaxBytesReader` and answered `413` with the connection
  closed ([backend.md §2](../../../../docs/features/technical-stack/backend.md#2-handler-rules)).
- **`408`** on upload comes from the 120 s read deadline counted from handler entry, and carries
  no telemetry.
- **`400`** for `GET /api/v1/download`: a missing, non-integer, zero or negative `bytes` is a
  `400`; a value above `limits.max_download_bytes` is `bytes_out_of_range` with the limit in
  `details` ([wire-protocol.md
  §3.1](../../../../docs/features/wire-protocol.md#31-get-apiv1downloadbytesn)).
- **`404`** is the envelope only under `/api/v1`; unknown paths elsewhere get a plain `404`
  ([backend.md §4](../../../../docs/features/technical-stack/backend.md#4-router-groups)).
- **`500`** from panic recovery is the envelope on API routes; the panic is logged with the route
  pattern, never with the request
  ([backend.md §3](../../../../docs/features/technical-stack/backend.md#3-middleware-chain-order)).

Not covered by the §7 table: the WebSocket handshake also answers `400` and `403` (foreign
`Origin`), and §7 names no code for that `403`. Do not invent one; settle it in wire-protocol.md
first.

## One writer

The envelope has one writer, `handlers.WriteError` in `internal/handlers/errors.go` (and
`handlers.ErrorWriter`, the same writer as a value for packages that take it as an interface, such
as `ratelimit.Middleware`). The native handlers, the middleware (panic recovery, the limiter, the
`/api/v1` not-found handler) and `internal/compat/nq` all use it; never write a second
one. Compat packages may depend on
the native building blocks but never the reverse
([backend.md §1](../../../../docs/features/technical-stack/backend.md#1-package-map)), so the
writer does not live under `internal/compat`. A hand-built JSON error body at a call site is the
thing to avoid: the SPA switches on `code`, and a bespoke shape leaves it unable to tell what
happened.

## Compatibility layers keep their upstream wire formats

The routes under `internal/compat` mirror third-party contracts and are not
part of the OpenAPI document. They answer with the statuses and bodies
[compatibility.md](../../../../docs/features/compatibility.md) specifies for each client, not with
the native envelope:

- OpenSpeedTest's ping (`GET`/`HEAD /upload`) answers `200` with an empty body, never `204`: that
  client expects `200` as the ping reply.
- Disabled layers' routes answer `404`.
- Success bodies (empty `200`s, LibreSpeed's `/getIP` JSON, the networkQuality config JSON) follow
  the upstream shapes.

The docs name two places where a compat route does use the envelope; follow them, and do not
extend the list without a docs change:

- **`/nq/config`** answers `503` with the envelope, code `public_url_required`, when it cannot
  build its absolute `https://` URLs
  ([compatibility.md §3.3](../../../../docs/features/compatibility.md#33-absolute-url-construction)).
- **`429`** from the shared rate limiter: wire-protocol.md §9 specifies "the error envelope and a
  `Retry-After` header" for every limit in its table, which includes the OpenSpeedTest and
  LibreSpeed throughput routes and the networkQuality flows; compatibility.md §3.1 repeats the
  `Retry-After` rule for the networkQuality routes.

Where compatibility.md gives a compat route a status but no body (`413`, `408`, a `50x`), it does
not specify the body. Ask, or settle it in compatibility.md, rather than guessing.
