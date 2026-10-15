# States, accessibility and responsive layout: BitGauge

Detail for [design-system-guard](../SKILL.md). Read it before building or changing an interactive
or data-bearing surface.

## States

What each state contains, says and offers is in
[`ui/screens.md`](../../../../docs/features/ui/screens.md) and
[`ui/flows.md`](../../../../docs/features/ui/flows.md); how it looks is in the app kit's
`TestScreen.jsx` and the component contracts (`components/notices.md`, `tiles.md`,
`phase-indicator.md`, `gauge.md`). Rules specific to BitGauge:

| Surface | Rule |
| --- | --- |
| Numbers | No number without its qualifiers: unit, phase, confidence. "Insufficient data" shows no number ([`measurement.md`](../../../../docs/features/measurement.md)) |
| Series colours | Download teal, upload violet, latency blue and dashed, each with that one meaning (`tokens.md`) |
| Run states | Every v0.1 state of the kit's `TEST_STATES` (idle, countdown, connecting, each phase, complete, error, cancelled and the rest; `V01_TEST_STATES` in `web/parity/scenarios.ts`) is reachable in the demo and compared by parity |
| Notices | Their tone, wording and order come from the spec; a notice never stands in for a number's qualifier |
| `focus-visible` | Visible ring via `var(--focus-ring)` (`--ring`); do not hide it |

## Accessibility

[`ui/i18n-a11y.md`](../../../../docs/features/ui/i18n-a11y.md) §2 is the contract:

- **Live region** (§2.1) and **screen reader summary** (§2.7): the gauge's announcements and the
  result summary go through `web/src/components/a11y/`.
- **Reduced motion** (§2.2): under `prefers-reduced-motion: reduce` the needle jumps, chart updates
  are not animated and the countdown shows numbers only. Do not bypass it with a hardcoded
  `transition` or `animation`.
- **Focus order and keyboard** (§2.3, §2.4): the page-wide Enter and Escape shortcuts, and the order
  the section lists.
- **Colour independence** (§2.5): a grade or status always pairs its colour with text or an icon.
- **Contrast** (§2.6): WCAG 2.2 AA in both themes, checked by axe in the Playwright tests. A token
  that fails it is fixed in Claude Design, never overridden in code
  ([docs/README.md § Precedence](../../../../docs/README.md#precedence)): write an upstream note.
  The one rendering drawn differently in code is the one §2.6 names, the start button's key hint
  at full text colour without the export's reduced opacity.

## Responsive layout

- **Breakpoint**: the app kit's, desktop from 1140 px wide and the narrow layout below
  (`ui_kits/app/kit.css`), the export's `--breakpoint-desktop`. `index.css` maps it into Tailwind's
  theme, so it is written `desktop:` and `max-desktop:`. Add no other breakpoint.
- **Narrow screens**: the responsive notes in `ui/screens.md` (the gauge and Start above the fold,
  the tab bar in place of the header navigation).
- **Density**: the export defines `data-density` tokens, but no BitGauge screen sets a density; do
  not add one without a spec change.
- **Themes**: `data-theme="light"` or `"dark"` on `<html>`, defaulting to the system's
  (`useTheme.ts`). Check every change in both.
