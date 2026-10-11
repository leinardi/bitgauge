# bitgauge — Suggested Commands

`make help` lists every target. Dormant targets (no inputs yet) fail loudly by design.

## Lint / format / meta-tests

```bash
make check                 # pre-commit on all files (the authoritative local gate)
make check-stage           # pre-commit on the staging area
make go-lint               # golangci-lint at the pre-commit pin
go test ./test/...         # meta-tests; BITGAUGE_REQUIRE_TOOLS=1 makes missing tools fail
go test -count=1 ./test/docs/   # links, anchors and doc facts
scripts/check-suppressions.sh --update   # after adding a //nolint (run after git add)
```

## Go

```bash
make go-test               # go test -race ./...
make go-vet / go-vet-image / go-vet-harness
make go-build              # dormant until cmd/bitgauge/main.go exists
make verify / verify-go / verify-web
make audit-deps            # govulncheck + npm audit (network)
```

## Web (dormant until web/src exists)

```bash
make web-install           # npm ci in web/
make web-lint / web-test / web-build / web-dev
make api-types             # regen web/src/api/types.gen.ts from api/openapi.yaml
make e2e                   # Playwright, host-built binary
```

## Docker, image and harness (start containers)

```bash
make docker-build / docker-run      # docker-run binds 127.0.0.1 by default
make go-test-image                  # image tests under netguard + strace
make harness-ci / harness-floor / harness-ceiling   # dormant: fail listing unmet prerequisites
make harness-sweep                  # remove stale harness environments
make harness-sweep-all CONFIRM=1    # remove every harness environment
```

Harness inputs: `HARNESS_PROFILES`, `HARNESS_BROWSERS`, `HARNESS_KEEP_ON_FAILURE=1`,
`HARNESS_SHAPE=none`; stale sweep age `BITGAUGE_HARNESS_STALE_AFTER` (default 6h).

## Release helpers (stub-tested, no network)

```bash
bash .github/scripts/binary-attestation-status.test.sh
```
