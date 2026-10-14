# Notices

Component `Notice` (`.signal`, `components/feedback/`) and `Toast`. shadcn-vue: Alert. Spec:
`features/ui/screens.md` §7. Screens never build a notice box of their own.

## Tones

| Tone | Surface | Use (screens.md §7) |
| --- | --- | --- |
| info | `--info-bg` / `-border`, icon `--info` | test extended; server stream limit; overhead compensation; browser upload limit; WebSocket reopened; WebSocket unavailable — HTTP latency fallback; data used |
| warn | `--warn-*` | low confidence; cpu-bound; data cap reached; insufficient data; URL parameter ignored; proxy buffering suspected; response compression detected; timer throttling detected |
| danger | `--danger-*`, `role="alert"` | server unreachable; upload interrupted; base path mismatch; also the Error state's message (not a notice) |
| neutral | `--surface-3` / `--border-default`, icon `--fg-subtle` | partial — stopped early; server restarted; network changed; page was hidden |
| ok | `--ok-*` | kit-level confirmations only (import result); not a spec notice tone |

## Anatomy

Tone icon (Lucide 16 px) + title (`--text-sm` 600, `--fg`) + one-line explanation (`--text-caption`,
`--fg-muted`) + up to two actions, right-aligned, wrapping under the text on narrow layouts: small
Buttons ("Retry", "Change cap", "Try Extended", "Export JSON", icon-only "Dismiss") or a Link
(docs, external).

## Rules

- **Never colour alone:** every notice has an icon and text.
- **Announcement:** danger is `role="alert"`; every other tone is `role="status"`, so live notices are
  announced when they appear during a run. Static lists (Result detail confidence card, History's origin
  note) pass `live={false}`.
- Groups (duration, confidence, limits, settings, interrupted, connectivity, deployment) follow
  `features/ui/screens.md` §7; copy uses the exact notice strings.
- **Duration — Test extended:** one notice per run, not per direction. The engine reports the
  extension per direction; the UI merges them:
  - download only: "Download had no steady window at its minimum duration, so it was extended up
    to its maximum." (upload only: the same with "Upload");
  - both: "Neither download nor upload had a steady window at its minimum duration, so both were
    extended up to their maximum."
  - Live, it appears during the download when that extends; if the upload then extends too the
    same notice changes to the both-directions wording. A second notice is never added.
- **Confidence — `{browser} may limit the upload`** (info, globe icon): "On fast links
  {browser}'s own upload path, not the network, can bound the upload number; the measurement is
  the server's and stands. Compare with another browser on this device to tell the two apart."
  `{browser}` is the family name (Firefox, Chrome, Safari, Edge). One action: the "Known browser
  limits" docs Link (external). Shown on a complete result (Test screen and Result detail) when the
  engine saw the browser pause between upload requests, in any browser, and always for Firefox at
  ≥ 100 Mbit/s upload. Never during a run.
- A WebSocket that can't be opened is **not** offline: info notice
  `WebSocket unavailable — HTTP latency fallback`, the test runs.
- **Error state message** (what failed and in which phase, e.g. "Connection to <server> lost — 3 requests in a row
  failed during download") is not one of the §7 notices but uses the same **danger** surface with `role="alert"`
  (`Notice tone="danger"`), whatever the cause. When the cause is itself a §7 notice — server restarted, network
  changed — that notice is shown as well, in its own tone (neutral).
- `cpu-bound` ("Limited by this device's CPU") is a confidence reason: warn, like low confidence.
- Base path mismatch is the `FullScreenError` component naming the expected and actual path.
- Toasts (`vue-sonner`): "Summary copied.", "Image downloaded."; UndoToast "Result deleted." with
  Undo, delete commits when it expires. `Toast` sits in a `ToastRegion` (above the TabBar on narrow
  layouts) and is `role="status"`.
