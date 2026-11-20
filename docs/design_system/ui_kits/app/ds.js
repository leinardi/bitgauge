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

/* BitGauge web UI kit — ds.js: resolves the design system for the kit as `window.DS`.
   The kit is a consumer: every component comes from the design system's namespace. When the compiled
   bundle (../../_ds_bundle.js, loaded first) already exports everything the kit needs, DS is that namespace.
   While the bundle is stale (a component was just added and the bundle hasn't been rebuilt yet), DS is
   compiled in the page from the same component sources. Either way there is one definition per component.
   No-op outside the kit page (this file is also swept into the bundle, where it must do nothing). */
(function() {
  const me = document.currentScript;
  if (!me || !me.hasAttribute("data-kit")) return;
  const NS = "BitGaugeDesignSystem_1ab699";
  const ROOT = me.getAttribute("data-root") || "../../";
  const NEED = ["StartButton", "AppHeader", "TabBar", "Chart", "Format", "PhaseIndicator", "LoadCard", "QualityList", "MetaList", "Snippet", "SaveBar", "LiveRegion", "Menu", "Link", "ToastRegion", "Stat", "FullScreenError", "SharePreview", "ShareFormat", "LastResult", "Select", "FieldError", "ChangedMark", "Checkbox", "ChoiceCard", "Popover", "OptionRows", "PhaseChart", "Modal"];
  const FILES = ["brand/Icon", "brand/Logo", "status/StatusPill", "status/StatusBadge", "status/Chip", "actions/Link", "actions/Tooltip", "actions/Button", "actions/StartButton", "dialog/Modal", "actions/Menu", "actions/Popover",
    "forms/Input", "forms/Select", "forms/Segmented", "forms/Switch", "forms/Toggle", "forms/Checkbox", "layout/Card", "layout/Tabs", "layout/Table", "layout/MetaList", "layout/Snippet",
    "feedback/Notice", "feedback/Toast", "feedback/EmptyState", "feedback/Skeleton", "feedback/LiveRegion", "feedback/SaveBar", "feedback/FullScreenError", "dialog/Dialog",
    "charts/Format", "charts/Chart", "charts/PhaseChart", "gauge/Gauge", "measurement/MetricTile", "measurement/PhaseStep", "measurement/LoadCard", "measurement/QualityList", "measurement/SharePreview", "navigation/AppHeader"];
  window.DS_READY = (async () => {
    const ns = window[NS];
    if (ns && NEED.every(k => ns[k])) {
      window.DS = ns;
      return ns;
    }
    const scope = {};
    for (const f of FILES) {
      const src = await (await fetch(ROOT + "components/" + f + ".jsx")).text();
      const names = [...src.matchAll(/export\s+(?:function|const|let|class)\s+(\w+)/g)].map(m => m[1]);
      const body = src.replace(/^\s*import[^;]*;\s*$/mg, "").replace(/export\s+(?=(?:function|const|let|class)\b)/g, "");
      const code = Babel.transform(body, { presets: ["react"] }).code;
      const keys = Object.keys(scope);
      Object.assign(scope, new Function("React", ...keys, code + "\nreturn {" + names.join(",") + "};")(React, ...keys.map(k => scope[k])));
    }
    window.DS = scope;
    return scope;
  })();
})();
