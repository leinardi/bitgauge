---
name: parity-triage
description: >
  Work through BitGauge's demo-parity differences as clusters recorded in .parity-triage.json,
  resumable from committed state alone: sync with a full-matrix run, group what nothing owns yet,
  gather spec, kit and Vue evidence, ask the user to decide every conflict, then fix one cluster per
  commit and close it from a complete full run. The user picks the winner whenever the spec, the
  design kit and Vue disagree; the agent never does. Use when the user asks to "triage the parity
  differences", "resume parity triage", "fix the next parity cluster", or runs
  /parity-triage [status|triage|fix|restart].
---

# Parity triage: clusters, decisions, fixes

The reference is [`docs/engineering/demo-parity.md`](../../../docs/engineering/demo-parity.md)
§ Triage; running and reading the harness itself is the [`demo-parity`](../demo-parity/SKILL.md)
skill. The ledger (`.parity-triage.json`) and `.parity-baseline` are the only state: everything
here resumes or restarts from them.

Triage is interactive: every decision is the user's, asked with `AskUserQuestion`. It never runs
unattended, and an agent working without the user stops at Decide.

Modes: `status` (Sync only, then report), `triage` (Sync, Cluster, Evidence, Decide), `fix` (Sync,
then Fix the next cluster), `restart` (Restart, then `triage`). No mode given means `triage`.

The helper is `make demo-parity-triage CMD="..."` (status when `CMD` is unset). Make expands `$`, so
a rule with an anchor such as `^font-weight$` goes straight to node instead:

```bash
make demo-parity-triage CMD="drafts --limit 10"
cd web && node parity/triage/cli.ts try '{"scenarios":["test/idle"],"kind":"^font-weight$"}'
```

Commands: `status`, `drafts [--limit N]`, `show <id>`, `try '<match JSON>'`, `pending`,
`snapshot <id> [--extend]`, `admit <id>`, `close <id> [--note "..."]`,
`release <id> --match '<match JSON>'`; `--json` on any of them. Exit 1 means a flag or a refused
mutation, 2 a usage error.

## Sync

Every mode starts here.

1. `make demo-parity-update MATRIX=full`. A harness error stops the session: fix it as the
   `demo-parity` skill says, never triage past it. Parity failures are expected; they are the
   pending differences.
2. `make demo-parity-triage`. The coverage line must read `matrix full · scenarios all · complete`.
3. Work the flags in this order:
   - **problems** (validation problems, rule overlaps, hash collisions): fix the ledger first.
   - **regressions** (a `done` cluster with owned entries back, or new rule matches): reopen it by
     setting its status back to `in-progress` with a new action, or create a new cluster for what
     came back.
   - **scope growth** (unowned matches on a decided, accepted or deferred cluster): ask the user
     whether the new entries share the decision. Yes: `snapshot <id> --extend`. No: narrow the
     rule, or split it out with `release <id> --match '...'` and a new cluster.

## Cluster

1. `drafts` suggests groups of unclustered entries, largest first, each with a matching rule.
2. `try '<match JSON>'` the rule, narrowed until it holds one decision's worth: it shows the counts,
   samples, and what other clusters already own of it.
3. Add the cluster to `.parity-triage.json` as `open`: `id`, `title`, `match`, `type`
   (`conflict`, `adapter`, `fixture` or `harness`), `aspect` (conflicts only: `style`, `content`,
   `behavior`, `feature` or `a11y`), and `decision`, `owned`, `resolution` null or empty. Then
   `status`.
