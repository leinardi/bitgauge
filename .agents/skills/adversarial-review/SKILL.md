---
name: adversarial-review
description: >
  Adversarial code review of a set of changes to BitGauge — working tree, staged diff, a branch
  vs main, a commit range, or a PR. Language-agnostic (Go, TS/Vue, bash, YAML, Dockerfile,
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
skill owns the mindset and the report; the spec and the domain skills own the rules.

Copy this checklist and tick items as you go:

```text
Review progress:
- [ ] 1. Diff and stated intent read; every changed file read in full
- [ ] 2. Skills and spec pages loaded for the changed paths
- [ ] 3. Repo invariants checked
- [ ] 4. Adversarial passes run
- [ ] 5. Always-on passes (a)–(e) run
- [ ] 6. Gates run, or marked unverified
- [ ] 7. Report written: ranked findings, verdict, gates run
```

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

Read `git log --oneline` for the range and any linked issue or PR body: the stated **intent** is
what you check against. A change that does something other than it claims is a finding, and so is
a commit type that ships the wrong version (`svu`: user-facing work typed `chore` never ships, a
stray `!` cuts a major; `AGENTS.md` "Commit messages").

Read every changed file in full, not just the hunks: a hunk looks right in isolation and wrong
against the 40 lines git didn't show. For non-trivial changes, find the callers, implementations,
tests and docs with a reference search; a signature or behavior change is safe only if every call
site agrees.

## 2. Load the authority for each changed path

Before judging a file, load every skill whose description names its path or topic, and the
`docs/features/` pages those skills point to: they are the source of truth, and a violation there
is a finding even when lint is green. A path no skill covers (Makefile, plain YAML, other
Markdown) gets §3 and §4 with the **same rigor**. For JS/TS at scale, the `fallow` skill surfaces
structural risk on the changed set: evidence, not the review.

**Meta-tests are code under review too.** A test under `test/` guards a claim the product cannot
check for itself: the boundary lint rules (`test/boundary`), image and action pins, the no-egress
layers (`test/internal/netguard`, `test/internal/syscalltrace`), the Docker test environments
(`test/internal/testenv`), a `scripts/check-*.sh` and its driver. Try to make the guarded thing
go wrong and see whether the test still notices. A test that passes because its input is empty,
its rule never ran, its pattern no longer matches any file or its tool was skipped is a false
pass, and a high-severity finding.

## 3. Repo invariants — check these on every review, whatever changed

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

## 4. Adversarial passes — language-agnostic

Do not skim for style. Run these passes, each with a "how would I make this fail" framing:

- **Generic**: correctness, nil/empty and boundaries, aliasing, errors, concurrency, resources,
  security. Trace one concrete failing input end to end. Angles that bite here: an upload body
  with no size cap or not drained before the response; a per-request allocation on the download
  path; a rate-limit table without its bound; an engine timer or fetch that bypasses the injected
  clock or transport; `%v` where `%w` was needed.
- **Contract drift**: a JSON field, endpoint, probe path, config key, environment variable,
  message type or number changed without every consumer and spec page that states it (§5 (e)).
- **Tests**: a test that passes against the *old* code, asserts on a fake's recorded calls instead
  of the behavior, or was weakened or deleted to make the change pass is a finding; a bug fix
  without a regression test is a gap.

For every suspected defect, run this loop:

1. Reproduce it, or trace the concrete input through the code to the wrong result.
2. Confirmed (you can name the input and the wrong behavior)? Report it.
3. Not confirmed? Dig once more — read the caller, the test, or run the code. Still nothing? Drop
   it; do not report a vague "consider".

## 5. Always-on passes

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

Any new `//nolint:`, `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `fallow-ignore-*`,
`# shellcheck disable=` or `# hadolint ignore=` is a standing decision to let a linter stay
silent. `nolintlint` enforces a reason, but not whether the finding was unfixable or merely
inconvenient. Demand the attempt: for a complexity or length rule, was the extraction tried and
what broke? For `wrapcheck`, why is wrapping wrong here? For `varnamelen`, why must the name be
short? A reason that restates the rule, or no reason, is a finding. The same goes for a linter
disabled or narrowed in `.golangci.yaml`, `web/eslint.config.ts` or `.pre-commit-config.yaml`.

### (d) Cross-file duplication

Before accepting a new helper, search by *behavior* for the one that already exists:
`internal/handlers` (random buffer, drainer, grid), `internal/clientip`, `web/src/engine/`
(statistics), `web/src/composables/`, `test/internal/`. A compat layer that reimplements the
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
  `measurement.md`, `wire-protocol.md`, `configuration.md`, `ui/` and `glossary.md`. `test/docs`
  checks the facts it knows; it does not catch a new one.

## 6. Verify before you trust (don't hand-wave the gates)

Static reading misses things. Run what [AGENTS.md "Validation"](../../../AGENTS.md#validation)
lists for the changed paths, and treat a failure as a confirmed finding with the output attached:
`make check` for anything (it pins golangci-lint, which may not be on `PATH`), `make verify-go` /
`make verify-web`, `make api-types` leaving no diff after `api/openapi.yaml`, and where they apply
`make go-test-image`, `make harness-ci` (Docker) and `make audit-deps` (network). For
`.github/workflows/*`, say which jobs you could not exercise.

Hooks rewrite files (prettier, markdownlint, the golangci formatters): check `git status`
afterwards and report a rewrite as a finding. A skipped test is not a pass: check the `-v` output
for `SKIP`; the meta-tests skip a missing golangci-lint, ESLint or fallow unless
`BITGAUGE_REQUIRE_TOOLS=1`. A gate you cannot run here (no Docker, no network) is named and its
risk marked unverified, never implied passed.

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

Findings first, then open questions or assumptions, then a one-line verdict (**block**,
**approve with nits** or **approve**) and the gates you ran and could not run. With no findings,
state what you tried to break. Be blunt; do not soften a real defect, and do not invent findings
to look thorough.
