# Exploratory QA — fourth round, 2026-11-04

**Open.**

The fourth exploratory QA round of BitGauge, run with the `qa-round` skill after the
[third round](2026-11-02-third-round.md) closed and the server was ported from Go to Rust
([rust-port.md](../../rust-port.md)). It looked for blockers of the first public release: the
first hand-driven pass over the Rust binary's edge, real runs meeting the new server in three
browsers, and a re-check of the earlier rounds' fixes. Differences from the design kit's prototype
were not looked for. IDs continue from QA-119.

## The setup

- **Commit under test:** `fc297db` (`docs(measurement): keep the upload path B start at the learned
  warm-up end`), clean worktree, `make build` and `npm run build:demo` once.
- **Servers** (`./dist/bitgauge serve`, all on loopback, debug log), one set per area:

  | Port | Configuration |
  | --- | --- |
  | `18300` | defaults (server edge) |
  | `18301` | every compatibility layer, `metrics.enabled`, `server.public_url: https://speed.qa.test` |
  | `18302` | as `18301`, plus `server.base_path: /speed` |
  | `18303` | `max_streams_per_client: 2`, `streams.max/fixed: 2`, `requests_per_minute: 60`, `max_download_bytes: 1MiB`, `max_upload_bytes: 64KiB`, `tracked_clients: 16`, LibreSpeed and networkQuality (`max_flows_per_client: 2`, `max_upload_bytes: 1MiB`), metrics |
  | `18304` | `server.trusted_proxies: [127.0.0.2/32]`, labels, `cors.allowed_origins`, every layer, `tracked_clients: 16`, metrics |
  | `[::1]:18305` | IPv6 loopback listener, LibreSpeed |
  | `18306`, `18307` | short-lived: `ulimit -n 64`; SIGTERM, SIGINT and double-signal tests; JSON log |
  | `18310`–`18319` | Python stub listeners for `healthcheck`; the fail-closed configuration probes |
  | `18320`, `18325`, `18326` | defaults (Chromium, Firefox and WebKit runs) |
  | `18321` | defaults, killed mid-download and mid-upload and restarted |
  | `18322` | `max_streams_per_client: 2`, `streams.max/fixed: 2`, `requests_per_minute: 60`, `max_download_bytes: 64KiB`, `max_upload_bytes: 64KiB` |
  | `18323` | `server.base_path: /speed` |
  | `18324` | defaults, behind Caddy on `18443` |
  | `18327`, `18328` | Node TCP proxies to `18320` that cut the first WebSocket after 9 s; `18328` then refuses later upgrades |
  | `18340` | `preset: quick` (results, history, sharing, URL parameters) |
  | `18341` | `test_defaults` off their defaults, `server.labels: 127.0.0.0/8=Loopback-QA` |
  | `18342`, `18343` | every compatibility layer with `public_url`; LibreSpeed only (About) |
  | `18344` | `preset: quick`, `streams.fixed: 2`, `ping_count: 15` |

- **Demo** (`VITE_DEMO=1` build served by `vite preview`) on `18338` and `18350`, one origin per
  area.
- **Proxy:** Caddy (`caddy:2`) on `18443` (in front of `18324`) and `18339` (in front of `18322`),
  `tls internal`, TLS 1.3, HTTP/2.
- **Clients:** curl, with `--interface 127.0.0.2` for the trusted peer; raw-socket Python for
  slow, stalled, lying and chunked bodies, pipelining and malformed heads; a hand-written
  WebSocket client; one-shot Playwright scripts and playwright-cli; 30 hostile import files.
- **Browsers and viewports:** Chromium throughout at 1440×900, 768×1024 and 390×844; Firefox and
  WebKit for full runs on HTTP/1.1 and HTTP/2, History, Compare, sharing, the Result detail and
  Settings at 1440 and 390. Light and dark.
- **Areas:** the server and the HTTP edge; the Test screen and real runs; results, history,
  sharing, settings, URL parameters and About.
