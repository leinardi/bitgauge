/**
 * SaveBar — result status after a run (contract: components/save-bar.md). v0.2 with history.
 * - "saved": complete run, "Saved to history" + label field with suggested labels + Share / Download JSON / Details.
 * - "unsaved": partial or error run, "Partial results are not saved" + Keep in history / Download JSON.
 * - "kept": after Keep in history, "Saved as partial" / "Saved as error" + Download JSON / Details (Undo lives in the toast).
 * - "complete": v0.1 (no history) — "Test complete", not stored; Download JSON only.
 * Label changes save as they are typed; there is no Save button.
 */
export interface SaveBarProps {
  /** @default "saved" */
  status?: 'saved' | 'unsaved' | 'kept' | 'complete';
  title: React.ReactNode;
  /** Mono time of the result, e.g. "14:02:11". */
  time?: string;
  /** One line of explanation, e.g. "Download the JSON to keep it." */
  message?: React.ReactNode;
  /** Inline label field (saved only). */
  label?: { value?: string; onChange?: (e: any) => void; placeholder?: string; suggestions?: string[]; onSuggest?: (label: string) => void };
  /** Small Buttons, right-aligned. */
  actions?: React.ReactNode;
}
export declare function SaveBar(props: SaveBarProps): JSX.Element;
