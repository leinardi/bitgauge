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

- **`v02-test-grade-ended`**, `ui_kits/app/TestScreen.jsx`, the load card's `ended` in the
  `error-early` state once the page's re-check of `GET /info` has failed: the button is then a copy
  of `BTN.retry` and `partial` is null, so `ended` is false and the grade reads "Bufferbloat grade
  pending" beside "Not graded — test incomplete". The run has ended there too, so `ended` should be
  true whichever form the Retry button takes, and the grade should read "Bufferbloat not graded".
- **`v02-test-load-rows`**, `ui_kits/app/TestScreen.jsx`, the load card's download row while the
  upload runs (`upload`, `slow`, `insufficient`): it reads "During download · WebSocket". The
  loaded latency, and with it the source, is computed when the run's result is put together, so
  until the run has a result the row should read "During download", as the upload's live row reads
  "During upload"; the source comes with the result
  ([screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision)).
