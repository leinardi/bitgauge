/**
 * Card — surface-2, hairline border, 10 px radius, dark-theme top highlight; optional header row.
 * Visual definition: layout.css `.card`. `style` / `className` are for placement (grid-column, flex) only.
 * @startingPoint section="Layout" subtitle="Card with header, icon and actions" viewport="700x260"
 */
export interface CardProps {
  title?: React.ReactNode;
  /** Header glyph (fg-subtle). */
  icon?: string;
  /** Right-aligned header actions or tags. */
  actions?: React.ReactNode;
  /** Wrap children in 16 px body padding. @default true */
  padded?: boolean;
  /** Clip children to the radius. Turn off when a popup (menu, tooltip) must escape. @default true */
  clip?: boolean;
  /** Element, e.g. "section" for a region. A titled section with no `label` / `labelledBy` is named by its title heading. @default "div" */
  as?: string;
  /** Level of the title heading (rendered as h1–h6, no visual change). 3 inside a dialog or under an h2. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** aria-label (sections). */
  label?: string;
  labelledBy?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;
