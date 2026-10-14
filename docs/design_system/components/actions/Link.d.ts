/**
 * Link — standalone text action: "Edit", "View", "Why?", "Known browser limits", docs links.
 * --primary-text, --weight-semibold, no underline (underline on hover). Size inherits from the parent.
 * Running-text links inside a paragraph use a plain <a> (base.css colours) instead.
 */
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  /** Leading glyph, e.g. "sliders" for Edit. */
  icon?: string;
  /** Trailing external-link glyph (docs, source repository). */
  external?: boolean;
  children: React.ReactNode;
}
export declare function Link(props: LinkProps): JSX.Element;
