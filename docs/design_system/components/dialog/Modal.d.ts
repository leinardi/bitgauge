/**
 * Modal — makes its element modal while `active`: the rest of the page is inert (siblings of the element and of each
 * ancestor; aria-hidden where `inert` is unsupported), focus moves inside, Tab / Shift+Tab wrap within it; on close both
 * are restored and focus returns to the invoking control. Dialog and Popover use the same behaviour (useModal).
 * Use it for custom dialogs only (e.g. History's full-screen mobile Compare); give it role, aria-modal and a label.
 * No visual of its own. Elements marked `data-modal-exempt` stay interactive (kit debug scaffolding only).
 */
export interface ModalProps {
  /** Element to render. @default "div" */
  as?: string;
  /** @default true */
  active?: boolean;
  /** Called on a click outside the element. */
  onOutside?: (e: MouseEvent) => void;
  children?: React.ReactNode;
  [attr: string]: unknown;
}
export declare function Modal(props: ModalProps): JSX.Element;
