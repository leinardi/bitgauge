# BitGauge

> A self-hosted, browser-based network speed test for LAN, homelab and VPN links.
>
> **Status: specification phase, no code yet.** This repository holds the complete specification;
> implementation starts once it is approved. Progress per feature area:
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
  hidden overhead factor.
- **Idle and loaded latency** with jitter and a **bufferbloat grade** (A+ to F).
- **HTTP loaded responsiveness** (RPM), honestly labelled where the browser cannot verify it.
- **Quality scores** for streaming, gaming and video calls.
- **Continuous mode** for long runs in constant memory.
- **History in your browser only** (IndexedDB), with compare, JSON and CSV export, and a share
  image.
- **Small and hardened:** non-root static image, read-only root filesystem, no shell, signed
  releases with SBOM and provenance, linux/amd64 and linux/arm64.

## Compatibility

Optional layers, each off by default, let existing clients test against BitGauge
([details](docs/features/compatibility.md)):

- the **OpenSpeedTest** web UI, through its `?Host=` parameter;
- **LibreSpeed** clients: the web UI, `librespeed-cli` and self-built Android apps;
- Apple's **`networkQuality`** and `goresponsiveness`.

## Deploy

```yaml
services:
  bitgauge:
    image: ghcr.io/leinardi/bitgauge:0
    ports:
      - "8080:8080"
    read_only: true
    restart: unless-stopped
```

Put it behind your reverse proxy for TLS and HTTP/2. Traefik, Caddy and nginx examples and the
proxy requirements are in
[docs/features/deployment-example.md](docs/features/deployment-example.md).
No image is published until the first release.

## Documentation

- [Documentation index](docs/README.md): how the doc trees fit together.
- [Summary](docs/features/summary.md): the TL;DR.
- [Feature specification](docs/features/README.md): product, measurement, protocol, architecture.
- [Measurement methodology](docs/features/measurement.md): how every number is produced.
- [Roadmap](docs/features/roadmap.md) and [implementation status](docs/STATUS.md).
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md).

## Credits

BitGauge copies no code or assets from the projects below; it learns from their documented
behaviour and implements their wire protocols for compatibility
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
