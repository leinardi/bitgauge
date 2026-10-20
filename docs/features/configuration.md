# Configuration

[Feature index](README.md) / Configuration

BitGauge is configured by an optional, read-only YAML file and by `BITGAUGE_` environment
variables. Every key has a default, so a container with no configuration at all serves a working
speed test on port 8080. How the configuration is loaded and validated internally is specified in
[technical-stack/configuration-security.md](technical-stack/configuration-security.md).

## 1. Config File First

The config file is the primary interface, so the deployment's IaC stays authoritative. It is read
from `/etc/bitgauge/config.yaml`, or from the path given with `--config`. A missing file at the
default path is not an error (defaults and environment apply); a missing file at a path given
explicitly is.

Full annotated example, showing every key with its default unless noted:

```yaml
server:
  listen: ":8080"                 # host:port; default port 8080
  base_path: /                    # sub-path when served behind a proxy, e.g. /speed
  display_name: BitGauge          # shown in the UI and in GET /api/v1/info
  public_url: ""                  # origin as seen by clients, e.g. https://speed.example.lan
                                  # (scheme, host, optional port; no path). Needed by the
                                  # networkQuality layer unless a trusted proxy sets
                                  # X-Forwarded-Proto and Host.
  trusted_proxies: []             # CIDRs whose forwarding headers are believed, e.g.
                                  # ["172.20.0.2/32"] for the Traefik container
  labels: []                      # client subnets mapped to the suggested context label, e.g.
                                  # [{cidr: 10.8.0.0/24, label: VPN}]; longest prefix wins
  cors:
    allowed_origins: []           # extra origins allowed to call /api/v1 (exact origins, no "*")

limits:
  max_download_bytes: 256MiB      # cap per download request (?bytes=N)
  max_upload_bytes: 256MiB        # cap per upload request body
  max_streams_per_client: 8       # concurrent throughput requests per client IP
  requests_per_minute: 1200       # new throughput requests per client IP per minute
  tracked_clients: 4096           # size of the in-memory rate-limit table (bounded)

test_defaults:                    # exposed to the browser via GET /api/v1/info
  preset: standard                # quick | standard | extended | continuous
  phases: [idle, download, upload]  # which phases run, and the order of the two directions
  streams:
    mode: auto                    # auto | fixed | single
    fixed: 3                      # stream count used by mode: fixed
    max: 6                        # 1-6; upper bound for the auto ramp
  download:
    min_duration: ""              # "" = the preset's value (Standard: 10s)
    max_duration: ""              # "" = the preset's value (Standard: 20s)
  upload:
    min_duration: ""              # "" = the preset's value (Standard: 15s)
    max_duration: ""              # "" = the preset's value (Standard: 25s)
  data_cap: 0                     # bytes per test, both directions; 0 = no cap
  units: bits                     # bits | bytes
  warmup: auto                    # auto | a fixed duration such as 3s
  ping_count: 0                   # idle pings; 0 = the preset's value (Standard: 20)
  overhead_compensation_percent: 0  # 0 = none; shown next to every number when non-zero

compat:                           # all layers are off by default
  openspeedtest:
    enabled: false
  librespeed:
    enabled: false
  networkquality:
    enabled: false
    max_upload_bytes: 1GiB        # separate drain limit for /nq/upload
    max_flows_per_client: 32      # concurrent /nq/large + /nq/upload per client IP

log:
  format: text                    # text | json
  level: info                     # debug | info | warn | error

metrics:
  enabled: false                  # Prometheus endpoint; unauthenticated, so off by default
  path: /metrics                  # relative to base_path
```

**Value syntax.** Sizes accept a plain integer (bytes) or a number with a unit: `KiB`, `MiB`,
`GiB` (binary) or `kB`, `MB`, `GB` (decimal). Durations use Go syntax (`500ms`, `10s`, `2m`). Lists
in the file are YAML sequences.

## 2. Keys

