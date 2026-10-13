# Implementation Status

Per-feature-area implementation status with code pointers. Version-level milestones live in
[`features/roadmap.md`](features/roadmap.md). The specification was approved by the maintainer
on 2026-10-12 and v0.1 is being implemented: a row leaves `Spec'd` only in the change that
completes it, and a partly built row reads `Spec'd (v0.1), in progress: …` with code pointers.

> **Keep this honest:** update the table in the same PR that changes a feature's status.
> Stale status claims in instruction files are worse than no claims.

| Feature area | Status | Code pointers |
| --- | --- | --- |
| Single binary, embedded SPA, base path, fixed SPA routes | Implemented (v0.1) | `web/embed.go` (embed, `index.html` rendered once with the base path, fixed routes, hashed and root assets), `internal/server/router.go`, `cmd/bitgauge/main.go` |
| Native API: download, upload, ping, small, ws, info | Implemented (v0.1) | `internal/handlers/`: `routes.go` (router, 405 and 404), `errors.go` (envelope), `buffer.go` (random buffer), `epoch.go`, `download.go`, `upload.go`, `ping.go`, `small.go`, `ws.go` (echo, Origin rule, close codes), `info.go`; mounted by `internal/server/router.go` |
| Server-timed upload: 100 ms server grid, per-bucket arrival counts, `Server-Timing` | Implemented (v0.1) | `internal/handlers/`: `grid.go` (server grid), `drain.go` (pooled drainer), `upload.go` (arrival counts, lifetime, telemetry) |
| Limits and rate limiting (`429` with `Retry-After`) | Implemented (v0.1) | `internal/ratelimit/`: `limiter.go` (table, token bucket, LRU of idle entries), `middleware.go` (429 with `Retry-After`), `clock.go`; wired by `internal/server/router.go` on download and upload, and by `internal/handlers/ws.go` per WebSocket |
| Client IP through trusted proxies, context label inputs | Implemented (v0.1) | `internal/clientip/`: `clientip.go` (derivation), `context.go` (middleware), `class.go` (address class, suggested label) |
| Security headers and CSP | Implemented (v0.1) | `internal/server/`: `headers.go` (SPA and API header sets, CSP with the validated `Host`), `middleware.go` (recovery, client IP, headers, debug request log), `cors.go` (native CORS), `router.go` (groups, route table) |
| Configuration (koanf, `BITGAUGE_` env, fail-closed validation) | Implemented (v0.1) | `internal/config/`: `load.go`, `types.go`, `validate.go`, `preset.go`, `warn.go`, `exit.go`, `effective.go` |
| `healthcheck` subcommand and graceful shutdown | Implemented (v0.1) | `cmd/bitgauge/`: `main.go` (subcommands, startup order), `address.go` (healthcheck address), `healthcheck.go` (the one ping request); `internal/server/shutdown.go` |
| Engine: info and idle latency | Implemented (v0.1) | `web/src/engine/`: `worker.ts` (the message loop), `clock.ts`, `transport.ts`, `wiring.ts`, `run.ts` (info phase, phase order, stop, visibility, network), `run/connection.ts` (WebSocket and its close sequence), `run/samples.ts`, `run/report.ts`, `latency/idle.ts`, `settings.ts` |
| Engine: adaptive request size, stream ramp, adaptive duration, data cap | Implemented (v0.1) | `web/src/engine/`: `phases/sizing.ts`, `phases/ramp.ts`, `phases/window.ts`, `phases/options.ts`, `download/phase.ts`, `download/streams.ts`, `upload/phase.ts`, `upload/streams.ts`, `upload/watermark.ts`, `upload/window.ts` |
| Engine: warm-up, steady window, Quick / Standard / Extended presets | Implemented (v0.1) | `web/src/engine/`: `phases/warmup.ts`, `phases/window.ts`, `presets.ts`, `upload/window.ts`, `upload/outcome.ts` |
| Engine: headline, peak, confidence and notices, result object | Implemented (v0.1) | `web/src/engine/`: `result.ts` (the result object), `result/direction.ts` (headline, peak, compensation, confidence, series), `result/validate.ts`, `stats/busy.ts`, `run.ts` (emits the result) |
| UI: Test screen, About, URL parameters, English locale, accessibility baseline | Implemented (v0.1) | `web/src/pages/TestPage.vue` (the screen's states, the auto-start countdown), `web/src/composables/` (`useUrlParams.ts`, `useCountdown.ts`, `useTestKeys.ts`), `web/src/components/test/` (`screen.ts` state, steps, gauge and tiles, `DownloadJson.vue`, `ResultBar.vue`, `RunFailure.vue`, tiles, notices, phase indicator, start control), `web/src/components/gauge/` (with `CountdownRing.vue`), `web/src/components/chart/`, `web/src/components/connection/`, `web/src/composables/useRun.ts`, `web/src/export/serialize.ts`, `web/src/pages/AboutPage.vue`, `web/src/i18n/locales/en/` (with `a11y.json`; `locales.test.ts` checks it complete), `web/src/components/a11y/` (`LiveRegions.vue`, `announce.ts`: the live region and the result summary), `web/src/App.vue` (the skip link); `web/e2e/` (the v0.1 flows end to end on Chromium, Firefox and WebKit, with axe and the CSP guard) |
| Container image, CI, release, Dependabot | Implemented (v0.1) | `deployments/docker/Dockerfile`; `.github/workflows/`: `ci.yaml` (jobs `credentials` and `image`), `release.yaml`, `scheduled-scan.yaml` (job `image`); `.github/scripts/recover-toolchains.sh`; `.github/dependabot.yml`; tests in `test/image/`, `test/dockerfiles/` |
| Accuracy harness (CI, floor and ceiling tiers) | Implemented (v0.1): CI tier automated; floor and ceiling manual | `test/harness/` (profiles, topology, shaper, evaluation, report), `web/harness/` (the browser driver), `.mk/harness.mk`; `.github/workflows/harness.yaml`, called by `ci.yaml` (job `harness`); runbook `docs/engineering/accuracy-harness.md` |
| Prometheus metrics | Spec'd (v0.2) |  |
| Loaded latency (WebSocket echo and HTTP fallback) and bufferbloat grade | Spec'd (v0.2) |  |
| UI: Result detail, history, compare, export and import | Spec'd (v0.2) |  |
| UI: Settings and shareable settings URL | Spec'd (v0.2) |  |
| UI: share image and copy summary | Spec'd (v0.2) |  |
| OpenSpeedTest compatibility layer | Spec'd (v0.3) |  |
| LibreSpeed compatibility layer | Spec'd (v0.3) |  |
| networkQuality compatibility layer | Spec'd (v0.3) |  |
| HTTP loaded responsiveness (path B) | Spec'd (v0.3) |  |
| Quality scores (AIM) | Spec'd (v0.3) |  |
| Continuous mode | Spec'd (v0.3) |  |
| Engineering scaffold (gates, CI, release tooling) | Tooling in place; every gate is active: the binary build, API types, frontend lint, typecheck and unit-test, web build, image, accuracy harness, E2E and release (see AGENTS) | `test/toolchain/gates.go`; active: binary build, API types, frontend lint and typecheck, frontend unit tests, web build, image and image tests, accuracy harness, E2E, release ([AGENTS.md](../AGENTS.md#dormant-gates-and-activation)) |
| Design export (Claude Design) | Export landed with tokens, components and the `ui_kits/app/` prototype; corrections pending in Claude Design; symlinks active | `docs/design_system/` ([sync rules](README.md#design-export)) |
| Packet loss via WebRTC and TURN | Open (unscheduled) |  |
| Headless CLI client | Open (unscheduled) |  |
| linux/arm/v7 images | Open (unscheduled) |  |
