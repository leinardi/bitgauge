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

### Test screen (`ui_kits/app/TestScreen.jsx`)

- **`v03-test-resp-path-b`** and **`v03-test-continuous-path-b`**, the load card's HTTP loaded
  responsiveness rows in the Responsiveness cases and the Continuous states: the protocol reads the
  raw "h2" and the direction icons have no name. The protocol should be written "HTTP/2", and each
  direction icon should carry its name, Download or Upload, for screen readers, as in the standard
  run's rows ([screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision),
  [i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).

### Result detail (`ui_kits/app/ResultDetail.jsx`)

- **`v03-result-resp-path-b`** and **`v03-result-continuous-path-b`**, the load card's HTTP loaded
  responsiveness rows in the Responsiveness cases and of the 2 h and 9-day Continuous results: the
  protocol reads the raw "h2" and the direction icons have no name. As on the Test screen, the
  protocol should be written "HTTP/2" and each direction icon named Download or Upload, with TM95,
  the samples and "TM95 equals the plain mean" as they are ([screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **`v02-curly-apostrophes`**, the strings: "This result isn’t in this browser’s history" and the
  packet-loss notice's "can’t" use the typographic ’. The product's strings use the straight
  apostrophe, as the spec writes them: "isn't", "browser's", "can't".

### History (`ui_kits/app/History.jsx`)

- **`v02-history-storage-used`**, the header's count: "8 of 48 shown". Where
  `navigator.storage.estimate()` is available it should add the storage this origin uses, "8 of 48
  shown · 12 kB used" ([screens.md §3](../features/ui/screens.md#3-history--history)).
- **`v02-a11y-selection-hint`**, the narrow floating selection bar: it has no hint. It should keep
  Compare's "Compare needs exactly 2…" hint as visually hidden text that also describes Compare, as
  the desktop bar shows it ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-history-popover-edge`**, `components/actions/actions.css` `.pop`: on a 390 px screen the
  Date range popover and the Export menu hang past the screen's left edge (x −150 px and −47 px).
  Popovers and menus should shift to stay within the screen, as Reka places them.
