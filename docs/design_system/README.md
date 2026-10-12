# BitGauge Design System

> **First export landed: prototype boards.** The Claude Design export in this directory holds the
> screen prototypes and boards, drawn from a short brief before the detailed specification. Where
> they disagree with [../features/ui/](../features/ui/README.md) on behaviour, the spec wins and
> the correction goes back into the Claude Design project. This README is not part of the export:
> it is maintained in the repository.

## Current Export

| Path | What it is |
| --- | --- |
| `BitGauge Overview.dc.html` | Entry page: concept, series colours, gauge auto-scale, links to the boards |
| `Board 1`–`Board 7 *.dc.html` | Boards: Test desktop and mobile, flows, Result detail and History, Settings and About, tokens and components, additions |
| `Test Screen`, `Result Detail`, `History`, `Settings`, `About`, `Nav .dc.html` | The screens as live design components, with their states as properties |
| `BitGauge Prototype.dc.html` | A clickable prototype that runs a simulated test across the screens |
| `Logo Explorations.dc.html` | Seven logo directions; the chosen mark is "Three series" (1f) |
| `bg-lib.js` | Prototype helpers: icon glyphs, number formatting, gauge and chart geometry |
| `support.js` | The Claude Design viewer runtime (loads React from a CDN; never part of the product) |
| `_ds/runhold-design-system-…/` | The Runhold design system the project builds on: tokens (`colors_and_type.css`), console CSS, IBM Plex fonts, runtime bundle |

## What a Complete Export Contains

The export the frontend and the symlinks depend on, unchanged once it lands:

| Path | What it is |
| --- | --- |
| `README.md`, `SKILL.md` | How to use the design system, with the provenance note |
| `colors_and_type.css` | Colour and type foundations as CSS custom properties, light and dark, at the export root: the file the frontend imports ([../features/technical-stack/frontend.md §8](../features/technical-stack/frontend.md#8-theming-hook)) |
| `tokens.md` | The token reference: colour, type, spacing, radius, motion, with contrast ratios |
| `components/` | Component contracts: gauge, chart, metric tiles, notices, buttons and the rest |
| `preview/` | Rendered previews of the foundations and components |
| `ui_kits/` | High-fidelity recreations of the screens; the canonical UI prototype |
| `assets/` | Logo, icons, favicons and fonts |
| `features/` | The product-spec files the design was drawn from, byte-identical to `../features/` |

## Provenance Rule

**Never hand-edit files in this tree.** It is regenerated from the Claude Design project on every
export, so a local edit is silently lost on the next sync. A change goes into the Claude Design
project first and arrives here with the next export. The one exception is `features/`, which is
the same file as `../features/` through the symlinks below and is edited like any spec page.

## Precedence

- **Visuals:** this tree is canonical for how things look: colour, type, spacing, iconography,
  motion and layout details.
- **Behaviour:** [../features/ui/](../features/ui/README.md) is canonical for what each screen
  contains, which states it has and what each flow does; the numbers' meaning is in
  [../features/measurement.md](../features/measurement.md).
- **Conflicts:** when the export disagrees with the UI spec on behaviour, the disagreement is
  resolved in the spec first and then implemented. Technical decisions in
  [../features/technical-stack/decisions.md](../features/technical-stack/decisions.md) win over
  both.
- **Accessibility:** the export must meet the contrast and focus requirements of
  [../features/ui/i18n-a11y.md](../features/ui/i18n-a11y.md); a token that fails them is fixed in
  Claude Design, not overridden in code.

## Symlink Activation

The first export (the prototype boards) carries no `features/` mirror and no root
`colors_and_type.css`, so the symlinks are not active yet. Activate them with the first export that
has both:

1. Copy the export into `docs/design_system/`, replacing this README only if the export brings its
   own; otherwise keep this file.
2. Compare the export's `features/product.md`, `features/principles.md` and `features/ui/` with
   `docs/features/` (`diff -r` must print nothing). Any difference is resolved in favour of
   `docs/features/` and fed back into the Claude Design project, so both copies are identical.
3. Replace the three with symlinks, running from `docs/features/`:

   ```sh
   git rm -r product.md principles.md ui
   ln -s ../design_system/features/product.md product.md
   ln -s ../design_system/features/principles.md principles.md
   ln -s ../design_system/features/ui ui
   ```

4. Check that every relative link in `docs/` still resolves through the symlinks, then commit the
   export and the links together.
5. Update [../README.md](../README.md) to say the symlinks are active, and record in
   [../STATUS.md](../STATUS.md) that the complete design export and the symlinks have landed.
