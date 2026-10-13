# A value the export does not give: BitGauge

Detail for the token rules in [design-system-guard](../SKILL.md). Read it only when no existing
token, token composition, mapped theme colour or Tailwind scale step can express the value.

In BitGauge, tokens come only from the design export: `docs/design_system/colors_and_type.css` is
never edited here, and nothing visual is hand-authored in `web/`
([frontend.md §8](../../../../docs/features/technical-stack/frontend.md#8-theming-hook)). So a new
token is never invented in this repository.

1. Look again. The value is often a token under another name (`--text-micro` is 11 px, `--space-3-5`
   is 14 px), a `calc()` of one, or a step of Tailwind's own spacing scale, which takes quarter
   steps of its 4 px unit (`max-w-300` is 1200 px, `gap-1.25` is 5 px).
2. If the app kit draws it as a literal, the export is missing a token. Add it to the "Kit Literals
   With No Token" note, or write a note of its own, in
   [`design-system-upstream.md`](../../../../docs/engineering/design-system-upstream.md): the kit
   file and the element, the value, the semantic name it would need (`--gauge-value-size`, never a
   visual one such as `--size-58`), and the surfaces that use it.
3. Until an export with the token is imported, copy the kit's literal exactly, as an arbitrary
   value: this is the one arbitrary value the skill allows, and the note is what keeps it from
   being permanent. Never round it to the nearest token; the export wins on visuals, and parity
   would report the change.
4. When the export brings the token, map it in `web/src/styles/index.css` (`@theme inline`) if a
   Tailwind utility should reach it, replace the literal with it, and remove the note.

A value the kit does not draw at all is not a missing token but a design gap: it goes to the Claude
Design project as a note, and nothing is invented for it in `web/`.

The Tailwind mapping in `index.css` only renames the export's tokens into Tailwind theme variables;
it never defines a value of its own.
