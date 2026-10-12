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
| Native API: download, upload, ping, small, ws, info | Spec'd (v0.1) |  |
| Server-timed upload: 100 ms server grid, per-bucket arrival counts, `Server-Timing` | Spec'd (v0.1) |  |
| Limits and rate limiting (`429` with `Retry-After`) | Spec'd (v0.1) |  |
| Client IP through trusted proxies, context label inputs | Implemented (v0.1) | `internal/clientip/`: `clientip.go` (derivation), `context.go` (middleware), `class.go` (address class, suggested label) |
| Security headers and CSP | Spec'd (v0.1) |  |
| Configuration (koanf, `BITGAUGE_` env, fail-closed validation) | Implemented (v0.1) | `internal/config/`: `load.go`, `types.go`, `validate.go`, `warn.go`, `exit.go` |
| `healthcheck` subcommand and graceful shutdown | Spec'd (v0.1) |  |
| Engine: info and idle latency | Spec'd (v0.1) |  |
| Engine: adaptive request size, stream ramp, adaptive duration, data cap | Spec'd (v0.1) |  |
| Engine: warm-up, steady window, Quick / Standard / Extended presets | Spec'd (v0.1) |  |
| Engine: headline, peak, confidence and notices, result object | Spec'd (v0.1) |  |
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
| Engineering scaffold (gates, CI, release tooling) | Tooling in place; product gates dormant (see AGENTS) | `test/toolchain/gates.go`; dormant: API types, frontend lint and typecheck, frontend unit tests, web build, binary build, image and image tests, E2E, accuracy harness, release; also `idle-measure` and `idle-bench` until a binary runs ([AGENTS.md](../AGENTS.md#dormant-gates-and-activation)) |
| Design export (Claude Design) | Export landed with tokens, components and the `ui_kits/app/` prototype; corrections pending in Claude Design; symlinks active | `docs/design_system/` ([sync rules](README.md#design-export)) |
| Packet loss via WebRTC and TURN | Open (unscheduled) |  |
| Headless CLI client | Open (unscheduled) |  |
| linux/arm/v7 images | Open (unscheduled) |  |
