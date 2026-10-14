/** Icon + condensed-caps result badge ("Complete", "Low confidence", "Not measured", quality bands). */
export interface StatusBadgeProps {
  /** @default "neutral" */
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  /** Override the tone's default glyph. */
  icon?: string;
  /** Dashed outline, transparent fill — used for "Not measured". */
  dashed?: boolean;
  /** md 22 px · sm 20 px. @default "md" */
  size?: 'md' | 'sm';
  title?: string;
  children: React.ReactNode;
}
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
