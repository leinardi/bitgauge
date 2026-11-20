# Product

[Feature index](README.md) / Product

## 1. Product Identity

### 1.1 Name

BitGauge

### 1.2 Tagline

> An honest, self-hosted speed test for LAN, homelab and VPN links.

### 1.3 Longer Description

BitGauge is a single self-hosted binary that serves a browser-based network speed test. It
measures download, upload, idle latency, latency under load, bufferbloat, HTTP loaded
responsiveness and quality scores between a browser and the BitGauge server, and it stays accurate
from a few hundred kbit/s on mobile over VPN up to multi-Gbit LAN. The server is stateless: it
never stores a result and never calls out. Results and history live only in the browser that ran
the test.

### 1.4 The Problem

The links a homelab speed test serves span four orders of magnitude, from a few hundred kbit/s on
a phone over VPN to multi-Gbit on a wired LAN. One method has to hold up across all of them:

- **Slow links.** A fixed request size that suits a fast LAN is far too large for a slow link: at
  500 kbit/s a 30 MiB request takes about eight minutes, so no request completes within a test.
- **Upload.** OS, VPN and modem send buffers hold seconds of data at low speeds, so bytes counted
  when the browser hands them over can be far ahead of the bytes that have reached the server.
- **Overhead.** Converting goodput to an estimated wire rate needs an assumption about headers and
  framing; a result is only honest when that assumption is visible next to the number.
- **Fast links.** Multi-gigabit rates need a scale that does not top out at 1 Gbit/s and a warm-up
  that ends when the rate settles, not at a fixed instant.
- **Latency under load.** Bufferbloat, the main quality problem on home and mobile links, only
  shows while the link is loaded, so idle latency alone does not describe it.

### 1.5 Target Users and Environments

- **Homelab operators** who want a speed test endpoint next to their other self-hosted services,
  deployed behind the reverse proxy they already run (Traefik, Caddy or nginx).
- **Mobile over VPN** is the main case: a phone on cellular data connected through WireGuard or a
  similar VPN to the home network, at speeds that can be well under 1 Mbit/s with RTTs of 300 ms
  or more.
- **LAN and Wi-Fi checks** inside the home or office, from 100 Mbit/s to multi-Gbit wired links
  (2.5 Gbit and 10 Gbit included).
- **Scheduled CLI checks** with existing third-party clients (`librespeed-cli`, Apple
  `networkQuality`) through the optional [compatibility layers](compatibility.md).

Supported browsers are current Chromium-based browsers, Firefox and Safari on desktop and iOS.
Supported server platforms are linux/amd64 and linux/arm64, which covers Raspberry Pi 3, 3B+, 4, 5
and Zero 2 W on a 64-bit OS.

### 1.6 Non-Goals

- **Public internet hosting.** BitGauge is not hardened or sized for anonymous traffic from the
  internet; see the [security model](security.md).
- **Multi-tenant hosting.** One deployment serves one trust domain; there are no accounts, users or
  tenants.
- **Native clients.** No mobile or desktop app for now; the browser is the client. Third-party CLI
  clients work through the compatibility layers.
- **ISP or geolocation lookups.** BitGauge never resolves who owns an IP address or where it is.
- **Telemetry.** Nothing is ever sent to the project or to any third party.
- **Ads.** None.
- **Multi-server selection.** Choosing among several BitGauge instances by lowest latency is
  dropped entirely: there is no server list and no `server` URL parameter. A test always runs
  against the server that served the page.
- **Server-side result storage.** Results never reach the server; see the
  [core invariant](README.md#core-invariant).

### 1.7 Success Criteria

BitGauge is successful when its headline numbers agree with the iperf3 reference on the accuracy
harness profiles defined in
[technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness): the mean of iperf3
runs taken just before and just after the browser run on a stable profile
([decisions.md §35](technical-stack/decisions.md#35-accuracy-harness-reference--iperf3-before-and-after-the-browser-run)):

| Profile | Throughput tolerance (headline vs the iperf3 reference) |
| --- | --- |
| ≤ 1 Mbit/s (including 300 kbit/s + 600 ms RTT) | ±15 % |
| 10 Mbit/s to 100 Mbit/s | ±10 % |
| 1 Gbit/s | ±10 % |
| ≥ 2.5 Gbit/s | ±20 %, reported with `confidence: cpu-bound` when the Worker is the limit |

- The loaded-latency increase agrees within ±20 % with the netem-added queue delay observed by a
  concurrent ICMP ping.
- A Standard test on a 300 kbit/s, 300 ms link produces a download and an upload number within the
  preset's time budget, instead of failing to complete a request.
- No number is ever presented without the conditions that qualify it: low confidence, partial
  results and insufficient data are shown as such, never hidden.

### 1.8 Positioning

| Tool | What it is good at | How BitGauge relates to it |
| --- | --- | --- |
| OpenSpeedTest | Simple self-hosted image, familiar UI | Same self-hosted, single-container model with its own measurement method; a compatibility layer lets its web UI run against BitGauge. |
| LibreSpeed | Self-hosted, many backends, CLI and Android clients | Its documented overhead factors are offered as presets; a compatibility layer serves its clients. |
| Cloudflare speed test | Adaptive request sizes, `Server-Timing`, loaded latency, AIM scores | Measures against Cloudflare's network; BitGauge measures against a host you run, and adopts its request-size ramp and AIM tables. |
| Apple networkQuality | RPM methodology from the IETF responsiveness draft | BitGauge serves its protocol through a compatibility layer and offers a browser-feasible subset. |

## Related

- [Guiding principles](principles.md)
- [Measurement methodology](measurement.md)
- [Prior-art summary](../research/prior-art-summary.md)
- [Later and open items](README.md#later-and-open-items)
