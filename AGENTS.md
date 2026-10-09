# AGENTS.md

## What this is

**BitGauge**: self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s to multi-Gbit. One stateless Go binary with an embedded Vue SPA; the
measurement engine runs in the browser. Optional compatibility layers for OpenSpeedTest,
LibreSpeed and Apple `networkQuality` clients.

**Status: specification phase, no code yet.** Full spec:
[`docs/features/`](docs/features/README.md). Per-feature implementation status:
[`docs/STATUS.md`](docs/STATUS.md); check it before assuming a feature exists or not.

## Components

All **planned**; none exists yet. Package details:
[`docs/features/architecture.md` §9](docs/features/architecture.md#9-planned-package-layout).

- **`cmd/bitgauge/`**: the binary; `serve` (default) and `healthcheck` subcommands.
- **`internal/`**: `buildinfo`, `config` (koanf), `logger` (slog), `server` (router, middleware,
  shutdown), `handlers` (native API), `clientip`, `ratelimit`, `metrics`, and `compat/`
  (`openspeedtest`, `librespeed`, `nq`).
- **`api/openapi.yaml`**: the native API contract; the SPA's types are generated from it.
- **`web/`**: Vue 3 SPA embedded through `web/embed.go`; `web/src/engine/` is the framework-free
  measurement engine that runs in a Web Worker.

## Common commands

None exist yet. Planned targets, from
[`build-packaging.md` §3](docs/features/technical-stack/build-packaging.md#3-planned-make-targets);
this section becomes the authoritative list once they exist:

```bash
make go-build          # build ./dist/bitgauge for the host platform (embeds web/dist)
make go-test           # go test -race ./...
make go-lint           # golangci-lint v2, all linters
make web-build         # npm ci && npm run build in web/
make web-test          # vitest (unit, component, engine)
make web-lint          # eslint + vue-tsc
make e2e               # Playwright on Chromium, Firefox, WebKit
make harness-ci        # accuracy harness, CI tier profiles
make check             # pre-commit on all files
make docker-build      # local multi-stage image for the host platform
make docker-run        # run the image read-only on :8080
```

## Commit messages

All commits are Conventional Commits 1.0.0 **with a scope**: `<type>(<scope>)[!]: <description>`,
optional blank-line body and footers. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`,
`build`, `ci`, `chore`, `style`, `revert`. Breaking changes use `!` before `:` or a
`BREAKING CHANGE:` footer. Examples: `docs(measurement): define the upload grace`,
`feat(engine): add the stream ramp`, `fix(upload): count bytes on the server grid`.

Release versions are derived by `svu` from the commits since the last tag, so a wrong type ships a
wrong version:

| Release | Commit |
| --- | --- |
| major | any type with `!` before the colon, or a `BREAKING CHANGE:` footer |
| minor | `feat` |
| patch | `fix` |
| none | everything else |

Pick the type by whether the change should ship: anything users should receive in the binary, the
image or the web app is `fix` or `feat`. See [`docs/release.md`](docs/release.md).

## Validation matrix

To be filled when code exists. Until then, for a docs change:

| You edited | Check |
| --- | --- |
| `docs/**/*.md`, root `*.md` | every relative link resolves; numbers, probe-path names and the upload JSON shape still agree across `measurement.md`, `wire-protocol.md`, `configuration.md`, `ui/` and `glossary.md`; lines wrap at about 100 columns |
| `docs/features/technical-stack/decisions.md` | each locked decision appears once; open items match `docs/features/open-questions.md` |

## Project rules

- **Spec first.** No product code before the specifications are approved: nothing under `cmd/`,
  the `internal/` packages of
  [architecture §9](docs/features/architecture.md#9-planned-package-layout), `web/src/`, or
  `api/openapi.yaml` content. Tooling may land earlier: build files, linters and their
  configuration, CI and release workflows, test harnesses and meta-tests, agent skills, editor
  configuration. It must not encode product behaviour that the docs do not specify. A change in
  behaviour still starts as a docs change; code follows the docs.
- **Docs are the source of truth.** When code and docs disagree, the docs win until changed
  deliberately; [`decisions.md`](docs/features/technical-stack/decisions.md) wins on technical
  choices.
- **Stateless server.** No database, no file writes, no volume, no stored results.
- **No outbound calls, ever.** No telemetry, update checks, CDNs, external fonts or lookups.
- **No copied code or assets** from OpenSpeedTest, LibreSpeed or any other speed test; their
  documented behaviour is used for ideas and wire compatibility only.
- **Engine stays framework-free**: no DOM, no Vue, no app imports in `web/src/engine/`.
- **golangci-lint v2 with all linters** must pass.
- **Honest numbers.** No fudge factors, no hidden smoothing, no number without its qualifiers.

The full rules list: [`ai-guidelines.md`](docs/features/technical-stack/ai-guidelines.md).

## Architecture

Decisions are **locked** in
[`docs/features/technical-stack/decisions.md`](docs/features/technical-stack/decisions.md), which
wins over any summary. Key points:

- Single Go 1.26 binary, module `github.com/leinardi/bitgauge`, SPA via `embed.FS`, one image on
  `dhi.io/static`, user 65532, linux/amd64 and linux/arm64, GHCR only.
- `net/http` + chi; native API under `/api/v1` (OpenAPI 3); WebSocket via `coder/websocket`; root
  `/metrics` (configurable, off by default); koanf with `BITGAUGE_` env and `__` nesting;
  `log/slog`.
- Measurement engine: framework-free TypeScript in a Web Worker, typed messages, injectable clock
  and transport, tested with synthetic timelines.
- Upload is timed by the server on a 100 ms grid; the headline is the steady-window average.
- Frontend: Vue 3, Vite, TypeScript, Tailwind 4, shadcn-vue (Reka UI), vue-i18n, uPlot, `idb`.
- TLS at the reverse proxy only.

Full section: [`docs/features/architecture.md`](docs/features/architecture.md).

## Docs layout note

`docs/features/` is the product and technical contract, `docs/research/` holds ideas from prior
art, `docs/engineering/` working notes, and `docs/design_system/` the Claude Design export once it
lands. Then `docs/features/{product.md,principles.md,ui/}` become **symlinks** into
`docs/design_system/features/`, and either path edits the same file (Windows:
`git config core.symlinks true`). Until then they are ordinary files
([`docs/README.md`](docs/README.md#symlink-contract)). Never hand-edit the export.

## Core constraint

**The server never stores a result and never calls out.** Results live only in the user's browser.
Never add server-side storage, a file write, any state beyond the bounded in-memory counters for
limits and metrics, or any outbound network client
([`principles.md`](docs/features/principles.md#22-stateless-server)).

## Frontend constraints

Never introduce: Nuxt, SSR (pure SPA), TanStack Query (one `GET /info` and no server state),
class-based Vue components (Composition API + `<script setup>` only), or any external URL. The
engine imports nothing from Vue, the DOM or application code. Until the design export lands, use
shadcn-vue defaults and no hand-authored visual design; behaviour follows
[`docs/features/ui/`](docs/features/ui/README.md).

## Go / backend constraints

- `golangci-lint` v2, all linters, must pass; a suppression needs `//nolint:<linter> // reason`.
- Handlers hold no state beyond the request; download allocates nothing per request; upload drains
  before responding.
- Never log request bodies, headers or WebSocket messages.
- Client IP from `X-Forwarded-For` only through `server.trusted_proxies`; never `X-Real-IP` and
  similar headers.
- Configuration is read-only and validated fail-closed (exit status 2).
