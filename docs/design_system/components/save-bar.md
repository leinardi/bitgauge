# Save bar

Component `SaveBar` (`components/feedback/`; Card + Input + Chip). Spec:
`features/ui/screens.md` §1, `features/ui/flows.md` §4. Statuses: `saved`, `unsaved` (partial / error,
Keep in history offered), `kept` (after Keep in history), `complete` (a run not stored: "Test complete",
Download JSON only). The Download JSON action carries the tooltip "Contains your IP address and notes".

## Complete run

- "Saved to history" confirmation (`circle-check`, `--ok`).
- Inline label field with suggested label chips (`.chip`; the context label plus recent labels from
  history).
- Actions: Share (opens the share dialog, `flows.md` §8), Details (Result detail).

## Partial or error run

With at least one finished phase: **not saved** unless the user chooses "Keep in history".
Download JSON is offered either way.

After "Keep in history" the bar confirms with the result's status, and **Undo lives in an undo
toast**, not in the bar (the same UndoToast as Delete, `flows.md` §4):

- Partial run: bar "Saved as partial" + Download JSON + Details; toast "Kept in history as
  partial." with **Undo**.
- Error run: bar "Saved as error" + Download JSON + Details; toast "Kept in history as error."
  with **Undo**.

Undo in the toast removes the result from history again, returns the bar to its "Keep in history"
state and confirms with a plain toast ("Removed from history."). When the toast expires or is
dismissed, the result stays kept.

## Rules

- Label changes save as they are typed; no Save button.
- Mobile: actions wrap below the field; targets ≥ 44 px.
