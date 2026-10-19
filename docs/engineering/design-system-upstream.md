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

## v0.3

The v0.3 specification was settled before the kit's v0.3 states were redrawn (open questions 56 to
63). Each note below names the kit file and the element, what the kit shows, and what the spec
asks for; the notes come from the `spec-change` skill's symlink contract, since the spec pages
changed first. Paste the prompt at the end into the Claude Design project together with the spec
files it lists.

### Test screen (`ui_kits/app/TestScreen.jsx`)

- **`v03-summary-rpm-scores`**, the screen-reader summary (lines 687–693): after the grade it reads
  data used and the notices. From v0.3 it should also read the HTTP loaded responsiveness per
  direction with its label, protocol and state, and each quality-score experience with its band or
  missing inputs, before data used ([i18n-a11y.md
  §2.7](../features/ui/i18n-a11y.md#27-screen-reader-result-summary)).
- **`v03-continuous-result-metrics`**, the `cont-done` state (line 529, `load: null`): the finished
  Continuous result has no grade, no HTTP loaded responsiveness and no quality scores, and its
  Loaded latency tile reads "session median" (line 542). The live view (`continuous`) rightly
  shows none of the three, but the finished result should show all three, and its loaded latency
  is the last hour's median, labeled "last hour" ([screens.md
  §1](../features/ui/screens.md#1-test-home--), [measurement.md
  §15](../features/measurement.md#15-continuous-mode)).
- **`v03-continuous-upload-live`**, the Continuous states: only a Continuous download is drawn.
  There should be a live Continuous upload too, with the `received` series and its unknown cells as
  gaps ([flows.md §7](../features/ui/flows.md#7-continuous-mode)).
- **`v03-continuous-run-length`**, the Continuous live view: it should show the elapsed time
  against the run length with the run's end time, and the elapsed time alone when no run length is
  set, which is the default ([screens.md §1](../features/ui/screens.md#1-test-home--)).

### Result detail (`ui_kits/app/ResultDetail.jsx`)

- **`v03-continuous-other-direction`**, a Continuous result's upload (lines 161 and 196): the tile
  reads "not measured · Continuous runs one direction" and a neutral "Upload not measured" notice
  repeats it. The direction it did not run is `skipped`: the tile should read "not run · Continuous
  runs one direction", and there should be no notice ([screens.md
  §2](../features/ui/screens.md#2-result-detail--resultid)).
- **`v03-sharing-label`**, "Connection sharing not verifiable" (line 183): a neutral notice. It is
  part of the metric's label, "HTTP loaded responsiveness — connection sharing not verifiable",
  shown with the protocol on the metric itself, never as a notice ([screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **`v03-responsiveness-states`**, the responsiveness card: only `measured` is drawn. It should
  also show `uncertain`, `unavailable_h1` ("needs HTTP/2 or HTTP/3 at the reverse proxy", "protocol
  not reported — treated as HTTP/1.1") and `unavailable_insufficient` ("not enough samples"), each
  without a number where it has none ([screens.md
  §6](../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **`v03-tm95-plain-mean`**, the responsiveness detail: with fewer than 20 samples nothing is
  trimmed, and the detail should say "TM95 equals the plain mean" ([measurement.md
  §12.5](../features/measurement.md#125-formula)).
- **`v03-seven-days`**, a Continuous result longer than 7 days: there is no note. It should say
  that only the last 7 days were saved ([screens.md
  §2](../features/ui/screens.md#2-result-detail--resultid)).

### Other clients (`ui_kits/app/About.jsx`)

- **`v03-snippet-content`**, the snippets: the LibreSpeed file is `servers.json`, the slow-link
  command uses `--chunks 10`, and networkQuality's verbose form puts `-v` before `-C`. They should
  follow [compatibility.md](../features/compatibility.md), which is not in the export, exactly
  ([screens.md §5](../features/ui/screens.md#5-other-clients--about--about)):
  - the server list is `bitgauge.json`;
  - `librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json`;
  - the second command, which the kit lacks:
    `librespeed-cli --server-json <base URL>/.well-known/librespeed --server 1 --no-icmp`;
  - `networkQuality -C <base URL>/nq/config` and `networkQuality -C <base URL>/nq/config -v`.
- **`v03-snippet-extras`**, the facts and the snippet headers: a "Clients" fact and a "BitGauge
  docs" link per client. Neither is in [screens.md
  §5](../features/ui/screens.md#5-other-clients--about--about); they should go, or the spec gains
  them first.
- **`v03-snippet-scroll`**, `Snippet`: long lines wrap. A snippet should never wrap: a long line
  scrolls horizontally inside its code block, so a copied command reads as it runs ([screens.md
  §5](../features/ui/screens.md#5-other-clients--about--about)).
- **`v03-nq-https-note`**, the networkQuality snippet on a page that is not `https`: it should
  carry a note that networkQuality needs HTTPS through the reverse proxy (or `server.public_url`)
  ([screens.md §5](../features/ui/screens.md#5-other-clients--about--about)).

### Notices, Compare and Settings (`ui_kits/app/ResultDetail.jsx`, `TestScreen.jsx`, `History.jsx`, `Settings.jsx`)

- **`v03-data-used-tone`**, the `data-used` notice: in the Continuous Result detail
  (`ResultDetail.jsx` line 195) it is a neutral "Data used" notice, and the finished `cont-done`
  Test screen (`TestScreen.jsx` line 546, `notices: []`) drops it. It should have the info tone
  everywhere, and the finished result should keep each data-used notice the run raised, live and
  in the result ([screens.md §7](../features/ui/screens.md#7-notices)).
- **`v03-compare-rows`**, the Compare dialog (`History.jsx` lines 138–139): one combined "HTTP
  loaded responsiveness" row and no quality-score rows. It should have one responsiveness row per
  direction, the RPM compared only when both sides are `measured` and "not comparable" otherwise,
  and one row per quality-score experience, compared in band order ([screens.md
  §3](../features/ui/screens.md#3-history--history)).
- **`v03-settings-run-length`**, the Continuous run length (`Settings.jsx` lines 22 and 266): a
  number with a minutes, hours or days select, which starts at 1 hour when switched on. The run
  length is none by default and, once set, a whole number of seconds from 60 s to 7 days; the
  field should start empty, not at 1 h ([screens.md
  §4](../features/ui/screens.md#4-settings--settings)).
- **`v03-csv-columns`**, the History export's CSV wording, where the kit names columns: the RPM
  columns are per direction, `downloadRpm`, `downloadRpmState`, `uploadRpm` and `uploadRpmState`,
  with each Continuous direction's minimum and maximum
  ([frontend.md §5](../features/technical-stack/frontend.md#5-history-module-idb)).

### Prompt for the Claude Design round

First paste the five spec files the prompt names into the Claude Design project's `features/`
by hand, byte for byte, replacing the old copies. Then send the prompt below as it is, followed
by the v0.3 notes above, from "Test screen" to the end of "Notices, Compare and Settings".

```text
BitGauge v0.3: please update the app UI kit (ui_kits/app/) and its components to the v0.3
specification.

Never modify anything under features/. Those files are the specification, kept in the product
repository and pasted here by hand; read them, never write them.

These files under features/ are already current for v0.3, pasted by hand before this prompt; read
them first, as they are, and treat them as read-only:

- features/measurement.md
- features/ui/screens.md
- features/ui/flows.md
- features/ui/url-params.md
- features/ui/i18n-a11y.md

Then change the kit as each of the v0.3 notes pasted after this prompt asks, one note at a time.
Behavior follows features/; visuals follow the existing tokens and components. Every note names
the kit file and element, what the kit shows now and what it should show.

Keep every existing v0.1 and v0.2 state as it is, unless a note asks otherwise. Add the states the notes ask for to the demo
panel's v0.3 controls (Continuous states, responsiveness states, About layer switches).
```
