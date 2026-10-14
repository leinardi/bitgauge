/**
 * LoadCard — bufferbloat grade (letter + words + A+–F strip), loaded latency per direction with the change vs
 * idle, and HTTP loaded responsiveness (RPM) under its fixed, untranslatable-as-a-whole label
 * "HTTP loaded responsiveness — connection sharing not verifiable". Contract: components/tiles.md.
 * GradeBadge — the letter tile alone. The letter is the signal; colour follows --grade-*.
 */
export interface LoadRow {
  dir: 'download' | 'upload';
  /** "During download · WebSocket" */
  label: string;
  /** "p90 24 · +15 ms vs idle", "Pending", "Not run" */
  sub?: string;
  /** Formatted ms, or null / "—" when there is none. */
  value?: string | null;
  /** Live value (--primary-text). */
  live?: boolean;
}
export interface ResponsivenessDir { dir: 'download' | 'upload'; value?: string | null; text?: string; uncertain?: boolean; }
export interface LoadCardProps {
  /** null = not graded yet. */
  grade?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | null;
  /** Words under the strip. Default: the grade's words ("Mild bufferbloat") or "Graded after upload". */
  gradeText?: string;
  rows: LoadRow[];
  responsiveness?: { protocol?: string; note?: string; tag?: string; dirs: ResponsivenessDir[] };
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function LoadCard(props: LoadCardProps): JSX.Element;
export interface GradeBadgeProps { grade?: string | null; text?: string; }
export declare function GradeBadge(props: GradeBadgeProps): JSX.Element;
export declare const GRADES: Record<string, { tone: 'ok' | 'warn' | 'danger'; text: string }>;
