/**
 * LoadCard — bufferbloat grade (letter + words + A+–F strip), loaded latency per direction with the change vs
 * idle, and HTTP loaded responsiveness (RPM) under its fixed, untranslatable-as-a-whole label
 * "HTTP loaded responsiveness — connection sharing not verifiable". Omit `responsiveness` to leave the RPM part
 * out entirely. Contract: components/tiles.md.
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
export interface ResponsivenessDir { dir: 'download' | 'upload'; value?: string | null; text?: string; uncertain?: boolean;
  /** Result detail only: TM95 and the samples ("TM95 42.3 ms · 13 samples · TM95 equals the plain mean"). */
  detail?: string; }
export interface LoadCardProps {
  /** null = not graded yet. */
  grade?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | null;
  /** Words under the strip. Default: the grade's words ("Mild bufferbloat") or "Graded after upload". */
  gradeText?: string;
  /** The run has ended (complete, stopped or failed). With no grade the letter reads "Bufferbloat not graded"
   *  instead of "Bufferbloat grade pending". Default false. */
  ended?: boolean;
  /** Which directions the grade rests on, under the words: "Basis: download only". */
  basis?: string;
  rows: LoadRow[];
  /** RPM part. Absent = not rendered. */
  responsiveness?: { protocol?: string; note?: string; tag?: string; dirs: ResponsivenessDir[] };
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function LoadCard(props: LoadCardProps): JSX.Element;
export interface GradeBadgeProps { grade?: string | null; text?: string; ended?: boolean; }
export declare function GradeBadge(props: GradeBadgeProps): JSX.Element;
export declare const GRADES: Record<string, { tone: 'ok' | 'warn' | 'danger'; text: string }>;
