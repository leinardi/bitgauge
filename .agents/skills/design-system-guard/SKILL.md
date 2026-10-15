---
name: design-system-guard
description: >
  Enforces BitGauge's design system when changing the Vue frontend: token-only styling (no raw
  colours, sizes or durations, no arbitrary Tailwind values), composing shadcn-vue primitives,
  interaction states, accessibility, and reconciling docs/features/ui with the design export's
  app kit, which is never edited here. Lint does not catch token or design drift; this skill does.
  Use when creating, editing or reviewing anything under web/src/** that renders, or when reading
  docs/design_system/** or docs/features/ui/** to build from them, before writing the change. For
  prototyping new mocks from scratch, read docs/design_system/SKILL.md instead.
---

# Design System Guard: BitGauge

Scope: changing the Vue frontend while keeping it aligned with the design export and the UI spec.
For prototyping new mocks or visual artifacts from scratch, read `docs/design_system/SKILL.md`
(the `bitgauge-design` Claude Design export; it is not installed as a skill, so read the file
directly).

This file is the **repository's authority** for these rules. `docs/design_system/SKILL.md` and
`docs/design_system/README.md` overlap on token rules; when a new export changes those, update this
skill in the same pull request so the two never drift.

Names used throughout:

- **the export**: `docs/design_system/`, the Claude Design export. It is copied in unchanged and
  **never hand-edited**, except the spec files under `docs/design_system/features/`
  ([docs/README.md](../../../docs/README.md#design-export)).
- **the app kit**: `docs/design_system/ui_kits/app/`, the export's high-fidelity React prototype,
  the visual and interaction reference. Its JSX is read for reference and translated into Vue and
  shadcn-vue, never copied.
- **`docs/features/ui/`**: a symlink into `docs/design_system/features/ui/`; either path edits the
  same file.

---

## 1. Sources of truth: read these before changing UI

| Source | Path | What it owns |
| --- | --- | --- |
| Token foundation (runtime) | `docs/design_system/colors_and_type.css` | Every CSS custom property: colour, the measurement series, type, spacing, radii, motion, z-index |
| Token spec | `docs/design_system/tokens.md` | The semantic token vocabulary and its rules (`--fg-faint` non-text only, the series colours' one meaning each, number formatting) |
| Component contracts | `docs/design_system/components/*.md`, `components/*/` | Gauge, tiles, phase indicator, notices, charts, share panel, save bar; each primitive folder's `*.prompt.md`, `*.d.ts` and `*.jsx` (read for reference, never copied) |
| Visual and interaction reference | the app kit (`ui_kits/app/`) | How each screen and state looks and moves; its breakpoint (desktop from 1140 px) |
| Product contract | `docs/features/ui/*.md` | Screens, states, flows, URL parameters, copy, i18n and accessibility |
| Tailwind mapping | `web/src/styles/index.css` | Imports `colors_and_type.css` and maps its tokens into Tailwind 4 `@theme` variables, and `base.css`'s element defaults into the base layer ([frontend.md §8](../../../docs/features/technical-stack/frontend.md#8-theming-hook)) |
| shadcn-vue primitives | `web/src/components/ui/` | Vendored: extend by composition only |
| Custom components | `web/src/components/**` | `gauge/`, `chart/`, `test/` (tiles, phase indicator, notices, start button, result bar), `layout/`, `connection/`, `a11y/` |
| Theme | `web/src/composables/useTheme.ts` | `data-theme` on `<html>`, the system's until one is chosen |
| `cn()` helper | `web/src/lib/utils.ts` | `twMerge(clsx(...))`: use it for every conditional class |

---

## 2. Precedence

Per [docs/README.md § Precedence](../../../docs/README.md#precedence); do not pick a winner
blindly:

1. **Technical decisions** in
   [`decisions.md`](../../../docs/features/technical-stack/decisions.md) win over both the export
   and the spec.
2. **Visuals**: the export is canonical for how things look: colour, type, spacing, iconography,
   motion and layout details.
3. **Behaviour**: `docs/features/ui/` is canonical for what each screen contains, which states it
   has and what each flow does; the meaning of the numbers is in
   [`measurement.md`](../../../docs/features/measurement.md).
4. **Accessibility**: the export must meet the contrast and focus requirements of
   [`ui/i18n-a11y.md`](../../../docs/features/ui/i18n-a11y.md). A token that fails them is fixed in
   Claude Design, never overridden in code: write an upstream note. The only in-code exception is
   the one §2.6 names: the start button's key hint is drawn at full text colour, without the
   export's reduced opacity.
5. **`web/`** is the implementation, never the spec. It loses every conflict.

When the export and `docs/features/ui/` disagree:

1. Stop. Do not implement either version silently.
2. On behaviour, the spec is changed first if it is the stale side (`spec-change`), then the code
   follows.
3. On visuals, the export wins; if the export itself is wrong, write a note in
   [`design-system-upstream.md`](../../../docs/engineering/design-system-upstream.md) for the
   Claude Design project. **Never edit the export to fix it**: the next export would overwrite it.

---

## 3. Token rules

Hard constraints, not style preferences:

- **No raw colour literals** (`#hex`, `rgb()`, `oklch()`, `hsl()`) anywhere in `web/src/**`. Colours
  come from the export's tokens, through the Tailwind mapping or `var(--token)`.
- **No raw numeric design values** for spacing, radii, shadows, font sizes, line heights, letter
  spacing, z-indexes or durations: use the matching `--space-*`, `--radius-*`, `--shadow-*`,
  `--text-*`, `--lh-*`, `--tracking-*`, `--z-*`, `--dur-*` and `--ease-*` token.
- **No arbitrary Tailwind values** (`bg-[#abc]`, `w-[123px]`, `text-[14px]`, `duration-[200ms]`).
  Use the token-backed utility (`text-(length:--text-micro)`, `bg-(--surface-1)`), a mapped theme
  colour (`bg-card`, `text-muted-foreground`), or Tailwind's own scale where the export's value is
  on it.
- **Compose before you name**: an existing token composition (`calc()` of a `--space-*`,
  `color-mix(in oklch, var(--fg) 8%, transparent)`) is preferable to asking for a new token for a
  one-off surface.
- **Nothing visual is hand-authored**
  ([frontend.md §8](../../../docs/features/technical-stack/frontend.md#8-theming-hook)): where
  neither the export nor shadcn-vue's defaults give a value, it is missing from the export. Read
  [references/missing-token.md](references/missing-token.md).
- **The one exception: the kit's own literal.** A value the app kit draws as a literal and no token
  or Tailwind scale step can express is copied exactly as the kit has it, as an arbitrary value,
  only while
  [`design-system-upstream.md`](../../../docs/engineering/design-system-upstream.md) lists it in a
  note asking the export for a token: the desktop breakpoint (`min-[1140px]`, `max-[1139px]`) and
  the values of the "Kit Literals With No Token" note (the gauge figure's line height, a 1.5 px
  border, the tab indicator inset, a flex basis and a width, the card highlight, a tooltip offset).
  It is never rounded to the nearest token: the export wins on visuals. A new one gets its row in
  that note in the same change, and a row the export has since tokenised goes, with its literal.

A token wins over a scale step that happens to give the same value: `max-w-[1200px]` is
`max-w-(--layout-max)`, the Start button's 46 px is `h-(--control-h-xl)`, a 400 px column is
`var(--layout-instrument)`. Where no token exists, a px size on the 4 px grid or its quarter steps
is a spacing step (`w-[316px]` is `w-79`, `gap-[5px]` is `gap-1.25`), `text-[11px]` is
`text-(length:--text-micro)` and `font-[family-name:var(--font-cond)]` is
`font-(family-name:--font-cond)`. Add no new arbitrary design value. A token inside a bracket
(`grid-cols-[var(--layout-instrument)_minmax(0,1fr)]`) is not a literal, and a bracket that names
properties rather than a value (`transition-[width]`) is not a design value.

---

## 4. Component rules

### Reuse before creating

Search `web/src/components/` and `web/src/components/ui/` before adding anything. Compose existing
components rather than writing a near-duplicate.

### shadcn-vue primitives (`web/src/components/ui/`)

Vendored, never hand-edited (AGENTS.md):

- Extend by **composing** them inside a `<script setup>` component, or by passing props and slots.
- A missing variant is a wrapper component that composes the primitive and passes its own
  classes through `cn()`, not an edit to the vendored file.

### Custom components

`<script setup lang="ts">` with Tailwind utilities that resolve to tokens. A scoped `<style>` is
for what utilities cannot say (an SVG stroke, a keyframe) and reads `var(--token)` there too. Every
user-facing string goes through vue-i18n; the engine is never imported, only
`web/src/engine/messages.ts` (`vue-page-patterns`).

---

## 5. States, accessibility and responsive layout

Every run state, notice and dialog follows `docs/features/ui/` for what it says and offers and the
app kit for how it looks; no number is shown without its qualifiers. Every interactive element
shows the focus ring on `:focus-visible`, motion honours `prefers-reduced-motion`, grades and
statuses never rely on colour alone, and the narrow layout follows the kit's breakpoint. Building or
changing an interactive surface? Read
[references/states-a11y-responsive.md](references/states-a11y-responsive.md) first.

---

## 6. Workflow

Copy this checklist and tick items as you go:

```text
Design-system change:
- [ ] 1. Classified: spec in docs/features/ui? matching app kit screen or state? component contract?
- [ ] 2. Relevant sources from §1 read
- [ ] 3. Existing implementations searched
- [ ] 4. Mismatches resolved per §2; the spec fixed first, an export fault noted upstream
- [ ] 5. Implemented with existing tokens and components; anything new justified
- [ ] 6. Validation clean; both themes, desktop and narrow checked
- [ ] 7. Parity rerun for the touched states
- [ ] 8. Reconciliation summarised
```

1. **Classify the change.** Is the surface specified in `docs/features/ui/`? Does the app kit show
   it? Is there a `docs/design_system/components/` contract?
2. **Read the relevant sources** from §1.
3. **Search for existing implementations** in `web/src/components/`, `web/src/pages/` and
   `web/src/composables/`.
4. **Resolve mismatches** (§2) before writing code.
5. **Implement with existing tokens and components** (§3, §4, §5). When something new is needed,
   say which existing option was evaluated and why it was not enough.
6. **Validate.** Run every row of the validation matrix in `AGENTS.md` that matches the changed
   paths; for `web/src/**` that is `make verify-web`, then `scripts/check-file-budgets.sh`. Then
   check both themes and both the desktop and the narrow layout (`make web-dev`, or `make web-demo`
   for every state without a server).
7. **Parity.** `make demo-parity SCENARIO=...` for the states the change touches, and
   `make demo-parity-full` after a token, theme or layout change (`demo-parity` skill).
8. **Summarise the reconciliation**: which source was stale, what changed, and which upstream
   notes remain for the Claude Design project.

Before submitting, confirm: no raw colours, sizes, durations or arbitrary Tailwind values; no
external URL; shadcn-vue primitives used where they fit; no behaviour defined by the app kit or
`docs/features/ui/` changed silently.
