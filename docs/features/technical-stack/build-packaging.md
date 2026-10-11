# Build and Packaging

[Feature index](../README.md) / [Technical Stack](README.md) / Build and Packaging

How BitGauge becomes one signed, multi-arch container image and two static binaries. The image,
the binaries and the release workflows are planned; the tooling lands before the product code, and
each gate stays dormant until its inputs exist. The release process itself (versioning, tags,
recovery) is in [../../release.md](../../release.md).

## 1. Container Image

A multi-stage build in `deployments/docker/Dockerfile` produces one image per platform. Every
stage is a literal `FROM` line pinned by digest, because Dependabot updates only literal `FROM`
lines and a tag alone can be repointed under a build, and the stages are named:

| Stage | Base | Does |
| --- | --- | --- |
| `web` | `dhi.io/node:24-alpine…-dev`, pinned by digest, on the build platform | `npm ci` and `npm run build` in `web/` → `web/dist` (SPA, Worker chunk, precompressed assets). `npm run build` is `vite build` only; the type check is a separate gate. |
| `build` | `dhi.io/golang:1.26-alpine…-dev`, pinned by digest, on the build platform | Copies `web/dist`, then `CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -trimpath -buildvcs=false -ldflags "-s -w -X …/internal/buildinfo.version=… -X …commit=… -X …date=…" ./cmd/bitgauge`. Cross-compiles; no emulation needed. |
| `runtime` | `dhi.io/static`, pinned by digest | Copies the binary to `/bitgauge`; nothing else. |

