# Demo Parity Harness

The design export's app kit (`docs/design_system/ui_kits/app/`) is a clickable prototype of every
screen and state; the Vue app in demo mode (`VITE_DEMO=1`,
[frontend.md §9](../features/technical-stack/frontend.md#9-demo-build)) runs the real engine against
a simulated link. The harness drives both into the same v0.1 states, compares what they show, and
holds the known differences in a committed baseline (`.parity-baseline`) that may only shrink. It
finds two kinds of drift: the Vue app moving away from the export, and gaps in the demo (its links,
fixtures and scenarios in `web/src/demo/`) that keep it from reaching the state the kit shows.

It runs on demand, never in CI, and never touches the image or `web/dist`: the prototype loads
React, ReactDOM and Babel from `unpkg.com`. After the first run they come from a local cache
(`web/parity/.cache/cdn/`), so later runs work offline; nothing else off the two local servers is
let through.

## Running It

```bash
make demo-parity                          # default project: light, 1440×900
make demo-parity SCENARIO=test/*          # scenario ids or prefix/*, comma-separated
make demo-parity-full                     # all four projects: {light,dark} × {1440×900,390×844}
make demo-parity-report                   # the HTML report of the last run
make demo-parity-update                   # drop baseline entries a complete run no longer finds
make demo-parity-accept REASON="..."      # accept a complete run's new differences, with a reason
make demo-parity-servers                  # both sides on the harness ports, to look at by hand
make demo-parity-browsers                 # install the pinned Chromium when it is missing
make demo-parity-triage CMD="..."         # the triage helper over the ledger and the last run (§ Triage)
```

`MATRIX=full` works on every target. Playwright's own filters (`--grep`, `--project`, a file
argument, `--reporter`, `--last-failed`) are refused: the reporter judges a run against what the
selection says ran, so the selection has to be the harness's own. The 390×844 window is the kit's
mobile frame; both sides switch to their mobile layout below 1140 px.

A full-matrix run takes about two minutes on a 32-thread machine: the demo plays its runs in real
time, the longest a complete Standard test of about 28 s.

## What It Compares

Each scenario (`web/parity/scenarios.ts`) runs its steps on both sides: one per v0.1 Test screen
state (`test/<state>`, the kit's `TEST_STATES` without the continuous ones, which are v0.2), plus
`about` and `about/unreachable`. Steps name states and screens; how each side reaches them lives in
`web/parity/drivers.ts`:

- **A Test screen state** is forced through each side's demo panel. The prototype reads its panel
  from `localStorage` (`bitgauge-kit-demo`) when the page loads, and a forced state wins over its
  run timeline, so the driver stores the state and loads the page again. The Vue side picks the
  state in `DemoPanel`'s Force state control, which plays that state's scenario and holds it at the
  kit's instant. The one exception is `basepath`: the kit's state is the page-path mismatch, so the
  Vue demo, built for `/`, is opened under `/speed/`, where the page detects it before any request.
- **A screen** is reached by its navigation item's name in the Primary navigation the window shows;
  the item marked current is the proof it landed.
- **An unreachable server** is the prototype panel's Server unreachable switch and the Vue demo's
  `offline` scenario.

Before reading anything, both pages are put in the same state: the wall clock fixed, UTC, en-US,
reduced motion, the project's color scheme, and the prototype's theme and v0.1 scope set to the
product's defaults (System, no History), with its Demo panel's browser on Chrome, since the harness
drives Chromium and the panel defaults to Firefox. Then the harness waits until the DOM has stopped
changing.

| Layer | Reads | Produces |
| --- | --- | --- |
| Content | The accessibility tree of each region: the header (the top bar, and on a narrow window the tab bar), the page itself, notices (alerts and statuses outside every landmark), open dialogs | `missing` (only in the prototype), `extra` (only in Vue), `changed` (same element, different name or text), `attrs` (different state such as `disabled` or `level`) |
| Style | A bounded set of elements (headings, buttons, links, tabs, radios, column headers and statuses), paired by region, role, name and occurrence | One finding per computed property that differs: font, color, padding, gap, radius, border, size. Lengths within 1px are equal |
| Visual | Full-page screenshots of both sides and a heatmap | Report attachments only, never a finding |

`web/parity/normalize.ts` lists what is deliberately treated as equal, each with its reason:

- a link and a button;
- a paragraph and its text;
- decorative icons;
- empty live regions;
- each side's own page host: the Vue demo shows the origin it is served from and the prototype a
  mocked host, as the spec asks of both, so either reads as one token (never any other host);
- a measured value: the number of a rate, latency, size, duration or share, also where the gauge's
  note, a result tile or the stop notice words it without its unit (avg so far, peak, median, min,
  a stopped upload's confirmed requests), the prefix of a data size, the number of streams in use,
  and the digits of a time of day. A range (a phase's estimated duration, a scale's bounds) is
  never measured, so it is compared as written.

Anything added there hides a class of difference for good, so it needs the same justification.
`web/parity/compare/style.ts` skips a property only where it cannot render: a border color where
neither side draws a border (no width, or a fully transparent color), a gap outside flex and grid,
and the padding, gap and weight of an icon-only button centered in a box of the same size on both
sides. A corner radius is compared as drawn, at most half the box's shorter side, so `9999px` and
`calc(infinity * 1px)` are the same pill.

### Why the Runs Repeat

The demo measures its simulated link in real time, so a run is only as repeatable as the harness
makes it:

- Measured values change a little from run to run, so the comparison reads their units, labels and
  qualifiers and not their numbers. Whether a number is right is the engine's and the demo's tests'
  business, not parity's.
- The Vue demo plays at 1x. A faster demo moves its link in coarser timer ticks, and its noisier
  throughput samples then mark a LAN result unstable in some runs and not in others.
- For a state that starts a run, the driver waits for Start to turn into Stop: before Start the
  page sits quiet while it loads, and a read then would show Idle. A run its scenario ends (a
  scripted stop, a failure, completion) has arrived once Stop is gone again; a page still showing
  Stop is a harness error, never a difference. A held run has arrived once the page has stayed
  quiet for 1.5 s: a running test changes it every couple of hundred milliseconds at most, and a
  held one never again.
- A scripted stop goes through the page: the demo asks the page to press Stop, as the user would
  ([frontend.md §9](../features/technical-stack/frontend.md#9-demo-build)), so the page's own stop
  path ends the run.
- The auto-start countdown runs in the page, where the demo's hold cannot stop it. It pauses while
  the page is hidden ([ui/flows.md §2](../features/ui/flows.md)), so the driver reports the page as
  hidden and the countdown stays at its start, as the prototype's forced one does.

## Reading a Run

The reporter prints a coverage table after every run:

```text
demo parity · run f9d1bbd8 · matrix full · scenarios all · complete · mode check
  expected  100 pairs (4 projects × 25 scenarios)
  compared  100
  baseline  4066 checked · not checked this run: 0 (project not selected), 0 (scenario filtered out), 0 (not compared)
```

A failed test is one of two different things:

- **A parity failure** lists differences missing from the baseline, or baseline entries that are no
  longer found. The pages rendered and were compared; they disagree with the baseline.
- **A harness error** (`harness: <side> <scenario> step <n>: ...`) means a step could not reach
  its target or a page never settled, so nothing was compared. Fix the driver or the scenario.
  Never accept your way past one; update and accept refuse to write while any exist.

Every run, in every mode and however it ended, also leaves `web/parity/.run/completion.json`: the
run's selection (matrix, scenario filter, mode, projects, scenarios), the pairs it really compared,
and the refusals that would stop it writing the baseline. `complete` is true exactly when there are
none. Parity failures leave a run complete, because comparing is what it was for; an interruption,
a timeout, a missing record, an unfinished test or a harness error does not.

The HTML report (`make demo-parity-report`) holds, per test:

- both screenshots and the heatmap;
- both raw accessibility snapshots of every region;
- `findings.json`.

## The Baseline

`.parity-baseline` is tab-separated, one line per difference:
`projects  scenario  layer  path  kind  detail  reason`. In the projects column, `*` means all
four. The harness writes the file; never edit it by hand.

- A normal run fails on a difference the baseline does not list, on a listed one that is gone, and
  on an entry naming a scenario or project that no longer exists.
- `update` only removes entries. `accept` also adds the run's new differences, with the given
  reason, and keeps the reason of entries already there.
- Both write only after a complete run: every expected pair compared, no harness error, nothing
  skipped or interrupted. Otherwise the file is left byte-identical. The write is atomic.
- Only the pairs a run compared are changed. A default-project or filtered run leaves every other
  entry as it is and reports it as "not checked".

The baseline was adopted from a complete full-matrix run with the reason "present when the harness
was adopted", so `make demo-parity-full` passes from the start; none of its entries has been
triaged yet. Run it after changing tokens, theme or layout, and before accepting anything
style-related.

## Classifying a Difference

For each new difference, decide where it belongs, in this order:

1. **The demo** (`web/src/demo/`): its link, fixture or scenario does not reach the state the kit
   shows, for example a server name or a measured value the fixture gets wrong. Fix the demo.
2. **The Vue app** renders it differently: a missing label, a different weight, a wrong token. Fix
   the app.
3. **The spec.** A difference in behavior (what a state says or offers) is settled by
   [`docs/features/ui/`](../features/ui/README.md), which wins over the export on behavior: a gap
   there is a docs change first, and the code follows.
4. **The export** is wrong or out of date. It is never edited here
   ([docs/README.md](../README.md#design-export)): the export wins on visuals, so a visual
   difference where the export is at fault becomes a note for the Claude Design project, and the
   next export carries the fix.
5. **Intentional.** Accept it with a reason that says why.

`make demo-parity-servers` serves both sides on the harness ports for looking at a difference by
hand: the prototype on `http://127.0.0.1:5183/ui_kits/app/index.html` and the Vue demo on
`http://127.0.0.1:5182/`. These ports are the Makefile's `PARITY_PROTO_PORT` and `PARITY_DEMO_PORT`,
off runhold's 5180 and 5181 so both projects can run the harness at once. Any parity target takes
other ones on the command line (`make demo-parity PARITY_DEMO_PORT=5290 PARITY_PROTO_PORT=5291`); a
port already in use fails the run rather than comparing another project's server.

## Triage

Thousands of differences need different fixes, and the spec (`docs/features/`), the export and Vue
do not always agree on which side is right. Triage works through them as clusters, recorded in the
committed ledger `.parity-triage.json`, so a session resumes or restarts from committed state
alone. The helper is `web/parity/triage/cli.ts`; it is the only writer of what a cluster owns, of
how it was resolved, and of the reasons triage puts in the baseline.

### The Ledger

One cluster per group of differences that one decision covers:

- `match`: a rule (scenarios, projects, layer, and regular expressions on path, kind and detail)
  that finds candidates;
- `type`: `conflict` (the spec, the kit and Vue disagree), `adapter` (the demo's link or scenario
  does not reach the kit's state), `fixture` (the demo's fixtures say something else) or `harness`
  (the comparison itself), and for a conflict an `aspect`;
- `evidence`: what the spec, the kit and Vue each say, with a ref;
- `decision`: a `verdict` (spec, kit, vue, new or keep), a `confirmation` for a non-conflict, or a
  `deferral`, with its rationale and date;
- `actions`, each aimed at `vue`, `spec`, `adapter`, `fixture`, `harness` or `upstream`. No action
  edits the export: a change it needs is an `upstream` action, a note in
  [`design-system-upstream.md`](design-system-upstream.md) to paste into the Claude Design project;
- `status` (`open`, `decided`, `in-progress`, `accepted`, `deferred`, `done`);
- `owned` and `resolution`, which only the helper writes.

The helper validates the whole ledger on every command and reports what is wrong instead of
failing: the invariants per status, unique ids, rules that compile and select something.

### Ownership

A rule only discovers. What a decision covers is the cluster's `owned` snapshot: per scenario, a
12-character hash of each difference (layer, path, kind, detail; never the reason) with the projects
it covers, `*` for all four. Owned entries are found again by identity alone, so narrowing or
widening a rule never moves a decided entry. A rule's matches that no cluster owns are new
candidates on an open cluster and scope growth on a decided one. One entry is never owned by two
clusters; two rules may overlap only on entries one of them owns.

`status` fails (exit 1) on a regression (a `done` cluster whose owned entries are back, or with new
matches), on scope growth, and on problems: validation problems, rule overlaps on unowned entries,
hash collisions.

### One Acceptance Policy

Nothing enters the baseline without a decision. A difference the baseline does not list stays
pending, and keeps failing `make demo-parity`, until a cluster that owns it is `accepted` and the
helper admits it with `triage <id>: <rationale>` as its reason. To work through many differences,
or accept any during triage, use the helper rather than `make demo-parity-accept`: it admits only
what was decided, per cluster, from a complete full-matrix run. Decisions are the maintainer's: the
helper records them, it never makes them.

Every mutation needs a valid completion record from a complete, full-matrix run whose scenarios
cover the cluster's required scenarios: those it owns an entry in, and those its rule names. A
refused command lists every reason and writes nothing. A `done` cluster keeps the run it was
closed under in `resolution.run`, so it validates without `.run/`, which the next run wipes.

### Commands

```bash
make demo-parity-triage                        # status: coverage, problems, clusters, flags, next work
make demo-parity-triage CMD="drafts --limit 10" # suggested clusters for what nothing owns or matches
make demo-parity-triage CMD="show <id>"        # owned present, owned gone, unowned matches
cd web && node parity/triage/cli.ts try '<match JSON>'          # what a rule would match
make demo-parity-triage CMD="snapshot <id>"    # own the rule's matches (--extend adds new ones)
make demo-parity-triage CMD="admit <id>"       # an accepted cluster's owned entries into the baseline
make demo-parity-triage CMD="close <id>"       # a fixed cluster done (--note "...")
cd web && node parity/triage/cli.ts release <id> --match '<match JSON>' # give up what a rule matches
```

Exit codes: 0 when the command did what it was asked, 1 when it refused or `status` found a
regression, scope growth or a problem, 2 on a usage error. Make expands `$`, so a rule with an
anchored regular expression goes to node directly, as `try` and `release` do above. `--json` works
on every command. `PARITY_TRIAGE_LEDGER` and `PARITY_BASELINE_FILE` point the helper at scratch
copies of the ledger and the baseline; a relative path is taken from the repository root, and a
named baseline must exist.

## When a Feature Changes

The harness gates what it already visits. A change to anything a scenario compares fails
`make demo-parity`:

- **Stale differences** are fixes: drop them with `make demo-parity-update`.
- **New differences** stay pending until a triage decision covers them (§ Triage). Which of the
  spec, the export and Vue is right is the maintainer's call.
- **A renamed heading or label** gives every difference under it a new identity, because the path
  is part of it. The old ones go stale, the same differences come back pending, and a decided
  cluster reports scope growth; `snapshot --extend` once the maintainer confirms it is the same
  decision.

What no scenario visits is invisible to it. `web/parity/coverage.test.ts`, run by
`make verify-web`, closes the part of that gap that can be enumerated. It fails when:

- a Vue page or a prototype screen has no row in its page table, or a row names one that is gone;
- the routes Vue answers with the not-available page are not exactly the prototype's v0.2 screens
  (History, Settings, Result detail);
- a v0.1 state of the kit's `TEST_STATES` has no scenario, or a scenario names a state the kit
  dropped or a v0.2 one;
- the Vue driver's list of states that start a run disagrees with the start flags of
  `DEMO_SCENARIOS`, or its list of states that hold their run disagrees with their holds.

Dialogs, menus and error states cannot be enumerated, so for every new or changed feature:

1. **A demo scenario first**, so the Vue demo can reach the new state at all.
2. **A parity scenario for every new screen, dialog or state**, with a driver method when the step
   is new.
3. **Run `make demo-parity`**, and `make demo-parity-full` after a token, theme or layout change.
4. **Triage what is new** (§ Triage). Never accept it in bulk.

## Extending It

- **A new scenario**: an entry in `scenarios.ts`, and a driver method when the step is new. When the
  two sides need different locators, that difference goes in the driver, never in the scenario.
- **A new step that cannot reach its target on one side** is a harness error, by design. Keep only
  targets both sides have; the content layer still reports what one side lacks.
- **The unit tests** (`web/parity/**/*.test.ts`, run by `make verify-web`) cover the parser, the
  comparisons, the normalization, the selection, the baseline rules, the capture and settle steps
  over fakes, and the scenario coverage. They need no browser.
