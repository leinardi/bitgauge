/** Dot + condensed-caps status pill. "offline" = hollow amber dot (server unreachable). */
export interface StatusPillProps {
  /** @default "neutral" */
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'offline';
  children: React.ReactNode;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element;
