# Implementation Status

Per-feature-area implementation status with code pointers. Version-level milestones live in
[`features/roadmap.md`](features/roadmap.md). The specification was approved by the maintainer
on 2026-10-12 and v0.1 is being implemented: a row leaves `Spec'd` only in the change that
completes it, and a partly built row reads `Spec'd (v0.1), in progress: …` with code pointers.

> **Keep this honest:** update the table in the same PR that changes a feature's status.
> Stale status claims in instruction files are worse than no claims.

| Feature area | Status | Code pointers |
| --- | --- | --- |
| Single binary, embedded SPA, base path, fixed SPA routes | Spec'd (v0.1) |  |
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
| UI: Test screen, About, URL parameters, English locale, accessibility baseline | Spec'd (v0.1) |  |
| Container image, CI, release, Dependabot | Spec'd (v0.1) |  |
| Accuracy harness (CI, floor and ceiling tiers) | Spec'd (v0.1) |  |
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
| Engineering scaffold (gates, CI, release tooling) | Tooling in place; the binary build, API types, frontend lint, typecheck and unit-test, and web build gates are active, the other product gates dormant (see AGENTS) | `test/toolchain/gates.go`; active: binary build, API types, frontend lint and typecheck, frontend unit tests, web build; dormant: image and image tests, E2E, accuracy harness, release ([AGENTS.md](../AGENTS.md#dormant-gates-and-activation)) |
| Design export (Claude Design) | Export landed with tokens, components and the `ui_kits/app/` prototype; corrections pending in Claude Design; symlinks active | `docs/design_system/` ([sync rules](README.md#design-export)) |
| Packet loss via WebRTC and TURN | Open (unscheduled) |  |
| Headless CLI client | Open (unscheduled) |  |
| linux/arm/v7 images | Open (unscheduled) |  |
