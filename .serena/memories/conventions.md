# bitgauge — Conventions

Full Go rules: `.claude/skills/go-style-guide`. Review routing: `.claude/skills/adversarial-review`.

## Commits

- Conventional Commits with a scope (commit-msg hook and the CI `conventional-commits` job)
- Type decides the release (svu): ship to users = `feat`/`fix`; tooling, tests, docs = other types

## Go — what bites most

- Imports: 3 groups (stdlib / third-party / `github.com/leinardi/bitgauge/...`)
- No inline `if err := f(); err != nil` (noinlineerr); wrap with `%w` (wrapcheck);
  no dynamic errors (err113): sentinel + `fmt.Errorf("%w: ...")`
- Numbers: only 0–3 inline in non-test code (mnd); named consts otherwise
- funlen 50 statements; cyclop/gocyclo 15; gocognit 35; funcorder (exported methods first)
- gocritic: pass big structs by pointer (hugeParam), index loops (rangeValCopy), name results
- misspell US locale; tagliatelle camelCase JSON (foreign keys need a nolint or a map)
- `//nolint:<linter> // reason` only, then `scripts/check-suppressions.sh --update`
- Test files exempt from dupl, funlen, gocognit, goconst, gocyclo, lll, maintidx, mnd,
  paralleltest, testpackage, varnamelen; forbidigo off in tests and `test/`
- Docker-dependent tests sit behind `//go:build image` or `harness`; untagged tests never
  import testenv/netguard or run docker (`test/toolchain`)
- A tool run through exec is not in the Go test cache key: read its inputs in the test

## Docs

- Prose wraps at 100 columns; relative links must resolve (`test/docs`)
