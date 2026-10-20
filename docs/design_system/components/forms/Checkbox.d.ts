/** Checkbox — role="checkbox" button with a 16 px box (teal when checked); optional series-coloured glyph before the label. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  icon?: string;
  iconColor?: string;
  /** sm: caption-size label (option lines under a field). @default "md" */
  size?: 'md' | 'sm';
  children: React.ReactNode;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
/** ChoiceCard — a card-style radio (preset picker): icon, title, optional badge, radio dot, mono description. Space / Enter select. */
export interface ChoiceCardProps { selected?: boolean; icon?: string; title: React.ReactNode; badge?: React.ReactNode; children?: React.ReactNode; onSelect?: () => void; /** Shown but not selectable; the reason is its tooltip ("Needs a server connection"). */ disabledReason?: string; }
export declare function ChoiceCard(props: ChoiceCardProps): JSX.Element;
