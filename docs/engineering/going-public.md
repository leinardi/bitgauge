# Going Public

The checklist for the day this repository stopped being private (2026-11-09). As a private solo
repository it had one contributor, direct pushes to `main`, no branch ruleset, and settings that a
private repository on a free plan cannot enforce. None of that survives contact with a pull
request from someone else. The open items below are what is still to decide or verify.

---

## 1. Revise the Release Model

The release model of [`docs/release.md`](../release.md) was chosen while the repository was
private: the lean model of swarm-scheduler-exporter (gate on CI, build once, smoke-test and scan
before the tag, immutable tags, recovery by re-run, no rebuild of a published version). It stays.

- [x] Re-read [`release.md`](../release.md) and
      [build-packaging.md §4](../features/technical-stack/build-packaging.md#4-ci-workflows) as a
      whole and decide whether the model stays. Whatever changes, change the docs first, then the
      workflows.
- [x] Re-check what a private repository could not do and a public one can: environments and
      their secrets, deployment branch rules, rulesets, and artifact attestations
      ([release.md, one-time setup](../release.md#one-time-setup)). The first release waits until
      these work. The `0.1.0` dry run passed on 2026-11-09 with them.
- [x] Remove the provisional note from `release.md`, and the pointer to it here, once the model is
      settled.

## 2. Required Checks and Rulesets

While private, `main` took direct pushes, deliberately. Now that a fork can open a pull request,
every change goes through one.

The rulesets live in `leinardi/gh-leinardi-iac` (`stacks/github-repos/repos.tf`, module
`repo_bitgauge`), not in this repository and not in `gh api` calls
([release.md](../release.md#required-checks-and-fork-pull-requests)).

- [x] In `gh-leinardi-iac`, the branch ruleset on `main` (pull requests only, no force push, no
      deletion) with `default_branch_required_checks = ["ci-result"]`. `ci-result` needs every
      other `ci.yaml` job, so it is the only check to require; the reviewdog annotation jobs stay
      outside it, since they duplicate `pre-commit-all` as inline comments.
- [x] Open one pull request after the ruleset exists and confirm the required check reports under
      exactly the name `ci-result`. A required check that never reports blocks every merge.
- [ ] Decide whether the owner keeps a bypass. A bypass that exists is a bypass that gets used; an
      owner without one opens a pull request for every change, which is the cost of the guarantee.
- [x] The immutable `v*` tag ruleset (also in `gh-leinardi-iac`) and the `release` environment
      restricted to `main` ([release.md, one-time setup](../release.md#one-time-setup)).

`pre-commit-all` already runs every hook on every pull request and every push to `main`, so a check
that exists only on a contributor's machine is the exception: `meta-tests`, `cargo-test` and
`cargo-deny` are skipped there because `repo-gates` and `rust` run the same checks, and the
commit-message hook is replaced by the `conventional-commits` job.

## 3. Restore the Scheduled Scan

`scheduled-scan.yaml` runs weekly and `harness.yaml` nightly, both also by hand.

- [x] **Run `make audit-deps` and triage every finding** before the repository is made public,
      the same way as
      [health-audit.md §1](health-audit.md#1-run-make-audit-deps-and-triage-what-it-finds).
      Whatever the scan reports on the day the repository opens is what the first reader sees.
      Done 2026-11-07: cargo-deny clean, npm audit clean for the production dependencies; 15
      moderate advisories (`minimatch`, `glob`) only in lint and test tooling, below the `high`
      gate, with no fix short of downgrading eslint. Run it again on the day if that day is later.
- [x] Uncomment the `schedule:` block of `scheduled-scan.yaml`, and dispatch the workflow once by
      hand to see it pass.
- [x] Uncomment the nightly `schedule:` block of `harness.yaml`, the accuracy harness's CI tier
      ([testing.md §6](../features/technical-stack/testing.md#6-ci-placement)), or decide to keep
      it a manual, pre-release run. Nightly.
- [ ] Decide where a failing scheduled run goes. A run that fails into an inbox nobody reads is not
      a control; an issue opened automatically is.
- [ ] Decide on CodeQL for Rust and TypeScript, on a schedule and on pull requests. It is free for
      public repositories, which is the reason to wait.

## 4. Docker Hardened Images Block Fork Builds

Every stage of the Dockerfile pulls from `dhi.io` (`dhi.io/rust` and `dhi.io/node` for the build
stages, `dhi.io/static` at runtime), a registry that needs credentials. A pull request from a fork
gets no secrets, so the image jobs (the image build and its tests, the accuracy harness) are
skipped with a notice and `ci-result` fails on it. That is decided
([decisions.md §26](../features/technical-stack/decisions.md#26-image--multi-stage-build-on-dhiiostatic),
[release.md](../release.md#required-checks-and-fork-pull-requests)); what remains is making it
livable.

- [x] Say plainly in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) that `make docker-build`,
      `make rust-test-image` and the harness targets need a `dhi.io` account (`make e2e` does not:
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

- [x] Private vulnerability reporting enabled, as [`SECURITY.md`](../../SECURITY.md) promises.
- [x] Dependabot enabled with `.github/dependabot.yml`, and its `DHI_TOKEN` secret set.
- [ ] After the first release, the `ghcr.io/leinardi/bitgauge` package set to public.

## 6. License Check

The project is GPL-3.0-or-later ([`LICENSE`](../../LICENSE)).

- [x] A header check: `scripts/check-license-headers.sh`, run by the `license headers` hook in
      `pre-commit-all`, fails a source file without the GPL header.
- [x] A dependency-license check. GPL-3.0 constrains what may be linked in, and a transitive
      dependency under an incompatible license is much more expensive to remove after the first
      release. The Rust graph is gated by cargo-deny's `[licenses]` allow list in
      [`deny.toml`](../../deny.toml). The web production dependencies (`npm ls --omit=dev`) were
      checked by hand on 2026-11-07: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause and 0BSD,
      plus MPL-2.0 for the build-only `lightningcss`, all compatible. Check again by hand when a
      runtime dependency is added to `web/package.json`.

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
