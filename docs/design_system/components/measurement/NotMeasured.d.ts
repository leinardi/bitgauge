/**
 * NotMeasured — the packet loss slot's value: dashed neutral StatusBadge "Not measured" + "Why?" Link to
 * measurement.md §18. Never a zero. The link's accessible name states the reason. Contract: tiles.md.
 */
export interface NotMeasuredProps {
  /** Docs link. */
  href?: string;
  /** @default "Browsers can't see packet loss over TCP" */
  reason?: string;
}
export declare function NotMeasured(props: NotMeasuredProps): JSX.Element;
