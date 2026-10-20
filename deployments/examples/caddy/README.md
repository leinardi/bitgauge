# BitGauge Behind Caddy

Caddy terminates TLS for `speed.example.lan` and forwards to BitGauge on port 8080, on a network
with a fixed Caddy address, so that address is the only trusted proxy.

```bash
docker compose up -d
```

The `edge` network takes `172.30.0.0/24`. If that range is in use on the host, pick a free one and
change Caddy's `ipv4_address` and `BITGAUGE_SERVER__TRUSTED_PROXIES` to match it.

Before starting it, replace `speed.example.lan` in `Caddyfile` and `compose.yaml` with the name the
clients use. Caddy gets a certificate for a public name on its own; for a name only the LAN knows,
give it one in the `tls` block (a certificate and key, or `issuer internal` for Caddy's own CA,
which the clients must then trust). The `networkQuality` toggle is on: the layer builds its
`https` URLs from `public_url`. Without that layer the `tls` block's `protocols` line is optional.
The metrics toggle is commented out, since the endpoint is off by default; the proxy already lets
only the Prometheus server, `192.168.1.20` here, read `/metrics`, so change that address to yours
before uncommenting it.

`Caddyfile` is the file of
[deployment-example.md §3](../../../docs/features/deployment-example.md#3-caddy), which explains each
setting. `compose.yaml` is the Traefik example's shape
with Caddy in Traefik's place.
