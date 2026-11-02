# Exploratory QA — third round, 2026-11-02

**Open.**

The third exploratory QA round of BitGauge, run with the `qa-round` skill after plan 1 of the
[second round](2026-11-02-second-round.md) (QA-53 to QA-77) landed. Like the second round it
looked for real bugs only: wrong or unqualified numbers, results saved or kept wrongly, broken
flows, contract violations, limits or headers that fail open, accessibility failures, and layout
that makes something unusable. Differences from the design kit's prototype were not findings;
demo-parity triage owns them. The second round's open findings (QA-54, QA-55, QA-58 to QA-60,
QA-64 to QA-67, QA-78 to QA-95) were not re-reported. IDs continue from QA-95.

## The setup

- **Commit under test:** `840eeaa` (`docs(qa): record plan 1's fixes`), clean worktree,
  `make build` and `npm run build:demo` once.
- **Servers** (`./dist/bitgauge serve`, all on `127.0.0.1`, debug log), one set per area:

  | Port | Configuration |
  | --- | --- |
  | `18200` | defaults (Test screen and real runs) |
  | `18201` | defaults, killed once mid-download on purpose for the error flow |
  | `18220` | `preset: quick` (results, history and sharing) |
  | `18230` | defaults (settings) |
  | `18231` | `test_defaults`: `preset: quick`, `units: bytes`, `data_cap: 50MiB`, `phases: download,upload`, `streams.max: 4`, `streams.fixed: 2`; `server.labels: 127.0.0.0/8=Loopback-QA` |
  | `18232` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18233` | as `18232`, plus `server.base_path: /speed` |
  | `18234` | `server.base_path: /speed`, LibreSpeed and OpenSpeedTest, no `public_url` |
  | `18235` | `warmup: 3s`, `ping_count: 15`, overhead 2.5, `streams.mode: single`, download 7–12 s, phases `idle,upload,download` |
  | `18240` | defaults, `metrics.enabled` (sent `SIGTERM` once mid-transfer) |
  | `18241` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18242` | as `18241`, plus `server.base_path: /speed` |
  | `18243` | `max_streams_per_client: 2`, `streams.max/fixed: 2`, `requests_per_minute: 60`, `max_download_bytes: 1MiB`, `max_upload_bytes: 64KiB`, `tracked_clients: 16`, LibreSpeed and networkQuality |
  | `18244` | `server.trusted_proxies: [127.0.0.2/32]`, `cors.allowed_origins`, every layer, `tracked_clients: 16` |
  | `18245` | defaults, metrics off |
  | `18246` | networkQuality and OpenSpeedTest with their own upload caps |
  | `18247`–`18249` | stub listeners for the healthcheck, short-lived configuration probes, `base_path: //speed` |

- **Demo** (`VITE_DEMO=1` build served by `vite preview`) on `18210` and `18225`, one origin per
  area.
- **Proxy:** Caddy (`caddy:2`) on `18443` with `tls internal` in front of `18241`, for HTTP/2.
- **Clients:** curl, raw-socket Python for slow, short, stalled and lying bodies and WebSocket
  frames, and `librespeed-cli` 1.0.12 built in the scratch directory to run About's copied
  commands.
- **Browsers and viewports:** Chromium throughout; Firefox and WebKit for full runs, a sample of
  the demo's errors and cancels, History, Compare, sharing and Settings. 1440×900 and 390×844
  everywhere; 768 for Settings and History. Light and dark, reduced motion.
- **Areas:** the Test screen and real runs; the demo's scenarios; results, history and sharing;
  settings, URL parameters and About; the server and the HTTP edge.
