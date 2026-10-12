/** Modal dialog: 452 px (wide 540), 14 px radius, icon tile, title, description, optional scope note, sticky footer. */
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
  /** Reassurance note in a sub-panel, e.g. "Exported JSON is kept." */
  scope?: React.ReactNode;
  /** Buttons, right-aligned. */
  footer?: React.ReactNode;
  wide?: boolean;
  onClose?: () => void;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
