# BitGauge Behind nginx

nginx terminates TLS for `speed.example.lan` and forwards to BitGauge on port 8080, with request
and response buffering off, on a network with a fixed nginx address, so that address is the only
trusted proxy.

```bash
docker compose up -d
```

The `edge` network takes `172.30.0.0/24`. If that range is in use on the host, pick a free one and
change nginx's `ipv4_address` and `BITGAUGE_SERVER__TRUSTED_PROXIES` to match it.

Before starting it, replace `speed.example.lan` in `bitgauge.conf` and `compose.yaml` with the name
the clients use, and put its certificate and key in `certs/` under the names `bitgauge.conf` gives
them. The `networkQuality` toggle is on: the layer builds its `https` URLs from `public_url`.
Without that layer, `ssl_protocols` may allow `TLSv1.2` as well. The metrics toggle is commented
out, since the endpoint is off by default; the proxy already lets only the Prometheus server,
`192.168.1.20` here, read `/metrics`, so change that address to yours before uncommenting it.

`bitgauge.conf` is the file of
[deployment-example.md §4](../../../docs/features/deployment-example.md#4-nginx), which explains each
setting; `test/deployments` keeps the two identical. `compose.yaml` is the Traefik example's shape
with nginx in Traefik's place.
