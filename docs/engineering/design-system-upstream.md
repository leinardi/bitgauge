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

- **`v02-fixture-slowdone-unstable`**, `ui_kits/app/TestScreen.jsx`, state `slowdone`: the
  upload tile's sub line and the connection strip read `2 streams · plateau: no-gain`. They should
  read `2 streams · plateau: floor-limited`. On the kit's 210 kbit/s upload, a trial to 4 streams
  would give each about 6.4 KiB/s, under the 8 KiB/s floor, so a ramp that kept its second stream
  skips it as `floor-limited`
  ([measurement.md §8.2](../features/measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare));
  `no-gain` needs one stream to fill the link within 5 %, which a 48 ms round trip per request
  cycle leaves on the bound. The download keeps `no-gain`.
