---
name: spec-change
description: >
  How to change BitGauge's specification without letting it disagree with itself:
  update every page that states a number, probe-path name or the upload JSON shape
  together; keep each locked decision in decisions.md exactly once; keep the open items
  in docs/features/README.md current; run go test ./test/docs/ and know what it does
  not catch; respect the design-export symlink contract; wrap prose at about 100
  columns. Use when editing docs/features/**, when a behavior change is about to start
  (it starts here, and code follows), or when a decision or open item is settled.
---

# Spec Change — BitGauge

`docs/features/` is the behavior contract: a change to what the product does starts as a docs
change and code follows it. [decisions.md](../../../docs/features/technical-stack/decisions.md)
wins on technical choices. Implementation details live in the code, not in the docs.

## 1. Update every page that states the fact, together

[measurement.md](../../../docs/features/measurement.md),
[wire-protocol.md](../../../docs/features/wire-protocol.md),
[configuration.md](../../../docs/features/configuration.md),
[ui/](../../../docs/features/ui/README.md) and [glossary.md](../../../docs/features/glossary.md)
must agree on numbers (bucket width, lifetimes, caps, defaults, thresholds, durations, ramps), the
probe-path names (path A, the WebSocket echo with its HTTP fallback; path B, the HTTP loaded
responsiveness probe) and the upload JSON shape: exactly `epoch`, `bucketMs`, `firstBucket`,
`buckets`, `bytes`, `startMs`, `durationMs`
([wire-protocol.md §4](../../../docs/features/wire-protocol.md#4-upload-telemetry)).

Search the whole tree for the old value and its spellings (`120 s`, `120000`, `1200 cells`). A
config key also needs its validation rule in configuration.md; a native route or field also goes
through the `api-contract` skill. When a number moves, the code that states it moves in the same
change. Prefer linking to the page or file that owns a fact over restating it.

## 2. decisions.md: each locked decision exactly once

Changing a locked decision edits its entry in place and is a deliberate, stated choice. Decisions
are cited by number (`decisions.md §26`), so add new ones at the end rather than insert.

## 3. Open items

The few questions still open, and the unscheduled "Later" work, are listed in
[docs/features/README.md](../../../docs/features/README.md#later-and-open-items). A settled item
leaves that list, and the page that relies on it states the answer plainly.

## 4. Run the docs test, and know what it does not catch

```bash
go test -count=1 ./test/docs/
```

The `docs-links` hook runs it on every commit. It checks every relative link and `#fragment` in
tracked Markdown (GitHub slug rules: a renamed heading breaks its links), that `docs/features/`
names no `/api/v1/<name>` beyond `download`, `upload`, `ping`, `small`, `ws` and `info`, that every
upload telemetry object has exactly the seven keys, and the few facts in `test/docs/facts.go`. A
reworded sentence a fact's pattern no longer recognizes fails: reword the pattern, never delete
the fact. It does **not** catch any other number, a probe-path name or a decision stated twice;
that is section 1–2 work.

## 5. The symlink contract

`docs/features/product.md`, `principles.md`, `measurement.md` and `ui/` are **symlinks** into
`docs/design_system/features/` ([docs/README.md](../../../docs/README.md#symlink-contract)).

- Either path edits the same file; write links relative to the `docs/features/` location.
- Never hand-edit anything else under `docs/design_system/`: it is regenerated on every export
  ([provenance rule](../../../docs/README.md#provenance-rule)).
- An edit to a symlinked page is a change to the export too: list the files for the user to paste
  into the Claude Design project by hand. A Claude Design prompt never asks it to write under
  `features/`.
- `docs/features/ui/` is canonical for behavior, the export for visuals.

## 6. Form

- US English spelling (license, behavior, color, normalize); `cancelled` keeps its double l.
- Prose wraps at about 100 columns (markdownlint `line_length: 100`); lists indent by 2.
- Keep each page's breadcrumb line and Related section.
- Honest numbers apply to the spec too: no number without its qualifiers.
- A docs-only change is `docs(<scope>): ...` and ships no release
  ([release.md](../../../docs/release.md#versioning)).

## Checklist

- [ ] Every page stating the fact updated together; code that states it moved with it
- [ ] Each locked decision appears once in decisions.md
- [ ] Open items in docs/features/README.md still current
- [ ] `go test -count=1 ./test/docs/` green
- [ ] No hand-edit of the design export; symlinked pages listed for the user
