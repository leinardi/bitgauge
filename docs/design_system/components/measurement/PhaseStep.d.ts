/** One row of the phase indicator: state icon, phase name, mono status, 4 px progress bar. See components/phase-indicator.md. */
export interface PhaseStepProps {
  /** @default "download" */
  phase?: 'latency' | 'download' | 'upload';
  /** Override the displayed name. */
  label?: string;
  /** @default "pending" */
  state?: 'pending' | 'active' | 'done' | 'failed' | 'cancelled' | 'skipped' | 'capped';
  /** 0–1 (active / failed / cancelled / capped). Capped uses triangle-alert and --fg-subtle. */
  progress?: number;
  /** Mono detail after the state: "4.6 s left", "3.1 ms", "~10–20 s" (pending download), "~15–25 s" (pending upload). */
  detail?: string;
}
export declare function PhaseStep(props: PhaseStepProps): JSX.Element;
