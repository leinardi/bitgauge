/**
 * NotMeasured — the packet loss slot's value: dashed neutral StatusBadge "Not measured" + "Why?" Link to
 * measurement.md §18. Never a zero. The link's accessible name states the reason. The slot also shows the
 * reason as visible text: in a MetaList row, pass `link={false}` here and put the reason plus <NotMeasuredWhy />
 * in the row's `sub`, so the line reads "Browsers can't see packet loss over TCP  Why?". Contract: tiles.md.
 */
export interface NotMeasuredProps {
  /** Docs link. */
  href?: string;
  /** @default NOT_MEASURED_REASON */
  reason?: string;
  /** Render the "Why?" link after the badge. Turn off when NotMeasuredWhy sits after the visible reason. @default true */
  link?: boolean;
}
/** "Browsers can't see packet loss over TCP" — the visible reason line under the "Packet loss" label. */
export declare const NOT_MEASURED_REASON: string;
export declare function NotMeasured(props: NotMeasuredProps): JSX.Element;
/** The "Why?" link on its own (same name and tooltip as in NotMeasured). */
export declare function NotMeasuredWhy(props: { href?: string; reason?: string }): JSX.Element;
