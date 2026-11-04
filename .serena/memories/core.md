# bitgauge — Core

Self-hosted browser speed test: one stateless Rust binary embedding a Vue SPA; the measurement engine
runs in the browser (Web Worker). Implemented, not yet released.

Everything an agent needs is in `AGENTS.md` at the repository root (layout, commands, validation,
commit types, project rules) and in the skills under `.agents/skills/`. The behavior contract is
`docs/features/`. Keep this memory short and point there rather than copying them.