- **Not covered:** real Safari and iOS, Android, a real slow link, real screen readers (the
  live-region findings rest on recording the regions' text), forced colors, a really hidden tab,
  the wake lock, the Web Share API, a real private window, the "3 requests in a row failed" ending
  on loopback, and a stop before the first byte on loopback (it moves 4 MB in 9 ms).
- **Processes and side effects:** the servers, previews, Python clients and the Caddy container
  above, and scratch directories under `/tmp/qa/`. At the end every process and the container
  were stopped and `ss -ltn` showed none of the round's ports. Nothing in the repository was
  edited for a stack.

## How to use this file

A fix commit names the finding in its body (`Fixes QA-NN.`) and the finding's Status line records
the commit's short hash; a deferral records its reason there. **Verified** means re-checked against
the run's Download JSON, the API, `/metrics`, the server log or the code after it was seen;
**observed** means seen, with the cause located but not re-checked, and the finding says why.

## Decisions

The round's four open questions, answered on 2026-11-02, numbered after the second round's D-17.
Each decision that changes behavior is a spec change made at the start of the plan that fixes its
findings; the pages under `docs/features/ui/` and `measurement.md` are design-export symlinks, so
each such change is listed for Claude Design.

- **D-18 — Compare qualifies latency and the grade, and a different path, source or basis is not
  comparable** (Q-10, QA-102). Idle latency carries its path, loaded latency its source and "vs
  idle over …", the grade its basis, a Continuous peak "p90, last hour". A row whose two sides
  differ in path, source or basis reads not comparable, as the speed rows do for a different
  overhead compensation, and the warning names it. The parameter list adds phases, durations,
  warm-up and ping count. screens.md §3 says so.
- **D-19 — every direction whose final confidence is low carries the `low confidence` notice**
  (Q-11, QA-97), whatever its status: a `partial` direction carries it beside `stopped early`.
  measurement.md §16 says so.
- **D-20 — Back from the Details of an unsaved run restores its end state** (Q-12, QA-108): the
  Test screen shows the Cancelled or Error state with Keep in history, Details and Download JSON
  until a new run starts or the page reloads. flows.md §4 says so.
- **D-21 — the summary replaces the last headline, and the live chart's stop mark is on the run
  timeline** (Q-13). i18n-a11y.md §2.1 says the result summary carries the last direction's
  number instead of its headline; flows.md §4 says the live chart's "stopped at" reads the run's
  timeline, while the steps, the notice and the Result detail read the direction's. A docs change
  only.

## High

### QA-96: The Test screen's "Last test" line shows the latest result's speeds without their qualifiers

- **Observed:** `18220`, Chromium 1440. The latest saved result has +5 % overhead compensation, a
  low-confidence download and a CPU-bound upload; its History row carries each qualifier, while
  the idle Test screen reads "Last test now · ↓ 15.9 · ↑ 8.21 Gbit/s · 0.2 ms". A real kept
  partial run stopped in the upload reads "↓ 12.7 Gbit/s · ↑ — · 0.3 ms", with no `partial` on the
  download and no "insufficient data" on the upload, which History and the detail both show.
- **Expected:** every speed carries its status, confidence and overhead compensation wherever it is
  shown ([screens.md §6](../../features/ui/screens.md#6-result-metrics-units-and-precision)); the
  last result line shows the headline numbers of the latest saved result
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)). What is left of QA-53.
- **Cause:** `web/src/components/test/LastResult.vue:54-57` reads only `row.download.value` and
  `row.upload.value`; the `qualifiers` that 9453f8a gave `rowView` are dropped.
- **Evidence:** verified on an imported record and a real kept partial run (IndexedDB), and in
  the code.
- **Status:** Fixed in 580ad10 (spec a75c133).

## Medium

### QA-97: A direction whose low confidence comes only from its steady window gets no `low confidence` notice

- **Observed:** `18200`, Chromium 1440, `?preset=extended`, a `complete` run: the Download JSON's
  upload is `measured` with `confidence: {level: "low", reasons: ["unstable"]}`, but `notices`
  holds `low-confidence` for the download only. The upload tile reads "low confidence ·
  unstable" while the one notice beside it names only the download. A download stopped after
  warm-up (`partial`, low, `unstable`) carries only `stopped-early`.
- **Expected:** `low confidence` with its reasons, per direction
  ([measurement.md §16](../../features/measurement.md#16-confidence-and-notices)); at the end of
  the phase `unstable` is set by the steady window alone
  ([measurement.md §8.3](../../features/measurement.md#83-warm-up-end)); a notice never
  contradicts the state beside it ([screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** the notice is created only from the warm-up's confidence:
  `web/src/engine/download/outcome.ts:102-104`, `web/src/engine/upload/outcome.ts:129-131` and the
  Continuous branch at `upload/outcome.ts:100-101`; the stopped branches return before it. The
  final confidence is computed later in `web/src/engine/result/direction.ts:65-73`, and
  `directionNotices` (`direction.ts:204-213`) only rewrites or drops an existing notice, never adds
  one.
- **Evidence:** verified on two Download JSONs, against Chromium and Firefox Standard runs whose
  warm-ups ended low, and in the code.
- **Status:** Fixed in 311978a. Decided by D-19 (spec a75c133).

### QA-98: An upload with no confirmed request disappears from the live chart

- **Observed:** demo `insufficient` (19 kbit/s, no upload request confirmed), Chromium 1440 and
  390. During the upload the steps read "Upload active · 3.8 s left", but the chart's meta stays at
  "20.0 s / 35 s", the download's end, with nothing drawn after it: no faint sending line though
  the gauge and live region say "Upload sending, 19.0 kilobits per second", no loaded-latency
  points, no Extended mark. At the end the axis stops at 20 s and the "UPLOAD" separator sits at
  the right edge over the axis label, while the meta says "48.1 s total".
- **Expected:** the live chart shows the upload's `sending` series faint, its event marks and the
  loaded-latency series ([screens.md §1](../../features/ui/screens.md#1-test-home--)); sub-1 Mbit/s
  links are in scope
  ([edge-cases.md §1](../../features/edge-cases.md#1-sub-1-mbit-and-high-rtt-vpn-links)).
- **Cause:** `web/src/components/chart/series.ts:257` sizes a segment from its known buckets and
  sending points only; the engine sends `sendingBucket` and `startBucket` only after the first
  confirmed request (`web/src/engine/run/samples.ts:200`), so the upload segment is one bucket and
  `live.phaseMs` is ignored. The marks (`series.ts:286-288`) and latency points (`:292`) then fall
  beyond the axis.
- **Evidence:** verified on screenshots, the run's JSON and the code.
- **Status:** Fixed in 6cd9588 (spec a75c133).

### QA-99: The "WebSocket unavailable" notice uses the refusal wording during a run whose socket closed after idle latency, then rewrites itself at the end

- **Observed:** demo `ws-close`, `ll-reservation-broken`, `ll-insufficient-samples`. When the
  socket closes mid-direction the notice says the server or a reverse proxy did not accept a
  WebSocket, beside an idle-latency tile reading "WebSocket". When the result arrives the same
  `role=status` element changes to "The WebSocket closed after idle latency, …", written after the
  summary.
- **Expected:** a notice never contradicts the state beside it and is announced once, when it
  appears ([screens.md §7](../../features/ui/screens.md#7-notices)); a close after idle latency is
  not a refusal ([edge-cases.md §6](../../features/edge-cases.md#6-network-change-mid-test);
  [measurement.md §11.4](../../features/measurement.md#114-loaded-latency-statistics-and-availability)).
  QA-68's fix holds for the refusal (`ws-fallback`).
- **Cause:** `web/src/components/test/notices.ts:172` picks the body from
  `context.result?.idle?.path`, which is null while the run goes on; the run's idle phase already
  knows its path.
- **Evidence:** verified by recording the regions in three scenarios, and in the code.
- **Status:** Fixed in 242d051.

### QA-100: A Continuous stop's notice first reads "stopped at 0.0 s" with no completed phase, then rewrites itself

- **Observed:** `?preset=continuous&test=upload`, Stop 1.5 s into the upload's warm-up, Chromium:
  the `role=status` notice first reads "Upload stopped at 0.0 s, before a 3 s confirmed steady
  window …", and 12 ms later, after the summary, "Latency completed. Upload stopped at 6.1 s, …".
  `cont-warmup` (download) rewrites itself the same way without the wrong number. Bounded runs are
  not affected: their result arrives in the same tick.
- **Expected:** the stop notice names the phases that completed and where the direction stopped
  ([flows.md §4](../../features/ui/flows.md#4-cancel-mid-test)), announced once
  ([screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** `web/src/composables/useTestScreen.ts` shows the `stopped-early` notice before
  `run.result` arrives; `web/src/components/test/stop.ts:57` then takes the run order to be the
  stopped direction alone, and `stop.ts:62` falls back to `?? 0` for the stop instant.
- **Evidence:** verified by the recording and the code.
- **Status:** Fixed in 204f5bb.

### QA-101: `server.base_path: //speed` passes validation and turns every SPA asset URL into a protocol-relative URL

- **Observed:** `18249`, `BITGAUGE_SERVER__BASE_PATH=//speed` starts with no error. `GET //speed/`
  serves `index.html` with `<script src="//speed/assets/…">` and the same for the CSS, favicon and
  manifest; Chromium resolves them to `http://speed/…`, so only the CSP stops every request to
  another host, and the page stays blank. `/a//b` is accepted too, and `metrics.path: //metrics`.
- **Expected:** `server.base_path` is an absolute path
  ([configuration.md §2.1](../../features/configuration.md#21-server)) that fails validation with
  exit status 2 otherwise ([configuration.md §4](../../features/configuration.md#4-fail-closed-validation));
  the SPA references nothing off its origin
  ([security.md §3](../../features/security.md#3-no-outbound-calls)).
- **Cause:** `internal/config/validate.go:243-268` (`checker.basePath`) rejects `.` and `..`
  segments but not an empty one; `web/embed.go:126-134` writes `base + "/"` into every asset URL.
- **Evidence:** verified: the probe served instead of exiting 2, curl returned the rendered
  `index.html`, and the browser's request log showed the requests to `http://speed/` blocked by
  the CSP.
- **Status:** Open.

### QA-102: Compare shows latency and the grade without their qualifiers and judges them across a different source, path or basis

- **Observed:** `18220`, Chromium. Record A's download loaded latency is over an HTTP/2 probe "vs
  idle over WebSocket" and its grade is on download only; record B is a WebSocket run on both
  directions. Compare reads "Loaded latency · download 31 ms → 2.7 ms (−28 ms, better)" and
  "Bufferbloat grade C · Moderate → A+ · Minimal (better)", and Copy comparison the same. The
  Result detail and share text of A say "HTTP/2 probe, vs idle over WebSocket" and "(download
  only)". Idle latency's path and a Continuous peak's "p90, last hour" are missing too.
- **Expected:** idle latency carries its path, loaded latency its source, the grade its basis
  ([screens.md §6](../../features/ui/screens.md#6-result-metrics-units-and-precision));
  [screens.md §3](../../features/ui/screens.md#3-history--history) names qualifiers only for
  Compare's speed cells.
- **Cause:** `web/src/components/history/compare.ts:134-137` (`loaded()` takes `medianMs` whatever
  the source), `:257-260` (latency rows bare), `:247-251,261` (grade without `basis`).
- **Evidence:** verified on imported records and a real run, in the dialog, Copy comparison and the
  code.
- **Status:** Open. Decided by D-18, which also settles the second round's To-investigate item
  on Compare's parameter set.

### QA-103: The focus falls to the page body in three more places

- **Observed:**
  - Compare at 390 px, Chromium, Firefox and WebKit: "Next result" and "Previous result" disable
    themselves when pressed, and the focus leaves the focus-trapped dialog for `<body>`.
  - Try Extended on an "insufficient data" notice starts the run and the focus falls to `<body>`.
  - Keep in history on the not-saved Result detail (new in fb52643) saves, and the focus falls to
    `<body>`.
- **Expected:** "When the control that has focus goes away, focus moves to the control that takes
  its place, never to the page body"
  ([i18n-a11y.md §2.3](../../features/ui/i18n-a11y.md#23-focus-order)). The class of QA-55, in
  places its list does not name.
- **Cause:** `web/src/components/history/CompareCards.vue:69,98` (`:disabled` on the pressed
  button), `web/src/components/test/NoticeList.vue:97-99`, `web/src/pages/ResultDetailPage.vue`
  with `components/test/KeepInHistory.vue`.
- **Evidence:** verified by reading `document.activeElement` after each action, and in the code.
- **Status:** Open. Fix with QA-55.

## Low

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| QA-104 | `cancelled-late` Result detail: the Upload chart heading reads "13.0 s · 6 streams" (the series end) above Test parameters "Upload 14.0 s · stopped by you". QA-75 holds for the parameters. | `web/src/components/result/charts.ts:100` (`series.endMs`) | Fixed in 56c93e6 |
| QA-105 | An ignored-parameter notice (`?cap=1MB`) changes its body 25 ms after mount, from "stays on its default" to "The data cap stays on none", in a `role=status` element, and is mounted again, so announced again, when the run starts. Near QA-88. | `web/src/components/test/ignored.ts`, `NoticeList.vue` keying | Fixed in 1882d7d |
| QA-106 | A finished latency-only run (`?test=latency`) shows "DOWNLOAD —" on the gauge; no direction ran. QA-70's kind. | `web/src/components/test/screen/view.ts:230-238` | Fixed in c3f5320 |
| QA-107 | A Continuous upload before its first sample reads "Current · sending — kbit/s" and "Data used — kB"; the download view shows "—" alone. | `web/src/components/test/continuous/` | Fixed in bf1b231 |
| QA-108 | After Stop → Details → Back the Test screen is plain Idle with no Keep, Details or last-result line, though Forward still reopens the unsaved result with Keep. | `web/src/pages/TestPage.vue` | Fixed in 26850ed. Decided by D-20 (spec a75c133) |
| QA-109 | Compare rounds a latency change for display but judges the raw value: 10 → 11 ms reads "+1.0 ms, same" in one pair and "+1.0 ms, worse" in another (11.01 ms); jitter the same. | `web/src/components/history/compare.ts:72-76,243` | Open |
| QA-110 | Download JSON within 300 ms of typing a note exports the previous note, and a reload in that window loses the last keystrokes (the `pagehide` flush is an IndexedDB write the unload cancels). | `web/src/composables/useDebouncedSave.ts:28,52`; `components/result/NoteField.vue:48` | Open |
| QA-111 | A result without a grade shows a bare "—" in History's Grade column and in Compare; screens.md §6 has "Not graded" with its reason the same on every screen. | `web/src/components/history/rows.ts:96`; `compare.ts:247-251` | Open |
| QA-112 | The not-saved Result detail of an `error` result says "Partial results are not saved" under "Test failed". | `web/src/pages/ResultDetailPage.vue` (`notSaved`), `i18n/locales/en/test.json:268` | Fixed in 0fad631 (spec a75c133) |
| QA-113 | Requests rejected by net/http before routing get its plain text with no envelope, and wire-protocol.md §7 names only the malformed `Content-Length` 400: also `431` for large headers, `400` for a malformed `Host` or duplicate `Content-Length`, `501` for `Transfer-Encoding: gzip`, `505` for `HTTP/2.0` on the request line. Document them as a class, as QA-30 was. | `docs/features/wire-protocol.md` §7 | Open |
| QA-114 | `server.trusted_proxies` accepts an IPv4-mapped IPv6 prefix (`::ffff:127.0.0.2/128`) that never matches, since peers are unmapped first; the proxy is silently untrusted, and the entry still satisfies networkQuality's `trusted_proxies` rule, so that layer answers 503. `server.labels` rejects the same form. | `internal/config/load.go:508`; `internal/clientip/clientip.go:105,120-126`; compare `internal/config/validate.go:225` | Open |
| QA-115 | Opening a Select (Overhead compensation, Language) logs a CSP `style-src-elem` violation: reka-ui's `SelectViewport` inserts an inline `<style>` that `style-src 'self'` blocks; the scrollbar rule is not applied. | `web/node_modules/reka-ui/dist/Select/SelectViewport.js:83`, via `web/src/components/ui/select` | Open |
| QA-116 | `?preset=continuous` drops the stored Continuous direction and run length when the stored preset is bounded (stored upload, 2 h runs download with no run length); url-params.md §1 says a URL preset brings only its durations, ping count and stream mode, and choosing Continuous in Settings keeps both. | `web/src/lib/settingsStorage.ts:203-217`; `web/src/engine/settings.ts:82` | Open |
| QA-117 | The run-length field is too narrow for a stored value that is not a whole number of minutes: "1501.02" shows as "1501.0" at every width. | `web/src/components/settings/RunLengthField.vue:129` | Open |
| QA-118 | With a server data cap that is not a whole number of MB (50 MiB shows as "52.429"), typing the shown value back is rejected with "Enter a whole number from 2 to 100000". | `web/src/components/settings/DataCapField.vue` | Open |
| QA-119 | The ping count's caption reads "Preset default: 15" when 15 is the server's `ping_count`; Standard's own is 20. | `web/src/i18n/locales/en/settings.json:127` | Open |

## To investigate

- **A Continuous live frame at the warm-up's end** (demo, speed 4) showed Average "—" and "Peak ·
  p90, last hour —" beside "max 602 Mbit/s" and Min / max "596 / 602 Mbit/s". Seen once; cause
  not located.
- **Notices after the summary:** the notices that come with the result are now written before the
  summary; "Saved to history" still comes about 6 ms after it on every complete run. Needs a real
  screen reader.

## By design, no action

The earlier rounds' entries stand ([first round](2026-10-23-first-round.md#by-design-no-action),
[second round](2026-11-02-second-round.md#by-design-no-action)). Verdicts on the second round's
To investigate:

- **`?preset=` drops stored custom durations, stream mode and ping count:** as url-params.md §1
  says. What it drops beyond that is QA-116.
- **A run-length unit change clamps, and the fixed stream count clamps 0 to 1:** as the kit's
  Settings does.
- **Firefox Tab at the end of Settings:** headless Firefox moves the focus to its own UI on any
  page.
- **WebKit CSP "Refused to apply a stylesheet":** logged only when Playwright takes a full-page
  screenshot in WebKit, which injects a style. Not BitGauge's.
- **An IPv6 literal `Host` gets `connect-src 'self'` only:** as configuration-security validates
  the host; modern browsers match same-origin `ws:` under `'self'`.
- **An unreachable server mid-download, header still connected:** flows.md §5 re-checks `/info`
  only after "network changed" or "unreachable"; on loopback the WebSocket closes first and the
  run ends as "network changed", with the header turning Unreachable.
- **Compare's parameter set:** decided by D-18.
- **The last direction's headline is never spoken** and **two times for one stop:** decided by D-21
  (spec a75c133).

## Previous round's fixes re-checked

Every plan-1 fix (QA-53, QA-56, QA-57, QA-61 to QA-63, QA-68 to QA-77) holds except these:

| Fix | Verdict | What is left |
| --- | --- | --- |
| QA-53 | partly | the Test screen's last result line: QA-96; Compare's latency and grade: QA-102 |
| QA-57 | partly | Back from the Details loses the way to Keep: QA-108 |
| QA-63 | holds for its notice | the same kind on two more: QA-99, QA-100 |
| QA-68 | holds for the refusal | the close after idle latency during the run: QA-99 |
| QA-75 | partly | the Result detail's chart heading: QA-104 |
| QA-77 | holds in the demo | not reachable on loopback |

## Suggested plan split

Agreed on 2026-11-02: one new plan, and the rest folded into the second round's open plans
([second round](2026-11-02-second-round.md#suggested-plan-split)).

1. **The run's end reads honestly, again** (12): QA-96 to QA-100, QA-104 to QA-108 and QA-112,
   starting with the spec changes of D-19, D-20 and D-21. One model: how a run's end, its
   qualifiers and its notices read on the Test screen and the Result detail, with the engine fix
   of QA-97 (`measurement-engine`). First, since it holds the high.
2. **Into the second round's plan 2** (10, making it 33): QA-102, QA-103, QA-109 to QA-111 and
   QA-115 to QA-119, with D-18's spec change. QA-103 lands with QA-55, the same focus rule.
3. **Into the second round's plan 3** (3, making it 7): QA-101, QA-113 and QA-114, Go and the wire
   protocol's docs.

Borderline: QA-105 (an ignored-parameter notice that changes after mount) sits near QA-88 in the
second round's plan 2, but stays in plan 1 with the other notices that change in place; QA-112
(the error result's not-saved wording) could go with History, but stays with the Result detail's
other end-of-run reading.
