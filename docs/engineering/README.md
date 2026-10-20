# Engineering Notes

How the project is run, rather than what it does. Working notes and checklists: nothing here is a
contract, and nothing here constrains the product.

| Document | What it is for |
| --- | --- |
| [`accuracy-harness.md`](accuracy-harness.md) | The runbook for the manual floor and ceiling tiers of the accuracy harness: host setup, how to run each profile and the manual device runs, how to read a run, and where results are recorded |
| [`demo-parity.md`](demo-parity.md) | The demo parity harness: comparing the design kit's prototype with the Vue demo in every state, reading a run, the ratcheted baseline, where a difference belongs (the demo, the Vue app, the spec, or a note for the Claude Design project), and the triage of differences into decided clusters; the working loops are the `demo-parity` and `parity-triage` skills in `.agents/skills/` |
| [`design-system-upstream.md`](design-system-upstream.md) | The notes to paste into the Claude Design project for changes the parity triage decided the design export needs, since the export is never edited here |
| [`going-public.md`](going-public.md) | The checklist for the day the repository stops being private: revising the release model, required checks and rulesets, the scheduled scan's schedule, fork pull requests and the `dhi.io` images, and the license check |
| [`harness-runs/`](harness-runs/README.md) | One file per release, `<version>.md`, holding that release's floor and ceiling results (the harness's `report.md` from `dist/harness/`, committed by the maintainer), the real Safari and iOS checks, and the environmental notes, as required before tagging ([testing.md §5.1](../features/technical-stack/testing.md#51-implementation), [accuracy-harness.md §5](accuracy-harness.md#5-record-the-results)); the first is `0.1.0.md` |
| [`health-audit.md`](health-audit.md) | Rerun every milestone: the dependency scan and its triage, the review prompts, the metrics that only mean something compared with the previous run, and the refresh of the harness image digests |

## Planned Notes

| Document | What it will be for |
| --- | --- |
| `health-audits/<version>.md` | One file per milestone, holding that milestone's audit in the shape [health-audit.md](health-audit.md#where-the-audit-is-written-down) prescribes |
