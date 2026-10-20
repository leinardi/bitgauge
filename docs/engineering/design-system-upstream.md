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

### MetaList facts: a long value covers its label

From the `design-system-guard` skill. Kit file `components/layout/layout.css`, the `.mrow` rules
of `MetaList` with `facts`, seen on the About card's Version row (`ui_kits/app/About.jsx`).

The export gives the label `.lb` `flex: 1; min-width: 0` and the value `.val`
`white-space: nowrap`. When a value is wider than the row, the label shrinks to zero width and the
value draws over it. The kit's fixtures fit, so the prototype never shows it, but real values
need not: `server.display_name` takes up to 64 characters (configuration.md §2.1), and a build
line with a long version does not fit in the About rail either. It should keep the label at its
natural width (drop `min-width: 0` from `.lb`) and let the value wrap, right-aligned (`.val`:
`min-width: 0; text-align: right; overflow-wrap: break-word`, without `nowrap`), with the build
date kept on one line. The Vue About page already does this.
