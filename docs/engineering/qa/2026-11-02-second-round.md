# Exploratory QA — second round, 2026-11-02

**Open.**

The second exploratory QA round of BitGauge, run with the `qa-round` skill after the fixes of the
[first round](2026-10-23-first-round.md). It looked for real bugs only: wrong or unqualified
numbers, results saved or kept wrongly, broken flows, contract violations, limits or headers that
fail open, accessibility failures, and layout that makes something unusable. Differences from the
design kit's prototype were not findings this round; demo-parity triage owns them. IDs continue
from QA-52.

## The setup

- **Commit under test:** `25946db` (`Merge pull request #8`, the go-modules bump), clean
  worktree, `make build` and `npm run build:demo` once.
- **Servers** (`./dist/bitgauge serve`, all on `127.0.0.1`, debug log), one set per area:

  | Port | Configuration |
  | --- | --- |
  | `18100` | defaults (Test screen) |
  | `18101` | `test_defaults`: `data_cap: 50MiB`, `preset: quick` |
  | `18102` | `metrics.enabled` (killed once mid-download on purpose for the error flow) |
  | `18120` | `preset: quick` (results, history and sharing) |
  | `18130` | defaults (settings) |
  | `18131` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18132` | `test_defaults`: `preset: quick`, `units: bytes`, `data_cap: 50MiB`, `phases: download,upload`, `streams.max: 4`, `streams.fixed: 2`; `server.labels: 127.0.0.0/8=Loopback-QA` |
  | `18140` | defaults, `metrics.enabled` (server edge) |
  | `18141` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18142` | `server.base_path: /speed` |
  | `18143` | `max_streams_per_client: 2`, `streams.max: 2`, `streams.fixed: 2`, `requests_per_minute: 60`, `max_download_bytes: 64KiB` |
  | `18144` | `server.trusted_proxies: [127.0.0.2/32]`, LibreSpeed on; restarted with `cors.allowed_origins`, then with `tracked_clients: 16` |
  | `18139` | a listener that never answers, for about 6 s, for the healthcheck's timeout |

- **Demo** (`VITE_DEMO=1` build served by `vite preview`) on `18110` and `18121`, one origin per
  area.
- **Proxy:** Caddy (`caddy:2`) on `18443` with `tls internal` in front of `18140`, for HTTP/2 and
  `wss`.
- **Browsers and viewports:** Chromium throughout; Firefox and WebKit for full runs, a sample of
  the demo's errors and cancels, History, Compare, sharing and Settings. 1440×900 and 390×844
  everywhere; 1280, 1024, 820 and 768 for Settings, History and the Test screen in part. Light and
  dark, reduced motion, Chromium's forced colors emulation.
- **Areas:** the Test screen and real runs; the demo's scenarios; results, history and sharing;
  settings, URL parameters and About; the server and the HTTP edge.
- **Not covered:** real Safari and iOS (QA-61 needs it), Android, a real slow link, real screen
  readers (the live-region findings rest on recording the regions' text), Windows High Contrast,
  a really hidden tab, HTTP/3, the Web Share API branch, the import's Cancel, a Continuous run
  ended by its run length in the demo, the Test screen's stream-limit 429 in a browser (it needs
  several browsers on one address), `SIGTERM` with WebSocket close 1001, languages other than
  English, and the wake lock (postponed: it needs HTTPS on a real device).
- **Processes and side effects:** the servers, previews and the Caddy container above, and
  scratch directories under `/tmp/qa/`. At the end every process and the container were stopped
  and `ss -ltn` showed none of the round's ports. Nothing in the repository was edited for a
  stack.

## How to use this file

A fix commit names the finding in its body (`Fixes QA-NN.`) and the finding's Status line records
the commit's short hash; a deferral records its reason there. **Verified** means re-checked against
the run's Download JSON, the API, `/metrics`, the server log or the code after it was seen;
**observed** means seen, with the cause located but not re-checked, and the finding says why.

## Decisions

The round's nine open questions, answered on 2026-11-02, numbered after the first round's D-8.
Each decision that changes behavior is a spec change made at the start of the plan that fixes its
findings; the pages under `docs/features/ui/` and `measurement.md` are design-export
symlinks, so each such change is listed for Claude Design.

