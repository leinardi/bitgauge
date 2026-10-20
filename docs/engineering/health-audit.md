# Periodic Health Audit

An optional checklist for before a release, or whenever the repository feels like it has drifted.

Most commits in this repository are written by an agent, guarded by pre-commit hooks, CI and a
review loop. Those guards catch what they were pointed at; what they were never pointed at
accumulates silently: a duplicated helper, a suppression nobody would approve today, a dependency
with a CVE disclosed after the last time anyone looked, a harness image nobody has refreshed. The
audit looks at what nothing is watching, and compares this milestone's numbers with the last
one's: a single measurement says nothing, two say which way it is going.

Pick the steps that are useful this time.

## Where the Audit Is Written Down

If the readings are worth comparing next time, commit them as
**`docs/engineering/health-audits/<version>.md`**, in this order:

1. **Header**: the version, the date, and the commit range audited.
2. **Dependency triage**: one row per finding from step 1: advisory ID, package, and the answer
   (upgraded with the commit / no fix published, with the real exposure / not applicable, with the
   reason). "No findings" is a legitimate table, written as such.
3. **Audit reports**: the three reports from step 2, in full. They are long; that is what makes a
   later "this was healthy three audits running" worth anything.
4. **Metrics**: the readings from step 3, each beside the previous milestone's number.
5. **Harness images**: the digests before and after step 4.
6. **Actions**: what this audit changed or scheduled, and what was deliberately left.

---

## 1. Run `make audit-deps`, and Triage What It Finds

```bash
make audit-deps
```

