---
name: adversarial-review
description: >
  Adversarial code review of a set of changes to BitGauge — working tree, staged diff, a branch
  vs main, a commit range, or a PR. Language-agnostic (Rust, TS/Vue, bash, YAML, Dockerfile,
  docs). Loads the skills and spec pages that own the changed paths, hunts for real defects and
  broken invariants (spec first, stateless server, no outbound calls, engine purity, honest
  numbers), runs the gates, then reports ranked findings. Use when the user asks to review
  changes, a diff, a PR, a branch or a commit, "check my work before committing", "is this ready
  to merge", or "poke holes in this" — even if they don't name a language or say "review".
---

# Adversarial Review — BitGauge

You are a hostile reviewer. Assume the change is **wrong until proven right**: it hides a
bug, breaks an invariant, or drifts from the spec. Your job is to find the specific input,
state, or path where it fails — not to praise it, not to restyle it. A review that finds
nothing is only credible after you have actively tried to break the change and failed. This
nothing is only credible after you have actively tried to break the change and failed. This
skill is the mindset; the spec and the domain skills own the rules. Read `AGENTS.md` first (its
"Project rules" are the invariants below), then the spec pages and skills for the changed paths.

## Scope

When invoked directly: review the scope the user gives (`gh pr view <n>` for intent, then `gh pr
diff <n>`); with none, the uncommitted work (`git diff HEAD` plus untracked files, which no diff
shows); on a clean tree, `git diff main...HEAD`. Never review from a description of the change.

Read the stated **intent** (`git log --oneline` for the range, any linked issue or PR body): a
change that does something other than it claims is a finding. Read every changed file in full,
not just the hunks: a hunk looks right in isolation and wrong against the 40 lines git didn't
show. For non-trivial changes, find the callers, implementations, tests and docs with a
reference search; a signature or behavior change is safe only if every call site agrees.

## Authority (each changed path)

Before judging a file, load every skill whose description names its path or topic, and the
`docs/features/` pages those skills point to: they are the source of truth, and a violation there
is a finding even when lint is green. A path no skill covers (Makefile, plain YAML, other
Markdown) gets the invariants and passes below with the **same rigor**. For JS/TS at scale, the
`fallow` skill surfaces structural risk on the changed set: evidence, not the review.

**Meta-tests are code under review too.** A test in the `meta` or `testenv` crate guards a claim the
product cannot check for itself: the lint boundary (`meta/tests/test_support_boundary.rs`,
`lint_inheritance.rs`, `compat_boundary.rs`, `deny-shipped.toml`), image and action pins, the
no-egress layers (`testenv/src/netguard.rs`, `testenv/src/syscalltrace`), the Docker test
environments (`testenv/src/env.rs`, `envid.rs`, `sweep.rs`), a `scripts/check-*.sh` and its driver.
Many of them run rust-common's `repo-meta` or `testenv-core` with BitGauge's parameters: review the
parameters here, and a flaw in the shared check itself is fixed in rust-common first.
Try to make the guarded thing go wrong and see whether the test still notices. A test that passes
because its input is empty, its rule never ran, its pattern no longer matches any file or its tool
was skipped is a false pass, and a high-severity finding.

## Repository invariants — check these on every review, whatever changed

