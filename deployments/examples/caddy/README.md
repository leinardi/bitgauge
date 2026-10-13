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
which the clients must then trust). The `networkQuality` toggle stays commented out until v0.3,
which ships the layer: v0.1 rejects it at startup. Without that layer the `tls` block's `protocols`
line is optional.

`Caddyfile` is the file of
[deployment-example.md §3](../../../docs/features/deployment-example.md#3-caddy), which explains each
setting; `test/deployments` keeps the two identical. `compose.yaml` is the Traefik example's shape
with Caddy in Traefik's place.
