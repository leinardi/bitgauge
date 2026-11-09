---
name: server-invariants
description: >
  The server's invariants and trust boundaries: it never stores a result, never calls out, and
  fails closed on everything it believes about a request. Covers the state inventory, the lint
  boundary and its gaps, the healthcheck, config validation, client IP, the rate limiter, the
  WebSocket Origin rule, body caps, CORS, logging, the CSP and dist URLs, and the image with its
  no-egress tests. Use when editing any Rust file under src/ (src/config/**, src/clientip*,
  src/ratelimit*, src/server/**, src/handlers/**, src/compat/**, src/healthcheck*), clippy.toml,
  deny.toml, Cargo.toml dependencies or features, deployments/docker/Dockerfile, the CSP or
  security headers, or anything in web/ that could carry an external URL, before writing the
  change.
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

Owned elsewhere: Rust style in the `rust-best-practices` skill and the workspace lints in the root
`Cargo.toml`; routes, per-route sizes and clamps, and wire shapes in
[`wire-compat`](../wire-compat/SKILL.md).

Before writing the change: name what it adds (state kept across requests, a network or filesystem
call, a header or config value the server trusts, a body it reads, a log line, a URL in `web/`);
mark each of §1–§12 *applies* or *N/A*, checking the §2 gaps by hand; make new state, a new
exception, limit or allowlisted URL a docs change first; write the test the section names
(beside its module, [testing.md §1](../../../docs/features/technical-stack/testing.md#1-server-tests));
then run `make verify-rust`, plus `make rust-test-image BITGAUGE_TEST_IMPL=rust` for a Dockerfile
or runtime change.

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
- Lint sees none of this (no lint bans a `static` or a shared map): review against the inventory
  is the guard.

## 2. What the lint boundary catches and misses

The bans apply to the shipped `bitgauge` package only, outside `#[cfg(test)]`
([rust-port.md, Lint Boundary](../../../docs/rust-port.md#lint-boundary)):

- **Root [`clippy.toml`](../../../clippy.toml)**, `disallowed-methods`: the `std::fs` writes
  (`write`, `File::create`, `File::create_new`, `OpenOptions::open`, `create_dir*`, `remove*`,
  `rename`); `std::net::TcpStream::connect*`, `tokio::net::TcpStream::connect` and both
  `UdpSocket::bind`; `ToSocketAddrs::to_socket_addrs` and `tokio::net::lookup_host`; the wall
  clocks (`SystemTime::now`, `std::time::Instant::now`, jiff's `now`). `disallowed-macros`:
  `print*`, `eprint*`, `dbg`. `tokio::time::Instant::now` stays allowed: it is the injected
  clock's source.
- **[`deny.toml`](../../../deny.toml) bans**: HTTP clients (reqwest, ureq, isahc, surf, attohttpc,
  curl, awc), SQL, embedded and key-value stores and ORMs, Redis, and RPC frameworks.
- **The shipped graph** ([`deny-shipped.toml`](../../../deny-shipped.toml), the
  `cargo-deny-shipped` hook and the rust job): `cargo deny --config deny-shipped.toml check bans`
  over the `bitgauge` package alone, dev-dependencies left out, bans both test crates, the
  rust-common crates other than `service-kit` and `tracing-setup`, hyper and hyper-util `client`
  and `http2`, tokio `fs` and `process`, and axum `ws` and `http2`. It does not check that the
  two shipped crates are present.

They are pinned because a rule that stops matching fails nothing on its own:
clippy fails an `expect` of `disallowed_methods`, `disallowed_macros` or `disallowed_types` that
matches nothing, [`meta/tests/test_support_boundary.rs`](../../../meta/tests/test_support_boundary.rs)
holds `src/test_support.rs` (the `dial_loopback` helper) to `#[cfg(test)]`, and
[`meta/tests/lint_inheritance.rs`](../../../meta/tests/lint_inheritance.rs) holds the lint set and
the root `clippy.toml` to the crates they must reach (`meta/` and `testenv/` carry their own
`clippy.toml`, without the I/O and clock bans). The negative controls are listed in
rust-port.md; changing a rule means changing its test too.

The rules see only the names they list and only this package. Each row passes lint:

| Gap | Passes lint | What still catches it |
| --- | --- | --- |
| State in memory | `static RECENT: Mutex<HashMap<IpAddr, Vec<Result>>>` | review against §1 only |
| Calls inside a dependency | a crate not on the deny list that dials or resolves internally | netguard and the syscall layer (§12); review of `Cargo.toml` and `Cargo.lock` |
| Sockets not on the list | `tokio::net::TcpSocket::connect`, `nix::sys::socket::connect` or `sendto` (nix is a dependency, for signals and sockets) | netguard `egress`; syscall layer |
| Writes outside the listed names | `std::fs::copy`, `hard_link`, `set_permissions`, a `nix` or `libc` open | syscall layer, `docker diff`, the read-only root |
| Lookups through allowed functions | `tokio::net::TcpListener::bind("host.lan:80")`, which resolves inside tokio | netguard `dns` |
| Subprocesses | `std::process::Command` | `strace -f` follows children; the image has no shell |
| Logging | `tracing::debug!(headers = ?req.headers())` | review against §10 only |

Test code (`#[cfg(test)]`, `tests/`, the `meta` and `testenv` crates) is out of scope by design:
it drives Docker and dials localhost. A production item that only tests call is in scope.

## 3. The healthcheck's one loopback connection

`bitgauge healthcheck` is the one request the binary sends ([backend.md
§6](../../../docs/features/technical-stack/backend.md#6-healthcheck-subcommand)): `GET /api/v1/ping`
under the base path, at the `server.listen` host, or `127.0.0.1` for an empty host or `0.0.0.0` and
`::1` for `[::]`; 3 s timeout, exit `0` on `204`, `1` otherwise. The one exemption is the `connect`
function in `src/healthcheck.rs`, an `#[expect(clippy::disallowed_methods, reason = "…")]` that
clippy fails once it matches nothing (the others are the test-only `dial_loopback` helpers). Never
add another, and keep everything but the request out of that function. At runtime
`syscalltrace::policy::check_healthcheck` fails a non-loopback target, any other `connect`, more
than one, a send on another socket and any file write.

## 4. Configuration fails closed

`src/config` validates the whole effective configuration before the listener opens
([configuration.md §4](../../../docs/features/configuration.md#4-fail-closed-validation),
[configuration-security.md §2](../../../docs/features/technical-stack/configuration-security.md#2-fail-closed-validation)).

- Every error is collected and logged one line each with `key`, `value` and `rule`; the process
  exits with status **2** without serving. Nothing is clamped or silently defaulted.
- Unknown keys are errors (the typed walker reports each with the unknown-key rule, in
  `src/config/load.rs`); a `BITGAUGE_*` variable without `__`
  is not a key and is ignored, so Kubernetes service links (`BITGAUGE_PORT`) cannot break startup.
- Enum values outside their set, `*` in `server.cors.allowed_origins` and an invalid CIDR in
  `server.trusted_proxies` are rejected. Suspicious but valid settings only `warn`. Test a
  rejected value, exit status 2 and the log line.

## 5. Client IP: a header is believed only from a trusted proxy

`src/clientip` derives the client IP once per request, in middleware; the limiter, `/info`,
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

`src/ratelimit`
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
- **Release** in the `Permit`'s `Drop`, so an aborted transfer frees its slot. `429` carries
  `Retry-After` and is sent before any upload body is read.

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
- Every route that drains a body goes through the shared drainer (`src/handlers/drain.rs`),
  which checks the cap on every frame, so a lying or missing `Content-Length` stops at the cap
  ([backend.md §2.2](../../../docs/features/technical-stack/backend.md#22-upload-and-every-route-that-drains-a-body)).
- The upload lifetime is one 120 s deadline from handler entry over every frame read; every
  write is held to a 30 s stall rule. service-kit's server, with the settings of
  `src/server/http.rs`, sets the head timeout (idle keep-alive included) and hyper's header
  limits (`MAX_HEADERS`, `MAX_HEADER_SIZE`), and no global read or write timeout, which would cut long
  transfers.
- Test a lying `Content-Length` and an over-cap request.

## 9. CORS and routes per group

Each group is its own axum `Router` (`src/server/router.rs`); CORS runs per group, before the
limiter, so a `429` is readable cross-origin and preflights never reach the limiter ([backend.md
§3](../../../docs/features/technical-stack/backend.md#3-middleware-chain-order)).

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
- **Dist URL allowlist**: `scripts/check-dist-urls.sh` (run by the
  `dist-urls` step of `web.yaml` after the build) fails on any `http(s)://` or `ws(s)://` URL in
  any file of `web/dist`, binaries included, that is not in `.dist-url-allowlist`, which mirrors
  [build-packaging.md §4](../../../docs/features/technical-stack/build-packaging.md#4-ci-workflows).
  A new entry is a docs change first.

## 12. The image: unprivileged, read-only, no egress

`deployments/docker/Dockerfile` runs `dhi.io/static`, pinned by tag, as `USER 65532:65532` spelled
out, with no shell and `HEALTHCHECK ["/bitgauge", "healthcheck"]` ([security.md
§9](../../../docs/features/security.md#9-container-hardening)), all set once in its `base` stage.
Two targets sit on that base: `prebuilt`, which CI tests and the release ships, COPYs the release
binary from the `dist` build context; `runtime`, the default, COPYs the one the build stage
compiled. Neither takes a `RUN`, `SHELL`, `VOLUME`, `WORKDIR`, `ADD` or `ENV`.
`scripts/image-test.sh` checks the prebuilt image in CI (full tier
on amd64, reduced on arm64) and the release smoke-tests it before the tag.
`make rust-test-image BITGAUGE_TEST_IMPL=rust` runs the image with `--read-only`, `--cap-drop ALL`
and `no-new-privileges`, checks it is not root and that `docker diff` stays empty without
`--read-only`, and proves no egress with two layers ([testing.md
§5](../../../docs/features/technical-stack/testing.md#5-accuracy-harness)):

- **netguard: no packet egress** ([`testenv/src/netguard.rs`](../../../testenv/src/netguard.rs)).
  BitGauge joins a holder's namespace on a Docker `--internal` network from process start. An
  nftables output hook counts `egress` (new connections off `lo`, dropped), `dns`
  (`127.0.0.11:53`) and other new `loopback` connections; a `sink` interface with default routes
  lets every packet reach the hook instead of failing early. Four negative controls (IPv4, IPv6,
  DNS, loopback) must each move their counter, or the run fails as `instrument blind`.
- **Syscall layer: no connection or write attempt** (`testenv/tests/image`,
  [`testenv/src/syscalltrace`](../../../testenv/src/syscalltrace/policy.rs)). `serve` runs
  under `strace -f -yy` from process start. `check_serve` fails any `connect`, any send with an
  explicit destination or on a socket that is not an accepted connection, and any file write
  intent outside `/dev` and `/proc` (`/dev/shm` and `/dev/mqueue` count as storage). A probe
  binary must pass clean and be rejected for a connect-back, a `sendto` and a file create, or the
  test fails as "analyser blind".

Why both: a packet counter cannot see an attempt that fails before a packet exists; the syscall
layer sees the attempt but runs only in the image test. The accuracy harness uses netguard only.

## Checklist

- [ ] No state beyond the §1 inventory, no background job, no correlation, no file
- [ ] No new network or file-writing crate, feature or call, §2 gaps included; no new `expect`
- [ ] New config key validated at load, fail closed, exit status 2, by key name
- [ ] Client IP only from the trusted-proxy derivation; never `X-Real-IP` and friends
- [ ] Limiter bounded, keyed on the full derived address, released when the `Permit` drops
- [ ] WebSocket `Origin` rule intact; every body capped before reading, through the drainer
- [ ] CORS per group, no `*` on private data; route in the route table, no catch-all
- [ ] Nothing logged beyond the debug line's fields; no per-client metric label
- [ ] No external URL in `web/`; CSP unchanged unless decisions.md changed first
- [ ] Image stays `65532`, read-only, capability-free
- [ ] `make verify-rust` green; `make rust-test-image BITGAUGE_TEST_IMPL=rust` green for a
  Dockerfile or runtime change
