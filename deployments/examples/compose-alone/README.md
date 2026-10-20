# BitGauge Alone

BitGauge on its own, published on port 8080 over plain HTTP: a LAN-only test endpoint without a
proxy. The browser test works; Apple's `networkQuality` does not, since it needs HTTP/2 over TLS
1.3 from a reverse proxy.

```bash
docker compose up -d
```

Then open `http://<host>:8080/`. `compose.yaml` is the file of
[deployment-example.md §1](../../../docs/features/deployment-example.md#1-compose-bitgauge-alone),
which explains each setting.
