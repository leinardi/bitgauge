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

### Continuous chart label: say when the warm-up is shaded

From triage cluster `v03-cont-chart-title`. Kit file `ui_kits/app/TestScreen.jsx`, the Continuous
states' throughput chart (`chartBase`) and its accessible label.

The kit's label reads "Throughput · session: Download # Mbit/s, 42:18 elapsed; latency under load
on a second scale" while the chart still shades the run's first seconds as warm-up. It should add
"; warm-up shaded" whenever the warm-up band is drawn, as every other throughput chart's label
does, so a screen reader hears what the shading means. The Vue chart already does this.

### Continuous Results list: the run's end time in the locale's format

From triage cluster `v03-cont-results-terms`. Kit file `ui_kits/app/TestScreen.jsx`, the Elapsed
row of a Continuous run with a run length (`sub: 'of ' + rlS + ' · ends 16:44'`).

The kit writes the end time as "16:44" whatever the locale. Times follow the active locale
([ui/i18n-a11y.md](../features/ui/i18n-a11y.md), as `v02-date-format` decided), so in en-US it
should read "ends 4:44 PM". The Vue Results list already does this.

### Continuous run stopped in its warm-up: the Cancelled state

From triage cluster `v03-cont-stopped-in-warmup`. Kit file `ui_kits/app/TestScreen.jsx`, the
`cont-warmup` state.

The kit shows a separate Stopped state: "Stopped · During warm-up · not saved" on the gauge, a
"Continuous run stopped during warm-up" notice, the phase list's "cancelled · in warm-up · 0:06"
and the Elapsed row "stopped during warm-up". A Continuous run stopped before 3 fully known 1 s
cells is `partial` with its direction `insufficient-data`, and gets the Cancelled state's Keep in
history and Download JSON ([ui/screens.md](../features/ui/screens.md), Done: Continuous). It
should show the Cancelled state: "Cancelled · Partial results · not saved" on the gauge, the phase
list's "Download done · insufficient data", the "Test cancelled during download" notice, and the
Duration row "stopped by you", as the Vue Test screen does.

### Continuous states: the live announcements

From triage cluster `v03-test-continuous-announcement`. Kit file `ui_kits/app/TestScreen.jsx`, the
live region's messages (`PH`).

The kit announces "Continuous download running.", "Continuous upload running.", and at the end
"Continuous run stopped. Saved to history." or "Continuous run stopped during warm-up. Partial
results were not saved.". The live region announces the phase as a standard run does, at most
every 5 s ("Download, 921 megabits per second", "Upload sending, …"), and the result summary when
the run ends ([ui/i18n-a11y.md](../features/ui/i18n-a11y.md)). It should announce those, without
the separate Continuous messages, as the Vue Test screen does.

### Continuous result notices: durations in seconds and the data-used sentence

From triage cluster `v03-result-continuous-data-used-notices`. Kit file
`ui_kits/app/ResultDetail.jsx`, the Continuous result's Confidence and notices list.

The kit writes the steady window as a clock time ("the steady window covered 220:11:54") and each
data-used notice as "Passed at 0:12:34 into the run.". Durations are written in seconds with one
decimal ([ui/screens.md](../features/ui/screens.md), the format table), and the data-used notice
reads "This run passed 1.00 TB.", the data with 3 significant digits. The Vue Result detail
already does this.

### Continuous states: the settings summary names what changed

From triage cluster `v03-test-continuous-settings-summary`. Kit file `ui_kits/app/TestScreen.jsx`,
the settings summary beside Edit on the Continuous states.

The kit reads "Standard preset · Auto streams · No data cap" on a Continuous run, every setting
and the wrong preset. The summary shows the settings that differ from the server defaults, one
chip each ([ui/screens.md](../features/ui/screens.md) section 1): it should read
"1 changed: Continuous", as the Vue Test screen does.

### Continuous gauge: the live line reads "avg so far"

From triage cluster `v03-cont-chart-meta`. Kit file `ui_kits/app/TestScreen.jsx`, the Continuous
states' gauge readout (`sub: 'avg ' + rn(K.av) + ' · peak ' + rn(K.p90)`).

The kit's live line under a Continuous reading is "avg 921 · peak 936", where the standard run's
reads "avg so far 597 · peak 610" (`liveSub`). The run-wide average is still moving while the run
goes on, so it should read "avg so far 921 · peak 936", the numbers sharing the unit of the
reading above them, as the Vue Test screen does.
