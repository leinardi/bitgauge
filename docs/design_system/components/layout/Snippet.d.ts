/**
 * Snippet — code / config block on --term-bg (dark in both themes) with an optional icon-only copy button.
 * Lines: plain text (--term-fg), `{ kind: 'comment' }` (--term-comment), `{ kind: 'command' }` (--term-command).
 * The copy button's aria-label names what it copies ("Copy bitgauge.json"). Never wraps: a long line
 * scrolls horizontally inside the block (focusable for keyboard scrolling); the page never scrolls sideways.
 */
export interface SnippetLine { t: string; kind?: 'comment' | 'command'; }
export interface SnippetProps {
  lines: Array<string | SnippetLine>;
  /** Caption above the block, e.g. "servers.json". */
  caption?: React.ReactNode;
  /** Accessible name of the copy button; omit for no button. */
  copyLabel?: string;
  onCopy?: () => void;
}
export declare function Snippet(props: SnippetProps): JSX.Element;
