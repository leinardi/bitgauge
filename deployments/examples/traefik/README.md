# BitGauge Behind Traefik

Traefik v3 terminates TLS for `speed.example.lan` and forwards to BitGauge on port 8080, on a
network with a fixed Traefik address, so that address is the only trusted proxy.

```bash
docker compose up -d
```

The `edge` network takes `172.30.0.0/24`. If that range is in use on the host, pick a free one and
change Traefik's `ipv4_address` and `BITGAUGE_SERVER__TRUSTED_PROXIES` to match it.

Before starting it, replace `speed.example.lan` in `compose.yaml` with the name the clients use, and
give Traefik a certificate for it (a certificate resolver, or a certificate in
`traefik-dynamic.yaml`). The `networkQuality` toggle is on: the layer builds its `https` URLs from
`public_url`. Without that layer the two `tls.options` labels are optional, dropped together. The
metrics toggle is commented out, since the endpoint is off by default; the proxy already lets only
the Prometheus server, `192.168.1.20` here, read `/metrics`, so change that address to yours before
uncommenting it.

`compose.yaml` and `traefik-dynamic.yaml` are the files of
[deployment-example.md §2](../../../docs/features/deployment-example.md#2-compose-with-traefik),
which explains each setting. A sub-path deployment is in
[§6](../../../docs/features/deployment-example.md#6-sub-path-deployment).
