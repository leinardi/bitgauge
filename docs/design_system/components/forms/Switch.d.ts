/** 42×24 on/off switch, teal when on. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}
export declare function Switch(props: SwitchProps): JSX.Element;
