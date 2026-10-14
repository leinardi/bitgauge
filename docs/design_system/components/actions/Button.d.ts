/**
 * Button — verb-first actions. One primary per view. Visual definition: components/actions/actions.css
 * (`.btn` + variant + size classes, heights from the --control-h-* tokens). Nothing else defines button looks.
 *
 * Accessibility contract (decided here, once):
 * - The accessible name is the label (or `aria-label` for icon-only). A keyboard hint (`kbd`) is NOT part of
 *   the name: it renders aria-hidden and is exposed as `aria-keyshortcuts`.
 * - `disabledReason` keeps the button focusable (`aria-disabled`) and links the reason with `aria-describedby`.
 * - `href` renders an `<a class="btn">` with the same looks (navigation styled as a button).
 * @startingPoint section="Actions" subtitle="Primary / secondary / ghost / danger buttons with icons" viewport="700x200"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "secondary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
  /** sm 28 · md 34 · lg 38 · xl 46 (Start/Stop) px — tokens --control-h-*. @default "md" */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Leading Lucide glyph name. */
  icon?: string;
  /** Trailing glyph, e.g. "chevron-right", "external-link". */
  iconAfter?: string;
  /** Square icon-only button (requires aria-label). */
  iconOnly?: boolean;
  /** Keyboard hint after the label, e.g. "Enter", "Esc". Decorative; sets aria-keyshortcuts. Desktop layouts only. */
  kbd?: string;
  /** Full width, centred content. */
  block?: boolean;
  /** Compact (touch) layout: at least 44 px tall; xl becomes 52 px. */
  touch?: boolean;
  /** Render as a link with button looks. */
  href?: string;
  disabled?: boolean;
  /** When disabled, keep it focusable (aria-disabled) and show this reason in a tooltip (aria-describedby). */
  disabledReason?: string;
  /** Tooltip anchor. @default "center" */
  tipAlign?: 'center' | 'end';
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
