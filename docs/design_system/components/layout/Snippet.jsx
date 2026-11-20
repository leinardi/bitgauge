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
// Code / config snippet on the terminal surface, with an optional copy button. Lines never wrap: a long line
// scrolls horizontally inside the block (keyboard-focusable), so a copied command reads as it runs.
export function Snippet({ lines = [], caption, copyLabel, onCopy }) {
  return <div className="snip">
    {caption ? <span className="snip-cap">{caption}</span> : null}
    <div className="snip-box">
      <pre className={copyLabel ? "has-copy" : undefined} tabIndex={0} aria-label={caption || copyLabel || undefined}>{lines.map((l, i) => {
        const o = typeof l === "string" ? { t: l } : l;
        return <span key={i} className={o.kind ? "k-" + o.kind : undefined}>{o.t}</span>;
      })}</pre>
      {copyLabel ?
          <button type="button" className="btn ghost sm icon snip-copy" aria-label={copyLabel} onClick={onCopy}><Icon name="copy" size={14} />
          </button> : null}
    </div>
  </div>;
}
