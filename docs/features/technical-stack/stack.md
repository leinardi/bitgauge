# Recommended Stack

[Feature index](../README.md) / [Technical Stack](README.md) / Recommended Stack

Versions are the ones Runhold uses today (October 2026), so both projects move together; uPlot and
idb are new to BitGauge and listed at their current major line. Exact versions are pinned when the
project is scaffolded, and Dependabot keeps them current afterwards
([build-packaging.md](build-packaging.md)).

## Backend

| Component | Choice | Version | Notes |
| --- | --- | --- | --- |
| Language | Go | 1.26 | Module `github.com/leinardi/bitgauge`; static build, `CGO_ENABLED=0`. |
| HTTP server | `net/http` | stdlib | Streaming bodies, `io.Discard`-style draining, timeouts. |
| Router | `github.com/go-chi/chi/v5` | v5.3 | Route groups per API and compatibility layer, `net/http`-compatible middleware. |
| WebSocket | `github.com/coder/websocket` | v1.8 | Latency echo at `/api/v1/ws`. |
| Configuration | `github.com/knadh/koanf/v2` | v2.3 | YAML file + `BITGAUGE_` env, `__` nesting, like Runhold. |
| Logging | `log/slog` via `internal/logger` | stdlib | Text or JSON handler, level from config. |
| Metrics | `github.com/prometheus/client_golang` | v1.24 | Optional `/metrics`. |
| API contract | OpenAPI 3.1 | — | `api/openapi.yaml`; no server code generation. |
| SPA embedding | `embed.FS` | stdlib | One binary, no runtime Node. |

No database driver, ORM, migration tool, scheduler or outbound HTTP client.

## Frontend

| Component | Choice | Version | Notes |
| --- | --- | --- | --- |
| Framework | Vue | 3.5 | Composition API, `<script setup>`. |
| Build tool | Vite | 8 | SPA build plus a separate Worker entry for the engine. |
| Language | TypeScript | 5.9 | Strict mode; the engine is plain TypeScript with no framework imports. |
| Routing | Vue Router | 5 | HTML5 history mode under the base path. |
| Styling | Tailwind CSS | 4 | Tokens from the design-system export. |
| Components | shadcn-vue on Reka UI | reka-ui 2 | Copied components in `components/ui/`, no Nuxt. |
| Icons | `@lucide/vue` | 1.x | As in Runhold. |
| i18n | vue-i18n | 11 | Locale files per language ([../ui/i18n-a11y.md](../ui/i18n-a11y.md)). |
| Toasts | vue-sonner | 2 | Non-blocking notices. |
| Charts | uPlot | 1.6 | Canvas time series for 100 ms buckets. |
| Gauge and share image | hand-rolled SVG and Canvas | — | No chart library for the gauge. |
| History storage | idb | 8 | Small typed IndexedDB wrapper. |
| API types | openapi-typescript | 7 | Types generated from `api/openapi.yaml`. |
| Server-state cache | none | — | TanStack Query not adopted ([decisions.md](decisions.md)). |

## Tooling and Testing

| Component | Choice | Version | Notes |
| --- | --- | --- | --- |
| Go lint | golangci-lint | v2 | `default: all` policy with justified exclusions, as in Runhold. |
| Go vulnerabilities | govulncheck | latest | CI. |
| Unit tests (frontend, engine) | vitest | 5 | Engine tests with synthetic timelines. |
| End-to-end | Playwright | 1.60 | Chromium, Firefox, WebKit. |
| Frontend lint | ESLint + `eslint-plugin-vue` + `@intlify/eslint-plugin-vue-i18n` | — | As in Runhold. |
| Accuracy harness | Docker networks shaped with `tc` (tbf/netem), iperf3 reference | — | [testing.md](testing.md). |
| Image signing | cosign (keyless) | — | Release workflow OIDC identity. |
| Dependency updates | Dependabot | — | Weekly: `gomod`, `npm`, `docker`, `github-actions`. |

## Related

- [Technical decisions](decisions.md)
- [Why this stack fits](rationale.md)
- [Backend design](backend.md)
- [Frontend design](frontend.md)
- [Build and packaging](build-packaging.md)
