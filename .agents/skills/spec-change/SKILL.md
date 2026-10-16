---
name: spec-change
description: >
  How to change BitGauge's specification without letting it disagree with itself:
  update every page that states a number, probe-path name or the upload JSON shape
  together; keep each locked decision in decisions.md exactly once and its open items
  in step with open-questions.md; update docs/STATUS.md in the same change as a
  feature's status, minding the gates that read it; run go test ./test/docs/ and know
  what it does not catch; respect the design-export symlink contract; wrap prose at
  about 100 columns. Use when editing docs/features/** or docs/STATUS.md, when a
  behavior change is about to start (it starts here, and code follows), or when a
  decision or open question is settled.
---

# Spec Change — BitGauge

`docs/features/` is the product and technical contract: when code and docs disagree, the docs win
until changed deliberately, and
[decisions.md](../../../docs/features/technical-stack/decisions.md) wins on technical choices. So
a change in behavior starts as a docs change and code follows it, never the other way round
([ai-guidelines.md](../../../docs/features/technical-stack/ai-guidelines.md#rules)). The
specification was approved on 2026-10-12; it is the contract the code implements.

The contract states many facts more than once. The way it decays is not a wrong page but two right
pages that stopped agreeing. Every section below is a place where that happens.

How to use it, before writing the change:

1. Name the change in one sentence: which fact, rule or status moves, and from what to what.
2. Walk sections 1–7 and mark each *applies* or *N/A*.
3. Edit every page section 1 finds, in one change, then run the checks of section 5.
4. Finish with the checklist at the end.

---

## 1. Update every page that states the fact, together

The [AGENTS.md validation matrix](../../../AGENTS.md#validation-matrix) names the pages that must
agree: [measurement.md](../../../docs/features/measurement.md),
[wire-protocol.md](../../../docs/features/wire-protocol.md),
[configuration.md](../../../docs/features/configuration.md),
[ui/](../../../docs/features/ui/README.md) and [glossary.md](../../../docs/features/glossary.md).
They must agree on:

- **Numbers:** bucket width, lifetimes, caps, defaults, thresholds, durations, ramps.
- **Probe-path names:** path A, the WebSocket echo (with its HTTP fallback), and path B, the HTTP
  loaded responsiveness probe ([glossary.md](../../../docs/features/glossary.md)).
- **The upload JSON shape:** exactly `epoch`, `bucketMs`, `firstBucket`, `buckets`, `bytes`,
  `startMs`, `durationMs`, as
  [wire-protocol.md §4](../../../docs/features/wire-protocol.md#4-upload-telemetry) defines it.

Those five are the minimum, not the list. Search the whole tree for the old value, the old name and
its spellings (`120 s`, `120000`, `1200 cells`), and include `architecture.md`, `security.md`,
`compatibility.md`, `edge-cases.md`, `roadmap.md`, `technical-stack/` and `docs/research/`
references to it. A config key also needs its validation rule and warning in configuration.md; a
native route or field also goes through the `api-contract` skill (`api/openapi.yaml`, once it
exists).

Tests outside `test/docs/` pin spec text too, so a docs edit can fail them:

| Edited | Pinned by | Run |
| --- | --- | --- |
| testing.md §5 tier table, environmental limits, closing statement | `test/harness/harness_unit_test.go`, word for word | `go test ./test/harness/` |
| `docs/STATUS.md` feature cells and statuses; ui/screens.md `**Download JSON** of the finished result` | the gate registry, `test/toolchain/gates.go` | `go test ./test/toolchain/` |

When a number moves, the code that states it moves in the same change; when the code already
disagrees with the docs, the docs are the fix target only if the docs are what is being changed
deliberately.

## 2. decisions.md: each locked decision exactly once

[decisions.md](../../../docs/features/technical-stack/decisions.md#locked-technical-decisions)
holds the numbered locked decisions, the "Stack Decisions to Avoid" list and the open technical
decisions table. It wins over any summary elsewhere, so it must never contradict itself:

- A locked decision appears once. Changing one edits its entry in place; it never adds a second
  entry that overrides the first, and every summary of it (AGENTS.md, architecture.md,
  `technical-stack/stack.md` and the like) follows.
- Changing a locked decision is a deliberate, stated choice, not a side effect of another edit.
- Decisions are cited by number (`decisions.md §26` in the agent skills and reviews), and their
  heading anchors carry the number; renumbering breaks those citations, so add at the end rather
  than insert.

## 3. Open questions stay in step

[open-questions.md](../../../docs/features/open-questions.md) and the
[Open Technical Decisions](../../../docs/features/technical-stack/decisions.md#open-technical-decisions)
table of decisions.md list the same items under the same numbers, one row per question, each with
its milestone. The open-questions entry carries the recommendation and, where the spec already
relies on one, the "Current answer".

- **New question:** add it to both, same number, with a recommendation, the milestone and a link
  to the page that relies on it.
- **Resolved:** remove it from both; in open-questions.md, add it under "Resolved and removed" with
  the answer, who resolved it and the date, and a link. If it becomes a locked decision, it gets
  exactly one entry (section 2), and every page that said "current answer" now states it plainly.
- **Renumbered:** text cites questions by number (`open question 4` in roadmap.md, `item 40`
  inside open-questions.md, and comments under `test/`); search for `open question`, `item` and
  `question` followed by a number across `docs/` and `test/` and fix every citation.

## 4. docs/STATUS.md moves with the feature

[STATUS.md](../../../docs/STATUS.md) is updated in the same change that changes a feature's
status; a stale claim is worse than none. Its rows say `Spec'd (vX.Y)` or `Open (unscheduled)`,
with code pointers once code exists.

The gate registry reads it: a gate's prerequisites include STATUS rows, matched by the **start of
their feature cell**, that must no longer read `Spec'd`.

- Moving a row off `Spec'd` can activate a gate, and an active gate needs all of its hooks, CI jobs
  and workflows in the same change, as a dormant one must have none (`test/toolchain/gates.go`;
  [build-packaging.md §4](../../../docs/features/technical-stack/build-packaging.md#4-ci-workflows)).
- Renaming the start of a feature cell a gate names makes `go test ./test/toolchain/` fail with "no
  row for a gate prerequisite". Rename the gate's entry with it, or keep the start.
- When a milestone's status changes (v0.1 is implemented and not yet released), the status
  statements change with it: STATUS.md's intro,
  [docs/features/README.md](../../../docs/features/README.md), the status lines of AGENTS.md,
  README.md and CONTRIBUTING.md, and the Serena core memory.

## 5. Run the docs test, and know what it does not catch

```bash
go test -count=1 ./test/docs/
```

`-count=1` because its file list comes from `git ls-files`, which the test cache cannot see. The
`docs-links` pre-commit hook runs the same command on every commit. It checks:

- **Links:** every relative link and `#fragment` in tracked Markdown resolves, with GitHub's slug
  rules for headings (a renamed heading breaks every link to it). External URLs are not checked;
  links that leave the repository are errors. Vendored skills and `docs/design_system/` are
  skipped, except what `docs/features/` reaches through symlinks. A new, untracked file is not
  checked until it is tracked.
- **Native paths:** `docs/features/` names no `/api/v1/<name>` beyond `download`, `upload`, `ping`,
  `small`, `ws` and `info` (`/api/v1/metrics` is allowed only as the rejected alternative).
- **Upload shape:** every upload telemetry object, JSON or the `{a, b[], c}` diagram shorthand, has
  exactly the seven keys of section 1.
- **Facts** (`test/docs/facts.go`): `"bucketMs": 100`, `100 ms buckets`, at most 1201 buckets per
  upload request, `120 s (1200 cells)`, `"uploadLifetimeMs": 120000` and `listen: ":8080"`, each
  wherever it appears in `docs/features/`, and each found at least once. A reworded sentence the
  pattern no longer recognizes fails: reword the pattern, never delete the fact.

It does **not** catch any other number, a probe-path name, glossary drift, a decision stated twice,
an open question out of step, a stale STATUS row or a wrong statement that is consistent
everywhere. Those are section 1–4 work. When a new fact starts drifting, add it to `Facts`.

Also: `go test ./test/harness/` after editing testing.md §5, `go test ./test/toolchain/` after
editing STATUS.md or ui/screens.md, and the markdownlint hook for formatting.

## 6. The symlink contract

`docs/features/product.md`, `principles.md`, `measurement.md` and `ui/` are **symlinks** into
`docs/design_system/features/`, the spec files the Claude Design export carries
([docs/README.md](../../../docs/README.md#symlink-contract)).

- Either path edits the same file. Edit them as spec pages, and write their links relative to
  their `docs/features/` location: the docs test resolves links there and then follows the link.
- Never hand-edit anything else under `docs/design_system/`: it is regenerated on every export, so
  a local edit is lost. A visual change goes into the Claude Design project first
  ([provenance rule](../../../docs/README.md#provenance-rule)).
- An edit to a symlinked page is a change to the export too: list the files for the user to paste
  into the Claude Design project by hand, so the next export carries them byte-identical. A Claude
  Design prompt never asks it to write under `features/`. A new export is
  synced with the steps in [docs/README.md](../../../docs/README.md#syncing-a-new-export).
- `docs/features/ui/` is canonical for behavior, the export for visuals; a behavioral
  disagreement is resolved in the spec first.
- Windows checkouts need `git config core.symlinks true`.

## 7. Form

- US English spelling (license, behavior, color, normalize); `cancelled` keeps its double l
  ([ai-guidelines.md](../../../docs/features/technical-stack/ai-guidelines.md#conventions)).
- Prose wraps at about 100 columns; tables, code blocks and headings may run longer (markdownlint
  `line_length: 100`). Lists indent by 2; tables use the compact style the `table-format` rule
  rewrites to.
- Keep each page's breadcrumb line and Related section; link a fact to the page that owns it rather
  than restating it where a link will do.
- Honest numbers apply to the spec too: no number without its qualifiers, no fudge factor, and no
  claim the accuracy harness cannot support.
- A docs-only change is `docs(<scope>): ...` and ships no release; the behavior change is released
  by the code that follows it ([release.md](../../../docs/release.md#versioning)).

---

## Checklist

- [ ] Every page stating the fact updated together; measurement, wire protocol, configuration, ui/
      and glossary agree on numbers, probe-path names and the upload JSON shape
- [ ] Each locked decision appears once in decisions.md; summaries follow it
- [ ] Open questions match between open-questions.md and decisions.md, numbers and citations intact
- [ ] docs/STATUS.md updated in the same change; gate rows and gates still consistent
- [ ] `go test -count=1 ./test/docs/` green; harness and toolchain tests green when their text moved
- [ ] No hand-edit of the design export; no early symlinks
- [ ] Prose wrapped at about 100 columns
- [ ] Behavior change written here first; code follows the docs
