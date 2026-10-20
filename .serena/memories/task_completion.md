# bitgauge — Task Completion

After each change, include a one-line Conventional Commit message (with scope) in the final
response.

After any change:

```bash
make check            # every pre-commit hook: golangci-lint, docs facts, ratchets, fallow, ...
```

After Go changes also:

```bash
make go-tidy && make go-vet && make go-test
make go-vet-image && make go-vet-harness   # when tagged packages changed
```

After a docs change: `go test -count=1 ./test/docs/` and the AGENTS.md validation matrix.

After image, netguard or harness changes (Docker): `make go-test-image`, and `make harness-ci` for
a runner change.

After workflow changes: `pre-commit run actionlint --all-files`; the release helpers'
`.github/scripts/*.test.sh`.
