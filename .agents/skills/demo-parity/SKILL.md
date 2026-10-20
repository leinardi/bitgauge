---
name: demo-parity
description: >
  Compare BitGauge's design kit prototype (docs/design_system/ui_kits/app/) with the Vue demo
  (VITE_DEMO=1) and place each difference: run make demo-parity, read the coverage line and the
  findings, reproduce one on both sides, decide whether it belongs to the demo's link or scenario,
  the Vue app, the spec or the export, then fix it or record it. The export is never edited here.
  Use when the user asks to find or fix differences between the prototype and the demo, when
  editing web/src/demo/**, web/parity/** or reading docs/design_system/ui_kits/app/**, when adding
  or changing a UI feature, or when a demo-parity run or web/parity/coverage.test.ts fails.
---

# Demo parity: the design kit vs the Vue demo

The full reference is [`docs/engineering/demo-parity.md`](../../../docs/engineering/demo-parity.md).
This skill is the working loop. Working through many differences at once, or accepting any, is the
[`parity-triage`](../parity-triage/SKILL.md) skill.

Parity runs on demand and never in CI. The kit is the export's prototype: `ui_kits/app/` is never
edited here ([docs/README.md](../../../docs/README.md#design-export)), even when it is the side
that is wrong.

## 1. Run

```bash
make demo-parity                          # the light-desktop project only
make demo-parity SCENARIO=test/*          # ids or prefix/*, comma-separated
make demo-parity-full                     # all four projects; after a token, theme or layout change
```

Never pass Playwright's own filters (`--grep`, `--project`, a file): the harness refuses them,
because the baseline is judged against what its own selection says ran.

## 2. Read the result

- **`harness: <side> <scenario> step <n>`**: a step could not reach its target, so nothing was
  compared. Fix `web/parity/drivers.ts` (side-specific locators and waits) or the scenario. This is
  never something to accept.
- **"difference(s) not in .parity-baseline"**: a new difference. Place it (§3).
- **"baseline entries no longer found"**: fixed, or changed. If it was fixed on purpose, run
  `make demo-parity-update` with the same `SCENARIO`/`MATRIX`. If a fix turned one difference into
  another, place the new one.
- **The coverage line** says what was really compared. Entries outside this run's selection are
  not checked, and nothing is claimed about them.

`make demo-parity-report` shows each test's screenshots, its heatmap, both raw accessibility
snapshots and `findings.json`.

## 3. Place one difference

1. Serve both sides: `make demo-parity-servers` (run it in the background). The prototype is on
   `http://127.0.0.1:5183/ui_kits/app/index.html`, the Vue demo on `http://127.0.0.1:5182/`
   (`PARITY_PROTO_PORT` and `PARITY_DEMO_PORT` move them).
2. Reproduce it on both sides, in a browser or with
   `npm --prefix web exec --no -- playwright open <url>`. Reach the state through each side's demo
   panel: the kit's **Force state** (with its v0.3 scope on), the Vue demo's **Force state** or the
   scenario that starts the run. The harness's own steps for each scenario are in
   `web/parity/drivers.ts`.
3. Place it, in this order:
   1. **Adapter**: the demo's link or scenario (`web/src/demo/`) does not reach the state the kit
      shows, or its fixtures say something else (a server name, a measured value). Fix the demo,
      within [frontend.md §9](../../../docs/features/technical-stack/frontend.md#9-demo-build).
   2. **Vue**: the app renders the same state differently: a missing label, a different weight, a
      wrong token. Fix the app with `design-system-guard`, and `vue-page-patterns` for pages.
   3. **Spec**: a difference in behavior (what a state says, shows or offers) is settled by
      [`docs/features/ui/`](../../../docs/features/ui/README.md), which wins over the export on
      behavior. A gap there is a docs change first (`spec-change`), and the code follows.
   4. **Export**: the kit is wrong or out of date. It wins on visuals, so a visual fault of its own
      is never fixed here: write a note in
      [`design-system-upstream.md`](../../../docs/engineering/design-system-upstream.md) for the
      Claude Design project, and the next export carries the fix. Until then the difference stays
      in the baseline, decided through `parity-triage`.
   5. **Intentional**: the difference is right. Accepting it is a triage decision (§4).
4. Fix it, rerun the scenario, then `make demo-parity-update` for the entries the fix removed.

## 4. Accepting

A new difference enters the baseline only through `parity-triage`: it admits only what the user
decided, per cluster, from a complete full-matrix run. Pending differences keep failing
`make demo-parity` until then.

- Never accept in bulk, and never accept a difference the user did not decide. "Pre-existing" is
  not a reason for a new difference.
- `make demo-parity-accept MATRIX=full REASON="..."` is for adopting the harness (§ The Baseline in
  the reference) and the re-identification carry-over of `parity-triage` § Fix, not for triage.
- Update and accept write only after a complete run (no harness error, nothing missing or
  interrupted). A refused write leaves `.parity-baseline` unchanged; fix the cause and rerun.
- Never edit `.parity-baseline` by hand.

## 5. Extending

- **A new scenario**: look at the target on both sides first. Then add an entry in
  `web/parity/scenarios.ts`, and a driver method if the step is new. When the two sides need
  different locators or waits, that goes in the driver, never in the scenario. Locators are role
  and name only.
- **A new normalization rule** (`web/parity/normalize.ts`) hides a class of difference for
  good, so say why a person could not see it. A measured number may be masked; its unit, label and
  qualifiers never are.
- **A new page or state**: `web/parity/coverage.test.ts` fails until it has a scenario and a row.
  The routes Vue answers with the not-available page must stay exactly the prototype screens the
  app does not have yet, none since v0.2. A kit panel choice of the v0.3 scope needs a scenario too.
- After editing `web/parity/**`, run `make verify-web` (unit tests, lint, typecheck), then
  `make demo-parity`. If the change could alter findings, run `make demo-parity-full` too.
- After editing `web/src/demo/**`, also run `make verify-web` and `scripts/check-file-budgets.sh`;
  the demo is production source and holds to the same ceiling.

## 6. When a feature changes

The harness sees only what a scenario visits. For every new or changed feature:

1. A demo scenario first (`web/src/demo/scenarios.ts`), so the Vue demo can reach the new state at
   all; the driver's starting and held states follow its start flags and holds, which
   `coverage.test.ts` checks.
2. A parity scenario for every new screen, dialog or state (§5).
3. Run `make demo-parity`, and `make demo-parity-full` after a token, theme or layout change.
4. Triage what is new with `parity-triage`. A renamed label brings its differences back as pending
   under new identities: confirm with the user that it is the same decision before
   `snapshot --extend`.
