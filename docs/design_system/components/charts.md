# Charts

uPlot. Spec: `features/ui/screens.md` §1 (Live chart), §2 (Per-phase charts), §3 (Trend chart).

## Series and marks

- Download `--series-download` solid; upload `received` `--series-upload` solid, `sending`
  `--sending` faint; latency `--series-latency` **dashed**, on its own right axis (optional
  loaded-latency toggle).
- Phase separators, a "now" line while live, and event marks drawn via hooks: extended, data cap,
  cancelled, error / lost.
- Warm-up is a marked, excluded interval. Unknown upload cells and failure gaps are null gaps,
  never interpolated.
- Gridlines `--border-subtle`, axis labels `--fg-subtle` mono tabular.

## Throughput chart (Test, Result detail)

Live: throughput over time with phase separators. Result detail: one chart per phase (download and
upload steady-window series, idle latency samples, loaded latency per direction).

## Trend chart (History)

Small multiples over the filtered results: download and upload on a **log** scale, idle latency
**linear**. Results whose status is not `complete` are drawn as **hollow markers**, with a legend
entry. Mobile: one metric at a time with a selector.

## Chart or table

Every chart is `role="img"` with a summary label and a "View as table" toggle. The table is the
text alternative: rows of 2 s windows from warm-up end, throughput as bytes over known time ("—"
for a window with no known time; a shorter edge row shows its real span), and median latency per
window. For cells coarser than 2 s (Continuous), one row per stored cell with the header naming the
cell size.

Line style, not colour alone, distinguishes latency. Reduced motion: draw without easing; the
phase change cross-fades 280 ms otherwise.
