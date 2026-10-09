# Testing Strategy

[Feature index](../README.md) / [Technical Stack](README.md) / Testing

BitGauge's product is its methodology, so most of the testing effort goes into proving the numbers:
deterministic engine tests with synthetic timelines, and an accuracy harness that compares real
browser runs with iperf3 over shaped links. Everything here is planned.

## 1. Go Handler Tests

Table-driven `net/http/httptest` tests per package, run with `go test -race ./...`:

- **download:** exact byte count and `Content-Length`; no `Content-Encoding`; `no-store`; `400` for
  missing, zero, negative, non-integer and over-cap `bytes`; buffer wrap-around; no allocation per
  request (`testing.AllocsPerRun`); a client that stops reading is disconnected by the per-write
  deadline.
- **upload:** body drained before the response; `411` without `Content-Length`; `413` over the cap
  without reading; a lying `Content-Length` bounded by `MaxBytesReader`; grid counts with a fake
  monotonic clock (reads in known cells, `firstBucket = floor(startMs / 100)`, `Σ buckets == bytes`,
  at most 1201 entries); `Server-Timing` value equals `durationMs`; `408` with no telemetry after
  the 120 s lifetime (fake clock); epoch stable within a process and different across instances.
- **ping / small:** `204` and `200` with one byte; no allocation.
- **ws:** echo of `seq` and `t`; 1009 above 256 bytes, 1003 on binary, 1007 on malformed JSON;
  `403` for a foreign `Origin`, accepted for same host and port with a different scheme, for an
  allowed origin and for no `Origin`; `429` for the fifth connection; idle close after 120 s.
- **info:** field shapes against the OpenAPI schema; address class and suggested label for each
  range; no caching headers other than `no-store`.
- **clientip:** the derivation algorithm of [configuration-security.md
  §4](configuration-security.md#4-trusted-proxies-and-client-ip-derivation), including spoofed
  left-hand entries, malformed entries, all-trusted chains, `::ffff:` and zones, and ignored
  `X-Real-IP`.
- **ratelimit:** concurrency and token-bucket limits, `Retry-After` values, LRU eviction of idle
  entries only, `table_full` when every entry is active, release on abort.
- **config:** defaults; precedence defaults < file < env; env transform and the `__` rule
  (service-link variables ignored); every fail-closed rule with exit status 2 and one log line per
  error; warnings.
- **compat:** each layer's routes, statuses, CORS headers (including `/getIP`'s origin rule),
  `ckSize` clamping, the networkQuality config JSON and URL construction, route-collision checks.
- **server:** middleware order, security headers per group, graceful shutdown closing WebSockets
  with 1001, `healthcheck` exit codes.

## 2. Engine Tests With Synthetic Timelines

