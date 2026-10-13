# Design System Upstream Notes

The design export in `docs/design_system/` is never edited in this repository
([docs/README.md](../README.md#design-export)). When the demo parity triage decides that the export
is the side to change (a triage cluster's `upstream` action in `.parity-triage.json`), or when the
Vue app needs a value the export draws only as a literal with no token (the `design-system-guard`
skill), the change is written down here instead, as a note to paste into the Claude Design project,
so that the next export carries it. Once an export with the change has been imported, its note is
removed.

Each note names the triage cluster or the skill it comes from, the kit file and the element, what
the export shows, and what it should show, with the reason; behaviour comes from
[`docs/features/ui/`](../features/ui/README.md), visuals from the export's own tokens.

## Notes

### A Desktop Breakpoint Token

- **Source:** the design-system-guard skill, not a triage cluster: the kit's breakpoint is the one
  layout value the Vue app cannot take from a token.
- **Kit:** `ui_kits/app/kit.css` (`@media (max-width: 1139px)`, the mobile layout below the 1140 px
  desktop breakpoint) and `ui_kits/app/Prototype.jsx` (`DESKTOP_MIN = 1140`).
- **Export today:** the breakpoint is a literal in the kit; `colors_and_type.css` has no breakpoint
  token.
- **Wanted:** a semantic token for it, such as `--breakpoint-desktop: 1140px`, in
  `colors_and_type.css` and `tokens.md`, used by the kit's media query.
- **Why:** the Vue app writes it as the arbitrary values `min-[1140px]` and `max-[1139px]`
  (`AppHeader.vue`, `TabBar.vue`); with a token it would map into Tailwind 4's `--breakpoint-*`
  theme variables and become a named variant.

### Kit Literals With No Token

- **Source:** the design-system-guard skill. These values are drawn as literals in the app kit, no
  export token or Tailwind scale step expresses them, and the Vue app copies them as arbitrary
  values until the export carries tokens for them.
- **Wanted:** a semantic token for each group, in `colors_and_type.css` and `tokens.md`, used by the
  kit in place of the literal.

| Kit source | Value | Vue use | Token it would need |
| --- | --- | --- | --- |
| `ui_kits/app/TestScreen.jsx` (`gNum`) | 46 px (narrow), 58 px (desktop) gauge figure | `Gauge.vue`, `CountdownRing.vue` | `--gauge-value-size` per layout |
| `components/gauge/Gauge.jsx`, `ui_kits/app/TestScreen.jsx` | line height 1.05, letter spacing −0.03em on the gauge figure | `Gauge.vue`, `CountdownRing.vue` | `--lh-display`, `--tracking-display` |
| `ui_kits/app/surfaces.css`, `dialog.css` | line height 1.55 for body copy | `AboutPage.vue`, `BasePathError.vue` | a `--lh-*` step |
| `ui_kits/app/kit.css`, `surfaces.css`, `inputs.css` | line height 1.45 | `DemoPanel.vue` | a `--lh-*` step |
| `ui_kits/app/TestScreen.jsx` | line height 1.2 | `BasePathError.vue` | a `--lh-*` step |
| `ui_kits/app/Nav.jsx`, `badges.css` | 1.5 px border of the server-down dot | `AppHeader.vue` | `--border-width-strong` |
| `ui_kits/app/Nav.jsx` | 28 % inset of the tab bar's active indicator | `TabBar.vue` | `--tab-indicator-inset` |
| `ui_kits/app/TestScreen.jsx`, `About.jsx` | layout tracks: a 400 px column, a 340 px column, a 220 px flex basis | `TestPage.vue`, `AboutPage.vue`, `ResultBar.vue` | `--layout-*` widths |
| `ui_kits/app/app.css` | the card's top highlight, `inset 0 1px 0 var(--card-highlight)` | `TestPage.vue` | a `--shadow-*` step that carries it |
| `ui_kits/app/buttons.css` | a tooltip 7 px above its button (`calc(100% + 7px)`) | `DownloadJson.vue` | a `--space-*` step for the offset |
| `ui_kits/app/kit.css` | the demo panel's 160 px basis and `calc(100vh - 20px)` height | `DemoPanel.vue` (demo builds only, so the least urgent) | `--layout-*` sizes for the panel |
