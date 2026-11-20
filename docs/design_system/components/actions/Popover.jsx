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
import { useDismiss, useModal } from "../dialog/Modal.jsx";
// Floating panel anchored under its trigger (export menu, date range). role "menu" or "dialog"; named by label.
// Escape and a click outside call onClose. Non-modal by default; `modal` (menus) makes the page inert and traps focus.
// Slides an open floating panel horizontally so it stays at least --space-4 inside the screen's edges.
export function useKeepInView(ref, open) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.setProperty("--shift-x", "0px");
      const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      const gap = parseFloat(getComputedStyle(el).getPropertyValue("--space-4")) || 16;
      const dx = r.left < gap ? gap - r.left : r.right > vw - gap ? Math.max(gap - r.left, vw - gap - r.right) : 0;
      el.style.setProperty("--shift-x", Math.round(dx) + "px");
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);
}

export function Popover({ trigger, open = false, role = "dialog", label, width = 300, align = "end", modal = false, onClose, children }) {
  const ref = React.useRef(null), wrap = React.useRef(null);
  useModal(ref, open && modal, { onOutside: onClose });
  useDismiss(wrap, open && !modal, onClose);
  useKeepInView(ref, open);
  return <span ref={wrap} className="pop-wrap" onKeyDown={e => {
    if (e.key === "Escape" && open && onClose) {
      e.stopPropagation();
      onClose();
    }
  }}>{trigger}{open ? <div ref={ref} role={role} aria-label={label} aria-modal={modal && role === "dialog" ? "true" : undefined}
                           className={"pop" + (align === "start" ? " start" : "")} style={{ width }}>{children}</div> : null}</span>;
}

// Single-choice rows (role="radio") with an optional mono count and a check on the selected row.
export function OptionRows({ label, options = [], selected, onSelect }) {
  return <div role="radiogroup" aria-label={label} className="optrows">{options.map(o => {
    const on = o.value === selected;
    return <button key={o.value} type="button" role="radio" aria-checked={on} className="menu-item" onClick={() => onSelect && onSelect(o.value)}>
      <span className="lb">{o.label}</span>{o.meta != null ? <span className="mt">{o.meta}</span> : null}<span className="ck">{on ?
        <Icon name="check" size={14} stroke={2.25} /> : null}</span>
    </button>;
  })}</div>;
}
