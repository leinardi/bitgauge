# Gauge

A 270° logarithmic arc in custom SVG — component `Gauge` (`components/gauge/`). **The engine supplies
gauge values only; the gauge component picks and shifts the window from them.** The engine never chooses,
sends or knows the window. The window is presentation only: it never feeds a number, and the caption names
it. Spec: `features/measurement.md` §14, `features/ui/screens.md` §1 (Live gauge).

## Anatomy

- Track arc (`--surface-3`), value arc in the active series colour (`--series-download` /
  `--series-upload`; latency mode `--series-latency`).
- Decade ticks and labels (`--fg-faint` ticks, `--fg-subtle` labels), needle dot.
- **Range band:** min–max of the last 10 gauge values (1 s).
- **Peak tick:** download = steady-window p90 so far, hidden while warming up. Upload: **none while
  running** (the gauge shows sending progress, not a measurement). Continuous: p90, last hour.
- **Inner arc:** on completion, shows the upload headline, with `innerLabel` text ("438 Mbit/s upload") so
  it is not colour-only.
- Inside the dial: eyebrow (phase, e.g. "Upload · sending"), readout (Plex Mono 500,
  `--type-gauge-readout` 58 px / compact 46 px), separate unit span, one mono `note` line
  ("median 3.1 · ping 12 of 20", "avg so far 598 · peak 612", "Esc cancels").
- Under the dial: the caption naming the current window (`log scale · 100 kbit/s – 1 Gbit/s · auto`,
  optionally `· session average`), then an optional `sub` line (overhead compensation).
- Size: 300 px; 272 px in the compact layout. Screens never pass font sizes.

## Units

- **Bits mode (default):** the value is in bit/s.
- **Bytes mode:** the value is in **B/s** (decimal: kB/s, MB/s, GB/s) and the gauge uses byte
  windows. The UI converts the engine's rate before passing it in; the readout and caption use
  byte units.
- **Latency mode:** the value is in ms.

## Behaviour rules

1. **Windows** are 4 log decades, `[10^k, 10^(k+4))`, with ticks per decade.
   - Bits (bit/s): k = 6 `1 Mbit/s – 10 Gbit/s` (start), k = 5 `100 kbit/s – 1 Gbit/s`, k = 4
     `10 kbit/s – 100 Mbit/s` (floor).
   - Bytes (B/s): k = 6 `1 MB/s – 10 GB/s` (ceiling), k = 5 `100 kB/s – 1 GB/s` (start), k = 4
     `10 kB/s – 100 MB/s`, k = 3 `1 kB/s – 10 MB/s` (floor). Four windows, because byte decades
     do not line up with bit decades.
   - ms: `1 – 1000 ms`, fixed, never shifts.
2. **Input:** the gauge value, the rate over the last 5 buckets. During upload it is the client's
   sending progress; eyebrow "Upload · sending".
3. **Shift down** after the value stays below `10^(k+1)` (the bottom decade) for 2 s; **shift up**
   after it stays above `10^(k+3)` (the top decade) for 2 s. Leaving the zone resets the hold. One
   decade per shift. After a shift the opposite threshold is two decades away, so a value near a
   boundary cannot flip the window back and forth.
4. The rule is a pure function of the value stream and the clock, unit-tested with synthetic
   sequences.
5. **Start:** the first throughput direction of a run (per configured order, or the only direction
   of a Continuous run) starts in the start window. The second direction starts in the window the
   first ended in; the UI carries it (`startDecade`). Nothing carries over between runs.
6. From the start window a slow link reaches the floor after at most two shifts in either mode. In
   bytes mode a link above 100 MB/s shifts up once.
7. **Out of range:** beyond the floor or ceiling window the needle pins at the arc ends
   (10 kbit/s and 10 Gbit/s; 1 kB/s and 10 GB/s). **The readout stays exact; the number never
   clamps.**
8. **Motion:** a window shift tweens 280 ms ease-out in log space; ticks, labels and needle move
   together. Each sample tweens 180 ms, phase switches included: the value arc is a full-track path
   with `pathLength="1"` and `stroke-dasharray: <fraction> 1`, and only the dash transitions, so the
   sweep stays on the ring (never transition `d`). A value at the window floor draws no arc. Under `prefers-reduced-motion` there is no transition:
   values and windows jump.

## Modes and states

Two **modes** (`mode`): `rate` (throughput) and `ms` (idle latency). Seven **states** (`state`), one per
Test-screen state of `features/ui/screens.md` §1:

| `state` | Test-screen state | Dial | Readout |
| --- | --- | --- | --- |
| `idle` | Idle, URL parameter ignored | track only | title "Ready", message "Press Enter to start" (desktop) / "Tap Start test to begin" |
| `countdown` | Auto-start countdown | `--primary` ring drains | "Auto-start in", whole seconds left, "second(s)", note "Esc cancels" |
| `connecting` | Running: info | track only | title "Connecting…" (the info phase also shows "Connecting…" on the first phase step), message "<server> · reading server info" |
| `live` | Running: idle latency (`ms`), download / upload (`rate`), Continuous | value arc, needle, band, peak | eyebrow, readout, unit, note |
| `cancelled` | Cancelled, Continuous stopped in warm-up | final value arc, **no needle** | icon `circle-minus`, title "Cancelled" / "Stopped", message "Partial results · not saved" |
| `error` | Error | track only | icon in `--danger`, title "Connection lost", message "Error during <phase>", detail (last sample) |
| `offline` | Offline / retry | track only | icon `server-off` in `--danger`, title "Server unreachable", message "<server or host> didn't respond…", Retry button |

Done uses `live` with the final value, no band, and the inner upload arc.

**Countdown:** the ring drains linearly over the countdown, one third per second for the 3 s
countdown, and the readout shows the whole seconds left. Under `prefers-reduced-motion` the ring
does not animate: it shows the seconds left as whole steps that change once per second, together
with the number, so the number carries the count without any motion.

## Accessibility

- The arc, ticks, band and needle are `aria-hidden`. The numeric readout (eyebrow, number, unit)
  is the accessible value, as plain text; no `role="img"` label carries the number.
- The 10 Hz readout is **not** `aria-live`, and the Gauge renders **no** live region.
- The screen renders exactly one `LiveRegion` (visually hidden, polite) as a direct child of `<main>`.
  It announces each phase change, the current rate at most once every 5 s, and each direction's
  headline once when it finishes (`features/ui/i18n-a11y.md` §2.1).
- Arcs meet 3:1; the readout meets 4.5:1.
