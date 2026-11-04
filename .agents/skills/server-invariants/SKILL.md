---
name: server-invariants
description: >
  The server's invariants and trust boundaries: it never stores a result, never calls out, and
  fails closed on everything it believes about a request. Covers the state inventory, the lint
  boundary and its gaps, the healthcheck, config validation, client IP, the rate limiter, the
  WebSocket Origin rule, body caps, CORS, logging, the CSP and dist URLs, and the image with its
  no-egress tests. Use when editing any Go file under cmd/ or internal/, internal/config/**,
  internal/clientip/**, internal/ratelimit/**, internal/server/**, internal/compat/**,
  deployments/docker/Dockerfile, the CSP or security headers, or anything in web/ that could
  carry an external URL, before writing the change.
---

# Server Invariants — BitGauge

Nothing outlives a request except the in-memory state of §1, and nothing leaves the process
except responses on accepted connections
([principles.md §2.2](../../../docs/features/principles.md#22-stateless-server),
[§2.4](../../../docs/features/principles.md#24-no-outbound-calls)). Wherever outside input
becomes something the server believes (a config value a limit, a header a client IP, an `Origin`
a WebSocket slot, a body work), the cheap version fails open on empty, unknown, hostile or large
input; every boundary below rejects instead. Lint guards part of this, the image test another
part, review the rest.

Owned elsewhere: Go style in [`go-style-guide`](../go-style-guide/SKILL.md); routes, per-route
sizes and clamps, and wire shapes in [`wire-compat`](../wire-compat/SKILL.md).

Before writing the change: name what it adds (state kept across requests, a network or filesystem
call, a header or config value the server trusts, a body it reads, a log line, a URL in `web/`);
mark each of §1–§12 *applies* or *N/A*, checking the §2 gaps by hand; make new state, a new
exception, limit or allowlisted URL a docs change first; write the test the section names
(beside its package, [testing.md §1](../../../docs/features/technical-stack/testing.md#1-server-tests));
then run `make verify-go`, plus `make go-test-image` for a Dockerfile or runtime change.

## 1. The in-memory state inventory

Everything the server holds is listed in
[architecture.md §6](../../../docs/features/architecture.md#6-in-memory-state-inventory): the
random buffer, epoch and grid origin, the SPA, the configuration, the bounded rate-limit table,
the Prometheus counters, per-request upload arrival counts and open connections. Nothing else:
no results, history, per-client history, request bodies or upload telemetry after the response.

- Anything held across requests that is not a row there is a finding. A new row changes
  architecture.md §6 first, then code
  ([decisions.md §2](../../../docs/features/technical-stack/decisions.md#2-server-state--stateless-history-in-the-browser-only)).
- No background job beyond the HTTP server (no ticker, cache warmer or periodic flush) and no
  cross-request correlation (no test ID, session or cookie).
- No file, ever: not the config, a cache, a log or a temporary file
  ([configuration.md §5](../../../docs/features/configuration.md#5-read-only-configuration-and-the-no-write-guarantee)).
- Lint sees none of this (`gochecknoglobals` is off): review against the inventory is the guard.

## 2. What the lint boundary catches and misses

Three rule sets in `.golangci.yaml` (removed at the Rust cutover; the Rust boundary is the root
[`clippy.toml`](../../../clippy.toml)), for non-test files outside `test/`:

- **depguard `no-storage`**: `database/sql`, the SQL, embedded-store, ORM, Redis, migration modules.
- **depguard `no-outbound`**: `net/smtp`, `net/rpc`, `net/http/cookiejar`, `net/http/httputil`,
  `golang.org/x/net/proxy`, `golang.org/x/net/websocket`, `github.com/gorilla/websocket`,
  `github.com/miekg/dns`, `google.golang.org/grpc`, `github.com/go-resty/`,
  `github.com/hashicorp/go-retryablehttp`, and the Prometheus API and Pushgateway clients.
- **forbidigo** (`analyze-types: true`): printing, the `net/http` client identifiers, `net` dials,
  resolvers and `Lookup*`, `tls` dials, `websocket.Dial` from `coder/websocket`, the `os` calls
  that create, change or remove files, and `syscall.Open`, `Creat`, `Mkdir`, `Rename`, `Unlink`,
  `Truncate`, `Write`. The only non-test exclusion is the healthcheck file (§3).

[`meta/tests/lint_inheritance.rs`](../../../meta/tests/lint_inheritance.rs) pins them, because a
rule that stops matching fails nothing on its own: their scope, the packages and identifiers they
must stop, the neighbors the server needs (`net/http`, `net.Listen`, `os.ReadFile`,
`websocket.Accept`, koanf, chi …), the exclusions, and a real golangci-lint run on a scratch module.
Changing a rule means
changing that test too.

The rules read only this module's source and only the names they list. Each row passes lint:

| Gap | Passes lint | What still catches it |
| --- | --- | --- |
| State in memory | `var recent = map[netip.Addr][]Result{}` | review against §1 only |
| Calls inside a dependency | a koanf remote provider (`providers/consul`, `etcd`, `vault`, `s3`) | netguard and the syscall layer (§12); review of `go.mod` |
| Clients not on the deny list | `nhooyr.io/websocket.Dial`, `golang.org/x/net/http2.Transport`, `github.com/valyala/fasthttp` | same |
| A method on a type never spelled | `lib.New().Do(req)` on an `*http.Client` a library returns: analyze-types expands it to `http.Client.Do`, which the anchored pattern misses | same |
| Writes outside the listed names | `os.OpenRoot(dir)` then `root.WriteFile`; `ioutil.WriteFile`; `syscall.Openat`; all of `golang.org/x/sys/unix` | syscall layer, `docker diff`, the read-only root |
| Sending without dialing | `net.ListenUDP` then `WriteToUDP`; `syscall.Socket` with `Connect` or `Sendto` | netguard `egress`; syscall layer |
| Lookups through allowed functions | `net.ResolveTCPAddr("tcp", "host.lan:80")`, `net.Listen` given a host name | netguard `dns` |
| Subprocesses | `exec.Command(…)` | `strace -f` follows children; the image has no shell |
| Logging | `log.Printf`; `slog.Debug("req", "headers", r.Header)` | review against §10 only |
| Go files under `web/` | `exclusions.paths: [web/]` drops every finding, so `web/embed.go` gets no linter | review; keep it to `embed.FS`, templating and the SPA handler |

Test code (`_test.go`, `test/**`) is out of scope by design: it drives Docker and dials
localhost. A helper in a non-test file under `internal/` is in scope even when only tests call it.

## 3. The healthcheck's one loopback connection

`bitgauge healthcheck` is the one request the binary sends
([backend.md §6](../../../docs/features/technical-stack/backend.md#6-healthcheck-subcommand)):
`GET /api/v1/ping` under the base path, at the `server.listen` host, or `127.0.0.1` for an empty
host or `0.0.0.0` and `::1` for `[::]`; 3 s timeout, exit `0` on `204`, `1` otherwise.
`.golangci.yaml` excludes `^cmd/bitgauge/healthcheck\.go$` from **forbidigo only**; depguard
still applies. Never add another exclusion, and keep everything but the request out of that file.
At runtime `syscalltrace.CheckHealthcheck` fails a non-loopback target, any other `connect`, more
than one, a send on another socket and any file write.

## 4. Configuration fails closed

`internal/config` validates the whole effective configuration before the listener opens
([configuration.md §4](../../../docs/features/configuration.md#4-fail-closed-validation),
[configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).

- Every error is collected and logged one line each with `key`, `value` and `rule`; the process
  exits with status **2** without serving. Nothing is clamped or silently defaulted.
- Unknown keys are errors (koanf decode with `ErrorUnused`); a `BITGAUGE_*` variable without `__`
  is not a key and is ignored, so Kubernetes service links (`BITGAUGE_PORT`) cannot break startup.
- Enum values outside their set, `*` in `server.cors.allowed_origins` and an invalid CIDR in
  `server.trusted_proxies` are rejected. Suspicious but valid settings only `warn`. Test a
  rejected value, exit status 2 and the log line.

## 5. Client IP: a header is believed only from a trusted proxy

`internal/clientip` derives the client IP once per request, in middleware; the limiter, `/info`,
`/getIP` and debug logs all read that value
([configuration-security.md §4](../../../docs/features/technical-stack/configuration-security.md#4-trusted-proxies-and-client-ip-derivation)).

- The client is the TCP peer unless the peer is inside `server.trusted_proxies` (empty by
  default). Only then is `X-Forwarded-For` walked from the right, skipping trusted entries; the
  first untrusted address is the client. A malformed entry falls back to the peer.
- `X-Real-IP`, `Client-IP`, `CF-Connecting-IP`, `CF-Connecting-IPv6` and `Forwarded` are never
  read. `::ffff:`-mapped addresses are normalized to IPv4.
- `X-Forwarded-Proto` and `-Host` build compatibility URLs under the same condition, through one
  builder ([compatibility.md §6](../../../docs/features/compatibility.md#6-rules-every-layer-shares)).
- Test: an untrusted peer's header and a spoofed left-hand entry are ignored.

## 6. The rate limiter is bounded and keyed on the full address

`internal/ratelimit`
([configuration-security.md §5](../../../docs/features/technical-stack/configuration-security.md#5-bounded-rate-limiter)):

- **Key**: the full derived address, not the IPv6 `/64`: on a LAN every SLAAC host shares one
  `/64` and would share one budget. A test shows an untrusted peer's spoofed header cannot select
  its own bucket.
- **Limits**: `limits.max_streams_per_client`, `limits.requests_per_minute`, 4 WebSockets (fixed),
  `compat.networkquality.max_flows_per_client`; `ping`, `small`, `info`, the SPA, `/metrics` and
  preflights are not limited.
- **Bound**: at most `limits.tracked_clients` entries, the least recently seen idle one evicted.
  Entries with active work never are; when all are active the new client gets `429`
  (`table_full`) and a `warn` line.
- **Release** in `defer`, so an aborted transfer frees its slot. `429` carries `Retry-After` and is
  sent before any upload body is read.

## 7. The WebSocket handshake checks `Origin`

`/api/v1/ws` accepts an `Origin` whose host and port equal the request's `Host` (the scheme is not
compared: behind a TLS proxy BitGauge sees `http`), an origin in `server.cors.allowed_origins`, or
no `Origin` (non-browser clients). Anything else is `403`, so another site cannot use up a
visitor's four slots
([wire-protocol.md §6](../../../docs/features/wire-protocol.md#6-websocket-apiv1ws)). Test a
foreign origin, another scheme, an allowed origin and no origin.

## 8. Every body and size is capped before the first byte

Each route's cap and config key are in [wire-protocol.md](../../../docs/features/wire-protocol.md)
and [compatibility.md](../../../docs/features/compatibility.md) (summary: `wire-compat`).

- An out-of-range size is rejected or clamped as the docs say before anything is written; a
  `Content-Length` over the cap is `413` without reading.
- Every route that drains a body wraps it in `http.MaxBytesReader`, so a lying or missing
  `Content-Length` stops at the cap
  ([backend.md §2.2](../../../docs/features/technical-stack/backend.md#22-upload-and-every-route-that-drains-a-body)).
- The upload lifetime is a read deadline from handler entry through `http.ResponseController`;
  downloads get a per-write stall deadline. The server sets `ReadHeaderTimeout`, `IdleTimeout` and
  `MaxHeaderBytes`, and no global `ReadTimeout` or `WriteTimeout`, which would cut long transfers.
- Test a lying `Content-Length` and an over-cap request.

## 9. CORS and routes per group

Each group is a chi sub-router; CORS runs per group, before the limiter, so a `429` is readable
cross-origin and preflights never reach the limiter
([backend.md §3](../../../docs/features/technical-stack/backend.md#3-middleware-chain-order)).

| Group | CORS |
| --- | --- |
| Native `/api/v1` | none by default; only exact origins from `server.cors.allowed_origins` |
| OpenSpeedTest | `Access-Control-Allow-Origin: *` on every response |
| LibreSpeed `/garbage`, `/empty` | `*`, only when the request carries `cors=true` |
| LibreSpeed `/getIP` | never `*`: with `cors=true`, only an allowed origin, with `Vary: Origin` |
| networkQuality, SPA | none |

- Nothing carrying a client IP or other private data answers with `*`
  ([security.md §6](../../../docs/features/security.md#6-compatibility-layers-and-access-control-allow-origin-));
  API, compatibility and `/metrics` responses carry `nosniff` and `Cache-Control: no-store`.
- Compatibility layers mount only when toggled on; the SPA answers only its fixed routes, never as
  a catch-all; `metrics.path` is checked against the route table at startup. A new route goes
  into [compatibility.md §5](../../../docs/features/compatibility.md#5-route-table), in one group.

## 10. Never logged

At any level, never
([configuration-security.md §6](../../../docs/features/technical-stack/configuration-security.md#6-what-is-logged-and-never-logged)):
request or response bodies, upload data, WebSocket message contents, request headers (including
`User-Agent`, `Referer`, cookies and forwarding headers), query strings beyond the route pattern,
and results (the server never receives one). The per-request line exists only at `debug`:
method, route pattern, status, bytes, duration, derived client IP. Logs go to stdout and stderr
only. Error responses never echo a body or a header; no metric carries a client IP or a
per-client label.

## 11. The SPA stays same-origin

The browser cannot call out either: everything is embedded, and the CSP allows only the page's
own origin ([security.md §3](../../../docs/features/security.md#3-no-outbound-calls),
[§5](../../../docs/features/security.md#5-content-security-policy-and-security-headers)).

- **CSP**: `default-src 'none'`, `'self'` for scripts, styles, fonts, workers and the manifest,
  `connect-src 'self' ws://<host> wss://<host>` with the host taken from `Host` only after
  validation as a hostname, `base-uri`, `form-action` and `frame-ancestors` `'none'`. No inline
  scripts or styles; `'unsafe-inline'` or any external source is a decisions.md change, not a
  quiet edit. COEP `require-corp` costs nothing only because everything is same-origin.
- **No external URL** in `web/`: no CDN, font, icon set, analytics or `<link>` off the host.
- **Dist URL allowlist**: `scripts/check-dist-urls.sh` (tested by `test/disturls`, run by the
  `dist-urls` step of `web.yaml` after the build) fails on any `http(s)://` or `ws(s)://` URL in
  any file of `web/dist`, binaries included, that is not in `.dist-url-allowlist`, which mirrors
  [build-packaging.md §4](../../../docs/features/technical-stack/build-packaging.md#4-ci-workflows).
  A new entry is a docs change first.

## 12. The image: unprivileged, read-only, no egress

`deployments/docker/Dockerfile` runs `dhi.io/static`, pinned by tag, as `USER 65532:65532`
spelled out, with no shell and `HEALTHCHECK ["/bitgauge", "healthcheck"]`
([security.md §9](../../../docs/features/security.md#9-container-hardening)). `test/dockerfiles`
rejects `RUN`, `SHELL`, `VOLUME`, `WORKDIR`, `ADD` and `ENV` in the runtime stage.
`make go-test-image` runs the image with `--read-only`, `--cap-drop ALL` and
`no-new-privileges`, checks it is not root and that `docker diff` stays empty without
`--read-only`, and proves no egress with two layers
([testing.md §5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)):

- **netguard: no packet egress** ([`testenv/src/netguard.rs`](../../../testenv/src/netguard.rs)).
  BitGauge joins a holder's namespace on a Docker `--internal` network from process start. An
  nftables output hook counts `egress` (new connections off `lo`, dropped), `dns`
  (`127.0.0.11:53`) and other new `loopback` connections; a `sink` interface with default routes
  lets every packet reach the hook instead of failing early. Four negative controls (IPv4, IPv6,
  DNS, loopback) must each move their counter, or the run fails as `instrument blind`.
- **Syscall layer: no connection or write attempt** (`test/image`,
  [`testenv/src/syscalltrace`](../../../testenv/src/syscalltrace/policy.rs)). `serve` runs
  under `strace -f -yy` from process start. `CheckServe` fails any `connect`, any send with an
  explicit destination or on a socket that is not an accepted connection, and any file write
  intent outside `/dev` and `/proc` (`/dev/shm` and `/dev/mqueue` count as storage). A probe
  binary must pass clean and be rejected for a connect-back, a `sendto` and a file create, or the
  test fails as "analyser blind".

Why both: a packet counter cannot see an attempt that fails before a packet exists; the syscall
layer sees the attempt but runs only in the image test. The accuracy harness uses netguard only.

## Checklist

- [ ] No state beyond the §1 inventory, no background job, no correlation, no file
- [ ] No new network or file-writing import or call, §2 gaps included; no new lint exclusion
- [ ] New config key validated at load, fail closed, exit status 2, by key name
- [ ] Client IP only from the trusted-proxy derivation; never `X-Real-IP` and friends
- [ ] Limiter bounded, keyed on the full derived address, released in `defer`
- [ ] WebSocket `Origin` rule intact; every body capped before reading, `http.MaxBytesReader`
- [ ] CORS per group, no `*` on private data; route in the route table, no catch-all
- [ ] Nothing logged beyond the debug line's fields; no per-client metric label
- [ ] No external URL in `web/`; CSP unchanged unless decisions.md changed first
- [ ] Image stays `65532`, read-only, capability-free
- [ ] `make verify-go` green; `make go-test-image` green for a Dockerfile or runtime change
