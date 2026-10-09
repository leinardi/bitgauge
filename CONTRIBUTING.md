# Contributing

> Implementation status per feature area: [`docs/STATUS.md`](docs/STATUS.md).

## The Project Is in the Specification Phase

There is no code yet. The specification in [`docs/`](docs/README.md) is the product, and it is
where contributions go for now:

- **Issues** for anything unclear, inconsistent, wrong or missing in the specification: a number
  that differs between two pages, a measurement rule that fails on some link, an edge case not
  covered. Quote the page and section.
- **Open questions** are listed in
  [`docs/features/open-questions.md`](docs/features/open-questions.md), each with a recommendation;
  discussion on those is welcome.
- **Pull requests** that change the specification: one topic per pull request, with every page the
  change touches updated together (the measurement page, the wire protocol, configuration, the UI
  pages and the glossary must keep agreeing).

## Spec Pull Requests First

After implementation starts, the rule stays: **a change in behaviour starts as a change to the
specification.** Open a pull request against `docs/` first; code follows once it is merged. Code
that disagrees with the docs is a bug in one of them, and the docs win until they are changed
deliberately. Technical choices are locked in
[`docs/features/technical-stack/decisions.md`](docs/features/technical-stack/decisions.md);
changing one needs a pull request to that file with the reason.

The planned build, test and lint commands are in
[`docs/features/technical-stack/build-packaging.md`](docs/features/technical-stack/build-packaging.md#3-planned-make-targets);
[AGENTS.md](AGENTS.md) will hold the authoritative list once they exist.

## Branch and PR Conventions

- Branch names: `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`.
- Keep pull requests focused; one logical change per pull request.
- Pull request titles are short and in the imperative mood: _Specify the upload grace_, _Fix the
  grade threshold table_. Release notes list pull requests by title.

## Commit Messages

All commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
with a scope: `<type>(<scope>)[!]: <description>`. Use the area or component as the scope.

```text
docs(measurement): define the upload grace for slow links
feat(engine): add the stream ramp
fix(upload): count bytes on the server grid
```

Release versions are derived by `svu` from these types: `feat` is a minor, `fix` a patch, `!` or a
`BREAKING CHANGE:` footer a major; every other type bumps nothing. See
[AGENTS.md](AGENTS.md#commit-messages) and [`docs/release.md`](docs/release.md).

## Developer Certificate of Origin and Licence

- Every commit must be signed off (`git commit -s`), certifying the
  [Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the
  change or have the right to submit it under the project's licence.
- By contributing, you agree that your contribution is licensed under
  **GPL-3.0-or-later**, the licence of the project ([LICENSE](LICENSE)).

## No Third-Party Speed-Test Code

Do not vendor, copy or adapt code, assets or configuration from OpenSpeedTest, LibreSpeed or any
other speed test, whatever its licence. BitGauge implements their documented behaviour and wire
protocols for compatibility, and records what it learned from them as ideas in
[`docs/research/`](docs/research/README.md). A contribution that contains such code is declined.
