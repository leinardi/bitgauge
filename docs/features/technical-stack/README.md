# Technical Stack

[Feature index](../README.md) / Technical Stack

This section defines the implementation stack for BitGauge. It is grouped separately because the
technical decisions can evolve independently from the product specification. Everything here is
planned: no code exists yet.

## Sections

- [Recommended stack](stack.md)
- [Why this stack fits BitGauge](rationale.md)
- [Technical decisions (locked + open)](decisions.md)
- [Backend design](backend.md)
- [Frontend design](frontend.md)
- [Configuration and security internals](configuration-security.md)
- [Build and packaging](build-packaging.md)
- [Testing strategy and accuracy harness](testing.md)
- [AI-assisted development guidelines](ai-guidelines.md)
- [Architecture](../architecture.md)

## MVP Stack

Keep the MVP intentionally small:

```text
Backend:
  Go 1.26, one static binary (CGO_ENABLED=0)
  net/http + go-chi/chi v5
  REST + OpenAPI 3 (api/openapi.yaml)
  coder/websocket (latency echo)
  knadh/koanf v2 (YAML + BITGAUGE_ env)
  log/slog via internal/logger
  Prometheus client_golang
  embed.FS for the SPA

Frontend:
  Vue 3 + Vite + TypeScript, Vue Router
  shadcn-vue components on Reka UI primitives, Tailwind CSS 4
  lucide icons, vue-i18n, vue-sonner
  Measurement engine: framework-free TypeScript in a Web Worker
  uPlot (live charts), hand-rolled SVG (gauge), Canvas (share image)
  idb (IndexedDB history)
  openapi-typescript (API types)

Quality:
  golangci-lint v2 (all linters), vitest, Playwright, accuracy harness
```

No database, no ORM, no server-state cache, no SSR.

## Final Recommendation

```text
One Go binary with an embedded Vue 3 SPA
A stateless HTTP API that streams, drains, echoes and describes itself
A framework-free measurement engine in a Web Worker, tested with synthetic timelines
Browser-only history in IndexedDB
TLS, HTTP/2 and HTTP/3 at the reverse proxy
One signed multi-arch image on dhi.io/static
```

This keeps the server trivially safe to run on a LAN or a Raspberry Pi, puts the methodology where
it can be tested deterministically, and reuses the stack and habits already proven in Runhold where
they apply.

## Related

- [Architecture](../architecture.md)
- [Measurement methodology](../measurement.md)
- [Configuration](../configuration.md)
- [Security model](../security.md)
- [Roadmap](../roadmap.md)
