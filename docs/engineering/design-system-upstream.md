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
  (`AppHeader.vue`, `TabBar.vue`, `MetaList.vue`, `BasePathError.vue`); with a token it would map
  into Tailwind 4's `--breakpoint-*` theme variables and become a named variant.

### The Packet Loss Reason In View

- **Source:** triage cluster `layout-results-metrics`, decided for a new layout: the kit's `Test`
  list inside the Results section, with the reason the specification asks for.
- **Kit:** `components/measurement/NotMeasured.jsx` and `components/tiles.md` (Special tiles,
  NotMeasured), used by the `Test` MetaList of `ui_kits/app/TestScreen.jsx`.
- **Export today:** the packet-loss row shows only the "Not measured" badge and the "Why?" link;
  the reason "Browsers can't see packet loss over TCP" is a tooltip and part of the link's name.
- **Wanted:** the reason as visible text in the row, as the MetaList row's `sub` line under the
  "Packet loss" label, with the badge and the link kept as they are.
- **Why:** [ui/screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision)
  lists the reason among the qualifiers the slot shows, and a tooltip is not shown on touch or to a
  reader who does not hover. The Vue app shows it as the `sub` line (`TestPage.vue`,
  `MetaList.vue`).

### The Compact Header's Mark

- **Source:** triage cluster `a11y-brand-logo`, kept for now: the Vue app follows the
  accessibility rule, the kit is to change.
- **Kit:** `components/navigation/AppHeader.jsx`, the compact header, which renders
  `<Logo size={26} />` beside its own `wm md` wordmark; `components/brand/Logo.jsx`.
- **Export today:** without `wordmark`, Logo draws the mark with `role="img"` and the name
  "BitGauge", so a screen reader reads "BitGauge" twice: the image, then the visible wordmark.
- **Wanted:** the compact header's mark hidden from assistive technology (`aria-hidden`), as Logo
  already does in its `wordmark` mode, or the compact header built on Logo's `wordmark` mode.
- **Why:** a decorative mark next to the name it shows adds nothing for a screen reader; the Vue app
  hides it (`AppHeader.vue`, `BrandLogo.vue`).

### A Heading For The Test Screen

- **Source:** triage cluster `a11y-speedtest-heading`, kept for now: the Vue app follows
  [ui/i18n-a11y.md §2.8](../features/ui/i18n-a11y.md#28-headings).
- **Kit:** `ui_kits/app/TestScreen.jsx`, the Test screen's `main`.
- **Export today:** the Test screen has no `h1`; About and the base-path error have one.
- **Wanted:** a visually hidden `h1` "Speed test" at the start of the Test screen's `main`, with the
  `sr-only` class of `base.css`.
- **Why:** every screen has one `h1`, its title, and the Test screen's is visually hidden so the
  gauge and Start stay first; the Vue app has it (`TestPage.vue`).

### The Slow Client's Context

- **Source:** triage cluster `fixture-slow-context`, kept for now: the specification and the demo
  agree, the kit is to change.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the slow states (`slow`, `slowdone`, `cancelled-slow`,
  `cancelled-slow-up`): Client IP `10.8.0.6` with the context chip on VPN, suggested.
- **Export today:** a private IPv4 address with the VPN suggestion.
- **Wanted:** either a CGNAT client address such as `100.101.4.17`, which is suggested as VPN, or
  the LAN suggestion for `10.8.0.6`.
- **Why:** [wire-protocol.md §5](../features/wire-protocol.md#5-get-apiv1info) maps a private address
  to LAN and suggests VPN only for CGNAT and the Tailscale ULA range, and the Vue demo follows it
  ([frontend.md §9](../features/technical-stack/frontend.md#9-demo-build)).

### Callout's Block Class Reaches Buttons

- **Source:** triage cluster `style-button-kit-bug`, kept for now: the kit breaks its own Button
  contract.
- **Kit:** `components/feedback/feedback.css` (`.block`, the Callout) and
  `components/actions/actions.css` (`.btn.block`, Button's full-width modifier), as used by the two
  links of `ui_kits/app/About.jsx`.
- **Export today:** the Callout's `.block` rule also matches a block Button, so the ghost LICENSE
  button gets the Callout's amber border and both buttons its padding (14 px by 16 px).
- **Wanted:** one of the two classes renamed, such as `.callout` for the Callout, so a block Button
  keeps only its own anatomy.
- **Why:** the Vue app draws the buttons as the Button contract defines them (`AppButton.vue`).

### Kit Literals With No Token

- **Source:** the design-system-guard skill. These values are drawn as literals in the app kit, no
  export token or Tailwind scale step expresses them, and the Vue app copies them as arbitrary
  values until the export carries tokens for them.
- **Wanted:** a semantic token for each group, in `colors_and_type.css` and `tokens.md`, used by the
  kit in place of the literal.

| Kit source | Value | Vue use | Token it would need |
| --- | --- | --- | --- |
| `components/gauge/gauge.css` (`.gauge-num`) | line height 1.05 on the gauge figure | `Gauge.vue`, `CountdownRing.vue` | `--lh-display` |
| `components/navigation/navigation.css` (`.srv.down .dot`), `components/status/status.css` | 1.5 px border of the server-down dot | `AppHeader.vue` | `--border-width-strong` |
| `components/navigation/navigation.css` (`.tab-l`) | 28 % inset of the tab bar's active indicator | `TabBar.vue` | `--tab-indicator-inset` |
| `components/feedback/feedback.css` (`.signal .body`, `.sb-msg`) | a 220 px flex basis | `NoticeBox.vue`, `ResultBar.vue` | a `--layout-*` width |
| `components/feedback/feedback.css` (`.fse-in`) | the full-screen error's 600 px maximum width | `BasePathError.vue` | a `--layout-*` width |
| `components/layout/layout.css` (`.card`) | the card's top highlight, `inset 0 1px 0 var(--card-highlight)` | `TestPage.vue`, `MetaList.vue` | a `--shadow-*` step that carries it |
| `components/actions/actions.css` (`.has-tip .tip`) | a tooltip 7 px above its control (`calc(100% + 7px)`) | `DownloadJson.vue` | a `--space-*` step for the offset |
| `ui_kits/app/kit.css` (`.demo`, `.demo-row`) | the demo panel's 160 px basis and `calc(100vh - 20px)` height | `DemoPanel.vue` (demo builds only, so the least urgent) | `--layout-*` sizes for the panel |
