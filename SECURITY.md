# Security Policy

## Threat Model

BitGauge is a speed test for LAN, homelab and VPN links. It runs behind a reverse proxy that
terminates TLS, on a network whose users the operator trusts to use bandwidth. It has no accounts,
no credentials and no stored data: **the server never stores a result and never calls out.** An
attacker who can reach it can make it move data at line rate, which is its purpose; per-client
limits bound that, but do not prevent it.

**Do not expose BitGauge to the public internet.** The full threat model is in
[docs/features/security.md](docs/features/security.md).

## Supported Versions

There has been no release yet.

| Version | Supported |
| --- | --- |
| none released | — |

Once releases exist, only the latest release receives security fixes; older releases are not
patched. The weekly rebuild refreshes the base images of the latest release only
([docs/release.md](docs/release.md#weekly-rebuild)).

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/leinardi/bitgauge/security/advisories/new),
not in a public issue, a pull request or a discussion. Include the version or image digest, how it
is deployed (proxy, base path, enabled compatibility layers), and the steps or input that trigger
the problem.

Expected response time: acknowledgement within 7 days, and a fix or mitigation plan within 30 days
for confirmed issues. The fix is credited in the advisory unless you prefer otherwise.

## Scope

In scope: the BitGauge binary and the web app it serves, the native API and the compatibility
layers, the container image published to GHCR (`ghcr.io/leinardi/bitgauge`), the release binaries,
and the workflows that build and publish them. Examples: a way to make the server store or send
data, an outbound connection, client-IP spoofing through forwarding headers from an untrusted peer,
a bypass of the per-client limits, a CSP bypass in the web app, or a leak of one client's data to
another.

## Out of Scope

- **Public-internet hardening:** no DDoS protection, global bandwidth budget or bot detection.
- **Denial of service from LAN or VPN peers:** a peer can saturate the link; per-address limits
  bound a single address only.
- **Missing authentication:** BitGauge has none by design; put forward-auth at the proxy if needed.
- **DNS rebinding against a port exposed directly over plain HTTP:** the mitigation is a
  `Host`-routing reverse proxy in front of BitGauge.
- **Results read by someone with access to the browser profile.**
- **Vulnerabilities in the reverse proxy, the browser or the base images**, which are reported
  upstream. A base-image vulnerability in a published release is still worth reporting if the
  weekly rebuild has not fixed it.
- **Numbers reported by third-party clients** through the compatibility layers, which follow those
  clients' own methodologies.

## Verifying a Release

Release images carry an SPDX SBOM and SLSA provenance for every platform, and a keyless cosign
signature made with the GitHub OIDC identity of the release workflow (or of the weekly rebuild
workflow, for a rebuilt digest). Verify an image by digest before you trust it:

```bash
IMAGE=ghcr.io/leinardi/bitgauge
DIGEST=sha256:...   # from: docker buildx imagetools inspect ghcr.io/leinardi/bitgauge:<version>

cosign verify "$IMAGE@$DIGEST" \
  --certificate-identity-regexp '^https://github.com/leinardi/bitgauge/\.github/workflows/(release|rebuild)\.yaml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Inspect the SBOM and provenance attached to the image index:

```bash
docker buildx imagetools inspect "$IMAGE@$DIGEST" --format '{{ json .SBOM }}'
docker buildx imagetools inspect "$IMAGE@$DIGEST" --format '{{ json .Provenance }}'
```

Verify a downloaded release binary against the release's checksum file:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

How releases are built and signed: [docs/release.md](docs/release.md).
