/** Select — native <select> in the Input shell (--input-h 36 px, sm 28 px), optional leading icon. Needs aria-label or a label. `style` is for width / placement only. */
export interface SelectOption { value: string; label: string; }
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: Array<string | SelectOption>;
  icon?: string;
  /** @default "md" */
  size?: 'sm' | 'md';
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Select(props: SelectProps): JSX.Element;
