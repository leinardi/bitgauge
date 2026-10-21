/** Icon + condensed-caps result badge ("Complete", "Low confidence", quality bands). */
export interface StatusBadgeProps {
  /** @default "neutral" */
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  /** Override the tone's default glyph. */
  icon?: string;
  /** md 22 px · sm 20 px. @default "md" */
  size?: 'md' | 'sm';
  title?: string;
  children: React.ReactNode;
}
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
