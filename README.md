# BitGauge

> A self-hosted, browser-based network speed test for LAN, homelab and VPN links.
>
> **Status: implemented, not yet released.** The specification was approved on 2026-10-12 and the
> product is built against it; the first release waits for its manual accuracy runs and release
> setup ([docs/release.md](docs/release.md)). Status per feature area:
> [docs/STATUS.md](docs/STATUS.md).

BitGauge measures the link between a browser and a server you run yourself: a NAS on the LAN, a
homelab box behind Wi-Fi, or your home server reached over a VPN from a phone. It is built to give
honest numbers across the whole range those links span, from well under 1 Mbit/s on mobile over
VPN to multi-Gbit LAN. It ships as one container image: a stateless Go binary with an embedded Vue
web app. **The server never stores a result and never calls out.**

One method has to hold up across that whole range: request sizes and stream counts adapt to the
link, and upload is timed where the bytes arrive
([why](docs/features/product.md#14-the-problem)).

## Features

- **Adaptive request size and streams.** Requests are sized to take about 1 s at the observed
  rate, and the stream count ramps only while it gains throughput.
- **Server-timed upload.** The server counts the bytes it receives on a 100 ms grid, so upload is
  never inflated by send buffers.
- **Steady-window headline.** Bytes ÷ time after a measured warm-up; peak reported separately; no
  hidden overhead factor; every number with its confidence and notices.
- **Idle latency** with jitter, and **Quick, Standard and Extended** presets.
- **One-result JSON download** from the Test screen; nothing is stored on the server.
- **Loaded latency** during download and upload, with a **bufferbloat grade** (A+ to F).
- **History in your browser only** (IndexedDB) with a Result detail, compare, and JSON and CSV
  export and import.
- **Settings** stored in the browser, with a shareable settings link; a **share image** and a
  copied text summary.
- **Prometheus metrics** (off by default) and operator **subnet-to-label** mapping.
- **HTTP loaded responsiveness** (RPM), honestly labeled where the browser cannot verify it.
- **Quality scores** for streaming, gaming and video calls.
- **Continuous mode** for long runs in constant memory.
- **Small and hardened:** non-root static image, read-only root filesystem, no shell, signed
  releases with SBOM and provenance, linux/amd64 and linux/arm64.

## Compatibility

Optional layers, each off by default, let existing clients test against BitGauge
([details](docs/features/compatibility.md)):

- the **OpenSpeedTest** web UI, through its `?Host=` parameter;
- **LibreSpeed** clients: the web UI, `librespeed-cli` and self-built Android apps;
- Apple's **`networkQuality`** and `goresponsiveness`.

## Deploy

BitGauge alone on port 8080, from
[`deployments/examples/compose-alone/compose.yaml`](deployments/examples/compose-alone/compose.yaml):

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
      # Uncomment to serve /metrics.
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

Put it behind your reverse proxy for TLS and HTTP/2: runnable
[Traefik](deployments/examples/traefik/README.md), [Caddy](deployments/examples/caddy/README.md)
and [nginx](deployments/examples/nginx/README.md) examples sit beside it, and the proxy
requirements are in [docs/features/deployment-example.md](docs/features/deployment-example.md).
No image is published until the first release; verify one before you trust it with the commands
in [SECURITY.md](SECURITY.md#verifying-a-release).

## Documentation

- [Documentation index](docs/README.md): how the doc trees fit together.
- [Summary](docs/features/summary.md): the TL;DR.
- [Feature specification](docs/features/README.md): product, measurement, protocol, architecture.
- [Measurement methodology](docs/features/measurement.md): how every number is produced.
- [Roadmap](docs/features/roadmap.md) and [implementation status](docs/STATUS.md).
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md).

## Credits

BitGauge copies no code or assets from the projects below; it learns from their documented
behavior and implements their wire protocols for compatibility
([research](docs/research/README.md)).

- **OpenSpeedTest**, for its self-hosted model and its web UI, supported through a compatibility
  layer.
- **LibreSpeed**, for its self-hosted clients and documented overhead factors.
- **Cloudflare**, for its open-source speed test and the AIM quality-score tables.
- **Apple** and the **IETF IPPM working group**, for `networkQuality` and the "Responsiveness under
  Working Conditions" draft.
- **M-Lab**, for the ndt7 protocol, and **Waveform**, for the bufferbloat grade thresholds.

BitGauge is an independent project, not affiliated with or endorsed by any of the projects or
companies named in this repository. OpenSpeedTest™ and the other product names are trademarks of
their owners and are used only to identify those products and describe compatibility.

## License

[GPL-3.0-or-later](LICENSE).
