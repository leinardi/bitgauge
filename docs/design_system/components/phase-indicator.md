# Phase indicator

Components `PhaseIndicator` (an `<ol aria-label="Test phases">`) and `PhaseStep`
(`components/measurement/`). Spec: `features/ui/screens.md` §1.

Shows 1–3 phases in configured order: idle latency → download → upload. The info phase is not a
step; it shows as label "Connecting…" (state `active`, detail "server info") on the first step.

## Anatomy

State icon (15 px) · phase name (`--text-sm` 600) · mono meta right-aligned (stacked under the name in the
compact layout) · 4 px bar on `--surface-3`. Names: **Idle latency**, **Download**, **Upload** (the
spec's terms); Continuous uses the label "Download · continuous".

## Step states

The meta line is always `<state>[ · <detail>]`; screens pass only the detail.

| State | Icon | Bar | Meta |
| --- | --- | --- | --- |
| pending | `circle-dashed`, `--fg-subtle` | empty | "pending · ~10–20 s" (download), "pending · ~15–25 s" (upload), "pending · ~2 s" (idle latency) |
| active | direction icon, series colour | fills in series colour | "active · 4.6 s left", "active · 12 / 20 pings", "active · confirming last requests" |
| done | `circle-check`, `--ok` | full | result, e.g. "done · 3.1 ms", "done · 612 Mbit/s" |
| failed | `circle-x`, `--danger` | stops, `--danger` | "failed · interrupted at 6.4 s" |
| cancelled | `circle-minus`, `--fg-subtle` | stops, `--fg-subtle` | "cancelled · 3.1 s" |
| skipped | `circle-minus`, `--fg-subtle` | empty | "skipped" |
| capped | `triangle-alert`, `--fg-subtle` | stops, `--fg-subtle` | "capped · data cap" — only when the data cap ended the phase |

Bar colours: latency `--series-latency`, download `--series-download`, upload
`--series-upload`.

A direction that reached its maximum without a steady window is **not** capped: it is `done` with the
detail "insufficient data": insufficient data is the direction's result status, shown as the detail of a done step.

## Rules

- `aria-current="step"` on the active step. State is carried by icon + text, not colour.
- Phase change: 280 ms — the finished bar settles, the next starts filling.
- Pending numbers use `--fg-subtle`, never `--fg-faint`.
