---
name: qa-round
description: >
  Run a hand-driven exploratory QA round of BitGauge with playwright-cli, curl and the server's own
  answers as the source of truth: start the real server on loopback and the demo's simulated links,
  cover every area at every viewport, re-check the previous round's fixes, verify and deduplicate
  the findings, write them to a new file under docs/engineering/qa/, ask the open product questions
  as decisions, and suggest how to split the findings into fix plans of 30-40 each. Use when the
  user asks for "a QA round", "another round of QA", "exploratory QA", "QA with playwright", or
  runs /qa-round.
---

# QA round: exploratory testing of BitGauge

A QA round finds what the automated suites cannot see: a number shown without its qualifier, a
result saved when it must not be, a flow that breaks at a viewport, copy that contradicts the state
beside it, a header or limit that fails open. It never fixes anything. Its product is a QA file
under `docs/engineering/qa/`, the decisions it needs, and a suggested split into fix plans.

This skill holds the method. Findings live in the QA files, never here: they go stale, the files
already track them, and a checklist copied from one round would re-report what the next round
fixed.

## 1. Before the round

1. Read the newest file in `docs/engineering/qa/` in full, and skim the older ones' **Decisions**,
   **By design, no action** and **To investigate** sections. A decided or by-design item is not
   re-reported; an item under investigation gets a verdict this round. The first round has no
   previous file: create the directory with its file in §7.
2. List every finding a commit fixed since the last round (`git log --grep 'QA-'`). Each is
   re-checked in its area and reported as holds, partly or regressed.
3. Note the commit under test (`git log -1`) and that the worktree is clean, then build once
   (`make build`): every stack below runs that `./dist/bitgauge` or the demo build of the same
   commit.

## 2. The stacks

BitGauge has no lab to reset: the server keeps no state beyond its in-memory limits, and history
lives in the browser. A round needs three kinds of link, each for what the others cannot show:

- **The real server on loopback**, for the real engine, the real wire and the HTTP edge.
  `./dist/bitgauge serve` with `BITGAUGE_SERVER__LISTEN=127.0.0.1:<port>`, one process per
  configuration (compatibility layers on, a base path, low limits, metrics on). Loopback is plain
  HTTP/1.1 at the browser's CPU ceiling (multi-Gbit, [edge-cases.md
  §10](../../../docs/features/edge-cases.md#10-very-fast-links-where-the-browser-cpu-is-the-bottleneck)),
  so it never shows a slow or HTTP/2 link.
- **The demo** (`VITE_DEMO=1`), for every state loopback cannot reach on demand: the VPN and
  insufficient links, each error kind, the cancels at each instant, the WebSocket closing,
  Continuous at 60× speed, the base path mismatch, offline. Its scenarios are in
  `web/src/demo/scenarios.ts`, chosen through the demo panel. The demo checks the UI's reading of
  a run, never the engine's arithmetic: the numbers come from a simulated link.
- **A proxy in front** for HTTP/2, TLS, the base path and trusted proxies.

How to start each, and the configurations worth a process of their own:
[references/stacks.md](references/stacks.md).

Real Safari, iOS and a real slow link are out of reach here: Playwright's WebKit is not Safari, and
a shaped link is the accuracy harness's job ([testing.md
§5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)). Name what was not
covered in the QA file's setup, so the user can check it on real devices.

## 3. Coverage

Every area in [references/areas.md](references/areas.md), each with its standing checks. Every
surface is looked at in this matrix, and layout is swept at all of it:

- **Viewports:** 1440×900, 768×1024, 390×844 (add 1280, 1024 and 820 wide for the header and the
  result layout).
- **Themes and preferences:** light and dark, reduced motion, forced colors on the main paths.
- **Browsers:** Chromium throughout; Firefox and WebKit (`open --browser=firefox|webkit`) for the
  Test screen, a full run, history and sharing.
