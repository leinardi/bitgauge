/**
 * PhaseStep — one step of the phase indicator: state icon, phase name, mono "state · detail", 4 px bar.
 * PhaseIndicator — the `<ol aria-label="Test phases">` of 1–3 steps in configured order.
 * Contract: components/phase-indicator.md. The meta line is always "<state>[ · <detail>]".
 */
export interface PhaseStepProps {
  /** @default "download" */
  phase?: 'latency' | 'download' | 'upload';
  /** Override the name. Default "Idle latency" / "Download" / "Upload". The info phase shows as label "Connecting…" on the first step. */
  label?: string;
  /** @default "pending" */
  state?: 'pending' | 'active' | 'done' | 'failed' | 'cancelled' | 'skipped' | 'capped';
  /** 0–1 (active / failed / cancelled / capped). */
  progress?: number;
  /** After the state: "~10–20 s", "4.6 s left", "3.1 ms", "interrupted", "3.1 s", "data cap". */
  detail?: string;
  /** Meta wraps under the name (narrow layout). */
  stacked?: boolean;
}
export declare function PhaseStep(props: PhaseStepProps): JSX.Element;
export interface PhaseIndicatorProps {
  steps: PhaseStepProps[];
  /** Narrow layout: tighter gap, stacked steps. */
  compact?: boolean;
}
export declare function PhaseIndicator(props: PhaseIndicatorProps): JSX.Element;
