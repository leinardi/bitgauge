# Design System Upstream Notes

The design export in `docs/design_system/` is never edited in this repository
([docs/README.md](../README.md#design-export)). When the demo parity triage decides that the export
is the side to change (a triage cluster's `upstream` action in `.parity-triage.json`), or when the
Vue app needs a value the export draws only as a literal with no token (the `design-system-guard`
skill), the change is written down here instead, as a note to paste into the Claude Design project,
so that the next export carries it. Once an export with the change has been imported, its note is
removed.

Each note names the triage cluster or the skill it comes from, the kit file and the element, what
the export shows, and what it should show, with the reason; behavior comes from
[`docs/features/ui/`](../features/ui/README.md), visuals from the export's own tokens.

## Notes

### Chart value labels in one unit

From the Vue chart's axis fix of 2026-10-16 (no triage cluster: the labels are hidden from the
accessibility tree and differ in text, so the harness pairs nothing to compare).

- **Kit:** `components/charts/Chart.jsx`, `chartGeometry()`, the `lab` helper behind the five
  `.chart-lb .y` labels.
- **The export shows:** every tick is formatted on its own with `Format.rate`, which picks a unit
  per value, and only the top label carries the unit. On the empty chart, up to 1 Gbit/s, the ticks
  read "250", "500", "750" and "1.00 Gbit/s": the lower three are megabits under a gigabit unit.
- **It should show:** every tick in the unit the top one reads in, with the decimals that give the
  top three significant digits: "0.25", "0.50", "0.75", "1.00 Gbit/s"; "200" … "800 Mbit/s" is
  unchanged. A label that reads in another unit than the one the axis names misstates the scale
  ([principles.md](../features/principles.md), honest numbers).

### Chart mark label over a phase label

From the production check of the chart on 2026-10-16. There is no triage cluster: the kit's fixed
cancel instant and the demo's differ, so the harness sees an offset, not the overlap.

- **Kit:** `components/charts/Chart.jsx`, the `.sp` phase labels and the `.mk` mark labels over the
  plot, placed by `chartGeometry()`.
- **The export shows:** a mark label sits to the left of its line, and a phase label to the right
  of its separator, both on the plot's top row. A run that stops soon after a phase begins puts the
  two on top of each other. The kit's own `cancelled` state shows it: "Upload" at x 895 and
  "Cancelled" at x 901 overlap, and the Vue app does the same on a real run.
- **It should show:** both labels readable. One way is to drop the mark label to a second row when
  it would cross a phase label. Another is to put the mark label to the right of its line when the
  phase label already takes the space to its left.

### Subtle text on a selected History row

From the axe check of the Compare dialog in the dark theme on 2026-10-17 (`web/e2e/a11y.spec.ts`;
no triage cluster: parity compares the light and dark kit pages, whose rows are not selected).

- **Kit:** `components/layout/layout.css`, `.tbl tbody tr.sel`, and `ui_kits/app/History.jsx`, the
  selected card's `cardBg`: both put a selected row or card on `--primary-bg`. The row's small
  `--fg-subtle` text, such as the units after the rates and the latencies, stays as it is.
- **The export shows:** in the dark theme, `--fg-subtle` (`oklch(0.66 0.013 255)`) over
  `--primary-bg` on `--surface-2` reads at 4.25:1 for the 11 px text, below the 4.5:1 that
  [i18n-a11y.md §2.6](../features/ui/i18n-a11y.md#26-contrast) asks of body text. The light
  theme passes.
- **It should show:** at least 4.5:1 for every text on a selected row in both themes. For example,
  a selected row could raise its subtle text to `--fg-muted`, or `--primary-bg` could be a step
  darker in the dark theme. The Vue app keeps the export's tokens until an export carries the fix
  (design-system-guard, accessibility). Meanwhile the Compare dialog's axe check covers the dialog,
  which is the only thing a screen reader can reach while it is open.
