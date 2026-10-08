# Security

[Feature index](README.md) / Security

BitGauge is a speed test for networks its operator controls. Its security model follows from two
facts: anyone who can reach the port can make it move a lot of bytes, and it holds nothing worth
stealing because results never reach it. Implementation details (header middleware, client IP
derivation, limiter design, logging) are in
[technical-stack/configuration-security.md](technical-stack/configuration-security.md).

## 1. Threat Model

**Deployment assumption.** BitGauge runs on a LAN, homelab or VPN-reachable host, usually behind a
reverse proxy that terminates TLS. Its users are the operator and the people on that network or
VPN.

**Who can reach the port.** Every device on the LAN, every VPN peer, every container on the same
Docker network, and any web page those devices' browsers open (a page can make cross-origin
requests to BitGauge; the browser only decides whether the page can read the response).

**DNS rebinding.** A malicious site can make its own hostname resolve to BitGauge's LAN address,
so the visitor's browser treats BitGauge as same-origin with the attacker's page. The page can then
read same-origin responses: `GET /api/v1/info` (the visitor's own IP, BitGauge's version and
limits) and throughput bodies. Behind an HTTPS reverse proxy (every TLS example in
[deployment-example.md](deployment-example.md)), the rebound request asks for the attacker's
hostname, for which the proxy has no valid certificate, so the browser fails the TLS handshake;
Traefik and Caddy also route only the configured `Host`, and the nginx example adds a default
server that rejects unknown names. A port exposed over plain HTTP, directly (§1 of that page) or
through a proxy that serves any `Host`, is open to it; BitGauge does not validate `Host` itself, and
that residual risk is accepted and listed in §10.

**What an attacker gains:**

| Asset | Exposure |
| --- | --- |
| Bandwidth and CPU | An attacker who can reach BitGauge can make it send and receive data at line rate. This is the product's purpose; §2 bounds it per client but does not prevent it. |
| Results | Nothing: the server never receives or stores a result. |
| Client IP addresses | `GET /api/v1/info` and LibreSpeed's `/getIP` return the caller's own address only. No endpoint reveals another client. |
| Server internals | Version, display name and limits in `GET /info`; Prometheus counters if metrics are enabled. No secrets exist: BitGauge has no credentials, keys or tokens. |
| The host | A static, non-root binary with no shell, a read-only root filesystem (§9) and no outbound connections (§3). |

## 2. Bandwidth Abuse Limits

Per client IP (the derived address of §4), held in a bounded in-memory table:

- **Concurrent throughput requests:** `limits.max_streams_per_client` (default 8).
- **New throughput requests per minute:** `limits.requests_per_minute` (default 1200).
- **Per-request caps:** `limits.max_download_bytes` and `limits.max_upload_bytes` (256 MiB each),
  and the 120 s upload lifetime.
- **WebSocket connections:** 4. The handshake checks the `Origin` header: an origin whose host and
  port equal the request's `Host` header (the scheme is ignored, because BitGauge sees plain HTTP
  behind a TLS proxy while the browser's origin is `https`), an origin in
  `server.cors.allowed_origins`, or no `Origin` at all (non-browser clients) are accepted; any other
  origin is refused with `403`, so a page on another site cannot use up a visitor's WebSocket
  slots. The proxy must forward the original `Host`, port included.
- **networkQuality flows:** `compat.networkquality.max_flows_per_client` (32); `/nq/upload` bodies
  up to `compat.networkquality.max_upload_bytes`.
- **Table bound:** `limits.tracked_clients` entries (4096); the least recently seen client is
  evicted, so memory does not grow with the number of addresses.
- **Connection hygiene:** header read timeout and idle timeouts on the HTTP server, so slow or idle
  connections do not pin resources ([technical-stack/backend.md](technical-stack/backend.md)).

