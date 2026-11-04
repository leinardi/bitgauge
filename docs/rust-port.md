# Porting BitGauge from Go to Rust

The record of the port, which is complete: what was decided, which crates replaced which Go
libraries, the lint boundary, the only differences from the Go binary that are allowed, what was
reused from the sibling ports, and what the port found along the way. The API and test maps say
where each Go package and its tests went. BitGauge ships the Rust binary since the cutover commit
(phase 18); no Go source is left.

The spec in [`features/`](features/README.md) stays the behavior contract. During the port it
described the Go binary, with the Rust behavior beside it as marked "Rust implementation (from the
cutover)" notes; the cutover removed the Go text and the markers. Where this page and the spec
disagree, the spec wins, and
[`decisions.md`](features/technical-stack/decisions.md) wins on technical choices.

## Decisions

The port is **idiomatic, not literal**. BitGauge is unreleased and has no users, so where a Go
behavior is incidental, the Rust convention or crate wins: tracing's log format over slog's, clap
over `flag`, hyper's answers to malformed requests over net/http's. What must hold:

- the HTTP contract (native API, compatibility layers, SPA, `/metrics`): routes, statuses,
  headers, JSON shapes, limits and timeouts;
- the project rules: stateless, never calls out, honest numbers, fail-closed configuration;
- every test: the ported product tests, the e2e suite, the image tests and the accuracy harness.

At the end there is no Go source in the repository.

Maintainer decisions (2026-11-03):

- All of `test/` is ported; no Go is left.
- Metrics use `prometheus-client`, OpenMetrics only.
- The Rust code lands beside Go. Go stays the shipped binary and the behavioral reference until
  one cutover commit, and a non-shipping Rust candidate image must pass every suite first.
- The server is axum on our own hyper-util accept loop.

Working rules for the port:

- Each Rust test that replaces a Go test names it in a doc comment (`/// Go: TestX`), and each
  phase's commit body lists the Go tests ported and justifies every one not ported.
- Go reference values come from Go runs, never from reasoning: throwaway Go programs outside the
  module.
- New Go-to-Rust traps are recorded in the repository copy of the porting skill,
  [`.agents/skills/rust-port-go`](../.agents/skills/rust-port-go/SKILL.md), in the same commit
  that finds them. That copy moves back to the user skills after the port.
- Until the cutover, every commit used a non-release type and changed no shipped binary, image or
  release; the cutover itself is a `feat`.

## Crate Choices

