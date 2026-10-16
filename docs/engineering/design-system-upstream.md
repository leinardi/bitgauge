# Design System Upstream Notes

The design export in `docs/design_system/` is never edited in this repository
([docs/README.md](../README.md#design-export)). When the demo parity triage decides that the export
is the side to change (a triage cluster's `upstream` action in `.parity-triage.json`), or when the
Vue app needs a value the export draws only as a literal with no token (the `design-system-guard`
skill), the change is written down here instead, as a note to paste into the Claude Design project,
so that the next export carries it. Once an export with the change has been imported, its note is
removed.

Each note names the triage cluster or the skill it comes from, the kit file and the element, what
the export shows, and what it should show, with the reason; behavior comes from
[`docs/features/ui/`](../features/ui/README.md), visuals from the export's own tokens.

## Notes

### About: no Credits card

From the maintainer's decision of 2026-10-16, with
[ui/screens.md §5](../features/ui/screens.md#5-other-clients--about--about). In
`ui_kits/app/About.jsx`, the aside ends with a Credits card: the five projects, each with the
milestone that uses it, and the trademark and affiliation note. The screen should have no credits:
the README and the docs credit those projects and note the trademarks. Remove the card, the
`credits` list in `renderVals()` and the `from()` helper if nothing else uses it; the aside ends
with the Privacy card.
