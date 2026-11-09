# AGENTS.md

## What this is

**BitGauge**: self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s to multi-Gbit. One stateless Rust binary with an embedded Vue SPA; the
measurement engine runs in the browser, in a Web Worker. Optional compatibility layers for
OpenSpeedTest, LibreSpeed and Apple `networkQuality` clients. Implemented, not yet released; the
release waits for the manual steps of [`docs/release.md`](docs/release.md#how-to-release).

- `src/` (the `bitgauge` package: `serve`, `healthcheck`; module map:
  [backend.md §1](docs/features/technical-stack/backend.md#1-package-map)), `api/openapi.yaml`
  (native API contract), `web/` (Vue SPA; `web/src/engine/` is the measurement engine).
- `meta/`: repository meta-tests (no Docker). `testenv/`: the image tests (feature `image`) and the
  accuracy harness (feature `harness`). `deployments/`: the Dockerfile and the deployment
  examples.
- Spec: [`docs/features/`](docs/features/README.md). `docs/engineering/` holds runbooks,
  `docs/research/` prior art, `docs/design_system/` the Claude Design export.

### Never hand-edit

- `web/src/api/types.gen.ts`: run `make api-types` after editing `api/openapi.yaml`.
- `web/src/components/ui/`: vendored shadcn-vue; extend by composition.
- `.mk/{docker,help,pre-commit,web,parity,rust}.mk`: from make-common (`make mk-common-update`);
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
make verify-rust       # cargo build, fmt, clippy (all targets and features), test, doc
make verify-web        # ESLint, vue-tsc, vitest
make run               # build, then serve on 0.0.0.0:8080 until Ctrl+C
make web-dev           # Vite dev server (make web-demo: against a simulated link)
make api-types         # regenerate web/src/api/types.gen.ts from api/openapi.yaml
make e2e               # Playwright on Chromium, Firefox, WebKit
make e2e-browsers      # install those browsers (also what playwright cli drives)
make rust-test-image   # BITGAUGE_TEST_IMPL=rust: image under netguard and strace (Docker, dhi.io)
make rust-release-dist  # the SPA once, the static release binaries, then checksums.txt
make image-build-test   # the shipped prebuilt image from dist/, then the full tier (dhi.io)
make harness-ci        # BITGAUGE_TEST_IMPL=rust: accuracy harness, CI tier (Docker, dhi.io, netem)
make demo-parity       # compare the design kit's prototype with the Vue demo (on demand)
make audit-deps        # npm audit and cargo-deny (network)
```

## Validation

The commit hooks are the gate: every commit runs the meta-tests (`cargo test -p meta`), the
Markdown link check (lychee), license headers and fallow; a `.rs` or Cargo change adds
rustfmt, clippy, the workspace tests and cargo-machete, and a manifest, lockfile or `deny.toml`
change cargo-deny; a `web/` change adds ESLint, vue-tsc and vitest. `make check` runs them all on
every file. Beyond that, run what the hooks cannot:

- `make verify-rust` or `make verify-web` before calling a change done (rustdoc too).
- Dockerfile, `testenv/tests/image/**`, netguard or syscalltrace:
  `make rust-test-image BITGAUGE_TEST_IMPL=rust` (Docker, `dhi.io`).
- Dockerfile, `scripts/image-test.sh`, `.mk/image.mk` or `.mk/rust-release.mk` (the release's
  packaging path): `make rust-release-dist`, then `make image-build-test` (amd64, full tier)
  and, with QEMU, `make image-build-test IMAGE_PLATFORM=linux/arm64 IMAGE_TEST_TIER=reduced`. Pass
  the same `GIT_VERSION`, `GIT_COMMIT` and `BUILD_DATE` to every call.
- `.github/workflows/**`: `make check` (actionlint) and the meta-tests; the release itself is first
  exercised by a dry run ([`docs/release.md`](docs/release.md#dry-runs)).
- `web/e2e/**` or a flow change: `make e2e`.
- `testenv/src/harness/**` or `testenv/tests/harness/**` runner changes:
  `make harness-ci BITGAUGE_TEST_IMPL=rust`
  ([runbook](docs/engineering/accuracy-harness.md)).
- `web/src/demo/**`: `make web-build`, then `scripts/check-dist-demo-free.sh web/dist`.
- Demo parity runs on demand only ([runbook](docs/engineering/demo-parity.md)).
- A `Cargo.toml` or `deny.toml` change, or a rust-common pin bump, needs the network: cargo fetches
  the git dependency and cargo-deny its advisories. To work on a shared crate locally, point each
  crate at `../rust-common/crates/<name>` in an uncommitted
  `[patch."https://github.com/leinardi/rust-common"]` table (the `Cargo.toml` comment); never
  commit it or build a release or image with it.

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
- **Rust:** clippy with the workspace lints (`[workspace.lints]` in `Cargo.toml`), warnings as
  errors; an `#[expect]` or `#[allow]` names its lint and a `reason`. The lint boundary keeps
  shipped code from writing files, dialing, resolving, reading the wall clock or printing (the root
  `clippy.toml`, the `deny.toml` bans and the meta-tests that pin both; only the healthcheck's one
  connect is exempt): [`docs/rust-port.md`](docs/rust-port.md#lint-boundary). Handlers hold no
  state beyond the request; download allocates nothing per request; upload drains before
  responding. Never log request bodies, headers or WebSocket messages. Client IP from
  `X-Forwarded-For` only through `server.trusted_proxies`. Configuration is read-only and validated
  fail-closed (exit status 2).
- **Shared code lives in rust-common.** The crates shared with the sibling Rust projects come from
  `leinardi/rust-common`, a git dependency pinned by its release tag in
  `[workspace.dependencies]` ([Shared Crates](docs/rust-port.md#shared-crates)). A behaviour
  BitGauge needs differently is a parameter there, never a fork or copy here; a fix to shared code
  lands in rust-common first and reaches BitGauge by a pin bump. BitGauge's intended differences
  from the siblings:
  - the root `clippy.toml` bans file writes, connects, name lookups and the print macros beside the
    wall-clock reads the siblings ban too, and `deny.toml` bans HTTP clients, stores and RPC, since
    the server never stores a result and never calls out;
  - metrics on prometheus-client, OpenMetrics only (a maintainer decision), not go-prom; logs are
    tracing's, through tracing-setup, not go-slog's;
  - service-kit's server with its own settings (`src/server/http.rs`: a 10 s head timeout, a 30 s
    write stall, 16 KiB heads, not go-http's four Go timeouts), its own signals (a `sigwait` thread,
    since tokio's signal socketpair would trip the strace policy) and its own healthcheck (the one
    exempted connect, blocking std code);
  - the release graph holds only `service-kit` and `tracing-setup` of the shared crates
    (`deny-shipped.toml` bans the others): they would bring an HTTP stack, a logger or a client the
    binary does not use; `repo-meta` and `testenv-core` are for tests only.
- **No gate passes on nothing:** no `--passWithNoTests`, `|| true`, `continue-on-error` or
  `if: false`; the two reviewed exceptions in the workflows are listed in
  `meta/tests/vacuous_flags.rs`. Tests outside testenv's `image` and `harness` features never need
  Docker.
- **Lean release:** `release.yaml` re-runs no test. It requires `ci-result` green on the commit's
  push run (`require-ci-green`), audits alongside the build, builds the SPA and the binaries once
  and the image's `prebuilt` target from exactly those binaries, and only smoke-tests and scans
  it. So CI's `image` job must keep testing the release's packaging path (the same make target,
  the same Dockerfile target, both platforms), and a recovery uses "Re-run all jobs"
  ([`docs/release.md`](docs/release.md#what-ci-proves)). Workflows follow the shared conventions:
  actions pinned by SHA, `contents: read` at the top, `persist-credentials: false`, a timeout on
  every job, caches written from `main` only, Trivy never pinned.

Read the matching skill in `.agents/skills/` before editing an area it covers; each skill's
description says when it applies.

The server was ported from Go to Rust ([`docs/rust-port.md`](docs/rust-port.md)).
