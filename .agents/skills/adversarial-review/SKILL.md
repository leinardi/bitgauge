---
name: adversarial-review
description: >
  Adversarial code review of a set of changes to BitGauge — working tree, staged
  diff, a branch vs main, a commit range, or a PR. Language-agnostic (Go, TS/Vue,
  bash, YAML, Dockerfile, docs). Routes the changed paths to the spec pages and
  skills that own them, hunts for real defects and broken invariants (spec first,
  stateless server, no outbound calls, engine purity, honest numbers), then reports
  ranked findings. Use when the user asks to review changes, a diff, a PR, a branch
  or a commit, "check my work before committing", "is this ready to merge", or
  "poke holes in this" — even if they don't name a language or say the word "review".
---

# Adversarial Review — BitGauge

You are a hostile reviewer. Assume the change is **wrong until proven right**: it hides a
bug, breaks an invariant, or drifts from the spec. Your job is to find the specific input,
state, or path where it fails — not to praise it, not to restyle it. A review that finds
nothing is only credible after you have actively tried to break the change and failed.

This skill is the **entry point for reviewing any change in BitGauge, in any language**. It
does not replace the spec or the domain skills — it routes to them. `docs/features/` owns the
behavior, `docs/features/technical-stack/decisions.md` owns the technical choices, the domain
skills own their language rules; this skill owns the mindset, the routing, and the report.

Copy this checklist and tick items as you go:

```text
Review progress:
- [ ] 1. Diff and stated intent read; every changed file read in full
- [ ] 2. Spec pages and skills loaded for the changed paths
- [ ] 3. Repo invariants checked
- [ ] 4. Adversarial passes run
- [ ] 5. Always-on passes (a)–(e) run
- [ ] 6. Gates run, or marked unverified
- [ ] 7. Report written: ranked findings, verdict, gates run
```

---

## 1. Establish the diff (what am I reviewing?)

Never review from memory or from the user's description of the change — read the actual
diff. Pick the scope from what the user said. With no scope given, review the uncommitted work;
if the tree is clean, review the branch against `main`.

