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

import React from "react";
import { Icon } from "../brand/Icon.jsx";
import { StatusPill } from "../status/StatusPill.jsx";
// tiles.md LoadCard — grade letter + words (never colour alone) + basis, loaded latency per direction, RPM (optional).
export const GRADES = {
  "A+": { tone: "ok", text: "Minimal bufferbloat" }, A: { tone: "ok", text: "Low bufferbloat" }, B: { tone: "ok", text: "Mild bufferbloat" },
  C: { tone: "warn", text: "Moderate bufferbloat" }, D: { tone: "warn", text: "High bufferbloat" }, F: { tone: "danger", text: "Severe bufferbloat" }
};
const DIR = { download: ["arrow-down", "var(--series-download)"], upload: ["arrow-up", "var(--series-upload)"] };

export function GradeBadge({ grade, text, ended = false }) {
  const G = grade ? GRADES[grade] : null;
  const words = text || (G ? G.text : "Graded after upload");
  return <div className="grade">
    <span className={"grade-l " + (G ? G.tone : "none")} role="img"
          aria-label={G ? "Bufferbloat grade " + grade + ", " + words : ended ? "Bufferbloat not graded" : "Bufferbloat grade pending"}>{grade || "—"}</span>
    <div className="grade-s">
      <div className="grade-strip" aria-hidden="true">{Object.keys(GRADES).map(g => <span key={g}
                                                                                          className={g === grade ? "on " + GRADES[g].tone : undefined}>{g}</span>)}</div>
      <span className="grade-t">{words}</span>
    </div>
  </div>;
}

function NumU({ value, unit, live, uncertain }) {
  const none = value == null || value === "—";
  return <span className={"num-u" + (none ? " none" : live ? " live" : uncertain ? " uncertain" : "")}>{none ? "—" : value}{!none && unit ?
      <span className="u">{unit}</span> : null}</span>;
}

export function LoadCard({ grade, gradeText, ended = false, basis, rows = [], responsiveness, compact = false, className, style }) {
  const r = responsiveness;
  // A region named "Bufferbloat" (i18n-a11y.md §2); the visible title stays the small caps label, not a heading.
  return <section aria-label="Bufferbloat" className={"card tile load" + (compact ? " compact" : "") + (className ? " " + className : "")}
                  style={style}>
    <div className="load-g"><span className="ds-eyebrow">Bufferbloat</span><GradeBadge grade={grade} text={gradeText} ended={ended} />{basis ?
        <span className="grade-b">{basis}</span> : null}</div>
    <div className="load-r">
      {rows.map((x, i) => <div className="lrow" key={i}>
        <span className="ic" style={{ color: DIR[x.dir][1] }}><Icon name={DIR[x.dir][0]} size={14} stroke={2} /></span>
        <div className="lb"><span>{x.label}</span><span className="sub">{x.sub}</span></div>
        <NumU value={x.value} unit="ms" live={x.live} />
      </div>)}
      {r ? <div className="rpm">
        <div className="rpm-h">
          <span className="ic" style={{ color: "var(--fg-subtle)", marginTop: 2 }}><Icon name="gauge" size={14} stroke={2} /></span>
          <div className="lb"><span>HTTP loaded responsiveness — connection sharing not verifiable</span>{r.note ?
              <span className="sub">{r.note}</span> : null}</div>
          <div className="tags">{r.tag ? <StatusPill size="sm" tone="warn">{r.tag}</StatusPill> : null}{r.protocol ?
              <span className="proto">{r.protocol}</span> : null}</div>
        </div>
        <div className="rpm-d">{(r.dirs || []).map((d, i) => <div key={i}>
          <span className="ic" role="img" aria-label={d.dir === "upload" ? "Upload" : "Download"} style={{ color: DIR[d.dir][1] }}><Icon
              name={DIR[d.dir][0]} size={12} stroke={2.25} /></span>
          {d.value != null ? <NumU value={d.value} unit="RPM" uncertain={d.uncertain} /> : <span className="txt">{d.text || "—"}</span>}
          {d.detail ? <span className="sub">{d.detail}</span> : null}
        </div>)}</div>
      </div> : null}
    </div>
  </section>;
}