| Go | Rust | Note |
| --- | --- | --- |
| net/http server, chi | axum 0.8 (`default-features = false`, no `ws`), hyper 1 http1 server, hyper-util (`tokio` only; no `server-graceful`), tower | Our own accept loop and connection driver ([Connection Driver](#connection-driver)) |
| coder/websocket | tokio-tungstenite on `hyper::upgrade::on` | Handshake checked by hand, as in Go |
| log/slog | tracing + tracing-subscriber (`fmt`, `json`) | tracing's default text and JSON, UTC timestamps |
| client_golang | prometheus-client | OpenMetrics text only; no `go_*` or `process_*` |
| koanf + yaml.v3 + mapstructure | serde-saphyr into a spanned raw tree, our own env merge, a typed walker that collects every problem | serde derive stops at the first error, which the spec forbids |
| `time.ParseDuration` | `jiff::fmt::friendly::SpanParser` to `SignedDuration` |  |
| `net/url.Parse`, `unicode.IsPrint`, `time.Duration.String`, `%v` floats, `strconv.Quote` | In-tree ports in `src/config/` (`url.rs`, `printable.rs`, `gofmt.rs`) | They decide which values are decode problems and how problem lines read; no crate matches Go |
| `flag` | clap 4 derive behind an argument pre-scan |  |
| `embed.FS` | include_dir | `web/dist/.gitkeep` keeps a clean checkout compiling |
| crypto/rand | getrandom |  |
| errors | thiserror, one enum per module |  |
| goroutines, `context` | tokio (hand-built multi-thread runtime), tokio-util `CancellationToken` and `TaskTracker` |  |
| `-ldflags -X` | `option_env!("BITGAUGE_VERSION")`, `_COMMIT`, `_DATE`; defaults `dev` and `unknown` |  |
| depguard, forbidigo | `deny.toml` `[bans]` and clippy disallowed lists, scoped per crate | [Lint Boundary](#lint-boundary) |

## Lint Boundary

The security bans apply to **shipped production code only**: the `bitgauge` package's library
and binary, without `#[cfg(test)]`. Test infrastructure has its own rules.

- **Root `clippy.toml`**, which applies to the `bitgauge` package:
  - `disallowed-methods`: the `std::fs` writes (`write`, `File::create`, `OpenOptions::open`,
    `create_dir*`, `remove*`, `rename`); `std::net::TcpStream::connect*` and
    `tokio::net::TcpStream::connect`; `UdpSocket::bind`; `ToSocketAddrs::to_socket_addrs` and
    `tokio::net::lookup_host`; `SystemTime::now`, `std::time::Instant::now`,
    `jiff::Timestamp::now`;
  - `disallowed-macros`: `print*`, `eprint*`, `dbg`;
  - `allow-unwrap-in-tests`, `allow-expect-in-tests`;
  - `tokio::time::Instant::now` stays allowed: it is the injected clock's source and follows the
    paused clock.
- **`meta/clippy.toml` and `testenv/clippy.toml`:** clippy reads the `clippy.toml` nearest to
  each crate's manifest. These carry only the test settings, with no I/O or clock bans, since
  those crates write reports, run Docker and dial test servers by design.
- **Allowed exemptions in the `bitgauge` package**, each an
  `#[expect(clippy::disallowed_methods, reason = "…")]` on one item:
  - `src/healthcheck.rs`: the single connect;
  - `src/test_support.rs`, which is `#[cfg(test)]`: `dial_loopback`, so unit tests can connect;
  - `tests/support/mod.rs`: `dial_loopback` for the integration tests;
  - the `SystemClock` in `src/clock.rs`, only if a wall-clock read is ever needed. None is
    expected: the grid, the limiter and the deadlines use `tokio::time::Instant`, and tracing's
    timestamps are its own.
- **Pinned by a meta-test** (`meta/tests/lint_exemptions.rs`, modeled on swarm-device-access's
  `unsafe_allowlist`): every `expect` or `allow` of `disallowed_methods`, `disallowed_macros` or
  `disallowed_types` in the `bitgauge` package is in exactly those files and items, and
  `#[cfg(test)]` guards `src/test_support.rs`.
- **Dependency graph and features** (`meta/tests/production_graph.rs`):
  - it reads the resolved production features, with feature edges, through
    `cargo tree -p bitgauge -e features,normal,build --prefix none --format "{p} {f}"`.
    Dev-dependencies are excluded, so features they unify are not counted;
  - neither `testenv` nor `meta` appears, and no crate `deny.toml` bans appears (reqwest, ureq,
    isahc, surf, sqlx, rusqlite, diesel, sled, redb, redis, tonic and similar);
  - these features are not enabled: hyper's `client` and `http2`; hyper-util's `client`,
    `client-legacy` and `http2`; tokio's `fs` and `process`; axum's `ws` and `http2`;
  - the `bitgauge` dev-dependencies do not include `testenv`;
  - the same check runs on the `--target x86_64-unknown-linux-musl` view the release builds.
- **Negative controls:** a scratch crate carrying the root `clippy.toml` with `std::fs::write` in
  a plain module fails clippy; the same call under an `expect` in a file not on the allowlist
  fails the meta-test; and in scratch copies of the workspace manifest the production-graph check
  rejects `testenv` added as a normal dependency, hyper's `client` feature enabled on the
  `bitgauge` package, and a banned crate added.

## Server Design

### Connection Driver

`src/server/conn.rs`, with `timeouts.rs` and `framing.rs` adapted from swarm-scheduler-exporter.
The driver does not use hyper-util's `GracefulShutdown`: its `watch()` does not accept hyper's
HTTP/1 `UpgradeableConnection`, and its `shutdown()` future must be polled. Each accepted
connection is driven directly inside one task: on `stop` it calls `graceful_shutdown()` on the
pinned connection and keeps polling it until it ends or `cut` fires.

The fallback, if `graceful_shutdown` on the pinned `UpgradeableConnection` does not finish an
in-flight response and close an idle one: on `stop` a shared `closing` flag is raised, the
service adds `Connection: close` to every response, and `ConnIo` expires a connection in the
keep-alive idle state at once. Whether it was needed is recorded under
[Findings During the Port](#findings-during-the-port).

hyper's `header_read_timeout` stays off, because hyper arms it on every idle keep-alive. A
`Framer` parses the request framing in `poll_read`, so `ConnIo` knows whether the bytes hyper has
buffered belong to a request that has not started yet:

| State | Starts | Read deadline | Ends |
| --- | --- | --- | --- |
| Initial head | accept | accept + 10 s | head complete |
| Body | head complete | none at connection level; the handler owns it | response done |
| Keep-alive idle | response done, nothing buffered | now + 120 s until the first byte | first byte |
| Keep-alive head | first byte after idle | first byte + 10 s | head complete |
| Pipelined head | response done with the next request's bytes already read | now + 10 s, no idle phase | head complete |
| Upgraded | 101 sent | none from `ConnIo`; the WebSocket idle timer owns it | close |

In every state a write without progress for 30 s returns `TimedOut`; an expiry is `TimedOut`, and
hyper drops the connection without a response; `is_write_vectored()` is forwarded;
`poll_shutdown` drains reads for up to 500 ms, so a 413 or 408 is not lost to an RST; and
`max_header_size(16 KiB)` makes hyper answer 431.

### Shutdown and Signals

- **Signals:** SIGTERM and SIGINT are blocked before the runtime starts and taken with `sigwait`
  on a std thread, because tokio's signal socketpair would trip the strace policy. The first
  signal cancels `stop`; a second restores the default action and re-raises.
- **One `TaskTracker`** owns every connection task and every WebSocket task. The accept loop is
  the only spawner of connection tasks.
- **The WebSocket task is registered before the 101.** After the Origin, handshake and limiter
  checks the handler takes `hyper::upgrade::on(&mut req)`, moves it and the limiter guard into
  `tracker.spawn(...)`, and only then returns the 101, so the tracker is never empty between the
  HTTP task ending and the socket task starting. The socket task first awaits the upgrade,
  selecting only on it and `cut` (a `stop` then only marks shutdown as pending); once upgraded it
  closes with 1001 at once if `stop` was seen, and otherwise runs the echo loop on the socket, the
  idle timer, `stop` (1001) and `cut` (drop).
- **On `stop`,** under one deadline `grace_end = now + 10 s`: the listener is dropped; every
  connection task calls `graceful_shutdown()` and every socket task closes with 1001;
  `tracker.close()`; `timeout_at(grace_end, tracker.wait())`. If the grace runs out, `cut` is
  cancelled, the tracker is given 1 s more, `runtime.shutdown_timeout(1 s)` is the backstop, and
  the process exits 1 with "grace exceeded". Otherwise it logs "stopped" and exits 0.

### Implementation Identity

`bitgauge -help` exited 0 with usage under Go, and exits 2 with the pre-scan refusal under Rust.
Every Docker suite requires `BITGAUGE_TEST_IMPL=rust`, with no default (`go` is refused since the
cutover), and before any test checks
that `/bitgauge -help` matches the expected implementation, that the image's
`org.opencontainers.image.revision` label is the expected commit, and that the copied binary's
sha256 matches the image layer. A mismatch fails the run and never skips it. The crossed control
still checks the Go binary's recorded answers (`testenv/src/identity.rs`) are refused.

Before the cutover the Rust candidate image was built from `deployments/docker/Dockerfile.rust` by
`make rust-image` as `bitgauge:rust-candidate`, and no workflow published it. The `meta` crate
stated both artifacts through one constant, `Transition::Candidate`; the cutover made
`Dockerfile.rust` the shipped `Dockerfile` and the constant `Transition::Done`, which leaves the
meta-tests holding the shipped image alone, and deleted the Go meta-tests.

## Intended Differences from Go

These are the only differences from the Go binary that are allowed; any other one is a defect.
Each row is written into its owning pages as a marked "Rust implementation (from the cutover)"
note.

| # | Difference | Owning pages |
| --- | --- | --- |
| 1 | **Logs:** tracing's text and JSON rendering and timestamps. Messages, fields and levels are kept; invalid log settings still print as text on stderr. | configuration.md §2.5; configuration-security.md §2, §6; backend.md §1 |
| 2 | **CLI:** `--config` only (dash-prefixed values allowed); single-dash long forms refused (exit 2); help on stdout. | backend.md §1, §6; configuration.md §1 |
| 3 | **Durations:** jiff's friendly syntax; Go-only forms (`1µs`, `.5s`) may differ, and `1 minute` is now accepted. | configuration.md §1 |
| 4 | **Config problem wording:** library-originated texts are Rust's; our own rule texts are kept. | configuration-security.md §1–§2 |
| 5 | **`/metrics`:** OpenMetrics only, so no `Vary: Accept`, sent with a `Content-Length` rather than chunked; no `go_*` or `process_*`; `bitgauge_build_info{version,commit}` without `goversion`. Family names, types, labels and buckets are kept. | backend.md §7; wire-protocol.md (metrics); api/openapi.yaml; testing.md §1 |
| 6 | **Malformed requests:** hyper's empty-body 400, 414 and 431; at most 100 headers; an exact 16 KiB header limit. An unsupported `Transfer-Encoding` or HTTP version is a 400 (Go: 501, 505); a malformed `Host` is not rejected before routing. | wire-protocol.md §7; backend.md §3, §5 |
| 7 | **Stall rule:** 30 s without progress on any write, for every response and upgraded socket. | backend.md §2.1, §5; testing.md §1; edge-cases.md |
| 8 | **Transfer bytes:** counted when handed to hyper, up to about 400 KB ahead of the socket. | backend.md §7 |
| 9 | **Allocation:** "no per-request data buffer" replaces "no allocation per request"; tests check that every frame is a slice of the shared buffer. | backend.md §2.1–§2.3; testing.md §1 |
| 10 | **Upload reads:** follow hyper's read buffer; the grid counts per frame. | backend.md §2.2 |
| 11 | **WebSocket JSON:** case-sensitive keys; a duplicate key, a top-level `null` or invalid UTF-8 closes with 1007; raw values are echoed byte for byte. | wire-protocol.md §6; backend.md §2.3; testing.md §1 |
| 12 | **SPA:** HEAD allowed on SPA routes; unknown extensions are `application/octet-stream`; multi-range gets 200. | compatibility.md §5; backend.md §4; wire-protocol.md |
| 13 | **Connection deadlines:** Go's states are kept ([Connection Driver](#connection-driver)); only the mechanism changes. | backend.md §5 |
| 14 | **Go runtime variables** have no effect. | build-packaging.md |

## Reuse Ledger

Reused MIT and Apache-2.0 files, both compatible with the GPL, carry BitGauge's GPL-3.0-or-later
header plus one provenance line: "Adapted from \<repo\>/\<path\> at \<commit\>, \<license\>,
Copyright (c) \<year\> Roberto Leinardi", with the source's own license and year. Not reused:
swarm-scheduler-exporter's slog, Prometheus and net/http-wire ports, which keep Go's output byte
for byte where this port does not.

| Source | Commit | What | Adaptation |
| --- | --- | --- | --- |
| swarm-rootless-docker | `253a99b` | Idiomatic crate picks (tracing, thiserror) | Choices only, no files |
| swarm-scheduler-exporter | `722b8a3` | `Cargo.toml` | Members `.`, `meta`, `testenv`; GPL license; `unsafe_code` forbidden; the three boundary lints denied; no dependencies yet |
| swarm-scheduler-exporter | `722b8a3` | `rust-toolchain.toml`, `rustfmt.toml` | Unchanged settings |
| swarm-scheduler-exporter | `722b8a3` | `clippy.toml` | The production bans of the lint boundary; `allow-invalid` for crates not yet depended on |
| swarm-scheduler-exporter | `722b8a3` | `deny.toml` | BitGauge's bans (HTTP clients, stores, RPC); `[licenses.private] ignore`; MIT only so far |
| swarm-scheduler-exporter | `722b8a3` | `.mk/rust.mk` | `BITGAUGE_*` stamps from the Go build's variables; no `rust-run` yet |
| swarm-scheduler-exporter | `722b8a3` | `scripts/hooks/rustfmt-on-edit.sh` | Unchanged logic |
| swarm-scheduler-exporter | `722b8a3` | `meta/src/repo.rs` | `tracked_or_new` (tracked and untracked, not ignored) in place of `tracked` |
| swarm-scheduler-exporter | `722b8a3` | `meta/tests/workspace_lints.rs` | Became `meta/tests/lint_inheritance.rs`, with the clippy configuration checks and the scratch-crate control |
| swarm-scheduler-exporter | `b670952` | `src/server/framing.rs`, `src/server/framing/tests.rs` | Unchanged framing; the module doc names BitGauge's pipelined head |
| swarm-scheduler-exporter | `b670952` | `src/server/timeouts.rs` | BitGauge's states (head, body, idle, upgraded) in place of Go's four timeouts; a 30 s write stall in place of `WriteTimeout`; the read waker kept so a new deadline is armed at once; the drain on `poll_shutdown`; `wait_until_idle` for shutdown |
| swarm-device-access | `4cd31c4` | `meta/tests/unsafe_allowlist.rs` | The pattern only, for `meta/tests/lint_exemptions.rs`; no file copied |
| swarm-scheduler-exporter | `e57d989` | `deployments/docker/Dockerfile` (MIT, 2025) | Became `deployments/docker/Dockerfile.rust`: the shipped Dockerfile's `web` and runtime stages; the same zig, cargo-zigbuild and `rust-std` pins; the `BITGAUGE_*` stamps; the cargo home and `rust-src` remapped as `.mk/rust-release.mk` remaps them |
| swarm-device-access | `4cd31c4` | `.mk/rust-release.mk` (Apache-2.0) | The same pins and static build; binaries into `dist/rust/`, after `web-build`; `rust-image` for the candidate |

Rows are added by the phase that copies a file.

## Findings During the Port

Fallbacks taken, premises that turned out false, and anything else a phase found that the plan did
not expect.

- **Phase 4, the pinned `graceful_shutdown()`.** It finishes an in-flight response and closes an
  idle connection, so the `closing`-flag fallback was not applied. But called while a request is
  in flight, it disables keep-alive, and hyper 1.12 then appends `close` to that response's
  `Connection` header (`enforce_version` in `proto/h1/conn.rs`) and closes after it: a `101`
  written after `stop` reads `Connection: Upgrade, close`, and the upgrade never happens. The
  fallback would break a `101` the same way. The driver instead waits, on `stop`, until no request
  is in flight (`ConnState::wait_until_idle`: no head started, no response pending) or the response
  in flight at `stop` is done, then calls `graceful_shutdown()`, which closes the connection; `cut`
  still bounds the wait. The second bound keeps a pipelining client from holding the connection to
  the end of the grace: as under Go's `Shutdown`, it is closed after the current response, here
  after at most one more already-read request, answered with `Connection: close`. A response
  already in flight at `stop` no longer gains `Connection: close`; the connection still closes
  after it. The upgrade-race test (`upgrade_racing_stop_gets_the_101_then_1001`) failed before and
  passes after.
- **Phase 4, the drain on close.** `poll_shutdown` drains reads for up to 500 ms, and a client that
  keeps its end open after the server's FIN holds the connection task, and so the shutdown, for
  that long. Browsers and `curl` close on EOF; the loopback tests close too, as they would.
- **Phase 5, the spanned tree.** Every map value and list item read from the file keeps the
  line and column serde-saphyr gives it (`Spanned` in the tree's visitor), and a problem found
  while loading carries it as `Problem::location`. The problem line still has only key, value and
  rule (configuration-security.md section 2), so no output prints it yet. A mapping key whose name
  holds `.` or `[` is unknown at its level, as in Go, rather than read as the path it spells.
- **Phase 5, Go's parsers where they decide a problem's kind.** A `server.public_url` that Go's
  `url.Parse` refuses is a decode problem and keeps its empty default, while one it parses is
  validated, and the networkQuality rule reads the result, so `src/config/url.rs` ports go1.26's
  `parse`, `parseHost` and `unescape`. The display-name rule and the quoting of values use Go's
  `unicode.IsPrint`, pasted as a table generated by go1.26.10 (Unicode 15.0) into
  `src/config/printable.rs`. A list element that does not decode leaves a placeholder (`0.0.0.0/32`
  for a trusted proxy), as Go's decoder leaves a zero value, so the list keeps its length for the
  networkQuality rule; it is never served, since any problem is fatal.
- **Phase 5, a differential run.** The rule tables of the Go config tests and a dozen more
  cases, 165 in all, went through the Go loader and the Rust one: identical problem keys and
  values in every case. The rule texts differ only where a library wrote them (`netip`,
  `strconv`, mapstructure, `net`), as row 4 allows, and in one of ours: the duration rule no longer
  says "is not a Go duration", since the syntax is jiff's (row 3). Remaining differences, all on
  input that fails closed either way: `tRuE` is a boolean to serde-saphyr and text to yaml.v3; a
  file with a second YAML document, or a non-text mapping key, is refused where Go read the first
  document or converted the key; a byte size of more than 38 digits before its unit reads "is too
  large" rather than "is not a whole number of bytes".
- **Phase 5, problem reporting moves to phase 6.** `ReportProblems`, `ReportWarnings` and
  `StderrLogger` write through the logger, which phase 6 ports; `Problem::is_log_problem` carries
  the stderr decision now, and its test is half of `TestInvalidLogKeysReportOnStderr`.
- **Phase 5, a license.** serde-saphyr's deserialize feature pulls in encoding_rs, whose license
  includes BSD-3-Clause; `deny.toml` allows it.
- **Phase 6, the startup line.** tracing's macros name every field in the source, and the
  effective-configuration line has one field per key of the key table (36 with the message), so
  it has its own static callsite in `src/config/report.rs`, declared the way the macros declare
  theirs. Sizes are logged in bytes, as Go's line did (a `Size` was an int64 there), and a list is
  one text field, `[a b]`: Go's text handler wrote the same, while its JSON handler wrote an
  array. That is row 1.
- **Phase 6, the client IP middleware moves to phase 12.** `Middleware`, `FromContext`, `WithAddr`
  and `PeerTrusted` store the derived client in the request, which belongs to the router; phase 6
  ports `Deriver::derive`, which takes the peer as a `SocketAddr` and returns the address with
  whether the peer is trusted. `TestMiddlewareStoresTheDerivedAddress` and
  `TestFromContextWithoutTheMiddleware` move with it, and the derivation half of
  `TestMiddlewareRecordsWhetherThePeerIsTrusted` is ported now. `TestDeriveUnparsablePeer` has no
  Rust counterpart: the peer is a `SocketAddr` from the listener, never text, so it cannot fail to
  parse. A `X-Forwarded-For` line that is not UTF-8 is a malformed chain and gives the peer.
- **Phase 7, the idle list.** The plan's "idle LRU ordered by sequence number" is kept as an
  order, not as a sorted map: a map keyed by a last-seen sequence number would make each operation
  logarithmic, and configuration-security.md section 5 says constant time. The idle entries are
  linked through the `HashMap` by address, most recently seen first, which is the order a
  sequence number gives; `idle_list_keeps_its_order` checks it, since Go's `container/list` had
  no test of ours.
- **Phase 7, the clock and its timers.** `Clock` lives in `src/clock.rs`, beside the limiter
  rather than in it, since the handlers read it too. Go's `Timers` (`AfterFunc`) has no
  counterpart: tokio's `sleep_until` and `timeout_at` follow the same paused clock, so
  `TestRealClockAfterFunc` is not ported. A release is the permit's `Drop`, which runs exactly
  once, so Go's second call of one release in `TestConcurrencyLimitAndRelease` has no Rust
  spelling; an aborted transfer is a panic or a cancelled task, both in `release_on_abort`.
- **Phase 7, the limiter middleware moves to phase 12** (it came in phase 11 instead, below).
  `Middleware`, `FlowMiddleware` and
  `Refuse` write the 429 through the handlers' error envelope and wrap route groups, so they come
  with the router; `TestMiddlewareRefusesWith429BeforeReadingTheBody`,
  `TestMiddlewareReleasesOnPanic`, `TestRefuseLogsEveryTableFull`, `TestRefuseOtherErrorsAre500`
  and `TestFlowMiddlewareTakesAFlowSlotNotAStream` move with them.
- **Phase 8, the exposition.** prometheus-client writes OpenMetrics (row 5): a counter's HELP
  and TYPE lines name the family without `_total`, a histogram's `le` label comes first and
  its bounds read `1.0`, and a family's children come out in no fixed order, so the tests
  compare each family as a sorted set of lines. The crate appends a period to every
  registered help text, so Go's texts are registered without theirs and the HELP lines read
  as Go's. A family with no children, such as the request counter before any answer, is left
  out, as in Go. The endpoint's plain `500` body is promhttp's wording.
- **Phase 8, the Go metric tests not ported as they were.**
  `TestObserveAllocatesNothingOnceARouteAnswered` needs a counting global allocator, which is
  `unsafe` and forbidden; after a route's first answer, `observe` is a map lookup by `&str`, a
  `OnceLock` read and atomic adds.
  `TestNilMetricsRecordNothing` has no nil `Metrics`; its other half, a group without
  throughput routes, is `a_group_without_transfers_records_nothing`. The non-limit error of
  `TestEverySentinelIsMapped` cannot be written, since `refused` takes a `Limit`.
  `TestRegistryHoldsTheRuntimeCollectors` is inverted by row 5. The server's
  `/metrics` tests (`TestMetricsEndpointOffIsAPlain404`, `TestMetricsEndpoint`,
  `TestMetricsEndpointIsNotRateLimited`, `TestRequestsAreLabeledByOwner`,
  `TestPanickingRequestsAreCounted`) need the router and stay for phase 12; the endpoint half
  of `TestMetricsEndpoint` is in `endpoint_writes_open_metrics`.
- **Phase 9, the handlers as functions.** Each native handler is a plain function from a
  request to a `Response<axum::body::Body>`; the router of phase 12 mounts them with the method
  tables, the 404 and 405 answers and the limiter, so `routes.go` and its tests
  (`TestRoutesServeTheNativeAPI`, `TestRoutesWrongMethodIs405WithAllow`,
  `TestRoutesUnknownPathIs404Envelope`) move there. `Info` resolves what the configuration,
  the build and the epoch decide once, at startup, and adds the client per request; the
  bytes are the same. The client comes from the `Client` the client IP middleware stores in
  the request's extensions, as Go read it from the context.
- **Phase 9, the JSON bytes.** serde_json writes `<`, `>`, `&`, `\b` and `\f` and whole floats
  differently from `encoding/json`, so `src/handlers/json.rs` is a `Formatter` with Go's
  escapes and float layout: the info body of a display name holding `<`, and
  `overheadCompensationPercent: 0`, read as Go's.
- **Phase 9, the deadlines.** A write stall is the connection driver's 30 s rule (row 7), so
  `TestWriteRandomNeedsWriteDeadlines` and `TestWriteRandomCutsAStalledReader` map to phase
  4's `stalled_reader_is_cut_after_the_write_stall_timeout`. The upload lifetime is a
  `timeout_at(entry + lifetime)` on every frame instead of a connection read deadline, so
  nothing can fail to set it and `TestUploadWithoutReadDeadlinesIs500` has no counterpart;
  the grid's injected `Clock` and that timer are both tokio's, so a paused clock moves both.
  Go's read that began in one cell and returned in the next is a frame that arrived in the
  next: a frame has no beginning (row 10).
- **Phase 9, the Go handler tests not ported as they were.**
  `TestDownloadAllocatesOnlyTheContentLength` and `TestProbesAllocateNothing` need a counting
  allocator, which needs `unsafe`; row 9 replaces the rule, and `random_body_bounds_each_frame`
  checks that every frame is a slice of the shared buffer. `TestWriteErrorUnencodableDetailsAre500`
  cannot be written: `Details` holds JSON values, which always encode (the fallback body
  stays). Go's half-closed and chunked requests are one case each here: a request without
  `Content-Length`. `TestWebSocketsAreCounted` moved to phase 10 with the WebSocket.
  `NormalizeOrigin` lower-cases a non-ASCII host with Rust's full case mapping, where Go maps
  one rune to one rune (U+0130, a final sigma); both sides of a comparison go through it.
- **Phase 9, an abort writes nothing.** Go's handler panicked with `http.ErrAbortHandler` so
  that a client gone mid-body got no status line. Here the drainer answers with an empty
  response carrying the `Abort` extension, and the connection driver's service fails such a
  response, on which hyper closes the connection without writing
  (`an_aborted_upload_writes_nothing`). A `RandomBody` that is never polled counts an abort
  when dropped, so phase 12 must not build one for a `HEAD` on download.
- **Phase 9, a license.** axum, axum-core and tower pull in sync_wrapper, which is Apache-2.0
  only; `deny.toml` allows it.
- **Phase 10, the WebSocket.** `WebSockets::respond` checks the Origin (a plain 403), the
  handshake (the 400 envelope with `Sec-WebSocket-Version: 13`) and the limiter (the shared
  429 of `handlers::refuse`, which phase 12's limiter middleware reuses), then registers the
  socket's task through phase 4's `spawn_socket_task` with the limiter permit as its guard
  and returns the 101. The upgraded socket is tokio-tungstenite with a 256-byte message and
  frame limit. A close the server starts waits up to 5 s for the client's close frame, as Go's
  library does, and `cut` ends that wait; after a 1009 or a protocol error (1002) the socket
  is dropped at once, since what follows on the wire cannot be read. Ping and pong control
  frames do not restart the idle window, as in Go, where the library consumes them. Go's
  `CloseAll` is the lifecycle's `stop` and `cut`, so `TestWebSocketCloseAll` and
  `TestWebSocketCloseAllHonoursItsContext` become `stop_closes_every_socket_with_1001` and
  `cut_ends_a_close_the_client_never_answers`. The idle test runs on the real clock with a
  400 ms window; Go's check that one timer stays armed has no counterpart, since the window is
  one `Sleep` reset per message. Duplicate keys are refused at the top level only, where the
  decoder reads them; a value echoed raw is not inspected. The Origin's host is compared with
  the request's ASCII-case-insensitively, where Go folds Unicode case; both are ASCII on the
  wire.
- **Phase 11, the layers.** Each layer is a module of `src/compat/` with its route-table rows
  (`ROWS`, a path, its methods and its Allow value) and a `routes` function returning an axum
  `Router` that phase 12 merges under `server.base_path`. A path is routed with `any` and the
  layer dispatches on the method, so `HEAD` is served only where a row lists it, as chi did,
  rather than by axum's implicit `HEAD` on `GET`, and an unlisted method gets the envelope 405
  with the row's Allow value. Go's `chi.Walk` checks become `assert_rows`, which sends every
  method to every row. A `HEAD` that axum answers has no body, so a `HEAD` 405 or 429 is
  checked by status and headers, as Go's tests did. LibreSpeed's `/getIP` body is a struct in
  Go's field order (`rawIspInfo`, then `processedString`); the server list and the
  networkQuality config are JSON maps, sorted as Go sorts a map's keys.
- **Phase 11, the limit holds its slot through the body.** Go's middleware released the slot
  when the handler returned, after it had written the body. A Rust handler returns before its
  body streams, so `handlers::Limit` moves the permit into the response body, which hyper drops
  when it is done (`a_download_holds_its_slot_until_its_body_is_done`). It and the shared
  `refuse` came with the WebSocket and the layers, ahead of phase 12, so the Go middleware tests
  came with them to `src/handlers/tests/limit.rs`:
  `TestMiddlewareRefusesWith429BeforeReadingTheBody`,
  `TestMiddlewareReleasesOnPanic`, `TestRefuseLogsEveryTableFull` and
  `TestFlowMiddlewareTakesAFlowSlotNotAStream`. `TestRefuseOtherErrorsAre500` has no
  counterpart: an acquisition fails only with a `LimitError`. A request without a `Client`
  shares the budget of the unspecified address, as Go's zero address did. Phase 12 keeps the
  route groups' wiring.
- **Phase 11, the query.** `handlers::query_value` is Go's `URL.Query()[name][0]`, moved out
  of the download handler so LibreSpeed's `ckSize` and `cors` read the same way.
- **Phase 12, the middleware is one service.** Recovery, client IP, security headers and
  observation run in `server::middleware::Stack`, one tower `Service` around the router, in Go's
  order. Recovery is the panic catch of tower-http's `CatchPanicLayer`, written in the tree: its
  answer depends on the request's group (the envelope, or plain text with `no-store` on the
  SPA's) and its log line names the matched route, neither of which tower-http's handler sees.
  The route comes from axum's `MatchedPath` through a route layer, `record_route`, in the route
  table's syntax (`/assets/*`). A handler returns before its body streams, so a request is
  observed when its body ends or is dropped, which is when Go's handler returned; a WebSocket is
  observed at its 101. A recovered panic is counted but writes no request line, as in Go; a
  panic inside the body, once the head is out, drops the connection and is counted with the
  status it started. The security headers are added after the handler without replacing a
  value it set, which is what Go's setting them first gave. `server::router::app` is the
  service the connection driver serves.
- **Phase 12, the route label of a 405.** chi matched no route for a method a row does not
  list, so Go counted that 405 as `unmatched`. axum matches the path, so
  `Classifier::route` reads the row's methods and labels it `unmatched` too
  (`an_unlisted_method_is_unmatched`). The metrics endpoint keeps its route for every method, as
  Go's `getOnly` did; a native 405's debug line reads `unmatched` where Go's read `/api/v1/*`.
- **Phase 12, the API prefix with its slash.** axum's catch-all needs a tail, so
  `/api/v1/` is a route of its own; without it the path fell to the plain 404 instead of the
  envelope (`routes_unknown_path_is_404_envelope`).
- **Phase 12, ranges from a go1.26 run.** `http.ServeContent` ignores a range that cannot overlap
  an empty file (200) and writes the end of an empty suffix as -1 (`bytes 0--1/0`);
  `src/web/files.rs` does both, and reads an empty `If-Match` or `If-Range` as no header, as
  `Header.Get` does. An asset name goes through Go's `path.Clean` before it is looked up, so
  `/assets/fonts//x.txt` and `/assets/./index-a1.js` are served and a name that leaves
  `assets/` is 404. Every range, conditional and asset-path case in `src/web/tests.rs` is the
  answer of a go1.26 run. The SPA's routes answer `HEAD` (row 12), so their 405 carries
  `Allow: GET, HEAD` and no body, where chi's carried `Allow: GET`.
- **Phase 12, the embedded build.** `include_dir!` does not make cargo watch `web/dist` on a
  stable toolchain, so `build.rs` declares `rerun-if-changed=web/dist`; it writes the line to
  stdout rather than printing it, since the print macros are banned in the package. A missing
  file or meta element is a `RenderError`; phase 13's startup turns it into exit status 1.
- **Phase 12, the test client.** The server tests send each request with hyper's HTTP/1 client,
  a dev-dependency only. The production-graph check reads the normal and build graph, so its
  scratch copies drop the dev-dependencies, which would otherwise name hyper a second time when a
  control stubs it.
- **Phase 12, the Go server tests not ported as they were.** `TestChainOrder` and
  `TestPanicInsideEveryStageIsRecovered` probe Go's stage list; here the four stages are one
  service in a fixed order, and only the router runs inside the panic catch, since the stages are
  BitGauge's own code. `TestRecoveryCompletesTheRouteContext` checks chi's route context, which
  axum has no counterpart of. `TestChainKeepsTheResponseControllerReachable` has no
  `ResponseController` to reach; its Rust counterpart is the upgrade,
  `a_websocket_upgrade_passes_through_the_stack`. `TestRouterServesOnlyTheRouteTable` walked the
  router with `chi.Walk`, which axum lacks; every method is sent to every row instead. The zero
  address of `TestFromContextWithoutTheMiddleware` and the unparsable peer of
  `TestMiddlewareRecordsWhetherThePeerIsTrusted` cannot be written: the peer is a `SocketAddr`
  from the listener and `Client` is only ever derived. In `TestLayerGroupsTakeTheAPIRules` the
  meter knows the layers' routes from the configuration that enables them, so the panicking
  route keeps its pattern. The 10 s grace of `TestRunCutsRequestsAfterTheGrace` is the command's,
  which phase 13 ports; the cut itself is phase 4's `download_past_the_grace_is_cut`.
- **Phase 13, the command runs in process.** `command::run` takes the arguments and a
  `Process` (stdout, stderr, the environment, the SPA renderer, a `Mode` and the `Lifecycle`),
  so the Go `cmd` tests run without a child process. `Mode::Process`, which `main.rs` uses,
  blocks SIGTERM and SIGINT, installs the global logger, starts the `sigwait` thread and then
  builds the multi-thread runtime by hand; `Mode::InProcess` runs a current-thread runtime under
  the test's log dispatch and leaves the signal mask alone. Help, refusals, configuration
  problems and the healthcheck return before anything blocks a signal. `tests/process_mode.rs`
  runs `Mode::Process` in child processes: one signal exits 0 after "stopped", and a second one
  during a shutdown held by an unread download ends the child by the signal; building the runtime
  before blocking the signals fails it. `TestMain` built the Go binary; `tests/cli.rs` runs
  Cargo's own build of it.
- **Phase 13, the listener.** `server::listen::bind` follows Go's `net.Listen`: a wildcard host
  (empty, `0.0.0.0`, `::`) binds `[::]` with `IPV6_V6ONLY` off and falls back to `0.0.0.0`, an
  IPv4-mapped address binds as IPv4, and a zone (`fe80::1%eth0`) is the scope id from
  `if_nametoindex`, or the zone read as a number. A taken port stops the attempt at once.
- **Phase 13, the healthcheck.** It is blocking std code with no runtime and no DNS: the literal
  address derived from `server.listen` (empty or IPv4 wildcard to `127.0.0.1`, `::` to `::1`,
  an IPv4-mapped host to its IPv4 address, as the listener binds it),
  one `connect_timeout`, the read and write timeouts set to what is left of the 3 s before each
  call, and the deadline checked after every read. Its deadline reads `tokio::time::Instant`,
  since std's `Instant::now` is banned in the package; without a paused test clock both read the
  same monotonic clock.
- **Phase 13, the make targets.** `make rust-bin` builds the release binary after the web build,
  `make rust-run` serves it as `make run` serves Go's, and `make e2e BIN=<path>` runs Playwright
  against a prebuilt binary instead of building the Go one.
- **Phase 14, the wire corpus.** `tests/testdata/wire/<profile>.json` is what the Go binary
  answered to 315 requests on five profiles (`default`, `layers`, `base`, `streams`, `rate`, each
  with its `<profile>.yaml`): every route with each layer on and off, CORS, preflights and
  `Origin`, `HEAD` and 405, `base_path`, the stream, flow, WebSocket and rate limits, the caps and
  the metrics headers. A throwaway Go program sent each case's exact request bytes to a Go binary
  built from a copy of the tree whose `web/dist` was `tests/testdata/wire/spa`, ran every profile
  twice, and recorded what differed between the runs (random bodies, the epoch, the telemetry's
  timing) as volatile; the build stamps of `/api/v1/info` and the upload timing were marked
  volatile by hand. `tests/wire.rs` replays the corpus against the Rust server in process and
  fails on any difference `ALLOWED` does not list with its row (5, 6 and 12), and on an allowed
  one that no longer occurs. The corpus outlives the cutover as the API contract test: from then
  on a deliberate change to an answer edits the corpus by hand, in the commit that changes the
  spec.
- **Phase 14, the statuses.** The corpus has every status Go answered to it: 101, 200, 204, 206,
  304, 400, 403, 404, 405, 411, 412, 413, 416, 429, 431, 501 and 505 (the last two are hyper's
  400, row 6). Three are not in it: 408, because the upload lifetime is a fixed 120 s and the head
  deadline 10 s, too long for a contract test (`src/server/tests.rs` and the upload tests cover
  both on a paused clock or a short timeout); 500, because no route panics (the recovery is
  tested with a panicking route in `src/server/tests/middleware.rs`); and 414, because a long
  target answers 431 in both, the request line counting against the 16 KiB head.
- **Phase 14, timing in the replay.** An open request (the upload that holds the only stream) is
  followed by a probe sent until it answers 429, in the capture and the replay alike, so the next
  case never races the server taking the stream. The rate profile's 429s come from a real-clock
  bucket that refills continuously, a token a second at 60 requests a minute, so a refill can land
  anywhere in the run: where Go answered the `rate_limited` 429, the replay accepts a 200 by
  spending one token of a budget of one more than the whole seconds since the server started,
  in a repeated case and in a single one alike, and compares a repeated case on its last answer
  with the recorded status. Every other status matches exactly. A 1.1 s pause before the last two
  cases, forcing a refill, was checked to pass. A server start that loses its released port to
  another socket is retried on a new one.
- **Phase 14, the defects it found,** each fixed here with a unit test: a `Connection: close`
  request got the LibreSpeed `/empty` handler's `keep-alive` with hyper's `close` appended, where
  Go replaced it, so the middleware drops a handler's `Connection` value on a closing connection;
  a `HEAD` 204 carried the `Content-Length: 0` axum sets from the empty body, which RFC 9110
  forbids and Go never sent; and a 416 kept the file's `Cache-Control`, which Go's `ServeContent`
  drops from its errors (it keeps it on a 304 or 412). Row 5 now names two consequences of
  serving OpenMetrics only that the corpus showed: no `Vary: Accept`, and a `Content-Length`
  rather than chunking.
- **Phase 15, the candidate image.** `deployments/docker/Dockerfile.rust` is the shipped
  Dockerfile with a zigbuild build stage; `make rust-image` builds it for the host platform as
  `bitgauge:rust-candidate`, and no workflow or `DOCKER_TARGETS` entry names it. It has its own
  `Dockerfile.rust.dockerignore`, which BuildKit reads in place of the root one: the root file
  sent `target/` into the context and left out `tests/`, whose Rust files the manifest's
  `[[test]]` targets need for cargo to read it. The pins appear twice, in the Dockerfile's build
  stage and in `.mk/rust-release.mk`; phase 16's toolchain meta-test keeps them equal. The image
  was checked by hand: 7.2 MB, `-help` refused with exit 2, the revision label set; run read-only
  with every capability dropped, it answered the ping (204), the SPA (200) and its healthcheck
  (0), `docker diff` was empty, and `docker stop` ended it with exit 0 after "stopped".
  `make rust-release-binaries` built both static, stripped binaries into `dist/rust/` with
  `checksums.txt`, no host path in either, with the pinned zig fetched into the scratchpad by its
  sha256, since zig is not on `PATH` here. The Go meta-tests learned the candidate:
  `isDockerfile` matches `Dockerfile.<name>` (not its `.dockerignore`), `deployments/docker` may
  hold exactly the shipped file and the candidate, and `TestRustCandidateIsTestOnly` finds it and
  fails if any workflow names it.
- **Phase 16, the meta-tests in the meta crate.** The Go meta-tests under `test/` are ported to
  `meta/tests/` and stay, unchanged, until the cutover deletes them; the scripts the dist tests
  drive run through `meta::script`. The transitional assertions (`toolchain.rs`, `dockerfiles.rs`
  with `dockerfiles/release.rs`, `audit_deps.rs`) read `meta::transition::TRANSITION`, today
  `Transition::Candidate`: the shipped Dockerfile is held to the Go build's checks and
  `Dockerfile.rust` to the Rust build's, and at the cutover the one constant becomes `Done`. Each
  has a negative control that mutates one file in memory. The compat boundary, which Go read from
  `go list -deps`, is a source scan (`meta/tests/compat_boundary.rs`): no file of `src/handlers`,
  `src/ratelimit` or `src/clientip` spells a path to `crate::compat`, with comments stripped, so
  the configuration's `compat` field stays allowed. The `docs-links` hook runs
  `cargo test --offline --locked -p meta --test docs`. Found while porting: `make audit-deps` runs
  no `cargo deny` (only `make rust-deny`, its hook and the CI rust job do), and no file pins the
  cargo-deny version; `audit_deps.rs` pins today's set, and the cutover adds `rust-deny` to it.
- **Phase 17, the testenv crate.** `testenv/` holds the Docker suites in Rust: the docker CLI
  runner, environments and the sweep, gitenv, toolgate, the `harness = false` runner with a
  Go-style `--run`, netguard, the syscall analyser and the identity check (`testenv/src/identity.rs`,
  adapted from swarm-device-access). The image suite (`tests/image`, feature `image`) and the
  harness runners (`tests/harness`, feature `harness`) take the image `make test-impl-image`
  built for `BITGAUGE_TEST_IMPL` (`bitgauge:go-test` or `bitgauge:rust-candidate`) and never build
  BitGauge themselves; the identity check and its crossed control run before any test. The probe
  is a std-only Rust program the image suite compiles with `rustc` for the musl target, so no
  Cargo target, and thus no workspace clippy run, covers it; it is linted with `clippy-driver`.
  The Rust candidate's serve and healthcheck traces (`testenv/tests/testdata/syscalltrace/rust-*`)
  pass the policies unchanged. `make rust-test-image` and the harness targets run cargo and refuse
  to run without `BITGAUGE_TEST_IMPL`; `harness.yaml` passes `go`, the shipped implementation.
  Found while porting: the first Rust CI tier failed ci-500k-300ms on loaded latency (+190 ms
  over WebSocket against +14 ms on the Go image), because the accept loop left Nagle on where Go
  sets TCP_NODELAY; `src/server/conn.rs` now sets it on every accepted connection (the trap is in
  `rust-port-go`). Neither image is byte-reproducible across rebuilds of one commit from a dirty
  tree; the identity check compares the copied binary against the image's own layer, so it is
  unaffected.
- **Phase 18, the cutover.** `Dockerfile.rust` became the shipped `Dockerfile`,
  `Transition::Done` holds the meta-tests to the shipped image alone, and the Go server, its
  tests, its toolchain pins, its hooks and its workflows are gone. Release binaries are the static
  musl builds of `make rust-release-binaries`, with zig and cargo-zigbuild installed by
  `make rust-zigbuild-install` from the pins in `.mk/rust-release.mk`; the tag annotation records
  `Rust: X.Y.Z`, which `recover-toolchains.sh` reinstalls for a recovery. Idle footprint, measured
  with `scripts/idle-measure.sh windows` (five 60 s windows after a 30 s warm-up, no Docker
  census) on one host, both binaries at once on loopback with the default configuration: the Go
  binary built from the last Go tree (its server code unchanged since the loop was armed) held a
  median VmRSS of 18.92 MiB (18.39–19.11, peak 19.11), the Rust binary 12.12 MiB (flat, peak
  12.12); both used 0.00 % of one core. No Go value had been recorded before arming, so the Go
  figure is that rebuild's. The binaries are 17.1 MB (Go, unstripped `-trimpath` build) and
  5.4 MB (Rust release). The precondition re-run of the phase 17 Rust gates on the candidate
  image passed the image suite and failed the CI tier on two runs: ci-500k-300ms in Chromium,
  where the ICMP reference rose to 1–1.6 s in released batches already before the test (a host
  stall; BitGauge's own figures matched Firefox and WebKit), and ci-100m-50ms-caddy-h2 in Firefox,
  where an upload ramp that went to four streams left a 3.9 s window and no path B sample. Both
  are recorded in that run's report. On the shipped image, on a quiet host, the image suite and
  all 21 CI-tier runs passed at the first attempt, with every netguard counter at zero and that
  Firefox h2 upload measured on 51 path B samples. Found at the cutover:
  `web/src/lib/csp.test.ts` read the style hash from the Go source; it reads
  `src/server/classify.rs` now.
- **Phase 19, the docs.** AGENTS.md, CONTRIBUTING.md, the README, the release and engineering
  docs, the implementation pages and the skills describe the Rust server; `go-style-guide` is
  deleted. The dated QA reports under `docs/engineering/qa/` keep their Go paths: they record what
  was tested then. `meta::transition` keeps its single `Done` stage, which nothing branches on
  any more. The repository copy of `rust-port-go` stays in `.agents/skills/` until the maintainer
  moves it back to the user skills; until then, a new Go-to-Rust trap is still recorded there.
- **Pre-flight:** `zig` was not on `PATH` and `cargo-machete` was not installed when the loop
  started. The `cargo-machete` pre-commit hook builds its own; phase 15 fetched the pinned `zig`
  into the scratchpad.

## API Map

Go package to Rust module, by the phase that ported it.

| Go | Rust | Phase |
| --- | --- | --- |
| `internal/config` | `src/config/`: `mod.rs` (`Config`, `Problem`, `EXIT_INVALID_CONFIG`), `load.rs` (`load`, `load_from`, `Loaded`, the environment), `raw.rs` (the raw tree, with each value's location), `decode.rs` (the key table and the walker), `types.rs` (`Size`, `Listen`, `Cidr`, `Origin`, `Warmup`), `validate.rs` (`validate`, `check`), `warn.rs`, `effective.rs`, `preset.rs`, `url.rs` (Go's `url.Parse`), `gofmt.rs`, `printable.rs` (Go's `IsPrint`). `ReportProblems`, `ReportWarnings` and `StderrLogger` move to phase 6 with the logger | 5 |
| `internal/buildinfo` | `src/buildinfo.rs` (`info`, `Build`, the `option_env!` stamps) | 6 |
| `internal/logger` | `src/logger.rs` (`stdout`, `to_writer`, `stderr_text`, `text_to`, `parse_level`, `Format`, `LogError`); `ReportProblems`, `ReportWarnings` and the startup line in `src/config/report.rs` | 6 |
| `internal/clientip` | `src/clientip.rs` (`address_class`, `suggested_label`, `version`, `Labeler`, `Rule`, `Deriver`, `Client`); the middleware and context helpers move to phase 12 | 6 |
| `internal/ratelimit` | `src/ratelimit.rs` (`Limiter`, `Options`, `Permit`, `Limit`, `LimitError`, the codes); `Clock` and `TokioClock` in `src/clock.rs`; the middleware and `Refuse` are `Limit` in `src/handlers/limit.rs` and `refuse` in `src/handlers/envelope.rs` (phases 10 and 11) | 7 |
| `internal/metrics` | `src/metrics.rs` (`Metrics`, `Route`, `Transfer`), `src/metrics/labels.rs` (`Group`, `Direction`, `UNMATCHED`, the code slots), `src/metrics/endpoint.rs` (`encode`, `respond`, `CONTENT_TYPE`) | 8 |
| `internal/handlers` | `src/handlers.rs` and `src/handlers/`: `random.rs` (`RandomSource`, `RandomBody`), `epoch.rs` (`Epoch`, `Grid`), `drain.rs` (`drain_body`, `DrainOptions`, `Abort`), `envelope.rs` (`error_response`, the codes), `json.rs` (Go's `json.Marshal` layout), `origin.rs` (`request_origin`, `valid_host`, `normalize_origin`), `download.rs`, `upload.rs`, `probes.rs` (`ping`, `small`), `info.rs` (`Info`), `ws.rs` and `ws/message.rs` (`WebSockets`, the strict message decode), `refuse` in `envelope.rs` (Go's `ratelimit.Refuse`); the routes move to phase 12 | 9, 10 |
| `internal/compat/openspeedtest` | `src/compat/openspeedtest.rs` (`routes`, `Deps`, `ROWS`, the sizes and paths); `Row` in `src/compat.rs` | 11 |
| `internal/compat/librespeed` | `src/compat/librespeed.rs` (`routes`, `Deps`, `ROWS`, `/getIP`, the server list), `src/compat/librespeed/cors.rs` | 11 |
| `internal/compat/nq` | `src/compat/nq.rs` (`routes`, `Deps`, `ROWS`, the config) | 11 |
| `internal/server` (`server.go` settings, `shutdown.go`) | `src/server/conn.rs` (`serve`, `drive`, `Lifecycle`, `Outcome`), `src/server/timeouts.rs` (`Timeouts`, `ConnState`, `ConnIo`), `src/server/framing.rs`, `src/server/upgrade.rs`, `src/server/signals.rs`, `src/server/mod.rs` (`finish_process`) | 4 |
| `internal/server` (router, middleware) | `src/server/routes.rs` (`route_table`, `check_routes`, `mounted_routes`, `Owner`, `Route`), `src/server/classify.rs` (`Classifier`, `Group`, `set_headers`, `content_security_policy`), `src/server/router.rs` (`app`, `router`, `Groups`), `src/server/middleware.rs` (`Stack`, `Observer`, `record_route`; Go's `clientip.Middleware` is its client IP stage, which stores the `Client`); the native routes and their CORS in `src/handlers/routes.rs` (`native_routes`, `Native`, `NATIVE_ROUTES`) | 12 |
| `web/embed*.go` | `src/web.rs` (`Spa`, `RenderError`, `route_patterns`, `ROOT_ASSETS`, `METHODS`), `src/web/files.rs` (one file's answer: the content types, the ranges, the conditional headers, `not_found`, `plain_error`); `build.rs` | 12 |
| `cmd/bitgauge` | `src/main.rs`; `src/command.rs` (`run`, `Process`, `Mode`, `SHUTDOWN_GRACE`, the startup order); `src/cli.rs` (`parse`, `Parsed`, `Options`, `CliError`, the pre-scan); `src/healthcheck.rs` (`answers`, `address`, `TIMEOUT`); `src/server/listen.rs` (`bind`, `addresses`, `zone_index`) | 13 |

## Test Map

Go test package to Rust test target, by the phase that ported it. The per-test mapping is
the `/// Go: TestX` doc comment on each Rust test; the commit body of each phase lists the Go tests
it did not port, with the reason.

| Go | Rust | Phase |
| --- | --- | --- |
| `internal/config` | `src/config/tests/` (`load.rs`, `validate.rs`, `effective.rs`, `types.rs`); `TestReportProblems` and the reporting half of `TestInvalidLogKeysReportOnStderr` move to phase 6 | 5 |
| `internal/buildinfo`, `internal/logger`, `internal/clientip` | `src/buildinfo.rs`, `src/logger/tests.rs`, `src/clientip/tests.rs`; `TestReportProblems`, `TestInvalidLogKeysReportOnStderr` and the rendering half of `TestEffective` in `src/config/tests/report.rs`; the middleware tests move to phase 12 | 6 |
| `internal/ratelimit` | `src/ratelimit/tests.rs`, `src/clock.rs`; the middleware tests in `src/handlers/tests/limit.rs` (phase 11) | 7 |
| `internal/metrics` | `src/metrics/tests.rs`; the server's `/metrics` tests stay for phase 12 | 8 |
| `internal/handlers` | `src/handlers/tests/` (`random.rs`, `epoch.rs`, `envelope.rs`, `json.rs`, `origin.rs`, `drain.rs`, `download.rs`, `probes.rs`, `upload.rs`, `info.rs`, `contract.rs`, `metrics.rs`, `loopback.rs`, `ws.rs`); the route tests move to phase 12 | 9, 10 |
| `internal/compat/...` | `src/compat/tests/` (`openspeedtest.rs`, `librespeed.rs`, `nq.rs`) | 11 |
| `internal/server` | `src/server/tests/` (`router.rs`, `native.rs`, `headers.rs`, `middleware.rs`, `metrics.rs`, `layers.rs`, `shutdown.rs`, with the whole stack in `stack.rs`); the handlers' route tests in `native.rs` and the client IP middleware tests in `middleware.rs`; the shutdown cases on the echo service in `src/server/tests.rs` (phase 4) | 4, 12 |
| `web` | `src/web/tests.rs` | 12 |
| `cmd/bitgauge` | `TestParseArgs` in the `src/cli.rs` tests; `TestHealthcheckAddress` and `TestHealthcheckExitCodes` in `src/healthcheck/tests.rs`; `TestServeExitsTwoOnInvalidConfig` in `src/command/tests.rs` and `tests/cli.rs`; `TestServeAndHealthcheck`, `TestServeExitsOneWithoutTheSPA` and `TestCompatibilityLayersOnTheStartupLine` in `src/command/tests.rs`; the process-mode startup and its signals in `tests/process_mode.rs`; `TestMain` is Cargo's binary build | 13 |
| (the Go binary) | `tests/wire.rs` replays the Go binary's recorded answers (`tests/testdata/wire/`) | 14 |
| `test/docs`, `test/disturls`, `test/distdemo`, `test/chunksize`, `test/licenseheaders`, `test/toolchain`, `test/deployments`, `test/dockerfiles`, `test/boundary` | `meta/tests/` under the Go package's name (`docs.rs`, `toolchain.rs` for the pins, `compat_boundary.rs`, one file per `test/toolchain` test file); `boundary_test.go` is the lint boundary of phase 3 (`lint_exemptions.rs`, `lint_inheritance.rs`); `untagged_tests_test.go` moves to phase 17 with the toolgate | 16 |
| `test/internal/...`, `test/image`, `test/harness` | `testenv/src/` (one module per Go package; the harness logic in `testenv/src/harness/`, unit-tested untagged), `testenv/tests/image/`, `testenv/tests/netguard.rs`, `testenv/tests/harness/`; `untagged_tests_test.go` in `meta/tests/untagged_tests.rs` | 17 |
