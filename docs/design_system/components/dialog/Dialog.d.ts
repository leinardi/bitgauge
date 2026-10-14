/**
 * Modal dialog: --modal-w 452 px (wide 540), 14 px radius, icon tile, title, description, optional body,
 * scope note and sticky footer. Visual definition: dialog.css. Accessibility: role="dialog" (danger:
 * "alertdialog"), aria-modal, labelled by its title; Escape and the scrim call onClose; focus is trapped
 * and returned to the invoking control (production: Reka UI Dialog).
 */
export interface DialogProps {
  /** @default true */
  open?: boolean;
  /** Render in-flow without scrim (docs/previews). */
  inline?: boolean;
  /** Icon tile tone. Danger also sets role="alertdialog". @default "primary" */
  tone?: 'primary' | 'danger';
  icon?: string;
  title: React.ReactNode;
  /** Description; <b> renders mono. */
  children?: React.ReactNode;
  /** Content under the description (share previews, compare table). */
  body?: React.ReactNode;
  /** Reassurance note in a sub-panel, e.g. "Exported JSON is kept." */
  scope?: React.ReactNode;
  /** Buttons, right-aligned. */
  footer?: React.ReactNode;
  /** Narrow layout: footer buttons stack full width, primary on top. */
  footerStack?: boolean;
  wide?: boolean;
  /** md 452 · wide 540 · xl 760 px (compare). Overrides `wide`. */
  size?: 'md' | 'wide' | 'xl';
  /** Body without side padding (full-bleed tables), separated by a hairline. */
  flush?: boolean;
  /** Close handler; also renders the header's icon-only close button. */
  onClose?: () => void;
  /** @default "Close" */
  closeLabel?: string;
  /** Vertical placement. @default "center" */
  align?: 'center' | 'top';
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
