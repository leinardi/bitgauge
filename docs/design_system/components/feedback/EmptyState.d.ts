/** Centred empty state: icon tile, title, one-line explanation, actions. */
export interface EmptyStateProps {
  /** @default "history" */
  icon?: string;
  title: React.ReactNode;
  /** Title heading level (h1–h6, no visual change); 1 only when the empty state is the whole screen. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
