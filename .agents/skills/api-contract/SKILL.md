---
name: api-contract
description: >
  Spec-first workflow for BitGauge's native HTTP API under /api/v1: change the docs,
  then api/openapi.yaml, then the handler and route, then regenerate
  web/src/api/types.gen.ts with make api-types. Covers the wire-protocol error
  envelope and route parity for the six native endpoints between the docs, the
  OpenAPI document and the chi router; compatibility layers stay outside OpenAPI.
  Use when adding or changing a native route, response schema or error code, or
  touching api/openapi.yaml, internal/handlers/*, internal/server routing, or
  web/src/api/*.
---

# API Contract — BitGauge

`api/openapi.yaml` (OpenAPI 3.1) is the native API's contract;
[wire-protocol.md](../../../docs/features/wire-protocol.md) is its prose source and wins when they
disagree. Plain HTTP and JSON under `/api/v1`, chi on `net/http`. Every code path below exists
since v0.1, except the root `/metrics` handler (`internal/metrics`), which exists since v0.2.

---

## 1. Spec-first order

1. Change wire-protocol.md first (and the route table of compatibility.md §5 for a route change).
2. Edit `api/openapi.yaml` to match: paths, schemas, headers, error responses.
3. Implement the handler in `internal/handlers` and register it in `handlers.Routes()`, which
   `internal/server` mounts under `server.base_path`.
4. `make api-types` regenerates `web/src/api/types.gen.ts` with `openapi-typescript`. Never
   hand-edit it; commit it with the spec. The `api-types-generate` pre-commit hook and the
   `types-drift` step of `web.yaml` fail when it drifts from the contract, and
   `internal/handlers/info_schema_test.go` checks the handlers' JSON against the contract's
   `Info`, `UploadTelemetry` and `Error` schemas.
5. Run `make verify-go` and `make verify-web`. On a failure, fix the spec or the handler, never the
   test, and re-run until both are green.

Within v1 changes are additive only; a breaking change is `/api/v2`, served alongside v1 for at
least one minor release (wire-protocol.md §12).

## 2. Route parity

Docs, spec and router list exactly these six, with these methods: `GET /api/v1/download`,
`POST /api/v1/upload`, `GET`/`HEAD /api/v1/ping`, `GET /api/v1/small`, `GET` (upgrade)
`/api/v1/ws`, `GET /api/v1/info`.

- **Docs:** wire-protocol.md §2 and compatibility.md §5. `test/docs` (`NativeEndpoints` in
  `test/docs/facts.go`) fails when `docs/features` names any other `/api/v1/<name>`; a seventh
  endpoint updates that list in the same change.
- **Spec:** the paths of wire-protocol.md §11, plus `/metrics` (tag `operations`, `text/plain`),
  which sits at the root and is mounted by `metrics.Handler()`, not `handlers.Routes()`.
  `/api/v1/ws` is a `GET` with a `101`; OpenAPI does not model its messages.
- **Router:** another method answers `405` with `Allow`; an unknown `/api/v1` path answers `404`
  with the envelope. `internal/handlers/info_schema_test.go` holds the `/info` body to the spec's
  schemas; no test compares the router's route list with the spec's paths, so review does.

## 3. Error envelope

Every `/api/v1` error is `Content-Type: application/json` with exactly this shape
([wire-protocol.md §7](../../../docs/features/wire-protocol.md#7-error-envelope)):

```json
{ "error": { "code": "bytes_out_of_range", "message": "bytes must be between 1 and 268435456", "details": { "max": 268435456 } } }
```

- Codes: `bad_request`, `bytes_out_of_range` (400), `not_found` (404), `method_not_allowed`
  (405), `request_timeout` (408), `length_required` (411), `payload_too_large` (413),
  `rate_limited`, `too_many_streams`, `table_full` (429, with `Retry-After`), `internal` (500). A
  new code is a docs change first.
- `message` is English, for logs; the SPA maps `code` to localized text. Never echo the request
  body or headers. Spec schemas `Error` and `ErrorBody`, and the shared responses listed in
  wire-protocol.md §11.

## 4. Compatibility layers are not in OpenAPI

OpenSpeedTest, LibreSpeed and networkQuality routes mirror third-party contracts and are specified
only in [compatibility.md](../../../docs/features/compatibility.md). They answer what their client
expects, never change the native API, and the native API never depends on them.

## 5. Frontend side

- `web/src/api/` holds the generated types and one typed fetch helper for `GET /info`, typed with
  `components["schemas"]["Info"]`; no hand-written duplicate of an API shape.
- One `GET /info` and no server state: no TanStack Query, no store library, no list envelopes.
- The engine reaches the server only through its injected `Transport` and imports nothing from
  `web/src/api/` except `@/api/types.gen`.

---

## Checklist

- [ ] Docs changed first; `api/openapi.yaml` matches wire-protocol.md
- [ ] Docs, spec and `handlers.Routes()` agree on the six endpoints and methods
- [ ] `make api-types` run; `types.gen.ts` not hand-edited, committed with the spec
- [ ] Errors use the §7 envelope with a documented `code`; compat routes stay out of the spec
- [ ] `make verify-go` + `make verify-web` green
