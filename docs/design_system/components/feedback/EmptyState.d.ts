/** Centred empty state: icon tile, title, one-line explanation, actions. */
export interface EmptyStateProps {
  /** @default "history" */
  icon?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
