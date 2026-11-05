# Exploratory QA — fifth round, 2026-11-05

**Closed; all four fixes verified in `9864d78`.** Release-blocker-focused
follow-up to the [fourth round](2026-11-04-fourth-round.md). Design-kit alignment was explicitly
excluded. This
round initially recorded findings only. The observations below retain that baseline; the
implementation follow-up and its validation are recorded at the end. No specification changed.

## Release verdict

**Initial verdict: no verified High product bugs or product-bug release blockers in the tested
coverage. Four Medium findings remain: three new and the unfinished metric wording of QA-122.**
Real full runs,
history recovery and sharing remained usable. Addressing these findings before the first public
release is recommended; none demonstrated lost results, an unfinishable run, an unqualified
invented measurement or a security-policy bypass.

Passing exploratory cases are not release approval. The repository has **no recorded first-release
manual accuracy/device evidence**:
`docs/engineering/harness-runs/` contains only its README, which says no run is recorded. Floor,
ceiling, Continuous memory and real-device results must be recorded for the release; the CI tier
must also pass for this commit
([release.md](../../release.md#how-to-release),
[testing.md §6](../../features/technical-stack/testing.md#6-ci-placement)). This round did not run
those gates or inspect remote CI artifacts. Their missing committed evidence remains a release
gate, not a new product-bug finding. The provisional public-release model and one-time setup also
remain explicitly open in [going-public.md §1](../going-public.md#1-revise-the-release-model);
remote repository settings were not audited here.

## The setup

- **Commit under test:** `aab2e6642127c48d460e673253bf42991cb79700` (`fix(qa): resolve
  fourth-round findings`), initially clean worktree. `make build` and `npm --prefix web run
  build:demo` completed; `make e2e-browsers` completed. The binary reports commit `aab2e66`.
- **Real stacks:** all listeners bound to loopback, using `./dist/bitgauge serve` and environment
  variables, never repository configuration files.

  | Ports | Configuration / purpose |
  | --- | --- |
  | `18500` | Defaults; real run lifecycle in three browsers |
  | `18501` | Vite preview of the demo build; scripted errors, slow links, cancellations and Continuous |
  | `18502` | Caddy `caddy:2`, loopback TLS and HTTP/2, `tls internal`, reverse proxy to `18500` |
  | `18503` | Native streams 2, default streams max/fixed 2, requests/minute 60, download/upload request caps 64 KiB |
  | `18504` | Short-lived default server, killed during download and restarted |
  | `18510` | Default HTTP-edge stack |
  | `18511` | All compatibility layers, metrics, HTTPS public URL |
  | `18512` | Same, mounted under `/speed` |
  | `18513` | Low native/networkQuality limits, LibreSpeed, metrics |
  | `18514` | Trusted loopback proxy, exact allowed origin, labels, compatibility layers, metrics |
  | `18516`, `18519` | Temporary healthcheck stubs and fail-closed configuration probes |
  | `18520` | Quick defaults; results/history/sharing area's isolated origin |
  | `18530`–`18533` | Defaults; configured Quick/bytes/50 MiB/no-idle; all layers under `/speed`; LibreSpeed-only |

- **Clients:** curl, raw HTTP/WebSocket/Python clients, playwright-cli and one-shot Playwright
  scripts. Real Quick runs over HTTP/1.1 and TLS/HTTP/2 in Chromium, Firefox and WebKit; saved
  results checked against IndexedDB and Download JSON. Demo numbers are simulated and were not
  used to claim measurement accuracy. Each area used its own origins and rate-limit state.
- **Viewport/preferences:** Test and Continuous at 1440, 1280, 1024, 820, 768 and 390 px wide;
  desktop 1440×900, tablet 768×1024 and phone 390×844 on the principal paths. Light/dark,
  reduced motion and Chromium forced colors were included. No design prototype was opened.
- **Processes and side effects:** the above servers, previews, Caddy container
  `bitgauge-qa5-caddy`, browser processes, temporary clients and scratch files under
  `/tmp/opencode/qa5-*`. Builds replaced ignored generated assets/binaries. No implementation,
  configuration, design export or parity baseline was edited. Cleanup status recorded below.
- **Not covered:** real Safari/iOS/Android, physical slow/VPN links, real screen readers, Web Share
  sheets, a real private-browsing session, real-device wake locks, HTTP/3, this round's image
  isolation/syscall gates, accuracy harness, actual browser quota exhaustion, import cancellation
  and sustained resource exhaustion. Playwright WebKit is not Safari. No broad automated gate is
  claimed from the exploratory scripts.

## How to use this file

A fix commit names its finding (`Fixes QA-NN.`), and the Status line records the hash. A deferral
records its reason. **Verified** means observed live, then checked against JSON, IndexedDB, API,
logs or source; **observed** means not independently re-checked and says why. Existing IDs are
retained when a previous finding is only partly fixed.

## Decisions

No new product decision required. Earlier D-1 through D-23 remain in force. The fourth round's text
still describes its fixes as uncommitted; this round tests their committed state at `aab2e66`.

## High

None verified within this round's coverage; this is not proof that uncovered platforms are clear.

## Medium

### QA-137: A Continuous run capped during warm-up falsely says it was cancelled during latency and neither direction ran

- **Observed:** default server `18500`,
  `/?preset=continuous&test=download&cap=50MB`, Chromium, Firefox and WebKit, desktop. Start and
  let the cap end the run. The Test screen and live-region summary say **Test cancelled during
  latency**. Its body says “Stopped after 20 of 20 pings” and “download and upload did not run”,
  beside **Data cap reached**, Download **capped**, and 50 MB used. No user cancellation occurred.
  The Result detail correctly shows only the data-cap notice.
- **Expected:** a capped Continuous direction ends according to what it measured; notices describe
  its actual ending, not an idle-latency stop
  ([flows.md §7](../../features/ui/flows.md#7-continuous-mode),
  [flows.md §4](../../features/ui/flows.md#4-cancel-mid-test),
  [screens.md §7](../../features/ui/screens.md#7-notices)).
- **Cause:** `web/src/components/test/notices.ts:87–92`, `latencyStopView`, recognizes an idle stop
  using only partial result + idle samples + absence of a `stopped-early` notice. A cap-ended
  Continuous warm-up also satisfies those conditions. It does not check whether a direction ran
  or whether the actual stop was during idle latency.
- **Evidence:** verified in all three browsers and Chromium Download JSON: result `partial`,
  download `insufficient-data`, `bytes: 50000000`, `data-cap` at 69.98 ms, upload `skipped`, and
  only `data-cap-reached` in the result notices. Back from Details reproduces the false notice.
- **Status:** Verified fixed in `9864d78`. Test and live-region wording share the existing
  idle-stop predicate: every direction must be unstarted. Real capped Continuous download and
  upload regressions check the notices, summary, JSON, unsaved state, Details and Back.

### QA-122 (remaining): The interrupted upload's metric tile still claims no steady window within its maximum

- **Observed:** low-limit stack `18503`, Chromium 1440×900, Standard run over HTTP/1.1. Download
  exhausts the request allowance; upload ends after its first confirmed request when the next
  fails. The corrected notice says upload was interrupted before a window and no longer offers
  Try Extended. But the upload metric tile still says **Insufficient data — no steady window
  within the 25 s max**, contradicting the actual 1.575 ms upload. This is the remaining
  presentation portion of [QA-122](2026-11-04-fourth-round.md#qa-122-an-http11-upload-ended-by-a-failed-request-before-a-window-says-it-reached-its-25-s-maximum-and-offers-try-extended).
- **Expected:** the maximum-duration explanation applies only when the direction reached its
  maximum; failed HTTP/1.1 uploads end at failure
  ([measurement.md §7.5](../../features/measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark),
  [measurement.md §8.6](../../features/measurement.md#86-shortfall)).
- **Cause:** `web/src/components/test/tiles.ts:126–139`, `insufficientReason`, handles cancelled
  and capped directions, then unconditionally falls back to the configured maximum. It does not
  handle the `error` event carrying `upload-interrupted`.
- **Evidence:** verified against Download JSON: upload `insufficient-data`, one confirmed request,
  131072 bytes, `error` at 1.57501220703125 ms with notice `upload-interrupted`; insufficient-data
  offer is correctly null. The run lasted 21.9 s overall. Source confirms tile fallback.
- **Status:** Notice fixed by `aab2e66`; remaining metric explanation verified fixed in `9864d78`.
  Tiles reuse the interruption explanation from the recorded error event. The real limiter
  regression checks both Test and Details, with no maximum-duration claim or larger-preset offer.

### QA-138: Environment-variable order can silently discard an unknown configuration key

- **Observed:** current binary, temporary listener `18519`. Insert environment entries in order
  `BITGAUGE_SERVER__LISTEN__TYPO=x`, then `BITGAUGE_SERVER__LISTEN=127.0.0.1:18519`. Serve starts;
  `/api/v1/ping` returns 204. Three independent starts reproduce it. Reverse the same entries:
  exit 2 with `key="server.listen" value="map[typo:x]" rule="expected text: map[typo:x]"`.
- **Expected:** unknown `BITGAUGE_*` keys containing `__` fail startup, independent of enumeration
  order ([configuration.md §4](../../features/configuration.md#4-fail-closed-validation),
  lines 193–201). No bandwidth-limit or origin-policy bypass was demonstrated.
- **Cause:** `src/config/load.rs:199–212`, `environment_tree`, inserts entries sequentially.
  `src/config/raw.rs:306`, `insert_path`, replaces an existing subtree with a later parent value,
  erasing `server.listen.typo` before unknown-key validation at `src/config/load.rs:163–178`.
- **Evidence:** verified successful startup/HTTP, reverse-order rejection, and source. Python's
  insertion-ordered environment reproduces it without shell-dependent ordering:

  ```python
  import os
  import subprocess

  env = {key: value for key, value in os.environ.items()
         if not key.startswith("BITGAUGE_")}
  env["BITGAUGE_SERVER__LISTEN__TYPO"] = "x"
  env["BITGAUGE_SERVER__LISTEN"] = "127.0.0.1:18519"
  process = subprocess.Popen(["./dist/bitgauge", "serve"], env=env)
  # GET /api/v1/ping returns 204. Stop process after checking.
  ```

- **Status:** Verified fixed in `9864d78`. Environment paths are admitted against the existing
  schema before raw-tree insertion. Unknown paths and scalar section values remain diagnostics
  regardless of pair order; valid leaves retain ordinary file/environment precedence.

### QA-139: URL-only changes disappear from Changed from defaults and disable their resets

- **Observed:** fresh storage at
  `/settings?preset=extended&streams=2&cap=200MB&units=bytes&label=FromURL` on `18530`.
  The fields correctly show effective values marked **from the link**, and Shareable URL includes
  them. Changed from defaults instead shows **0**, **Everything is at its default**, and a disabled
  **Reset all to defaults**. Individual resets are absent. Reproduced Chromium desktop and
  Firefox/WebKit at 390×844. After a stored edit enables Reset all, its confirmation names only
  stored changes even though confirming also removes remaining URL overrides.
- **Expected:** settings differing from server defaults are listed with defaults and individual
  resets; reset restores defaults
  ([flows.md §9](../../features/ui/flows.md#9-changing-settings), lines 250–268;
  [screens.md §4](../../features/ui/screens.md#4-settings--settings), lines 300–305).
  Workaround: edit the fields or remove their query parameters.
- **Cause:** `web/src/pages/SettingsPage.vue:111` computes changed keys from stored settings only.
  `web/src/components/settings/ChangedList.vue:38–44` also formats stored values and passes that
  list to confirmation; `web/src/components/settings/ResetAllDialog.vue:59` disables reset when
  its names list is empty. `SettingsPage.link.test.ts:138–139` asserts the stored-only behavior,
  but no earlier product decision settles its conflict with the specification.
- **Evidence:** verified live in three browsers, against `/api/v1/info`, empty localStorage and
  source. QA-136's Shareable URL fix itself holds.
- **Status:** Verified fixed in `9864d78`. Changed rows use effective values and the effective
  preset's defaults. Reset-all scope separately includes masked and unused stored values. Browser
  regressions cover individual reset/focus, cancel/confirm, mixed storage/link values, reload and
  Shareable URL with nonstandard server defaults at phone and desktop sizes in both themes.

## Low

No cosmetic or kit-alignment findings collected.

## To investigate

- Previous round's intermittent Chromium **Page crashed on goto** did not recur in this round's
  browser sessions and scenario sweep. No persistent cause found; not promoted to a finding.
- Previous rounds' notices-versus-summary ordering still needs a real screen reader. DOM text
  inspection is not a substitute.
- Truly hidden-tab countdown/engine suspension remains unverified: the virtual-display attempt
  reported visible pages and is explicitly excluded from passing coverage.
- Import cancellation remains unverified: the files finished importing before the attempted
  cancellation. Locator timeouts are neither a product finding nor a passing cancellation check.

## By design, no action

Earlier rounds' decisions/by-design entries remain in force:
[first](2026-10-23-first-round.md#by-design-no-action),
[second](2026-11-02-second-round.md#by-design-no-action),
[third](2026-11-02-third-round.md#by-design-no-action),
[fourth](2026-11-04-fourth-round.md#by-design-no-action).

## Previous round's fixes re-checked

The commit matching `git log --since=2026-11-04 --grep='QA-'` is `aab2e66`; it carries the fourth
round's fixes. Older fixes were also sampled where their areas were exercised.

| Finding(s) | Verdict | Evidence / remaining scope |
| --- | --- | --- |
| QA-122 | Partly | Correct interruption notice and null Extended offer; metric explanation still wrong, tracked above with the same ID |
| QA-120, QA-121, QA-123, QA-128 | Hold in tested cases | Mixed valid/hostile import rejects individual bad records; inherited names, impossible dates/rates/statuses, series extent and note caps; uppercase UUID skipped; own exports roundtrip |
| QA-124, QA-125, QA-129 | Hold | Compare paging retains focus in three browsers at 390 px; 64-character context label fits; 111-row matching/shown counts agree |
| QA-126, QA-127 | Hold | Raw HTTP parser controls; single-line YAML diagnostics |
| QA-132 | Holds in sampled run | Held upload at 12 s of its 15 s minimum says 3 s left, not time to maximum |
| QA-134 | Holds in sampled runs | Real HTTP/2 low-confidence gauge, steps and live-region summary retain qualifiers |
| QA-136 | Holds | Effective preset/streams/cap/units/label in Shareable URL in all three browsers; stored lang/theme policy retained |
| QA-131, QA-133, QA-135 | Not fully rechecked | Exact startup-unreachable countdown, numberless failed upload's browser notice, and fractional terminal-time regressions not reproduced directly this round; no pass inferred from a different case |
| Earlier server fixes | Hold in tested cases | QA-01, QA-27–QA-30, QA-91–QA-94, QA-101, QA-113, QA-114 |
| Earlier settings/About fixes | Hold in tested cases | QA-64–QA-67, QA-83–QA-85, QA-87, QA-89, QA-115–QA-119; Changed-list defect is QA-139, not a Shareable URL regression |

QA-130 remains by design under the fourth round's agreed ellipsis rule; not reopened. Earlier
immediate-edit/export, sharing privacy, deletion/Undo and Compare-qualifier fixes held in the
exercised cases.

## Coverage notes

- **Real runs:** all three browsers completed Quick runs directly and through TLS/HTTP/2, with
  no uncaught page error or phone overflow. HTTP/1.1 responsiveness correctly unavailable;
  HTTP/2 produced measured/uncertain/unavailable results as recorded in each export, not assumed
  accurate from loopback speed. Immediate Escape returned to Idle without saving another result.
  Continuous capped during warm-up remained unsaved; Details and Back preserved Keep in history.
  A server killed mid-download produced the error state, retained finished idle latency and
  offered Keep/Download JSON rather than automatically saving.
- **Demo runs:** ordinary complete, errors, early errors, upload interruptions/gaps, cancellations
  in latency/download/upload, slow-link outcomes, offline, base-path mismatch, WebSocket closes
  and loaded-latency fallback states. Explicitly forced connecting/latency/download/upload/slow/
  insufficient states were inspected separately. Continuous download/upload held at 42:18,
  warm-up stop and completed stop were checked with explicit Continuous URL parameters. No
  off-origin browser request or uncaught page error in the scenario sweep.
- **Harness traps excluded:** an initial storage-only Continuous selection omitted its required
  URL preset; those first attempts are not Continuous coverage. A Details/Back script raced the
  router; separate navigation reproduced correct retention. Outage and countdown scripts first
  used wrong accessible-name locators; those attempts are not passing checks. A headed Chromium
  attempt under Xvfb still reported `document.visibilityState === 'visible'` after changing
  pages, so neither hidden-tab countdown nor browser-paused engine behavior is claimed.
- **HTTP edge:** 325 route probes plus raw-socket cases covered native methods/error envelopes,
  explicit HEAD, decoding/overflow/caps, chunked compatibility uploads, base path, exact-origin
  CORS, security/cache headers and no API/metrics compression. OpenSpeedTest download was exactly
  31457280 bytes; native delayed upload buckets summed to the nine bytes sent. Metrics on/off,
  no leaked active transfers, healthcheck and redacted debug logs were checked.
- **Limits/timeouts:** held uploads enforced stream limits and released permits on abort;
  networkQuality used its separate slots. Sixteen active clients filled the bounded limiter
  table, which recovered when a client left. Sixty throughput requests succeeded before 429s;
  info/ping/small/metrics remained usable. Upload lifetime 408 at 120.002 s; WebSocket idle close
  at 120.001 s; incomplete head closed at 10.001 s; invalid-message close handshake forced shut
  at 5.001 s. These are observed timings, not altered tolerances.
- **WebSocket/configuration:** origin rejection, fifth-socket refusal, invalid JSON/UTF-8/binary/
  oversized-message close codes, trusted proxy/XFF cases and ordinary fail-closed configuration
  controls held. Configuration YAML diagnostics stayed single-line without excerpts.
- **Settings/URLs/About:** every documented URL parameter, duplicates/aliases/invalids and duration/
  stream/cap bounds; differing server defaults; persistence, preset changes, validation and reset
  dialogs. Effective Shareable URL, all-on/one-layer/off About snippets, base paths and granted
  clipboard contents checked. Keyboard reset/dialog/Escape/focus restoration and forced-colors
  settings states were exercised. No off-origin browser request; documentation links not followed.
- **History/recovery:** own real-browser exports and the Continuous complete, capped partial and
  three HTTP/2 exports roundtripped. Clear all named/exported ten records, IndexedDB became empty,
  and reimport restored all ten without rejection. Mixed hostile files preserved their valid
  records; malformed JSON and over-10-MB files left history unchanged. Immediate label/note edits
  were present in JSON. Filtered JSON and ten-record CSV, reload persistence, row/detail/selected
  deletion and Undo worked. At 111 records, pagination counts and focus were correct.
- **Sharing/storage failure:** dark 1200×630 image, low-confidence qualifiers, label opt-in and
  absence of IP/note/server URL inspected. Chromium clipboard-granted text matched preview;
  WebKit's forced denial selected manual-copy text. Dialog Tab trap and Escape/focus return held.
  Firefox with `indexedDB.open` forced to throw still completed its real run, explained not-saved
  status, allowed JSON export and showed unavailable History. This simulates refused storage;
  it is not a real private-mode or quota-exhaustion test.

## Suggested plan split

Original grouping, subsequently implemented as the remaining-issue fix plan; every finding belongs
to one group:

1. **Frontend correctness:** QA-137, remaining QA-122 and QA-139. Fix run-ending wording together,
   then effective-settings reset/list state. No measurement-method change is implied.
2. **Configuration admission:** QA-138. Preserve unknown environment paths or report conflicts
   before parent values erase them. Independent of the frontend group.

Both groups are well below the 30–40 finding cap. No dependency between them. The implementation
follow-up covers both without expanding into measurement, design-kit or release work.

## Validation and cleanup

Build and browser installation passed. Documentation meta-tests passed (9 tests); the report's
pre-commit hooks passed. No tolerance, timeout, baseline or implementation changed. Final
consolidated report was re-staged for the same documentation gates; no commit was made.

Cleanup complete: all owned browser sessions closed, Caddy container stopped/removed, servers and
transient clients stopped, and all `/tmp/opencode/qa5-*` scratch directories removed. Main's
server/preview PIDs were 815891, 816223 and 830541; the outage script stopped its own children.
Other areas stopped their recorded server PIDs 816777, 816778, 816779, 816787, 816802, 815945,
817212, 817213, 817214 and 817216. Final `ss -ltnp` showed ports `18500`–`18534` free. The only
repository change is this QA report, staged for documentation link checking.

## Implementation follow-up — 2026-11-05

Baseline: `19cbd27`, which committed this report over the tested `aab2e66`. Implementation:
`9864d78` (`fix(qa): resolve fifth-round findings`). All four original failures were reproduced
before their cause was fixed:

- QA-137 and QA-122: focused unit regressions failed with the false latency cancellation and
  maximum-duration wording. Real Chromium regressions against the original embedded app failed
  on those same claims; both Continuous directions were exercised.
- QA-139: component regressions failed on stored-only rows, missing URL-only rows and masked
  stored settings. The original embedded app also failed the fresh-link browser regression.
- QA-138: pure ordered-pair regression failed when the valid parent erased the typo. An
  order-preserving `env -i` launcher showed the baseline typo-first process serving a 204 ping;
  reverse order exited 2. The new command regression failed on that accepted startup. Rust
  `Command.env()`/`envs()` ordering is deliberately not used to claim permutation coverage,
  because its environment map sorts these names and masks the typo-first defect. Both orders
  now exit 2 and name `server.listen.typo`; the pure tests also retain scalar-ancestor errors,
  unrelated errors, valid siblings, lists, labels, ignored variables and file precedence.

Focused browser verification passed in Chromium, Firefox and WebKit. QA-122 checks Test and
Details; QA-137 checks both directions, visible/live-region wording, JSON and unsaved navigation;
QA-139 checks URL-only and mixed stored/link resets, cancellation, focus, reload and effective
Shareable URL. Existing stop/cap/max-duration, valid-number interruption and custom-duration
regressions remain in place. Genuine idle cancellation at the ping-count boundary is retained.

Validation attempts retained:

- The first focused Vitest invocation ran from the repository root and could not resolve `@/`;
  rerunning from `web/` loaded the project config and exposed the intended baseline failures.
- The first post-fix QA-122 browser run hit an old locator's strict-mode failure because the
  correct explanation now appears in both the notice and tile. It was replaced by a count plus
  explicit tile assertions; all three browsers then passed.
- The first Rust gate rejected the new test's `std::time::Instant::now`; it now uses the allowed
  Tokio clock, without a lint exemption. `make verify-rust` then passed, including rustdoc and
  the existing valid serve/healthcheck controls.
- `make verify-web` passed (156 files, 1,825 tests) before the final two idle-stop cases were added.
  The final rerun's typecheck caught a skipped-upload fixture missing `confirmedRequests`; the
  fixture now supplies zero, matching the upload result type. No production change was needed.
- The first full `make e2e` attempt was interrupted by the tool's 120-second command deadline,
  with no test failure reported before interruption. It is not a complete-suite pass. The rerun
  removes only that outer command deadline; no test timeout or measurement tolerance changes.

The complete `make e2e` rerun passed: **287 passed, 4 skipped**. Those four existing skips are the
two Chromium-only forced-colors cases in Firefox and WebKit, not coverage of those platforms.
All new regressions ran in all three browsers; the Settings cases cover 390 px/light and
1440 px/dark. The shared loopback server stopped cleanly; per-test servers are stopped in their
fixtures or `finally` blocks. Documentation meta-tests passed (9 tests).

Final `make verify-web` rerun passed: **156 files, 1,827 tests**, with ESLint and all typechecks.
The first `make check` found two overlong report lines and the now-private `valueOf` helper's
obsolete export; both were corrected without weakening any gate. All other hooks passed.
A repeat overlapped the final report wrapping edit: it read the earlier long line and reported a
file modification during the typecheck hook, despite a clean typecheck. The final rerun used an
unchanged working tree.
No BitGauge process remained after verification. The final `make check` passed every hook. Manual
accuracy/device evidence and the public-release decisions in the release verdict remain separate,
unsatisfied release gates.
