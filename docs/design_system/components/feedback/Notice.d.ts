/** Inline notice: tinted surface, icon, title, one line of detail, up to two actions. Danger uses role="alert". */
export interface NoticeProps {
  /** @default "info" */
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  icon?: string;
  title: React.ReactNode;
  /** Detail line. */
  children?: React.ReactNode;
  /** Up to two small Buttons. */
  actions?: React.ReactNode;
}
export declare function Notice(props: NoticeProps): JSX.Element;