Over a limit, the server answers `429` with `Retry-After`
([wire-protocol.md §9](wire-protocol.md#9-rate-limits)).

**Deliberately not prevented:**

- A peer saturating the link or the server's CPU within its limits. A speed test that cannot do
  that is not a speed test.
- Many addresses acting together. There is no global bandwidth cap; per-address limits are the
  only line, and the network around BitGauge decides who can reach it.
- Abuse from the proxy's own address when `trusted_proxies` is empty: every request then shares one
  client IP and one set of limits. That is a configuration problem, flagged in
  [deployment-example.md](deployment-example.md).
- Long `/nq/large` streams: they are bounded by the flow limit, not by bytes.

## 3. No Outbound Calls

**The server never opens an outbound connection.** No update check, telemetry, ISP or geolocation
lookup, DNS-based service discovery, NTP, CDN, or webhook. The SPA's Content Security Policy
(`connect-src` to its own origin only, §5) means the browser side cannot call out either, and all
fonts, icons and scripts are embedded in the binary.

- **Enforced in review:** a change that adds a network client to the server or an external URL to
  the SPA is rejected ([technical-stack/ai-guidelines.md](technical-stack/ai-guidelines.md)).
- **Verifiable in the harness:** the accuracy harness runs BitGauge in a Docker network with no
  egress route and records any connection attempt from the container as a failure
  ([technical-stack/testing.md](technical-stack/testing.md)).
- The only exception is outside BitGauge's control: a third-party client using a compatibility
  layer (OpenSpeedTest's results link, for example) may contact its own vendor
  ([compatibility.md](compatibility.md)).

## 4. Client IP and Trusted Proxies

The client IP drives rate limits, `GET /info` and LibreSpeed's `/getIP`.

- The client IP is the TCP peer address, **unless** the peer is inside `server.trusted_proxies`.
  Only then is `X-Forwarded-For` considered: it is walked from the right, skipping addresses inside
  `trusted_proxies`, and the first untrusted address is the client IP. Entries to the left of it
  were written by the client and are never used. Forwarding headers from any other peer are
  ignored.
- `X-Real-IP`, `Client-IP`, `CF-Connecting-IP` and similar single-value headers are **never**
  read: common proxies (nginx, Caddy) pass a client-supplied `X-Real-IP` through unchanged, while
  every proxy in [deployment-example.md](deployment-example.md) appends the peer it saw to
  `X-Forwarded-For`.
- With `trusted_proxies` empty (the default), forwarding headers are never trusted.
- `::ffff:`-mapped IPv4 addresses are normalised to IPv4.

The LibreSpeed-compatible `/getIP` uses the same rule as every other consumer of the client IP.

## 5. Content Security Policy and Security Headers

The SPA document and its assets are served with:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://<host> wss://<host>;
  worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
```

- **No inline scripts or styles.** The build emits no inline `<script>`; Vue's style bindings use
  the CSSOM, which `style-src 'self'` permits. Any future need for `'unsafe-inline'` is a decision
  for [technical-stack/decisions.md](technical-stack/decisions.md), not a quiet change.
- `connect-src` names the WebSocket scheme for the request's own `Host` explicitly, because older
  Safari versions do not match `ws:`/`wss:` with `'self'`. The value only ever reflects the host
  the browser itself asked for.
- `img-src blob:` allows the client-side share image download; `data:` allows embedded icons.
- **Cross-origin isolation.** COOP `same-origin` plus COEP `require-corp` make the page
  cross-origin isolated, which gives the engine finer `performance.now()` resolution
  ([edge-cases.md §9](edge-cases.md#9-clock-and-timer-resolution)). Everything the page loads is
  same-origin, so COEP costs nothing. Isolation only takes effect in a secure context (HTTPS behind
  the proxy, or `localhost`); on a plain-HTTP LAN address the headers are harmless but timers stay
  coarser.
- `Strict-Transport-Security` is the proxy's job, since TLS terminates there.
- API responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; CORS rules
  are in [wire-protocol.md §8](wire-protocol.md#8-caching-cors-and-compression).

## 6. Compatibility Layers and `Access-Control-Allow-Origin: *`

The OpenSpeedTest layer, and the LibreSpeed throughput routes (`/garbage`, `/empty`) when
`cors=true` is sent, answer with `Access-Control-Allow-Origin: *`, because their UIs are typically
hosted on another origin.

- **What it allows:** any web page a user on the network visits can drive throughput through these
  routes and read the responses: random bytes and empty bodies.
- **What it does not allow:** reading anything about other clients or any stored state, because
  there is none. Credentials are not involved: BitGauge has no cookies or auth.
- **Why it is acceptable for these routes:** the same page could already make no-CORS requests that
  load the link; reading random bytes or an empty body reveals nothing. The real cost is bandwidth,
  bounded by §2.
- **Why `/getIP` is different.** `/getIP` returns the visitor's own address, which on a LAN or VPN
  is a private address that browsers otherwise hide from web pages. With `*`, any site a LAN or VPN
  user visits could read it. BitGauge therefore never sends `*` on `/getIP`: with `cors=true` it
  answers `Access-Control-Allow-Origin` only for an origin listed in `server.cors.allowed_origins`
  (the origin of a self-hosted LibreSpeed UI), and otherwise sends no CORS headers, so the browser
  hides the response ([compatibility.md §2.2](compatibility.md#22-cors-and-corstrue)). `GET
  /api/v1/info`, which also returns the caller's IP, is same-origin only for the same reason.
- **Mitigation:** layers are off by default; enable only the ones in use.

The native API never uses `*`: cross-origin access requires an exact origin in
`server.cors.allowed_origins`.

## 7. Browser-Only History and Privacy

**What is stored.** Each result (the versioned object of
[measurement.md §17](measurement.md#17-result-object)) is kept in the browser's IndexedDB for the
origin that served the SPA: timestamps, numbers, settings, the server's display name and version,
the client IP, the context label, the user's label and note, and the bucket series for charts.
Nothing else, and nothing leaves the browser unless the user exports or shares it.

**Implications:**

- Anyone with access to the browser profile can read the history. Clearing site data deletes it.
- History is per origin: the same server reached through two hostnames keeps two histories
  ([edge-cases.md](edge-cases.md)).
- The server cannot help recover lost history, because it never had it.

**Share image and copied summary.** Rendered client-side on a canvas, they contain the download,
upload, idle latency, loaded latency increase, bufferbloat grade, the date and time, the server's
display name and, if the user enabled it, the result's label. They **never** contain the client IP,
the note or the URL of the server. The share dialog shows exactly what is included before
download.

**Export and import.**

- JSON and CSV exports contain everything above, including client IPs and notes; the export dialog
  says so.
- Imported files are untrusted input: validated against the schema, size-limited (10 MB), rendered
  as text only (never as HTML), and deduplicated by result `id`.

## 8. Supply Chain

- **Pinned CI actions:** every GitHub Action is pinned to a full commit SHA.
- **Pinned base images:** build stages and the `dhi.io/static` runtime are pinned by digest.
- **Signed images:** release images are signed keylessly with cosign through the release
  workflow's OIDC identity; verification instructions are in [SECURITY.md](../../SECURITY.md).
- **SBOM and provenance:** each image ships an SBOM and a provenance attestation.
- **Dependabot:** weekly updates for `gomod`, `npm`, `docker` and `github-actions`.
- **Scheduled weekly rebuild:** base-image fixes ship without code changes
  ([release.md](../release.md)).
- **Vulnerability checks:** `govulncheck` and the npm audit run in CI; lint runs golangci-lint v2
  with all linters ([technical-stack/build-packaging.md](technical-stack/build-packaging.md)).
- **No vendored third-party speed-test code:** OpenSpeedTest and LibreSpeed are used for ideas and
  protocol compatibility only.

## 9. Container Hardening

- Runtime image `dhi.io/static`: no shell, no package manager, no libc needed (static
  `CGO_ENABLED=0` binary).
- Runs as `USER 65532:65532` (non-root); needs no Linux capabilities (port 8080 is unprivileged), so
  deployments drop all (`cap_drop: [ALL]`) and set `no-new-privileges`.
- **Read-only root filesystem** and no volume: BitGauge writes nothing
  ([configuration.md §5](configuration.md#5-read-only-configuration-and-the-no-write-guarantee)).
- The healthcheck is a subcommand of the binary (`bitgauge healthcheck`), so the image needs no
  `curl` or shell.
- Platforms: linux/amd64 and linux/arm64 only.

## 10. Out of Scope

- **Public-internet hardening:** no DDoS protection, no global bandwidth budget, no bot detection.
  BitGauge must not be exposed to the internet ([product.md](product.md)).
- **Denial of service from LAN peers:** a peer can saturate the link; per-address limits only bound
  a single address.
- **Authentication and authorisation:** BitGauge has none. Operators who need it put forward-auth
  at the proxy in front of the SPA and native API; third-party CLI clients then cannot use the
  compatibility layers unless those routes are exempted.
- **TLS:** terminated at the reverse proxy.
- **Protecting history from someone with access to the browser profile.**
- **DNS rebinding against a directly exposed port:** BitGauge does not validate the `Host` header;
  the mitigation is a `Host`-routing reverse proxy in front of it (§1).

## Related

- [Configuration](configuration.md)
- [Wire protocol](wire-protocol.md)
- [Compatibility layers](compatibility.md)
- [Edge cases](edge-cases.md)
- [Configuration and security internals](technical-stack/configuration-security.md)
- [Security policy](../../SECURITY.md)
