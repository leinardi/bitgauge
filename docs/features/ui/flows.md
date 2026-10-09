# Flows

[Feature index](../README.md) / [UI](README.md) / Flows

The nine user flows as numbered steps, with branches. Screens are in [screens.md](screens.md); the
rules behind each step are in [../measurement.md](../measurement.md) and
[../edge-cases.md](../edge-cases.md).

## 1. First Run

1. The user opens the BitGauge URL. The SPA loads and calls `GET /api/v1/info`.
   - **Branch: `/info` fails.** Test screen in the offline state: "Server unreachable", Retry
     (step 1 again). Start is disabled.
   - **Branch: base path mismatch.** Full-screen error with the deployment hint; nothing else loads.
2. The Test screen shows the server name, connection info (client IP, suggested label, protocol)
   and the preset from the server defaults. No settings exist yet in this browser, so the server
   defaults apply.
3. The user presses Start.
4. The engine runs info → idle latency → download → upload; the phase indicator, gauge, chart and
   data used update live.
5. The result appears with its notices; it is saved to history automatically.
   - **Branch: an upload request fails over HTTP/1.1.** Only the upload phase ends early: it reports
     the window up to the failure, or `insufficient data`, with the notice `upload interrupted by a
     failed request` and the hint that HTTP/2 at the proxy avoids it. A download configured to run
     after it still runs, and the run ends with status `complete` ([../measurement.md
     §7.5](../measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)).
   - **Branch: history unavailable.** The result is shown with "History is unavailable in this
     browser mode — results are not saved"; export and share still work.
6. The user may open Details, edit the label, or Run again.

## 2. Auto-Run From URL

1. The user opens a URL with `run` (for example `…/?run=1&preset=quick&label=VPN`).
2. The SPA parses the URL parameters ([url-params.md](url-params.md)) and applies them on top of
   stored settings and server defaults for this page load.
   - **Branch: invalid parameter value.** The parameter is ignored and the notice
     `URL parameter ignored` names it; the rest applies.
