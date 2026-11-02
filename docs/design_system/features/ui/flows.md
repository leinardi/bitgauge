# Flows

[Feature index](../README.md) / [UI](README.md) / Flows

The nine user flows as numbered steps, with branches. Screens are in [screens.md](screens.md); the
rules behind each step are in [../measurement.md](../measurement.md) and
[../edge-cases.md](../edge-cases.md).

## 1. First Run

1. The user opens the BitGauge URL. The SPA loads and calls `GET /api/v1/info`.
   - **Branch: `/info` fails.** Test screen in the offline state: "Server unreachable", Retry
     (step 1 again). Start is disabled. The SPA asks again on its own after 2, 4, 8 and 16 s, then
     every 30 s, counting only while the page is visible, and says when the next check is; Retry
     asks at once and starts that schedule over.
   - **Branch: base path mismatch.** Full-screen error with the deployment hint; nothing else loads.
2. The Test screen shows the server name, connection info (client IP, suggested label, protocol)
   and the preset from the server defaults. No settings exist yet in this browser, so the server
   defaults apply.
3. The user presses Start.
4. The engine runs info → idle latency → download → upload; the phase indicator, gauge, chart and
   data used update live.
5. The result appears with its notices; a `complete` result is saved to history automatically
   (`partial` and `error` results only when the user keeps them, flows 4 and 5).
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
5. The phase extends past its nominal duration: the `test extended` notice appears live.
   - **Branch: the window condition is met.** Download reports a number.
   - **Branch: the maximum is reached without it.** Download shows `insufficient data` ("no steady
     window within the 20 s max"), data used, and "Try Extended"; upload still runs.
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
   - An interrupted idle latency keeps its samples so far when at least 5 succeeded
     ([../measurement.md §10](../measurement.md#10-idle-latency)); download and upload are then
     skipped.
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
4. The Test screen shows the Cancelled state: the partial result labeled `partial — stopped early`
   with what was covered ("based on a 3.6 s steady window · 21 requests" on upload). Whether an
   interrupted direction has a number depends on its confirmed steady window, never on the
   elapsed phase time: a stop before warm-up ends gives "insufficient data — confirmed steady
   window shorter than 3 s". The stop notice says what happened, from the result: it is titled
   "Test cancelled during <phase>", or "Partial — stopped early · upload based on a 3.6 s steady
   window" for an upload with a number; its body names the phases that completed, where the
   stopped direction stopped and why it has or has no value, and the phases that did not run:
   "Latency and download completed. Upload stopped at 14.0 s; in-flight requests were aborted,
   and the 21 requests confirmed by 13.1 s give the partial value.", "Latency completed. Download
   stopped before a 3 s steady window, so it has no value. Upload did not run." When the stopped
   direction had no latency probe, because the WebSocket closed and its reopening was never
   answered (its loaded latency is `no-probe-path`), the body says so before where it stopped: "The
   WebSocket closed and its reopening was never answered, so no latency probe could be sent during
   the upload." The upload's times are on its phase timeline from P_start, as its chart and events
   are. A stop during idle
   latency that keeps its samples gets the stop notice too, though no direction stopped and the
   result carries no `stopped-early` notice for it: titled "Test cancelled during latency", its
   body counts the pings sent and the warm-up ping and names the phases that did not run:
   "Stopped after 12 of 20 pings. The first is a warm-up sample, so idle latency and jitter come
   from the other 11; download and upload did not run."
5. The partial result is **not** saved automatically. The screen offers **Keep in history**, which
   saves it with status `partial` (with an undo toast), and Download JSON. Its Result detail,
   while it is not saved, offers the same Keep in history and undo
   ([screens.md §2](screens.md#2-result-detail--resultid)), so viewing the details does not
   discard it.
   - **Branch: the user leaves or runs again without keeping it.** The result is discarded.
   - **Branch: nothing was measured yet** (stopped during info, or during idle latency with
     fewer than 5 successful samples). No result exists to keep; the screen returns to exactly
     the first run's Idle, with no bufferbloat card and every step pending, and the polite live
     region says "Test stopped; nothing was measured."
     ([i18n-a11y.md §2.1](i18n-a11y.md#21-live-region-for-the-gauge)).

## 5. Error Mid-Test

1. During a run, something fails: three consecutive failed requests, a network change, a server
   restart, or the server becoming unreachable. (A single upload failure over HTTP/1.1 is not an
   error: it ends only the upload phase, flow 1 step 5.)
2. The engine stops and emits an `error` event with the phase and whether partial results exist.
   - **Branch: server restarted** (new epoch): `server restarted`; the current phase reports
     nothing.
   - **Branch: network changed:** `network changed`. The page checks `GET /info` again, as after
     `server unreachable`, so the header shows whether the server still answers.
   - **Branch: server rate limit:** the last of the three consecutive failures was a rate-limit
     `429` ([../measurement.md §4](../measurement.md#4-adaptive-stream-count)): `rate-limited` for
     the per-minute limit, `server-busy` when the server was tracking too many clients. The alert
     names only that known cause, never all three failures: "Basement NAS rate-limited a request
     during download; the test stopped after 3 consecutive request failures." and "Basement NAS
     was busy and refused a request during download; the test stopped after 3 consecutive request
     failures." Its body is the same as for the other causes ("Download stopped at 2.3 s. Latency
     finished before the error.").
   - **Branch: server unreachable:** `server unreachable` with Retry. That is the server not
     answering as the run starts, or losing every idle-latency ping; a server that stops answering
     mid-run also closes the WebSocket, which ends the run as `network changed`
     ([../edge-cases.md §6](../edge-cases.md#6-network-change-mid-test), step 3) unless three
     requests have failed first.
   - **Branch: the engine itself fails** (a defect, reported as the Worker's uncaught error,
     [../architecture.md §4](../architecture.md#4-engine--ui-message-contract)): `test failed` —
     "The test stopped because of an internal error"; no phase is named and no result exists, so
     nothing can be kept.
3. The Test screen shows the Error state: what failed, in which phase, the completed phases'
   results, and Retry. Its alert names the server and the cause, where the phase stopped and what
   finished before it: "Connection to Basement NAS lost — 3 requests in a row failed during
   download", "Download stopped at 6.4 s. Latency finished before the error."; with no phase
   finished, "Connection to Basement NAS lost — the network changed", "The test stopped at 1.2 s,
   during latency. No phase finished." The causes read "3 requests in a row failed", "the network
   changed", "the server restarted" and "server stopped responding"; a failure while connecting
   says the test stopped while connecting. The two rate-limit causes replace the "Connection to …
   lost" headline with their own sentence: "Basement NAS rate-limited a request during download;
   the test stopped after 3 consecutive request failures." and "Basement NAS was busy and refused a
   request during download; the test stopped after 3 consecutive request failures."
4. If any phase completed, the screen offers **Keep in history**, which saves the result with
   status `error`, and Download JSON; nothing is saved unless the user keeps it. If no phase
   completed, there is nothing to keep.
5. Retry starts a new run with the same settings (flow 1, step 3).

## 6. History Review and Compare

1. The user opens History.
   - **Branch: history unavailable.** The unavailable state with an explanation.
   - **Branch: empty.** "No results yet" with Start a test and Import JSON.
2. The list shows results for this origin, newest first, with the per-origin notice.
3. The user sorts, filters by label, context label and date range, or searches labels and notes;
   the trend chart follows the filter.
   - **Branch: no match.** The filtered-empty state with Clear filters.
4. The user opens a row: Result detail (flow ends there, or Back returns to the list with the
   filter kept).
5. To compare, the user selects two rows and chooses Compare.
6. The compare view, a focus-trapped dialog, shows both results side by side with differences per
   metric and both parameter sets: rates within ±2 % and latencies within 1 ms read "same", grades
   compare by order, and a value absent on either side is not comparable
   ([screens.md §3](screens.md#3-history--history)).
   - **Branch: different preset, protocol or label.** A warning says the results are not directly
     comparable and why.
7. From either side the user can open the detail, copy the comparison as text, or deselect to
   compare another pair.
8. To delete, the user deletes a row from its action menu or the selected rows from the selection
   bar. The rows disappear at once and an undo toast restores them for 8 s; Clear all instead asks
   for confirmation, names the count and offers Export JSON first, and cannot be undone.

## 7. Continuous Mode

1. The user selects the Continuous preset in Settings, choosing the one direction it runs (download
   by default) and an optional run length, or opens `?preset=continuous&test=upload&duration=3600`
   ([url-params.md §2](url-params.md#2-parameters)).
2. The user starts the run. Idle latency runs first unless the phases leave it out, then the chosen
   direction with the Standard ramp and no maximum.
3. Warm-up ends at the latest after 10 s of confirmed series. The screen then shows the
   Continuous live view ([screens.md §1](screens.md#1-test-home--)): live min, average and max,
   "p90, last hour", loaded latency over the last minute, data used with its rate, and the elapsed
   time against the run length with its end time when a run length is set. The rates read "—"
   until the run has 3 fully known 1 s cells. The grade, the HTTP loaded responsiveness and the
   quality scores wait for the finished result.
4. Data-used notices appear at 1 GB, 10 GB, 100 GB and every further tenfold step, with the info
   tone. The live view shows only the latest, naming the next threshold; the finished result lists
   every one.
   - **Branch: data cap reached.** The run ends with `data cap reached`; its status follows step 5.
   - **Branch: page hidden and the browser pauses the engine.** The run ends; its status follows
     step 5.
   - **Branch: upload over HTTP/1.1 with a failed request.** The run ends with
     `upload interrupted by a failed request` and the HTTP/2 hint; its status follows step 5.
   - **Branch: run length set.** The run ends once the run length has elapsed since its direction
     began; its status follows step 5.
5. The user presses Stop (or one of the endings of step 4 happens). The outcome depends only on
   what was measured ([../measurement.md §15](../measurement.md#15-continuous-mode)):
   - **At least 3 fully known 1 s cells since the steady start:** the result has status
     `complete`, not `partial`, and is saved automatically with the run-wide statistics, the grade,
     the HTTP loaded responsiveness, the quality scores and a series of at most 2000 points
     downsampled from the finest retention tier whose ring covers the run since the steady start;
     the other tiers are only kept in memory while the run is on screen. A run longer than 7 days
     saves only its last 7 days, and the result detail says so.
   - **Fewer, a stop right after warm-up or during it included:** the result is `partial` with the
     direction `insufficient-data`. As in flow 4 step 5: not saved unless the user chooses Keep in
     history; Download JSON is offered.

## 8. Sharing

1. On the Result detail the share panel is always visible; on the Test screen the user chooses
   Share, which opens the same panel as a focus-trapped dialog, closed by Escape with the focus back
   on Share.
2. The panel previews the share image and the copied text and so shows exactly what they contain:
   download, upload, idle latency, jitter, loaded-latency increase, grade, date and time, server
   display name, each number with its qualifier (a status other than measured, a confidence other
   than normal, a non-zero overhead compensation, a loaded-latency source other than the
   WebSocket, an increase over idle latency measured on the other path); the label only if the
   user ticks "include label" (off by default). They never contain the client IP, the note, the
   browser or the server URL. The image is 1200 × 630 in the dark theme whatever the page's theme;
   the copied text is the same lines in the page's language.
3. The user chooses one of:
   - **Download image:** the PNG image is rendered client-side and downloaded.
   - **Copy summary:** the same content as plain text to the clipboard.
     - **Branch: clipboard permission denied.** The text is shown selected for manual copy.
   - **Share** (where the Web Share API is available): the image is passed to the system share
     sheet.
4. Nothing is sent to the server or any third party.

## 9. Changing Settings

1. The user opens Settings. Fields show the effective values: URL parameters over stored settings
   over server defaults ([url-params.md §1](url-params.md#1-rules)). Settings that differ from the server
   defaults are marked and listed with their defaults.
2. The user changes fields. Each field validates inline, and each valid change is stored in this
   browser at once; there is no Save or Discard step.
   - **Branch: invalid value.** Inline error on the field; the value is not stored and the
     previous valid value stays in effect.
   - **Branch: preset changed.** Duration fields take the preset's values unless they were
     edited: edited durations are kept as they are, marked "custom", with no question, and their
     reset in the changed list returns them to the preset's.
3. The settings summary on the Test screen and the Shareable URL update as fields change.
4. The user may reset any single setting to its default.
   - **Branch: Reset all to defaults.** After confirmation, stored settings are removed and the
     server defaults apply.
5. The next run uses the stored settings, unless URL parameters on a page load override them for
   that load.

## Related

- [Screens](screens.md)
- [URL parameters](url-params.md)
- [Edge cases](../edge-cases.md)
- [Measurement methodology](../measurement.md)
