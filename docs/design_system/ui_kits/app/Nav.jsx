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

/* BitGauge web UI kit — Nav: composes DS.AppHeader / DS.TabBar with app state from BGPrefs.
 * Props: variant "top" | "mobile-top" | "mobile-bottom", active, status "connected" | "unreachable".
 * Server name, host, theme and the navigation items come from the Prototype (context);
 * nothing here defaults to sample data. */
window.BGPrefs = window.BGPrefs || React.createContext({ theme: "system", server: null, host: "" });
const NAV_ITEMS = [
  { key: "test", label: "Test", icon: "gauge" }, { key: "history", label: "History", icon: "history" },
  { key: "settings", label: "Settings", icon: "sliders" }, { key: "about", label: "About", icon: "info" }
];

function Nav({ variant = "top", active = "test", status = "connected" }) {
  const p = React.useContext(window.BGPrefs);
  const items = NAV_ITEMS;
  const st = status === "offline" || status === "unreachable" ? "unreachable" : "connected";
  if (variant === "mobile-bottom") return <DS.TabBar items={items} active={active} />;
  return <DS.AppHeader compact={variant === "mobile-top"} server={p.server} host={p.host} status={st} items={items} active={active}
                       theme={p.theme} />;
}

window.Nav = Nav;
