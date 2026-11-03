# Porting BitGauge from Go to Rust

The working record of the port: what was decided, which crates replace which Go libraries, the
lint boundary, the only differences from the Go binary that are allowed, what was reused from the
sibling ports, and what the port found along the way. The API and test maps are filled in phase by
phase, as each Go package is ported.

The spec in [`features/`](features/README.md) stays the behavior contract. Until the cutover it
describes the Go binary, with the Rust behavior beside it as marked "Rust implementation (from the
cutover)" notes; at the cutover the Go text and the markers are removed. Where this page and the
spec disagree, the spec wins, and
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
- Until the cutover, every commit uses a non-release type and changes no shipped binary, image or
  release.

## Crate Choices

| Go | Rust | Note |
| --- | --- | --- |
| net/http server, chi | axum 0.8 (`default-features = false`, no `ws`), hyper 1 http1 server, hyper-util (`tokio` only; no `server-graceful`), tower | Our own accept loop and connection driver ([Connection Driver](#connection-driver)) |
| coder/websocket | tokio-tungstenite on `hyper::upgrade::on` | Handshake checked by hand, as in Go |
| log/slog | tracing + tracing-subscriber (`fmt`, `json`) | tracing's default text and JSON, UTC timestamps |
| client_golang | prometheus-client | OpenMetrics text only; no `go_*` or `process_*` |
| koanf + yaml.v3 + mapstructure | serde-saphyr into a spanned raw tree, our own env merge, a typed walker that collects every problem | serde derive stops at the first error, which the spec forbids |
| `time.ParseDuration` | `jiff::fmt::friendly::SpanParser` to `SignedDuration` |  |
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

`bitgauge -help` exits 0 with usage under Go, and 2 with the pre-scan refusal under Rust. Every
Docker suite requires `BITGAUGE_TEST_IMPL=go|rust`, with no default, and before any test checks
that `/bitgauge -help` matches the expected implementation, that the image's
`org.opencontainers.image.revision` label is the expected commit, and that the copied binary's
sha256 matches the image layer. A mismatch fails the run and never skips it.

Before the cutover the Rust candidate image is built from `deployments/docker/Dockerfile.rust` by
`make rust-image` as `bitgauge:rust-candidate`, and no workflow publishes it. The `meta` crate
states both artifacts through one constant, `Transition::Candidate`; at the cutover
`Dockerfile.rust` becomes `Dockerfile`, the constant becomes `Transition::Done`, and the Go
meta-tests are deleted.

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
| 5 | **`/metrics`:** OpenMetrics only; no `go_*` or `process_*`; `bitgauge_build_info{version,commit}` without `goversion`. Family names, types, labels and buckets are kept. | backend.md §7; wire-protocol.md (metrics); api/openapi.yaml; testing.md §1 |
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

Reused MIT files carry BitGauge's GPL-3.0-or-later header plus one provenance line: "Adapted from
\<repo\>/\<path\> at \<commit\>, MIT, Copyright (c) 2026 Roberto Leinardi". Not reused:
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
| swarm-device-access | `4cd31c4` | `meta/tests/unsafe_allowlist.rs` | The pattern only, for `meta/tests/lint_exemptions.rs`; no file copied |

Rows are added by the phase that copies a file.

## Findings During the Port

Fallbacks taken, premises that turned out false, and anything else a phase found that the plan did
not expect. Empty until a phase records one.

## API Map

Go package to Rust module, filled in by the phase that ports it.

| Go | Rust | Phase |
| --- | --- | --- |
| `internal/config` |  | 5 |
| `internal/buildinfo` |  | 6 |
| `internal/logger` |  | 6 |
| `internal/clientip` |  | 6 |
| `internal/ratelimit` |  | 7 |
| `internal/metrics` |  | 8 |
| `internal/handlers` |  | 9, 10 |
| `internal/compat/openspeedtest` |  | 11 |
| `internal/compat/librespeed` |  | 11 |
| `internal/compat/nq` |  | 11 |
| `internal/server` |  | 4, 12 |
| `web/embed*.go` |  | 12 |
| `cmd/bitgauge` |  | 13 |

## Test Map

Go test package to Rust test target, filled in by the phase that ports it. The per-test mapping is
the `/// Go: TestX` doc comment on each Rust test; the commit body of each phase lists the Go tests
it did not port, with the reason.

| Go | Rust | Phase |
| --- | --- | --- |
| `internal/config` |  | 5 |
| `internal/buildinfo`, `internal/logger`, `internal/clientip` |  | 6 |
| `internal/ratelimit` |  | 7 |
| `internal/metrics` |  | 8 |
| `internal/handlers` |  | 9, 10 |
| `internal/compat/...` |  | 11 |
| `internal/server` |  | 12 |
| `cmd/bitgauge` |  | 13 |
| `test/docs`, `test/disturls`, `test/distdemo`, `test/chunksize`, `test/licenseheaders`, `test/toolchain`, `test/deployments`, `test/dockerfiles`, `test/boundary` |  | 16 |
| `test/internal/...`, `test/image`, `test/harness` |  | 17 |