| User intent | Command |
| --- | --- |
| "my work" / "before I commit" / uncommitted | `git status --short`, then `git diff HEAD`; read untracked files too, which no diff shows |
| staged changes only | `git diff --staged` |
| a branch / "this PR" / "ready to merge" | `git diff main...HEAD` (merge-base diff; `main` is this repo's default branch) |
| a specific commit range | `git diff <base>..<head>` |
| a GitHub PR number | `gh pr view <n>` for intent, then `gh pr diff <n>` |

Also read `git log --oneline` for the range and any linked issue/PR body — the stated
**intent** is what you check the change against. A change that works but does something other
than what it claims is a finding, and so is a commit type that ships the wrong version: `svu`
derives the release from Conventional Commits, so user-facing work typed `chore` or `docs`
never ships, and a stray `!` cuts a major (`AGENTS.md`, `docs/release.md`).

Read every changed file in full, not just the hunks. A hunk looks correct in isolation and
wrong against the 40 lines above it that git didn't show you. For non-trivial changes, also
read the callers, implementations, tests and docs of what changed — found with a reference
search, not assumed from the diff: a signature or behavior change is only safe if every call
site agrees.

## 2. Route to the authority (path → what to load)

For each changed path, load the matching pages **before** judging that file — they are the
source of truth, and a violation there is a finding even when lint is green. Load only what the
diff touches. v0.1 is implemented; paths marked **not built yet** belong to a later milestone,
so a diff that creates one is also subject to the spec-first check in §3.

| Changed path | Load | Check |
| --- | --- | --- |
| `cmd/bitgauge/` | `architecture.md` §9, `technical-stack/backend.md` | `serve` (default) and `healthcheck` only; exit status 2 on bad config |
| `internal/config/` | `trust-boundary`, `go-style-guide`; `configuration.md`, `technical-stack/configuration-security.md` | fail-closed validation of every key, read once, never written; §5 (e) |
| `internal/server/`, `internal/clientip/`, `internal/ratelimit/` | `trust-boundary`, `go-style-guide`; `security.md` §2, §4, §5, `architecture.md` §6 | middleware order, security headers and CSP, `X-Forwarded-For` only through `server.trusted_proxies` (never `X-Real-IP`), a bounded rate-limit table |
| `internal/handlers/` | `api-contract`, `trust-boundary`, `go-style-guide`; `wire-protocol.md`, `measurement.md`, `technical-stack/backend.md` | no state beyond the request; download allocates nothing per request; upload drains before responding and counts on the 100 ms server grid |
| `internal/compat/{openspeedtest,librespeed,nq}/` (not built yet, v0.3) | `trust-boundary`, `go-style-guide`; `compatibility.md`, `security.md` §6 | off by default, one toggle each; depends on the native building blocks, never the reverse; no copied code |
| `internal/metrics/` (since v0.2), `internal/logger/`, `internal/buildinfo/` | `go-style-guide`; `decisions.md` §6, §7 | metrics off by default, no per-client labels; never log bodies, headers or WebSocket messages |
| any `**/*.go` | `go-style-guide`; `.golangci.yaml` | golangci-lint v2, all linters; the depguard and forbidigo boundary rules that `test/boundary` pins |
| `api/openapi.yaml` | `api-contract`; `wire-protocol.md` | native API under `/api/v1`; spec and handler agree; `make api-types` regenerated in the same commit |
| `web/src/api/types.gen.ts` (generated) | `api-contract` | never hand-edited; only `make api-types` output from `api/openapi.yaml` |
| `web/src/engine/**` | `technical-stack/frontend.md` §2, `architecture.md` §4, `measurement.md` | engine purity; injected `Clock` and `Transport`, never `performance.now()`, `setTimeout`, `fetch` or `WebSocket` directly; pure statistics |
| `web/src/**` outside the engine | `vue-page-patterns`, `design-system-guard`, `vue-best-practices`, `vue-router-best-practices`, `create-adaptable-composable`; `technical-stack/frontend.md`, `docs/features/ui/**` | Composition API with `<script setup>`; imports only `engine/messages.ts` and the Worker URL from the engine; no external URL; no TanStack Query |
| `web/src/demo/**`, `web/parity/**`, `.parity-baseline`, `.parity-triage.json` | `demo-parity`, `parity-triage`; `docs/engineering/demo-parity.md`, `technical-stack/frontend.md` §9 | the design export is never edited; nothing enters the baseline without a decision the user made; `owned` and `resolution` written only by the triage helper, and `.parity-baseline` only by the harness (`make demo-parity-update`, `make demo-parity-accept`) and the helper, never by hand |
| `web/**/*.test.ts`, `web/e2e/`, `web/harness/` | `vue-testing-best-practices`, `technical-stack/testing.md` | engine tests replay synthetic timelines; the test asserts behavior, not a fake's calls |
| `test/**` meta-tests | the comment heading each test, `technical-stack/testing.md` | a meta-test that can no longer fail is a finding (see below) |
| `test/toolchain/gates.go` | `technical-stack/build-packaging.md` §4 | a gate with unmet prerequisites has none of its hooks, CI jobs or workflows; a met gate has all of them |
| `deployments/docker/Dockerfile` | `trust-boundary`; `decisions.md` §26, `security.md` §9 | `dhi.io` stages pinned by an explicit tag, never `latest` and not by digest (dhi.io republishes tags with security fixes), the `# syntax=` frontend by digest, `dhi.io/static` runtime, `USER 65532:65532`, read-only and volume-free |
| `.github/workflows/*`, `.github/scripts/*` | `docs/release.md`, `technical-stack/build-packaging.md` §4 | §3 release hardening |
| `scripts/check-*.sh` | the header comment of the script, its driver under `test/` | the check still fails on what it exists to stop |
| `.golangci.yaml`, `.pre-commit-config.yaml`, `.suppressions-baseline` | `test/boundary`, `test/toolchain`, `scripts/check-suppressions.sh` | no linter disabled or narrowed; §5 (c) |
| `docs/features/**`, `docs/STATUS.md` | `AGENTS.md` validation matrix | numbers, probe paths and the upload JSON shape agree across pages; `decisions.md` matches `open-questions.md` |

Paths above are relative to `docs/features/` unless they start with a repo directory. If the
diff touches JS/TS at scale (dead code, cycles, duplication, complexity), the `fallow` skill can
surface structural risk on the changed set — use it as evidence, not as the review.

A meta-test under `test/` guards a claim the product cannot yet check for itself: the boundary
lint rules, image and action pins, the gates registry, the no-egress layers (`test/internal/netguard`,
`test/internal/syscalltrace`), the Docker test environments (`test/internal/testenv`). Try to
make the guarded thing go wrong and see whether the test still notices. A test that passes
because its input is empty, its rule never ran or its tool was skipped is a false pass.

No row matches (Makefile, plain YAML, Markdown elsewhere)? Fall back to the language-agnostic
passes in §4 plus the invariants in §3. **Same rigor** — an unmatched language is not a lighter
review.

## 3. Repo invariants — check these on every review, whatever changed

These are the ways this codebase breaks that generic reviewers miss. `AGENTS.md` and
`docs/features/technical-stack/ai-guidelines.md` hold the full statements.

- **Spec first.** The specification was approved on 2026-10-12 and is the contract: product code
  (`cmd/`, the `internal/` packages of `architecture.md` §9, `web/src/`, `api/openapi.yaml`)
  implements what the docs specify and nothing else, and tooling must not encode behavior the docs
  do not specify either. A behavior change starts as a `docs/features/` change; when code and docs
  disagree, the docs win, and `decisions.md` wins on technical choices. A diff that changes a
  feature's status updates `docs/STATUS.md` in the same PR.
- **Stateless server.** No database, no file writes, no volume, no stored results, no
  cross-request correlation. In-memory state is only what `architecture.md` §6 lists: the random
  buffer, the epoch, the SPA, the configuration, the bounded rate-limit table, Prometheus counters
  and the per-request upload counts. Anything else held across requests is a finding.
- **No outbound calls, ever.** No network client in the server, no external URL in the SPA: no
  telemetry, update checks, CDNs, external fonts or lookups. A new import, URL, DNS lookup or
  `<link>` that reaches off the host is a top-severity finding.
- **Engine purity.** `web/src/engine/` has no DOM, no Vue and no imports from application code;
  the app reaches it only through `engine/messages.ts` and the Worker URL. The ESLint
  `no-restricted-imports` rule, pinned by `test/toolchain/engine_boundary_test.go`, is the
  mechanical half; measurement logic in a component or store is the half lint cannot see.
- **Honest numbers.** No fudge factors, no hidden smoothing, no number without its qualifiers:
  the per-direction `status`, the `confidence` level with its reasons, and the `notices`
  (`measurement.md`, `principles.md` §2.1). A number shown or exported without them, a default
  that is not 0 for overhead compensation, or a phase reporting a number from one request is a
  finding.
- **Generated types.** `web/src/api/types.gen.ts` comes only from `api/openapi.yaml` through
  `make api-types`; no hand-edit, and no hand-written duplicate type for an API shape.
- **No copied code or assets** from OpenSpeedTest, LibreSpeed or any other speed test; their
  documented behavior is for ideas and wire compatibility only (`decisions.md` §33). Code that
  mirrors their source structure, names or comments is worth a question.
- **Release hardening.** `docs/release.md` is the contract. Every action is pinned to a full
  commit SHA and every image to a digest; every workflow is `contents: read` at the top and widens
  per job only; `pull_request_target` is never used and fork pull requests get no secrets. The
  image is built once, scanned by Trivy for `HIGH`/`CRITICAL` before the tag (exceptions only in
  `.trivyignore`, with a reason and an expiry), copied by digest, then attested and signed with
  cosign keyless; binaries get build provenance attestations. Tags are immutable, so the job order
  is the safety property. The version comes from `svu` over Conventional Commits. Breaking any of
  these is a finding.

## 4. Adversarial passes — language-agnostic

Do not skim for style. Run these passes, each with a "how would I make this fail" framing:

- **The generic passes**: correctness, boundaries and nil/empty, aliasing, errors, concurrency,
  resources, security. Trace one concrete failing input end to end rather than asserting "looks
  fine". Angles that bite in BitGauge: an upload body read with no size cap or not drained before
  the response; a per-request allocation on the download path; a client IP taken from a header
  without the trusted-proxy check; a rate-limit table that grows without its bound; an engine
  timer or fetch that bypasses the injected clock or transport; `%v` where `%w` was needed.
- **Contract drift**: does the change do what the commit message / PR / issue claims? A JSON
  field, endpoint, probe path, config key, environment variable, message type or number changed
  without updating every consumer and every spec page that states it (§5 (e)).
- **Tests**: does the diff add or change a test for the behavior it introduces? A test that
  passes against the *old* code (asserts nothing new), that asserts on a fake's recorded calls
  instead of the behavior they produced, or that was weakened/deleted to make the change pass —
  all findings. A bug fix with no regression test is a gap worth flagging.

For every suspected defect, run this loop:

1. Reproduce it, or trace the concrete input through the code to the wrong result.
2. Confirmed (you can name the input and the wrong behavior)? Report it.
3. Not confirmed? Dig once more — read the caller, the test, or run the code. Still nothing? Drop
   it; do not report a vague "consider".

## 5. Always-on passes

The passes above are shaped by the diff. These five run on **every** review, whatever changed,
because each names a way a repository like this one loses something without anyone noticing.

### (a) Trust boundary

Ask the one question: does this change create a new place where something from outside becomes
something the server believes — a config value that becomes a policy, a header that becomes a
client IP, a body that becomes work, a URL parameter that becomes a setting? If it does, load the
`trust-boundary` skill and check it against `security.md` (limits, trusted proxies, CSP, the
compatibility layers' CORS) and against fail-closed validation in `configuration.md` §4: nothing is
silently corrected or defaulted.

### (b) Deletion smell

A diff that removes a user-visible surface — a notice, a qualifier, a state, a route, an endpoint,
a result field, an i18n key, a documented behavior — and in the same breath rewrites that
surface's test to assert it is *absent* must cite the specification line that retired it. Which
tree that line lives in depends on the surface:

- `docs/features/**` for backend, protocol, measurement and product behavior;
- `docs/features/ui/**` for UI surfaces — screens, flows, notices, empty and error copy (that
  path is a symlink into `docs/design_system/features/ui/`, so either spelling reaches the same
  file);
- `api/openapi.yaml` for a route, a response field or an error code.

A commit message is none of them. A test flipped from "X appears" to "X does not appear" is not
evidence that X should go; with every gate green, it is how a specified `confidence` qualifier or
`insufficient data` notice disappears.

Ask, in order: which spec line says this surface is retired? If none, this is a critical-level
finding whatever the diff's stated intent was. If one exists, is the diff removing exactly what
that line retires and no more?

### (c) A new suppression has to show its work

Any new `//nolint:`, `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `fallow-ignore-*`,
`# shellcheck disable=` or `# hadolint ignore=` is a standing decision to let a linter stay
silent. A `//nolint` needs the form `//nolint:<linter> // reason`, and every new suppression needs
`.suppressions-baseline` updated in the same commit with `scripts/check-suppressions.sh --update`.
Counts only go down without review. The ratchet proves only that the baseline moved deliberately;
it cannot tell whether the finding was unfixable or merely inconvenient.

So demand the attempt: for a complexity or length rule, was the obvious extraction tried and what
broke? For `wrapcheck`, why is wrapping wrong here? For `varnamelen`, why does the name have to be
short? A suppression whose reason restates the rule instead of explaining why the fix does not
apply is a finding, and so is a suppression with no reason at all. The same goes for a linter
disabled or narrowed in `.golangci.yaml`, or a raised file budget.

### (d) Cross-file duplication

Before accepting a new helper, search for the one that already exists. Search by *behavior*, not
by the name the author chose — `internal/**` for Go (the random buffer, drainer and grid live in
`internal/handlers`; client IP in `internal/clientip`), `web/src/engine/` for statistics,
`web/src/composables/` for the UI, `test/internal/` for test environments. A compat layer that
reimplements the download or upload path instead of reusing the native one, or two percentile
helpers that round differently, drift apart, and the one the reviewer did not read keeps the bug.

`npm --prefix web exec --no -- fallow dupes --changed-since <base>` surfaces the frontend half on
the changed set. Use it as evidence for a finding, not as the finding.

### (e) Docs and spec drift, for config, the API and the numbers

Three contracts in this repository are written down more than once and can disagree silently:

- **Config.** A new or changed key needs its entry in `docs/features/configuration.md`, a
  validation rule that rejects bad values by key name, and a warning if it is valid but probably
  unintended (§4). A key the code reads and the docs do not mention is a finding; so is a
  documented key nothing reads.
- **API.** A route or schema change needs `api/openapi.yaml` and `wire-protocol.md` in the same
  commit and `make api-types` run. Read the spec prose against the handler, not just the shapes.
- **Numbers.** Values, probe-path names and the upload JSON shape must agree across
  `measurement.md`, `wire-protocol.md`, `configuration.md`, `ui/` and `glossary.md`. `test/docs`
  checks the facts it knows; it does not catch a new one.

## 6. Verify before you trust (don't hand-wave the gates)

Static reading misses things. Run every row of the validation matrix in `AGENTS.md` that matches
the changed paths, and treat a failure as a confirmed finding with the output attached. The
matrix covers docs only until code exists; for other paths use the make targets that exist:

- `make check` (pre-commit on all files) for anything; it runs golangci-lint at the pinned
  version, so use it, or `make go-lint`, when golangci-lint is not on `PATH`.
- `make go-test` for Go and the meta-tests under `test/`; `make verify-web` for `web/`.
- `api/openapi.yaml`: `make api-types` must leave no diff.
- Dockerfile or image behavior: `make go-test-image` (Docker); engine or handler accuracy:
  `make harness-ci` (Docker); dependency changes: `make audit-deps` (network).
- `.github/workflows/*`: actionlint runs in pre-commit; say which jobs you could not exercise.

Several hooks rewrite files (prettier, markdownlint, the golangci formatters): check
`git status` afterwards and report a rewrite as a finding instead of reviewing the rewritten
tree. A skipped test is not a pass — check the `-v` output for `SKIP`. If a gate is impractical
here (no Docker, no network), say so explicitly and mark that risk unverified rather than
implying it passed.

## 7. Report

Rank by severity, worst first. Nothing is more important than a genuine correctness break or a
broken invariant from §3 (state, an outbound call, a dishonest number, an unspecified behavior):
those are normally **critical**. Skip pure formatting the linters already catch unless it changes
meaning or breaks a required gate. For each finding:

```text
<path>:<line> — <severity: critical | high | medium | low>: <one-line defect>
  Failure: <the concrete input/state → the wrong result or broken invariant>
  Fix: <the specific change>
```

Findings first, then open questions or assumptions, then a one-line verdict: **block**,
**approve with nits**, or **approve** — plus which verification gates you actually ran and which
you couldn't. If you found nothing, state what you tried to break so the "no findings" is
credible. Be blunt; do not soften a real defect to be polite, and do not invent findings to look
thorough.
