/**
 * QualityList — Streaming, Gaming, Video calls → Great / Good / Average / Poor / Bad (AIM bands), each as a
 * StatusBadge with icon and band name, plus the fixed note "Upper bound: packet loss is not measured".
 * A band that can't be computed names the missing input ("needs loaded latency"). Contract: tiles.md.
 */
export interface QualityListProps {
  /** Bands in the order streaming, gaming, video calls; null where not computed. */
  bands?: Array<'Great' | 'Good' | 'Average' | 'Poor' | 'Bad' | null>;
  /** Text per row (or one for all) when a band is missing, e.g. "needs download". */
  missing?: string | string[];
  /** Basis tag when only one direction has a loaded-latency increase: "download only". */
  basis?: string;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function QualityList(props: QualityListProps): JSX.Element;
export declare const QUALITY: Record<string, { tone: 'ok' | 'warn' | 'danger'; icon: string }>;