- **Not covered:** real Safari, iOS and Android, a real slow or VPN link, a really hidden tab, the
  wake lock, real screen readers, forced colors (QA-65), the Web Share API, a real private window,
  a dual-stack `[::]` listener, the image layer (`make rust-test-image`), and a `too_many_streams`
  429 met by the app (the server frees a 64 KiB download's slot before a competing client can
  hold it).
- **Processes and side effects:** the servers, previews, Python and Node clients and the Caddy
  container above, and scratch directories under `/tmp/qa/`. At the end every process and the
  container were stopped and `ss -ltn` showed none of the round's ports. One `healthcheck` ping
  from the server area reached `18320`, a runs-area port; pings are not rate-limited. Nothing in
  the repository was edited for a stack.

## How to use this file

A fix commit names the finding in its body (`Fixes QA-NN.`) and the finding's Status line records
the commit's short hash; a deferral records its reason there. **Verified** means re-checked against
the run's Download JSON, the API, `/metrics`, the server log or the code after it was seen;
**observed** means seen, with the cause located but not re-checked, and the finding says why.

## Decisions

The round's two open questions, answered on 2026-11-04, numbered after the third round's D-21.
Each is a spec change made at the start of the plan that fixes its finding; measurement.md and the
pages under `docs/features/ui/` are design-export symlinks, so each change is listed for Claude
Design.

- **D-22 — `browser-upload-limit` only on an upload with a number** (Q-14, QA-133). measurement.md
  §16 attaches it from the upload's idle share alone; on an `error` upload with no number its
  "the measurement is the server's and stands" has nothing to qualify. It is attached only to a
  `measured` or `partial` upload.
- **D-23 — the Shareable URL carries the link's values while they are in effect** (Q-15,
  QA-136). url-params.md §3 builds the link "from the current settings"; a value the link set and
  Settings marks "from the link" is current, so it is in the Shareable URL. `lang` and `theme`
  still come from the stored settings only.

## High

### QA-120: Import takes names of `Object.prototype` members as known fields and notice codes, so a crafted file blanks a Result detail or fails whole with the wrong reason

- **Observed:** `18340`, Chromium 1440, single-record files made from a real export. A notice
  `{"code":"constructor"}` or `{"code":"toString"}` imports ("1 added, 0 rejected"); its History
  row renders, its Result detail renders an empty `main` with `TypeError: Cannot read properties
  of undefined (reading 'actions')`. A notice `{"code":"hasOwnProperty"}`, or an event coded
  `__proto__` or `valueOf`, makes the validator throw: the whole file fails with "The browser
  refused to store the results", and a file of two valid records and one such record imports
  nothing. A top-level `"__proto__"` key is imported and stored (no prototype pollution:
  `({}).polluted` stays undefined).
