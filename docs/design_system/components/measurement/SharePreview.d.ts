/**
 * SharePreview — the share image (share-panel.md "Share image layout"): 1200 × 630, always the dark theme. Laid out on
 * a fixed 480 × 252 box and scaled: fluid in the share panel, exact 1200 × 630 with size="full". Regions: header
 * (wordmark, optional label); middle band: number blocks (one grid row for every number, so they share a baseline;
 * each block's qualifiers stack below its number) and the grade (right, from the number row's top), centred as one
 * group between header and foot; foot (bottom-anchored, wraps upward).
 * Never shows the client IP, note, browser or server URL. role="img" with a summary label built from its content.
 * LastResult — the idle Test screen's "Last test 2 h ago · ↓ 612 · ↑ 438 Mbit/s · 3.1 ms · Home Wi-Fi  View" link.
 */
export interface ShareConfidence { level: 'normal' | 'low' | 'cpu-bound'; reasons?: Array<'ramp-unsettled' | 'insufficient-samples' | 'unstable'>; }
export interface ShareBlock {
  /** Sets label ("↓ DOWNLOAD") and series colour. */
  dir?: 'download' | 'upload';
  label?: string;
  color?: string;
  /** Formatted number ("612"); null or "—" shows "—" without a unit. */
  value?: string | null;
  unit?: string;
  /** Direction status (measurement §17). Anything but measured is shown as a qualifier. @default "measured" */
  status?: 'measured' | 'partial' | 'insufficient-data' | 'skipped' | 'error';
  /** Shown only when not normal, and only on a block with a number. */
  confidence?: ShareConfidence;
}
export interface ShareLoaded {
  /** "+39 ms" */
  increase: string;
  /** The direction the increase is from ("upload"). */
  dir?: string;
  /** Named unless websocket. */
  source?: 'websocket' | 'http-h2' | 'http-h3' | 'http-h1-reserved';
  /** loadedLatency.idleSource: the idle path, only when idle latency ran on the other path → "vs idle over WebSocket" / "vs idle over HTTP". */
  idleSource?: 'websocket' | 'http';
}
export interface SharePreviewProps {
  /** The result's label, only when "include label" is ticked. One line, ellipsis. */
  head?: string;
  /** In the run's phases order; a direction not in the phases has no block. */
  blocks: ShareBlock[];
  /** Bufferbloat grade letter; absent = no grade region. */
  grade?: string | null;
  /** bufferbloat.basis; a one-direction basis adds "download only" / "upload only". */
  basis?: 'download+upload' | 'download' | 'upload';
  /** Overhead compensation percent; non-zero adds "+p % overhead compensation" under every number. */
  overhead?: number;
  /** "3.1 ms" */
  idle?: string;
  /** "0.8 ms" */
  jitter?: string;
  loaded?: ShareLoaded | null;
  /** Extra foot items (legacy callers), after idle, jitter and loaded latency. */
  foot?: string[];
  /** Server display name; ellipsis past --share-server-max. */
  where?: string;
  /** Date and time ("Oct 8, 2026, 2:02 PM"); never truncated. */
  when?: string;
  /** "fluid" fills its container at 1200 / 630; "full" is the 1200 × 630 image. @default "fluid" */
  size?: 'fluid' | 'full';
  /** Accessible summary. @default built from the content */
  label?: string;
}
export declare function SharePreview(props: SharePreviewProps): JSX.Element;
export declare function shareQualifiers(block: ShareBlock, overhead?: number): Array<{ text: string; tone: '' | 'warn' | 'danger' }>;
export declare function shareLoaded(loaded?: ShareLoaded | null): string;
/** The copied text's lines, built from the same props as the image. */
export declare function shareSummary(props: SharePreviewProps): string[];
export declare function shareHasNumber(block: ShareBlock): boolean;
/** The same helpers on the namespace: window.<Namespace>.ShareFormat.summary(props) etc. */
export declare const ShareFormat: { summary: typeof shareSummary; qualifiers: typeof shareQualifiers; loaded: typeof shareLoaded; hasNumber: typeof shareHasNumber };
export interface LastResultProps { when: string; values: string; label?: string; href?: string; }
export declare function LastResult(props: LastResultProps): JSX.Element;
