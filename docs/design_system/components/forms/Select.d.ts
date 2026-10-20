/** Select — combobox button in the Input shell (--input-h 36 px, sm 28 px) whose listbox opens on demand (Reka UI Select pattern), optional leading icon. Needs aria-label or aria-labelledby. `style` is for width / placement only.
 *  Keyboard: Enter / Space / ↑ / ↓ open; ↑ ↓ Home End move; Enter / Space pick; Esc closes; typing jumps to a label. */
export interface SelectOption { value: string; label: string; }
export interface SelectProps {
  options: Array<string | SelectOption>;
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value; the first option when omitted. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Native-style handler: receives { target: { value } }. */
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: string;
  /** @default "md" */
  size?: 'sm' | 'md';
  mono?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Select(props: SelectProps): JSX.Element;
