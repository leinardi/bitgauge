# Metric tiles

Card (`.card`: `--surface-2`, hairline, `--radius-lg`). Spec: `features/ui/screens.md` §6.

## Anatomy

Eyebrow label (condensed caps, `--fg-subtle`), value (Plex Mono 500, 30/24 px, tabular) with a
separate unit span, qualifier line, optional secondary values (peak, min / median / p90).

## States

| State | Shows |
| --- | --- |
| empty | "—" in `--fg-subtle` |
| warming up | "warming up" until warm-up ends; no peak |
| live | steady-window average and peak so far |
| done | headline + qualifiers |
| partial | number only if the confirmed steady window meets the minimum, with `partial` |
| incomplete / insufficient data | **no number**, "—" + "insufficient data" + suggested action |
| low confidence | number + `low confidence` with reasons |
| error | **no number**, "—" + the error in `--danger-fg` (e.g. "error · connection lost") |

The error, incomplete and insufficient-data states never show a number, even when a partial value
exists.

Fill-in: when a value arrives, "—" fades to the number over 180 ms (`--dur-base`). Nothing slides.
Reduced motion: the number appears without fading.

## Special tiles

- **LoadCard:** bufferbloat grade letter (A+ Minimal, A Low, B Mild, C Moderate, D High,
  F Severe) with an A+–F scale strip in `--grade-*`, loaded latency per direction with change vs
  idle, and RPM labelled "HTTP loaded responsiveness — connection sharing not verifiable".
- **QualityList:** Streaming, Gaming, Video calls → Great / Good / Average / Poor / Bad in
  `--quality-*`, each with an icon and text; note "upper bound: packet loss is not measured".
- **NotMeasured:** packet loss slot, dashed outline badge, "packet loss — not measured", tooltip
  explaining why. Never a zero.

Peak is labelled "peak" (p90 of the steady window, never a maximum). Overhead compensation, when
non-zero, is shown next to every number it changed.