4. Non-conflict types (the demo's link or scenario, its fixtures, harness noise) are confirmed, not
   decided. Ask in batches of up to 4 `AskUserQuestion` questions. For each one confirmed, record a
   `confirmation` decision with its actions, set `decided`, and run `snapshot <id>`.

## Evidence

Before a conflict is asked about, record in `evidence` what each source says, with a ref and an
excerpt:

- the run: `make demo-parity-report` (screenshots, heatmap, snapshots, `findings.json`), and both
  sides by hand (`make demo-parity-servers`, see the `demo-parity` skill);
- **spec**: `docs/features/`, `ui/` above all (`says: "silent"` when it says nothing);
- **kit**: `docs/design_system/ui_kits/app/`, and the export's tokens and component contracts;
- **vue**: `web/src/`;
- for a `feature` conflict, `docs/STATUS.md`, which says whether Vue has the feature at all.

## Decide

- One `AskUserQuestion` question per conflict, up to 4 per round. The preview holds the three
  excerpts (spec, kit, Vue) and the size (differences and entries).
- Options: **Kit wins**, **Spec wins**, **Vue wins**, **Keep the difference**. "Other" covers a new
  decision (winner `new` with its `text`) or a deferral.
- The default follows the precedence of
  [docs/README.md](../../../docs/README.md#precedence): **the export wins on visuals, the spec wins
  on behavior**. Put Kit wins first, marked recommended, for a `style` conflict, and Spec wins
  first for `content`, `behavior` and `feature`; for `a11y`,
  [`ui/i18n-a11y.md`](../../../docs/features/ui/i18n-a11y.md) wins over the export, so Spec wins
  first there too. Say why when the evidence argues against the default.
- **Never record a choice the user did not make.** A recommendation is not a decision.
- Afterwards, for each answer:
  - record the `decision` (`verdict` with its winner, or `deferral`) with the user's rationale
    and today's date;
  - derive the actions: every source that disagrees with the winner gets one. A disagreeing kit
    gets an `upstream` action, a note in
    [`design-system-upstream.md`](../../../docs/engineering/design-system-upstream.md): the export
    is never edited here. A silent spec gets an action only for a `behavior` or `feature` conflict;
  - set the status: `decided` for spec, kit, vue or new; `accepted` for keep; `deferred` for a
    deferral;
  - run `snapshot <id>`, and `admit <id>` for an accepted cluster;
  - run `status`.
- Commit the ledger and the baseline together as `test(parity): triage <n> clusters`.

## Fix

One cluster per commit.

1. Order: `harness` first, then `adapter` and `fixture`, then conflicts by owned size, largest
   first. `status` lists the decided clusters under next.
2. Fix it with the matching skills (`design-system-guard` and `vue-page-patterns` for Vue,
   `spec-change` for the spec, `demo-parity` for the harness and the demo), and mark each action
   `done`. An `upstream` action is done when its note is written; the difference it covers stays
   until an export that carries the change is imported.
3. Run the validation matrix in `AGENTS.md` for what changed, then
   `make demo-parity-update MATRIX=full SCENARIO=<required scenarios>`: every scenario the cluster
   owns an entry in, plus every scenario its rule names.
4. `close <id>`; it refuses until no owned entry is present and nothing new matches. A cluster
   whose only remaining action waits on an export stays `in-progress` until that export arrives.

   A fix can change text that undecided baselined differences carry (a fixture value, a label), so
   they come back as new under a new identity. Carry them over only when the cluster has an action
   that says so, and only when every new difference in a full run pairs with a gone one of the same
   scenario, layer, path and kind, its detail differing only in that text. Then run
   `make demo-parity-accept MATRIX=full REASON="..."` in place of the update in step 3, with a
   reason naming the cluster. Anything else new stops the fix.
5. Commit the code, `.parity-baseline` and `.parity-triage.json` together, typed by whether the
   change ships (AGENTS.md § Commit messages):
   - `fix(web)` for the Vue app;
   - `test(demo)` for the demo's link, scenarios or fixtures;
   - `docs(<area>)` for the spec, listing the symlinked pages changed for the user to paste into
     Claude Design (`spec-change` §6);
   - `docs(design-system)` for an upstream note;
   - `test(parity)` for the harness or the ledger.

   A fix that spans types gets one commit per type, and `close` happens in the last one.

## Restart

Delete the `open` clusters that have no decision, keep every other cluster, then cluster again from
`drafts`.

## Never

- Hand-edit `owned`, `resolution` or `.parity-baseline`: only the helper writes them.
- Edit the design export to settle a cluster; it changes only through the next export.
- Accept in bulk, or accept anything the user did not decide. The one exception is the
  re-identification carry-over in § Fix, which adds no difference.
- Close or admit from anything but a complete full-matrix run. The helper refuses, and the answer is
  to run one, never to work around it.