3. A cancellable countdown (3 s, or the Auto-start setting's length) shows on the Test screen.
   - **Branch: the user cancels.** The countdown stops; the screen is idle with the URL's settings
     applied; Start runs them.
   - **Branch: the page is hidden.** The countdown pauses until the page is visible again.
4. The test runs as in flow 1, steps 4–5; the `label` parameter pre-fills the result's label.

## 3. Slow Mobile VPN Run

1. The user, on a phone over a VPN, opens BitGauge (for example from a home-screen bookmark with
   `?run=1&label=VPN`).
2. The suggested label shows `VPN` when the address class suggests it; the protocol is shown.
3. Idle latency measures a high RTT (for example 300 ms); timeouts adapt to it.
4. Download starts with one stream and 64 KiB requests; the gauge moves slowly; the ramp may skip
   trials (`floor-limited`).
5. The phase extends past its nominal duration: the `slow link — test extended` notice appears live.
   - **Branch: the window condition is met.** Download reports a number.
   - **Branch: the maximum is reached without it.** Download shows `insufficient data`, data used,
     and "Try Extended"; upload still runs.
6. Upload runs server-timed; the gauge shows sending progress, and the received line in the chart
   lags behind it by the confirmation delay.
   - **Branch: the screen locks or the user switches apps.** If the browser pauses the engine, the
     test stops as `partial` ([../edge-cases.md §5](../edge-cases.md#5-tab-hidden-mid-test)); the
     wake lock prevents screen sleep where supported.
7. The result shows numbers with their qualifiers, the bufferbloat grade (often poor on mobile
   links) and the data used.

## 4. Cancel Mid-Test

1. During a run, the user presses Stop (or Escape).
2. The engine aborts in-flight requests and stops issuing new ones.
3. **Partial-result rules:**
   - Completed phases keep their results unchanged.
   - The interrupted download keeps the bytes already read; its window ends at the stop instant.
   - The interrupted upload's window ends at the confirmed watermark; requests aborted by the stop
     contribute nothing ([../measurement.md
     §7.8](../measurement.md#78-worked-example-b--cancellation-mid-request)).
   - An interrupted direction reports a number only if its window meets the minimum: at least 3 s,
     and on upload at least 3 confirmed requests, on download at least two different requests
     contributing bytes ([../measurement.md §5](../measurement.md#5-adaptive-duration)); otherwise
     `insufficient data`.
   - **Exception: Continuous.** Stopping is how a Continuous run normally ends; see flow 7.
   - Phases not yet started are `skipped`.
4. The Test screen shows the Cancelled state: the partial result labelled `partial — stopped early`
   with what was covered ("upload based on the first 7.0 s").
5. The partial result is saved to history with status `partial`.
   - **Branch: nothing was measured yet** (stopped during info or idle latency with too few
     samples). No result is saved; the screen returns to Idle.

## 5. Error Mid-Test

1. During a run, something fails: three consecutive failed requests, a network change, a server
   restart, or the server becoming unreachable. (A single upload failure over HTTP/1.1 is not an
   error: it ends only the upload phase, flow 1 step 5.)
2. The engine stops and emits an `error` event with the phase and whether partial results exist.
   - **Branch: server restarted** (new epoch): `server restarted`; the current phase reports
     nothing.
   - **Branch: network changed:** `network changed`.
   - **Branch: server unreachable:** `server unreachable` with Retry.
3. The Test screen shows the Error state: what failed, in which phase, the completed phases'
   results, and Retry.
4. If any phase completed, the result is saved with status `error`; otherwise nothing is saved.
5. Retry starts a new run with the same settings (flow 1, step 3).

## 6. History Review and Compare

1. The user opens History.
   - **Branch: history unavailable.** The unavailable state with an explanation.
   - **Branch: empty.** "No results yet" with Run test.
2. The list shows results for this origin, newest first, with the per-origin notice.
3. The user sorts or filters by label and date range; the trend chart follows the filter.
4. The user opens a row: Result detail (flow ends there, or Back returns to the list with the
   filter kept).
5. To compare, the user selects two rows and chooses Compare.
6. The compare view shows both results side by side with differences per metric and both parameter
   sets.
   - **Branch: different preset, protocol or label.** A warning says the results are not directly
     comparable and why.
7. From either side the user can open the detail, or deselect to compare another pair.

## 7. Continuous Mode

1. The user selects the Continuous preset in Settings (or opens `?preset=continuous&test=upload`),
   choosing the one direction it runs (download by default; one direction per run is the current
   answer to an item in [../open-questions.md](../open-questions.md)).
2. The user starts the run. Idle latency runs first, then the chosen direction with the Standard
   ramp and no maximum.
3. Warm-up ends at the latest after 10 s of confirmed series. The screen then shows live min,
   average and max, "p90, last hour", loaded latency and data used.
4. Data-used notices appear at 1 GB, 10 GB, 100 GB and every further tenfold step.
   - **Branch: data cap reached.** The run ends with `data cap reached`.
   - **Branch: page hidden and the browser pauses the engine.** The run ends as in step 5:
     `complete` once the steady window had begun, `partial` during warm-up.
   - **Branch: upload over HTTP/1.1 with a failed request.** The run ends with
     `upload interrupted by a failed request` and the HTTP/2 hint; its status follows step 5.
   - **Branch: `duration` set.** The run ends after that duration.
5. The user presses Stop (or the run length elapses, the data cap is reached, or an HTTP/1.1
   upload request fails). If the steady window had begun, the result has status `complete`, not
   `partial`; any of these endings during warm-up gives `partial` ([../measurement.md
   §15](../measurement.md#15-continuous-mode)). The result is saved with the run-wide statistics
   and a series of at most 2000 points downsampled from the finest retention tier whose ring covers
   the whole run; the other tiers are only kept in memory while the run is on screen. A run longer
   than 7 days saves only its last 7 days, and the result detail says so.

## 8. Sharing

1. From a result (Test screen or Result detail), the user chooses Share.
2. A dialog shows the share image preview and lists exactly what it contains: download, upload,
   idle latency, loaded-latency increase, grade, date and time, server display name; the label only
   if the user ticks "include label". It never contains the client IP, the note or the server URL.
3. The user chooses one of:
   - **Download image:** the image (PNG, the current answer to an item in
     [../open-questions.md](../open-questions.md)) is rendered client-side and downloaded.
   - **Copy summary:** the same content as plain text to the clipboard.
     - **Branch: clipboard permission denied.** The text is shown selected for manual copy.
   - **Share** (where the Web Share API is available): the image is passed to the system share
     sheet.
4. Nothing is sent to the server or any third party.

## 9. Changing Settings

1. The user opens Settings. Fields show the effective values: stored settings over server
   defaults.
2. The user changes fields. Each field validates inline.
   - **Branch: invalid value.** Inline error; Save disabled until fixed.
   - **Branch: preset changed.** Duration fields reset to the preset's values unless they were
     customised, in which case the user is asked whether to keep them.
3. The Shareable URL updates as fields change.
4. The user saves; settings are stored in this browser and a confirmation toast appears.
   - **Branch: Discard.** Fields return to the stored values.
   - **Branch: Reset to defaults.** After confirmation, stored settings are removed and the server
     defaults apply.
5. The next run uses the saved settings, unless URL parameters on a page load override them for
   that load.

## Related

- [Screens](screens.md)
- [URL parameters](url-params.md)
- [Edge cases](../edge-cases.md)
- [Measurement methodology](../measurement.md)
