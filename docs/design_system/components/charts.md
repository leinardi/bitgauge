# Charts

Component `Chart` (`components/charts/`; production uPlot with the same series and hooks), numbers via
`Format`. Spec: `features/ui/screens.md` §1 (Live chart), §2 (Per-phase charts), §3 (Trend chart).

## Series and marks

- Download `--series-download` solid; upload `received` `--series-upload` solid, `sending`
  `--sending` faint; latency `--series-latency` **dashed**, on its own right axis (optional
  loaded-latency toggle).
- Phase separators, a "now" line while live, and event marks drawn via hooks: extended, data cap,
  cancelled, error / lost.
- **Warm-up, live (Test screen):** warm-up samples are drawn over a **shaded band** (`--chart-band`
  fill) that spans the warm-up so far and stops at warm-up end. They exist only in memory and count
  toward no number. The band's edges are `--chart-hatch` lines and a "Warm-up" legend entry names
  it, so it reads at ≥ 3:1 against the surface (`--chart-grid` is ≈ 1.2:1 in dark and is never used
  for it).
- **Warm-up, Result detail:** a **hatched, empty interval**: diagonal 1 px hatching in
  `--chart-hatch` (≥ 3:1 against `--surface-2` in both themes) across `[0, warmupEndMs)`, with no
  series inside it, because warm-up samples are not stored.
- Unknown upload cells and failure gaps are null gaps, never interpolated. A gap spans exactly its
  null cells (`[first null cell start, next known cell start)`); the series before it holds its last
  value to the gap start.
- Gridlines `--chart-grid` (hairline), axis labels `--fg-subtle` mono tabular. Every value-axis label reads in the
  unit the top label names, with the decimals that give the top value three significant digits ("0.25 … 1.00 Gbit/s").
  ms axes (main and latency-under-load) do the same: the top label takes the value precision (whole ms from 10 ms, one
  decimal below) and every tick takes its decimals: "3", "6", "9", "12 ms"; "1.0", "2.0", "3.0", "4.0 ms".
- Phase labels sit right of their separator, mark labels left of their line, on the top row. A mark label that would
  cross a phase label goes right of its line when it fits there, otherwise to a second row (`--chart-label-gap`,
  `--chart-label-row`). One implementation, `placeTopLabels` in Chart.jsx, used by Chart and PhaseChart. Rows below the first are
  `--chart-label-row` apart, or the measured label height when that is taller.
- PhaseChart event chips use the same rules with the right of the line as their preferred side: the left when the right
  crosses another chip or leaves the plot, else a further row. Rows are `--chart-label-row` apart, or the chip height
  plus half the gap when that is taller.

## Throughput chart (Test, Result detail)

Live: throughput over time with phase separators. Result detail: one chart per phase (download and
upload steady-window series, idle latency samples, loaded latency per direction).

## Trend chart (History)

Small multiples over the filtered results: download and upload on a **log** scale, idle latency
**linear**. Results whose status is not `complete` are drawn as **hollow markers**, with a legend
entry. Mobile: one metric at a time with a selector.

## Chart or table

Every chart is `role="img"` whose label is a **summary of the data shown** ("Throughput: Download 590 Mbit/s,
7.5 s / 10 s; warm-up shaded; marked: Extended"), never a static title such as "Throughput chart". `Chart`
requires `summary`; the live chart's summary follows the readout and does not need to be live itself (the
screen's LiveRegion announces). Result-detail charts add a "View as table" toggle. The table is the
text alternative: rows of 2 s windows from warm-up end, throughput as bytes over known time ("—"
for a window with no known time; a shorter edge row shows its real span), and median latency per
window. For cells coarser than 2 s (Continuous), one row per stored cell with the header naming the
cell size.

Line style, not colour alone, distinguishes latency. Reduced motion: draw without easing; the
phase change cross-fades 280 ms otherwise.
