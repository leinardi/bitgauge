# AGENTS.md

## What this is

**BitGauge**: self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s to multi-Gbit. One stateless Go binary with an embedded Vue SPA; the
measurement engine runs in the browser. Optional compatibility layers for OpenSpeedTest,
LibreSpeed and Apple `networkQuality` clients.

**Status: implemented, not yet released; specification approved by the maintainer on
2026-10-12.** The product, the engineering scaffold (build files, linters, CI, release
scripts, test harnesses, agent skills) and the demo build are in place. The release waits for the
manual steps of [`docs/release.md`](docs/release.md#how-to-release). Full spec:
[`docs/features/`](docs/features/README.md). Per-feature implementation status:
[`docs/STATUS.md`](docs/STATUS.md); check it before assuming a feature exists or not.

## Components

The product exists, and [`docs/STATUS.md`](docs/STATUS.md) gives the status per feature area.
Package details: [`docs/features/architecture.md`
§9](docs/features/architecture.md#9-planned-package-layout).

- **`cmd/bitgauge/`**: the binary; `serve` (default) and `healthcheck` subcommands.
- **`internal/`**: `buildinfo`, `config` (koanf), `logger` (slog), `server` (router, middleware,
  shutdown), `handlers` (native API), `clientip`, `ratelimit`, `metrics`, and `compat/`
  (`openspeedtest`, `librespeed`, `nq`).
- **`api/openapi.yaml`**: the native API contract; the SPA's types are generated from it.
- **`web/`**: Vue 3 SPA embedded through `web/embed.go`; `web/src/engine/` is the framework-free
  measurement engine that runs in a Web Worker.

The tooling **exists**:

- **`Makefile`, `.mk/`**: shared snippets from `leinardi/make-common@v1` (`docker.mk`, `help.mk`,
  `go.mk`, `pre-commit.mk`, `web.mk`, `parity.mk`) plus repo-local ones; never add recipes to
  `Makefile` itself.
- **`test/`**: meta-tests, all real Go packages. `test/toolchain` (pins,
  vacuous flags, untagged-test rules, engine boundary, fallow and install-scripts gates),
  `test/docs` (links, anchors, doc facts), `test/boundary` (the `.golangci.yaml` stateless rules),
  `test/dockerfiles`, `test/deployments` (the deployment examples), one package per
  `scripts/check-*.sh`, `test/image` (`-tags=image`), `test/harness` (the accuracy harness; runners
  `-tags=harness`), and `test/internal/` (`netguard`, `syscalltrace`, `testenv`, `toolgate`,
  `gitenv`).
- **`web/`** tooling only: `package.json` (devDependencies), its lockfile, `.npmrc`, the
  TypeScript, ESLint, Vite and Playwright configurations, `web/harness/` (the harness's
  browser driver) and `web/parity/` (the demo parity harness, with `.parity-baseline` at the root).
- **`deployments/docker/Dockerfile`**: the image (`web`, `build` and `runtime` stages on
  `dhi.io`); `test/harness/tools.Dockerfile` the harness's tools image.
- **`deployments/examples/`**: the compose, Traefik, Caddy and nginx examples of
  `deployment-example.md`, held to it by `test/deployments`.
- **`scripts/`**: the `check-*` hooks, `idle-measure.sh`, `bootstrap-mk-common.sh`, and
  `hooks/gofmt-on-edit.sh` (the Claude Code edit hook).
- **`.github/`**: `ci.yaml`, `go-test.yaml`, `scheduled-scan.yaml`, the cache warm-ups, the
  `setup-hadolint` action, the release helpers in `.github/scripts/` with their `*.test.sh`,
  Dependabot and the issue and pull request templates.
- **`.agents/skills/`** (also reachable as `.claude/skills`): the project skills and the vendored
  upstream ones pinned in `skills-lock.json`; **`.serena/`**: the Serena project and memories.

### Generated or vendored: never hand-edit

- `web/src/api/types.gen.ts`: regenerate with `make api-types` after editing
  `api/openapi.yaml`.
- `web/src/components/ui/`: vendored shadcn-vue; extend by composition only.
- `.mk/{docker,help,go,pre-commit,web,parity}.mk`: refreshed from make-common with `make mk-common-update`.
- The vendored skills listed in `skills-lock.json`: byte-exact copies, checked by their
  `computedHash`.

## Common commands

`make help` lists every target.

```bash
make check             # pre-commit on all files: the authoritative local gate, same as CI
make check-stage       # pre-commit on the staging area only
make pre-commit-install  # install the pre-commit and commit-msg hooks
make go-test           # go test -race ./...
make go-vet            # go vet (make go-vet-image / go-vet-harness for the tagged packages)
make go-lint           # golangci-lint v2, all linters, at the pre-commit pin
make go-tidy           # go.mod and go.sum tidy and verified
make verify-go         # go-build, go-test, go-vet (also image, harness), go-lint
make verify-web        # web-lint and web-test
make verify            # both of the above
make audit-deps        # pinned govulncheck -test ./... and npm audit in web/ (network)
make go-build          # ./dist/bitgauge for the host platform, embedding whatever web/dist holds
make go-run            # run the binary (ARGS="...")
make run               # build, then serve on 0.0.0.0:8080 (LAN) until Ctrl+C (RUN_PORT, RUN_BIND, ARGS)
make build             # web-build, then go-build: the binary with the current SPA embedded
make web-install       # npm ci in web/
make web-build         # install the dependencies when needed, then vite build into web/dist
make web-dev           # Vite dev server
make web-demo          # Vite dev server in demo mode: the engine against a simulated link
make web-build-demo    # the demo SPA into web/dist-demo, which never ships
make web-test          # Vitest: unit, component, engine
make web-lint          # ESLint, then vue-tsc
make api-types         # regenerate web/src/api/types.gen.ts from api/openapi.yaml
make e2e               # Playwright on Chromium, Firefox, WebKit, host-built binary
make docker-build      # the image for the host platform, into the local daemon (dhi.io)
make docker-run        # run the image read-only on 127.0.0.1:8080, DOCKER_RUN_BIND
make go-test-image     # build the image, test it under netguard and strace (dhi.io)
# the probe and netguard tests alone (Docker, no dhi.io):
go test -tags=image -v -run 'Probe|Count|Blind' ./test/image/ ./test/internal/netguard/
make harness-ci        # accuracy harness, CI tier (Docker, dhi.io, netem)
make harness-floor     # accuracy harness, manual range floor (Docker)
make harness-ceiling   # accuracy harness, manual range ceiling, unshaped (Docker)
make harness-continuous # Continuous memory check, manual (Docker, dhi.io, netem)
make harness-sweep     # remove stale harness environments, list the kept ones
make harness-sweep-all # remove every harness environment (CONFIRM=1)
make idle-measure      # idle CPU and memory of a running binary (IDLE_PIDS="bitgauge=PID")
make idle-bench        # per-request server cost of ping, small, info and / (IDLE_PIDS, BENCH_URL)
make demo-parity         # compare the kit's prototype with the Vue demo (SCENARIO=, MATRIX=full)
make demo-parity-full    # the same over all four theme × viewport projects
make demo-parity-update  # drop .parity-baseline entries a complete run no longer finds
make demo-parity-accept  # accept a complete run's new differences (REASON= required)
make demo-parity-report  # the HTML report of the last parity run
make demo-parity-servers # the prototype on :5183 and the demo build on :5182, to look at by hand
make demo-parity-browsers # install the Chromium the parity harness drives, when it is missing
make demo-parity-triage   # the triage helper over .parity-triage.json and the last run (CMD=...)
make mk-common-update  # refresh the shared make-common snippets
```

Harness inputs: `HARNESS_PROFILES`, `HARNESS_BROWSERS`, `HARNESS_KEEP_ON_FAILURE=1`,
`HARNESS_SHAPE=none`, and for `harness-continuous` `HARNESS_CONTINUOUS_MINUTES` (default 60, at
least 6) ([runbook](docs/engineering/accuracy-harness.md)). `go test ./test/...` with
`BITGAUGE_REQUIRE_TOOLS=1` turns a missing golangci-lint, ESLint or fallow into a failure instead
of a skip, as CI's `repo-gates` job does. Demo parity is on demand, never CI: it fetches the
export's scripts from `unpkg.com` on its first run ([runbook](docs/engineering/demo-parity.md)).

## Commit messages

All commits are Conventional Commits 1.0.0 **with a scope**: `<type>(<scope>)[!]: <description>`,
optional blank-line body and footers. Enforced by the `conventional-pre-commit` `commit-msg` hook
(`--force-scope`) and by the `conventional-commits` CI job. Types: `feat`, `fix`, `docs`, `test`,
`refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`. Breaking changes use `!` before `:`
or a `BREAKING CHANGE:` footer. Release notes are not built from these messages: they list the
merged pull requests by title. Examples: `docs(measurement): define the upload grace`,
`feat(engine): add the stream ramp`, `fix(upload): count bytes on the server grid`.

Release versions are derived by `svu` from the commits since the last tag, so a wrong type ships a
wrong version:

| Release | Commit | Example |
| --- | --- | --- |
| major | any type with `!` before the colon, or a `BREAKING CHANGE:` footer | `feat(api)!: rename the upload telemetry fields` |
| minor | `feat` | `feat(engine): add the stream ramp` |
| patch | `fix` | `fix(upload): count bytes on the server grid` |
| none | everything else: `perf`, `refactor`, `build`, `ci`, `chore`, `docs`, `style`, `test`, `revert` | `docs(measurement): define the upload grace` |

The highest bump among the commits wins; with only "none" commits since the last tag, a release
with no version fails with "nothing to bump".

**Pick the type by whether the change should ship, not by what kind of change it is.** Anything
that changes the shipped binary, the image or the web app and that users should receive is `fix`
(or `feat`), even when it is a performance improvement, a refactor or a revert. Use `perf`,
`refactor`, `style` and `revert` only when the commit is deliberately not meant to trigger a
release on its own. A `revert` of a shipped `feat` or `fix` is itself a `fix`. `svu` matches
`feat`/`fix` anywhere in the subject (e.g. `prefix:` counts as `fix:`), so avoid a word ending in
`feat` or `fix` directly before a colon in other subjects. Pull requests land as merge commits, so
every commit counts, not just the pull request title. See [`docs/release.md`](docs/release.md).

## Validation matrix

Run before considering an edit done. `make check` applies to every row.

| You edited | Run |
| --- | --- |
| `**/*.go` | `make verify-go`, then `make check-stage` |
| `web/src/**` | `make verify-web` |
| `web/src/demo/**`, the demo gates in `useWorker.ts`, `api/info.ts`, `App.vue` | the `web/src/**` row; `BITGAUGE_REQUIRE_TOOLS=1 go test ./test/toolchain/` (the demo's ESLint blocks); `make web-build`, then `scripts/check-dist-demo-free.sh web/dist`; `make web-build-demo`, on which the same check must fail |
| `web/parity/**`, `web/playwright.parity.config.ts`, `PARITY_PROTOTYPE_PAGE` in `Makefile` | `make verify-web` (lint, typecheck), `npm --prefix web run test:parity` (the parity unit tests and `coverage.test.ts`), `make help` |
| `.parity-baseline` | never by hand: only `make demo-parity-update` or `make demo-parity-accept REASON=` after a complete full-matrix run ([demo-parity.md](docs/engineering/demo-parity.md#the-baseline)) |
| `api/openapi.yaml` | spec first (`api-contract` skill); `make api-types`, `go test ./internal/handlers/` (the contract tests), then `make verify-web` |
| `deployments/examples/**`, `docs/features/deployment-example.md` | `go test ./test/deployments/` (the compose files' hardening and healthcheck timings, and the README's compose block), `go test -count=1 ./test/docs/`; `docker compose -f deployments/examples/<example>/compose.yaml config` |
| `deployments/docker/Dockerfile`, `test/harness/tools.Dockerfile` | `go test ./test/dockerfiles/ ./test/toolchain/` (hadolint runs in `make check`); `make go-test-image` (Docker, `dhi.io`) |
| `go.mod`, `go.sum`, `web/package.json`, `web/package-lock.json` | `make audit-deps` (network; the commit hooks run the same targets), `go test ./test/toolchain/` |
| `web/eslint.config.ts`, `web/.npmrc`, `.fallowrc.json`, `.fallow-baseline.json`, `.fallow-regression-baseline.json`, `.mk/audit-deps.mk` | `BITGAUGE_REQUIRE_TOOLS=1 go test ./test/toolchain/` (needs `web/node_modules`) |
| `.golangci.yaml` depguard and forbidigo boundary rules | `go test ./test/boundary/`, then `make go-lint` |
| `scripts/check-license-headers.sh` | `go test ./test/licenseheaders/` |
| `scripts/check-dist-demo-free.sh` | `go test ./test/distdemo/`; shellcheck (in `make check`) |
| `scripts/check-dist-urls.sh`, `.dist-url-allowlist` | `go test ./test/disturls/`; shellcheck (in `make check`) |
| `scripts/check-chunk-size.sh`, `.chunk-budget` | `go test ./test/chunksize/`; shellcheck (in `make check`) |
| `scripts/hooks/gofmt-on-edit.sh` | shellcheck (in `make check`); no test package: run it once by editing a `.go` file in Claude Code |
| `scripts/bootstrap-mk-common.sh` | shellcheck (in `make check`); it comes from make-common, so a change is ported upstream; `make help` proves the snippets still load |
| `scripts/idle-measure.sh`, `.mk/idle-measure.mk` | `shellcheck scripts/idle-measure.sh`, `make help`; no test package: it needs a running binary |
| `.github/scripts/binary-attestation-status.sh` | `bash .github/scripts/binary-attestation-status.test.sh` (also the `release-scripts` CI job) |
| `.github/workflows/**`, `.github/actions/**` | `pre-commit run actionlint --all-files`, `go test ./test/toolchain/` (pins, vacuous flags) |
| `.pre-commit-config.yaml`, `Makefile`, `.mk/**` | `make check`, `go test ./test/toolchain/`, `make help` |
| `web/e2e/**`, `web/playwright.config.ts`, `.mk/e2e.mk` | `make e2e` on all three browsers (WebKit needs its system libraries: `npm --prefix web exec -- playwright install --with-deps webkit`), `make verify-web` (ESLint and the `tsconfig.e2e.json` typecheck cover `web/e2e/`) |
| `test/harness/**`, `web/harness/**` | `go test ./test/harness/`, `make go-vet-harness`; a runner change, `make harness-ci` (Docker, `dhi.io`, netem), or one profile and browser with `HARNESS_PROFILES` and `HARNESS_BROWSERS` |
| `test/image/**`, `test/internal/netguard/**`, `test/internal/syscalltrace/**` | `go test ./test/internal/...` (untagged), `make go-vet-image`, and (Docker, `dhi.io`) `make go-test-image`; without `dhi.io`, the probe and netguard tests alone: `go test -tags=image -v -run 'Probe\|Count\|Blind' ./test/image/ ./test/internal/netguard/` |
| `.agents/skills/**` | own skills: the `docs/**` row, and every command, path and anchor a skill names still exists (`make help`); vendored skills are never edited (`skills-lock.json` hashes them) |
| `docs/**/*.md`, root `*.md` | `go test -count=1 ./test/docs/`; every relative link resolves; numbers, probe-path names and the upload JSON shape still agree across `measurement.md`, `wire-protocol.md`, `configuration.md`, `ui/` and `glossary.md`; lines wrap at about 100 columns (`spec-change` skill) |
| `docs/features/technical-stack/decisions.md` | each locked decision appears once; open items match `docs/features/open-questions.md` |

## Suppressions and file length

A `//nolint` names its linter and gives a reason (`//nolint:<linter> // reason`; `nolintlint`
enforces it). Prefer fixing the finding. Production `web/src` `.vue` and `.ts` files stay under 400
lines (ESLint `max-lines`); generated, vendored and test code is exempt. Split a long file rather
than exempt it.

## No gate passes on nothing

No `--passWithNoTests`, `|| true`, `continue-on-error` or `if: false`
(`test/toolchain/vacuous_flags_test.go`). Untagged tests never need Docker: Docker-dependent tests
sit behind `//go:build image` or `harness`. `idle-measure`, `idle-bench` and demo parity run on
demand.

## Project skills

Read the matching skill in `.agents/skills/` before editing:

- `spec-change`: any `docs/**` change, `docs/STATUS.md`, `decisions.md`, open questions.
- `go-style-guide`: any `.go` file, `.golangci.yaml`.
- `stateless-guard`: anything that could store, write or call out; `internal/**`, the CSP, the
  dist URL allowlist.
- `trust-boundary`: configuration, client IP and trusted proxies, rate limits, WebSocket Origin,
  body caps, CORS, Dockerfiles.
- `api-contract`: `api/openapi.yaml`, the native handlers and routes, `web/src/api/*`.
- `wire-compat`: the native handlers' wire shapes and `internal/compat/**`.
- `measurement-engine`: `web/src/engine/**`, engine tests and synthetic timelines.
- `vue-page-patterns`: `web/src/**` pages, components and their tests.
- `accuracy-harness`: `test/harness/**`, `web/harness/**`, `.mk/harness.mk`, harness reports.
- `design-system-guard`: anything under `web/src/**` that renders; the tokens, the design export's
  app kit and `docs/features/ui/` it is built from.
- `demo-parity`: `web/src/demo/**`, `web/parity/**`, reading `docs/design_system/ui_kits/app/**`, a
  failing parity run or coverage test; parity runs are on demand.
- `parity-triage`: working through parity differences as clusters in `.parity-triage.json`; the
  user decides every conflict.
- `adversarial-review`: reviewing any set of changes.

The vendored upstream skills (`vue-best-practices`, `vue-debug-guides`,
`vue-router-best-practices`, `vue-testing-best-practices`, `create-adaptable-composable`,
`fallow`) apply to their own topics and are never edited here.

## Project rules

- **Spec first.** The approved specification is the contract; a behavior change still starts as
  a docs change, and code follows the docs. Product code (`cmd/`, the `internal/` packages of
  [architecture §9](docs/features/architecture.md#9-planned-package-layout), `web/src/`,
  `api/openapi.yaml`) implements what the docs specify and nothing else; tooling must not encode
  product behavior that the docs do not specify either.
- **Docs are the source of truth.** When code and docs disagree, the docs win until changed
  deliberately; [`decisions.md`](docs/features/technical-stack/decisions.md) wins on technical
  choices.
- **Stateless server.** No database, no file writes, no volume, no stored results.
- **No outbound calls, ever.** No telemetry, update checks, CDNs, external fonts or lookups.
- **No copied code or assets** from OpenSpeedTest, LibreSpeed or any other speed test; their
  documented behavior is used for ideas and wire compatibility only.
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
art, `docs/engineering/` working notes, and `docs/design_system/` the Claude Design export, with the
app UI kit in `ui_kits/app/`. `docs/features/{product.md,principles.md,measurement.md,ui/}` are
**symlinks** into `docs/design_system/features/`, and either path edits the same file (Windows:
`git config core.symlinks true`); an edit there is pasted into the Claude Design project so the
next export carries it ([`docs/README.md`](docs/README.md#design-export)). Never hand-edit the rest
of the export.

## Core constraint

**The server never stores a result and never calls out.** Results live only in the user's browser.
Never add server-side storage, a file write, any state beyond the bounded in-memory counters for
limits and metrics, or any outbound network client
([`principles.md`](docs/features/principles.md#22-stateless-server)).

## Frontend constraints

Never introduce: Nuxt, SSR (pure SPA), TanStack Query (one `GET /info` and no server state),
class-based Vue components (Composition API + `<script setup>` only), or any external URL. The
engine imports nothing from Vue, the DOM or application code. Visuals come only from the design
export in `docs/design_system/`, with shadcn-vue defaults for anything it does not cover and no
hand-authored visual design; behavior follows [`docs/features/ui/`](docs/features/ui/README.md),
which wins where the export disagrees.

## Go / backend constraints

- `golangci-lint` v2, all linters, must pass; a suppression needs `//nolint:<linter> // reason`.
- Handlers hold no state beyond the request; download allocates nothing per request; upload drains
  before responding.
- Never log request bodies, headers or WebSocket messages.
- Client IP from `X-Forwarded-For` only through `server.trusted_proxies`; never `X-Real-IP` and
  similar headers.
- Configuration is read-only and validated fail-closed (exit status 2).
