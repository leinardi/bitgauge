/**
 * FullScreenError — replaces the whole app when nothing can load (base path mismatch, edge-cases.md §20):
 * wordmark, danger eyebrow, state title (--type-state-title 26 / compact 22 px), description naming the
 * expected and actual path, facts (MetaList), a deployment hint card, and actions. role="alert".
 */
export interface FullScreenErrorProps {
  /** @default "Deployment error" */
  eyebrow?: string;
  title: React.ReactNode;
  /** Description; use <code className="ds-code"> for paths. */
  children?: React.ReactNode;
  /** e.g. <MetaList rows={…} /> */
  facts?: React.ReactNode;
  /** e.g. <Card title="How to fix it" icon="terminal">…</Card> */
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}
export declare function FullScreenError(props: FullScreenErrorProps): JSX.Element;