That is the pinned, source-aware `govulncheck -test` over every Go package, plus
`npm audit --audit-level=high` over the `web/` lockfile (`.mk/audit-deps.mk`). The commit hooks run
the same targets only when a dependency file changes, and CI's `audit` job only on pull requests
and pushes, so neither says anything about a CVE disclosed against a dependency nobody has touched.
The scheduled scan does, once its schedule is restored
([going-public.md §3](going-public.md#3-restore-the-scheduled-scan)); this run is the one a person
reads.

**Triage every finding.** Triage means one of three answers:

- upgraded, with the commit;
- no fix published, recorded with the advisory ID and what the exposure actually is;
- not applicable, with the reason, not "looks unrelated".

One caveat that produces a false alarm otherwise: `govulncheck` reports standard-library findings
against the Go toolchain that runs it, not against the `go` directive. Run it with the toolchain of
`.go-version` (CI does); a wall of `Found in: net/http@go1.x.y` locally means the local Go is
behind. Upgrade it and re-run before writing anything down.

## 2. Re-Run the Three Audit Prompts

The prompts are written out so the next run asks the same questions: the value is in comparing two
answers to one question, which a freshly worded prompt does not give. Run each in its own agent or
session, with no memory of the others, and paste the reports in full into the audit file.

A prompt area whose code does not exist yet is answered "not present"; that is a finding too, and
it is how the audit notices the day it starts to exist.

### Prompt A: Go and Server Invariants

> Audit the Go side of this repository (`cmd/`, `internal/`, `test/`) and report on each of these
> areas separately, with a verdict (healthy / minor / moderate / serious) and the concrete evidence
> behind it: file and line, not impressions.
>
> 1. **Stateless server**: any database, file write, volume, stored result, or state beyond the
>    bounded in-memory counters for limits and metrics
>    (`docs/features/principles.md`, `.agents/skills/server-invariants/SKILL.md`).
> 2. **No outbound calls**: any outbound network client, DNS lookup, telemetry, update check or
>    external URL, including in dependencies reachable from `cmd/bitgauge`.
> 3. **Handlers**: state held beyond the request; allocation per download request; an upload
>    answered before its body is drained; a request body, header or WebSocket message logged.
> 4. **Trust boundary**: client IP read from `X-Forwarded-For` other than through
>    `server.trusted_proxies`, any read of `X-Real-IP` or a similar header, rate limits that a
>    client can step around; walk `.agents/skills/server-invariants/SKILL.md` item by item.
> 5. **Configuration**: keys read but not documented in `docs/features/configuration.md`, keys
>    documented but not read, and validation that fails open rather than exiting with status 2.
> 6. **Wire compatibility**: drift between `internal/compat/` and
>    `docs/features/wire-protocol.md`, and any code or asset that looks copied from OpenSpeedTest
>    or LibreSpeed rather than written from their documented behavior.
> 7. **Hygiene and tests**: dead code, `nolint` directives whose reason no longer holds, swallowed
>    errors, goroutines without a context, duplicated rules, and `time.Sleep` where a wait belongs.

### Prompt B: Engine and Frontend

> Audit `web/src` and `web/harness` and report on each of these areas separately, with a verdict
> and concrete evidence:
>
> 1. **Engine isolation**: any import in `web/src/engine/` from Vue, the DOM or application code;
>    any clock or transport not injected; any engine rule without a synthetic-timeline test.
> 2. **Honest numbers**: fudge factors, hidden smoothing, rounding that changes a headline, or a
>    number shown without the qualifiers `docs/features/measurement.md` requires.
> 3. **Measurement fidelity**: drift between the engine and `docs/features/measurement.md` (stream
>    ramp, steady window, upload grace, idle and loaded latency, grades).
> 4. **Forbidden stack**: Nuxt, SSR, TanStack Query, class-based components, any external URL in
>    the built `web/dist`.
> 5. **Types, i18n and size**: `any`, `@ts-ignore`, strings outside the vue-i18n catalog, the
>    largest components and the `fallow` findings, and tests that mock what they should exercise.

### Prompt C: Guardrails and Docs

> Audit what guards this repository and what it claims about itself:
>
> 1. **Guardrails**: every pre-commit hook and CI job: is it pinned, does it actually fail, does it
>    run on the commits it needs to run on (including commits that only delete files)? What is not
>    checked at all?
> 2. **Docs**: does `docs/features/**` describe the software that exists: configuration keys that
>    are read, endpoints that are served, screens that are rendered? Does `AGENTS.md` describe
>    the current tree?
> 3. **Accuracy evidence**: does `docs/engineering/harness-runs/` hold a floor and ceiling run for
>    every release, and do the CI-tier reports of the last month show a profile drifting towards
>    its tolerance?

## 3. Compare the Metrics With the Previous Run

Record these in the audit file, each beside the previous milestone's number. The direction is the
finding; the absolute value rarely is.

Three of the commands need the previous milestone's tag. Releases are tagged `vX.Y.Z`
([release.md](../release.md#tags)), so:

```bash
PREVIOUS="$(git describe --tags --abbrev=0)"   # before the first release: the commit that closed
                                               # the previous milestone, read from the last audit
```

```bash
# Largest files, both sides. A new entry near the top is the thing to look at.
find internal cmd -name '*.go' ! -name '*_test.go' \
  | xargs wc -l | grep -v ' total$' | sort -rn | head -20
find web/src \( -name '*.vue' -o -name '*.ts' \) \
  | grep -vE '(/components/ui/|/test/|types\.gen\.ts|\.(test|spec)\.ts)' \
  | xargs wc -l | grep -v ' total$' | sort -rn | head -20

# Suppressions added since the previous milestone.
git diff "$PREVIOUS"..HEAD | grep -E '^\+.*(nolint|eslint-disable|fallow-ignore|shellcheck disable|hadolint ignore)'

# The fallow baselines: how many entries are left, and whether any grew.
git diff "$PREVIOUS"..HEAD -- .fallow-baseline.json .fallow-regression-baseline.json

# Fix-per-file hotspots: which files keep needing repair.
git log "$PREVIOUS"..HEAD --format='%H' --grep='^fix' --name-only \
  | grep -vE '^([0-9a-f]{40})?$' | sort | uniq -c | sort -rn | head -20
```

The frontend filter is the line ceiling's own scope (ESLint `max-lines`): generated, vendored and
test code is excluded, so the list is the files the ceiling holds.

What each one is for:

- **Largest files**: the ceiling catches a file over 400 lines; it cannot catch one just under
  it. This is where a component or a handler that should have been split shows up.
- **Suppressions added**: a count that only ever rises is a linter being switched off one
  line at a time. A rule whose count grew this milestone deserves the question of why.
- **Fallow baselines**: entries should disappear over time. A milestone in which none did is one
  where no dead export was removed.
- **Fix-per-file hotspots**: a file that takes several `fix` commits per milestone is not unlucky.
  It is the file whose design is wrong, and it is worth more than its line count says.

## 4. Refresh the Harness Image Digests

The harness's third-party images are pinned by digest in Go source (`test/harness/images.go`:
Playwright, Traefik, Caddy), and the tools image's base in `test/harness/tools.Dockerfile`.
Dependabot watches only `deployments/docker`, so nothing else refreshes them.

- [ ] For each image, resolve the current digest of the same tag
      (`docker buildx imagetools inspect <image>:<tag>`) and replace the pin if it moved. Keep the
      Playwright tag equal to the `@playwright/test` version `web/package.json` pins; the harness
      unit tests in `test/harness` fail otherwise.
- [ ] Decide whether a newer tag is due (a Traefik or Caddy minor, a new Alpine line), and move it
      in its own commit.
- [ ] Once the harness is active, run `make harness-ci` with the new digests before the milestone
      closes, so a changed proxy shows up in this audit and not in the next release's floor run.
- [ ] Record the digests before and after in the audit file.

---

## Later: Idle Footprint

Once a binary exists, the idle CPU and memory of a running server becomes a fifth metric, measured
with `make idle-measure` (`scripts/idle-measure.sh`). It takes at least five windows and reports
median and range: CPU as `utime`+`stime` (own) and `cutime`+`cstime` (children, reaped forks),
resident memory per window and the peak at the end, and, when a Docker engine answers, a census of
its events over each window (`IDLE_EVENTS`). The census matters for the image: its `HEALTHCHECK`
is an exec into the container every 30 s, paid for by the engine rather than the server, so name
`dockerd` next to `bitgauge` in `IDLE_PIDS` and read CPU next to events/s. `make idle-bench`
measures what one request to `/api/v1/ping`, `/api/v1/small`, `/api/v1/info` and the SPA index
costs the server, bracketed by idle controls, at `BENCH_URL`. Its method (how the host is settled,
how long the warm-up is, how a window is compared with the previous audit's) is written here when
the first reading is taken, not before.
