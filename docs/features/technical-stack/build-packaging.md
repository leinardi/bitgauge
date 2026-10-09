# Build and Packaging

[Feature index](../README.md) / [Technical Stack](README.md) / Build and Packaging

How BitGauge becomes one signed, multi-arch container image and two static binaries. Everything on
this page is planned; no Dockerfile, Makefile or workflow exists yet. The release process itself
(versioning, tags, recovery) is in [../../release.md](../../release.md).

## 1. Container Image

A multi-stage build produces one image per platform:

| Stage | Base | Does |
| --- | --- | --- |
| 1. Node | Node LTS image, pinned by digest, on the build platform | `npm ci` and `npm run build` in `web/` → `web/dist` (SPA, Worker chunk, precompressed assets). |
| 2. Go | `golang:1.26` image, pinned by digest, on the build platform | Copies `web/dist`, then `CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -trimpath -ldflags "-s -w -X …/internal/buildinfo.version=… -X …commit=… -X …date=…" ./cmd/bitgauge`. Cross-compiles; no emulation needed. |
| 3. Runtime | `dhi.io/static`, pinned by digest | Copies the binary to `/bitgauge`; nothing else. |

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
local snippets. Planned:

```text
make go-build          # build ./dist/bitgauge for the host platform (embeds web/dist)
make go-test           # go test -race ./...
make go-vet
make go-lint           # golangci-lint v2, all linters
make go-tidy           # go mod tidy + go mod verify
make web-build         # npm ci && npm run build in web/
make web-test          # vitest (unit, component, engine)
make web-lint          # eslint + vue-tsc
make e2e               # Playwright on Chromium, Firefox, WebKit
make harness-ci        # accuracy harness, CI tier profiles
make harness-floor     # manual range-floor profiles
make harness-ceiling   # manual range-ceiling profiles (bare metal)
make check             # pre-commit on all files
make docker-build      # local multi-stage image for the host platform
make docker-run        # run the image read-only on :8080
make mk-common-update  # refresh shared Make snippets
```

`AGENTS.md` will hold the authoritative list once the targets exist.

## 4. CI Workflows

All GitHub Actions are pinned to full commit SHAs.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yaml` | pull request, push to `main` | pre-commit; golangci-lint; `go test -race`; govulncheck; ESLint, `vue-tsc`, vitest; npm audit; Playwright E2E on Chromium, Firefox and WebKit; the CI tier of the accuracy harness ([testing.md §5](testing.md#5-accuracy-harness)); a no-push image build for both platforms. |
| `release.yaml` | tag `vX.Y.Z` (created by the release process with svu) | Builds both platforms, pushes the multi-arch image to GHCR with SBOM and provenance attestations, signs it with cosign keyless, builds the two static binaries with SHA-256 checksums, and creates the GitHub release with the binaries attached. |
| `rebuild.yaml` | weekly schedule, manual dispatch | Rebuilds the latest release: source code from the release tag, but the three stage images (Node, Go, `dhi.io/static`) at the digests currently pinned on `main`, which Dependabot keeps current. The Dockerfile takes the stage images as build arguments, and the workflow reads their values from `main`'s Dockerfile. The result is pushed, attested and signed under the same tags (same version, new digest). Just before pushing, it re-checks that its version is still the highest release; if not, it pushes only `X.Y.Z` and skips `X` and `latest`. |
| `dependabot.yml` | weekly | Update PRs for `gomod`, `npm` (`web/`), `docker` (base image digests) and `github-actions`. |

`release.yaml` and `rebuild.yaml` share one concurrency group without cancellation, so a rebuild
and a release never push tags at the same time.

The weekly rebuild exists so base-image security fixes ship without a code change; its tag policy
is described in [../../release.md](../../release.md).

## 5. Signing, SBOM and Provenance

- Images are built with `docker buildx build --sbom=true --provenance=mode=max`, so every
  platform image carries an SPDX SBOM and a SLSA provenance attestation.
- The pushed manifest is signed by digest with `cosign sign` using GitHub's OIDC identity (keyless,
  no stored keys). Verification checks the certificate identity of `release.yaml` or
  `rebuild.yaml` in `leinardi/bitgauge` and the GitHub OIDC issuer; the command shape is in
  [SECURITY.md](../../../SECURITY.md).
- Release binaries are listed in a `SHA256SUMS` file attached to the release.

## 6. Tags

| Tag | Points to | Moves on |
| --- | --- | --- |
| `ghcr.io/leinardi/bitgauge:X.Y.Z` | that release | weekly rebuild of the latest release (new digest, same version) |
| `ghcr.io/leinardi/bitgauge:X` | the latest release of major `X` | every release of major `X`, and its weekly rebuild |
| `ghcr.io/leinardi/bitgauge:latest` | the latest release | every release, and its weekly rebuild |

Pinning by digest gives a fixed image. Pinning by `X.Y.Z` gives a fixed version that receives
base-image fixes only while it is the latest release; older versions are not rebuilt, so upgrading
is the way to keep receiving them. Only GHCR is published; Docker Hub is not
([decisions.md](decisions.md)).

## Related

- [Release process](../../release.md)
- [Testing](testing.md)
- [Backend design](backend.md)
- [Example deployment](../deployment-example.md)
- [Security model](../security.md)
