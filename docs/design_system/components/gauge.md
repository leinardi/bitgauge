# Gauge

A 270° logarithmic arc in custom SVG. **The engine picks the window and supplies every value; the
gauge only draws.** Spec: `features/ui/screens.md` §1 (Live gauge).

## Anatomy

- Track arc (`--surface-3`), value arc in the active series colour (`--series-download` /
  `--series-upload`; latency mode `--series-latency`).
- Decade ticks and labels (`--fg-faint` ticks, `--fg-subtle` labels), needle dot.
- **Range band:** min–max of the last 10 gauge values (1 s).
- **Peak tick:** download = steady-window p90 so far, hidden while warming up. Upload: none while
  running. Continuous: p90, last hour.
- **Inner arc:** on completion, shows the upload headline.
- Eyebrow (phase, e.g. "Upload · sending"), readout (Plex Mono 500, 58/46 px), separate unit span,
  caption naming the window: `log scale · 100 kbit/s – 1 Gbit/s · auto`.

## Behaviour rules

1. **Windows** are 4 log decades, `[10^k, 10^(k+4))`.
   - bit/s: k=6 `1 Mbit/s – 10 Gbit/s` (start), k=5, k=4 `10 kbit/s – 100 Mbit/s` (floor).
   - B/s: k=6 `1 MB/s – 10 GB/s` (ceiling), k=5 `100 kB/s – 1 GB/s` (start), k=4, k=3
     `1 kB/s – 10 MB/s` (floor).
   - ms: `1 – 1000 ms`, fixed, never shifts.
2. **Input:** the 5-bucket rate at 10 Hz. During upload: client sending progress, eyebrow
   "Upload · sending".
3. **Shift down** after 2 s continuously below `10^(k+1)`; **shift up** after 2 s continuously above
   `10^(k+3)`. Leaving the zone resets the hold. One decade per shift. No flip-flop at a boundary.
4. **Motion:** 280 ms ease-out, tweening the window in log space; ticks, labels and needle move
   together. Each sample tweens 180 ms. Readout text redraws at 4 Hz. Reduced motion: jump.
5. **Start:** the first throughput direction of a run (per configured order, or the only direction
   of a Continuous run) starts in the start window. The second direction starts where the first
   ended. Nothing carries over between runs.
6. At most two shifts down from the start in either unit. In bytes, a link above 100 MB/s shifts up
   once.
7. **Out of range:** beyond the floor or ceiling window the needle pins at the arc ends
   (10 kbit/s and 10 Gbit/s; 1 kB/s and 10 GB/s). **The readout stays exact; the number never
   clamps.**

## Modes and states

Rate (throughput), ms (idle latency, with ping counter and live median), idle, countdown
(ring drains in 1 s linear steps), cancelled, error ("Server unreachable" + Retry).

## Accessibility

The 10 Hz readout is **not** `aria-live`. A separate visually hidden `aria-live="polite"` region
announces each phase change, the current rate at most once every 5 s, and each direction's headline
once when it finishes. Arcs meet 3:1; the readout meets 4.5:1.
