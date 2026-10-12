# bitgauge — Core

Self-hosted browser speed test: one stateless Go binary embedding a Vue SPA; the measurement
engine runs in the browser (Web Worker). **Specification phase: no product code yet.** Tooling,
meta-tests, CI and the harness scaffold exist. Per-feature status: `docs/STATUS.md` (check it
before assuming a feature exists).

## Source map

```
cmd/bitgauge/             PLANNED: serve (default) + healthcheck subcommands
internal/                 PLANNED: buildinfo, config (koanf), logger (slog), server (chi, middleware),
                          handlers (native API), clientip, ratelimit, metrics, compat/{openspeedtest,librespeed,nq}
api/openapi.yaml          PLANNED: native API contract under /api/v1
web/                      tooling only today (package.json, eslint/vite/playwright configs)
web/src/engine/           PLANNED: framework-free engine; app imports only engine/messages.ts
web/src/api/types.gen.ts  PLANNED, GENERATED from api/openapi.yaml (make api-types); never edit
web/harness/run.spec.ts   Playwright driver of the accuracy harness
deployments/docker/       Dockerfile: web, build, runtime stages; dhi.io bases pinned by tag
test/                     Go meta-tests: boundary, docs, dockerfiles, filebudgets, licenseheaders,
                          packagemap, suppressions, toolchain (gates.go registry, pins)
test/image/               //go:build image: the shipped image under netguard + strace (Docker)
test/harness/             accuracy harness; runners behind //go:build harness (Docker)
test/internal/            testenv (docker CLI envs, labels, sweep), netguard (nft egress counters),
                          syscalltrace (strace parser), toolgate (closed tool-gated list), gitenv
.github/                  ci.yaml, go-test.yaml, warm-ups, scheduled-scan.yaml, scripts/, templates
.agents/skills/           project skills; .claude/skills symlinks here
.mk/                      make-common snippets + local (web, e2e, harness, image-test, audit-deps, ...)
```

## Key invariants

- Spec first: behaviour changes start in `docs/features/`; docs win over code;
  `decisions.md` wins on technical choices.
- Stateless server: no DB, file writes, volume or stored results; only bounded in-memory
  counters (architecture.md §6 inventory).
- No outbound calls, ever (no telemetry, update checks, CDNs, fonts, lookups).
- Engine purity: no DOM, Vue or app imports in `web/src/engine/`.
- Honest numbers: no fudge factors or hidden smoothing; every number keeps its qualifiers.
- No copied code from OpenSpeedTest, LibreSpeed or other speed tests.
- Dormant gates are absent, not filtered: `test/toolchain/gates.go` fails a premature or a
  missing hook/job/step.

## Docs

`docs/features/` is the contract. Key files: `measurement.md` (engine rules), `wire-protocol.md`
(native API, error envelope, upload JSON), `compatibility.md`, `configuration.md`, `security.md`,
`architecture.md`, `technical-stack/{decisions,testing,build-packaging,frontend,backend}.md`,
`open-questions.md`, `roadmap.md`. `docs/release.md` covers releases.
`docs/features/{product.md,principles.md,measurement.md,ui/}` are SYMLINKS into
`docs/design_system/features/` (rules: docs/README.md "Design Export"); never hand-edit the rest of
the export.

## Related memories

- Build, test, lint and harness commands: `mem:suggested_commands`
- Go lint and style rules that bite: `mem:conventions`
- What to run before declaring a change done: `mem:task_completion`
- Stack, versions and pins: `mem:tech_stack`
- How to keep these memories current: `mem:memory_maintenance`
