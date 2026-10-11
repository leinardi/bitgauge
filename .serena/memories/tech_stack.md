# bitgauge — Tech Stack

Locked choices live in `docs/features/technical-stack/decisions.md`; this is a summary.

## Backend (Go, planned)

- Module `github.com/leinardi/bitgauge`; Go 1.26 line (`.go-version`, `go.mod` go 1.26.0)
- `net/http` + chi; WebSocket via `coder/websocket`; koanf (`BITGAUGE_` env, `__` nesting),
  validated fail-closed (exit 2); `log/slog`; Prometheus `/metrics` off by default
- golangci-lint v2.14.0, `default: all`, build tags `image,harness` linted; see `mem:conventions`
- depguard denies: logrus/zap/zerolog (slog only), pkg/errors, instana/testify, any database or
  embedded store (`no-storage`), outbound clients (`no-outbound`); forbidigo bans outbound calls
  except the healthcheck's loopback GET (`cmd/bitgauge/healthcheck.go`) and tests

## Frontend (planned, `web/`)

- Vue 3 (Composition API, `<script setup>`), Vite, TypeScript 5.x (capped <6), Tailwind 4,
  shadcn-vue (Reka UI), vue-i18n, uPlot, `idb`; pure SPA, no Nuxt/SSR/TanStack Query
- Engine: framework-free TS in a Web Worker, typed messages, injectable clock and transport
- Tests: Vitest; E2E Playwright 1.64.0 (exact) on Chromium, Firefox, WebKit
- fallow 3.32.0 (exact) dead-code gate with empty baselines

## Image and release

- `deployments/docker/Dockerfile`: `dhi.io/node:24-…-dev`, `dhi.io/golang:1.26-…-dev`,
  `dhi.io/static` runtime, user 65532, read-only; linux/amd64 + linux/arm64; GHCR only
- Releases: svu from Conventional Commits, Trivy, cosign, attestations (`docs/release.md`);
  weekly `rebuild.yaml` refreshes base digests (`.github/scripts/rebuild-bases.sh`)

## Pins held together by tests

- Node line 24 everywhere (`test/toolchain/pins_test.go`); Go line from `.go-version`
- golangci-lint and hadolint: pre-commit rev = CI install
- Playwright harness image tag = `@playwright/test` version (`test/harness`)
