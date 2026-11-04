# Build and Packaging

[Feature index](../README.md) / [Technical Stack](README.md) / Build and Packaging

How BitGauge becomes one signed, multi-arch container image and two static binaries. The image,
its tests, the end-to-end tests, the accuracy harness and the release workflow exist, and their
gates are active. The release process itself (versioning, tags, recovery) is in
[../../release.md](../../release.md).

## 1. Container Image

A multi-stage build in `deployments/docker/Dockerfile` produces one image per platform. Every
stage is a literal `FROM` line, because Dependabot updates only literal `FROM` lines. The
`dhi.io` bases are pinned by an explicit tag, never `latest`, and not by digest: `dhi.io`
republishes its tags to ship security fixes, so a digest pin would turn every republish into a
Dependabot pull request and hold the fixes back until it merged. A build picks up the current
image of each tag instead, and every release build is scanned before anything is pushed
([§4](#4-ci-workflows)). The stages are named:

| Stage | Base | Does |
| --- | --- | --- |
| `web` | `dhi.io/node:…-alpine…-dev`, pinned by tag in the Dockerfile, on the build platform | `npm ci` and `npm run build` in `web/` → `web/dist` (SPA, Worker chunk, precompressed assets). `npm run build` is `vite build` only; the type check is a separate gate. |
| `build` | `dhi.io/rust:…-debian13-dev`, the Rust release of `rust-toolchain.toml`, pinned by tag in the Dockerfile, on the build platform | Installs zig, cargo-zigbuild and the target's musl `rust-std`, each pinned by sha256; copies `web/dist`, then `BITGAUGE_VERSION=… BITGAUGE_COMMIT=… BITGAUGE_DATE=… cargo zigbuild --release --locked --target <arch>-unknown-linux-musl --bin bitgauge`, a static musl binary with its paths remapped. Cross-compiles; no emulation needed. |
| `runtime` | `dhi.io/static`, pinned by tag | Copies the binary to `/bitgauge`; nothing else. |

The file starts with a `# syntax=docker/dockerfile:1.7@sha256:…` parser directive, so the BuildKit
frontend that reads it is pinned by tag and index digest: it is not a `dhi.io` image, and a moved
`1.7` tag could change how the file is built. Dependabot does not update that line; it is bumped
by hand ([../../release.md](../../release.md#what-the-workflows-trust)).

The build stages use the Docker Hardened Images development variants, so every stage of the image
comes from `dhi.io`. Pulling them needs a `dhi.io` token, which a pull request from a fork does not
receive: on such a pull request the image build is skipped with a visible notice in the job
summary, never silently
([../../release.md](../../release.md#required-checks-and-fork-pull-requests)).

Runtime image properties:

- `USER 65532:65532` (the image's `nonroot` user); no capabilities needed, port 8080 is
  unprivileged.
- **No shell**, no package manager, no `curl`; the binary links musl statically, so it needs no
  shared libc.
- `ENTRYPOINT ["/bitgauge"]`, `EXPOSE 8080`.
- `HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3`, in exec form:
  `["/bitgauge", "healthcheck"]` ([backend.md §6](backend.md#6-healthcheck-subcommand)). The probe
  loads the same configuration as `serve`, so a changed `server.listen` or base path needs no
  override. Its own request times out after 3 s, so the 5 s timeout never cuts a probe that would
  have answered; startup (configuration, the random buffer, the listener) fits in the 5 s start
  period; and three failures 30 s apart mark a stuck server unhealthy without flapping on one slow
  probe. The compose examples of
  [deployment-example.md](../deployment-example.md#1-compose-bitgauge-alone) use the same timings.
- Runs with a **read-only root filesystem** and no volume; nothing is written.
- The Go runtime variables (`GOMAXPROCS`, `GOMEMLIMIT`, `GOGC`, `GODEBUG` and the rest) have no
  effect: the binary is a Rust program, and a deployment needs none of them.
- OCI labels: `org.opencontainers.image.title`, `.description`, `.source`
  (`https://github.com/leinardi/bitgauge`), `.version`, `.revision`, `.created` and
  `.licenses="GPL-3.0-or-later"`.

## 2. Platforms

- **linux/amd64** and **linux/arm64** only, built with `docker buildx` and published as one
  multi-arch manifest.
- `dhi.io/static` has no arm/v7 variant. arm64 covers Raspberry Pi 3, 3B+, 4, 5 and Zero 2 W on a
  64-bit OS. armv7 is a possible later addition via `gcr.io/distroless/static-debian12` for that
  platform only ([decisions.md](decisions.md)).

## 3. Make Targets

Shared targets come from `leinardi/make-common` snippets and project targets from local snippets;
`make help` lists them. A target whose inputs do not exist fails loudly rather than passing on
nothing. `docker-run` publishes the port on `127.0.0.1` by default, so a local run is not reachable
from the network; set `DOCKER_RUN_BIND=0.0.0.0` to expose it.

## 4. CI Workflows

All GitHub Actions are pinned to full commit SHAs, every workflow is `contents: read` at the top and
widens permissions per job only, and the Rust toolchain comes from `rust-toolchain.toml`. A
workflow or job whose inputs do not exist yet is not written until they do: it lands in the commit
that adds its inputs, and a meta-test fails both when it is missing after that point and when it
appears before.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yaml` | pull request, push to `main`, manual dispatch | `pre-commit-all` (every pre-commit hook on all files, fails if a hook modifies a file); `rust` (rustfmt check, clippy over every target and feature, `cargo test` over the workspace with the `meta` crate's meta-tests, rustdoc and cargo-deny); `audit` (`make audit-deps`: cargo-deny and npm audit); `conventional-commits` (pull requests only); reviewdog annotation jobs (pull requests only, not required); `release-scripts` (the release helper tests); once their inputs exist, `credentials` (decides whether a run may pull `dhi.io`; fails a trusted run without a token), `web` (calls `web.yaml`), `e2e` (Playwright on Chromium, Firefox and WebKit) and `image` (a no-push build for both platforms and the image tests); and the `ci-result` aggregate. |
| `web.yaml` | called by `ci.yaml` and `release.yaml` | `npm ci`, then the web steps whose inputs exist: API type drift, ESLint and `vue-tsc`, vitest, the build with its demo-free check, the dist URL allowlist and the engine chunk size. |
| `harness.yaml` | manual dispatch, and before a release; a nightly schedule once the repository is public ([going-public.md §3](../../engineering/going-public.md#3-restore-the-scheduled-scan)) | The accuracy harness's CI tier on the three browsers; a dispatch can name a subset of the profiles and browsers. The 1 Gbit profile moves to the nightly run if runners cannot sustain it. |
| `release.yaml` | manual dispatch on `main` (`version`, `dry_run`) | Tests, audits and builds first: the web app, the two static binaries and `checksums.txt`, and the multi-arch image pushed by digest to a job-local registry. Scans both platform images with Trivy, and only then pushes the git tag, copies the image to GHCR, attests and signs it, attests the binaries and creates the GitHub release ([../../release.md](../../release.md#why-the-build-happens-before-the-tag)). |
| `scheduled-scan.yaml` | manual dispatch (weekly schedule once public) | `make audit-deps` over `main`, and Trivy over each platform image of `:latest` once releases exist. |
| `web-cache-warmup.yaml`, `pre-commit-warmup.yaml` | push to `main` on their inputs | Refresh the `main` caches the other workflows restore, keeping the newest two entries. |
| `dependabot.yml` | monthly | Update PRs for `cargo`, `npm` (`web/`), `docker` (base image tags), `github-actions` and `pre-commit`. |

**Dist URL allowlist.** The `dist-urls` step (`scripts/check-dist-urls.sh`) reads every file of
the built `web/dist`, binary files included, and fails on any `http://`, `https://`, `ws://` or
`wss://` URL, its scheme in any case, that is not on the allowlist; a URL with characters outside
ASCII fails as it is. The allowlist, with the reason for each entry, is
[`.dist-url-allowlist`](../../../.dist-url-allowlist); a new entry is argued in review
([../security.md §3](../security.md#3-no-outbound-calls)).

**Demo-free dist.** The `build` step runs `scripts/check-dist-demo-free.sh` on `web/dist` after
`vite build`, inside the step, since a step of its own would belong to no gate. It fails when any
file holds one of the demo build's sentinels ([frontend.md §9](frontend.md#9-demo-build)), so a
production build that kept any of the demo fails CI.

**Engine chunk size.** The `chunk-size` step (`scripts/check-chunk-size.sh`) finds the engine's
Worker chunk in `web/dist/assets/` and fails when it is larger than the budget in `.chunk-budget`
([frontend.md §3](frontend.md#3-worker-bundling-with-vite)), or when there is no Worker chunk.

`release.yaml` takes the `release` concurrency group without cancellation, so two releases never
publish at the same time, and runs Trivy on every platform image before anything is pushed.
`scheduled-scan.yaml` is dispatch-only while the repository is private.

There is no scheduled rebuild of a published image: a version tag never moves, and a base-image
fix, whether `dhi.io` republishes it under the same tag or Dependabot moves a tag, ships as a new
release ([../../release.md](../../release.md#versioning)).

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