The engine runs in vitest against a fake `Clock` and a fake `Transport`
([frontend.md §2](frontend.md#2-engine-package-rules)). A scenario is a timeline: link rate per
direction over time, RTT, protocol, per-request failures, server grid offset and epoch. The fake
transport turns it into chunks, upload telemetry, probe timings and WebSocket echoes. Each scenario
asserts the emitted events and the final result object exactly.

Scenarios:

- **Slow link:** 300 kbit/s and 500 kbit/s with 300 ms and 600 ms RTT; request sizes, floor-limited
  trials, extension, the §19.1 budget tables of
  [../measurement.md](../measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard), and
  shortfall with the next-preset offer.
- **h2 vs h1:** protocol detection from `nextHopProtocol` (including an empty value), the 5-stream
  reservation with the HTTP fallback, path B `unavailable_h1` vs `measured`/`uncertain`, and h2
  multiplexing modelled as one shared window.
- **Cancel mid-request with the watermark rule:** user stop during uploads; worked example B
  reproduced exactly (`C = 7000`, `W_end_final = 7000`, `partial`).
- **Overlapping upload histograms:** worked example A reproduced exactly (cells 10–27, 93.3 KiB over
  11 cells, 0.69 Mbit/s), plus random overlaps checked against a brute-force reference.
- **Failures:** failure gaps on h2/h3 (`lb`, `ub`, excluded cells, the series continuing), and on
  HTTP/1.1 the first failure ending the phase; three consecutive failures giving an error result.
- **Data cap:** requests shrunk to fit, the cap never exceeded, the phase ending at the floor and
  later phases skipped.
- **Warm-up guards behind the confirmation delay:** all four conditions, evaluation on confirmed
  cells only, unknown cells never treated as zero, the warm-up cap and each low-confidence reason.
- **Ramp baseline / trial / plateau:** baseline growth up to its cap, kept trials, `no-gain`, `cap`
  and `floor-limited` plateaus, the effective cap lowered to 5.
- **Server epoch change:** an upload response with a new epoch, and the WebSocket-close sequence
  finding a new epoch, both aborting with `server restarted`.
- **Loss:** idle-ping timeouts counted as loss percentage, never as packet loss; loaded pings lost
  after 30 s; the packet-loss slot staying "not measured".
- **Latency paths and grades:** WebSocket echo with up to 4 outstanding, skipped ticks, HTTP
  fallback single-outstanding with recorded gaps, Waveform grade boundaries, TM95 trimming and the
  four path B states.
- **Scores:** every AIM threshold boundary and band, and experiences omitted when an input is
  missing.
- **Continuous:** constant memory over a simulated 8-day run (ring sizes fixed), tier sums with
  unknown cells, "p90, last hour", data-used notices.
- **Visibility and throttling:** late ticks while hidden stopping the run; hidden without late ticks
  continuing.
- **Result object:** schema validation of every emitted result; `schemaVersion` migration.

## 3. Frontend Component Tests

vitest with `@vue/test-utils` and jsdom:

- Gauge mapping (log scale, edge pinning, readout precision), reduced-motion behaviour.
- Result cards for every direction status and confidence level; notices; the packet-loss slot.
- Settings and URL-parameter parsing, defaults from `/info`, shareable URL round-trip.
- History module against `fake-indexeddb`: save, migrate, export JSON/CSV, import validation,
  deduplication, unavailable storage.
- Share image content: no client IP, no note, no URL.
- i18n: no missing keys in any locale (lint plus a test over all locale files).

## 4. Playwright End-to-End

Run against the real binary (built image or `go run`) on **Chromium, Firefox and WebKit**:

- The nine flows of [../ui/flows.md](../ui/flows.md): first run, auto-run from URL, slow mobile VPN
  run (with a shaped link), cancel mid-test, error mid-test (server stopped), history review and
  compare, continuous mode (short), sharing, changing settings.
- Base path deployment and the base-path-mismatch screen.
- CSP violations reported as test failures.
- Accessibility checks with axe on every screen.

Playwright's WebKit is not Safari: Worker XHR upload progress, `nextHopProtocol` and suspension
behaviour are re-checked manually on real Safari (macOS) and iOS Safari before each release
([../edge-cases.md §17](../edge-cases.md#17-safari-and-ios-quirks)).

## 5. Accuracy Harness

The product claims 300 kbit/s to 10 Gbit/s on Chromium, Firefox and Safari (desktop and iOS). The
harness has three tiers:

| Tier | Profiles (tc tbf/netem on a Docker network, iperf3 reference) | Browsers | Where it runs |
| --- | --- | --- | --- |
| CI | 500 kbit/s + 300 ms; 10 Mbit; 100 Mbit + 50 ms; 1 Gbit; 100 Mbit + 50 ms through Traefik (h1) and through Caddy (h2); 100 Mbit + 50 ms through Traefik (h1) with WebSocket upgrades blocked, forcing the HTTP latency fallback | headless Chromium, headless Firefox, Playwright WebKit | every PR (or nightly for the 1 Gbit profile if CI runners cannot sustain it) |
| Manual range floor | 300 kbit/s + 300 ms + 1 % loss; 300 kbit/s + 600 ms (VPN over mobile) | Chromium, Firefox, WebKit; one real Android Chrome and one real iOS Safari run over an actual VPN | before each release |
| Manual range ceiling | 2.5 Gbit and 10 Gbit on bare metal or veth without shaping (shaping at 10 Gbit is CPU-bound and not representative) | Chromium, Firefox, Safari on a machine with ≥ 4 cores; documented CPU/memory counters | before each release, results recorded in `docs/engineering/` |

**Method.** For each profile, a Playwright-driven browser runs a Standard test (Extended for the
600 ms floor profile, which the shortfall rule otherwise covers) while iperf3 measures the same
shaped path over the same window. The harness records the headline, the steady window, data used
and the result's notices.

**Tolerances** (headline vs iperf3 over the same window):

| Range | Tolerance |
| --- | --- |
| ≤ 1 Mbit/s | ±15 % |
| 10 to 100 Mbit/s | ±10 % |
| 1 Gbit | ±10 % |
| ≥ 2.5 Gbit | ±20 %, with the explicit note that the browser's CPU is the limit; the result must report `confidence: cpu-bound` when the Worker's busy fraction exceeds 90 % |

**Latency:** the loaded-latency increase must be within ±20 % of the netem-added queue delay
observed by a concurrent ICMP ping.

**No-egress check.** The harness's BitGauge container sits on a Docker network with no route out;
any outbound connection attempt from it (recorded by the network's firewall rules) fails the run
([../security.md §3](../security.md#3-no-outbound-calls)).

**Environmental limits**, written into every harness report:

- `tc` shaping jitter (tbf burst sizes, netem timer granularity).
- Docker bridge overhead at high rates.
- Playwright WebKit ≠ Safari: Worker XHR and `nextHopProtocol` behaviour must be re-checked on real
  Safari.
- Mobile power management: device runs happen with the screen on.

**What the harness cannot prove:** real Wi-Fi behaviour, real VPN MTU effects, carrier-grade NAT,
and anything about networks the project does not target.

## 6. CI Placement

| Suite | Where | When |
| --- | --- | --- |
| Go tests, lint, govulncheck | `ci.yaml` | every PR and push |
| Engine and component tests (vitest), ESLint, `vue-tsc` | `ci.yaml` | every PR and push |
| Playwright E2E (three browsers) | `ci.yaml` | every PR and push |
| Accuracy harness, CI tier | `ci.yaml` (1 Gbit profile nightly if runners cannot sustain it) | every PR |
| Accuracy harness, floor and ceiling tiers | manual (`make harness-floor`, `make harness-ceiling`) | before each release; results in `docs/engineering/` |
| Real Safari and iOS checks | manual | before each release |

A release is blocked until the manual tiers have passed for that version
([../../release.md](../../release.md)).

## Related

- [Measurement methodology](../measurement.md)
- [Frontend design](frontend.md)
- [Backend design](backend.md)
- [Build and packaging](build-packaging.md)
- [Edge cases](../edge-cases.md)
