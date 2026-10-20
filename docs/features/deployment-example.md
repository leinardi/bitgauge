# Deployment Example

[Feature index](README.md) / Deployment Example

BitGauge is one container that speaks plain HTTP on port 8080. Behind a reverse proxy it gets TLS,
HTTP/2 and a hostname. This page shows the shapes that work and the proxy settings that matter for
accurate numbers. Image tags, signing and platforms are described in
[release.md](../release.md); configuration keys in [configuration.md](configuration.md).

## 1. Compose, BitGauge Alone

For a LAN-only test endpoint without a proxy (plain HTTP; the SPA works, networkQuality does not),
shipped as [`deployments/examples/compose-alone/compose.yaml`](../../deployments/examples/compose-alone/compose.yaml):

```yaml
services:
  bitgauge:
    image: ghcr.io/leinardi/bitgauge:0
    ports:
      - "8080:8080"
    read_only: true # BitGauge writes nothing
    user: "65532:65532" # already the image default; stated for clarity
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    environment:
      BITGAUGE_SERVER__DISPLAY_NAME: home
      # From v0.2, which ships the Prometheus endpoint; v0.1 rejects the toggle and exits 2.
      # With no proxy to restrict it, anyone who reaches port 8080 can read /metrics.
      # BITGAUGE_METRICS__ENABLED: "true"
    # Optional: full configuration as a read-only file
    # volumes:
    #   - ./bitgauge.yaml:/etc/bitgauge/config.yaml:ro
    healthcheck:
      test: ["CMD", "/bitgauge", "healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    restart: unless-stopped
```

