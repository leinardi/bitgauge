/** Underline tabs: 36 px, teal 2 px active underline. */
export interface TabItem { value: string; label: React.ReactNode; icon?: string; }
export interface TabsProps {
  tabs: Array<string | TabItem>;
  value: string;
  onChange?: (value: string) => void;
}
export declare function Tabs(props: TabsProps): JSX.Element;
