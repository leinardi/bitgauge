# Roadmap

[Feature index](README.md) / Roadmap

## 1. MVP Recommendation

Each milestone lists its scope by area and the accuracy harness profiles that must pass before it is
released ([technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness)). The
manual floor and ceiling tiers block every release, so each milestone's acceptance names what those
tiers must additionally show for the features it adds. Progress per feature area is tracked in
[STATUS.md](../STATUS.md).

### 1.1 Version 0.1: Honest Throughput Core

**Backend:**

- Single Go binary with the SPA embedded, base path support and the fixed SPA route list. See
  [architecture.md §1](architecture.md#1-one-binary) and
  [§3](architecture.md#3-spa-embedding-and-base-path).
- Native API: `download`, `upload` with grid-aligned arrival counts and `Server-Timing`, `ping`,
  `small`, `ws` (idle-latency echo) and `info`. See
  [wire-protocol.md §2](wire-protocol.md#2-endpoint-table).
- Per-client stream and request limits with `429` and `Retry-After`. See
  [wire-protocol.md §9](wire-protocol.md#9-rate-limits).
- Client IP through trusted proxies only, and the context label inputs. See
  [security.md §4](security.md#4-client-ip-and-trusted-proxies).
- Security headers and CSP for the SPA. See
  [security.md §5](security.md#5-content-security-policy-and-security-headers).
- koanf configuration with fail-closed validation, read-only and never written. See
  [configuration.md §4](configuration.md#4-fail-closed-validation).
- `healthcheck` subcommand and graceful shutdown. See
  [technical-stack/backend.md §6](technical-stack/backend.md#6-healthcheck-subcommand).

**Engine:**

- Info and idle-latency phases (WebSocket echo with the HTTP fallback), with the info phase always
  running. See [measurement.md §1](measurement.md#1-phases-and-order) and
  [§10](measurement.md#10-idle-latency).
- Adaptive request size, the auto stream ramp, fixed and single stream modes. See
  [measurement.md §3](measurement.md#3-adaptive-request-size) and
  [§4](measurement.md#4-adaptive-stream-count).
- Adaptive duration with the slow-link extension and the data cap. See
  [measurement.md §5](measurement.md#5-adaptive-duration).
- Server-timed upload: confirmed watermark, failure gaps on HTTP/2 and HTTP/3, phase end on the
  first failure over HTTP/1.1, and the grace for in-flight requests (the last three are current
  answers to open questions 4 and 5). See [measurement.md §7](measurement.md#7-upload-mechanics)
  and [open-questions.md](open-questions.md).
- Hybrid warm-up, steady window and the Quick, Standard and Extended presets. See
  [measurement.md §8](measurement.md#8-warm-up-ramp-and-steady-window).
- Steady-window average as the headline, p90 of buckets as "peak", overhead compensation at 0 %.
  See [measurement.md §9](measurement.md#9-final-value).
- Confidence reasons and notices, including `cpu-bound`, and the versioned result object. See
  [measurement.md §16](measurement.md#16-confidence-and-notices) and
  [§17](measurement.md#17-result-object).

**UI:**

- Test screen with live gauge, live chart, phase indicator, data used, result metrics and notices.
  See [ui/screens.md](ui/screens.md).
- Download JSON of the finished result on the Test screen, the harness's extraction path. See
  [ui/screens.md §1](ui/screens.md#1-test-home--) and
  [decisions.md §36](technical-stack/decisions.md#36-v01-harness-extraction--download-json-on-the-test-screen).
- About screen with version, licence and credits (without the compatibility snippets). See
  [ui/screens.md](ui/screens.md).
- URL parameters, including auto-run with the cancellable countdown. See
  [ui/url-params.md](ui/url-params.md).
- English locale through vue-i18n, keyboard operation, live regions and reduced motion. See
  [ui/i18n-a11y.md](ui/i18n-a11y.md).

**Packaging:**

- Multi-stage image on `dhi.io/static`, user 65532, read-only root filesystem, linux/amd64 and
  linux/arm64. See
  [technical-stack/build-packaging.md §1](technical-stack/build-packaging.md#1-container-image).
- CI, release and Dependabot workflows; GHCR with cosign, SBOM and provenance. See
  [technical-stack/build-packaging.md §4](technical-stack/build-packaging.md#4-ci-workflows) and
  [../release.md](../release.md).
- Compose, Traefik, Caddy and nginx examples. See [deployment-example.md](deployment-example.md).

**Acceptance (accuracy harness):**

- CI tier: download and upload headlines within tolerance on 500 kbit/s + 300 ms, 10 Mbit,
  100 Mbit + 50 ms, 1 Gbit, and 100 Mbit + 50 ms through Traefik (h1) and Caddy (h2), on headless
  Chromium, headless Firefox and Playwright WebKit. See
  [technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness).
- Floor tier: 300 kbit/s + 300 ms + 1 % loss and 300 kbit/s + 600 ms report both directions within
  ±15 % (Extended for the 600 ms profile), and the real Android and iOS runs over a VPN complete.
  See [product.md §1.7](product.md#17-success-criteria).
- Ceiling tier: 2.5 and 10 Gbit within ±20 %, with `confidence: cpu-bound` whenever the Worker's
  busy fraction exceeds 90 %. See
  [edge-cases.md §10](edge-cases.md#10-very-fast-links-where-the-browser-cpu-is-the-bottleneck).
- The no-egress check passes on every profile. See
  [security.md §3](security.md#3-no-outbound-calls).

### 1.2 Version 0.2: Latency Under Load and the Browser's History

**Backend:**

- Configurable subnet-to-label mapping for the context label, pending open question 2. See
  [open-questions.md](open-questions.md).
- Prometheus metrics at the configurable root path, off by default. See
  [wire-protocol.md §10](wire-protocol.md#10-get-metrics) and
  [technical-stack/backend.md §7](technical-stack/backend.md#7-prometheus-metric-set).

**Engine:**

- Path A loaded latency over the WebSocket echo, its HTTP fallback with the five-stream
  reservation on HTTP/1.1, and the increase over idle. See
  [measurement.md §11](measurement.md#11-latency-under-load).
- Bufferbloat grade on Waveform's thresholds. See
  [measurement.md §11.3](measurement.md#113-bufferbloat-grade).

**UI:**

- Result detail, history (list, filters, trend chart, compare) in IndexedDB through `idb`, with JSON
  and CSV export and JSON import. See [ui/screens.md](ui/screens.md) and
  [technical-stack/frontend.md §5](technical-stack/frontend.md#5-history-module-idb).
- Settings screen with the shareable settings URL. See [ui/url-params.md](ui/url-params.md).
- Share image and copy summary, rendered in the browser. See
  [technical-stack/frontend.md §6](technical-stack/frontend.md#6-charts-gauge-and-share-image).
- Loaded latency, grade and the related notices on the Test and Result detail screens. See
  [ui/screens.md](ui/screens.md).

**Acceptance (accuracy harness):**

- Everything v0.1 requires, still passing.
- Loaded-latency increase within ±20 % of the netem-added queue delay seen by a concurrent ICMP
  ping over path A on the CI profiles 500 kbit/s + 300 ms, 100 Mbit + 50 ms, and 100 Mbit + 50 ms
  through Traefik (h1) and through Caddy (h2). See
  [technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness).
- HTTP fallback: on the CI profile 100 Mbit + 50 ms through Traefik (h1) with WebSocket upgrades
  blocked, the engine holds the five-stream reservation, labels the samples `http-h1-reserved` and
  grades only with at least 10 samples; the engine's synthetic-timeline scenarios cover the same
  rules. See [measurement.md §11.2](measurement.md#112-path-a-fallback--http-probe) and
  [testing.md §2](technical-stack/testing.md#2-engine-tests-with-synthetic-timelines).
- The grade matches the letter implied by the netem queue delay on those profiles. See
  [measurement.md §11.3](measurement.md#113-bufferbloat-grade).

### 1.3 Version 0.3: Compatibility, Responsiveness and Long Runs

**Backend:**

- OpenSpeedTest, LibreSpeed and networkQuality compatibility layers, each off by default with its
  own toggle. See [compatibility.md](compatibility.md) and
  [configuration.md §2.4](configuration.md#24-compatibility-toggles).

**Engine:**

- Path B HTTP loaded responsiveness with its four states and the TM95 formula. See
  [measurement.md §12](measurement.md#12-http-loaded-responsiveness).
- Quality scores on Cloudflare's AIM tables, with packet loss "not measured". See
  [measurement.md §13](measurement.md#13-quality-scores).
- Continuous mode: one direction (the current answer to open question 6), constant-memory rings,
  last-hour peak, optional run length. See
  [measurement.md §15](measurement.md#15-continuous-mode).

**UI:**

- Continuous preset in Settings and the Continuous flow. See [ui/flows.md](ui/flows.md).
- HTTP loaded responsiveness and quality scores in the result. See [ui/screens.md](ui/screens.md).
- Copyable compatibility snippets on the About screen. See [ui/screens.md](ui/screens.md).

**Acceptance (accuracy harness):**

- Everything v0.2 requires, still passing.
- On 100 Mbit + 50 ms through Caddy (h2), path B is `measured`; through Traefik (h1) it is
  `unavailable_h1`. See [measurement.md §12](measurement.md#12-http-loaded-responsiveness).
- `librespeed-cli --no-icmp`, `goresponsiveness` and a hosted copy of the OpenSpeedTest UI complete
  a test against each enabled layer on the 100 Mbit + 50 ms profile. See
  [compatibility.md](compatibility.md).
- A one-hour Continuous run on the 100 Mbit + 50 ms profile keeps the engine's memory constant from
  the start of the steady window, with all four rings allocated at full length when the run starts.
  An engine test on a synthetic clock covering more than 7 days checks that every ring keeps exactly
  its fixed length and that the saved series follows the tier rule. See
  [measurement.md §15](measurement.md#15-continuous-mode).

### 1.4 Beyond v0.3 — Unscheduled

**Later:**

- Packet loss through WebRTC and a TURN relay, filling the reserved slot. See
  [measurement.md §18](measurement.md#18-future-packet-loss-via-webrtcturn).
- A headless CLI client of the native API for scheduled tests, as an exception to the native
  clients non-goal. See [product.md §1.6](product.md#16-non-goals).
- linux/arm/v7 images for 32-bit Raspberry Pi systems, built on
  `gcr.io/distroless/static-debian12` for that platform only, because `dhi.io/static` has none. See
  [technical-stack/build-packaging.md §2](technical-stack/build-packaging.md#2-platforms).

**Explicitly out of scope:**

- Multi-server selection: no server list and no `server` URL parameter. See
  [product.md §1.6](product.md#16-non-goals).
- Public-internet hosting. See [security.md](security.md).
- Native mobile or desktop clients. See [product.md §1.6](product.md#16-non-goals).
- Telemetry of any kind. See [principles.md §2.4](principles.md#24-no-outbound-calls).

## Related

- [Implementation status](../STATUS.md)
- [Open questions](open-questions.md)
- [Technical decisions](technical-stack/decisions.md)
- [Testing and accuracy harness](technical-stack/testing.md)