The environment variable for a key is `BITGAUGE_` followed by the key path in upper case, with `__`
(double underscore) between levels; single underscores stay part of a key name. For example
`server.trusted_proxies` is `BITGAUGE_SERVER__TRUSTED_PROXIES` and `test_defaults.streams.max` is
`BITGAUGE_TEST_DEFAULTS__STREAMS__MAX`. List values in an environment variable are comma-separated.
Only variables containing `__` are read as configuration; other `BITGAUGE_*` variables are ignored
(§4).

### 2.1 Server

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `server.listen` | `BITGAUGE_SERVER__LISTEN` | `:8080` | `host:port`; port 1–65535. BitGauge speaks plain HTTP; TLS terminates at the proxy. |
| `server.base_path` | `BITGAUGE_SERVER__BASE_PATH` | `/` | Absolute path; every route, the SPA and `/metrics` are mounted under it. |
| `server.display_name` | `BITGAUGE_SERVER__DISPLAY_NAME` | `BitGauge` | 1–64 printable characters; shown in the UI, `GET /info` and the LibreSpeed server list. |
| `server.public_url` | `BITGAUGE_SERVER__PUBLIC_URL` | empty | Origin clients use (`https://speed.example.lan`). Used for absolute URLs in the networkQuality config and the LibreSpeed server list ([compatibility.md](compatibility.md)). |
| `server.trusted_proxies` | `BITGAUGE_SERVER__TRUSTED_PROXIES` | empty | List of CIDRs (single addresses as `/32` or `/128`). Only peers in these ranges may set the client IP through forwarding headers ([security.md §4](security.md#4-client-ip-and-trusted-proxies)). |
| `server.labels` | `BITGAUGE_SERVER__LABELS` | empty | List of `{cidr, label}` entries mapping client subnets to the suggested context label of `GET /info` ([wire-protocol.md §5](wire-protocol.md#5-get-apiv1info)): the longest prefix containing the client IP wins, and without a match the address-class rule applies. `label` is 1–64 printable characters, as `display_name`. In the environment, comma-separated `cidr=label` items, split at the first `=`: `BITGAUGE_SERVER__LABELS=10.8.0.0/24=VPN,fd7a:115c:a1e0::/48=Tailscale`. A label containing a comma can only be set in the file. |
| `server.cors.allowed_origins` | `BITGAUGE_SERVER__CORS__ALLOWED_ORIGINS` | empty | List of exact origins allowed to call `/api/v1` cross-origin ([wire-protocol.md §8](wire-protocol.md#8-caching-cors-and-compression)). |

### 2.2 Limits

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `limits.max_download_bytes` | `BITGAUGE_LIMITS__MAX_DOWNLOAD_BYTES` | `256MiB` | 64 KiB–4 GiB. Cap per `GET /api/v1/download` and LibreSpeed `ckSize`; the engine's request-size cap. |
| `limits.max_upload_bytes` | `BITGAUGE_LIMITS__MAX_UPLOAD_BYTES` | `256MiB` | 64 KiB–4 GiB. Cap per upload body on native and LibreSpeed routes. The OpenSpeedTest upload cap is a fixed 35 MiB; for that layer this key only gates startup (§4). |
| `limits.max_streams_per_client` | `BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT` | `8` | 1–64. Concurrent throughput requests per client IP. |
| `limits.requests_per_minute` | `BITGAUGE_LIMITS__REQUESTS_PER_MINUTE` | `1200` | 60–100000. New throughput requests per client IP per minute. |
| `limits.tracked_clients` | `BITGAUGE_LIMITS__TRACKED_CLIENTS` | `4096` | 16–1000000. Size of the rate-limit table; the least recently seen idle entry is evicted, and a new client is refused with `429` when every entry is active ([technical-stack/configuration-security.md](technical-stack/configuration-security.md)). |
| `compat.networkquality.max_upload_bytes` | `BITGAUGE_COMPAT__NETWORKQUALITY__MAX_UPLOAD_BYTES` | `1GiB` | 1 MiB–64 GiB. Drain limit for `/nq/upload`; the default is still open ([README.md](README.md#later-and-open-items)). |
| `compat.networkquality.max_flows_per_client` | `BITGAUGE_COMPAT__NETWORKQUALITY__MAX_FLOWS_PER_CLIENT` | `32` | 1–256. Concurrent `/nq/large` and `/nq/upload` per client IP. |

The WebSocket limit (4 per client IP) and the 120 s upload lifetime are fixed, not configurable
([wire-protocol.md §9](wire-protocol.md#9-rate-limits)).

### 2.3 Test Defaults

These are defaults the server exposes to the browser in `GET /api/v1/info`. The user's settings and
URL parameters override them per browser ([ui/url-params.md](ui/url-params.md)). Semantics are
specified in [measurement.md](measurement.md).

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `test_defaults.preset` | `BITGAUGE_TEST_DEFAULTS__PRESET` | `standard` | `quick`, `standard`, `extended`, `continuous` ([measurement.md §8.5](measurement.md#85-presets)). |
| `test_defaults.phases` | `BITGAUGE_TEST_DEFAULTS__PHASES` | `idle,download,upload` | Non-empty list of `idle`, `download`, `upload` without duplicates; `idle`, when present, comes first; the order of `download` and `upload` is the run order. Info always runs and is not listed ([decisions.md §34](technical-stack/decisions.md#34-info-phase--always-runs)). |
| `test_defaults.streams.mode` | `BITGAUGE_TEST_DEFAULTS__STREAMS__MODE` | `auto` | `auto`, `fixed`, `single`. |
| `test_defaults.streams.fixed` | `BITGAUGE_TEST_DEFAULTS__STREAMS__FIXED` | `3` | 1–`streams.max`; used by `fixed`. |
| `test_defaults.streams.max` | `BITGAUGE_TEST_DEFAULTS__STREAMS__MAX` | `6` | 1–6 and ≤ `limits.max_streams_per_client`. |
| `test_defaults.download.min_duration` | `BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION` | preset | 5s–10m; empty means the preset's value. |
| `test_defaults.download.max_duration` | `BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MAX_DURATION` | preset | ≥ `min_duration`, ≤ 10m. |
| `test_defaults.upload.min_duration` | `BITGAUGE_TEST_DEFAULTS__UPLOAD__MIN_DURATION` | preset | 5s–10m. |
| `test_defaults.upload.max_duration` | `BITGAUGE_TEST_DEFAULTS__UPLOAD__MAX_DURATION` | preset | ≥ `min_duration`, ≤ 10m. |
| `test_defaults.data_cap` | `BITGAUGE_TEST_DEFAULTS__DATA_CAP` | `0` | `0` (no cap) or ≥ 1 MiB. |
| `test_defaults.units` | `BITGAUGE_TEST_DEFAULTS__UNITS` | `bits` | `bits` (kbit/s, Mbit/s, Gbit/s) or `bytes` (kB/s, MB/s, GB/s). |
| `test_defaults.warmup` | `BITGAUGE_TEST_DEFAULTS__WARMUP` | `auto` | `auto` or a duration 1s–60s ([measurement.md §8.3](measurement.md#83-warm-up-end)). |
| `test_defaults.ping_count` | `BITGAUGE_TEST_DEFAULTS__PING_COUNT` | `0` | `0` (the preset's value) or 6–200 (the first ping is a discarded warm-up sample and idle latency needs at least 5 successful samples, [measurement.md §10](measurement.md#10-idle-latency)). |
| `test_defaults.overhead_compensation_percent` | `BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT` | `0` | 0–20, decimals allowed; LibreSpeed presets are 6, 5.13, 3.69 and 8.1 ([measurement.md §9.3](measurement.md#93-overhead-compensation)). |

The duration keys apply only to the bounded presets. With `preset: continuous`, which has no minimum
or maximum, they are still parsed and validated by the duration pair rule (§4), in which an empty
bound then counts as no bound, so only a pair with both bounds set is compared (`min 30s`, `max 20s`
exits with status 2, `min 30s` alone does not); `GET /info` reports `null` bounds, and the startup
log's warn line names each duration key that is set as ignored for Continuous. An optional run
length is set per run only, in Settings or with the `duration` URL parameter
([ui/url-params.md](ui/url-params.md)); its ping count is 20, the preset's, unless `ping_count` sets
another.

### 2.4 Compatibility Toggles

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `compat.openspeedtest.enabled` | `BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED` | `false` | OpenSpeedTest routes `/downloading`, `/upload`. |
| `compat.librespeed.enabled` | `BITGAUGE_COMPAT__LIBRESPEED__ENABLED` | `false` | LibreSpeed routes `/garbage`, `/empty`, `/getIP` and variants, `/.well-known/librespeed`. |
| `compat.networkquality.enabled` | `BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED` | `false` | networkQuality routes `/nq/*` and `/.well-known/nq`. |

The networkQuality limits are listed in §2.2.

### 2.5 Log

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `log.format` | `BITGAUGE_LOG__FORMAT` | `text` | `text` or `json` (`log/slog` handlers). |
| `log.level` | `BITGAUGE_LOG__LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |

What is and is never logged is specified in
[technical-stack/configuration-security.md](technical-stack/configuration-security.md).

### 2.6 Metrics

| Key | Env var | Default | Values / description |
| --- | --- | --- | --- |
| `metrics.enabled` | `BITGAUGE_METRICS__ENABLED` | `false` | Serve the Prometheus metrics at `metrics.path` (`GET` only). The counters are kept either way; only the endpoint is gated. Unauthenticated and not rate-limited; restrict at the proxy. |
| `metrics.path` | `BITGAUGE_METRICS__PATH` | `/metrics` | Absolute path relative to `base_path`; must not collide with any route ([compatibility.md §5](compatibility.md#5-route-table)). The metric set is in [technical-stack/backend.md §7](technical-stack/backend.md#7-prometheus-metric-set). |

## 3. Precedence

**Defaults < file < environment.** Each source overrides only the keys it sets. An environment
variable therefore always wins, which suits compose files and orchestrators; the file is the place
for the full, reviewable configuration.

```text
# file sets display_name: home; the environment overrides it
BITGAUGE_SERVER__DISPLAY_NAME=lab  →  server.display_name = "lab"
```

## 4. Fail-Closed Validation

The whole effective configuration is validated at startup, before the listener opens. Any error is
fatal: BitGauge logs every problem it found, one line per problem naming the key, the offending
value (never a secret; BitGauge has none) and the rule it broke, then exits with status **2**
without serving anything. If the log settings themselves are invalid, the errors are written as
text to stderr. Nothing is ever silently corrected or defaulted.

| Rule | Example of a rejected value |
| --- | --- |
| **Unknown keys** in the file, and unknown keys in `BITGAUGE_*` variables that contain `__`, are errors (typo protection). A `BITGAUGE_*` variable **without** `__` is not a config key and is ignored (logged at `debug`): every key is nested, and orchestrators inject such variables, e.g. Kubernetes service links `BITGAUGE_PORT` and `BITGAUGE_SERVICE_HOST` for a Service named `bitgauge`. | `server.lisen`, `BITGAUGE_SERVER__LISTN` |
| Values must parse as their type (size, duration, integer, boolean, enum). | `limits.max_upload_bytes: 256 megs` |
| **Invalid CIDR** in `server.trusted_proxies`. | `10.0.0.0/33`, `proxy.lan` |
| **`server.labels` entries**: each `cidr` is a valid CIDR with no host bits set, not an IPv4-mapped IPv6 prefix (write it as IPv4), and unique in the list; each `label` is 1–64 printable characters; in the environment each item is `cidr=label`, and an item without `=` is a problem, never dropped. Problems name the entry: `server.labels[1].cidr`. | `10.0.0.1/8` (host bits set), `::ffff:10.8.0.0/120`, `10.8.0.0/24` twice, `BITGAUGE_SERVER__LABELS=10.8.0.0/24` (no `=`), a 65-character label |
| **Port range**: `server.listen` must be `host:port` with port 1–65535. | `:0`, `:70000` |
| **Base path shape**: starts with `/`, no trailing `/` (except `/` itself), no `.` or `..` segments, no query or fragment, only `A–Z a–z 0–9 - . _ ~ /`. | `speed`, `/speed/`, `/a/../b` |
| `server.public_url` is an absolute `http` or `https` origin with no path, query or fragment. | `speed.example.lan`, `https://x/speed` |
| `server.cors.allowed_origins` entries are exact origins; `*` is rejected. | `*`, `https://x/path` |
| **Cap below the engine minimum**: `limits.max_download_bytes` and `limits.max_upload_bytes` must be at least 64 KiB, the engine's initial request size ([measurement.md §3](measurement.md#3-adaptive-request-size)). | `32KiB` |
| Ranges in §2 are enforced, including `test_defaults.streams.max ≤ limits.max_streams_per_client`. | `streams.max: 8` with `max_streams_per_client: 4` |
| `test_defaults.phases` rules (non-empty, no duplicates, `idle` first). | `[download, idle]` |
| Duration pairs: `min_duration ≤ max_duration`, an empty bound counting as the preset's value ([measurement.md §8.5](measurement.md#85-presets)). | `min 30s`, `max 20s`; `upload.min_duration: 30s` with Standard's 25 s maximum |
| **Conflicting toggles**: the OpenSpeedTest layer needs `max_download_bytes ≥ 30 MiB` and `max_upload_bytes ≥ 35 MiB`; the LibreSpeed layer needs `max_download_bytes ≥ 1 MiB` (one `ckSize` chunk); the networkQuality layer needs either an `https` `server.public_url` or, with `public_url` empty, at least one `trusted_proxies` entry, since it cannot build its `https` URLs otherwise. The rules apply whenever the layer's toggle is on. | `compat.openspeedtest.enabled: true` with `max_download_bytes: 16MiB`; `compat.networkquality.enabled: true` with `public_url: http://speed.lan` |
| **Features not in this release**: a toggle for a feature a release does not include is rejected, naming the release that brings it, so that nothing is silently ignored, while its other keys are still parsed and validated. Every toggle of §2 is included, so none is rejected this way today. | none today |
| `metrics.path` must not collide with any route of the route table. | `/api/v1/info`, `/upload` |

Warnings (logged, not fatal) cover settings that are valid but probably unintended, for example
`metrics.enabled: true` with no `trusted_proxies` (the metrics endpoint is then reachable directly),
`trusted_proxies` containing `0.0.0.0/0`, or a duration key set with `test_defaults.preset:
continuous`, which ignores it (§2.3).

## 5. Read-Only Configuration and the No-Write Guarantee

- BitGauge only reads its configuration, once, at startup. There is no hot reload and no file
  watcher; a change takes effect on restart.
- **BitGauge never writes a file.** Not the config, not a cache, not a log file (logs go to
  stdout/stderr), not a temporary file. It runs with a read-only root filesystem and no volume; the
  config file, if any, is mounted read-only.
- Nothing in the configuration can enable storage of results, because no such feature exists
  ([README.md](README.md#core-invariant)).

## Related

- [Wire protocol](wire-protocol.md)
- [Compatibility layers](compatibility.md)
- [Security model](security.md)
- [Example deployment](deployment-example.md)
- [Configuration loading and security internals](technical-stack/configuration-security.md)
