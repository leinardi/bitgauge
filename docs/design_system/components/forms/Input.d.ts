/** Text input shell: 36 px (sm 28), optional leading icon, mono for numbers/URLs, inline error. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: string;
  /** IBM Plex Mono — numbers, IPs, URLs. */
  mono?: boolean;
  /** @default "md" */
  size?: 'sm' | 'md';
  invalid?: boolean;
  /** Inline error message under the field (implies invalid). */
  error?: React.ReactNode;
  label?: React.ReactNode;
}
export declare function Input(props: InputProps): JSX.Element;
