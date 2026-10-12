# Phase indicator

Custom `<ol>` + Progress. Spec: `features/ui/screens.md` §1.

Shows 1–3 phases in configured order: idle latency → download → upload. The info phase is not a
step; it shows as "Connecting…" on the first step.

## Step states

| State | Icon | Bar | Meta |
| --- | --- | --- | --- |
| pending | `circle-dashed`, `--fg-subtle` | empty | "pending · ~12 s" |
| active | direction icon, series colour | fills in series colour | "active · 4.6 s left" or progress |
| done | `circle-check`, `--ok` | full | result, e.g. "done · 3.1 ms" |
| failed | `circle-x`, `--danger` | stops, `--danger` | "failed · interrupted" |
| cancelled | `circle-minus`, `--fg-subtle` | stops, `--fg-subtle` | "cancelled · 3.1 s" |
| skipped | `circle-minus`, `--fg-subtle` | empty | "skipped" |
| capped | `triangle-alert`, `--warn` | stops, `--warn` | "capped · data cap" |

Bar colours: latency `--series-latency`, download `--series-download`, upload
`--series-upload`.

## Rules

- `aria-current="step"` on the active step. State is carried by icon + text, not colour.
- Phase change: 280 ms — the finished bar settles, the next starts filling.
- Pending numbers use `--fg-subtle`, never `--fg-faint`.
