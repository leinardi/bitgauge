# QA areas and their standing checks

Four areas. Each lists what to cover and the **standing checks**: classes of bug that recur
wherever new code is added, re-checked every round. They are classes, not findings; the findings
themselves live in `docs/engineering/qa/`.

The screens are in [screens.md](../../../../docs/features/ui/screens.md), the flows in
[flows.md](../../../../docs/features/ui/flows.md). Use the demo scenario that holds a state rather
than racing a real run for it ([stacks.md](stacks.md)).

## Checks that apply to every area

- **Honest numbers:** every number carries its qualifiers (status other than measured, confidence
  other than normal, overhead compensation, the loaded-latency source), an unknown reads "—" or
  `insufficient data` and never 0, and units and precision follow
  [screens.md §6](../../../../docs/features/ui/screens.md#6-result-metrics-units-and-precision).
- **One reading:** a result reads the same on the Test screen, its Result detail, its History row,
  the compare dialog, the share text and image, and its Download JSON.
- **Saved or not:** a `complete` result is saved on its own; a `partial` or `error` one only through
  Keep in history; nothing is saved when nothing was measured. Check IndexedDB, not the list.
- **Notices:** each notice appears when its rule fires and not otherwise, with the tone of
  [screens.md §7](../../../../docs/features/ui/screens.md#7-notices), and never contradicts the
  state beside it.
- **Undo and confirmation:** a deletion offers its undo toast for its duration and the undo really
  restores; Clear all and Reset all ask first.
- **Not-found and error states:** an unknown result ID, an unknown route and an unreachable server
  each show their state with a way back.
- **Phone width:** no page scrolls sideways at 390 px, even with a 64-character label, every notice
  and every qualifier.
- **URL state:** filters, sort and tabs survive a reload where the spec says so, and an invalid
  value is corrected or named in `URL parameter ignored`.
- **Copy and locale:** no raw keys or enum codes, dates and numbers in the UI locale, US English.
- **Nothing leaves the origin:** `requests` lists only the page's own origin, for every screen and
  every action (share, export, About included).

## Test screen and a run

- First run: connection info against `GET /api/v1/info` (client IP, IP version, label, protocol),
  the settings summary and its absence before `/info` answers, the offline state and its retry
  schedule ([flows.md §1](../../../../docs/features/ui/flows.md#1-first-run)).
- A full run on loopback: the phase indicator, the gauge's window and caption, the chart's series
  and marks, data used, streams and the plateau reason, the result with its grade and notices, Run
  again, the Enter shortcut and Esc.
- Each demo scenario's state against the kit's: connecting, latency, download, upload, the
  WebSocket fallback and closes, insufficient, slow, the errors and the cancels at each instant,
  their stop and error notices word for word against
  [flows.md §4 and §5](../../../../docs/features/ui/flows.md#4-cancel-mid-test).
- Keep in history and Download JSON after a cancel and an error; nothing to keep when nothing was
  measured.
- Continuous ([flows.md §7](../../../../docs/features/ui/flows.md#7-continuous-mode)): the live view
  and its "—" before 3 known cells, data-used notices, the run length and end time, a stop during
  warm-up against one after it, what is saved.
- The live region's cadence and wording, reduced motion, the wake lock where supported.
- Auto-run from the URL: the countdown, cancelling it, a hidden page pausing it, `label` pre-filling
  the result ([flows.md §2](../../../../docs/features/ui/flows.md#2-auto-run-from-url)).

## Results, history and sharing

- Result detail: per-phase charts and their table, test parameters, label and note editing, the
  share panel, Download JSON, a Continuous result's series and its 7-day note, an unknown ID.
- History ([flows.md §6](../../../../docs/features/ui/flows.md#6-history-review-and-compare)): the
  list newest first, the per-origin notice, sort, filters, search, the trend chart following the
  filter, the empty, filtered-empty and unavailable states (a private window).
- Compare: the dialog's focus trap and Esc, "same" within ±2 % and 1 ms, grades by order, the
  not-comparable warning, copying the comparison as text.
- Delete one row, delete a selection, undo, Clear all with its count and Export JSON first.
- Import JSON: a valid export, an invalid file, one over 10 MB, a duplicate
  ([security.md §7](../../../../docs/features/security.md#7-browser-only-history-and-privacy)).
- Sharing ([flows.md §8](../../../../docs/features/ui/flows.md#8-sharing)): the preview matching the
  image and the text, every qualifier in both, the label only when ticked, never the IP, note,
  browser or server URL, the image's 1200 × 630 dark rendering in either theme, the clipboard's
  granted and denied branches, the dialog's focus returning to Share.

## Settings, URL parameters and About

- Settings ([flows.md §9](../../../../docs/features/ui/flows.md#9-changing-settings)): effective
  values over the server defaults (the `18084` stack), inline validation keeping the last valid
  value, a preset change keeping edited durations as "custom", the changed list and its resets,
  Reset all, the Shareable URL and the Test screen's summary following each change.
- Every URL parameter of [url-params.md §2](../../../../docs/features/ui/url-params.md#2-parameters)
  at a valid value, an invalid one (the notice's exact wording), and an edge (`duration` at 5 and
  600, Continuous's 60 and 604800, `streams` above `streams.max`, a 65-character `label`).
- Theme and language from the URL against stored settings, for that page load only.
- About: each compatibility layer's snippets present only when its toggle is on (the `18081`
  stack), each snippet's URL built from `public_url` or the page, copying, the privacy text.

## The server and the HTTP edge

Needs the real server; the demo simulates all of it ([stacks.md](stacks.md)).

- Every route of [wire-protocol.md §2](../../../../docs/features/wire-protocol.md#2-endpoint-table)
  with `curl`: methods, the error envelope on unknown `/api/*` routes and bad parameters, caps and
  clamps, `HEAD`, `Cache-Control`, no compression on `/api/v1` or `/metrics`.
- Security headers and the CSP on the SPA, the assets and the API
  ([security.md §5](../../../../docs/features/security.md#5-content-security-policy-and-security-headers)),
  a missing hashed asset, no directory listing.
- Rate limits on the `18083` stack: streams, requests per minute, WebSockets, the 429 with
  `Retry-After`, and what the Test screen says when it meets them.
- CORS: none on `/api/v1` by default, `allowed_origins` exact, `*` only on the compatibility layers
  ([security.md §6](../../../../docs/features/security.md#6-compatibility-layers-and-access-control-allow-origin-)).
- The compatibility layers on the `18081` stack: each route of
  [compatibility.md §5](../../../../docs/features/compatibility.md#5-route-table), off when its
  toggle is off, the LibreSpeed server list, the networkQuality config's absolute URLs.
- The base path on the `18082` stack, and the client IP and label through the trusted proxy.
- `/metrics` gated by its toggle, and its counters moving with a run; `healthcheck`.
- Fail-closed configuration: every bad value exits with status 2 and says why.
- The debug log over a full run: no body, header, WebSocket message or result in it; no outbound
  connection (`ss -tnp` for the server's PID shows only loopback peers).