- **D-9 — Settings shows the URL's values, and an edit wins** (Q-1, QA-64). A field a URL
  parameter overrides for this page load shows the URL's value with a "from the link" mark. An
  edit is stored and takes effect at once, replacing the URL's value, and the parameter is dropped
  from the address. flows.md §9 gains the mark and the edit rule.
- **D-10 — the not-saved Result detail offers Keep in history** (Q-2, QA-57). The Result detail of
  the run just ended, while it is not saved, has the same Keep in history button and undo as the
  Test screen. screens.md §2 and flows.md §4 say so.
- **D-11 — the proxy-buffering notice names the browser too** (Q-3, QA-61). The rule of
  measurement.md §7.3 stays for every browser; the notice says that a proxy or the browser buffers
  request bodies, with the deployment guide link. measurement.md §16 and screens.md §7 change their
  wording.
- **D-12 — the WebSocket-unavailable notice names both causes** (Q-4, QA-68): the server or a
  reverse proxy did not accept a WebSocket, other tabs on this address may be using the server's
  4, so latency is measured with HTTP requests. edge-cases.md §14 and screens.md §7 change their
  wording.
- **D-13 — an import with any rejected record warns** (Q-5, QA-95). The import's summary takes the
  warn tone whenever a record was rejected, with the title "Nothing imported from <file>" when none
  was added; an import that only added or skipped duplicates stays ok. screens.md §3 says so.
- **D-14 — a stop with nothing measured returns to Idle and is announced** (Q-6, QA-71). The screen
  is exactly the first run's Idle, with no stale card, and the polite region says the test stopped
  with nothing measured. flows.md §4 and i18n-a11y.md §2.1 say so.
- **D-15 — `cpu-bound` is a qualifier, not a notice** (Q-7). measurement.md §16 wins:
  screens.md §7 drops it from its list of notices. A docs change only.
- **D-16 — each route has its own title, and navigation moves the focus to its heading** (Q-8,
  QA-90). "History · BitGauge", a result's label on its detail; after an in-app navigation the
  focus moves to the page's `h1`. i18n-a11y.md §2.3 says so.
- **D-17 — `server.listen` takes an IP literal or an empty host** (Q-9, QA-92). Anything else fails
  validation with exit status 2, so the server never looks a name up. configuration.md §2 and §4
  say so.

## High

### QA-53: History rows and Compare show speeds without their qualifiers, and Compare reads overhead compensation as a real change

- **Observed:** `18120` and imported records, Chromium 1440. A result with +5 % overhead
  compensation reads "15.3 Gbit/s" in its History row with no mark, while its Result detail and
  share text say "+5.0 % overhead compensation"; a CPU-bound result has no mark in its row (only
  low confidence gets a pill). Compare reads "Download 15.3 → 14.5 Gbit/s −4.8 % worse", and Copy
  comparison says the same, though the difference is the compensation, which is not among the
  compared parameters. Compare also shows no confidence level, no `partial` on a stopped
  direction, and "—" for both insufficient data and an error.
