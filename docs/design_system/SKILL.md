---
name: bitgauge-design
description: Use this skill to generate well-branded interfaces and assets for BitGauge, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files: `README.md` (voice, foundations, iconography), `tokens.md`, `styles.css`, `components/`
(React components + behaviour contracts `components/*.md`), `ui_kits/app/index.html`, `features/` (product spec).

Hard rules:
- No number without its qualifier. "Insufficient data" shows no number.
- Download teal, upload violet, latency blue and dashed. No other meanings.
- `--fg-faint` is non-text only; smallest text uses `--fg-subtle`.
- Style with `var(--token)` only. No CDNs in production, no external fonts, no emoji.
- Text contrast 4.5:1, non-text 3:1, in both themes.
