/** Text input shell: 36 px (sm 28), optional leading icon, mono for numbers/URLs, inline error. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: string;
  /** Unit after the value, in --fg-subtle ("s", "MB", "pings"). */
  suffix?: React.ReactNode;
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
/** Inline error under a field. Give it an id and point the input's aria-describedby at it. */
export interface FieldErrorProps { id?: string; children: React.ReactNode; style?: React.CSSProperties; }
export declare function FieldError(props: FieldErrorProps): JSX.Element;
