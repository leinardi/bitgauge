---
name: stateless-guard
description: >
  Guard for BitGauge's core constraint: the server never stores a result and never calls
  out. Covers the in-memory state inventory (any new state is a docs change first), what
  the depguard and forbidigo rules pinned by test/boundary catch and what they miss, the
  healthcheck's one loopback connection, what is never logged, the CSP and the dist URL
  allowlist that keep the SPA same-origin, and the two no-egress layers of the image test
  (netguard packet counters, the strace syscall layer). Use when editing any Go file under
  cmd/ or internal/, deployments/docker/Dockerfile, the CSP or security headers, or anything
  in web/ that could carry an external URL, before writing the change.
---

# Stateless Guard — BitGauge

**The server never stores a result and never calls out** (AGENTS.md, "Core constraint";
[principles.md §2.2](../../../docs/features/principles.md#22-stateless-server) and
[§2.4](../../../docs/features/principles.md#24-no-outbound-calls)). Nothing outlives a request
except the in-memory state listed in §1, and nothing leaves the process except responses on
accepted connections. Lint guards part of that, the image test another part, review the rest.

`cmd/bitgauge` and the `internal/` packages named here exist since v0.1, except
`internal/metrics` (since v0.2) and `internal/compat/` (v0.3, not built yet). The guards exist:
`.golangci.yaml` with `test/boundary`, `test/internal/netguard`, `test/internal/syscalltrace`,
`test/image` and `test/dockerfiles`.

Owned elsewhere: the full depguard and forbidigo tables are in
[`go-style-guide`](../go-style-guide/SKILL.md) §9; the image's user and filesystem in
[`trust-boundary`](../trust-boundary/SKILL.md) §9; route-level wire rules in
[`wire-compat`](../wire-compat/SKILL.md).

How to use it, before writing the change:

1. Name what the change adds: state kept across requests, an import or call that touches the
   network or the filesystem, a log line, a URL in `web/`.
2. Walk §1–§7 and mark each *applies* or *N/A*. Anything §3 lists as invisible to lint is
   checked by hand.
3. New state, a new exception or a new allowlisted URL is a docs change first.
4. Run `make verify-go` (lint plus `test/boundary`); a Dockerfile or runtime change also
   `make go-test-image`. Fix and re-run until green.

---

## 1. The in-memory state inventory

Everything the server holds, all of it in memory and gone on restart
([architecture.md §6](../../../docs/features/architecture.md#6-in-memory-state-inventory)):

| State | Size | Lifetime | Purpose |
| --- | --- | --- | --- |
| Random buffer | 4 MiB, generated at startup | process | Source of every download body (written in slices). |
| Epoch and grid origin | two values | process | Upload telemetry; restart detection. |
| Rendered `index.html` and embedded assets | the SPA build | process | Serving the SPA. |
| Effective configuration | small | process | Read once at startup. |
| Rate-limit table | ≤ `limits.tracked_clients` entries | sliding, evicted LRU | Per-IP stream, request, WebSocket and flow counters. |
| Prometheus counters | fixed set, no per-client labels | process | `/metrics`. |
| Per-request upload arrival counts | ≤ 1201 integers | one request | Returned in the response, then dropped. |
| Open connections (HTTP, WebSocket) | bounded by limits | one connection | Echo has no per-connection state beyond the socket. |

**Explicitly not kept:** results, result history, per-client history, which requests belong to
which test, client IPs beyond the rate-limit table's sliding window, request bodies, upload
telemetry after the response, access logs.

- Anything held across requests that is not a row above is a finding. A new row is a change to
  architecture.md §6 first ([decisions.md §2](../../../docs/features/technical-stack/decisions.md)
  locks the list), then code.
- No background jobs beyond the HTTP server itself
  ([architecture.md §1](../../../docs/features/architecture.md#1-one-binary)): no ticker, cache
  warmer or periodic flush.
- No cross-request correlation: no test ID, session or cookie; the server cannot tell which
  requests belong to one test.
- No file, ever: not the config, a cache, a log file or a temporary file
  ([configuration.md §5](../../../docs/features/configuration.md#5-read-only-configuration-and-the-no-write-guarantee)).
  The image runs with a read-only root and no volume, and `test/dockerfiles` rejects `RUN`,
  `SHELL`, `VOLUME`, `WORKDIR`, `ADD` and `ENV` in the runtime stage (`trust-boundary` §9).
- Lint sees none of the in-memory rules: `gochecknoglobals` is disabled, so a package-level map,
  `sync.Map` or slice passes every linter.

## 2. What the lint boundary catches

Three rule sets in [`.golangci.yaml`](../../../.golangci.yaml), tabled in `go-style-guide` §9:

- **depguard `no-storage`**: `database/sql` and the SQL, embedded-store, ORM, Redis and migration
  modules. **depguard `no-outbound`**: `net/smtp`, `net/rpc`, `net/http/cookiejar`,
  `net/http/httputil`, `golang.org/x/net/proxy`, `golang.org/x/net/websocket`,
  `github.com/gorilla/websocket`, `github.com/miekg/dns`, `google.golang.org/grpc`,
  `github.com/go-resty/`, `github.com/hashicorp/go-retryablehttp`, and the Prometheus API and
  Pushgateway clients. Both apply to every non-test file outside `test/`.
- **forbidigo** (`analyze-types: true`): printing, the `net/http` client identifiers, `net` dials,
  resolvers and `Lookup*`, `tls` dials, `websocket.Dial` from `coder/websocket`, the `os` calls
  that create, change or remove files, and `syscall.Open`, `Creat`, `Mkdir`, `Rename`, `Unlink`,
  `Truncate`, `Write`. Not applied to `_test.go`, `test/` and `cmd/bitgauge/healthcheck.go`.

[`test/boundary`](../../../test/boundary/boundary_test.go) pins them, because a rule that stops
matching fails nothing on its own:

- `linters.default: all`, depguard and forbidigo not disabled, `exclusions.generated: strict`.
- Both depguard rules scoped exactly `$all`, `!$test`, `!${base-path}/test/**`, carrying only
  `deny` and `files` (an `allow` or `list-mode` could exempt part of a denied tree).
- A list of packages each rule must deny, and neighbors it must spare (`net/http`, `net`,
  `net/netip`, `os`, `embed`, `promhttp`, `coder/websocket`, koanf, chi …), checked with a copy of
  depguard's single-candidate prefix matcher.
- forbidigo against identifiers it must forbid and identifiers the server needs (`http.Server`,
  `http.MaxBytesReader`, `net.Listen`, `os.ReadFile`, `os.Open`, `websocket.Accept`,
  `fmt.Fprintf` …).
- forbidigo exclusions are exactly the test path and the healthcheck file, forbidigo alone, by
  path; `web/` is the only excluded path.
- A real golangci-lint run on a scratch module must report `database/sql`, `http.Get`,
  `os.WriteFile` and `net.Dial` under `internal/` and none of them in a `_test.go` or `test/` file.

Changing a rule means changing `test/boundary` in the same change.

## 3. What the lint boundary misses

The rules read only this module's own source and only the names they list. Each row passes
`golangci-lint` with this configuration (checked on a scratch module):

| Gap | Passes lint | What still catches it |
| --- | --- | --- |
| State in memory | `var recent = map[netip.Addr][]Result{}` | review against §1 only |
| Calls inside a dependency | a koanf remote provider (`github.com/knadh/koanf/providers/consul`, `etcd`, `vault`, `s3`), none of them denied | netguard and the syscall layer at runtime; review of `go.mod` |
| Clients not on the deny list | `nhooyr.io/websocket.Dial` (forbidigo's `pkg` is `^github\.com/coder/websocket$`), `golang.org/x/net/http2.Transport`, `github.com/valyala/fasthttp` | same |
| A method on a value whose type is never spelled | `lib.New().Do(req)` or `.Get(url)` on an `*http.Client` a library returns: analyze-types expands it to `http.Client.Do`, which the anchored pattern does not match. Spelling `*http.Client` anywhere is caught | same |
| Writes outside the listed names | `os.OpenRoot(dir)` then `root.WriteFile`, `root.Create`; `ioutil.WriteFile`; `syscall.Openat`; all of `golang.org/x/sys/unix` | syscall layer (write intent outside `/dev` and `/proc`), `docker diff`, the read-only root |
| Sending without dialing | `net.ListenUDP` then `conn.WriteToUDP`; `syscall.Socket` with `syscall.Connect` or `Sendto` | netguard `egress`; syscall layer (a send with an explicit destination, any `connect`) |
| Lookups through allowed functions | `net.ResolveTCPAddr("tcp", "host.lan:80")`, `net.Listen` given a host name | netguard `dns` (`127.0.0.11:53`) |
| Subprocesses | `exec.Command(…)` from `os/exec`, which nothing denies | `strace -f` follows children; the runtime image has no shell or `curl` |
| Logging | `log.Printf` from the standard `log` package; `slog.Debug("req", "headers", r.Header)` | review against §5 only |
| Go files under `web/` | `exclusions.paths: [web/]` drops every finding there, so `web/embed.go` gets no depguard, forbidigo or any other linter | review; keep it to `embed.FS`, templating and the SPA route handler |

Test code (`_test.go`, `test/**`) is out of scope by design: it drives Docker and dials
localhost. A helper in a non-test file under `internal/` is in scope even when only tests call it.

## 4. The healthcheck exception

`bitgauge healthcheck` is the one place the binary sends a request
([backend.md §6](../../../docs/features/technical-stack/backend.md#6-healthcheck-subcommand)): it
loads the same configuration as `serve` and requests `GET /api/v1/ping` under the base path, at
the `server.listen` host when that is a specific address, at `127.0.0.1` when the host is empty
or `0.0.0.0`, and at `::1` for `[::]`; 3 s timeout, exit `0` on `204`, `1` otherwise. The image's
`HEALTHCHECK` is `["/bitgauge", "healthcheck"]`.

- **Lint:** `.golangci.yaml` excludes `^cmd/bitgauge/healthcheck\.go$` from **forbidigo only**;
  depguard still applies. `test/boundary` pins it as the only non-test exclusion and checks the
  pattern misses `cmd/bitgauge/main.go`, `internal/server/healthcheck.go` and
  `cmd/bitgauge/healthcheck.go.bak`. Do not add another exclusion, and keep everything but the
  request out of that file.
- **Runtime:** "The healthcheck is traced separately and may make exactly one loopback `connect`
  to the listen address"
  ([testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)).
  `syscalltrace.CheckHealthcheck` fails a non-loopback target, any `connect` other than to the
  target (`127.0.0.1:8080` for the default `:8080`), a count other than one, a send on any other
  socket, and any file write. netguard does not count new loopback connections to the listen port.

## 5. Never logged

At any level, never
([configuration-security.md §6](../../../docs/features/technical-stack/configuration-security.md#6-what-is-logged-and-never-logged)):

- request or response bodies, upload data, WebSocket message contents;
- request headers, including `User-Agent`, `Referer`, cookies and forwarding headers;
- query strings beyond the route pattern (the `bytes` value only as the byte count);
- results (the server never receives one).

The per-request line exists only at `debug` (method, route pattern, status, bytes, duration,
derived client IP). Logs go to stdout/stderr only; no log file. Error responses never echo a body
or a header, and no metric carries a client IP or a per-client label. Details and the logged
levels: `trust-boundary` §7.

## 6. The SPA stays same-origin

The browser side cannot call out either: everything is embedded, and the CSP allows only the
page's own origin ([security.md §3](../../../docs/features/security.md#3-no-outbound-calls),
[§5](../../../docs/features/security.md#5-content-security-policy-and-security-headers)).

- **CSP**: `default-src 'none'`, `'self'` for scripts, styles, fonts, workers and the manifest,
  `img-src 'self' data: blob:`, `connect-src 'self' ws://<host> wss://<host>` with the host taken
  from `Host` only after validation as a hostname, `base-uri 'none'`, `form-action 'none'`,
  `frame-ancestors 'none'`. No inline scripts or styles; `'unsafe-inline'` or any external source
  is a decisions.md change, not a quiet edit. COEP `require-corp` costs nothing only because
  everything the page loads is same-origin.
- **No external URL** in `web/`: no CDN, external font, icon set, analytics or `<link>` off the
  host ([decisions.md](../../../docs/features/technical-stack/decisions.md), "Stack Decisions to
  Avoid").
- **Dist URL allowlist** (`scripts/check-dist-urls.sh`, tested by `test/disturls`): the web
  build gate in `test/toolchain/gates.go` requires a `dist-urls` step in `web.yaml` right after
  the build: every `http(s)://` and `ws(s)://` URL in any file of `web/dist`, binary files
  included, must be on the allowlist of
  [build-packaging.md §4](../../../docs/features/technical-stack/build-packaging.md#4-ci-workflows)
  (the SVG namespaces, the GNU licenses URL and the project repository with its paths), which
  `.dist-url-allowlist` mirrors. A new entry is a docs change first. The gate activates once both
  `web/index.html` and `web/src/main.ts` exist; before that the step must not exist, after it the
  step must.
- The only call-out the docs accept is outside BitGauge: a third-party client of a compatibility
  layer contacting its own vendor (OpenSpeedTest's results link).

## 7. No egress, proven at runtime

Two layers, two different claims
([security.md §3](../../../docs/features/security.md#3-no-outbound-calls),
[testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)).
`make go-test-image` runs both on the built image; the accuracy harness uses netguard only.
`TestImage` fails, rather than skips, until `cmd/bitgauge/main.go` exists.

**netguard: no packet egress** ([`test/internal/netguard`](../../../test/internal/netguard/netguard.go))

- A holder container from the tools image starts on a Docker `--internal` network
  (`--cap-drop ALL --cap-add NET_ADMIN`, IPv6 enabled) and owns the namespace; BitGauge joins with
  `--network container:<holder>`, so it is observed from process start.
- An `inet netguard` table, output hook at priority -150 (after conntrack, before Docker's DNAT of
  the embedded DNS), with three counters: `egress`, new connections on any interface but `lo`,
  counted and dropped; `dns`, traffic to `127.0.0.11:53`; `loopback`, any other new loopback
  connection, except TCP to the listen port.
- A `sink` dummy interface with IPv4 and IPv6 default routes makes every non-local destination
  routable, so a packet reaches the hook and is counted instead of `connect()` failing early with
  "network unreachable".
- Four negative controls run before BitGauge starts, each on reset counters: TCP to `192.0.2.1`,
  TCP to `2001:db8::1`, `nslookup` through `127.0.0.11`, TCP to an unused loopback port. Each must
  move its counter, or the run fails as `instrument blind`; a test removes the sink routes and
  expects exactly that. The counters are then reset and must be zero at the end of the run.

**Syscall layer: no connection or write attempt** (`test/image`,
[`test/internal/syscalltrace`](../../../test/internal/syscalltrace/policy.go))

- `bitgauge serve` runs under `strace -f -yy` from process start, on the guard's namespace, with
  the binary checked against the image's own layer. `CheckServe` fails any `connect`, any send
  with an explicit destination, any send on a socket other than a connection accepted on the
  listen address, a write to a descriptor strace cannot name, and any file write intent (open
  flags, the create, rename, remove, link and chmod family, binding a unix socket to a path)
  outside `/dev` and `/proc`; `/dev/shm` and `/dev/mqueue` count as storage.
- Negative controls: a probe binary traced the same way must pass clean and be rejected for a
  connect-back, a `sendto` to a peer and a file create, or the test fails as "analyser blind".
- The same run also checks the image without `--read-only` leaves `docker diff` empty.

**Why both:** a packet counter cannot see an attempt that fails before a packet is built; the
syscall layer sees the attempt but runs only in the image test. The harness report says which
layer each result comes from.

---

## Checklist

- [ ] No state beyond the §1 inventory; a new row went into architecture.md §6 first
- [ ] No background job, no cross-request correlation, no file
- [ ] No new import or call that can reach the network or write a file, including the §3 gaps
  lint cannot see
- [ ] No new forbidigo or depguard exclusion; `healthcheck.go` holds only the ping request
- [ ] Nothing logged beyond the debug line's fields; no header, body, query or message
- [ ] No external URL in `web/`; CSP unchanged unless decisions.md changed first
- [ ] `make verify-go` green; `make go-test-image` green for a Dockerfile or runtime change
