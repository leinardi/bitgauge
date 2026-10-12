# Save bar

Card + Input + ToggleGroup. v0.2 (with history). Spec: `features/ui/screens.md` §1,
`features/ui/flows.md` §4.

## Complete run

- "Saved to history" confirmation (`circle-check`, `--ok`).
- Inline label field with suggested label chips (`.chip`; the context label plus recent labels from
  history).
- Actions: Share (opens the share dialog, `flows.md` §8), Details (Result detail).

## Partial or error run

With at least one finished phase: **not saved** unless the user chooses "Keep in history".
Download JSON is offered either way.

## Rules

- Label changes save as they are typed; no Save button.
- Before v0.2 there is no save bar: the only result action is Download JSON, and the layout must
  read as complete without it.
- Mobile: actions wrap below the field; targets ≥ 44 px.
