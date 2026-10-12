/** Compact 28 px pressed/unpressed toggle; "on" tints green. */
export interface ToggleProps {
  pressed?: boolean;
  onChange?: (pressed: boolean) => void;
  icon?: string;
  children: React.ReactNode;
}
export declare function Toggle(props: ToggleProps): JSX.Element;
