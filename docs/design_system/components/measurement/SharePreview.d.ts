/**
 * SharePreview — the share image preview (share-panel.md): 1200×630 aspect, always the dark theme, wordmark,
 * optional label (only when "include label" is ticked), headline blocks, footer facts, server name + date.
 * Never shows the client IP, note or server URL. role="img" with a summary label.
 * LastResult — the idle Test screen's "Last test 2 h ago · ↓ 612 · ↑ 438 Mbit/s · 3.1 ms · Home Wi-Fi  View" link.
 */
export interface ShareBlock { label: string; value: string; unit: string; /** Series colour. */ color: string; }
export interface SharePreviewProps {
  /** Label shown top-right (empty unless included). */
  head?: string;
  blocks: ShareBlock[];
  /** Bufferbloat grade letter, shown as a small grade tile with its words. */
  grade?: string | null;
  foot?: string[];
  /** "Basement NAS · 12 Oct 2026 14:02" */
  where?: string;
  /** Accessible summary. @default "Share image preview" */
  label?: string;
}
export declare function SharePreview(props: SharePreviewProps): JSX.Element;
export interface LastResultProps { when: string; values: string; label?: string; href?: string; }
export declare function LastResult(props: LastResultProps): JSX.Element;
