# bitgauge — Suggested Commands

`make help` lists every target.

## Lint / format / meta-tests

```bash
make check                 # pre-commit on all files (the authoritative local gate)
make check-stage           # pre-commit on the staging area
make go-lint               # golangci-lint at the pre-commit pin
go test ./test/...         # meta-tests; BITGAUGE_REQUIRE_TOOLS=1 makes missing tools fail
go test -count=1 ./test/docs/   # links, anchors and doc facts
```

## Go

```bash
make go-test               # go test -race ./...
make go-vet / go-vet-image / go-vet-harness
make go-build              # ./dist/bitgauge, embedding whatever web/dist holds
make build                 # web-build, then go-build: the binary with the current SPA
make go-run                # run the binary (ARGS="...")
make verify / verify-go / verify-web
make audit-deps            # govulncheck + npm audit (network)
```

## Web

```bash
make web-install           # npm ci in web/
make web-lint / web-test / web-build / web-dev
make web-demo              # Vite dev server in demo mode (simulated link, no server)
make web-build-demo        # the demo SPA into web/dist-demo, which never ships
make api-types             # regen web/src/api/types.gen.ts from api/openapi.yaml
make e2e                   # Playwright, host-built binary
```

## Docker, image and harness (start containers)

```bash
make docker-build / docker-run      # docker-run binds 127.0.0.1 by default
make go-test-image                  # image tests under netguard + strace
make harness-ci / harness-floor / harness-ceiling   # CI tier, manual floor, manual ceiling
make harness-continuous             # manual Continuous memory check (HARNESS_CONTINUOUS_MINUTES)
make harness-sweep                  # remove stale harness environments
make harness-sweep-all CONFIRM=1    # remove every harness environment
```

Harness inputs: `HARNESS_PROFILES`, `HARNESS_BROWSERS`, `HARNESS_KEEP_ON_FAILURE=1`,
`HARNESS_SHAPE=none`, `HARNESS_CONTINUOUS_MINUTES` (default 60, at least 6); stale sweep age
`BITGAUGE_HARNESS_STALE_AFTER` (default 6h).

## Demo parity (on demand, never CI; Chromium)

```bash
make demo-parity / demo-parity-full            # SCENARIO=..., MATRIX=full
make demo-parity-update / demo-parity-accept   # REASON= required for accept
make demo-parity-report / demo-parity-servers / demo-parity-browsers
make demo-parity-triage CMD="..."              # the triage helper over .parity-triage.json
```

## Idle cost of a running binary

```bash
make idle-measure IDLE_PIDS="bitgauge=PID"
make idle-bench IDLE_PIDS=... BENCH_URL=...
```

## Release helpers (stub-tested, no network)

```bash
bash .github/scripts/binary-attestation-status.test.sh
```
