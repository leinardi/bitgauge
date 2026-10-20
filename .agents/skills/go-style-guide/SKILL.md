---
name: go-style-guide
description: >
  Go coding rules for BitGauge. Covers the golangci-lint v2 (`default: all`) rules that bite:
  import groups, sentinel errors wrapped with %w, nolint directives and the suppression ratchet,
  complexity limits, mnd, varnamelen, and the depguard and forbidigo rules that keep the server
  stateless and silent (no storage, no outbound calls, no file writes). Also covers review rules:
  comments carry rationale, the native API error envelope, and injected clocks instead of
  time.Sleep in tests. Use when writing, editing, or reviewing any .go file in BitGauge, before
  generating code rather than after lint fails.
---

# Go Style Guide — BitGauge

Rules derived from [`.golangci.yaml`](../../../.golangci.yaml) (golangci-lint v2, `default: all`;
[decisions.md §9](../../../docs/features/technical-stack/decisions.md)). §1–§15 are what the
linters enforce, §16–§18 are review rules.

**Spec first.** The Go code is the product, `cmd/bitgauge` and the `internal/` packages
`buildinfo`, `clientip`, `config`, `handlers`, `logger`, `metrics`, `ratelimit`, `server` and
`compat/` (`openspeedtest`, `librespeed`, `nq`), plus tooling under
`test/` (meta-tests, the `image`-tagged image tests, the `harness`-tagged accuracy harness)
([architecture.md §9](../../../docs/features/architecture.md#9-planned-package-layout),
[backend.md §1](../../../docs/features/technical-stack/backend.md#1-package-map)); product code
implements the approved specification (AGENTS.md, "Project rules"). A new Go package needs a row
in the backend.md package map, which `scripts/check-package-map.sh` checks.

golangci-lint is not on `PATH` in every environment; run it through pre-commit (see "Lint loop"),
which pins the version. Never commit with `--no-verify`; fix the underlying issue instead.

`run.build-tags` is `image` and `harness`, so the linter also loads the tagged packages
(`test/image`, `test/internal/netguard`, `test/harness`). Code behind those tags is linted like
everything else.

Linters that are **disabled** in `.golangci.yaml`, so their rules do not apply:

| Disabled linter | Reason |
| --- | --- |
| `exhaustruct`, `exhaustruct_v5` | Requires every struct field to be set; too noisy for short-lived structs |
| `gomodguard` | Replaced by `gomodguard_v2`, which is enabled |
| `gochecknoglobals` | Package-level sentinels, registries and defaults are intentional |
| `nonamedreturns` | Named returns are allowed |
| `wsl` | The deprecated v4 linter; its successor `wsl_v5` stays enabled |

The formatters (`gci`, `gofmt`, `gofumpt`, `goimports`, `golines`) run in the `golangci-lint-fmt`
pre-commit hook.

## Project facts the rules assume

Each fact below is locked in the docs; code follows them, and a change starts as a docs change.

- **Module and toolchain.** `github.com/leinardi/bitgauge`, Go 1.26 (`.go-version`, `go.mod`).
- **HTTP.** `net/http` with `go-chi/chi` for route groups and middleware
  ([decisions.md §3](../../../docs/features/technical-stack/decisions.md)); handlers keep direct
  access to the `ResponseWriter` and use `http.ResponseController` for per-request deadlines
  ([backend.md §2](../../../docs/features/technical-stack/backend.md#2-handler-rules)).
- **WebSocket.** `github.com/coder/websocket`, accept only, for the latency echo at `/api/v1/ws`
  (decisions.md §8).
- **Configuration.** koanf: defaults < file < `BITGAUGE_` environment with `__` nesting
  (decisions.md §5). Read-only and validated fail-closed: every error collected, one log line per
  error with `key`, `value` and `rule`, then exit status 2 before the listener opens; nothing is
  clamped or silently defaulted
  ([configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).
- **Logging.** `log/slog` through `internal/logger`, to stdout/stderr only (decisions.md §6).
  Never log request or response bodies, upload data, WebSocket message contents, request headers
  or query strings beyond the route pattern
  ([configuration-security.md §6](../../../docs/features/technical-stack/configuration-security.md#6-what-is-logged-and-never-logged)).
- **Handlers.** Thin, and no state beyond the request; shared state is only the inventory of
  [architecture.md §6](../../../docs/features/architecture.md#6-in-memory-state-inventory).
  Download writes slices of the startup random buffer and allocates nothing per request; upload
  drains the whole body before responding, through the one shared drainer. Compat packages use the
  native building blocks, never the reverse, and nothing imports `cmd/`
  ([backend.md §1](../../../docs/features/technical-stack/backend.md#1-package-map)).
- **Client IP.** Derived once by middleware from the TCP peer, and from `X-Forwarded-For` only
  when the peer is inside `server.trusted_proxies`; `X-Real-IP` and similar headers are never read
  ([configuration-security.md §4](../../../docs/features/technical-stack/configuration-security.md#4-trusted-proxies-and-client-ip-derivation)).
- **Stateless and silent.** No storage, no file writes, no outbound calls. §9 lists the lint rules
  that enforce it.

---

## 1. Import grouping

Three groups separated by blank lines: stdlib, third-party, then this module
(`github.com/leinardi/bitgauge/...`), alphabetical within each group. `gci` and `goimports` both
enforce it and the formatters fix it; write it right to keep the diff clean.

---

## 2. Error handling

### 2a. No inline error assignment in `if` (`noinlineerr`)

**Wrong:**

```go
if err := doSomething(); err != nil {
```

**Right:**

```go
err := doSomething()
if err != nil {
```

When a variable is already declared in the same scope, use `=` not `:=` for the second and later
assignments:

```go
err := firstThing()
if err != nil { ... }
err = secondThing() // = not :=
if err != nil { ... }
```

### 2b. Wrap errors with `%w` (`errorlint`)

```go
return fmt.Errorf("read upload body: %w", err)
```

Use `errors.Is`/`errors.As` (or `errors.AsType[T]`) for comparisons, never `==` on error values;
`err113` flags that too. A body cut by `http.MaxBytesReader` is classified by type, not by message:

```go
_, tooLarge := errors.AsType[*http.MaxBytesError](err)
```

### 2c. Errors are sentinels, detail is wrapped (`err113`)

`err113` flags every `errors.New` inside a function body and every `fmt.Errorf` without a `%w`
verb, a static message included. Declare the error once as a package-level sentinel and attach the
runtime detail by wrapping it (illustrative; `internal/config/load.go` has the real ones):

```go
return fmt.Errorf(
    "%w: limits.max_upload_bytes: %d is below the 35 MiB compat.openspeedtest needs",
    ErrInvalidConfig,
    cfg.Limits.MaxUploadBytes,
)
```

Suppress with `//nolint:err113` only when no sentinel can fit, and say why (§3).

Sentinels are package-level `var`s built with `errors.New`. Export them (`Err…`) when callers need
`errors.Is`; unexported is fine for package-internal use:

```go
var ErrInvalidConfig = errors.New("invalid configuration")
```

When an error must carry structured data, implement `error` on a private struct and have the
constructor return `error`, not the concrete type, so callers are not coupled to it. A
configuration error is the obvious case: it is logged as one line with `key`, `value` and `rule`
attributes
([configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).

### 2d. Aggregating multiple errors

Aggregate with `errors.Join`; name per-item errors after their source (§12). Configuration
validation collects every error before reporting, so one run shows all problems.

### 2e. Ignoring errors explicitly

Unactionable errors, such as writing a short error body: `_, _ = …`. A failed write while
streaming a download is not one of them: it is how a client abort ends the handler
([backend.md §2](../../../docs/features/technical-stack/backend.md#2-handler-rules)). Test files are
exempt from `errcheck` on `CloseNow` (coder/websocket's close without a handshake).

---

## 3. `nolint` directives and the suppression ratchet

`nolintlint` enforces three things:

- **Specific**: name every linter; no bare `//nolint`
- **Explanation required**: every directive needs `// reason`
- **No unused**: remove directives when the code no longer triggers that linter

The form is `//nolint:<linter> // reason` (AGENTS.md, "Go / backend constraints"). The explanation
says why the fix does not apply here, not which rule fired (§16). Put the directive on the same
line for a statement, on the preceding line for a func or type. Name every linter that fires,
comma-separated with no spaces; `gocyclo`, `cyclop` and `gocognit` usually fire together:

```go
//nolint:cyclop,gocyclo // one branch per fail-closed rule: size scales with the rule list, not with logic
```

**Suppressions are ratcheted.** [`.suppressions-baseline`](../../../.suppressions-baseline) holds
one count per rule (`nolint/<linter>`, plus the eslint, fallow, shellcheck and hadolint
families). `scripts/check-suppressions.sh` runs as the `check-suppressions` pre-commit hook and
refuses a count above its baseline, a rule the baseline does not know, a count below its baseline
(the file must describe the tree), and a staged diff that adds a suppression line without also
changing the baseline. Every new, moved or removed suppression therefore needs
`scripts/check-suppressions.sh --update`, committed with the change that earned it. Raising a count
needs a reviewer's agreement; the baseline file is what they read.

---

## 4. Complexity limits

| Linter | Threshold | Note |
| --- | --- | --- |
| `gocyclo` | 15 | Cyclomatic complexity |
| `cyclop` | 15 | Same metric, different linter; both fire together |
| `gocognit` | 35 | Cognitive complexity |
| `funlen` | 50 statements | Lines are disabled (`lines: -1`) |

Prefer extracting helpers over suppressing. When suppression is the right call (a function that
branches over many independent config fields), explain why in the nolint comment.

Test files are exempt from `funlen`, `gocognit`, `gocyclo`, `maintidx` and the `cyclop`
"calculated cyclomatic complexity" check.

---

## 5. Magic numbers (`mnd`)

Numbers 0, 1, 2, 3 are allowed everywhere. Any other literal integer/float in an `argument`,
`case`, `condition`, or `return` position needs a named constant. Any literal used more than once,
or that needs explaining, is a constant too. The handler numbers come from the docs, so name them
after what they are
([backend.md §2](../../../docs/features/technical-stack/backend.md#2-handler-rules)):

```go
const (
    gridCell          = 100 * time.Millisecond
    uploadLifetime    = 120 * time.Second
    writeStallTimeout = 30 * time.Second
    wsReadLimit       = 256 // bytes; larger messages close with 1009
)
```

`strings.SplitN` is excluded from mnd checks. Test files (`_test.go`) are fully exempt from `mnd`.

---

## 6. Type aliases

Write `any`, not `interface{}`; the `gofmt` rewrite rule would otherwise change your diff.

---

## 7. Struct size (`gocritic hugeParam`)

Structs passed by value that are over ~80 bytes trigger `hugeParam`. Pass by pointer instead, or
add `//nolint:gocritic // <interface constraint reason>` when the signature is fixed by an
interface (for example `slog.Handler.Handle`, which takes a `slog.Record` by value).

The same applies to `rangeValCopy`: iterate large slices by index (`entry := &entries[index]`).

---

## 8. Line length (`lll`)

Max 140 characters. `golines` wraps automatically, but try to stay within bounds when writing new
code, especially long function signatures and struct tags. Test files are exempt.

---

## 9. Forbidden packages and identifiers (`depguard`, `forbidigo`)

These rules are the lint half of "the server never stores a result and never calls out" (AGENTS.md,
"Core constraint"). [`test/boundary`](../../../test/boundary/boundary_test.go) reads them out of
`.golangci.yaml` and pins them: their scope, the packages and identifiers they must stop, and the
neighbors the server needs (the "allowed" column draws on that list). Changing a rule means
changing that test too.

**`depguard`.** `logger` and `forbidden-forks` apply to every file; `no-storage` and `no-outbound`
apply to every non-test file outside `test/`.

| Rule | Forbids | Why | Use instead |
| --- | --- | --- | --- |
| `logger` | `github.com/sirupsen/logrus`, `go.uber.org/zap`, `github.com/rs/zerolog` | Logging is `log/slog` through one wrapper (decisions.md §6) | `internal/logger` on `log/slog` |
| `forbidden-forks` | `github.com/pkg/errors` | Superseded by the standard library | `errors` + `fmt.Errorf("…: %w", err)` |
| `forbidden-forks` | `github.com/instana/testify` | A fork of `github.com/stretchr/testify` | The upstream, if testify is ever added; the module does not depend on it today, tests use `testing` |
| `no-storage` | `database/sql` (and `database/sql/driver`); `modernc.org/sqlite`, `github.com/mattn/go-sqlite3`, `github.com/ncruces/go-sqlite3`; `go.etcd.io/bbolt`, `github.com/dgraph-io/badger`, `github.com/cockroachdb/pebble`, `github.com/syndtr/goleveldb`; `gorm.io/`, `github.com/jmoiron/sqlx`, `github.com/jackc/pgx`, `github.com/lib/pq`, `github.com/go-sql-driver/mysql`; `github.com/redis/`; `github.com/pressly/goose`, `github.com/golang-migrate/` | The server is stateless: no database, embedded store, external state or schema (decisions.md §2, principles.md §2.2) | In-memory state from the [architecture.md §6](../../../docs/features/architecture.md#6-in-memory-state-inventory) inventory only; results live in the browser |
| `no-outbound` | `net/smtp`, `net/rpc`, `net/http/cookiejar`, `golang.org/x/net/proxy`, `github.com/miekg/dns`, `google.golang.org/grpc`, `github.com/go-resty/`, `github.com/hashicorp/go-retryablehttp` | The server never calls out and does no lookups (security.md §3) | Nothing: the server only listens |
| `no-outbound` | `net/http/httputil` | `ReverseProxy` calls out and the `Dump` helpers log headers | `net/http` server types; never log headers |
| `no-outbound` | `golang.org/x/net/websocket`, `github.com/gorilla/websocket` | WebSocket is `coder/websocket` only (decisions.md §8), never as a client | `github.com/coder/websocket`, `websocket.Accept` |
| `no-outbound` | `github.com/prometheus/client_golang/api`, `github.com/prometheus/client_golang/prometheus/push` | The API client and the Pushgateway client call out; metrics are only scraped | `client_golang/prometheus`, `promhttp`, `collectors` |

**`forbidigo`** (`analyze-types: true`, so a match resolves the package, not just the name).
Excluded for `_test.go` files and everything under `test/`, and for `cmd/bitgauge/healthcheck.go`:
the one loopback `GET /api/v1/ping` the server ever sends
([backend.md §6](../../../docs/features/technical-stack/backend.md#6-healthcheck-subcommand)).
`test/boundary` pins that file as the only non-test exclusion; do not add another.

| Pattern | Forbids | Why | Use instead |
| --- | --- | --- | --- |
| Printing | `fmt.Print`, `fmt.Printf`, `fmt.Println`, `print`, `println` | Output goes through the logger (decisions.md §6) | `internal/logger`; `fmt.Fprintf` to stderr is allowed, for the config errors printed as text when `log.*` itself is invalid |
| HTTP client | `http.Get`, `Head`, `Post`, `PostForm`, `NewRequest`, `NewRequestWithContext`, `Client`, `Transport`, `DefaultClient`, `DefaultTransport` | No HTTP client (security.md §3) | Server side only: `http.Server`, `http.HandlerFunc`, `http.NewResponseController`, `http.MaxBytesReader` |
| Dial and lookup | `net.Dial`, `DialTimeout`, `DialTCP`, `DialUDP`, `DialIP`, `DialUnix`, `Dialer`, `Resolver`, `DefaultResolver`, `net.Lookup*` | Never dials out, no lookups (security.md §3) | `net.Listen`; parse addresses with `net.ParseIP` or `net/netip` |
| TLS dial | `tls.Dial`, `tls.DialWithDialer`, `tls.Dialer` | TLS ends at the reverse proxy (decisions.md §25) | Plain HTTP behind the proxy |
| WebSocket dial | `websocket.Dial` from `github.com/coder/websocket` | The server accepts WebSockets and never dials one | `websocket.Accept` |
| File writes | `os.Create`, `CreateTemp`, `WriteFile`, `OpenFile`, `NewFile`, `Mkdir`, `MkdirAll`, `MkdirTemp`, `Rename`, `Remove`, `RemoveAll`, `Truncate`, `Symlink`, `Link`, `Chmod`, `Chown`, `Lchown`, `Chtimes` | The server writes no file (configuration.md §5, principles.md §2.2) | Read with `os.ReadFile`/`os.Open`; logs go to stdout/stderr |
| Raw syscalls | `syscall.Open`, `Creat`, `Mkdir`, `Rename`, `Unlink`, `Truncate`, `Write` | Same | Same |

---

## 10. Comments and `godox`

- `FIXME` is flagged by `godox`. Do not leave `FIXME` comments in committed code.
- `TODO` is allowed.

Doc comments:

- Every exported function, type, and variable has a doc comment beginning with the symbol name.
- Inline comments explain *why*, not *what* (§16).
- Do not add doc comments or comment scaffolding to code you did not otherwise change, e.g. as a
  side effect of a bug fix.

Every `.go` file also starts with the GPL-3.0-or-later header that
`scripts/check-license-headers.sh` checks; copy it from an existing file.

---

## 11. Duplication (`dupl`)

Avoid copy-pasting blocks longer than ~100 tokens. Extract shared logic into a helper. Test files
are exempt from `dupl`. The download and upload paths are shared by design (one random-buffer
writer, one drainer for every route that drains a body); reuse them rather than copying them into
a compat package.

---

## 12. Shadowing (`govet shadow`)

`govet` shadow detection is enabled. Avoid re-declaring variables with `:=` when they shadow an
outer-scope variable. Prefer distinct names or restructuring to avoid shadows: name errors after
their source (`readErr`, `writeErr`) rather than reusing `err` in a nested scope.

---

## 13. Variable naming (`varnamelen`)

Short variable names are fine in tight scopes (loop indices `i`, `k`, map values `v`). `varnamelen`
flags a name shorter than 3 characters whose last use is more than 5 lines from its declaration
(its defaults: `min-name-length: 3`, `max-distance: 5`). Test files are exempt.

**Specific rules that bite most often:**

- **Receivers are exempt**: `(h *handler)`, `(rl *Limiter)`, `(s *server)` are all fine.
- **Parameters are checked like locals.** A one-letter parameter passes in a three-line function
  and is flagged as soon as the body grows, so give parameters ≥ 3-char descriptive names from the
  start:

  ```go
  // Wrong: 's', 'd', 'ip' are too short for params
  func parseBytes(s string) (int64, error)
  func cellFor(d time.Duration) int64
  func isTrusted(ip netip.Addr) bool

  // Right
  func parseBytes(raw string) (int64, error)
  func cellFor(elapsed time.Duration) int64
  func isTrusted(addr netip.Addr) bool
  ```

---

## 14. `modernize`: no pointer-boxing helpers

The `modernize` linter (`newexpr` check) flags any function whose sole purpose is to return a
pointer to its argument, the generic `func ptr[T any](v T) *T` included, at the declaration and at
every call site. Since Go 1.26 `new` takes an expression, so no helper is needed:

```go
// Wrong: flagged twice
func int64Ptr(v int64) *int64 { return &v }
limit := int64Ptr(maxUploadBytes)

// Right
limit := new(int64(maxUploadBytes))
```

Taking the address of a local (`val := computeSomething()`, then `&val`) is fine too, and reads
better when the value is computed or used more than once.

---

## 15. Constant strings (`goconst`)

String literals appearing 3+ times with length ≥ 2 should be extracted to a named constant. Test
files are exempt.

---

## 16. Comments carry rationale; history goes in the commit

A comment says **why the code is the way it is**: the constraint, the failure it avoids, the
alternative that was rejected and what broke. It does not narrate what changed, when, or at whose
request. That belongs in the commit body, where `git log` and `git blame` can find it and where it
does not rot as the code moves. Where the reason is a spec rule, cite the doc section instead of
restating it.

```go
// Wrong: history in the code.
// Changed after the review; used to respond before reading the body.

// Right: rationale in the code.
// Drain before responding: an early answer measures buffers instead of the link and, on
// HTTP/1.1 through a proxy, forces a connection close (wire-protocol.md section 3.2).
```

---

## 17. Error responses use the native error envelope

Every error response under `/api/v1` is the JSON envelope of
[wire-protocol.md §7](../../../docs/features/wire-protocol.md#7-error-envelope), with a stable
`code` the SPA maps to localized text; a `429` also carries `Retry-After`. Compatibility layers
keep their upstream wire formats instead. Read
[references/error-envelope.md](references/error-envelope.md) before writing an error response, a
`429`, a panic-recovery path or a compat route's failure.

---

## 18. Time in tests: inject the clock, never sleep

Code that depends on time takes its clock as an input, and unit tests drive a fake one; a test
never sleeps to wait for state. Polling with a deadline is only for the Docker-backed tests behind
the `image` and `harness` build tags. Read [references/test-sleeps.md](references/test-sleeps.md)
before writing time-dependent code, a wait in a test, or a `time.Sleep` anywhere under `_test.go`.

---

## Quick checklist before submitting Go code

- [ ] Imports in 3 groups: stdlib / third-party / `github.com/leinardi/bitgauge`, alphabetical
- [ ] No `if err := f(); err != nil`; split to two lines
- [ ] All errors wrapped with `%w`; `errors.Is` / `errors.AsType` for classification
- [ ] No `errors.New` or `%w`-less `fmt.Errorf` in a function body: wrap a package-level sentinel
- [ ] `any` not `interface{}`; `new(expr)`, not a pointer-boxing helper
- [ ] Numbers other than 0–3 extracted to named constants (non-test code)
- [ ] Each `//nolint` names specific linters, explains why the fix does not apply, and is
  committed with `scripts/check-suppressions.sh --update`
- [ ] No `FIXME` comments
- [ ] Function statement count ≤ 50 (non-test code)
- [ ] No shadowed variables
- [ ] No storage, file write, outbound client or print (§9); no new forbidigo exclusion
- [ ] Nothing logs a body, a header, a query string or a WebSocket message
- [ ] Handler holds no state beyond the request; download allocates nothing per request; upload
  drains before responding
- [ ] Comments say why, not what changed; history is in the commit body (§16)
- [ ] Native API errors use the envelope with a code from wire-protocol.md §7 (§17)
- [ ] Time comes from an injected clock; no `time.Sleep` waits for state in a test (§18)

## Lint loop

1. `pre-commit run golangci-lint-full --files <changed .go files>`, or `make go-lint` for the whole
   module (the same pinned golangci-lint, with the `image` and `harness` tags).
2. Fix every finding and re-run until clean.
3. `make verify-go` (build once a binary exists, `go test -race`, vet of the untagged, `image` and
   `harness` packages, lint). Fix and re-run until green.
4. `git status`: the `golangci-lint-fmt` formatters may have rewritten files; review and keep those
   changes. If you added or removed a suppression, run `scripts/check-suppressions.sh --update` and
   stage `.suppressions-baseline`.
