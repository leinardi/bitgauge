/** 380 px toast confirming an action; optional Undo action and dismiss button. role="status", polite. */
export interface ToastProps {
  /** @default "ok" */
  tone?: 'ok' | 'info' | 'warn' | 'danger';
  icon?: string;
  /** Short sentence ending in a period: "Summary copied." */
  title: React.ReactNode;
  message?: React.ReactNode;
  /** e.g. <Button size="sm" icon="undo-2">Undo</Button> */
  action?: React.ReactNode;
  /** Renders the ghost "Dismiss" icon button. */
  onDismiss?: () => void;
  /** Slide-in on mount. @default true */
  animate?: boolean;
}
export declare function Toast(props: ToastProps): JSX.Element;
/** Sticky bottom-right slot for one toast; lifts above the mobile TabBar. */
export interface ToastRegionProps { aboveTabBar?: boolean; children?: React.ReactNode; }
export declare function ToastRegion(props: ToastRegionProps): JSX.Element | null;
