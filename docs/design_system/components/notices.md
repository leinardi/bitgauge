# Notices

Built on `.signal` (inline notice) and `.toast`. shadcn-vue: Alert. Spec:
`features/ui/screens.md` §7.

## Tones

| Tone | Triad | Use |
| --- | --- | --- |
| info | `--info-*` | slow link — test extended; WebSocket fallback; data used |
| warn | `--warn-*` | low confidence; data cap reached; URL parameter ignored; proxy buffering suspected |
| danger | `--danger-*` | server unreachable; upload interrupted; base path mismatch. Uses `role="alert"` |
| neutral | `--surface-3` | page was hidden; network changed |

## Anatomy

Icon (Lucide, tone colour) + title (`--text-sm` 600) + one-line explanation (`--fg-muted`) +
up to two actions ("Retry", "Change cap", "Try Extended", docs link).

## Rules

- **Never colour alone:** every notice has an icon and text.
- Live notices during a run are announced to screen readers when they appear.
- Groups (slow link, confidence, limits, settings, interrupted, connectivity, deployment) follow
  `features/ui/screens.md` §7; copy uses the exact notice strings.
- A WebSocket that can't be opened is **not** offline: info notice
  `WebSocket unavailable — HTTP latency fallback`, the test runs.
- Base path mismatch is a full-screen error naming the expected and actual path.
- Toasts (`vue-sonner`): "Summary copied.", "Image downloaded."; UndoToast "Result deleted." with
  Undo, delete commits when it expires.
