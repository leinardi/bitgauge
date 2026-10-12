# AI-Assisted Development Guidelines

[Feature index](../README.md) / [Technical Stack](README.md) / AI Guidelines

AI agents working on BitGauge follow [AGENTS.md](../../../AGENTS.md), the canonical AI context file
at the repository root. There is no separate `CLAUDE.md`: Claude Code reads `AGENTS.md` directly.
Contributor workflow is in [CONTRIBUTING.md](../../../CONTRIBUTING.md).

## Rules

- **Spec first.** The approved specification is the contract; a behaviour change still starts as
  a change to these docs, and code follows the docs, never the other way round. Product code
  (`cmd/`, the `internal/` packages of [architecture §9](../architecture.md#9-planned-package-layout),
  `web/src/`, `api/openapi.yaml`) implements what the docs specify and nothing else; tooling must
  not encode product behaviour that the docs do not specify either.
- **Docs are the source of truth.** When code and docs disagree, the docs win until they are
  changed deliberately; [decisions.md](decisions.md) wins over any other page on a technical
  choice.
- **Engine purity.** `web/src/engine/` has no DOM, no Vue and no imports from application code; it
  talks to the UI only through the typed messages; every rule takes the injected clock and
  transport ([frontend.md §2](frontend.md#2-engine-package-rules)).
- **Stateless server.** Never add server-side storage, a database, a file write, a volume or
  cross-request correlation. Results never reach the server.
- **No outbound calls.** Never add a network client to the server or an external URL to the SPA:
  no telemetry, update checks, CDNs, fonts or lookups.
- **No copying.** Never copy code or assets from OpenSpeedTest, LibreSpeed or any other speed test;
  use their documented behaviour for ideas and protocol compatibility only.
- **Lint policy.** golangci-lint v2 with all linters must pass. Do not suppress a finding without a
  `//nolint:<linter> // reason` comment that explains why.
- **Typed API.** Native API changes start in `api/openapi.yaml`; the SPA uses the generated types.
  No hand-written duplicate types for API shapes.
- **Honest numbers.** No fudge factors, no hidden smoothing, no number without the qualifiers the
  methodology requires.

## Conventions

Frontend:

```text
Pages orchestrate data and layout.
Components render UI; production UI chrome uses shadcn-vue primitives.
Composables hold stateful UI logic.
api/ contains backend calls and generated types.
engine/ measures; nothing else does.
```

Backend:

```text
Handlers are thin and hold no state beyond the request.
Random buffer, drainer and grid live in internal/handlers; clientip and ratelimit are separate.
Compatibility layers depend on the native building blocks, never the reverse.
Never log request bodies, headers or WebSocket messages.
```

## Related

- [AGENTS.md](../../../AGENTS.md)
- [Technical decisions](decisions.md)
- [Principles](../principles.md)
- [Testing](testing.md)