- **Expected:** imported files are untrusted and validated against the schema; each bad record is
  rejected by its position with its reason and the rest are imported
  ([security.md §7](../../features/security.md#7-browser-only-history-and-privacy),
  [frontend.md §5](../../features/technical-stack/frontend.md#5-history-module-idb)).
- **Cause:** `web/src/engine/result/validate.ts:128` tests unknown fields with `key in required`
  and `key in optional` on plain objects, so inherited names count as fields; `:139` reads
  `shapes[code]` on a plain object, so `constructor` and `toString` resolve to functions that
  report no problem and `hasOwnProperty`, `valueOf` and `__proto__` throw. `checkRecord` in
  `web/src/history/import.ts` re-throws, and `ImportDialog.vue` reports it as `writeFailed`.
- **Evidence:** verified in IndexedDB, the console and the code.
- **Status:** Open.

### QA-121: Import saves results whose status and numbers contradict each other, which then show numbers without their qualifiers

- **Observed:** `18340`, Chromium 1440; each file imported as "1 added". A download
  `insufficient-data` that keeps `bitsPerSecond` reads "DOWNLOAD 16.0 Gbit/s" with no qualifier in
  the Result detail and the share preview, and "16.0 Gbit/s · insufficient data" in History. A
  `measured` download with no `bitsPerSecond`, `confidence`, `series` or `windowMs` reads
  "INSUFFICIENT DATA — no steady window". A `complete` result with an `error` download that keeps
  its number and a `skipped` upload reads COMPLETE beside "16.0 Gbit/s error" in History, "ERROR
  —" in the detail, and is still graded A+. `settings.phases: []` with every phase's data present
  is accepted, and the detail drops both direction charts.
- **Expected:** only `measured` and `partial` directions carry a number and a `measured` one always
  does; `confidence` and `series` exist once warm-up ended; the result status follows its
  directions ([measurement.md §17](../../features/measurement.md#17-result-object)); every number
  carries its status ([screens.md §6](../../features/ui/screens.md#6-result-metrics-units-and-precision)).
- **Cause:** the validator checks shapes only; its one cross-field rule is `directionBlock`
  (`web/src/engine/result/validate.ts:265`), a `partial` direction's number.
- **Evidence:** verified in IndexedDB, History, the Result detail, the share text and the code.
  Reachable only through a crafted or corrupted import file.
- **Status:** Open.

## Medium

### QA-122: An HTTP/1.1 upload ended by a failed request before a window says it "reached its 25 s maximum" and offers Try Extended

- **Observed:** `18322` (low limits, HTTP/1.1), Chromium and Firefox 1440. The download used the
  60 requests a minute, so the upload's second request got `429 rate_limited` 1.4 ms into the
  phase and the upload ended (`error` event with `upload-interrupted`, one confirmed request; the
  run lasted 21.9 s). The Test screen reads "Upload: insufficient data — Upload reached its 25 s
  maximum without a confirmed steady window long enough for a number. 131 kB used. Extended allows
  up to 40 s per direction. [Try Extended]", beside "Upload interrupted by a failed request — … so
  its number covers the window up to the failure" though there is no number. The Result detail
  repeats the offer; the Download JSON has `{"code":"insufficient-data","direction":"upload",
  "offer":"extended"}`. Any HTTP/1.1 upload failure before a 3 s window does the same.
- **Expected:** the offer applies only to a phase that reached its maximum
  ([measurement.md §8.6](../../features/measurement.md#86-shortfall)); an HTTP/1.1 failure ends the
  phase at the failure
  ([measurement.md §7.5](../../features/measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark));
  a notice never contradicts the state beside it
  ([screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** `web/src/engine/upload/outcome.ts:120-125`: the `interrupted` halt takes the duration
  rule's branch, and `record.rule.outcome(…, halts.has('data-cap'))` attaches the next preset
  (`web/src/engine/phases/window.ts:128`); only the data cap suppresses it.
  `web/src/components/test/insufficient.ts:52-59` words every case but the data cap as "reached
  its maximum", and the `upload-interrupted` body always speaks of "its number".
- **Evidence:** verified in two runs' Download JSON, the server log (`POST /api/v1/upload
  status=429` after the first 200) and the code.
- **Status:** Open.

### QA-123: Import accepts impossible dates, numbers out of every range and unbounded strings, which push History and the Result detail tens of thousands of pixels wide

- **Observed:** `18340`, Chromium 1440. `startedAt` `9999-12-31T23:59:59.999Z` makes History
  33 554 432 px wide (the trend chart's labels) and reads "Jan 1, 10000";
  `2026-13-45T99:99:99.999Z` passes and shows raw; `overheadCompensationPercent: 9999` reads
  "+9,999.0 % overhead compensation"; `lossPercent: 1000` reads "1,000.0 % probe timeouts";
  `bitsPerSecond: 1e300` prints 300 digits and makes the detail 6948 px wide; 5000-character
  `contextLabel`, `server.name` and `browser.os` make it 40 198 px wide; a 3000-character
  `url-parameter-ignored` value shows in full; a 9.9 MB note is accepted. HTML in every string
  renders as text.
- **Expected:** imports are validated against the schema
  ([security.md §7](../../features/security.md#7-browser-only-history-and-privacy)); overhead
  compensation is 0–20 % and a context label 1–64 characters
  ([configuration.md §2](../../features/configuration.md#2-keys)); an ignored parameter's value is
  cut to 64 ([url-params.md §1](../../features/ui/url-params.md#1-rules)); no page scrolls
  sideways.
- **Cause:** `web/src/engine/result/validate.ts`: `instant` (`:42-46`) checks the pattern only,
  `number` (`:62-68`) has a floor and no ceiling, `string` (`:32-36`) no length; the label's 64 is
  the only cap, in `checkRecord`.
- **Evidence:** verified in IndexedDB, by `scrollWidth` and the overflowing elements, and in the
  code.
- **Status:** Open.

### QA-124: Compare's Next and Previous at 390 px still drop the focus to the page body

- **Observed:** `18340`, 390×844, Chromium, Firefox and WebKit. Two cards selected, Compare open,
  Enter on Next result: the focus moves to Previous result, then falls to `<body>` about 60 ms
  later; the same from Previous. The buttons' `disabled` state flips back and forth for about
  180 ms, so Previous is disabled again while it holds the focus. What is left of QA-103.
- **Expected:** the focus never falls to the page body
  ([i18n-a11y.md §2.3](../../features/ui/i18n-a11y.md#23-focus-order)) and stays in the
  focus-trapped dialog ([flows.md §6](../../features/ui/flows.md#6-history-review-and-compare)).
- **Cause:** `web/src/components/history/CompareCards.vue:59-65`: `scrolled()` reads `scrollLeft`
  during the smooth scroll that `go()` started, flips `page` back to the old card and disables
  the button `turn()` just focused.
- **Evidence:** verified with a focus log, a timeline of the `disabled` states and the code.
- **Status:** Open.

### QA-125: A 64-character context label scrolls the Result detail sideways at 390 px

- **Observed:** `18340`, Chromium 390×844, a result with a 64-character context label (valid for
  `server.labels`): the header's context chip ends at 566 px and `scrollWidth` is 566. History,
  the Test screen and the share image handle the same label.
- **Expected:** no sideways scroll on a phone with a 64-character label
  ([screens.md §1](../../features/ui/screens.md#1-test-home--); QA-11, QA-12 and QA-60's class).
- **Cause:** `web/src/components/result/ResultHeader.vue:184`: the chip is `whitespace-nowrap`
  with no `max-w-full`, `min-w-0` or truncation, unlike `SaveBar.vue:148`.
- **Evidence:** verified by the element's right edge and in the code.
- **Status:** Open.

## Low

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| QA-126 | wire-protocol.md §7 lists rejections the Rust server never sends: a `414` for a long target (the request line counts toward the 16 KiB head, so it answers `431`; hyper's `414` starts above 65 534 bytes), and an answer to the HTTP/2 prior-knowledge preface, which is closed with no response. rust-port.md already says the first. What is left of QA-113. | `docs/features/wire-protocol.md:268`, `docs/features/technical-stack/backend.md:124`, `docs/rust-port.md:197`; `src/server/conn.rs:79,291-292` | Open |
| QA-127 | A config file that is not valid YAML is logged with serde-saphyr's developer hints and a several-line source excerpt in one record ("duplicate mapping key: display_name, set DuplicateKeyPolicy in Options if acceptable", "use from_str_multiple…"); configuration.md §4 asks for one line per problem. Exit status 2 holds. | `src/config/load.rs:73`, logged at `src/command.rs:128` | Open |
| QA-128 | A duplicate whose `id` differs only in case imports again: the validator takes a UUID in either case and the duplicate check compares exact strings. | `web/src/history/import.ts:136-138`; `web/src/engine/result/validate.ts:49-50` | Open |
| QA-129 | History's header reads "136 of 136 shown" while the list shows 100 rows above "Showing 100 of 136". | `web/src/i18n/locales/en/history.json:5` | Open |
| QA-130 | The share image cuts a 64-character label with an ellipsis; the copied text keeps it whole. | `web/src/share/` | Open |
| QA-131 | A run whose start finds the server unreachable shows the Error state without the time to the next automatic check, which only the offline state between runs shows (screens.md §1, flows.md §1). | `web/src/components/test/screen/view.ts:125-137,143-146` | Open |
| QA-132 | After an upload reaches its minimum without extending, its step counts down to the maximum ("Upload active · 9.7 s left", chart "35.4 s / 35 s") during the grace, with no `extended` event. | `web/src/components/test/screen/states.ts:92` | Open |
| QA-133 | `browser-upload-limit` ("…the measurement is the server's and stands") is attached to an `error` upload with no number (Firefox, server killed mid-upload). Decided by D-22. | `web/src/engine/result.ts:76-79` | Open |
| QA-134 | The finished gauge and the done steps show a headline without its qualifier ("Download done · 15.7 Gbit/s" for a `low confidence · unstable` download) while the tile below carries it. | `web/src/components/test/screen/view.ts`, `web/src/components/test/screen/states.ts` | Open |
| QA-135 | After an error the live chart reads "stopped at 4.1 s" (the last bucket) beside the step's "interrupted at 4.2 s" and the alert's "Download stopped at 4.2 s" (event at 4159 ms). | `web/src/components/chart/text.ts:140` | Open |
| QA-136 | `/settings?preset=extended&streams=2&cap=200MB&units=bytes&label=FromURL` marks every field "from the link" while the Shareable URL reads the bare origin, built from the stored settings only. Decided by D-23. | `web/src/lib/shareUrl.ts`, `web/src/components/settings/ShareUrlField.vue` | Open |

## To investigate

- **Chromium "Page crashed" on `goto`:** seen twice in one area's scripts and not again on retry;
  possibly load from the other areas.

## By design, no action

The earlier rounds' entries stand ([first round](2026-10-23-first-round.md#by-design-no-action),
[second round](2026-11-02-second-round.md#by-design-no-action),
[third round](2026-11-02-third-round.md#by-design-no-action)). Also seen and not findings:

- **Range quirks on SPA files** (`bytes=-0` gives a 206 with an empty range): Go's `ServeContent`
  reproduced, rust-port.md intended difference 12.
- **`public_url` emitted as written** (`HTTPS://X.LAN:443/nq/…`): harmless; validation accepts it.
- **A `too_many_streams` 429 the app could not meet on loopback:** the server frees a small
  download's slot as soon as its body is written.

The third round's To investigate: the Continuous frame at the warm-up's end was not seen again;
the notices after the summary still need a real screen reader.

## Previous round's fixes re-checked

Every server-side fix of the three rounds re-checked against the Rust binary (QA-01, QA-02,
QA-27 to QA-30, QA-51, QA-91 to QA-94, QA-101, QA-114), every run fix of the third round (QA-96 to
QA-100, QA-104 to QA-108, QA-112) and the results, history and settings fixes (QA-54, QA-55,
QA-58 to QA-60, QA-64, QA-66, QA-67, QA-78 to QA-88, QA-90, QA-95, QA-102, QA-109 to QA-111,
QA-115 to QA-119) hold, except these:

| Fix | Verdict | What is left |
| --- | --- | --- |
| QA-103 | partly | Compare's paging at 390 px: QA-124. Try Extended and Keep in history not re-checked |
| QA-113 | partly | the list names a `414` and an answer to the HTTP/2 preface the Rust server never sends: QA-126 |
| QA-65 | not checked | forced colors not run |
| QA-89 | not checked | the copy button at 390 px not checked visually |

## Suggested plan split

Agreed on 2026-11-04: one plan for every open finding (17), QA-120 to QA-136, starting with the
spec changes of D-22 and D-23. The highs come first: the import validation of QA-120, QA-121,
QA-123 and QA-128 (`measurement-engine`, one validator), then the end of a run (QA-122, QA-131 to
QA-135), then the web fixes (QA-124, QA-125, QA-129, QA-130, QA-136), and last the server's docs
and log (QA-126, QA-127; `server-invariants`).
