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

- **`v02-a11y-chart-second-scale`**, `ui_kits/app/ResultDetail.jsx`, the Download and Upload chart
  cards' images: their summaries leave out the loaded latency drawn against the right-hand axis,
  which the Test screen's chart summary now names. While that series is drawn, each should end
  "; latency under load on a second scale" too, so a screen reader knows the second axis is there
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-result-copy-name`**, `ui_kits/app/ResultDetail.jsx`, the Text summary card's action: the
  button is named "Copy". It should keep the visible "Copy" and be named "Copy summary", so its name
  says what it copies, as the share dialog's button and
  [screens.md §2](../features/ui/screens.md#2-result-detail--resultid) call it; the visible word
  stays in the name ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-test-grade-ended`**, `components/measurement/LoadCard.jsx`, the grade's `aria-label`: it
  reads "Bufferbloat grade pending" whenever there is no grade, also on a run that ended without one
  (stopped, failed). It should read "Bufferbloat grade pending" only while the run can still reach
  a grade, and "Bufferbloat not graded" once it has ended without one, as the words beside it
  already say ("Not graded — test incomplete").
- **`v02-test-load-rows`**, `ui_kits/app/TestScreen.jsx`, the load card's rows:
  - A row that has no result yet ("Pending", "Not run", or live while its direction runs) already
    names its source, "During upload · WebSocket". The source should come with the direction's
    result, "During download · WebSocket" or the fallback source, since it qualifies that value
    ([screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision)) and the
    WebSocket can still fall back before the result; until then the row reads "During upload".
  - The partial row of the slow run stopped in the download (`cancelled-slow`) reads "+X ms vs idle
    · partial" without its p90. Every row should give the p90 with the increase, "p90 166 · +X ms
    vs idle · partial", as screens.md §6 sets loaded latency as the median and p90.
- **`v02-a11y-header-separators`**, `ui_kits/app/ResultDetail.jsx`, the breadcrumb and the header's
  meta line: the "/" between History and the date and the "·" between the date, the preset and the
  server are text a screen reader reads out. They are decoration and should be hidden from
  assistive technology (`aria-hidden`), so the breadcrumb reads "History, Oct 8, 2026, 2:02 PM"
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-result-not-saved-partial-run`**, `ui_kits/app/ResultDetail.jsx`, the state
  `not-saved-partial`: it draws the complete LAN run, saved values and grade included, with the
  reason "Partial results are not saved". It should draw the run stopped in the upload that the
  `ll-no-steady-window` case already draws (upload insufficient data, the grade from the download
  only, the cancelled notice, no upload chart), since only a partial result gives that reason
  ([screens.md §2](../features/ui/screens.md#2-result-detail--resultid)).
- **`v02-history-range-label`**, `ui_kits/app/History.jsx`, the Date range button with a custom
  range: the range's runs (`BG.timeRange`: "Oct 2", " – ", "8", ", 2026") are the button's own flex
  children, so its gap spreads them out ("Oct 2 · – · 8 · , 2026", 172 px against 150 px). The
  range should be one label set as one line, its runs wrapped in a `span` inside the button.
- **`v02-history-unavailable-body`**, `ui_kits/app/History.jsx`, the History screen with history
  unavailable: the empty state's body starts "The browser isn't letting this site store data" and
  offers to "copy or download each result, but nothing is saved here". It should start with the
  words [edge-cases.md §7](../features/edge-cases.md#7-indexeddb-unavailable-private-mode) sets on
  the History screen, "History is unavailable in this browser mode — results are not saved.", then
  the reason, and offer to download each result as JSON, as Vue's does.
