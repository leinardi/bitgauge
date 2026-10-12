/** 380 px toast confirming an action; optional Undo action. */
export interface ToastProps {
  /** @default "ok" */
  tone?: 'ok' | 'info' | 'warn' | 'danger';
  icon?: string;
  /** Short sentence ending in a period: "Summary copied." */
  title: React.ReactNode;
  message?: React.ReactNode;
  /** e.g. <Button variant="ghost" size="sm">Undo</Button> */
  action?: React.ReactNode;
  /** Slide-in on mount. @default true */
  animate?: boolean;
}
export declare function Toast(props: ToastProps): JSX.Element;
