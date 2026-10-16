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

### The Early Error Once the Server Is Gone

- **Source:** triage cluster `behavior-error-early-offline`, decided for the spec on 2026-10-16; the
  export of 2026-10-16 carries the offline treatment, and only the header's timing remains.
- **Kit:** `ui_kits/app/TestScreen.jsx`, `_recheck`, which switches the `error-early` state to
  unreachable 600 ms after the state shows.
- **Export today:** a page read as soon as it settles shows the header still connected, with no
  announcement, on a desktop window; a narrow window, slower to settle, shows it switched.
- **Wanted:** the switch within 100 ms of the state showing, as the demo's re-check of
  `GET /info` fails at once once the server is gone.
- **Why:** the forced state stands for the moment after the re-check failed
  ([screens.md §1](../features/ui/screens.md#1-test-home--)); the parity harness reads a page once
  its DOM has been quiet for 300 ms, before a 600 ms delay ends.

### The Insufficient-Data Notice

- **Source:** triage cluster `content-insufficient-notice`, decided for a new wording on
  2026-10-16.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the warn notice of the `insufficient` state.
- **Export today:** "Download: insufficient data", "Download reached its 20 s maximum with the
  first 64 KiB request still in flight, so only one request contributed bytes and there is no
  value. 50.0 kB used. Upload continues; Extended allows up to 40 s per direction."
- **Wanted:** the same title, and the body "Download reached its 20 s maximum without a confirmed
  steady window long enough for a number. 50.0 kB used. Upload continues; Extended allows up to
  40 s per direction."
- **Why:** the result records no count of the requests that contributed, nor which one was in
  flight, so the notice names only the maximum, the data used, the direction still running and
  the offer ([screens.md §7](../features/ui/screens.md#7-notices)).