The invariants are stated once, in [AGENTS.md "Project rules"](../../../AGENTS.md#project-rules);
read them there. Lint and the meta-tests catch the obvious breaks. These are the ones a diff slips
past them:

- **Spec first, inverted.** Code that implements a sensible behavior the docs do not specify, or
  tooling that encodes one (a threshold in a test, a default in a script), is a finding even when
  every gate is green. The fix is a docs change first, not a comment.
- **State by another name.** A cache, a memo, a `sync.Map`, a "last seen" per IP or a counter
  keyed by anything client-supplied is state across requests. It must be in the in-memory
  inventory of [architecture.md §6](../../../docs/features/architecture.md#6-in-memory-state-inventory)
  and bounded; otherwise it is a finding.
- **Outbound through the side door.** A URL in a string, a `<link>`, a font, a source map, an
  example config or a test fixture that ends up in `web/dist` or the image; a hostname resolved
  through a call forbidigo does not list (`net.ResolveTCPAddr`, `net.Listen` on a name rather than
  an address); a dependency that phones home. Lint sees names and imports, not behavior.
- **Engine purity by relocation.** Measurement logic moved into a component, a composable or a
  store passes the engine's import rule while breaking it.
- **Dishonest numbers by omission.** A number exported or shown without its `status`,
  `confidence` and `notices`, a non-zero overhead default, a smoothing step, or a phase reporting
  a number from one request.
- **Release hardening** ([release.md](../../../docs/release.md)): an action not pinned to a full
  commit SHA, an image not by digest (`dhi.io` stages by tag), a permission widened at workflow
  level, `pull_request_target`, a secret reachable from a fork, or a job reordered so a tag can
  exist before the scan and the build.
- **Commit type matches whether it ships.** `svu` derives the release from the commits: user-facing
  work typed `chore` never ships, and a stray `!` cuts a major (`AGENTS.md` "Commit messages").

## Adversarial passes

Beyond the generic passes (logic, nil and empty input, aliasing, errors, concurrency, resources,
security), run these with a "how would I make this fail" framing, and name one concrete failing
input per candidate. Angles that bite here: an upload body with no size cap or not drained
before the response; a per-request allocation on the download path; a rate-limit table without
its bound; an engine timer or fetch that bypasses the injected clock or transport; `%v` where
`%w` was needed.

- **Contract drift:** a JSON field, endpoint, probe path, config key, environment variable,
  message type or number changed without every consumer and spec page that states it (*Docs and
  spec drift* below).
- **Tests:** a test that passes against the *old* code, asserts on a fake's recorded calls instead
  of the behavior, or was weakened or deleted to make the change pass is a finding; a bug fix
  without a regression test is a gap.

## Always-on passes

The passes above are shaped by the diff. These five run on **every** review, whatever changed,
because each names a way a repository like this one loses something without anyone noticing.

### (a) Trust boundary

Does this change create a new place where something from outside becomes something the server
believes: a config value that becomes a policy, a header that becomes a client IP, a body that
becomes work, a URL parameter that becomes a setting? If so, load `server-invariants` and check it
against `security.md` and fail-closed validation: nothing is silently corrected or defaulted.

### (b) Deletion smell

A diff that removes a user-visible surface (a notice, a qualifier, a state, a route, a result
field, an i18n key, a documented behavior) and rewrites its test to assert it is *absent* must cite
the spec line that retired it: `docs/features/**` (UI in `docs/features/ui/**`) or, for a route,
field or error code, `api/openapi.yaml`. A commit message is not a spec line. With every gate
green, a flipped test is how a specified `confidence` qualifier or `insufficient data` notice
disappears. No such line: critical, whatever the stated intent. One exists: is the diff removing
exactly what it retires and no more?

### (c) A new suppression has to show its work

Any new `#[expect(...)]` or `#[allow(...)]` of a lint, `eslint-disable`,
`@ts-ignore`/`@ts-expect-error`, `fallow-ignore-*`, `# shellcheck disable=` or `# droast ignore=` is
a standing decision to let a linter stay silent. The workspace lints require a `reason = "…"` on an
`expect` (and an `expect`, not an `allow`, so a stale one warns), but not whether the finding was
unfixable or merely inconvenient. Demand the attempt: for a complexity or length rule, was the
extraction tried and what broke? For a cast or a `too_many_arguments`, why is the type or the
grouping wrong here? A reason that restates the rule, or no reason, is a finding; an `expect` of a
`disallowed_*` lint outside the items `docs/rust-port.md` (Lint Boundary) lists is a finding, and
clippy fails one that matches nothing. The same goes for a lint
disabled or narrowed in the root `Cargo.toml` `[workspace.lints]`, a `clippy.toml`, `deny.toml`,
`web/eslint.config.ts` or `.pre-commit-config.yaml`.

### (d) Cross-file duplication

Before accepting a new helper, search by *behavior* for the one that already exists:
`src/handlers` (random buffer, drainer, grid), `src/clientip`, `web/src/engine/` (statistics),
`web/src/composables/`, `testenv/src/`. A compat layer that reimplements the
download or upload path, or two percentile helpers that round differently, drift apart, and the
copy nobody reads keeps the bug. `npm --prefix web exec --no -- fallow dupes --changed-since
<base>` surfaces the frontend half: evidence, not the finding.

### (e) Docs and spec drift, for config, the API and the numbers

Three contracts in this repository are written down more than once and can disagree silently:

- **Config.** A new or changed key needs its entry in `docs/features/configuration.md` and a
  validation rule that rejects bad values by key name (`configuration.md` §4). A key the code
  reads and the docs do not mention is a finding; so is a documented key nothing reads.
- **API.** A route or schema change needs `api/openapi.yaml` and `wire-protocol.md` in the same
  commit and `make api-types` run; `web/src/api/types.gen.ts` is never hand-edited. Read the spec
  prose against the handler, not just the shapes.
- **Numbers.** Values, probe-path names and the upload JSON shape must agree across
  `measurement.md`, `wire-protocol.md`, `configuration.md`, `ui/` and `glossary.md`. No test checks
  them: grep the other pages for every value you change.

## Gates

Do not re-run the repository's gates (`make check`, `make verify-rust`, `make verify-web`, `make
api-types`, `make rust-test-image BITGAUGE_TEST_IMPL=rust`, `make harness-ci
BITGAUGE_TEST_IMPL=rust`, `make audit-deps`; see [AGENTS.md
"Validation"](../../../AGENTS.md#validation)). The implementer is expected to run them and CI runs
them again, but do not assume either happened: report the verification evidence you actually have
(under adversarial-review-loop, `verification.txt` when supplied, which is the implementer's claim
and not proof; when invoked directly, the CI status or gate output in the PR or session) and what is
missing, such as an `api/openapi.yaml` change with no `make api-types` run that left no diff, or a
`.github/workflows/*` change with the jobs it could not exercise unnamed. A failure in that evidence
caused by the change is a confirmed finding. Never say that a check you did not see passed. A
skipped test is not a pass: the meta-tests skip a missing ESLint or fallow unless
`BITGAUGE_REQUIRE_TOOLS=1`, so check the output for `SKIP`. Judge whether the change's tests prove
it: a behavior change needs a test that fails on the old code. When invoked directly, one focused
test (`cargo test -p <crate> <name>`) may be run to confirm a single suspected finding, never a full
suite or gate. A candidate that is neither reproduced nor traced end to end is dropped: a vague
"consider" is not a finding.

## Report

Rank by severity, worst first. Nothing is more important than a genuine correctness break or a
broken invariant from *Repository invariants* (state, an outbound call, a dishonest number, an
unspecified behavior): those are normally **critical**. Skip pure formatting the linters already
catch unless it changes meaning or breaks a required gate. For each finding:

```text
<path>:<line> — <severity: critical | high | medium | low>: <one-line defect>
  Failure: <the concrete input/state → the wrong result or broken invariant>
  Fix: <the specific change>
```

Findings first, then open questions or assumptions, then a one-line verdict (**block**,
**approve with nits** or **approve**) and one line: `Verification evidence: seen … / missing …`.
With no findings, state what you tried to break. Be blunt; do not soften a real defect, and do
not invent findings to look thorough.
