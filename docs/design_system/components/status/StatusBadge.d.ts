/** Icon + condensed-caps result badge ("Complete", "Low confidence", "Not measured"). */
export interface StatusBadgeProps {
  /** @default "neutral" */
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  /** Override the tone's default glyph. */
  icon?: string;
  /** Dashed outline — used for "Not measured". */
  dashed?: boolean;
  children: React.ReactNode;
}
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