- **Read-only root filesystem** (`read_only: true`) and no volume: BitGauge never writes a file
  ([configuration.md §5](configuration.md#5-read-only-configuration-and-the-no-write-guarantee)).
  No `tmpfs` is needed.
- **Healthcheck.** `bitgauge healthcheck` loads the same configuration (file and environment),
  requests `/api/v1/ping` under the base path on the address `server.listen` binds (`127.0.0.1` for
  the default `:8080`), for example `http://127.0.0.1:8080/api/v1/ping` with `base_path: /` or
  `http://127.0.0.1:8080/speed/api/v1/ping` with `base_path: /speed`, with a 3 s timeout, and exits
  `0` on `204`, `1` otherwise ([technical-stack/backend.md
  §6](technical-stack/backend.md#6-healthcheck-subcommand)). The image has no shell or `curl`, so
  the exec form above is required.
- Without a proxy, `trusted_proxies` stays empty and the client IP is the TCP peer.
- **Metrics from v0.2.** The Prometheus endpoint ships in v0.2
  ([roadmap.md §1.2](roadmap.md#12-version-02-latency-under-load-and-the-browsers-history)); its
  toggle stays commented out until v0.2 is released, because v0.1 rejects it and exits with status
  2 ([configuration.md §4](configuration.md#4-fail-closed-validation)), and is uncommented in the
  page and the examples together then. The endpoint is unauthenticated
  ([configuration.md §2.6](configuration.md#26-metrics)): with no proxy in front, anyone who reaches
  port 8080 can read it, and BitGauge logs a warning at startup. The proxy examples below let only
  the Prometheus server read it.

## 2. Compose With Traefik

Traefik v3 terminating TLS, with BitGauge on a dedicated network so the trusted proxy address is
known, shipped as [`deployments/examples/traefik/compose.yaml`](../../deployments/examples/traefik/compose.yaml):

```yaml
networks:
  edge:
    ipam:
      config:
        - subnet: 172.30.0.0/24

services:
  traefik:
    image: traefik:v3
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.file.filename=/etc/traefik/dynamic.yaml
      - --entrypoints.websecure.address=:443
      - --entrypoints.websecure.http3=true
      # The v3 default readTimeout of 60s would cut long uploads; stay above the 120 s lifetime.
      - --entrypoints.websecure.transport.respondingTimeouts.readTimeout=180s
    ports:
      - "443:443/tcp"
      - "443:443/udp"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik-dynamic.yaml:/etc/traefik/dynamic.yaml:ro
    networks:
      edge:
        ipv4_address: 172.30.0.2

  bitgauge:
    image: ghcr.io/leinardi/bitgauge:0
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    environment:
      BITGAUGE_SERVER__DISPLAY_NAME: home
      BITGAUGE_SERVER__PUBLIC_URL: https://speed.example.lan
      BITGAUGE_SERVER__TRUSTED_PROXIES: 172.30.0.2/32
      # From v0.3, which ships the networkQuality layer; an earlier release rejects it and exits 2.
      BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED: "true"
      # From v0.2, which ships the Prometheus endpoint; v0.1 rejects the toggle and exits 2.
      # The proxy lets only the Prometheus server read /metrics.
      # BITGAUGE_METRICS__ENABLED: "true"
    healthcheck:
      test: ["CMD", "/bitgauge", "healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks: [edge]
    labels:
      traefik.enable: "true"
      traefik.http.routers.bitgauge.rule: Host(`speed.example.lan`)
      traefik.http.routers.bitgauge.entrypoints: websecure
      traefik.http.routers.bitgauge.tls: "true"
      # TLS 1.3 is only needed for the networkQuality layer; drop this line otherwise, and the
      # metrics router's tls.options with it: both routers of a host take the same TLS options.
      traefik.http.routers.bitgauge.tls.options: tls13@file
      traefik.http.services.bitgauge.loadbalancer.server.port: "8080"
      # Do NOT attach the buffering or compress middlewares to this router.
      # /metrics only for the Prometheus server (192.168.1.20 here); anyone else gets a 403.
      traefik.http.routers.bitgauge-metrics.rule: Host(`speed.example.lan`) && Path(`/metrics`)
      traefik.http.routers.bitgauge-metrics.entrypoints: websecure
      traefik.http.routers.bitgauge-metrics.tls: "true"
      traefik.http.routers.bitgauge-metrics.tls.options: tls13@file
      traefik.http.routers.bitgauge-metrics.service: bitgauge
      traefik.http.routers.bitgauge-metrics.middlewares: bitgauge-metrics-allow
      traefik.http.middlewares.bitgauge-metrics-allow.ipallowlist.sourcerange: 192.168.1.20/32
```

[`deployments/examples/traefik/traefik-dynamic.yaml`](../../deployments/examples/traefik/traefik-dynamic.yaml):

```yaml
tls:
  options:
    tls13:
      minVersion: VersionTLS13
```

- **Buffering off.** Traefik streams request and response bodies unless a `buffering` middleware is
  attached; do not attach one. If one is needed for other routes, keep it off this router.
- **Body limits.** Traefik has no body limit by default; BitGauge enforces its own caps.
- **WebSocket.** Traefik proxies upgrades automatically.
- **HTTP/2 and TLS 1.3.** Traefik negotiates HTTP/2 over TLS automatically; the `tls13` option
  enforces TLS 1.3, which `networkQuality` requires.
- **Trusted proxy.** The fixed Traefik address is the only entry in `trusted_proxies`, so forwarding
  headers from anything else are ignored ([security.md
  §4](security.md#4-client-ip-and-trusted-proxies)).
- **networkQuality from v0.3.** The layer ships in v0.3 ([roadmap.md
  §1.3](roadmap.md#13-version-03-compatibility-responsiveness-and-long-runs)), and its toggle is
  on: it builds its `https` URLs from `public_url`, which the example sets, and needs the TLS 1.3
  option. A release before v0.3 rejects the toggle and exits with status 2 ([configuration.md
  §4](configuration.md#4-fail-closed-validation)), so drop the line to run one.
- **Metrics for the scraper only.** A second router takes `/metrics` on the same host, its rule
  longer and so of higher priority than the first, and its `ipAllowList` middleware answers `403`
  to every address but the Prometheus server's (`192.168.1.20` here; use yours). It carries the
  same TLS options as the first router: Traefik serves a host whose routers disagree on them with
  its default options instead, which would drop the TLS 1.3 minimum. The metrics toggle itself
  stays commented out until v0.2 is released (§1); until then the Prometheus server gets
  BitGauge's `404` there and everyone else the `403`.

## 3. Caddy

[`deployments/examples/caddy/Caddyfile`](../../deployments/examples/caddy/Caddyfile):

```text
speed.example.lan {
	# TLS 1.3 only; needed for the networkQuality layer, optional otherwise.
	tls {
		protocols tls1.3
	}

	# Let BitGauge enforce its own body caps (Caddy has no limit unless one is set).
	# If a limit is required here, keep it above compat.networkquality.max_upload_bytes:
	# request_body {
	# 	max_size 2GB
	# }

	# /metrics only for the Prometheus server (192.168.1.20 here); anyone else gets a 403.
	@metrics_others {
		path /metrics
		not remote_ip 192.168.1.20/32
	}
	respond @metrics_others 403

	reverse_proxy bitgauge:8080 {
		flush_interval -1      # stream responses immediately (no response buffering)
	}
	# Do not enable `encode` for this site.
}
```

- Caddy streams request bodies by default (no request buffering) and proxies WebSockets
  automatically; it negotiates HTTP/2 and HTTP/3 by default.
- Set `trusted_proxies` to the Caddy container's address, and `public_url` if networkQuality is
  enabled.
- The `@metrics_others` matcher answers `403` to `/metrics` for every address but the Prometheus
  server's (`192.168.1.20` here; use yours); `respond` runs before `reverse_proxy` in Caddy's
  directive order. The metrics toggle stays commented out until v0.2 is released (§1).
- The shipped compose file runs it with BitGauge in the shape of §2:
  [`deployments/examples/caddy/compose.yaml`](../../deployments/examples/caddy/compose.yaml).

## 4. nginx

[`deployments/examples/nginx/bitgauge.conf`](../../deployments/examples/nginx/bitgauge.conf):

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}

# Refuse TLS for any name other than BitGauge's (also defeats DNS rebinding).
server {
    listen 443 ssl default_server;
    ssl_reject_handshake on;
}

server {
    listen 443 ssl;
    http2 on;
    server_name speed.example.lan;

    ssl_certificate     /etc/nginx/certs/speed.example.lan.pem;
    ssl_certificate_key /etc/nginx/certs/speed.example.lan-key.pem;
    ssl_protocols TLSv1.3;              # TLSv1.2 TLSv1.3 if networkQuality is not used

    client_max_body_size 0;             # BitGauge enforces its own caps
    gzip off;                           # never compress BitGauge's responses

    # /metrics only for the Prometheus server (192.168.1.20 here); anyone else gets a 403.
    location = /metrics {
        allow 192.168.1.20;
        deny all;
        proxy_pass http://bitgauge:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://bitgauge:8080;
        proxy_http_version 1.1;
        proxy_request_buffering off;    # upload bodies must stream to BitGauge
        proxy_buffering off;            # download bodies must stream to the browser
        proxy_read_timeout 180s;        # above the 120 s upload lifetime
        proxy_send_timeout 180s;
        proxy_set_header Host $http_host;         # keeps a non-default port for the Origin check
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

nginx buffers request bodies by default, which is the most common cause of distorted upload
numbers ([edge-cases.md §4](edge-cases.md#4-proxy-buffering-that-distorts-upload)).
The exact `location = /metrics` takes precedence over `location /` and lets only the Prometheus
server (`192.168.1.20` here; use yours) read the metrics; every other address gets `403`. The
metrics toggle stays commented out until v0.2 is released (§1).
The shipped compose file runs it with BitGauge in the shape of §2:
[`deployments/examples/nginx/compose.yaml`](../../deployments/examples/nginx/compose.yaml).

## 5. Proxy Requirements Checklist

- [ ] **Request buffering off** on upload paths (`/api/v1/upload`, `/upload`, `/empty`,
      `/nq/upload`), or everywhere.
- [ ] **Response buffering off** for downloads (`/api/v1/download`, `/downloading`, `/garbage`,
      `/nq/large`).
- [ ] **Body limit** at least `limits.max_upload_bytes` (256 MiB), and at least
      `compat.networkquality.max_upload_bytes` when that layer is on; or no proxy limit at all.
- [ ] **No response compression** on BitGauge's routes.
- [ ] **WebSocket upgrade** forwarded for `/api/v1/ws` (`Upgrade`, `Connection` headers).
- [ ] **Read timeouts above 120 s** (the upload lifetime).
- [ ] **Forwarding headers** set (`X-Forwarded-For`, `X-Forwarded-Proto`, `Host`) and the proxy's
      address in `server.trusted_proxies`; otherwise every client shares the proxy's address and
      its rate limits.
- [ ] **No prefix stripping** when using a sub-path (§6).
- [ ] **`/metrics` restricted** to the Prometheus server when `metrics.enabled` is on: the endpoint
      has no authentication and no rate limit.
- [ ] **HTTP/2 and TLS 1.3** only if the networkQuality layer is enabled. For the SPA, HTTP/2 is
      optional: it enables path B (HTTP loaded responsiveness), but on high-RTT or lossy links
      HTTP/1.1 may measure higher throughput, because six HTTP/1.1 connections spread loss across
      six congestion windows while HTTP/2 shares one
      ([edge-cases.md §12](edge-cases.md#12-http2-single-connection-vs-multi-connection-ramp)).
      Firefox clients are another reason to keep HTTP/1.1 for the test endpoints: Firefox before
      115 uploads slowly over HTTP/2, and its HTTP/3 uploads are still slower than its HTTP/1.1
      ones ([research/browser-upload-limits.md](../research/browser-upload-limits.md)).
- [ ] **`public_url`** set (or forwarding headers from a trusted proxy) if networkQuality is used;
      recommended for the LibreSpeed server list, which otherwise falls back to the request's
      `Host` ([compatibility.md §6](compatibility.md#6-rules-every-layer-shares)).

## 6. Sub-Path Deployment

To serve BitGauge at `https://home.example.lan/speed`:

```yaml
environment:
  BITGAUGE_SERVER__BASE_PATH: /speed
labels:
  traefik.http.routers.bitgauge.rule: Host(`home.example.lan`) && PathPrefix(`/speed`)
  # No StripPrefix middleware: BitGauge routes on the full path.
```

- Every route moves under the base path: `/speed/`, `/speed/api/v1/…`, `/speed/metrics`,
  `/speed/nq/config`, `/speed/upload`.
- The healthcheck uses the configured base path automatically.
- A proxy restriction on the metrics endpoint (§2 to §4) then matches `/speed/metrics`.
- Draft-style networkQuality discovery at the host root (`/.well-known/nq`) then needs a separate
  proxy rule; `networkQuality -C https://home.example.lan/speed/nq/config` works without one.
- Do not strip the prefix. A stripped prefix gives a `404` (an instance configured for `/speed`)
  or a blank page whose assets the proxy does not forward (an instance configured for `/`); a
  mismatched base path whose page and assets still load shows the base-path error screen
  ([edge-cases.md §20](edge-cases.md#20-base-path-mismatches)).

## 7. Raspberry Pi and arm64

- The image is published for linux/amd64 and linux/arm64. On a Raspberry Pi, use a **64-bit OS**;
  arm64 covers Raspberry Pi 3, 3B+, 4, 5 and Zero 2 W. 32-bit (armv7) images are not published; a
  later armv7 build is on the roadmap ([roadmap.md](roadmap.md)).
- The Pi itself can be the bottleneck. The Pi 3B has 100 Mbit/s Ethernet; the Pi 3B+ has Gigabit
  Ethernet behind USB 2.0 (roughly 300 Mbit/s in practice); the Zero 2 W has only Wi-Fi; the Pi 4
  and 5 have full Gigabit Ethernet. A test against a Pi measures the path to the Pi, including its
  NIC and CPU; compare with iperf3 on the same device to tell the two apart.
- BitGauge's server is light (no database, no disk I/O), but at Gbit rates its CPU use is real;
  watch the Prometheus process metrics if enabled.

## Related

- [Configuration](configuration.md)
- [Compatibility layers](compatibility.md)
- [Edge cases](edge-cases.md)
- [Security model](security.md)
- [Build and packaging](technical-stack/build-packaging.md)
- [Release process](../release.md)
