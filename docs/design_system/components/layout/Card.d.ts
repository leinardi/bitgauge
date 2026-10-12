/**
 * Card — surface-2, hairline border, 10 px radius; optional header row.
 * @startingPoint section="Layout" subtitle="Card with header, icon and actions" viewport="700x260"
 */
export interface CardProps {
  title?: React.ReactNode;
  /** Header glyph (fg-subtle). */
  icon?: string;
  /** Right-aligned header actions. */
  actions?: React.ReactNode;
  /** Wrap children in 16 px body padding. @default true */
  padded?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;
