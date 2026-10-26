# Exploratory QA — first round, 2026-10-23

**Open.**

The first exploratory QA round of BitGauge, run with the `qa-round` skill: the real server on
loopback in seven configurations, the demo's simulated links, and a TLS proxy for HTTP/2, driven
by hand with playwright-cli, one-shot Playwright scripts and `curl`. There is no earlier round, so
nothing is re-checked; every ID below is new.

## The setup

- **Commit under test:** `b35be56` (`docs(skills): add a qa-round skill for exploratory QA with
  playwright-cli`), clean worktree, `make build` and `npm run build:demo` once.
- **Servers** (`./dist/bitgauge serve`, all on `127.0.0.1`, debug log):

  | Port | Configuration |
  | --- | --- |
  | `18080` | defaults (Test screen and a full run) |
  | `18081` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18082` | `server.base_path: /speed` |
  | `18083` | `max_streams_per_client: 2`, `streams.max: 2`, `streams.fixed: 2`, `requests_per_minute: 60`, `max_download_bytes: 64KiB` |
  | `18084` | `test_defaults`: `preset: quick`, `units: bytes`, `data_cap: 50MiB`, `phases: download,upload`; `server.labels: 127.0.0.0/8=Loopback-QA` |
  | `18085` | `server.trusted_proxies: [127.0.0.2/32]` |
  | `18087`, `18088` | defaults (history and sharing; the layout sweep) |
  | `18100`–`18103` | short-lived: a prefix-stripping proxy, `cors.allowed_origins`, a low-limits copy of `18083` for a browser run, a small `tracked_clients` |

  The skill's stack reference gives `18081` without `public_url` and `18083` without
  `streams.fixed`; both exit with status 2 at startup, as
  [configuration.md §4](../../features/configuration.md#4-fail-closed-validation) requires, so the
  round added the two keys above.
- **Demo** (`VITE_DEMO=1` build served by `vite preview`) on `18090`, `18092` and `18093`, one
  origin per agent; the design kit's prototype on `18091`.
- **Proxy:** Caddy (`caddy:2`, container `qa-caddy`) on `localhost:18443` with `tls internal` in
  front of `18081`, for HTTP/2 and `wss`.
- **Browsers and viewports:** Chromium throughout; Firefox and WebKit for the Test screen, a full
  run, History and sharing. 1440×900 and 390×844 everywhere; 1280, 1024, 820 and 768 for the
  header, the result layout and sideways scroll. Light and dark, reduced motion, Chromium's forced
  colors emulation.
- **Areas:** the Test screen and a run; results, history and sharing; settings, URL parameters and
  About; the server and the HTTP edge; a cross-cutting layout, accessibility and browser sweep.
- **Not covered:** real Safari and iOS, Android, a real slow or shaped link, real screen readers
  (the live-region findings rest on recording the region's text), Windows High Contrast (forced
  colors only in Chromium's emulation), a really hidden tab (headless pages are always visible, so
  the hidden-page rules were checked by overriding `visibilityState`), HTTP/3, the Web Share API
  branch, the import's Cancel (a 4000-record import finished before it could be pressed), wake
  lock, languages other than English (only `en` ships), and the demo's error and notice states at
  the middle viewports. These are for a real-device check.
- **Processes and side effects:** the twelve processes above and the four short-lived servers, the
  `qa-caddy` container, and scratch directories under `/tmp/qa/`. The machine rebooted mid-round,
  which stopped every process and wiped `/tmp/qa/`; the stacks were restarted with the same
  configuration and each area re-created the data it still needed. At the end every process and
  the container were stopped, `ss -ltn` showed none of the round's ports, and the scratch
  directories were deleted. Nothing in the repository was edited for a stack.

## How to use this file

A fix commit names the finding in its body (`Fixes QA-NN.`) and the finding's Status line records
the commit's short hash; a deferral records its reason there. **Verified** means re-checked against
the run's Download JSON, the API, `/metrics`, the server log or the code after it was seen;
**observed** means seen, with the cause located but not re-checked, and the finding says why.

## Decisions

The round's eight open questions, answered on 2026-10-23. Each decision that changes behavior is a
spec change first ([`spec-change`](../../../.agents/skills/spec-change/SKILL.md)), made at the
start of the plan that fixes its findings; the pages marked with † are design-export symlinks, so
their edit is listed for pasting into Claude Design.

- **D-1 — a `429` that is not a stream limit.** Context: the engine reads every `429` as
  `max_streams_per_client` and retries at once, so a `rate_limited` or `table_full` answer ends the
  run as "Connection lost" beside a false "Server stream limit" notice (QA-02). Decision: the engine
  reads the error envelope's `code`. `too_many_streams` keeps the stream-limit path; `rate_limited`
  and `table_full` wait for `Retry-After` (readable same-origin) without lowering the stream count,
  and a run they still end says the server's rate limit ended it, with its own error or notice
  rather than the stream-limit one. Spec: measurement.md §4 and flows.md §5†.
- **D-2 — an unset `streams.mode` follows the configured preset.** Context: with
  `test_defaults.preset: quick` and `streams.mode` unset, runs use auto streams while the Quick
  card reads "Fixed 3". Decision: like the durations and the ping count, an unset `streams.mode`
  (and `streams.fixed`) takes the configured preset's value, so Quick runs on fixed 3 unless the
  configuration says otherwise. Spec: configuration.md §2.3 and the `/info` defaults in
  wire-protocol.md §5.
- **D-3 — a stopped direction without a number is `insufficient-data`.** Context: the engine writes
  `partial` with no number, as measurement.md §9 and §12.4 imply, while §7.6 and flows.md §4 say
  `insufficient-data`. Decision: the direction is `insufficient-data` and the result `partial`, as
  §7.6 and flows.md §4 say; the engine changes, and §9 and §12.4 are tightened so `partial` always
  carries a number. Spec: measurement.md.
- **D-4 — the focus order follows the visual order.** Context: i18n-a11y.md §2.4 makes Start the
  first control after the navigation, §2.3 puts the connection info first; the app follows §2.3.
  Decision: the app keeps its order (navigation, connection info, Start); §2.4† is reworded so
  Start is the first control of the run area. No code change.
- **D-5 — import rejects a label over 64 characters.** Context: the import validator has no length
  cap (QA-42). Decision: a record whose label is over 64 characters is rejected by position with its
  reason, like any invalid field; History's layout still holds a long unbroken label (QA-48).
  Spec: security.md §7 and the import rules in screens.md §3†.
- **D-6 — History corrects an invalid filter in the URL silently.** Context: `?range=foo` stays in
  the URL and a reversed range matches nothing (QA-43). Decision: an invalid value is dropped from
  the URL with `replaceState` and a reversed range is swapped, without a notice. Spec: screens.md
  §3†.
- **D-7 — touch targets: a 24 px floor, 44 px for primary actions.** Context: the export's "Touch
  targets ≥ 44 px" is not met by the kit's own controls (QA-25). Decision: on phones every control
  is at least 24 × 24 px (WCAG 2.2, 2.5.8), and the primary actions (Start, dialog actions, the tab
  bar, History's cards) at least 44 px. Spec: i18n-a11y.md §2†, and a note in
  [design-system-upstream.md](../design-system-upstream.md) rewording the export's rule.
- **D-8 — connection info keeps its grid on narrow screens.** Context: screens.md §1 says it
  collapses to one line with a disclosure; the kit and the app show the full grid. Decision: the
  spec is stale; the sentence is removed from screens.md §1†. No code change.

Plan 1 and plan 2 were carried out together as one plan; its spec commits are c487f44 (D-1),
a0e5a96 (D-2), ce304b4 (D-3, and the capped wording of QA-03) and a848198 (the live extension of
QA-04). No commit of that plan landed in plan 3 or plan 4 by accident: the result-detail files it
touched (`result/charts.ts`, `result/PhaseChart.vue`, `result/metrics.ts`) carry its own findings
QA-32 and QA-52.

Plans 3 and 4 were carried out in that order. Their decisions' spec commits are 892bc11 (D-4),
d8e6cb3 (D-5), 2788b02 (D-6), 67b6149 (D-8), and e8d30b7 with d6f2d26 (D-7, which also states the
focus rule of QA-22 and the forced-colors rule of QA-50); the upstream note D-7 asks for, with those
of QA-10 and QA-50, is ad6eaee. Questions the decisions left open were answered while planning, on
2026-10-23, and specified in a881f30, 2409cf4 and 33d62e7:

- **QA-06:** the summary compares every setting that changes a run (preset, Continuous direction
  and run length, phases, streams, both durations, data cap, units, warm-up, ping count, overhead
  compensation) against the server defaults under the run's preset, in the changed list's order.
- **QA-10:** the tab bar moves to `--z-sticky`, under the overlays; the export is noted upstream.
- **QA-17:** Settings' fields show the URL parameters over the stored settings, as flows.md §9† now
  says.
- **QA-18:** the spec follows the code: the lists keep the serial comma.
- **QA-37:** a direction without a series reads the instant its error or the data cap ended it, or
  its maximum, from the result's events, with no format change.
- **QA-44:** the share panel's reason words win on every surface; the kit's Test screen is noted
  upstream in b0f4cd2.
- **QA-45:** by design, as the kit draws it; screens.md §6† says so.
- **QA-46:** one not-graded reason, the same on both screens, derived from the result.

The fixes changed what the demo shows against the kit. The full-matrix run after them (d14b6e6d,
complete, 348 pairs) holds 706 pending differences in 114 draft groups, most of them the geometry
the phone target sizes push down, beside the tab bar, the low-confidence wording, the not-graded
reason and the wrapped title, and 3 baseline entries the fixes removed. None was accepted: they
wait for a `parity-triage` session with the user, which also extends the clusters whose scope grew.

## High

### QA-01: A WebSocket closed with 1009 is never really closed and frees its slot, so one client holds any number of sockets and leaks their descriptors

- **Observed:** `18081` and `18083`. A raw client without an `Origin` sends a text frame of more
  than 256 bytes on `/api/v1/ws`. The server writes the close frame `1009 "read limited at 257
  bytes"` but never closes the TCP connection, even after the client answers with its own close
  frame; a Node WebSocket never sees its `close` event. The handler has returned, so the client's
  WebSocket slot is released: one address held 8, then 20 such connections at once, against the
  fixed limit of 4. Once the client exits, the server's sockets stay in `CLOSE-WAIT` with their
  descriptors open (`process_open_fds` 24 → 44 for 20 connections and stayed there; one still open
  120 s later, while an idle connection is closed with `1000 idle`), and
  `bitgauge_websocket_connections` reads 0 throughout. A browser cannot do this (another origin
  gets 403), but any host on the network without an `Origin` can, until the server runs out of
  descriptors.
