<!-- markdownlint-disable MD041 -->
<!--
Any HTML comment will be stripped when the markdown is rendered, so you don't need to delete them.
-->

## Summary

<!-- Short description of what this PR does. -->

## Pull request checklist

- [ ] I am targeting the `main` branch
- [ ] I have **rebased** this branch on top of the destination branch
- [ ] I have executed `make check` locally *before creating the commit* and it has run successfully
- [ ] Every commit message follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  with a scope (`type(scope): subject`), and its type matches whether the change ships
- [ ] I have performed a self-review of my own code
- [ ] There are no `WIP` commits in this PR
- [ ] **Spec first:** a change in behavior updates `docs/features/` in this PR or an earlier one,
  and the code follows the docs
- [ ] **Stateless, no outbound calls:** the server stores no result and writes no file, and nothing
  calls out (no telemetry, update check, CDN, external font or lookup)
- [ ] **Honest numbers:** no fudge factor or hidden smoothing, and every number keeps its qualifiers
- [ ] I ran the validation commands for every area touched (see the AGENTS.md validation matrix)

## Type of changes

<!-- Tick all that apply: -->

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 🔧 Refactoring
- [ ] 📜 Docs
- [ ] 🧰 CI / tooling / infra
- [ ] Other (describe in Summary)
