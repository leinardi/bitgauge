---
name: go-style-guide
description: >
  Go coding rules for BitGauge that golangci-lint v2 (`default: all`) does not make obvious:
  import groups, sentinel errors wrapped with %w, the nolint form, complexity limits and how to
  split, mnd, varnamelen, and the traps where a linter message misleads. Summarizes the depguard
  and forbidigo boundary that keeps the server stateless and silent. Adds the review rules lint
  cannot check: comments carry rationale, the native API error envelope, and injected clocks
  instead of time.Sleep in tests. Use when writing, editing, or reviewing any .go file in
  BitGauge, before generating code rather than after lint fails.
---

# Go Style Guide — BitGauge

The linters are configured in `.golangci.yaml` (removed at the Rust cutover) (golangci-lint v2,
`default: all`;
[decisions.md §9](../../../docs/features/technical-stack/decisions.md#9-lint-policy--clippy-with-the-workspace-lints)).
Most findings explain themselves; this guide covers only the ones that do not, the boundary rules
in one paragraph, and the review rules no linter checks. §1–§8 are lint traps, §9 the boundary,
§10–§12 review rules.

- golangci-lint is not on `PATH` everywhere: run it through pre-commit or `make go-lint`, which pin
  the version (see "Lint loop"). Never commit with `--no-verify`.
- `run.build-tags` is `image` and `harness`, so the tagged packages (`test/image`,
  `test/internal/netguard`, `test/harness`) are linted like everything else.
- Disabled, so their rules do not apply: `exhaustruct` (partial struct literals are fine),
  `gochecknoglobals` (package-level sentinels and defaults are intentional), `nonamedreturns`,
  `gomodguard` (replaced by `gomodguard_v2`) and the deprecated `wsl` (`wsl_v5` stays on).
- A new Go package gets a row in the
  [backend.md package map](../../../docs/features/technical-stack/backend.md#1-package-map).
- Test files are exempt from `dupl`, `funlen`, `gocognit`, `gocyclo`, `goconst`, `lll`,
  `maintidx`, `mnd` and `varnamelen`, and from `cyclop`'s complexity check.

## 1. Import groups

Three groups separated by blank lines: stdlib, third-party, then this module
(`github.com/leinardi/bitgauge/...`), alphabetical within each. `gci` and `goimports` enforce it
and the `golangci-lint-fmt` hook rewrites it; write it right to keep the diff clean.

## 2. Errors: sentinels, wrapped with `%w`

`err113` flags every `errors.New` inside a function body and every `fmt.Errorf` without a `%w`
verb, a static message included. Declare the error once as a package-level sentinel (exported as
`Err…` when callers need `errors.Is`) and attach the runtime detail by wrapping it
(`internal/config/load.go` has the real ones):

```go
var ErrInvalidConfig = errors.New("invalid configuration")

return fmt.Errorf("%w: limits.max_upload_bytes: %d is below the 35 MiB compat.openspeedtest needs",
    ErrInvalidConfig, cfg.Limits.MaxUploadBytes)
```

- Compare with `errors.Is` / `errors.As` / `errors.AsType[T]`, never `==`. Classify by type, not
  by message: `_, tooLarge := errors.AsType[*http.MaxBytesError](err)`.
- An error that carries structured data implements `error` on a private struct, and its
  constructor returns `error`. A config error is logged as one line with `key`, `value` and `rule`
  ([configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).
- Aggregate with `errors.Join`; config validation collects every error before reporting.
- `noinlineerr` bans `if err := f(); err != nil`. Split it, and use `=` for the later assignments
  in the same scope. In a nested scope, name the error after its source (`readErr`, `writeErr`)
  instead of shadowing `err` (`govet` shadow).
- Ignore an unactionable error explicitly: `_, _ = w.Write(...)` for a short error body. A failed
  write while streaming a download is not one: it is how a client abort ends the handler
  ([backend.md §2](../../../docs/features/technical-stack/backend.md#2-handler-rules)).
- Suppress `err113` only when no sentinel can fit, and say why (§3).

## 3. `nolint` directives

The form is `//nolint:<linter> // reason`. `nolintlint` rejects a bare `//nolint`, one without a
reason, and one that no longer suppresses anything. The reason says why the fix does not apply
here, not which rule fired. Put it on the same line for a statement, on the line before a func or
type. Name every linter that fires, comma-separated without spaces:

```go
//nolint:cyclop,gocyclo // one branch per fail-closed rule: size scales with the rule list, not with logic
```

Prefer fixing the finding; a suppression is argued in review.

## 4. Complexity limits and how to split

| Linter | Limit |
| --- | --- |
| `gocyclo`, `cyclop` | 15 (same metric, they fire together) |
| `gocognit` | 35 |
| `funlen` | 50 statements (lines are not counted) |

Extract helpers along the function's natural steps (parse, validate, apply), table-drive repeated
branches, and return early instead of nesting. Suppress only when the size is the shape of the
problem, as in a validator with one branch per independent config key, and say so in the reason.

## 5. Magic numbers (`mnd`)

0, 1, 2 and 3 are allowed. Any other literal in an argument, `case`, condition or `return` needs a
named constant, and so does any literal used twice or needing an explanation. The handler numbers
come from the docs
([backend.md §2](../../../docs/features/technical-stack/backend.md#2-handler-rules)), so name them
after what they are, with the unit in the value:

```go
const (
    gridCell          = 100 * time.Millisecond
    uploadLifetime    = 120 * time.Second
    writeStallTimeout = 30 * time.Second
    wsReadLimit       = 256 // bytes; larger messages close with 1009
)
```

`strings.SplitN` is excluded.

## 6. Short names (`varnamelen`)

A name shorter than 3 characters is flagged when its last use is more than 5 lines from its
declaration. Receivers are exempt; **parameters are not**: a one-letter parameter passes in a
three-line function and fails as soon as the body grows. Name parameters descriptively from the
start: `parseBytes(raw string)`, `cellFor(elapsed time.Duration)`, `isTrusted(addr netip.Addr)`.

## 7. Traps where the message misleads

- **`gocritic` `hugeParam` / `rangeValCopy`** (over ~80 bytes): pass a pointer, or iterate by index
  (`entry := &entries[index]`). When an interface fixes the signature (`slog.Handler.Handle` takes
  a `slog.Record` by value), suppress with that reason instead.
- **`modernize` `newexpr`** flags a pointer-boxing helper (`func ptr[T any](v T) *T`) at its
  declaration and every call site. Since Go 1.26, write `new(int64(maxUploadBytes))`.
- **`godox`** flags `FIXME`; `TODO` is allowed. Write `any`, not `interface{}` (a `gofmt`
  rewrite rule).
- Every `.go` file starts with the GPL-3.0-or-later header `scripts/check-license-headers.sh`
  checks; copy it from an existing file. Exported symbols get doc comments starting with their name;
  do not add comments to code you did not otherwise change.

## 8. Reuse the shared paths (`dupl`)

`dupl` flags copied blocks over 100 tokens, but the rule that matters is semantic: the download and
upload paths are shared by design (one random-buffer writer, one drainer for every route that
drains a body). A compatibility layer reuses them through the native building blocks and never
copies them; dependencies point from `compat/` to the native packages, never the reverse.

## 9. Boundary rules: depguard and forbidigo

These rules are the lint half of "the server never stores a result and never calls out"
(AGENTS.md, "Project rules"). `depguard` bans other loggers (use `internal/logger` on
`log/slog`) and superseded forks (`github.com/pkg/errors`), and in non-test code outside `test/` it
bans storage (databases, embedded stores, migrations) and outbound clients (`net/smtp`, RPC, DNS,
proxy, `httputil`, WebSocket clients other than `coder/websocket`, Prometheus push and API
clients). `forbidigo`, with `analyze-types: true`, bans printing (`fmt.Print*`; `fmt.Fprintf` to
stderr is allowed), every HTTP client, dial and lookup, TLS and WebSocket dials, and file writes
(`os.Create`, `WriteFile`, `Mkdir*`, `Remove*`, `Rename` and the matching raw syscalls). Its only
non-test exclusion is `cmd/bitgauge/healthcheck.go`, the one loopback `GET /api/v1/ping`
([backend.md §6](../../../docs/features/technical-stack/backend.md#6-healthcheck-subcommand)); do
not add another. `test/boundary` (now
[`meta/tests/lint_inheritance.rs`](../../../meta/tests/lint_inheritance.rs)) pins every rule, so
changing one changes that test too. The full lists, what they miss, and the state inventory live
in the `server-invariants` skill. Lint never sees logging content: nothing logs a body, a header, a
query string or a WebSocket message.

## 10. Comments carry rationale; history goes in the commit

A comment says **why the code is the way it is**: the constraint, the failure it avoids, the
alternative rejected and what broke. It does not narrate what changed, when, or at whose request;
that belongs in the commit body, where it does not rot. Where the reason is a spec rule, cite the
doc section instead of restating it.

```go
// Wrong: history in the code.
// Changed after the review; used to respond before reading the body.

// Right: rationale in the code.
// Drain before responding: an early answer measures buffers instead of the link and, on
// HTTP/1.1 through a proxy, forces a connection close (wire-protocol.md section 3.2).
```

## 11. Error responses use the native error envelope

Every error response under `/api/v1` is the JSON envelope of
[wire-protocol.md §7](../../../docs/features/wire-protocol.md#7-error-envelope), with a stable
`code` the SPA maps to localized text; a `429` also carries `Retry-After`. Compatibility layers
keep their upstream wire formats instead. Read
[references/error-envelope.md](references/error-envelope.md) before writing an error response, a
`429`, a panic-recovery path or a compat route's failure.

## 12. Time in tests: inject the clock, never sleep

Code that depends on time takes its clock as an input, and unit tests drive a fake one; a test
never sleeps to wait for state. Polling with a deadline is only for the Docker-backed tests behind
the `image` and `harness` build tags. Read [references/test-sleeps.md](references/test-sleeps.md)
before writing time-dependent code, a wait in a test, or a `time.Sleep` anywhere under `_test.go`.

## Checklist

- [ ] Imports in 3 groups; no `if err := f(); err != nil`; sentinels wrapped with `%w`
- [ ] Literals other than 0–3 are named constants; parameters have names of 3+ characters
- [ ] Each `//nolint` names its linters and says why the fix does not apply
- [ ] No storage, file write, outbound client or print (§9); no new forbidigo exclusion
- [ ] Nothing logs a body, a header, a query string or a WebSocket message
- [ ] Handlers hold no state beyond the request; compat reuses the native writer and drainer (§8)
- [ ] Comments say why, not what changed (§10)
- [ ] Native API errors use the envelope with a code from wire-protocol.md §7 (§11)
- [ ] Time comes from an injected clock; no `time.Sleep` waits for state in a test (§12)

## Lint loop

1. `pre-commit run golangci-lint-full --files <changed .go files>`, or `make go-lint` for the
   whole module. Fix and re-run until clean.
2. `make verify-go` (build, `go test -race`, vet of the untagged and tagged packages, lint).
3. `git status`: the `golangci-lint-fmt` formatters may have rewritten files; review and keep them.