- **Expected:** a message over 256 bytes closes the connection with 1009, and a client holds at
  most 4 WebSockets ([wire-protocol.md §6](../../features/wire-protocol.md#6-websocket-apiv1ws));
  the limits bound what one client can hold
  ([security.md §2](../../features/security.md#2-bandwidth-abuse-limits)).
- **Cause:** `internal/handlers/ws.go:221-226`: `echo` returns on the read error, its comment
  assuming "the read limit closed with 1009". In `coder/websocket` v1.8.15 the read limit only
  calls `writeError`, which writes the close frame (`read.go:528`, `write.go:428`) and leaves the
  connection open; nothing calls `conn.CloseNow()`, and the hijacked connection is never read
  again. The 1003, 1007 and idle paths go through `conn.Close` and do close it.
- **Evidence:** verified with raw-socket and Node clients, `ss -tanp`, `/proc/<pid>/fd` and
  `/metrics`, before and after the reboot, and in the library's source.
- **Status:** Fixed in 74fd843.

## Medium

### QA-02: Any 429 reads as "Server stream limit — 1 stream" and ends the run as "Connection to BitGauge lost"

- **Observed:** `18083`, `/?streams=2`, and its copy on `18102` with a Standard run, Chromium
  1440. The download sends 60 requests of 64 KiB in about a second, then gets three
  `429 rate_limited` (`bitgauge_rate_limited_total{limit="rate"} 3`, no stream refusal). The run
  ends after 2.3 s with "Connection to BitGauge lost — 3 requests in a row failed during download"
  beside "Server stream limit — 1 stream: The server refused more parallel streams", and the
  Download JSON holds `{code: "stream-limit", streams: 1}`. The server refused no stream, and 2 is
  within its maximum. `Retry-After` is not read, so the three retries fail at once. This
  configuration passes validation, but no run on a fast link can finish with it.
- **Expected:** `stream-limit` is the notice for a `429` caused by `max_streams_per_client`
  ([measurement.md §4](../../features/measurement.md#4-adaptive-stream-count), "Per-client
  limits"); [wire-protocol.md §9](../../features/wire-protocol.md#9-rate-limits) tells
  `rate_limited` from `too_many_streams`; a notice never contradicts the state beside it
  ([screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** `web/src/engine/download/phase.ts:336-345` and `web/src/engine/upload/phase.ts:237-247`
  treat every `429` as a stream limit and read neither the envelope's `code` nor `Retry-After`.
- **Evidence:** verified against `/metrics`, the server log (three `status=429`, all from the
  round's own run) and the Download JSON.
- **Status:** Fixed in 3f63a0b. Decided by D-1 (spec c487f44).

### QA-03: A direction the data cap ended says it "reached its 5 s maximum" and offers Standard

- **Observed:** `18084` (50 MiB cap), `/?label=VPN-QA&streams=9&duration=5`, Chromium 1440. The
  cap stopped the download at 73 ms (Download JSON: a `data-cap` event at 73 ms, 52 428 800 bytes,
  `insufficient-data` with `offer: standard`). The notice reads "Download reached its 5 s maximum
  without a confirmed steady window… Standard allows up to 20 s…" with **Try Standard**, and the
  tile "no steady window within the 5 s max", beside "Data cap reached" and a duration of 0.1 s.
  Standard has the same cap and would end the same way. Every loopback run on `18084` does this.
- **Expected:** [measurement.md §8.6](../../features/measurement.md#86-shortfall) words the
  shortfall and its offer for a phase that reaches its maximum, which a direction the cap ended has
  not; a notice never contradicts the state beside it
  ([screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** `web/src/components/test/insufficient.ts:54-57` and
  `web/src/components/test/tiles.ts:128` word the maximum whenever `maxMs` is set; the engine
  attaches the `standard` offer to a direction the cap ended.
- **Evidence:** verified against the Download JSON and the code.
- **Status:** Fixed in 6702c5b (spec ce304b4).

### QA-04: A phase that runs past its minimum shows no sign of it until the direction ends

- **Observed:** `18080`, Standard, Chromium 1440 light. The Download JSON has an `extended` event
  at 10 000 ms, but from 10 s to 20 s there is no "Test extended" notice and no Extended chart
  mark; the step reads "active · 9.7 s left" and the chart header "15.3 s / 10 s". Both appear
  only when the download finishes. The demo's `insufficient` scenario also lacks the Extended and
  "20 s max" marks the kit draws (the kit's header reads "31.3 s / 45 s max").
- **Expected:** "the `test extended` notice appears live"
  ([flows.md §3](../../features/ui/flows.md#3-slow-mobile-vpn-run), step 5), and the chart's event
  marks are live, extended among them ([screens.md §1](../../features/ui/screens.md#1-test-home--)).
  The parity triage defers this as `feature-live-extension-marks` because the spec "does not
  define yet" a live extension, which flows.md §3 contradicts.
- **Cause:** `web/src/engine/phases/window.ts:103-116` sets `extended` in `evaluate()`, but only
  `outcome()` emits the notice, at the phase end; the chart's marks come only from the result
  (`web/src/components/chart/series.ts:55`); the header's planned end uses `minMs`
  (`web/src/components/chart/text.ts:141-149`).
- **Evidence:** verified against the Download JSON and the code.
- **Status:** Fixed in 3c5ddcc (spec a848198). The demo-parity cluster
  `feature-live-extension-marks` stays open for the next parity-triage full run.

### QA-05: A stopped direction's phase step shows its steady-window coverage instead of when it stopped

- **Observed:** `18080` (Esc in the download's warm-up) and the demo's `cancelled`,
  `cancelled-download` and `cancelled-slow-up`: the step reads "cancelled · 0.0 s" while the notice
  beside it says "Upload stopped at 3.1 s". `cancelled-late` reads 4.8 s where the kit reads
  14.0 s. Demo parity normalizes digits, so it cannot catch this.
- **Expected:** the kit's step shows the stop instant ("cancelled · 3.1 s"), and
  `web/src/components/test/steps.ts:42` documents the field as how long the phase ran.
- **Cause:** `web/src/components/test/screen/states.ts:124-126` passes the `stopped-early`
  notice's `coveredMs` to the step, and `PhaseIndicator.vue:99` prints it.
- **Evidence:** verified in the code and against the kit.
- **Status:** Fixed in 279dfa2.

### QA-06: The Test screen's settings summary reads "nothing differs" when durations, phases, the run length or an Advanced setting differ

- **Observed:** `18084`, `/`, Chromium 1440. The summary shows the nothing-differs line "Quick
  preset · Auto streams · Cap 52.4 MB" for a stored `overheadCompensationPercent: 5`,
  `pingCount: 30` and `warmup: 5000`; for stored download durations of 5–60 s with phases
  `idle,upload`; for `?duration=600`; and for `?test=download`. With
  `?preset=continuous&duration=3600` it shows only "1 changed: Continuous". An overhead
  compensation of +5 %, which changes every number, reads as a default.
- **Expected:** "the settings that differ from the server defaults, one chip each … or the preset
  name when nothing differs" ([screens.md §1](../../features/ui/screens.md#1-test-home--));
  [flows.md §9](../../features/ui/flows.md#9-changing-settings), step 3.
- **Cause:** `web/src/lib/settingsSummary.ts:43-60`: `changedParts` compares only the preset,
  streams, data cap and units.
- **Evidence:** verified in the DOM for each case and in the code.
- **Status:** Fixed in 69341fc (spec a881f30).

### QA-07: The connection strip's STREAMS cell shows the server's stream mode, not the run's

- **Observed:** `18084` with a stored fixed 4, and `18083` with `?streams=2`: STREAMS reads
  "— / auto" beside the summary chip "4 streams" (or "2 streams"), and still "— auto" after the
  run. Single does the same.
- **Expected:** the stream count, "—" before one only when the count is automatic
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)); the strip and the summary agree.
- **Cause:** `web/src/components/connection/ConnectionStrip.vue:94-101` reads
  `info.defaults.streams` (the server's defaults) rather than the effective settings.
- **Evidence:** verified in the code and in the DOM on both stacks.
- **Status:** Fixed in 04d2307.

### QA-08: Compare shows a fixed-stream run's streams as the auto maximum ("Fixed 6" for a Quick run on 3)

- **Observed:** `18087` and `18088`, History, compare two Quick results: the Parameters row and
  Copy comparison read "Streams: Fixed 6 → Fixed 6". The Result detail of the same records reads
  "Streams Fixed · 3", and the Test screen "3 streams".
- **Expected:** one reading on every screen; Quick is "fixed 3"
  ([measurement.md §8.5](../../features/measurement.md#85-presets)).
- **Cause:** the result stores `settings.streams` as `{mode, max}` with `max` the auto ceiling
  (`web/src/engine/result.ts:116`, matching the result format in measurement.md), so a fixed run's
  count is not in `settings`; `web/src/components/history/compare.ts:191-196` prints `max` as the
  count. The Result detail reads the count from the directions
  (`web/src/components/result/parameters.ts:58-75`), which a fix can reuse without a format change.
- **Evidence:** verified: IndexedDB holds `settings.streams: {mode: "fixed", max: 6}` and
  `download.streams: 3`.
- **Status:** Fixed in b9bac6d, with QA-47.

### QA-09: A direction's headline announcement is replaced about 10 ms later by the next phase's

- **Observed:** `18080` and `18088`, full runs in Chromium, Firefox and WebKit. A
  `MutationObserver` on the gauge's polite region (`aria-atomic=true`) recorded "Download result:
  13.0 gigabits per second" at 23 667 ms and "Measuring upload" at 23 672 ms in the same element;
  "Connecting to the server" and "Measuring idle latency" likewise.
- **Expected:** "Announcements of one change are read as one message, the headline first, so the
  next phase does not cut it off"
  ([i18n-a11y.md §2.1](../../features/ui/i18n-a11y.md#21-live-region-for-the-gauge)).
- **Cause:** `web/src/components/a11y/LiveRegions.vue:41-53` joins only the messages queued before
  the next `nextTick`; the engine sends `finished` and the next `started` as two Worker messages,
  so each lands in its own tick. `phaseAnnouncements` (`announce.ts:62-70`) joins them only when
  they arrive in one change.
- **Evidence:** verified by the recording in three browsers and in the code; no screen reader was
  run.
- **Status:** Fixed in 69c04d3.

### QA-10: On phones the tab bar is drawn over modal dialogs and hides their action buttons

- **Observed:** 390×844, light, on `18087`, `18088` and the demo. Compare (full screen): Copy and
  Done (y 784–828) lie under the tab bar (y 780–844). Share from the Test screen: Download image
  (781–815) and Copy summary (825–859) lie under it, and the dialog ends at y 876, 32 px below the
  viewport, so its last row cannot be scrolled into view. The tab bar has no pointer events while
  the modal is open, so a tap on what looks like a tab lands on the hidden button under it. Import,
  Clear all and Reset all were not measured and may be affected when tall enough.
- **Expected:** a focus-trapped modal dialog over the page
  ([flows.md §6](../../features/ui/flows.md#6-history-review-and-compare), step 6;
  [§8](../../features/ui/flows.md#8-sharing), step 1); no content hidden at 390 px.
- **Cause:** `web/src/components/layout/TabBar.vue:35` uses `z-(--z-nav)` (80) and the dialogs
  `z-(--z-overlay)` (50) (`history/ComparePanel.vue:88-90`, `share/ShareDialog.vue:58-60`), the
  token order of `docs/design_system/colors_and_type.css:540-542`; `ShareDialog.vue:60` combines
  `max-tablet:top-(--space-16)` with `max-h-[calc(100vh-var(--space-8))]`, which overflows the
  viewport by 32 px.
- **Evidence:** verified with screenshots, computed styles and bounding boxes.
- **Status:** Fixed in 0e43476; the export's z order and dialog height are noted upstream in ad6eaee.

### QA-11: A "URL parameter ignored" notice with a long value scrolls the page sideways at 390 px

- **Observed:** `18080`, `18084` and the demo's `param-ignored`, `/?label=` with 65 characters,
  390×844: `scrollWidth` 540–796 on a 390 px viewport, and the value runs past the screen edge.
  The result repeats the notice.
- **Expected:** "The page must work in portrait on a phone without horizontal scrolling"
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)); the notice repeats the value cut to
  64 characters ([url-params.md §1](../../features/ui/url-params.md#1-rules)), so it must hold one
  that long.
- **Cause:** `web/src/components/test/NoticeBox.vue:63-65`: the body has no `break-words` or
  `wrap-anywhere`, so an unbroken value cannot wrap.
- **Evidence:** verified by walking the overflowing boxes and with screenshots.
- **Status:** Fixed in b648750, with QA-12.

### QA-12: The save bar's label suggestion makes the Test screen scroll sideways at 390 px

- **Observed:** `18088`, 390×844, both themes. After a run labeled with 64 characters and no
  spaces, the next run's save bar offers that label as a suggestion chip 578 px wide;
  `scrollWidth` is 578 against 390.
- **Expected:** no horizontal scrolling on a phone
  ([screens.md §1](../../features/ui/screens.md#1-test-home--)); a label may be 64 characters.
- **Cause:** `web/src/components/test/SaveBar.vue:148`: the suggestion button is
  `whitespace-nowrap` with no `max-w-full`, `min-w-0` or truncation, inside a wrapping flex group.
- **Evidence:** verified by measuring the overflowing boxes.
- **Status:** Fixed in b648750, with QA-11.

### QA-13: In Settings' Changed list, a long result label is drawn over the "Result label" name

- **Observed:** `18084`, `/settings` with a stored 64-character label, 1440 and 390, both themes:
  the name and its "default None" shrink to 0 px and sit under the value.
- **Expected:** every changed setting with its default, its value and a reset
  ([screens.md §4](../../features/ui/screens.md#4-settings--settings)).
- **Cause:** `web/src/components/settings/ChangedList.vue:66-70`: the name column is
  `min-w-0 flex-1` and the value has no width limit. The export's `MetaList` has the same defect,
  already noted in [design-system-upstream.md](../design-system-upstream.md).
- **Evidence:** verified: the name's `clientWidth` is 0; screenshots.
- **Status:** Fixed in 5ac186d, which fixes the Vue MetaList too.

### QA-14: In the Compare dialog a long label overlaps the other column on desktops and pushes the values out of the card on phones

- **Observed:** `18088`, two results with a 64-character label without spaces. At 1440 the A and
  B column headers and the Label row print over each other (the same in Firefox and WebKit). At
  390 the card's min-content width follows the label (`scrollWidth` 1037), so the value column
  sits beyond the card's right edge and only the row names show.
- **Expected:** both parameter sets side by side
  ([screens.md §3](../../features/ui/screens.md#3-history--history)), one result per column with
  paging on narrow screens.
- **Cause:** `web/src/components/history/ComparePanel.vue:137-165` (the `table-fixed` header link)
  and its value cells (lines 197-200) have no break rule; `CompareCards.vue`'s value spans have no
  `min-w-0` or break rule.
- **Evidence:** verified with screenshots and the overflowing element's measurements.
- **Status:** Fixed in 80e0fcc.

### QA-15: The Result detail's title cuts the label to one line with no way to read the rest

- **Observed:** `18088`, all three browsers and every viewport: for a 64-character label the `h1`
  shows 552 of 1296 px at 1440 and 322 of 1049 px at 390, with no title attribute or tooltip; a
  spaced 64-character label shows about 15 characters at 390.
- **Expected:** the label is the screen's title
  ([screens.md §2](../../features/ui/screens.md#2-result-detail--resultid)); the kit's
  `ResultDetail.jsx:497` lets it wrap.
- **Cause:** `web/src/components/result/ResultHeader.vue:125` (`min-w-0 truncate` on the `h1`).
- **Evidence:** verified by measurement and against the kit's source.
- **Status:** Fixed in c1dca30.

### QA-16: A phone History card squeezes a partial or low-confidence result's label to a few characters

- **Observed:** `18087` and the demo's populated history, 390×844: a kept partial with low
  confidence shows "Sto…" for "Stopped in download" and its date wraps over four lines; the demo's
  low-confidence card gets 112 px for its label where the others get 232.
- **Expected:** cards showing the label, date, download, upload, latency and grade
  ([screens.md §3](../../features/ui/screens.md#3-history--history), responsive notes).
- **Cause:** `web/src/components/history/ResultCard.vue:76-97`: the label and date column shares
  its row with the `flex-none` pills and grade.
- **Evidence:** verified by measurement on the demo after the reboot; the `18087` screenshot is
  from before it.
- **Status:** Fixed in 238cd99, with QA-49.

### QA-51: With a Quick server default and no stream mode set, runs use auto streams while the Quick card says "Fixed 3"

- **Observed:** `18084` (`test_defaults.preset: quick`, `streams.mode` unset). Runs use auto
  streams (Download JSON: `preset: quick`, `streams.mode: auto`), the Settings Streams field shows
  Auto, and the Quick preset card, badged Default, says "Fixed 3 streams".
- **Expected:** Quick is "fixed 3, no ramp"
  ([measurement.md §8.5](../../features/measurement.md#85-presets)); by D-2 an unset
  `streams.mode` follows the configured preset.
- **Cause:** `streams.mode` defaults to `auto` regardless of the preset
  ([configuration.md §2.3](../../features/configuration.md#23-test-defaults)), and `/info` reports
  it as such.
- **Evidence:** verified against the Download JSON and `/api/v1/info`.
- **Status:** Fixed in 76b94ba. Decided by D-2 (spec a0e5a96).

### QA-52: A stopped direction without a number is stored as `partial` instead of `insufficient-data`

- **Observed:** `18080`, a run stopped before a direction had a steady window: the Download JSON
  holds that direction as `partial` with no number.
- **Expected:** `insufficient-data`, with the result `partial`
  ([measurement.md §7.6](../../features/measurement.md#76-headline-peak-and-minimum-window),
  [flows.md §4](../../features/ui/flows.md#4-cancel-mid-test)); decided by D-3.
- **Cause:** `web/src/engine/download/outcome.ts:89-90` and `web/src/engine/upload/outcome.ts:120-121`.
- **Evidence:** verified against the Download JSON and the code.
- **Status:** Fixed in c61c60f. Decided by D-3 (spec ce304b4).

## Low

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| QA-17 | Under `?theme=dark` with a stored Light, Settings' Theme field shows Light selected while the page is dark, and clicking Light does nothing (no emit for the current value). | `web/src/components/settings/ThemeLanguageField.vue:39-42` reads `form.stored`; the header reads `theme.choice` | Fixed in bf14c5c (spec 2409cf4) |
| QA-18 | The ignored-parameter notice's lists use a serial comma ("1, true, 0, or false", "idle latency, download, and upload"); url-params.md §2 writes them without. Align the spec or the code. | `web/src/components/test/ignored.ts:38` (`Intl.ListFormat`) | Fixed in b18ea15 (spec 2409cf4) |
| QA-19 | `?streams=03` reads "streams=3 ignored", the parsed value rather than the one the link gave (url-params.md §1). | `web/src/composables/useUrlParams.ts:171` | Fixed in 24ed951 |
| QA-20 | Inline errors name a wrong value to restore: an unstored label reads "Not saved · Esc restores ." and the run length "Esc restores 8." without its unit. | `settings/LabelField.vue:44-52` (no `restoreText`), `RunLengthField.vue`, `SettingInput.vue:57` | Fixed in 7342629 |
| QA-21 | A dismissed "URL parameter ignored" notice comes back after Settings → Test within the same page load (url-params.md §1: dismissing hides it for the page load). | `web/src/composables/useTestScreen.ts:58-61` (state per component instance) | Fixed in 7410d65 |
| QA-22 | Focus falls to `<body>` when the control that had it goes away: after a row reset in Changed from defaults, after confirming Reset all (its trigger is disabled), after confirming Clear all, and after the countdown's Cancel (i18n-a11y.md §2.3). | `settings/ChangedList.vue`, `settings/ResetAllDialog.vue`, `history/ClearAllDialog.vue`, `test/AutoStartNotice.vue` | Fixed in 05ffdf3 (spec e8d30b7) |
| QA-23 | The Download duration row's arrow icon shrinks to 0 px when the "custom" mark shows. | `web/src/components/settings/DurationFields.vue:89` (fixed `w-29.5` label) | Fixed in 8f05544 |
| QA-24 | The copy-failure texts of Settings' Copy link and About's snippets are not in a live region, while "Copied" is announced. | `settings/ShareUrlField.vue`, About `Snippet.vue` | Fixed in 432a7f6 |
| QA-25 | At 390 px most controls are below 44 px (History toolbar 28, filter chips 30, Settings segmented controls 32, Chart/Table 28, About copy buttons 28×28), and a few below WCAG 2.2's 24 px (Settings duration, data cap and countdown inputs 34×20, the Result label input 20, "Edit settings" 42×21, the latency legend toggle 18, the share panel's Include label checkbox 16×16). The kit has the same sizes. | many; the kit's `docs/design_system/ui_kits/app/*` alike. Decided by D-7 | Fixed in ff79a6c (spec e8d30b7 and d6f2d26; upstream note ad6eaee) |
| QA-26 | With `streams.max: 2` the streams caption still says "Auto ramps 1 → 2 → 4 → 6", beside "Fixed runs 1–2". | `web/src/i18n/locales/en/settings.json:62` | Fixed in f39ec05 |
| QA-27 | A config problem in a list item set from the environment logs `value=null` (`BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.0/33` → `key=server.trusted_proxies[0] value=null`); from a file it logs the value (configuration.md §4). | `internal/config/load.go:205-237` (`valueAt`/`elementAt` expect a list; the env value is still a string) | Fixed in f2123d9 |
| QA-28 | A decode error in a config section hides an unknown key in the same section (`server.lisen` with a bad `server.trusted_proxies`); it still exits 2, but configuration.md §4 logs every problem. | `internal/config/load.go:168-192` | Fixed in 57ffd39 |
| QA-29 | The debug log has no line when a WebSocket opens, only `status=101` with its duration when it ends; configuration-security.md §6 lists "WebSocket open and close". | `internal/handlers/ws.go` | Fixed in 0dffadb |
| QA-30 | A malformed `Content-Length` (`abc`, `-5`) on `POST /api/v1/upload` gets Go's plain-text 400 without the envelope, `Cache-Control` or `nosniff` (wire-protocol.md §7). A browser cannot send it. | `net/http`, before routing | Documented and pinned in e1d98a4 |
| QA-31 | During Continuous warm-up the Loaded latency tile shows a number while its caption says "starts after warm-up". | `web/src/components/test/continuous/continuous.ts:142-144` | Fixed in 91263db |
| QA-32 | A Continuous run ended by Stop is `complete` and saved, yet its chart mark reads "Cancelled"; the kit reads "Stopped" (flows.md §7, step 5). | `web/src/components/chart/text.ts:188` | Fixed in c2d30cd |
| QA-33 | Before `/info` answers, the gauge says "Ready · Press Enter to start" while Start is disabled ("Waiting for the server's default settings."). | `web/src/components/test/screen/view.ts` | Fixed in 4c6ca93 |
| QA-34 | After a stop during idle latency, the screen-reader summary says "Data used 0 bytes" where the tile reads "—", and leaves out the stop notice other stopped runs' summaries carry. | `web/src/components/a11y/announce.ts` | Fixed in 78d4d2a |
| QA-35 | History's table and cards and the compare dialog (Protocol row, the not-comparable warning, the copied text) show the raw token `http/1.1` or `h2`; the Test screen and Result detail say `HTTP/1.1` (screens.md §6). The demo's fixtures store "HTTP/2" and hide it. | `history/rows.ts:74`, `history/compare.ts:99,208` (no `protocolLabel`) | Fixed in e4a1ceb |
| QA-36 | An unrecognized browser reads "unknown 0 · Linux" on the Result detail and in compare, built outside i18n; the Test screen says "—" (screens.md §6). | `result/parameters.ts:186`, `history/compare.ts:197` (cf. `test/tiles.ts:258`) | Fixed in 97e8ac4 |
| QA-37 | Test parameters leave out a direction's duration and bounds when it has no stored series and was not stopped by the user: a 25 s upload that ended `insufficient-data`, or a download that failed at 6.5 s, gets no row (screens.md §2). | `web/src/components/result/parameters.ts:88-92` | Fixed in fff9a19 (spec 33d62e7) |
| QA-38 | A Continuous result's confidence card reads "the steady window covered 792,713.5 s" for a 9-day run, which reads "9 d 4 h 12 min" elsewhere on the page. | `web/src/components/result/confidence.ts:60` | Fixed in 4a5949c |
| QA-39 | One Continuous run reads "42:18 · stopped by you" on the Test screen and "ran 42 min 19 s" on its Result detail (`series.endMs` 2 538 500). | `web/src/lib/format.ts:157` (rounds) vs `:171` (floors) | Fixed in 97002bf |
| QA-40 | A History row shows LOW CONFIDENCE for a partial whose only low-confidence direction has no number; both rates read "—". | `web/src/components/history/rows.ts:81` | Fixed in dc2bd86 |
| QA-41 | The trend charts' accessible names read "Download trend, 1 results, 0 partial or error". | `web/src/i18n/locales/en/history.json:135` | Fixed in f9c8ec1; its History e2e expectation in 961e2cd |
| QA-42 | Import accepts a label of any length (300 characters were accepted); History's table then grows to 3541 px in its 1118 px card and every metric column scrolls out of view. | `web/src/engine/result/validate.ts`, `history/ResultsTable.vue`, `history/FilterBar.vue:78`. Decided by D-5 | Fixed in df4f363 (the import, spec d8e6cb3) and 7148f7c (the layout) |
| QA-43 | History's URL filters are not corrected: `?range=foo` shows All time and keeps `range=foo`; `?range=2026-10-19..2026-10-15` shows "Oct 19 – 15, 2026" and matches nothing. | `web/src/components/history/filters.ts`. Decided by D-6 | Fixed in 1c61814 (spec 2788b02) |
| QA-44 | One confidence reason has two wordings: "low confidence · unstable and few samples" on the tile and notices, "low confidence: unstable, insufficient samples" in the share image and text. | `share/content.ts` vs `result/metrics.ts` | Fixed in b0f4cd2, with the kit's Test screen wording noted upstream |
| QA-45 | The same `unavailable_h1` HTTP loaded responsiveness reads "—" per direction on the Test screen and "unavailable" on the Result detail. | Test result section vs `result/LoadCard.vue` | By design: documented in 33d62e7 |
| QA-46 | For one demo `error` result the bufferbloat "not graded" reason reads "test incomplete" on the Test screen and "Needs idle latency and the latency under load of a direction" on the detail, although idle latency was measured. | `web/src/components/result/load.ts` | Fixed in 3301af9 (spec 33d62e7) |
| QA-47 | Test parameters' Streams row lists a skipped direction as "upload 0" ("Auto · download 6 · plateau: cap; upload 0"). | `web/src/components/result/parameters.ts:58-75` | Fixed in b9bac6d, with QA-08 |
| QA-48 | At 1440 a label with a long unbroken word makes History's table scroll inside its card (1221 vs 1118 px), hiding the Grade column and the row actions with no cue. | `web/src/components/history/ResultsTable.vue` | Fixed in 7148f7c |
| QA-49 | Firefox only: History cards at 390 px break the unit after the slash ("5.08 Gbit/" then "s"). | `web/src/components/history/ResultCard.vue` unit spans (no `whitespace-nowrap`) | Fixed in 238cd99, with QA-16 |
| QA-50 | In forced colors the selected state is a background tint alone, so the header's theme switch and History's filter chips look the same selected or not, and the trend legend's filled "Complete" dot disappears. | header theme radio group, `history/FilterBar.vue` | Fixed in 088371d (spec e8d30b7; upstream note ad6eaee) |

## To investigate

- **History at volume:** every row renders, with no virtualization. In a fresh headless Chromium
  the rows took 1.3 s to appear at 500 results, 4.6 s at 2000 and 8.5 s at 4000, and search took
  0.8 s at 4000; under a 20× CPU throttle the 4000-result tab stopped answering for over 100 s.
  History has no retention limit, so Continuous and scripted runs reach these counts.
- **A stale live status:** after a stop with nothing measured, the gauge's region keeps "Measuring
  idle latency" and nothing announces the stop; on the demo's `error`, the top status still reads
  "Measuring download" while the summary says "Test failed".
- **The upload's sending line before its first confirmation:** on the demo's `insufficient` no
  sending line is drawn and the chart header stays at "20.0 s / 35 s" while the gauge shows
  19.0 kbit/s sending; the kit draws the line. Possibly by design, since sending is placed once a
  request confirms.
- **Continuous stopped in warm-up:** the step reads "done · insufficient data" and loses
  "· continuous"; the kit reads "cancelled · in warm-up". Check that the parity cluster
  `v03-cont-stopped-in-warmup` covers the step.
- **The streams cell after an upload stop:** the demo's `cancelled` reads "2 auto" where the kit
  reads "6 auto".
- **The empty chart's prompt after a cap-ended run:** seen once on `18084`, "Throughput over time
  appears here while the test runs." stayed after the run.
- **Aborted downloads:** Playwright reported over 20 `ERR_ABORTED` downloads in one run where the
  server counted 6 aborts and its log shows the others fully written: probably the browser
  aborting bodies its network stack had already received.
- **Simultaneous notices:** at the end of a Firefox run four or more `role=status` notices
  announce at once (extended, low confidence twice, the Firefox upload limit).
- **An empty "Notices" heading** on a result without notices; the kit does the same
  (`ResultDetail.jsx:232-236`).
- **Kit-level overlaps at 390 px that the app reproduces:** the offline "Server unreachable" title
  over the gauge's tick labels, the Continuous gauge caption cut on both sides, and the Continuous
  readout's second line over the tick labels. If confirmed, they are notes for
  [design-system-upstream.md](../design-system-upstream.md).
- **The share image's long label** ends in an ellipsis while the copied text keeps it whole.
- **The undo toast's countdown** pauses while the pointer is over it; the undo still works.
- **Wake lock** is requested at run start; headless refuses it, so it needs a real device.

## By design, no action

- An unknown route outside the SPA's routes gets the server's plain-text `404 page not found`
  ([backend.md §4](../../features/technical-stack/backend.md#4-router-groups)); WebKit logs CSP
  errors for its own viewer's styles on that page.
- A `/result/<id>` deep link on the demo's `vite preview` is blank because the assets resolve to
  `/result/assets/…`; that is the preview's hosting, and the real server deep-links fine.

## Suggested plan split

Four plans, agreed on 2026-10-23, in this order. Each starts with the spec changes of its
decisions.

1. **Server and configuration** (Go; `go-style-guide`, `server-invariants`, `wire-compat`), 6
   findings: QA-01, QA-27, QA-28, QA-29, QA-30, QA-51; decision D-2. First, for the only high.
2. **The engine and the run's reading** (`measurement-engine`, then the Test screen), 11 findings:
   QA-02, QA-03, QA-04, QA-05, QA-09, QA-31, QA-32, QA-33, QA-34, QA-39, QA-52; decisions D-1 and
   D-3. One model per plan: how a run ends and how its phases read (the 429 kinds, the shortfall,
   the extension, the stop, the Continuous end).
3. **Settings, results and history reading** (`vue-page-patterns`, `design-system-guard`), 23
   findings: QA-06, QA-07, QA-17, QA-18, QA-19, QA-20, QA-21, QA-23, QA-24, QA-26, QA-08, QA-35,
   QA-36, QA-37, QA-38, QA-40, QA-41, QA-42, QA-43, QA-44, QA-45, QA-46, QA-47; decisions D-4,
   D-5, D-6 and D-8. QA-07 waits for plan 1 (D-2 changes the stream defaults `/info` reports).
4. **Layout and accessibility** (`design-system-guard`, `demo-parity`), 12 findings: QA-10,
   QA-11, QA-12, QA-13, QA-14, QA-15, QA-16, QA-22, QA-25, QA-48, QA-49, QA-50; decision D-7 and
   its upstream note. Last, so the copy and the values the other plans change are in place before
   the widths are measured.

Borderline findings:

- QA-08 goes to plan 3 by reading the stream count from the directions, as the Result detail does;
  it would move to plan 2 if the result format stored the fixed count instead.
- QA-03 sits in plan 2 because the engine attaches the wrong offer; its wording half could go to
  plan 3.
- QA-39 (Continuous run length rounded on one screen, floored on the other) could go to plan 3;
  it stays with the Continuous end in plan 2.
- QA-22 (focus falling to `<body>`) could go to plan 3 with the dialogs it touches; it stays with
  the accessibility work in plan 4.
