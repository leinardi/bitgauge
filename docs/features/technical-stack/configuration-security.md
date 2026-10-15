# Configuration and Security Internals

[Feature index](../README.md) / [Technical Stack](README.md) / Configuration and Security

How the planned `internal/config`, security-header, `internal/clientip` and `internal/ratelimit`
packages implement [../configuration.md](../configuration.md) and [../security.md](../security.md).

## 1. Loading Order

`internal/config` builds one koanf instance in three layers, each overriding only the keys it sets:

1. **Defaults**: a Go struct of default values, loaded with koanf's struct provider.
2. **File**: `/etc/bitgauge/config.yaml`, or the `--config` path, through the file provider and the
   YAML parser. A missing default path is skipped; a missing explicit path is an error.
3. **Environment**: the env provider with prefix `BITGAUGE_` and a transform that keeps only
   variables containing `__`, strips the prefix, lowercases the rest and replaces `__` with `.`.
   Single underscores stay inside key names. Comma-separated values become lists for list keys.

The merged map is decoded into the configuration struct with every unknown key, null and value
that does not parse collected as an error of its own (unknown keys from the decoder's metadata of
unused keys), then validated.

**Env mapping examples:**

| Variable | Key | Value |
| --- | --- | --- |
| `BITGAUGE_SERVER__LISTEN=:9090` | `server.listen` | `:9090` |
| `BITGAUGE_SERVER__TRUSTED_PROXIES=172.30.0.2/32,fd00::2/128` | `server.trusted_proxies` | two CIDRs |
| `BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=512MiB` | `limits.max_upload_bytes` | 536 870 912 |
| `BITGAUGE_TEST_DEFAULTS__STREAMS__MAX=4` | `test_defaults.streams.max` | `4` |
| `BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true` | `compat.networkquality.enabled` | `true` |
| `BITGAUGE_PORT=tcp://10.43.0.12:8080` (Kubernetes service link) | none | ignored, no `__` |

## 2. Fail-Closed Validation

- Validation runs over the whole decoded configuration and **collects every error** before
  reporting, so one run shows all problems.
- Each error is one log line with `key`, `value` and `rule` attributes; then the process exits with
  status 2 before opening the listener. If `log.*` itself is invalid, errors are printed as text to
  stderr.
- Nothing is corrected silently: no clamping, no fallback to a default for an invalid value.
- The rules are those of [../configuration.md §4](../configuration.md#4-fail-closed-validation),
  including the route-collision check for `metrics.path`, which reuses the router's own route list.
- Warnings (valid but suspicious settings) are logged at `warn` and do not stop startup.

## 3. Security Headers Middleware

One middleware sets headers by route group:

| Group | Headers |
| --- | --- |
| SPA (`index.html`, `/assets/*`, the eight root assets of [../architecture.md §3](../architecture.md#3-spa-embedding-and-base-path)) | `Content-Security-Policy` (with `ws://<host> wss://<host>` from the request's `Host`), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` |
| Native API, compatibility layers, `/metrics` | `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; CORS headers per group ([backend.md §3](backend.md#3-middleware-chain-order)) |

The exact header values are in [../security.md
§5](../security.md#5-content-security-policy-and-security-headers). The CSP is a constant except for
the host, which is validated as a hostname (with optional port) before use; an invalid `Host` gets a
CSP without the `ws:`/`wss:` sources.

## 4. Trusted Proxies and Client IP Derivation

Inputs: the TCP peer address and the request's `X-Forwarded-For` header lines.

```text
peer := address of the TCP peer (port and IPv6 zone removed, ::ffff:a.b.c.d → a.b.c.d)
if peer is not inside any server.trusted_proxies CIDR:
    return peer
entries := all X-Forwarded-For header lines joined with ",", split on ",", whitespace trimmed
for entry in entries, from right to left:
    addr := parse entry as an IP address (normalized as above)
    if parsing fails:
        return peer                      # malformed chain: fail closed to the proxy's address
    if addr is not inside any trusted_proxies CIDR:
        return addr                      # first untrusted hop from the right is the client
return leftmost parsed entry, or peer if there were no entries
```

- Only `X-Forwarded-For` is read. `X-Real-IP`, `Client-IP`, `CF-Connecting-IP`,
  `CF-Connecting-IPv6` and `Forwarded` are ignored, because common proxies pass client-supplied
  values of them through ([../security.md §4](../security.md#4-client-ip-and-trusted-proxies)).
- The derived address is computed once per request in middleware and stored in the context; every
  consumer (limiter, `/info`, `/getIP`, debug logs) uses the same value.
- URL construction for networkQuality and the LibreSpeed server list reads `X-Forwarded-Proto`
  and `Host`/`X-Forwarded-Host` only under the same trusted-peer condition
  ([../compatibility.md §3.3](../compatibility.md#33-absolute-url-construction)).

## 5. Bounded Rate Limiter

- **Key:** the derived client IP (full address, IPv4 or IPv6). Keying IPv6 by `/64` was rejected:
  on a LAN every SLAAC host shares one `/64` and would share one budget.
- **Entry:** active throughput requests, a token bucket for new throughput requests (refill
  `requests_per_minute / 60` per second, burst `max(60, requests_per_minute / 4)`), open WebSocket
  count, active networkQuality flows, last-seen time.
- **Table:** a map plus an LRU list, at most `limits.tracked_clients` entries. Entries with no
  active request, WebSocket or flow are evictable; the least recently seen evictable entry is
  removed when a new client arrives at a full table. Entries with active work are never evicted, so
  their counters cannot be lost; if every entry is active, the new client is refused with `429`
  (`table_full` in metrics) and a `warn` log line, failing closed.
- **Release:** counters are decremented in `defer` when a request, WebSocket or flow ends, so an
  aborted transfer always frees its slot.
- **Concurrency:** one mutex around the map and list; each operation is constant time. At expected
  request rates (≈ 10 per second per active client) contention is negligible.
- `429` responses carry `Retry-After` in whole seconds, rounded up and at least 1: 1 s for
  concurrency limits and `table_full`, and the time until the next token, rounded up, for the rate
  limit ([../wire-protocol.md §9](../wire-protocol.md#9-rate-limits)).

## 6. What Is Logged and Never Logged

**Logged** (stdout/stderr, `log.format`):

- At `info`: startup (version, listen address, base path, enabled layers, metrics on/off), the
  effective configuration (no value in BitGauge's configuration is secret), shutdown.
- At `warn`: suspicious configuration, rate-limit table full, panics recovered.
- At `error`: listener failures, unexpected handler errors.
- At `debug` only: one line per request with method, route pattern, status, bytes, duration and
  derived client IP; WebSocket open and close.

**Never logged**, at any level:

- Request or response bodies, upload data, WebSocket message contents.
- Request headers, including `User-Agent`, `Referer`, cookies and forwarding headers.
- Query strings beyond the route pattern (the `bytes` value appears only as the byte count).
- Results: the server never receives one.

No log file is ever written ([../configuration.md
§5](../configuration.md#5-read-only-configuration-and-the-no-write-guarantee)).

## Related

- [Configuration](../configuration.md)
- [Security model](../security.md)
- [Backend design](backend.md)
- [Wire protocol](../wire-protocol.md)
