# Why This Stack Fits BitGauge

[Feature index](../README.md) / [Technical Stack](README.md) / Rationale

## A Stateless Speed Test Needs Very Little Server

BitGauge's server streams random bytes, drains request bodies, echoes WebSocket pings and answers
one JSON document. Everything else (sampling, ramping, warm-up, statistics, grades, history) runs
in the browser. The stack is chosen for that shape.

## Go and `net/http`

- **Streaming without overhead.** `net/http` writes response bodies from a reused buffer and reads
  request bodies in a loop with no allocation per request, which is what multi-Gbit throughput
  needs. Per-read timestamps for the upload grid come for free in that loop.
- **One static binary.** `CGO_ENABLED=0` produces a self-contained executable that runs on
  `dhi.io/static`, on amd64 and arm64, with no shell and no libc.
- **Small dependency surface.** chi, koanf (with its YAML parser and file and env provider
  modules, and a YAML library), coder/websocket and client_golang are the only direct dependency
  families, which keeps the supply chain short and Dependabot noise low.
- **Graceful shutdown and timeouts** are standard library features. Only upload bodies have a
  bounded lifetime (120 s); responses have no write deadline, because `/nq/large` streams for as
  long as the client reads, and third-party clients' fixed-size downloads (OpenSpeedTest's 30 MiB,
LibreSpeed's `ckSize` chunks) can legitimately take minutes on a slow link.
  Stalled writers are detected per write instead ([backend.md](backend.md)).

## A Framework-Free Engine in a Worker

- The methodology is the product, so it must be testable without a browser: the engine takes an
  injectable clock and transport, and unit tests replay synthetic timelines (slow links, h2 vs h1,
  cancellations, server restarts) deterministically.
- Running in a Web Worker keeps timing away from main-thread rendering, and Workers support both
  `fetch` streaming (download) and `XMLHttpRequest` upload progress (upload).
- Keeping Vue out of the engine means the engine could later drive a headless CLI client
  ([roadmap.md](../roadmap.md)).

## Vue 3, Vite and TypeScript

- Same frontend stack as Runhold, so components, lint rules, i18n tooling and Playwright setup
  carry over.
- Vite builds the SPA and the Worker entry, and the output embeds cleanly in the Go binary.
- shadcn-vue on Reka UI gives accessible primitives and lets the Claude Design export's tokens
  drive Tailwind without fighting a component library's theme.

## Canvas Charts, SVG Gauge, IndexedDB

- **uPlot** draws thousands of 100 ms points per second on canvas with a tiny bundle; the
  Continuous mode's tiered rings feed it at most about 2000 points.
- The **gauge** is a single logarithmic dial and the **share image** a fixed layout; hand-rolled
  SVG and Canvas are smaller and easier to make accessible than a chart library.
- **idb** wraps IndexedDB's request API in promises and types and nothing else; the history schema
  is one object store.

## Runhold Habits Kept

- chi + REST + OpenAPI 3 with `openapi-typescript`.
- koanf with `BITGAUGE_` and `__` nesting, fail-closed validation.
- The `internal/logger` slog wrapper.
- golangci-lint v2 with all linters.
- Vue 3 + Vite + shadcn-vue + Tailwind 4 + vue-i18n + vue-sonner + lucide; vitest and Playwright.
- `dhi.io/static`, `65532:65532`, cosign, SBOM, provenance, Dependabot.
- The release model of swarm-scheduler-exporter, which has shipped releases: build, scan and
  verify before an immutable tag, recovery by re-run, no rebuild of a published version.
- Docs structure: feature index, breadcrumbs, locked decisions with alternatives not chosen.

## Runhold Habits Dropped, and Why

| Runhold habit | Why BitGauge drops it |
| --- | --- |
| SQLite, `sqlc`, `goose` | No server-side persistence at all; the server must stay stateless. |
| TanStack Query | One `GET /info` per run; nothing to cache or invalidate. |
| Docker Go SDK, agents, agent auth | BitGauge manages nothing; it is a measurement endpoint. |
| Authentication, authorisation, audit log | No users, no actions to audit, nothing stored to protect; auth, if wanted, belongs to the proxy. |
| Cron scheduler, notifications | No background work; scheduled tests are run by external clients such as `librespeed-cli`. |
| xterm.js, log streaming | No terminals or logs to show. |
| Separate agent image | One binary, one image. |

## Related

- [Recommended stack](stack.md)
- [Technical decisions](decisions.md)
- [Architecture](../architecture.md)
- [Principles](../principles.md)
