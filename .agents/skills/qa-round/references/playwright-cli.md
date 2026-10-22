# playwright-cli in a QA round

Run it from the agent's scratch directory, pointing npm at the repository's `web/`, so the
`.playwright-cli/` output lands there rather than in the repository:

```bash
cd /tmp/qa/<area>
P="npm --prefix <repo>/web exec --no -- playwright-cli -s=<session>"
$P open http://127.0.0.1:18090/            # --browser=firefox|webkit, --headed to watch
$P resize 390 844
$P --raw eval "() => document.title"       # --raw prints only the value
$P set-color-scheme dark                   # also set-reduced-motion, set-forced-colors
$P requests                                # every request since the page loaded
$P close
$P --help
```

The tool's own guide is
`web/node_modules/@playwright/cli/node_modules/playwright-core/lib/tools/skills/playwright-cli/SKILL.md`.

## Traps

- **The AI snapshot omits some accessible names.** A dialog or menu item can look unnamed in the
  snapshot while the browser names it correctly. Before reporting a missing name, read it with
  `eval` (`aria-labelledby`, `aria-label`, the label's text) or from Chromium's accessibility tree
  over CDP.
- **`.playwright-cli/` is in the working directory, shared by every session run from it.** The
  newest `page-*.yml` snapshot may be another session's. Read the snapshot path the command
  printed, never "the latest file".
- **A session name is not isolation.** Two agents that share a helper script, or one that guesses
  another's session name, drive each other's browser: runs start, dialogs open, the browser closes.
  Give each agent its own scratch directory and, for long stateful flows, a private headless
  browser through `web/node_modules/playwright` in a one-shot script.
- **Downloads land in the working directory** (Download JSON, the share image). Read them there.
- **The origin is the history.** `127.0.0.1:18090` and `localhost:18090` are two origins with two
  histories and two sets of settings ([edge-cases.md
  §8](../../../../docs/features/edge-cases.md#8-different-origins-give-separate-histories)). Keep
  one host name per stack, and clear the origin's data (`delete-data`) only when the check needs a
  first run.
- **A snapshot is a moment of a live run.** The gauge, the chart and the time left change between
  two commands; read a value and its qualifier in one `eval`, and hold a demo scenario rather than
  racing a real run for a mid-run state.
- **Headless is not hidden.** A headless page counts as visible, so the hidden-tab rules
  ([edge-cases.md §5](../../../../docs/features/edge-cases.md#5-tab-hidden-mid-test)) need the
  page really hidden: `--headed` with another tab selected in front of it (`tab-new`). Read
  `document.visibilityState` before trusting what follows.
- **The clipboard needs a permission** that the session does not grant by default, so Copy summary
  takes its denied branch. Check the granted branch after
  `run-code "async page => await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])"`.
- **jsdom habits do not apply:** this is a real browser, so measure, do not guess.

## Measuring layout

- Sideways scroll: `document.documentElement.scrollWidth > innerWidth`, at every viewport, after
  any action that adds content (a long label, a notice, a result with every qualifier).
- Which element causes it: walk the cards and compare each one's min-content width (set
  `width: min-content` on a clone, or read `scrollWidth`) with the viewport.
- Touch targets: `getBoundingClientRect()` of each button at 390 px, against 44 × 44.
- Focus: press Tab and read `document.activeElement` (its text, role and whether it is visible on
  screen).
- The live region: read the gauge's `aria-live` element's text over a run with a `MutationObserver`
  installed through `eval`, and compare its cadence with
  [i18n-a11y.md §2.1](../../../../docs/features/ui/i18n-a11y.md#21-live-region-for-the-gauge).
- A flash on load: a `MutationObserver` installed with `addInitScript`, recording text with
  timestamps from the first paint.
- History: read IndexedDB with `eval` (`indexedDB.databases()`, then the store) to see what a run
  really saved, rather than trusting the History list.
