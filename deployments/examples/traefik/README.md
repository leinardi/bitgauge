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
`traefik-dynamic.yaml`). The `networkQuality` toggle stays commented out until v0.3, which ships
the layer: v0.1 rejects it at startup. Without that layer the `tls.options` label is optional.

`compose.yaml` and `traefik-dynamic.yaml` are the files of
[deployment-example.md §2](../../../docs/features/deployment-example.md#2-compose-with-traefik),
which explains each setting; `test/deployments` keeps them identical. A sub-path deployment is in
[§6](../../../docs/features/deployment-example.md#6-sub-path-deployment).
