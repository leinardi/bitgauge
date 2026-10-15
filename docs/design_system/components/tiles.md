# Metric tiles

Component `MetricTile` (`components/measurement/`, `.tile` on `.card`: `--surface-2`, hairline,
`--radius-lg`). Spec: `features/ui/screens.md` §6.

## Anatomy

Leading glyph (direction icon in its series colour, else `--fg-subtle`) · eyebrow label (condensed caps
11 px, `--fg-subtle`) · state pill (StatusPill sm) on the right for every non-done state · value (Plex Mono
500, `--type-metric-value` 30 px / compact 24 px, tabular) with a separate mono unit span · qualifier line
(mono 11 px) · optional secondary lines (peak, min / median / p90, overhead compensation, data used).

## States

States follow the result object's direction status (`features/measurement.md` §17: `measured`,
`insufficient-data`, `partial`, `skipped`, `error`) plus the live UI states.

| State | Shows | Pill |
| --- | --- | --- |
| empty | "—" in `--fg-subtle` | — |
| warming-up | the words "warming up" instead of a number, no peak (measurement §14) | Live |
| live | steady-window average so far, qualifier "peak …" so far | Live |
| done (`measured`) | headline + qualifiers | — |
| partial | number only if the confirmed steady window meets the minimum; qualifier names the window | Partial (screens may pass "Partial — stopped early") |
| insufficient-data | **no number**, "—" + reason, e.g. "Insufficient data — confirmed steady window shorter than 3 s" in `--warn-fg` | Insufficient data |
| low-confidence | number + reasons in `--warn-fg` | Low confidence |
| skipped | **no number**, qualifier "skipped" | — |
| error | **no number**, "—" + the error in `--danger-fg`, always prefixed: "error · connection lost", "error · 3 requests in a row failed" | Error |

The error, insufficient-data, skipped and warming-up states never show a number, even when a value is
passed. There is no "incomplete" state; the spec's term is insufficient data.

Fill-in: when a value arrives, "—" fades to the number over 180 ms (`--dur-base`). Nothing slides.
Reduced motion: the number appears without fading.

## Special tiles

- **LoadCard** (component): bufferbloat grade letter (A+ Minimal, A Low, B Mild, C Moderate, D High,
  F Severe) with an A+–F scale strip in `--grade-*`, loaded latency per direction with change vs
  idle, and RPM labelled "HTTP loaded responsiveness — connection sharing not verifiable".
- **QualityList** (component): Streaming, Gaming, Video calls → Great / Good / Average / Poor / Bad as
  StatusBadges (icon + band name); note "Upper bound: packet loss is not measured".
- **NotMeasured** (component): packet loss slot in a MetaList row, dashed outline StatusBadge
  "Not measured" + "Why?" Link. The reason ("Browsers can't see packet loss over TCP",
  `NOT_MEASURED_REASON`) is the row's visible sub line under the "Packet loss" label, because a tooltip
  is not seen on touch; it is also the badge's and link's tooltip and part of the link's accessible
  name. Layout: label and badge share the first line; the reason runs the row's full width beneath,
  ending with the "Why?" link (`NotMeasured link={false}` + `NotMeasuredWhy` in the sub). Never a zero.
- **MetaList** with `title` ("Test", "Session"): data used, duration, packet loss.

Peak is labelled "peak" (p90 of the steady window, never a maximum). Overhead compensation, when
non-zero, is shown next to every number it changed.