- **Accessibility:** Tab order, visible focus, Esc, focus moving into and back out of dialogs,
  `aria-expanded` on toggles, accessible names, the gauge's live region, 44 px touch targets on
  phones ([i18n-a11y.md §2](../../../docs/features/ui/i18n-a11y.md#2-accessibility)).

Compare everything against three sources, never against what the app shows elsewhere:

- the spec in `docs/features/` (cite the file and line in each finding),
- the design kit's prototype in `docs/design_system/ui_kits/app/`,
- the real state: `GET /api/v1/info` and the other routes with `curl` (contract in
  `api/openapi.yaml`), the `/metrics` counters, the server's debug log, the result's Download JSON
  and the browser's IndexedDB.

playwright-cli has traps that produce false findings:
[references/playwright-cli.md](references/playwright-cli.md).

## 4. Fanning out (optional)

One agent per area works well. Isolate them or they corrupt each other's results:

- a distinct playwright-cli session name **and** a scratch directory of its own (`/tmp/qa/<area>/`),
  run from that directory, for every script, snapshot and download; agents never share or edit
  each other's scripts;
- a server process and port of its own per agent that runs measurements: the per-client limits
  (8 streams, 1200 requests a minute, 4 WebSockets) are shared by every browser on `127.0.0.1`, so
  two agents running tests against one server throttle each other and report the 429s as findings;
- an origin of its own per agent (a port is part of the origin): history and settings are per
  origin, so two agents on one origin see each other's results;
- the stacks agent alone starts and stops servers and proxies beyond its own.

Each agent writes its report in the format of
[references/finding-format.md](references/finding-format.md) and returns it in full as its final
answer; a subagent's Write tool may refuse a report file, so it writes the copy in its scratch
directory from the shell. An agent closes only its own sessions (`close`): `close-all` closes every
agent's browser, and is the lead's at the end.

`/tmp/qa/` does not survive a reboot. Keep the commands that started the stacks, so the lead can
restart them on the same ports and resume each agent, which keeps its findings in its transcript.

## 5. Safety

- Bind every server to `127.0.0.1` (never `0.0.0.0`, which `make run` uses), on a port the round
  picks; check it is free with `ss -ltn` first.
- No measurement against a host outside this machine, including the user's deployments: a test
  moves gigabytes. A real-device check is the user's, listed in the QA file.
- Never edit a config file in the repository for a stack; write it to the scratch directory or use
  environment variables.
- Record every process the round started and every side effect in the QA file's header.
- Never record a client IP other than loopback, a hostname of the user's network, or log lines
  beyond what a bug needs.
- At the end, close every playwright-cli session (`close-all`), stop every server and proxy the
  round started (by PID, then `ss -ltn` to see the ports free), and delete the scratch directories.

## 6. Verify and consolidate

1. Re-check every high, and a sample of the mediums, against the code before writing it down:
   find the line that causes it. A finding the code contradicts is dropped or rewritten.
2. A number finding is checked against the run's Download JSON and the spec's rule
   ([measurement.md](../../../docs/features/measurement.md)), never against a feeling of what the
   link should give: the loopback ceiling and a demo link both read oddly and correctly.
3. Merge duplicates across areas into one finding with every symptom (one cause, one ID).
4. Hold the severity definitions in the format reference, not each agent's own.
5. A finding that depends on a product choice the spec does not settle becomes an **open question**
   (Q-n), and the finding says it is blocked on it.

## 7. Write the QA file

`docs/engineering/qa/<date>-<name>.md`, laid out as
[references/finding-format.md](references/finding-format.md) says. IDs continue from the previous
round so one finding keeps one name across files; decisions continue the D-n sequence.

Then:

```bash
git add docs/engineering/qa/<file>.md   # the link test reads only files git tracks
go test -count=1 ./test/docs/
pre-commit run --files docs/engineering/qa/<file>.md
```

Commit only after the user approves: `docs(qa): record the <name> QA round`.

## 8. Decisions

Ask every open question with `AskUserQuestion`: the options, what each costs, and a recommendation
first. Record the answers as decisions D-n in the QA file, with the context and the decision, and
mark each blocked finding "Decided by D-n". A decision that changes behavior is a spec change
first (the `spec-change` skill); the QA file links it. Commit as `docs(qa): record the decisions …`.

## 9. Suggest the plan split

Suggest how to divide the open findings into fix plans, and record the agreed split in the QA file
under **Suggested plan split**. No planning yet: only which findings go together.

- **At most 30-40 findings per plan.** Toward 30 when the plan is mostly Go, engine or security
  work, or has several highs; toward 40 when it is mostly copy, layout and small web fixes. More
  findings than that make another plan.
- Split by the kind of work and the skills it needs: server, wire and security work
  (`go-style-guide`, `server-invariants`, `wire-compat`), engine work (`measurement-engine`) and
  app presentation (`vue-page-patterns`, `design-system-guard`, `demo-parity`) apart.
- Keep one model in one plan: findings that share a cause or a reading (a result status, a
  qualifier, a notice) land together, so the app never disagrees with itself between plans.
- Order the plans: highs and the work other findings depend on go first, and say which findings
  wait for which.
- Name the borderline findings and which way each could go.
- Check the split covers every open finding exactly once.

Then end: the fixes are planned separately, one plan at a time.
