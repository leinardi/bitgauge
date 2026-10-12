/** Small hover/focus tooltip above its trigger. */
export interface TooltipProps {
  content: React.ReactNode;
  /** "end" anchors to the trigger's right edge. @default "center" */
  align?: 'center' | 'end';
  /** Force visible (for docs/previews). */
  open?: boolean;
  children: React.ReactNode;
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