- **Expected:** every speed carries its qualifiers wherever it is shown
  ([screens.md §6](../../features/ui/screens.md#6-result-metrics-units-and-precision)); Compare
  shows "both parameter sets" ([screens.md §3](../../features/ui/screens.md#3-history--history)).
- **Cause:** `web/src/components/history/rows.ts:83-84` tracks low confidence only;
  `web/src/components/history/compare.ts:233-236` formats the bare number; the parameter list at
  `compare.ts:207-215` has no overhead compensation (nor phases, durations, warm-up or ping
  count).
- **Evidence:** verified in the code and on records with every qualifier.
- **Status:** Fixed in 9453f8a (spec 97708c2).

## Medium

### QA-54: After a sort or filter restarts the list at 100 rows, Delete selected and Compare act on rows no longer shown

- **Observed:** `18120`, 266 results. Two rows selected past the first 100, then a sort: the list
  restarts at 100 rows, both selected rows leave the view, the bar still says "2 selected", and
  Delete selected removes both from IndexedDB (266 → 264). Undo restores them.
- **Expected:** a result that leaves the list leaves the selection, so Delete selected removes
  only rows in view (the rule of `useHistoryList.ts`; [screens.md
  §3](../../features/ui/screens.md#3-history--history)). A regression of d15a8ce.
- **Cause:** `web/src/composables/useHistoryList.ts`: the limit resets on a filter or sort, but
  the selection is trimmed against `filtered`, not `shown`.
- **Evidence:** verified in IndexedDB and the code.
- **Status:** Open.

### QA-55: The focus falls to the page body when the control that had it goes away, in eight more places

- **Observed:** Chromium and Firefox, demo `cancelled` and `18100`: Keep in history (disabled
  while saving, then replaced by "Saved as partial"), the kept toast's Undo, Dismiss on a "URL
  parameter ignored" notice; History's row Delete, Delete selected, Clear selection and the delete
  toast's Undo; the Result detail's Delete and its Undo. `document.activeElement` is `<body>`
  after each.
- **Expected:** "When the control that has focus goes away, focus moves to the control that takes
  its place, never to the page body"
  ([i18n-a11y.md §2.3](../../features/ui/i18n-a11y.md#23-focus-order)). QA-22 fixed the four places
  it named.
- **Cause:** `web/src/components/test/KeepInHistory.vue:69-73` (`v-if="!kept"`,
  `:disabled="busy"`), `web/src/components/test/NoticeList.vue` (Dismiss), the History and Result
  detail delete paths; none hands the focus on.
- **Evidence:** verified by reading `document.activeElement` after each action, and in the code.
- **Status:** Open.

### QA-56: A stopped (`partial`) direction drops its low or CPU-bound confidence on its tile, while the share text keeps it

- **Observed:** a hand-made record with a `partial` download of low confidence: its tile on the
  Result detail shows "partial" without the low-confidence line; the share text has both.
- **Expected:** every qualifier is shown
  ([screens.md §6](../../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **Cause:** `web/src/components/test/tiles.ts:173-178` returns before the confidence lines at
  `:189-195`; the Test screen shares it.
- **Evidence:** observed on a hand-made record; no real run produced a stopped low-confidence
  direction this round.
- **Status:** Fixed in 706bfa8.

### QA-57: A stopped run can no longer be kept once its Details have been viewed

- **Observed:** `18120`: a run stopped, Details, then Back. The Test screen is back at Ready and
  Keep in history is gone; the not-saved Result detail offers no Keep; IndexedDB stays empty.
- **Expected:** a partial result is kept only through Keep in history
  ([flows.md §4](../../features/ui/flows.md#4-cancel-mid-test)); nothing says viewing its details
  discards it.
- **Cause:** the Test screen's run state does not survive the navigation, and the Result detail
  of an unsaved result has no Keep.
- **Evidence:** verified in IndexedDB.
- **Status:** Fixed in fb52643. Decided by D-10 (spec 97708c2).

### QA-58: Compare's "not directly comparable" warning cuts off two long labels

- **Observed:** two results with 64-character unbroken labels: the warning's text is 769 px in a
  356 px box at 390, and 814 px in 758 px at 1440, Chromium and Firefox; the second label and the
  closing parenthesis are cut.
- **Expected:** the warning names the difference
  ([screens.md §3](../../features/ui/screens.md#3-history--history)); content is not hidden.
- **Cause:** `web/src/components/history/ComparePanel.vue:135`: the text has no wrap rule.
- **Evidence:** verified by measuring the box.
- **Status:** Open.

### QA-59: At 768 px History's table scrolls sideways inside its card, hiding most columns and the row actions

- **Observed:** Chromium and Firefox at 768×1024: the table is about 1056–1135 px in a 734 px
  card, so Upload, Latency, Jitter, Grade and the row actions are off-screen with no cue; "Home"
  wraps as "Hom/e".
- **Expected:** the responsive notes of
  [screens.md §3](../../features/ui/screens.md#3-history--history); QA-48 fixed 1440.
- **Cause:** the table shows from the `tablet:` breakpoint (768 px) and needs about 1060 px.
- **Evidence:** verified by measuring the table.
- **Status:** Open.

### QA-60: The idle "Last test" line with a 64-character unbroken label scrolls the Test screen sideways at 390 px

- **Observed:** `18101`, Chromium and WebKit at 390×844, after a run with a 64-character label:
  the line is 512 px wide and `scrollWidth` is 528 px (520 in WebKit). It fits at 768.
- **Expected:** no sideways scroll on a phone
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)); a label may be 64 characters.
  The kind of QA-11 and QA-12, in a place their fix did not reach.
- **Cause:** `web/src/components/test/LastResult.vue:63-75`: the label is a bare text item in a
  `flex flex-wrap` link, with no `min-w-0` or wrapping rule.
- **Evidence:** verified in two browsers.
- **Status:** Open.

### QA-61: WebKit runs on loopback, with no proxy, carry "Proxy buffering suspected"

- **Observed:** WebKit at 1440, Standard runs on `18100` and `18102`: both Download JSONs carry
  `proxy-buffering-suspected`, and the screen shows "Upload requests finished much later than the
  server read them, which suggests a proxy buffers request bodies" with its deployment-guide link.
  No Chromium (8) or Firefox (3) run carried it.
- **Expected:** a notice never contradicts the state beside it
  ([screens.md §7](../../features/ui/screens.md#7-notices)); the notice is for a buffering proxy
  ([edge-cases.md §4](../../features/edge-cases.md#4-proxy-buffering-that-distorts-upload)).
- **Cause:** `web/src/engine/upload/streams.ts:168-171` implements the rule of
  [measurement.md §7.3](../../features/measurement.md#73-server-telemetry-per-request) exactly; the
  rule cannot tell a browser that holds the body back from a proxy. A spec gap.
- **Evidence:** verified on two Download JSONs and the server log; real Safari not available.
- **Status:** Fixed in 32ce9c7. Decided by D-11 (spec 97708c2).

### QA-62: A stop or an error in the download before its first bucket shows the idle-latency chart, marked "Cancelled"

- **Observed:** demo `complete`, Esc as Download turns active: the steps read "Idle latency done ·
  2.8 ms" and "Download cancelled · 0.0 s" and the notice "Test cancelled during download", but
  the chart is "Latency samples · stopped at 1.9 s" with a Cancelled mark.
- **Expected:** the latency chart stays only for a run that stops or fails during idle latency
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)).
- **Cause:** `web/src/components/test/RunSection.vue:101`: the latency chart shows whenever no
  direction has a live series and latency samples exist, whatever phase was running.
- **Evidence:** verified for the stop; the error path takes the same branch in the code.
- **Status:** Fixed in bcb44c1.

### QA-63: The "insufficient data" notice is announced three times as its body changes

- **Observed:** demo `insufficient`, a MutationObserver on the notices: the body reads "…49.9 kB
  used. Extended allows up to 40 s per direction.", 35 ms later gains "Upload continues;", and at
  the run's end goes back to the first text; each change is a change in a `role=status` region.
- **Expected:** a notice is announced once, when it appears
  ([screens.md §7](../../features/ui/screens.md#7-notices)). 7e3b89f keeps the box; its text
  still changes in place.
- **Cause:** `web/src/components/test/insufficient.ts:51-69` builds the body from the phase
  running now, which is null between phases and after the run.
- **Evidence:** verified by the recording and the code; no screen reader was run.
- **Status:** Fixed in bb4175f (spec 97708c2).

### QA-64: Settings shows the stored settings, not the URL parameters in effect

- **Observed:** `18130`, `/?preset=quick&streams=2&cap=200MB&units=bytes&label=FromURL`: the Test
  screen's summary reads Quick, 2 streams, Cap 200 MB, MB/s; Edit opens Settings on Standard, Auto,
  no cap, Bits and no label (`/settings?…` the same). A change there is stored, while the summary
  and the run keep the URL's values. Only the theme follows the URL.
- **Expected:** "Fields show the effective values: URL parameters over stored settings over server
  defaults" ([flows.md §9](../../features/ui/flows.md#9-changing-settings), step 1).
- **Cause:** `web/src/pages/SettingsPage.vue:63-66`: `current`, `valueOf` and `defaultOf` use
  `storedOver(defaults, stored)` with no URL layer.
- **Evidence:** verified in the DOM, against the summary, and in the code.
- **Status:** Open. What an edit to an overridden field does is decided by D-9. QA-17 holds for
  the theme only.

### QA-65: In forced colors the selected preset card and every switch lose their state

- **Observed:** Chromium forced colors, light and dark: the selected preset card shows the same
  empty radio as the others; the Data cap switch on and the Auto-start switch off are the same
  empty pill (the run-length switch is the same component). Segmented controls, checkboxes and
  the header's theme switch keep their state.
- **Expected:** no state conveyed by color alone
  ([i18n-a11y.md §2.5](../../features/ui/i18n-a11y.md#25-colour-independent-grade-display)); the
  kind of QA-50.
- **Cause:** `web/src/components/settings/PresetCards.vue:98` and
  `web/src/components/settings/SettingSwitch.vue:34` draw the state as a background only.
- **Evidence:** verified on screenshots.
- **Status:** Open.

### QA-66: The fixed stream count has no visible focus indicator

- **Observed:** Settings, Fixed streams, Tab into the count: `outline: none`, a 0 px ring, no
  `focus-within` on its wrapper, in Chromium, Firefox and WebKit; every other input draws a 2 px
  outline.
- **Expected:** a visible focus indicator on every control
  ([i18n-a11y.md §2.3](../../features/ui/i18n-a11y.md#23-focus-order), WCAG 2.4.7).
- **Cause:** `web/src/components/settings/StreamsField.vue:90` (`focus-visible:ring-0`).
- **Evidence:** verified with computed styles.
- **Status:** Open.

### QA-67: About's "Copy verbose networkQuality command" copies a shell comment

- **Observed:** `18131`: the button copies
  `networkQuality -C http://127.0.0.1:18131/nq/config -v      # verbose, per-flow detail`. In zsh,
  macOS's default shell, interactive comments are off, so the comment's words reach
  `networkQuality` as arguments; the comment is also English outside i18n.
- **Expected:** the command and "its verbose form with `-v`"
  ([screens.md §5](../../features/ui/screens.md#5-other-clients--about--about)); the comment of
  compatibility.md §3.5 is documentation.
- **Cause:** `web/src/components/about/snippets.ts:82`.
- **Evidence:** the copied text verified through the clipboard; zsh's behavior is its documented
  default, not run here.
- **Status:** Open.

### QA-68: The "WebSocket unavailable" notice blames a reverse proxy when the server's own limit refused the socket

- **Observed:** `18140`, no proxy, all 4 WebSocket slots of `127.0.0.1` held: a Quick run's
  handshake gets `429 too_many_streams`, and the screen says "The reverse proxy did not accept a
  WebSocket, so latency is measured with HTTP requests." Other tabs, or devices behind one NAT
  address, reach the limit in normal use.
- **Expected:** a notice never contradicts the state beside it
  ([screens.md §7](../../features/ui/screens.md#7-notices));
  [edge-cases.md §14](../../features/edge-cases.md) names a `429` among the fallback's causes.
- **Cause:** `web/src/i18n/locales/en/notices.json:182` has one body for every failure to open the
  socket; the browser's WebSocket API does not expose the handshake status.
- **Evidence:** verified against the screen, `/metrics` and the debug log.
- **Status:** Fixed in 32ce9c7. Decided by D-12 (spec 97708c2).

## Low

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| QA-69 | When both directions extend, the screen-reader summary names "Test extended" twice ("Notices: Test extended, Low confidence, Test extended, and Low confidence"); the screen shows one merged notice. | `web/src/components/a11y/announce.ts:317` lists `result.notices` one by one; the merge is `noticeViews` in `components/test/notices.ts:69` | Fixed in de4bbb6 |
| QA-70 | An upload-only run the cap ended without a number reads "↓ DOWNLOAD —" on the finished gauge; the cancelled branch hard-codes `direction: 'download'` too. | `web/src/components/test/screen/view.ts:205,222-227` | Fixed in b2a3feb |
| QA-71 | After a stop with nothing measured the screen is back at Ready with every step pending, but the bufferbloat card still reads "Not graded — no loaded latency" and "Not run"; nothing announces the stop. | `web/src/pages/TestPage.vue:107`, `components/test/loadView.ts:130,145,162` | Fixed in 6a1a7eb. Decided by D-14 (spec 97708c2) |
| QA-72 | A chart that spans about 0.1 s labels its time axis "0s 0s 0s 0.1s 0.1s 0.1s" (`18101`, `?test=upload`, cap at 60 ms). | the throughput chart's time axis, `web/src/components/chart/` | Fixed in f98cdc2 |
| QA-73 | The demo's `error` result reads "Not graded — no gradable direction"; screens.md §6 gives "test incomplete" when an error ended the run before a direction measured its loaded latency. An unavailable loaded-latency block counts as a loaded latency. | `web/src/components/result/load.ts:153-158` | Fixed in bd2b912 |
| QA-74 | The screen-reader summary leaves the grade out when the screen shows "Not graded — <reason>" (i18n-a11y.md §2.7). | `web/src/components/a11y/announce.ts:218-222` | Fixed in de4bbb6 (spec 97708c2) |
| QA-75 | `cancelled-late`: the Test screen says "Upload stopped at 14.0 s", the kept result's Test parameters "Upload 13.0 s · stopped by you" (the window end). | `web/src/components/result/parameters.ts:99` | Fixed in b2fede4 |
| QA-76 | A Continuous run stopped in warm-up shows its step as "done · insufficient data" beside a "Cancelled" gauge and "Test cancelled during download"; the step contradicts the screen. | `web/src/components/test/screen/states.ts:121,131-132,140` | Fixed in 0898ffb |
| QA-77 | A download stopped before its first byte shows "0 B used" on its tile; screens.md §1 reads "—" until the first byte. | `web/src/components/test/tiles.ts` | Fixed in e6d4e4b |
| QA-78 | Back to History after Show more starts again at 100 rows, so a row opened from further down is no longer in the list. | `web/src/composables/useHistoryList.ts` | Open |
| QA-79 | Import accepts an `id` that is not a UUID (`"not-a-uuid"`). | `web/src/engine/result/validate.ts` | Open |
| QA-80 | A `startedAt` without milliseconds is rejected as "not an ISO 8601 instant", which it is; the rule may stay, the message is wrong. | `web/src/engine/result/validate.ts` | Open |
| QA-81 | The Export menu's "contains client IPs and notes" warning sits outside every menu item, so arrow keys never reach it. | `web/src/components/history/ExportMenu.vue` | Open |
| QA-82 | After Clear all the URL keeps the filter, so the next import lands in a filtered list. | `web/src/pages/HistoryPage.vue` | Open |
| QA-83 | A duration bound's error goes stale: min 25 with max 20 errors; raising max to 30 saves max, but min stays 25, unsaved, with the old error. | `web/src/components/settings/DurationFields.vue:51-63` | Open |
| QA-84 | The ignored-parameter notice names the default, not what the run keeps: with a stored label, a 65-character `label` "stays on the suggested one"; with stored durations, `duration=601` "stays on the preset's". The spec table words both this way. | `web/src/components/test/ignored.ts:112,114`; url-params.md §2 | Open |
| QA-85 | With Quick the server default and `streams.fixed: 2`, the Quick card says "Fixed 3 streams"; the run uses 2. | `web/src/components/settings/PresetCards.vue:57` | Open |
| QA-86 | Under Continuous with idle latency off, the summary shows only "Continuous", though Settings lists Phases as changed. | `web/src/lib/settingsSummary.ts:64-73` | Open |
| QA-87 | A `cap` that overflows to Infinity (1 followed by 320 zeros) is accepted with no notice; Configure then fails, the link's other parameters are dropped and Start ends in "Test failed — the test settings are not valid". | `web/src/lib/urlValues.ts:73` | Open |
| QA-88 | The Test screen's summary shows the settings without the URL's for 6–14 ms on every mount. | `web/src/composables/useRun.ts:91` | Open |
| QA-89 | About's copy button is transparent over the code, so text runs under it at 390; each `<pre>` carries `aria-label` on a generic element. | `web/src/components/about/Snippet.vue:78-93` | Open |
| QA-90 | Every route's title is "BitGauge", and nothing is announced after navigating (WCAG 2.4.2). | the router | Open. Decided by D-16 |
| QA-91 | Only the first decode error in the configuration is reported (`max_streams_per_client: abc` with `requests_per_minute: xyz` logs one); configuration.md §4 reports every problem. mapstructure wraps its joined errors, so the `Unwrap() []error` check misses them. Same with mapstructure 2.4.0 and 2.5.0. What is left of QA-28. | `internal/config/load.go:246-271` | Open |
| QA-92 | `server.listen` accepts a host name; `serve` then looks it up (an outbound DNS query) and exits 1, not 2, when it does not resolve. | `internal/config/types.go` (`Listen.UnmarshalText`), `cmd/bitgauge/main.go:312` | Open. Decided by D-17 |
| QA-93 | `public_url: https://x:99999` (port out of range) and `allowed_origins: https://*.x.com` (a wildcard that can never match) are accepted. | `internal/config/validate.go:289-306` | Open |
| QA-94 | A foreign `Origin` on `/api/v1/ws` gets a plain 403 without the envelope; wire-protocol.md §7 lists no such exception (OpenAPI and `ws.go:139` intend it). Document it, as QA-30 was, or add a code. | `internal/handlers/ws.go:134-141`; wire-protocol.md §7 | Open |
| QA-95 | An import that adds nothing (all records rejected) shows the done notice in the success tone with its check icon and "Imported <file>". The first round's last open item. | `web/src/components/history/ImportDialog.vue:218-222` | Open. Decided by D-13 |

## To investigate

- **The last direction's headline is never spoken:** it is queued and dropped when the result
  arrives, and the summary carries the number instead. Probably intended, but i18n-a11y.md §2.1
  says each direction's result is announced once.
- **Notices that arrive with the result come after the summary:** the upload's low confidence, the
  browser upload limit and "Saved to history" are written after the summary, which is meant to be
  the run's last message. Needs a real screen reader.
- **Two times for one stop:** the chart's "stopped at" is on the run's timeline (29.1 s, or the
  last full bucket: 8.7 s beside the step's 8.8 s), the notice and step on the direction's (9.0 s).
- **An unreachable server mid-download:** the run ends as "3 requests in a row failed", correctly,
  but the header still says connected; the spec re-checks `/info` only after "network changed" or
  "unreachable".
- **`?preset=` drops stored custom durations, stream mode and ping count**, while choosing the same
  preset in Settings keeps them; this matches url-params.md §1.
- **A run-length unit change clamps silently** (48 h to days stores 7 d; 7 d to minutes stores
  7 min), and **the fixed stream count clamps 0 to 1** with no error.
- **Compare's parameter set** also leaves out phases, durations, warm-up and ping count; goes with
  QA-53's fix or a spec decision.
- **WebKit CSP "Refused to apply a stylesheet"** logged once in a History → Compare → detail
  sequence, not reproduced.
- **An IPv6 literal `Host`** gets a CSP with `connect-src 'self'` only (by design of `ValidHost`);
  only an older Safari would lose the WebSocket path.
- **Firefox Tab at the end of Settings** seemed to stay on the last control; likely headless.

## By design, no action

The first round's entries stand ([first round](2026-10-23-first-round.md#by-design-no-action)).
Also: the share text and image leave out an absent latency, jitter and grade; the WebSocket
`Origin` check accepts forms no browser sends.

## Previous round's fixes re-checked

Every first-round fix re-checked holds except these; the 2026-11-02 fixes aba15fe, 0135e15 and
c3b5867 hold.

| Fix | Verdict | What is left |
| --- | --- | --- |
| QA-14 | partly | the warning line: QA-58 |
| QA-17 | partly | Settings ignores every URL parameter but the theme: QA-64 |
| QA-22 | holds for its places | eight more: QA-55 |
| QA-28 | partly | two decode errors: QA-91 |
| QA-46 | partly | the reason for an error: QA-73 |
| QA-48 | partly | 768 px: QA-59 |
| QA-05 | partly | the Result detail's stop time: QA-75 |
| 7e3b89f | partly | a notice whose body changes: QA-63 |
| d15a8ce | partly | the hidden selection: QA-54; Back: QA-78 |
| QA-02, QA-03 | not covered in a browser | the server's 429s and the cap's wording hold on the wire and in a run |

## Suggested plan split

Three plans, agreed on 2026-11-02. Each starts with the spec changes of its decisions.

1. **A result reads honestly** (16): QA-53, QA-56, QA-57, QA-61, QA-62, QA-63, QA-68 to QA-77,
   and D-15's docs change. One model: how a run's end, its qualifiers, its notices and its
   summary read on every screen. First, since it holds the high; decided by D-10, D-11, D-12 and
   D-14.
2. **History, Settings, About and accessibility** (23): QA-54, QA-55, QA-58, QA-59, QA-60, QA-64
   to QA-67, QA-78 to QA-90 and QA-95; decided by D-9, D-13 and D-16. After plan 1, whose Result
   detail changes (D-10) QA-55's focus rules then cover.
3. **Server configuration** (4): QA-91 to QA-94, Go only; decided by D-17. In any order.

Borderline: QA-55 (the focus after Keep in history) and QA-57 (Keep on the Result detail) could
move to plan 1 with the run's end; QA-55 stays with the other focus fixes, QA-57 with the other
end-of-run reading. QA-79 and QA-80 touch the engine's result validator, but go with the import in
plan 2.

The [third round](2026-11-02-third-round.md#suggested-plan-split) folds ten findings into plan 2
(QA-102, QA-103, QA-109 to QA-111, QA-115 to QA-119) and three into plan 3 (QA-101, QA-113,
QA-114).
