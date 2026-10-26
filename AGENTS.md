# AGENTS.md

## What this is

**BitGauge**: self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s to multi-Gbit. One stateless Go binary with an embedded Vue SPA; the
measurement engine runs in the browser, in a Web Worker. Optional compatibility layers for
OpenSpeedTest, LibreSpeed and Apple `networkQuality` clients. Implemented, not yet released; the
release waits for the manual steps of [`docs/release.md`](docs/release.md#how-to-release).

- `cmd/bitgauge/` (`serve`, `healthcheck`), `internal/` (package map:
  [backend.md §1](docs/features/technical-stack/backend.md#1-package-map)), `api/openapi.yaml`
  (native API contract), `web/` (Vue SPA; `web/src/engine/` is the measurement engine).
- `test/`: repository meta-tests (untagged), the image tests (`-tags=image`) and the accuracy
  harness (`-tags=harness`). `deployments/`: the Dockerfile and the deployment examples.
- Spec: [`docs/features/`](docs/features/README.md). `docs/engineering/` holds runbooks,
  `docs/research/` prior art, `docs/design_system/` the Claude Design export.

### Never hand-edit

- `web/src/api/types.gen.ts`: run `make api-types` after editing `api/openapi.yaml`.
- `web/src/components/ui/`: vendored shadcn-vue; extend by composition.
- `.mk/{docker,help,go,pre-commit,web,parity}.mk`: from make-common (`make mk-common-update`);
  repo-local snippets are the other `.mk/` files. Never add recipes to `Makefile` itself.
- The vendored skills in `skills-lock.json` (hashed).
- `docs/design_system/` except `features/`: `docs/features/{product.md,principles.md,measurement.md,ui/}`
  are symlinks into it. An edit there is pasted into Claude Design by the user, so list such files
  ([`docs/README.md`](docs/README.md#design-export)).
- `.parity-baseline`: only through `make demo-parity-update` or `make demo-parity-accept REASON=`.

## Common commands

`make help` lists every target.

```bash
make check             # every pre-commit hook on all files
make verify-go         # go build, go test -race, go vet (all tags), golangci-lint
make verify-web        # ESLint, vue-tsc, vitest
make run               # build, then serve on 0.0.0.0:8080 until Ctrl+C
make web-dev           # Vite dev server (make web-demo: against a simulated link)
make api-types         # regenerate web/src/api/types.gen.ts from api/openapi.yaml
make e2e               # Playwright on Chromium, Firefox, WebKit
make e2e-browsers      # install those browsers (also what playwright cli drives)
make go-test-image     # build the image, test it under netguard and strace (Docker, dhi.io)
make harness-ci        # accuracy harness, CI tier (Docker, dhi.io, netem)
make demo-parity       # compare the design kit's prototype with the Vue demo (on demand)
make audit-deps        # govulncheck and npm audit (network)
```

## Validation

The commit hooks are the gate: every commit runs the meta-tests (`go test ./test/...`), the docs
link check, license headers and fallow; a `.go` change adds golangci-lint and the product tests; a
`web/` change adds ESLint, vue-tsc and vitest. `make check` runs them all on every file. Beyond
that, run what the hooks cannot:

- `make verify-go` or `make verify-web` before calling a change done (`-race`, the tagged vets).
- Dockerfile, `test/image/**`, netguard or syscalltrace: `make go-test-image` (Docker, `dhi.io`).
- `web/e2e/**` or a flow change: `make e2e`.
- `test/harness/**` runner changes: `make harness-ci`
  ([runbook](docs/engineering/accuracy-harness.md)).
- `web/src/demo/**`: `make web-build`, then `scripts/check-dist-demo-free.sh web/dist`.
- Demo parity runs on demand only ([runbook](docs/engineering/demo-parity.md)).

## Commit messages

Conventional Commits **with a scope**: `<type>(<scope>)[!]: <description>`, enforced by the
`commit-msg` hook. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`,
`chore`, `style`, `revert`. `svu` derives the release version from the commits since the last tag,
so a wrong type ships a wrong version:

| Release | Commit | Example |
| --- | --- | --- |
| major | any type with `!` before the colon, or a `BREAKING CHANGE:` footer | `feat(api)!: rename the upload telemetry fields` |
| minor | `feat` | `feat(engine): add the stream ramp` |
| patch | `fix` | `fix(upload): count bytes on the server grid` |
| none | `perf`, `refactor`, `build`, `ci`, `chore`, `docs`, `style`, `test`, `revert` | `docs(measurement): define the upload grace` |

**Pick the type by whether the change should ship.** Anything that changes the shipped binary, the
image or the web app and that users should receive is `fix` (or `feat`), even a performance
improvement, a refactor or a revert. `svu` matches `feat`/`fix` anywhere in the subject (`prefix:`
counts as `fix:`), so avoid a word ending in `feat` or `fix` right before a colon. See
[`docs/release.md`](docs/release.md).

## Project rules

- **Spec first.** `docs/features/` is the behavior contract: a behavior change starts as a docs
  change, and code follows. When they disagree the docs win until changed deliberately;
  [`decisions.md`](docs/features/technical-stack/decisions.md) wins on technical choices.
  Implementation details live in the code.
- **The server never stores a result and never calls out.** No database, file write, volume or
  stored result; no state beyond the bounded in-memory counters for limits and metrics
  ([architecture.md §6](docs/features/architecture.md#6-in-memory-state-inventory)); no outbound
  client, telemetry, update check, CDN, external font or lookup.
- **No copied code or assets** from OpenSpeedTest, LibreSpeed or any other speed test; their
  documented behavior is for ideas and wire compatibility only.
- **Honest numbers.** No fudge factors, no hidden smoothing, no number without its qualifiers.
- **Engine stays framework-free**: no DOM, Vue or app imports in `web/src/engine/`; the app imports
  only `engine/messages.ts` from it.
- **Frontend:** Composition API with `<script setup>` only; no Nuxt, SSR, TanStack Query or
  external URL. Visuals come from the design export, shadcn-vue defaults elsewhere; behavior
  follows [`docs/features/ui/`](docs/features/ui/README.md). Production `web/src` files stay under
  400 lines (ESLint `max-lines`).
- **Go:** golangci-lint v2 with all linters; a `//nolint` names its linter and a reason. Handlers
  hold no state beyond the request; download allocates nothing per request; upload drains before
  responding. Never log request bodies, headers or WebSocket messages. Client IP from
  `X-Forwarded-For` only through `server.trusted_proxies`. Configuration is read-only and validated
  fail-closed (exit status 2).
- **No gate passes on nothing:** no `--passWithNoTests`, `|| true`, `continue-on-error` or
  `if: false`. Untagged tests never need Docker.

Read the matching skill in `.agents/skills/` before editing an area it covers; each skill's
description says when it applies.
