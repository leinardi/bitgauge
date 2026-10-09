# BitGauge Design System

> **Placeholder.** The Claude Design export has not landed yet. Until it does, the UI is built
> with shadcn-vue defaults and no hand-authored visual design, and the behaviour of every screen is
> specified in [../features/ui/](../features/ui/README.md).

## What Lands Here

The export of the BitGauge project in Claude Design, unchanged:

| Path | What it is |
| --- | --- |
| `SKILL.md` | How to use the design system, with the provenance note |
| `colors_and_type.css` | Colour and type foundations as CSS custom properties, light and dark |
| `tokens.md` | The token reference: colour, type, spacing, radius, motion |
| `components/` | Component contracts: gauge, chart, metric tiles, notices, buttons and the rest |
| `preview/` | Rendered previews of the foundations and components |
| `ui_kits/` | High-fidelity recreations of the screens; the canonical UI prototype |
| `assets/` | Logo, icons and illustrations |
| `features/` | The product-spec files the design was drawn from, mirrored from `../features/` |

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

When the first export lands:

1. Copy the export into `docs/design_system/`, replacing this placeholder README only if the export
   brings its own; otherwise keep this file.
2. Compare the export's `features/product.md`, `features/principles.md` and `features/ui/` with
   `docs/features/`. Any difference is resolved in favour of `docs/features/` and fed back into the
   Claude Design project, so both copies are identical.
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
   [../STATUS.md](../STATUS.md) that the design export has landed.
