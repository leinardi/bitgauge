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

### History Compare dialog: its rows, its section headers and the page behind it

From triage clusters `v02-compare-rows`, `v02-compare-table-headers` and `v02-modal-inert-page`,
and `v03-history-compare-h2-compare-table`, `v03-history-compare-h2-page-behind-dialog`,
`v03-history-compare-h2-geometry` and `v03-history-compare-h2-scores-geometry` for B over HTTP/2.
Kit file `ui_kits/app/History.jsx`, the Compare results dialog (`DS.Dialog`, `cmpGroups`), with B
over HTTP/1.1 and over HTTP/2 alike.

- The kit puts Parameters and Results in a row group each, headed by a `th scope="rowgroup"`, so
  they read as row headers. Both should sit in one table body, each section row's cell a column
  header spanning the table, and each metric name a row header (`th scope="row"`)
  ([ui/i18n-a11y.md](../features/ui/i18n-a11y.md#2-accessibility)).
- The parameters read "Off" for no data cap and "Auto" for the stream mode. They should read
  "None" and "Auto, up to 6", and the results row "Idle probe timeouts" should read
  "Probe timeouts", the rows of [ui/screens.md](../features/ui/screens.md#3-history--history).
- The page under the dialog stays in the accessibility tree: the header, the filters and the
  history list are still reachable. The dialog is focus-trapped, so the page behind it should be
  inert while it is open.
- The dialog's rows, cells and score bands then sit where those rows put them.

The Vue Compare dialog already does all of this.

### HTTP loaded responsiveness rows: each direction named in text

From triage clusters `v03-path-b-standard-wording` and `v03-path-b-direction-icons`. Kit file
`ui_kits/app/TestScreen.jsx` and `ResultDetail.jsx`, the HTTP loaded responsiveness block of the
load card on the standard run's Test states and Result detail.

The kit draws each direction as an icon labeled "Download" or "Upload" followed by separate texts:
"1,420RPM", "—" or "not enough samples". The direction icons should be decorative
(`aria-hidden`), and each direction's row should name it in text before its RPM or state, so it
reads "Download 1,420 RPM TM95 # ms · 13 samples" or "Download —", as on the Responsiveness and
Continuous states. The Vue load card already does this.

### Result detail: the quality scores name their basis

From triage clusters `v03-result-scores` and `v03-result-continuous-scores`. Kit file
`ui_kits/app/ResultDetail.jsx`, the Good for list of a run whose upload has no loaded-latency
increase (`ll-insufficient-samples`, `ll-reservation-broken`) and of the 2 h and 9 d Continuous
results, which measure the download only.

The kit's heading reads "Good for" alone. When only one direction has a loaded-latency increase,
the scores name their basis ([ui/screens.md](../features/ui/screens.md#6-result-metrics-units-and-precision)):
it should read "Good for download only". The Vue Result detail already does this.

### Share image: the direction labels in sentence case

From triage clusters `v03-result-share-image` and `v03-result-continuous-share-image`. Kit file
`ui_kits/app/ResultDetail.jsx`, the share image's direction labels.

The kit writes "DOWNLOAD" and "UPLOAD" as literal capitals, which a screen reader can spell out
letter by letter. They should be "Download" and "Upload", set in capitals by
`text-transform: uppercase`, so they look the same. The Vue share image already does this.

### Continuous result: the Test parameters rows

From triage cluster `v03-result-continuous-test-parameters`. Kit file
`ui_kits/app/ResultDetail.jsx`, the Test parameters card of the 2 h and 9 d Continuous results.

The kit lists a Stored cells row ("1 min · runs over 1 h, up to 24 h"), names the ramp in the
streams row ("Auto · Standard ramp · 6 · plateau: cap") and writes the ended stream count as
"Auto · ended at # s". The card lists
[ui/screens.md](../features/ui/screens.md#2-result-detail--resultid)'s rows: it should drop the
Stored cells row and the ramp's name, add the data cap with the data used ("Off · 91.3 TB used"),
and name the direction the ended count belongs to ("Auto · ended at # s (download)"). The Vue
Result detail already does this.

### Continuous result chart: the warm-up band in seconds

From triage cluster `v03-result-continuous-warmup-format`. Kit file
`ui_kits/app/ResultDetail.jsx`, the 2 h Continuous result's chart (`wuText`).

The kit writes the warm-up band as "Warm-up · not stored (0–0:07)", on the chart's m:ss axis.
Durations are written in seconds with one decimal
([ui/screens.md](../features/ui/screens.md#6-result-metrics-units-and-precision)): it should read
"Warm-up · not stored (0–6.5 s)", as on a standard run. The Vue Result detail already does this.

### About screen: the client snippets as the compatibility spec writes them

From triage clusters `v03-about-librespeed-json` and `v03-about-networkquality-verbose`. Kit file
`ui_kits/app/About.jsx`, the LibreSpeed and networkQuality client snippets.

- The kit compresses the librespeed-cli server list to four lines. It should write the JSON one key
  per line, as [compatibility.md](../features/compatibility.md#23-librespeed-cli-server-list)
  does.
- The kit captions the verbose networkQuality line "Verbose". The line should end with the comment
  "# verbose, per-flow detail", as
  [compatibility.md](../features/compatibility.md#35-client-usage) writes it, in place of the
  caption.

The Vue About page already does both.

### Settings: the Result label caption names the link parameter

From triage cluster `v03-settings-result-label`. Kit file `ui_kits/app/Settings.jsx`, the Result
label row of Display and behavior.

The kit's caption reads "Optional, up to 64 characters. Pre-fills the label of every result in
this browser." The setting does for every result what the `label` link parameter does for one page
load ([ui/screens.md](../features/ui/screens.md#4-settings--settings)), so the caption should add
", as the label link parameter does for one page load", as the Vue Settings page does.
