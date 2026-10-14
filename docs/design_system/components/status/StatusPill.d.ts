/** Dot + condensed-caps status pill. "offline" = hollow amber dot (server unreachable). The label carries the meaning. */
export interface StatusPillProps {
  /** @default "neutral" */
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'offline';
  /** md 22 px · sm 20 px (tile tags, card-header tags). @default "md" */
  size?: 'md' | 'sm';
  /** Leading status dot. Off for plain category tags ("CLI", "Web UI"). @default true */
  dot?: boolean;
  /** Transparent, dashed outline — a state that is absent or unconfirmed ("Off", "Not confirmed"). */
  dashed?: boolean;
  children: React.ReactNode;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element;
