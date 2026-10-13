# Going Public

The checklist for the day this repository stops being private. Today it is a solo repository: one
contributor, direct pushes to `main`, no branch ruleset, and settings that a private repository
on a free plan cannot enforce. None of that survives contact with a pull request from someone
else.

Nothing here has been done yet. The workflows it refers to exist (`ci.yaml`, `go-test.yaml`, the
warm-ups, `scheduled-scan.yaml` and `harness.yaml`); this note records what has to be decided and
switched on, and why, so the work is not reconstructed from memory under time pressure.

---

## 1. Revise the Release Model

[`docs/release.md`](../release.md#release) carries a boxed note: **the release process is
provisional and must be revised before the repository goes public.** It follows the release model
of swarm-scheduler-exporter, which has shipped releases with it, as ported through Runhold
(dispatch from `main`, build, scan and verify before the tag, immutable tags, recovery by re-run,
no rebuild of a published version), chosen while the repository is private.

- [ ] Re-read [`release.md`](../release.md) and
      [build-packaging.md §4](../features/technical-stack/build-packaging.md#4-ci-workflows) as a
      whole and decide whether the model stays. Whatever changes, change the docs first, then the
      workflows.
- [ ] Re-check what a private repository could not do and a public one can: environments and
      their secrets, deployment branch rules, rulesets, and artifact attestations
      ([release.md, one-time setup](../release.md#one-time-setup)). The first release waits until
      these work.
- [ ] Remove the provisional note from `release.md`, and the pointer to it here, once the model is
      settled.

## 2. Required Checks and Rulesets

Today `main` takes direct pushes, deliberately. The moment a fork can open a pull request, direct
push stops being the normal path.

The rulesets live in `leinardi/gh-leinardi-iac` (`stacks/github-repos/repos.tf`, module
`repo_bitgauge`), not in this repository and not in `gh api` calls
([release.md](../release.md#required-checks-and-fork-pull-requests)).

- [ ] In `gh-leinardi-iac`, the branch ruleset on `main` (pull requests only, no force push, no
      deletion) with `default_branch_required_checks = ["ci-result"]`. `ci-result` needs every
      other `ci.yaml` job, so it is the only check to require; the reviewdog annotation jobs stay
      outside it, since they duplicate `pre-commit-all` as inline comments.
- [ ] Open one pull request after the ruleset exists and confirm the required check reports under
      exactly the name `ci-result`. A required check that never reports blocks every merge.
- [ ] Decide whether the owner keeps a bypass. A bypass that exists is a bypass that gets used; an
      owner without one opens a pull request for every change, which is the cost of the guarantee.
- [ ] The immutable `v*` tag ruleset (also in `gh-leinardi-iac`) and the `release` environment
      restricted to `main` ([release.md, one-time setup](../release.md#one-time-setup)).

`pre-commit-all` already runs every hook on every pull request and every push to `main`, so a check
that exists only on a contributor's machine is the exception: `go-test-repo-mod` is skipped there
because `go-test` runs the same tests, and the commit-message hook is replaced by the
`conventional-commits` job.

## 3. Restore the Scheduled Scan

`scheduled-scan.yaml` is dispatch-only while the repository is private: its weekly `schedule:`
block is commented out at the top of the workflow, to save Actions minutes. `harness.yaml` is the
same: CI calls it and it can be dispatched, and its nightly `schedule:` block is commented out.

- [ ] **Run `make audit-deps` and triage every finding** before the repository is made public,
      the same way as
      [health-audit.md §1](health-audit.md#1-run-make-audit-deps-and-triage-what-it-finds).
      Whatever the scan reports on the day the repository opens is what the first reader sees.
- [ ] Uncomment the `schedule:` block of `scheduled-scan.yaml`, and dispatch the workflow once by
      hand to see it pass.
- [ ] Uncomment the nightly `schedule:` block of `harness.yaml`, the accuracy harness's CI tier
      ([testing.md §6](../features/technical-stack/testing.md#6-ci-placement)). If the runners
      cannot sustain the 1 Gbit profile on every pull request, that is where it moves.
- [ ] Decide where a failing scheduled run goes. A run that fails into an inbox nobody reads is not
      a control; an issue opened automatically is.
- [ ] Decide on CodeQL for Go and TypeScript, on a schedule and on pull requests. It is free for
      public repositories, which is the reason to wait.

## 4. Docker Hardened Images Block Fork Builds

Every stage of the Dockerfile pulls from `dhi.io` (`dhi.io/golang` and `dhi.io/node` for the build
stages, `dhi.io/static` at runtime), a registry that needs credentials. A pull request from a fork
gets no secrets, so the image jobs (the image build and its tests, the accuracy harness) are
skipped with a notice and `ci-result` fails on it. That is decided
([decisions.md §26](../features/technical-stack/decisions.md#26-image--multi-stage-build-on-dhiiostatic),
[release.md](../release.md#required-checks-and-fork-pull-requests)); what remains is making it
livable.

- [x] Say plainly in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) that `make docker-build`,
      `make go-test-image` and the harness targets need a `dhi.io` account (`make e2e` does not:
      it runs a host-built binary), so an outside contributor is not left debugging an
      authentication failure that is by design.
- [ ] **Verify the replacement pull request path with a real fork from a second account**: open a
      fork pull request that touches an image input, watch `ci-result` fail on the skipped image
      jobs, push its commits unchanged to a branch of this repository, open the replacement pull
      request, and merge it once green with the authorship intact. Only then drop the word
      **unverified** from `CONTRIBUTING.md` and `release.md`.
- [ ] Confirm a Dependabot pull request runs the image jobs: Dependabot reads the `DHI_TOKEN`
      Dependabot secret, not the Actions secret.

## 5. The Rest of the One-Time Setup

The [one-time setup in release.md](../release.md#one-time-setup) is the full list; the items that
only make sense on a public repository:

- [ ] Private vulnerability reporting enabled, as [`SECURITY.md`](../../SECURITY.md) promises.
- [ ] Dependabot enabled with `.github/dependabot.yml`, and its `DHI_USERNAME` and `DHI_TOKEN`
      secrets set.
- [ ] After the first release, the `ghcr.io/leinardi/bitgauge` package set to public.

## 6. Licence Check

The project is GPL-3.0-or-later ([`LICENSE`](../../LICENSE)).

- [x] A header check: `scripts/check-license-headers.sh`, run by the `licence headers` hook in
      `pre-commit-all`, fails a source file without the GPL header.
- [ ] A dependency-licence check. GPL-3.0 constrains what may be linked in, and a transitive
      dependency under an incompatible licence is much more expensive to remove after the first
      release.

## 7. Nice to Have: Coverage Reporting

Deliberately **not** done now: there is no coverage gate and no published number, and adding one
to a repository with nobody to hold to it buys nothing.

- [ ] If it lands: report, do not gate, at first. A threshold picked from the current number is a
      threshold nobody chose.
- [ ] Prefer per-package visibility over a single percentage; the interesting question is which
      package is untested, not what the mean is.

## 8. Undecided: Commit Subject Length

`conventional-pre-commit` enforces the type, scope and shape of a subject, and nothing enforces its
length.

- [ ] Decide: a hard limit (a linter), a convention in `AGENTS.md`, or nothing.
- [ ] If a limit: it applies to new commits only. The history is not rewritten.
