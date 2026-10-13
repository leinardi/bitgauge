# Compatibility Layers

[Feature index](README.md) / Compatibility

A compatibility layer is an optional group of routes that lets an existing third-party client test
against BitGauge: the OpenSpeedTest web UI, LibreSpeed clients (web UI, `librespeed-cli`, Android
app) and Apple's `networkQuality`. Layers adapt foreign protocols to the same handlers as the
native API ([wire-protocol.md](wire-protocol.md)); they never change the native API or the
measurement engine ([principles.md §2.7](principles.md#27-compatibility-is-a-layer-not-the-core)).

- **Every layer is off by default** and enabled by exactly one toggle. A disabled layer's routes
  answer `404`.
- All routes are mounted under `server.base_path`, like the native API.
- No layer stores anything: LibreSpeed's telemetry and results routes are not implemented.
- No OpenSpeedTest or LibreSpeed code or assets are copied or served. BitGauge implements their
  wire contracts from the documented behaviour ([research/](../research/README.md)); the names are
  used only to describe compatibility. OpenSpeedTest™ is a trademark of its owner.
- Numbers reported by these clients come from their own methodologies, not BitGauge's: client-timed
  upload, fixed request sizes and overhead factors stay theirs.

Requirement statements about what a server or client does on the wire use RFC 2119 keywords.

## 1. OpenSpeedTest

**Purpose.** Lets a self-hosted copy of the OpenSpeedTest web UI run against BitGauge with its
`?Host=` parameter, so existing bookmarks and habits keep working during migration. BitGauge never
ships the OpenSpeedTest UI; the user hosts it (for example in the old container).

**Enabled by.** `compat.openspeedtest.enabled: true` (env
`BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED`).

### 1.1 Routes and Parameters

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET`, `HEAD` | `/downloading?n=…` | `200`, exactly 30 MiB (31 457 280 bytes) of incompressible random data from the shared buffer, `Content-Type: application/octet-stream`, `Content-Length`, no `Content-Encoding` (`HEAD`: headers only) |
| `GET`, `HEAD` | `/upload?n=…` | `200`, empty body. This is OpenSpeedTest's ping, which accepts **only** status 200 |
| `POST` | `/upload?n=…` | Drain the body (at least 30 MiB accepted), then `200`, empty body |
| `OPTIONS` | `/downloading`, `/upload` | `200` with the CORS headers below, empty body |

- The `n` parameter is a cache-buster; the server MUST ignore it.
- Every response MUST carry `Cache-Control: no-store`.
- The server MUST answer the ping with `200`, never `204`: the OpenSpeedTest client expects `200`
  as the ping reply.
- **Body cap.** The upload route accepts bodies up to 35 MiB (36 700 160 bytes), the same class as
  the OpenSpeedTest image's `client_max_body_size 35m`; OpenSpeedTest sends 30 MiB. Larger bodies
  MUST yield `413`. The 120 s request lifetime of the native upload applies (`408` after it).
- Both routes count against `limits.max_streams_per_client` and `limits.requests_per_minute`.
- Startup fails when the layer is enabled and `limits.max_download_bytes` is below 30 MiB or
  `limits.max_upload_bytes` is below 35 MiB ([configuration.md](configuration.md)).

### 1.2 CORS

OpenSpeedTest's UI is usually served from another origin than the server it tests, so every
response on these routes MUST carry:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

The `*` origin is a deliberate trade-off: any page the browser visits can drive throughput through
these routes; see [security.md](security.md).

### 1.3 Client Usage

Open the self-hosted OpenSpeedTest UI with the BitGauge URL prefix where the routes live:

```text
https://ost.example.lan/?Host=https://speed.example.lan
https://ost.example.lan/?Host=https://speed.example.lan/speed     # with base_path: /speed
```

### 1.4 Differences and Known Limitations

- **Upload numbers.** The OpenSpeedTest UI times upload in the browser, so its upload figure
  follows its own method and can differ from BitGauge's server-timed number. BitGauge reads every
  upload body fully before answering.
- **Slow links.** The UI uses 30 MiB requests, which take minutes each at sub-Mbit rates; BitGauge's
  own UI adapts its request sizes to slow VPN links.
- **Overhead factor.** The OpenSpeedTest UI applies a factor of 1.04 to both directions by default.
- **Results link.** If the user clicks OpenSpeedTest's results link, the UI sends the results and
  user agent to openspeedtest.com; BitGauge notes this in the About screen.
- **Rate limits.** The OpenSpeedTest UI does not read `Retry-After`; keep the rate limits generous
  for clients that use this layer.

### 1.5 Route-Clash Analysis

- `/upload` and `/downloading` sit at the base path root. The native API is entirely under
  `/api/v1/` (`/api/v1/upload` is a different path), so there is no overlap.
- The SPA's client routes are `/`, `/result/{id}`, `/history`, `/settings` and `/about`, and its
  assets are under `/assets/`. The SPA fallback serves `index.html` only for that fixed route list,
  never as a catch-all, so `/upload` and `/downloading` are never shadowed by the SPA and vice
  versa.
- The design export's root assets also sit at the base path root, as eight exact file names:
  `/favicon.svg`, `/favicon-16.png`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`,
  `/icon-512.png`, `/icon-512-maskable.png` and `/site.webmanifest`. Each is matched exactly, never
  by a pattern, and none equals or is a prefix of a compatibility route (`/upload`, `/downloading`,
  `/garbage`, `/empty`, `/getIP`, their `.php` and `/backend/…` forms, `/.well-known/librespeed`,
  `/.well-known/nq`, `/nq/…`) or of `/metrics`, so they shadow nothing and nothing shadows them.
- LibreSpeed routes (`/garbage`, `/empty`, `/getIP`, `/backend/…`) and networkQuality routes
  (`/nq/…`, `/.well-known/nq`) use different names.
- With a non-root base path, all of the above move together under it; the proxy MUST forward the
  base path unchanged (no prefix stripping) because BitGauge routes on the full path.

## 2. LibreSpeed

**Purpose.** Lets LibreSpeed clients test against BitGauge: a self-hosted LibreSpeed web UI,
`librespeed-cli` (for scheduled CLI tests from cron or a monitoring job) and LibreSpeed Android
builds.

**Enabled by.** `compat.librespeed.enabled: true` (env `BITGAUGE_COMPAT__LIBRESPEED__ENABLED`).

### 2.1 Routes and Parameters

Each route exists in four spellings, matching LibreSpeed's Go server: bare (`/garbage`), with the
`backend/` prefix (`/backend/garbage`), with the `.php` suffix (`/garbage.php`) and with both
(`/backend/garbage.php`).

| Method | Path (bare form) | Behaviour |
| --- | --- | --- |
| `GET` | `/garbage?ckSize=N` | `200`, `N` chunks of 1 MiB of random data (`N` in MB units as LibreSpeed documents it, sent as 1 MiB chunks as its Go server does). Default 4. Capped at `min(1024, floor(limits.max_download_bytes / 1 MiB))` = 256 with defaults. `Content-Type: application/octet-stream`, `Content-Length`, no `Content-Encoding`, `Cache-Control: no-store` |
| `GET`, `POST` | `/empty` | Drain any body, then `200`, empty body, `Cache-Control: no-store`, `Connection: keep-alive` on HTTP/1.1. Used for both upload and ping |
| `GET` | `/getIP` | `200`, JSON `{processedString, rawIspInfo}` (below), `Cache-Control: no-store` |
| `OPTIONS` | all of the above | `200` with the CORS headers of §2.2, empty body |

- `/empty` bodies are capped at `limits.max_upload_bytes` (`413` above) and follow the 120 s
  lifetime. LibreSpeed's web UI uploads 20 MB blobs by default and `librespeed-cli` uploads
  1024 KiB payloads with an explicit `Content-Length` (it never chunks), both well inside the cap.
- **`/getIP`.** BitGauge never performs ISP or geolocation lookups, so `isp=true` and `distance`
  are ignored and `rawIspInfo` is always an empty object, the shape LibreSpeed's Go server returns
  without ISP data and that both the LibreSpeed web UI and `librespeed-cli` decode:

  ```json
  { "processedString": "10.8.0.2 - private IPv4 access", "rawIspInfo": {} }
  ```

  `processedString` is the client IP (derived through trusted proxies only); when the address is
  private it reads `<ip> - <class>`, using LibreSpeed's classification strings:
  `localhost IPv6 access` (`::1`), `link-local IPv6 access` (`fe80::/10`), `ULA IPv6 access`
  (`fc00::/7`), `localhost IPv4 access` (`127.0.0.0/8`), `private IPv4 access` (`10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`), `link-local IPv4 access` (`169.254.0.0/16`) and
  `CGNAT IPv4 access` (`100.64.0.0/10`). A leading `::ffff:` is stripped first. The response is
  always JSON, as in LibreSpeed's Go server (its PHP backend returns plain text without `isp`);
  `librespeed-cli` requires JSON.
- `/garbage` and `/empty` count against `limits.max_streams_per_client` and
  `limits.requests_per_minute`.
- **Not implemented:** `/results`, `/results/telemetry`, `/stats`, `/results/json` and their
  variants answer `404`. BitGauge never stores results.

### 2.2 CORS and `cors=true`

As in LibreSpeed, CORS headers are sent only when the request carries `cors=true` (LibreSpeed's
multi-server mode adds it). On `/garbage` and `/empty` they are:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Content-Encoding, Content-Type
```

`/getIP` returns the caller's private LAN or VPN address, so it MUST NOT be readable by arbitrary
sites: with `cors=true` it sends the headers above with `Access-Control-Allow-Origin: <origin>` and
`Vary: Origin` only when the request's `Origin` is listed in `server.cors.allowed_origins`, and no
CORS headers otherwise ([security.md
§6](security.md#6-compatibility-layers-and-access-control-allow-origin-)). Without its origin
listed, a cross-origin LibreSpeed UI cannot read the IP and shows none; the test itself is
unaffected.

A LibreSpeed web UI hosted on another origin must therefore be configured in multi-server mode with
BitGauge as its server, so that it sends `cors=true`, and its origin should be added to
`server.cors.allowed_origins` if it should display the client IP. That list is a single grant:
an origin in it may also call the native API and open WebSockets cross-origin
([wire-protocol.md §8](wire-protocol.md#8-caching-cors-and-compression)). `OPTIONS` preflights on
`/garbage` and `/empty` always answer with the headers above, because a preflight cannot carry the
query parameter reliably; preflights on `/getIP` follow the `/getIP` origin rule.

### 2.3 `librespeed-cli` Server List

`librespeed-cli` reads a server list (`--local-json FILE`, `--local-json -` for stdin, or
`--server-json URL`). Entries use LibreSpeed's fields; paths are relative to `server`:

```json
[
  {
    "id": 1,
    "name": "BitGauge home",
    "server": "https://speed.example.lan/",
    "dlURL": "garbage",
    "ulURL": "empty",
    "pingURL": "empty",
    "getIpURL": "getIP"
  }
]
```

```text
librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json
librespeed-cli --server-json https://speed.example.lan/.well-known/librespeed --server 1 --no-icmp
```

- `--no-icmp` makes the CLI ping over HTTP `GET` to `pingURL`; by default it uses ICMP, which
  measures the host rather than BitGauge and needs privileges on Linux.
- `--chunks` sets `ckSize`; the CLI default of 100 means 100 MiB per download request, which never
  completes on slow VPN links (the fixed-size problem of [product.md](product.md)). Choose
  `--chunks` so one request takes a few seconds at the expected rate.
- `--upload-size` is in KiB (default 1024).

### 2.4 `/.well-known/librespeed` (BitGauge Convention)

When the layer is enabled, `GET /.well-known/librespeed` returns the server list above with one
entry describing this instance, so `librespeed-cli --server-json` can point straight at it. This is
a BitGauge convenience, **not** a LibreSpeed standard. `name` is `server.display_name`. `server` is
an absolute URL ending in the base path and `/`, built by this rule (plain `http` is allowed,
because LibreSpeed clients work over HTTP):

1. If `server.public_url` is set: `public_url` + base path.
2. Otherwise, for a request whose TCP peer is a trusted proxy: `X-Forwarded-Proto` and `Host` (or
   `X-Forwarded-Host`) + base path.
3. Otherwise: the request's own `Host` header with scheme `http` (BitGauge itself speaks plain
   HTTP) + base path. The URL is only echoed back to the client that asked, so an untrusted `Host`
   can only mislead that client.

### 2.5 Android App

LibreSpeed's Android app is a template that whoever builds and distributes it configures with a
server list. A self-built app can list BitGauge with the entry of §2.3. Published builds test
against their publisher's servers, and BitGauge cannot appear in them.

### 2.6 Differences and Known Limitations

- LibreSpeed clients time upload on the client and, by default, apply a factor of 1.06; their
  chunk sizes and stream counts are their own. Numbers follow LibreSpeed's method, not BitGauge's.
- BitGauge's `/getIP` reports the address derived through `trusted_proxies` only, so behind a
  reverse proxy that is not listed there it reports the proxy's address
  ([security.md](security.md)).
- `ckSize` above the cap is clamped silently, as LibreSpeed clamps at 1024.

## 3. Apple networkQuality

**Purpose.** Lets macOS's and iOS's `networkQuality` tool (and compatible clients such as
`goresponsiveness`) measure capacity and RPM against BitGauge, following Apple's server
specification and the IETF responsiveness draft.

**Enabled by.** `compat.networkquality.enabled: true` (env
`BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED`). The routes live under their own `/nq/` prefix, because
Apple's default paths would collide with BitGauge's `/api/v1`.

### 3.1 Routes

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/nq/config` | `200`, config JSON (§3.2), `Content-Type: application/json`, `Cache-Control: no-store` |
| `GET` | `/.well-known/nq` | Same response as `/nq/config` (discovery path from the IETF draft) |
| `GET` | `/nq/small` | `200`, one byte, `Content-Length: 1`; the same object as `/api/v1/small` |
| `GET` | `/nq/large` | `200`, a streamed body of at least 8 GB: `Content-Length: 8589934592` (8 GiB) written from the shared random buffer; clients close it early |
| `POST` | `/nq/upload` | Drain the body fully, then `200`, empty body |

- No route may redirect (`networkQuality` fails on redirects) and no response may carry a
  `Content-Encoding`.
- **Upload limit.** `/nq/upload` has its own drain limit,
  `compat.networkquality.max_upload_bytes`, separate from `limits.max_upload_bytes`, because the
  client posts large bodies for the duration of its test (Apple's reference nginx configuration
  allows 250 MB request bodies). The server MUST read the whole body before responding: on HTTP/1.1
  between proxy and BitGauge an early response forces a connection close. A declared
  `Content-Length` above the limit is answered `413` without reading; a body without
  `Content-Length` (streamed) that exceeds the limit is read up to it, then answered `413` and the
  connection closed. The 120 s request lifetime
  applies. The default drain limit is tracked in [open-questions.md](open-questions.md).
- `/nq/large` and `/nq/upload` count against `compat.networkquality.max_flows_per_client`
  (default 32), not against the native stream limit, because `networkQuality` opens many parallel
  flows by design. `/nq/large` is not bounded by `limits.max_download_bytes`.
- On failure the routes answer `429` (flow limit on `/nq/large` and `/nq/upload`) or a `50x`.
  Every `429` carries `Retry-After` in whole seconds, as for all limits
  ([wire-protocol.md §9](wire-protocol.md#9-rate-limits)); `/nq/config` has no limit of its own and
  answers `503` only when it cannot build its URLs (§3.3).
- **CORS.** None. `networkQuality` and `goresponsiveness` are native clients, not browser pages,
  so these routes send no CORS headers and answer no preflights.

### 3.2 Config JSON

```json
{
  "version": 1,
  "urls": {
    "small_https_download_url": "https://speed.example.lan/nq/small",
    "large_https_download_url": "https://speed.example.lan/nq/large",
    "https_upload_url": "https://speed.example.lan/nq/upload",
    "small_download_url": "https://speed.example.lan/nq/small",
    "large_download_url": "https://speed.example.lan/nq/large",
    "upload_url": "https://speed.example.lan/nq/upload"
  }
}
```

`small_https_download_url`, `large_https_download_url` and `https_upload_url` are the keys of
Apple's server specification and its reference configurations; `small_download_url`,
`large_download_url` and `upload_url` are the names the IETF responsiveness draft uses
([research/networkquality.md](../research/networkquality.md)). Both sets point at the same routes
and are emitted so that every client version finds the keys it reads.

### 3.3 Absolute URL Construction

The config holds absolute `https://` URLs, so the server needs its public origin:

1. If `server.public_url` is set, URLs are `public_url` + base path + route.
2. Otherwise, only for a request whose TCP peer is a trusted proxy, the origin is built from
   `X-Forwarded-Proto` and `Host` (or `X-Forwarded-Host` when the proxy sets it).
3. Otherwise, or when the resulting scheme is not `https`, `/nq/config` answers `503` with the
   error envelope (code `public_url_required`) and a message naming `server.public_url`. Headers
   from untrusted peers are never used to build URLs.

### 3.4 Proxy Requirements

- **TLS 1.3 and HTTP/2** at the reverse proxy: Apple's specification requires both. The
  certificate must be trusted by the client device; a private CA must be installed in the system
  trust store.
- Request buffering off and a body limit at least `compat.networkquality.max_upload_bytes` on
  `/nq/upload`; response buffering off on `/nq/large`.
- With a non-root base path, `/.well-known/nq` lives under the base path too; draft-style discovery
  at the host root then needs a proxy rule, or clients use `-C` with the explicit config URL.

See [deployment-example.md](deployment-example.md) for Traefik, Caddy and nginx snippets.

### 3.5 Client Usage

```text
networkQuality -C https://speed.example.lan/nq/config
networkQuality -C https://speed.example.lan/nq/config -v      # verbose, per-flow detail
```

### 3.6 What BitGauge's Own RPM Shares With It

- The same one-byte object: `/nq/small` and `/api/v1/small` are served by one handler.
- The same idea of measuring a small request multiplexed on a loaded HTTP/2 connection, and the
  same `RPM = 60000 / TM95` formula over the self-probe samples.
- What differs: `networkQuality` adds foreign probes on new connections, controls its connections
  and runs its own load; the browser can do neither and cannot verify which connection a probe used.
  BitGauge's number is labelled "HTTP loaded responsiveness — connection sharing not verifiable" and
  is never presented as comparable ([measurement.md
  §12](measurement.md#12-http-loaded-responsiveness)).

## 4. Client-by-Layer Matrix

| Client | Native API | OpenSpeedTest layer | LibreSpeed layer | networkQuality layer |
| --- | --- | --- | --- | --- |
| BitGauge SPA | ✓ (its only API) | — | — | — |
| OpenSpeedTest web UI (self-hosted copy, `?Host=`) | — | ✓ | — | — |
| LibreSpeed web UI (self-hosted, multi-server mode) | — | — | ✓ | — |
| `librespeed-cli` | — | — | ✓ | — |
| LibreSpeed Android app (self-built) | — | — | ✓ | — |
| Apple `networkQuality` (macOS 12+) | — | — | — | ✓ (needs TLS 1.3 + HTTP/2) |
| `goresponsiveness` | — | — | — | ✓ (needs TLS 1.3 + HTTP/2) |

## 5. Route Table

All routes share one router and are mounted under `server.base_path`. No two rows match the same
path and method.

| Path | Methods | Owner | Enabled by |
| --- | --- | --- | --- |
| `/`, `/result/{id}`, `/history`, `/settings`, `/about` | `GET` | SPA (`index.html`) | always |
| `/assets/*` | `GET` | SPA static assets | always |
| `/favicon.svg`, `/favicon-16.png`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/icon-512-maskable.png`, `/site.webmanifest` | `GET` | SPA root assets (`Cache-Control: public, max-age=86400`) | always |
| `/api/v1/download` | `GET` | native | always |
| `/api/v1/upload` | `POST` | native | always |
| `/api/v1/ping` | `GET`, `HEAD` | native | always |
| `/api/v1/small` | `GET` | native | always |
| `/api/v1/ws` | `GET` (upgrade) | native | always |
| `/api/v1/info` | `GET` | native | always |
| `/metrics` (configurable) | `GET` | operations | `metrics.enabled` |
| `/downloading` | `GET`, `HEAD`, `OPTIONS` | OpenSpeedTest | `compat.openspeedtest.enabled` |
| `/upload` | `GET`, `HEAD`, `POST`, `OPTIONS` | OpenSpeedTest | `compat.openspeedtest.enabled` |
| `/garbage`, `/garbage.php`, `/backend/garbage`, `/backend/garbage.php` | `GET`, `OPTIONS` | LibreSpeed | `compat.librespeed.enabled` |
| `/empty`, `/empty.php`, `/backend/empty`, `/backend/empty.php` | `GET`, `POST`, `OPTIONS` | LibreSpeed | `compat.librespeed.enabled` |
| `/getIP`, `/getIP.php`, `/backend/getIP`, `/backend/getIP.php` | `GET`, `OPTIONS` | LibreSpeed | `compat.librespeed.enabled` |
| `/.well-known/librespeed` | `GET` | LibreSpeed (BitGauge convention) | `compat.librespeed.enabled` |
| `/nq/config`, `/.well-known/nq` | `GET` | networkQuality | `compat.networkquality.enabled` |
| `/nq/small`, `/nq/large` | `GET` | networkQuality | `compat.networkquality.enabled` |
| `/nq/upload` | `POST` | networkQuality | `compat.networkquality.enabled` |

`metrics.path` is validated at startup so it cannot collide with any row above
([configuration.md](configuration.md)).

## Related

- [Wire protocol](wire-protocol.md)
- [Configuration](configuration.md)
- [Security model](security.md)
- [Example deployment and proxy requirements](deployment-example.md)
- [OpenSpeedTest research](../research/openspeedtest.md)
- [LibreSpeed research](../research/librespeed.md)
- [networkQuality research](../research/networkquality.md)
