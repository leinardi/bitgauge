/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * FullScreenError — replaces the whole app when nothing can load (base path mismatch, edge-cases.md §20):
 * wordmark, danger eyebrow, state title (--type-state-title 26 / compact 22 px), description naming the
 * expected and actual path, facts (MetaList), a deployment hint card, and actions. role="alert".
 */
export interface FullScreenErrorProps {
  /** @default "Deployment error" */
  eyebrow?: string;
  title: React.ReactNode;
  /** Description; use <code className="ds-code"> for paths. */
  children?: React.ReactNode;
  /** e.g. <MetaList rows={…} /> */
  facts?: React.ReactNode;
  /** e.g. <Card title="How to fix it" icon="terminal">…</Card> */
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}

export declare function FullScreenError(props: FullScreenErrorProps): JSX.Element;
