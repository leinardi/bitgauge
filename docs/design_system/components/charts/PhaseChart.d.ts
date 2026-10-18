/**
 * PhaseChart — Result-detail per-phase chart card (charts.md): stored series with null gaps (never interpolated),
 * warm-up as a hatched, excluded interval (--chart-hatch), event chips (cancelled, cap, extended, lost), latency
 * under load dashed on its own axis, and the "Chart / Table" toggle — the table (children) is the text alternative.
 * The plot's aria-label is "<title> chart: <summary>" (`summary`, required: the data, without the title).
 */
export interface PhaseChartMark { t: number; label: string; icon: string; /** line colour */ c: string; /** chip border */ bd?: string; /** chip text */ fg?: string; }
export interface PhaseChartProps {
  title: string; icon: string; color: string; meta?: string;
  /** Title heading level; the chart is a region named by it. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  summary: string;
  /** [t s, value | null]; nulls are gaps. */
  pts: Array<[number, number | null]>;
  lat?: Array<[number, number | null]>;
  xMax: number; ms?: boolean; xStep?: number; xLabel?: (t: number) => string; units?: 'bits' | 'bytes';
  width: number; height?: number;
  warmup?: { t1: number; label: string } | null;
  marks?: PhaseChartMark[];
  gapLabel?: string;
  view?: 'chart' | 'table';
  onViewChange?: (v: 'chart' | 'table') => void;
  className?: string; style?: React.CSSProperties;
  /** Table view content. */
  children?: React.ReactNode;
}
export declare function PhaseChart(props: PhaseChartProps): JSX.Element;