The build stages use the Docker Hardened Images development variants, so every stage of the image
comes from `dhi.io`. Pulling them needs a `dhi.io` token, which a pull request from a fork does not
receive: on such a pull request the image build is skipped with a visible notice in the job
summary, never silently
([../../release.md](../../release.md#required-checks-and-fork-pull-requests)).

Runtime image properties:

- `USER 65532:65532` (the image's `nonroot` user); no capabilities needed, port 8080 is
  unprivileged.
- **No shell**, no package manager, no `curl`; a static binary needs no libc.
- `ENTRYPOINT ["/bitgauge"]`, `EXPOSE 8080`.
- `HEALTHCHECK` in exec form: `["/bitgauge", "healthcheck"]`
  ([backend.md §6](backend.md#6-healthcheck-subcommand)).
- Runs with a **read-only root filesystem** and no volume; nothing is written.
- OCI labels: `org.opencontainers.image.title`, `.description`, `.source`
  (`https://github.com/leinardi/bitgauge`), `.version`, `.revision`, `.created` and
  `.licenses="GPL-3.0-or-later"`.

## 2. Platforms

- **linux/amd64** and **linux/arm64** only, built with `docker buildx` and published as one
  multi-arch manifest.
- `dhi.io/static` has no arm/v7 variant. arm64 covers Raspberry Pi 3, 3B+, 4, 5 and Zero 2 W on a
  64-bit OS. armv7 is a possible later addition via `gcr.io/distroless/static-debian12` for that
  platform only ([decisions.md](decisions.md)).

## 3. Planned Make Targets

As in Runhold, shared targets come from `leinardi/make-common` snippets and project targets from
local snippets. A target whose inputs do not exist yet fails loudly rather than passing on nothing.
Planned:

```text
make build             # web-build, then go-build
make go-build          # build ./dist/bitgauge for the host platform (embeds web/dist)
make go-run            # build and run the binary locally
make go-test           # go test -race ./...
make go-vet
make go-lint           # golangci-lint v2, all linters
make go-tidy           # go mod tidy + go mod verify
make go-test-image     # image tests (Docker, -tags=image)
make go-vet-image      # go vet -tags=image
make go-vet-harness    # go vet -tags=harness
make web-install       # npm ci in web/
make web-dev           # Vite dev server
make web-build         # npm ci && npm run build in web/
make web-test          # vitest (unit, component, engine)
make web-lint          # eslint + vue-tsc
make api-types         # regenerate the SPA's API types from api/openapi.yaml
make e2e               # Playwright on Chromium, Firefox, WebKit
make harness-ci        # accuracy harness, CI tier profiles
make harness-floor     # manual range-floor profiles
make harness-ceiling   # manual range-ceiling profiles (bare metal)
make harness-sweep     # remove stale harness environments, list kept ones
make harness-sweep-all # remove every harness environment (needs CONFIRM=1)
make verify            # verify-go and verify-web
make verify-go         # Go vet, lint and tests
make verify-web        # web lint, typecheck and tests
make audit-deps        # audit-deps-go and audit-deps-web
make audit-deps-go     # govulncheck
make audit-deps-web    # npm audit in web/
make idle-measure      # idle CPU and memory footprint of a running binary
make check             # pre-commit on all files
make docker-build      # local multi-stage image for the host platform
make docker-run        # run the image read-only on 127.0.0.1:8080
make mk-common-update  # refresh shared Make snippets
```

`docker-run` publishes the port on `127.0.0.1` by default, so a local run is not reachable from
the network; set `DOCKER_RUN_BIND=0.0.0.0` to expose it.

`AGENTS.md` will hold the authoritative list once the targets exist.

## 4. CI Workflows

All GitHub Actions are pinned to full commit SHAs, every workflow is `contents: read` at the top and
widens permissions per job only, and Go comes from `.go-version`. A workflow or job whose inputs do
not exist yet is not written until they do: it lands in the commit that adds its inputs, and a
meta-test fails both when it is missing after that point and when it appears before.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yaml` | pull request, push to `main`, manual dispatch | `pre-commit-all` (every pre-commit hook on all files, including golangci-lint over the repository, fails if a hook modifies a file); `repo-gates` (the meta-tests under `test/`); `go-test` (calls `go-test.yaml`); `audit` (`make audit-deps`: govulncheck and npm audit); `conventional-commits` and `signoff` (pull requests only); reviewdog annotation jobs (pull requests only, not required); `release-scripts` (the release helper tests); once their inputs exist, `credentials` (decides whether a run may pull `dhi.io`; fails a trusted run without a token), `web` (calls `web.yaml`), `e2e` (Playwright on Chromium, Firefox and WebKit), `harness` (calls `harness.yaml`, the CI tier of [testing.md §5](testing.md#5-accuracy-harness)) and `image` (a no-push build for both platforms and the image tests); and the `ci-result` aggregate. |
| `go-test.yaml` | called by `ci.yaml` and `release.yaml` | `go test -race ./...`. |
| `web.yaml` | called by `ci.yaml` and `release.yaml` | `npm ci`, then the web steps whose inputs exist: API type drift, ESLint and `vue-tsc`, vitest, the build, the dist URL allowlist and the engine chunk size. |
| `harness.yaml` | called by `ci.yaml`; nightly schedule | The accuracy harness for the three browsers; the 1 Gbit profile nightly if runners cannot sustain it. |
| `release.yaml` | manual dispatch on `main` (`version`, `dry_run`) | Tests, audits and builds first: the web app, the two static binaries and `checksums.txt`, and the multi-arch image pushed by digest to a job-local registry. Scans both platform images with Trivy, and only then pushes the git tag, copies the image to GHCR, attests and signs it, attests the binaries and creates the GitHub release ([../../release.md](../../release.md#why-the-build-happens-before-the-tag)). |
| `scheduled-scan.yaml` | manual dispatch (weekly schedule once public) | `make audit-deps` over `main`, and Trivy over each platform image of `:latest` once releases exist. |
| `go-cache-warmup.yaml`, `web-cache-warmup.yaml`, `pre-commit-warmup.yaml` | push to `main` on their inputs | Refresh the `main` caches the other workflows restore, keeping the newest two entries. |
| `dependabot.yml` | weekly | Update PRs for `gomod`, `npm` (`web/`), `docker` (base image digests), `github-actions` and `pre-commit`. |

`release.yaml` takes the `release` concurrency group without cancellation, so two releases never
publish at the same time, and runs Trivy on every platform image before anything is pushed.
`scheduled-scan.yaml` is dispatch-only while the repository is private.

There is no scheduled rebuild of a published image: a version tag never moves, and a base-image
fix that Dependabot brings in ships as a new release
([../../release.md](../../release.md#versioning)).

## 5. Signing, SBOM and Provenance

- Images are built with `docker buildx build --sbom=true --provenance=mode=max`, so every
  platform image carries an SPDX SBOM and a SLSA provenance attestation.
- The pushed manifest is signed by digest with `cosign sign` using GitHub's OIDC identity (keyless,
  no stored keys). Verification checks the certificate identity of `release.yaml` in
  `leinardi/bitgauge` on `main` and the GitHub OIDC issuer; the command shape is in
  [SECURITY.md](../../../SECURITY.md).
- Release binaries are listed in a `checksums.txt` file attached to the release, and each binary
  has a GitHub build provenance attestation made by `release.yaml`, verified with
  `gh attestation verify` ([SECURITY.md](../../../SECURITY.md)). A release recovery rebuilds them
  with the toolchains recorded in the tag and checks them against the release assets;
  `binary-attestation-status.sh` then reuses the attestation an earlier run made instead of making
  a second one.

## 6. Tags

| Tag | Points to | Moves on |
| --- | --- | --- |
| `ghcr.io/leinardi/bitgauge:X.Y.Z` | that release | never |
| `ghcr.io/leinardi/bitgauge:X` | the latest release of major `X` | every release of major `X` |
| `ghcr.io/leinardi/bitgauge:latest` | the latest release | every release |

Pinning by `X.Y.Z` or by digest gives a fixed image. A base-image fix arrives as a new version, so
following `X` or `latest`, or upgrading, is the way to receive it. Only GHCR is published; Docker
Hub is not ([decisions.md](decisions.md)).

## Related

- [Release process](../../release.md)
- [Testing](testing.md)
- [Backend design](backend.md)
- [Example deployment](../deployment-example.md)
- [Security model](../security.md)
