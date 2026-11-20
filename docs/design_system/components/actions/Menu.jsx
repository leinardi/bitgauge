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
import { useModal } from "../dialog/Modal.jsx";
import { useKeepInView } from "./Popover.jsx";
// Menu button + menu of single-choice (menuitemradio) or action (menuitem) rows. Modal while open
// (i18n-a11y.md §2): page inert, focus in the menu; Escape, a choice or a click outside closes it.
export function Menu({
                       label,
                       value,
                       icon,
                       hint,
                       options = [],
                       selected,
                       onSelect,
                       open: openProp,
                       onOpenChange,
                       align = "start",
                       placement = "bottom",
                       footer,
                       trigger,
                       style
                     }) {
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = o => {
    if (openProp == null) setOpenState(o);
    onOpenChange && onOpenChange(o);
  };
  const btn = React.useRef(null), wrap = React.useRef(null), menu = React.useRef(null);
  useModal(menu, open, { onOutside: () => setOpen(false) });
  useKeepInView(menu, open);
  // After the menu unmounts and the page is no longer inert.
  const focusTrigger = () => setTimeout(() => {
    const b = btn.current || (wrap.current && wrap.current.querySelector("button, a[href]"));
    b && b.focus();
  }, 0);
  const close = () => {
    setOpen(false);
    focusTrigger();
  };
  const radio = selected !== undefined;
  const name = label + (value != null ? ": " + value : "") + (hint ? ", " + hint : "");
  return <span ref={wrap} className="menu-wrap" style={style} onKeyDown={e => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      close();
    }
  }}>
    {trigger ? React.cloneElement(trigger, { "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen(!open) })
        : <button ref={btn} type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={name}
                  onClick={() => setOpen(!open)}>
          {icon ? <Icon name={icon} size={12} stroke={2} /> : null}{value}<span className="chev"><Icon name="chevron-down" size={12}
                                                                                                       stroke={2} /></span>
        </button>}
    {hint && !trigger ? <span className="menu-hint" aria-hidden="true">{hint}</span> : null}
    {open ? <div ref={menu} role="menu" aria-label={label} className={"menu" + (align === "end" ? " end" : "") + (placement === "top" ? " up" : "")}>
      {options.map(o => {
        const on = radio && o.value === selected;
        return <button key={o.value} type="button" role={radio ? "menuitemradio" : "menuitem"} aria-checked={radio ? on : undefined}
                       className={"menu-item" + (o.danger ? " danger" : "")}
                       onClick={() => {
                         onSelect && onSelect(o.value);
                         if (!o.keepOpen) close();
                       }}>
          {o.icon ? <span className="ic"><Icon name={o.icon} size={14} /></span> : null}<span className="lb">{o.label}</span>
          {on ? <span className="ck"><Icon name="check" size={14} stroke={2} /></span> : null}
        </button>;
      })}
      {footer ? <div className="menu-foot">{footer}</div> : null}
    </div> : null}
  </span>;
}
