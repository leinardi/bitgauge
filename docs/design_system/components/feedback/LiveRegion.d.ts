/**
 * LiveRegion — visually hidden polite live region. Contract (gauge.md, notices.md):
 * - Exactly one per screen, rendered by the screen as a direct child of <main> (never inside the gauge,
 *   a card or the header). The header's server-status announcements are AppHeader's own.
 * - The Test screen announces: each phase change, the current rate at most once every 5 s while running,
 *   each direction's headline once when it finishes, and the result summary (i18n-a11y.md §2.1, §2.7).
 * - The gauge readout itself is never live.
 */
export interface LiveRegionProps {
  /** Text to announce; changing it announces it. */
  message?: string;
  /** role="alert" / assertive — only for errors that stop a run. @default false */
  assertive?: boolean;
}
export declare function LiveRegion(props: LiveRegionProps): JSX.Element;
