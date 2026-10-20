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

- **`v02-test-edit-without-settings`**, the settings summary row: offline and in `error-early` the
  Edit link still shows over an empty summary. The summary, Edit included, should show only while
  the server's settings are known and the server is reachable: absent before `GET /info` answers,
  offline, and after an error whose re-check of `/info` fails ([screens.md
  §1](../features/ui/screens.md#1-test-home--)). Without the row, the notice and the cards under it
  sit 33 px higher on narrow screens (`v02-test-edit-geometry`).
- **`v02-a11y-edit-name`**, the settings summary's Edit link: it is named by its text, "Edit". It
  should keep the visible "Edit" and be named "Edit settings", so its name says where it goes
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-partial-details-buttons`**, the result bar of stopped and failed runs: it offers Keep in
  history and Download JSON only. It should offer Details too, the link to the run's Result detail,
  as on a complete run ([screens.md §1](../features/ui/screens.md#1-test-home--)); on narrow screens
  the three actions wrap the bar to a second row.
- **`v02-strip-plateau-geometry`**, the connection strip after a failed download (`error`): it reads
  "6 auto". It should name the plateau the download reached before the failure, "6 auto · plateau:
  cap", as the strip gives the stream count with its plateau reason after a run ([screens.md
  §1](../features/ui/screens.md#1-test-home--)).
- **`v03-test-scores-missing-inputs`**, the Good for card of a stopped or failed run
  (`cancelled-latency`, `cancelled-download`, `error`): each experience names one missing input,
  "Streaming needs download". It should name every input the scores report missing, "Streaming
  needs loaded latency and download", as the quality scores name their missing inputs ([screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **`v03-test-path-b-pending-rows`**, the load card's HTTP loaded responsiveness rows of a standard
  run before or without its result: they read "h2 — —". The protocol should be "not reported"
  until the run's info phase records one, then written as HTTP/2; each direction icon should carry
  its name, Download or Upload, for screen readers; and a stopped or failed run's direction without
  enough samples should read "not enough samples" ([screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision), [i18n-a11y.md
  §2](../features/ui/i18n-a11y.md#2-accessibility)).

### Result detail (`ui_kits/app/ResultDetail.jsx`)

- **`v02-result-delete`**, the state after Delete (`deleted`): the page keeps the result under the
  undo toast. Delete removes the result from history at once, so the page should show the deleted
  state, "Result deleted" with a link to History, under the toast, whose Undo puts the result back
  and shows it again ([screens.md §2](../features/ui/screens.md#2-result-detail--resultid)).
- **`v02-result-known-time`**, the upload tile after a failure gap: it ends "· 6.1 of 6.5 s known".
  That qualifier is not among those [screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision) lists for download and upload
  (status, confidence and reasons, overhead compensation), so it should go.
- **`v02-result-chart-key-swatch`**, `components/charts/charts.css:41`: `.pchart-k .sw.hatch` takes
  the plot overlay's `position: absolute`, so the chart key's warm-up swatch covers the first
  letters of "Warm-up · not stored". The key's swatch should sit inline before its words, as the
  throughput chart's key draws it; the absolute position belongs to the overlay only.
- **`v02-curly-apostrophes`**, the strings: "This result isn’t in this browser’s history" and the
  packet-loss notice's "can’t" use the typographic ’. The product's strings use the straight
  apostrophe, as the spec writes them: "isn't", "browser's", "can't".

### History (`ui_kits/app/History.jsx`)

- **`v02-history-loading`**, the `loading` variant: Import JSON stays enabled and nothing is
  announced. Import JSON should wait, disabled, until the store is open, and a status should
  announce "Loading history" over the placeholders ([screens.md
  §3](../features/ui/screens.md#3-history--history)).
- **`v02-history-storage-used`**, the header's count: "8 of 48 shown". Where
  `navigator.storage.estimate()` is available it should add the storage this origin uses, "8 of 48
  shown · 12 kB used" ([screens.md §3](../features/ui/screens.md#3-history--history)).
- **`v02-history-import-result`**, the `importresult` variant: "1 rejected: schema version 3 is
  newer than this app". Each rejected record should be named by its position, "1 rejected: result
  16: schema version 3 is newer than this app" ([screens.md
  §3](../features/ui/screens.md#3-history--history)).
- **`v02-a11y-search-field`**, the filter bar's search: an input of type text. It should be an input
  of type search, a searchbox ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)), on
  every width.
- **`v02-a11y-range-group`**, the Date range popover's custom range: the From and To fields and the
  dash between them are siblings of the Custom range heading. The two fields should form a group
  named by that heading, and the dash should be hidden from assistive technology ([i18n-a11y.md
  §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-a11y-export-separator`**, the Export menu: the rule before its note is a plain line. It
  should be a separator (`role="separator"`) ([i18n-a11y.md
  §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-a11y-selection-hint`**, the narrow floating selection bar: it has no hint. It should keep
  Compare's "Compare needs exactly 2…" hint as visually hidden text that also describes Compare, as
  the desktop bar shows it ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-history-popover-edge`**, `components/actions/actions.css` `.pop`: on a 390 px screen the
  Date range popover and the Export menu hang past the screen's left edge (x −150 px and −47 px).
  Popovers and menus should shift to stay within the screen, as Reka places them.

### Settings (`ui_kits/app/Settings.jsx`)

- **`v02-settings-label-setting`**, Display and behavior: there is no Result label row. It should
  have one, an optional label of at most 64 characters that pre-fills the label of every result in
  this browser ([screens.md §4](../features/ui/screens.md#4-settings--settings)); the card, and the
  page, grow by the row.
- **`v02-settings-us-spelling`**, the card title "Display and behaviour": the product is in US
  English, "Display and behavior".
- **`v02-settings-phases`**, Phases: idle latency is checked and disabled, with "Idle latency always
  runs first. Turn off a direction to test the other one, or latency only." All three phases should
  be toggles, the last one on disabled, with "Idle latency runs first. Turn off a phase to test the
  others; at least one stays on." ([screens.md §4](../features/ui/screens.md#4-settings--settings)).
- **`v02-a11y-phases-group`**, Phases: the label and the checkboxes are siblings. The checkboxes
  should form a group named by the Phases label ([i18n-a11y.md
  §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-settings-stream-spinbutton`**, Streams, fixed: the count is plain text between Fewer and
  More. It should be a spinbutton between them, typed or stepped, with its range and name (the
  shadcn-vue NumberField) ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-settings-native-select`**, `components/forms/Select.jsx`: a styled native `select`. It
  should stand for the shadcn-vue Select, a combobox button whose listbox opens on demand, as
  [frontend.md](../features/technical-stack/frontend.md) takes the controls from shadcn-vue on Reka
  UI.
- **`v02-settings-share-sentence`**, the Shareable link caption: "Opens BitGauge with the settings
  that differ from the defaults. Phase order, per-direction durations, ping count, warm-up and
  overhead compensation aren't link parameters." It should be its first sentence only, followed,
  when some changed settings have no parameter, by a "Not in the link: …" line naming them
  ([url-params.md §3](../features/ui/url-params.md#3-shareable-settings-url)).
- **`v02-a11y-run-param-code`**, the Shareable link's checkbox: `run=1` is a mono span. It should be
  a `code` element ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-a11y-changed-list`**, the Changed from defaults card: a `div` per setting. The settings
  should be a list, a `ul` with an `li` each ([i18n-a11y.md
  §2](../features/ui/i18n-a11y.md#2-accessibility)).
