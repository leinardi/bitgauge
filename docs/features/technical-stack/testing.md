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
- **metrics:** every metric name, type and label set of [backend.md
  §7](backend.md#7-prometheus-metric-set) against a gathered registry; every rate-limit refusal
  mapped to its `limit`; transfer bytes, aborts and upload timeouts counted by the handlers that
  cause them, with the download and probe allocation tests unchanged; the endpoint `404` when
  disabled and `200` when enabled, a plain `405` with `Allow: GET` for another method,
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, no `Content-Encoding` when the
  scraper sends `Accept-Encoding: gzip`, never rate-limited, mounted under `base_path`, and the
  `group` label of each route owner.

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
  multiplexing modeled as one shared window.
- **Path B:** HTTP/1.1, an empty protocol and a failed capability probe giving `unavailable_h1`;
  h2 `measured`; a new connection, an unknown one, fewer than 10 samples and a capped warm-up each
  giving `uncertain`; fewer than 4 samples in the last 4 s giving `unavailable_insufficient`; TM95
  at 19 samples (nothing trimmed) and at 20 (one trimmed); path B never feeding the grade.
- **Cancel mid-request with the watermark rule:** user stop during uploads; worked example B
  reproduced exactly (`C = 7000`, `W_end_final = 7000`, `partial`).
- **Issue gap:** a browser that takes 150 ms to start each request, download and upload; early issue
  closes the holes at 2 streams and most of them at 6 within the server's in-flight bound, and
  the steady window reads `unstable` where holes remain ([../measurement.md §3 and §8.3](../measurement.md#3-adaptive-request-size)).
- **Overlapping upload histograms:** worked example A reproduced exactly (cells 10–27, 93.3 KiB over
  11 cells, 0.69 Mbit/s), plus random overlaps checked against a brute-force reference.
- **Failures:** failure gaps on h2/h3 (`lb`, `ub`, excluded cells, the series continuing), and on
  HTTP/1.1 the first failure ending the phase; three consecutive failures giving an error result.
- **Upload preparation turn:** one request of at least 1 MiB preparing at a time, the turn passing
  on the first progress, at the request's end or after 1 s, smaller requests never waiting, and the
  turn dropped once a confirmed request reported no progress.
- **Data cap:** requests shrunk to fit, the cap never exceeded, the phase ending at the floor and
  later phases skipped.
- **Warm-up guards behind the confirmation delay:** all four conditions, evaluation on confirmed
  cells only, unknown cells never treated as zero, the warm-up cap, its move while the ramp runs
  (bounded at 50 % of the phase max), and each low-confidence reason.
- **Ramp baseline / trial / plateau:** baseline growth up to its cap, kept trials, `no-gain`, `cap`
  and `floor-limited` plateaus, the one more step after a no-gain trial from 900 Mbit/s, the
  effective cap lowered to 5.
- **Server epoch change:** an upload response with a new epoch, and the WebSocket-close sequence
  finding a new epoch, both aborting with `server restarted`.
- **Loss:** idle-ping timeouts counted as loss percentage, never as packet loss; loaded pings lost
  after 30 s; the packet-loss slot staying "not measured".
- **Latency paths and grades:** WebSocket echo with up to 4 outstanding, skipped ticks, HTTP
  fallback single-outstanding with recorded gaps, Waveform grade boundaries, TM95 trimming and the
  four path B states.
- **Scores:** every AIM threshold boundary and band, and experiences omitted when an input is
  missing, each `missing` combination, a download-only run, and the worked example of
  [../measurement.md §17](../measurement.md#17-result-object).
- **Continuous:** a synthetic clock over **more than 7 days** of cells (8 days), on which every
  retention ring keeps exactly its fixed length (6000, 3600, 1440, 1008) from the moment it is
  allocated, the saved series follows the tier rule at each tier boundary and beyond 7 days (the
  last 7 saved), unknown and partly known cells keep their known time, and the run-wide aggregates
  and "p90, last hour" match a brute-force reference on a short run; data-used notices at each
  threshold; the outcome rule (a stop during warm-up and a stop right after it, before 3 fully
  known 1 s cells, give `insufficient-data` under a `partial` result; with 3 cells, `complete`);
  and constant memory, the engine's test-only `footprint()` reporting every structure that grows
  per tick, request, chunk, sample, probe or message, each length equal at minutes 5 and 15 of a
  simulated 15-minute run on h2 with the WebSocket loaded path and path B running, in each
  direction.
- **Visibility and throttling:** late ticks while hidden stopping the run; hidden without late ticks
  continuing.
- **Result object:** schema validation of every emitted result; `schemaVersion` migration.

## 3. Frontend Component Tests

vitest with `@vue/test-utils` and jsdom:

- Gauge mapping (log scale, edge pinning, readout precision), reduced-motion behavior.
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
behavior are re-checked manually on real Safari (macOS) and iOS Safari before each release
([../edge-cases.md §17](../edge-cases.md#17-safari-and-ios-quirks)).

### 4.1 Implementation

- **Runner.** `make e2e` builds the binary with the SPA on the host and runs `web/e2e/` against it
  in all three browsers, the specs in parallel. They all reach the server from one address, which
  its per-client stream limit counts as one client ([../measurement.md
  §4](../measurement.md#4-adaptive-stream-count)), so that server runs with `max_streams_per_client`
  raised to 64, room for the ten workers the Playwright configuration allows at most. Its four
  WebSockets per client ([../wire-protocol.md §9](../wire-protocol.md#9-rate-limits)) can be
  exceeded, so a run there may fall back to HTTP for idle latency. A spec that needs a server of its
  own starts `dist/bitgauge` on a free loopback port (`web/e2e/fixtures/server.ts`): the first run,
  which checks that idle latency came over the WebSocket, a server configured for a base path, one
  stopped mid-run, and the Test screen's share dialog after a run.
- **v0.1 coverage.** Flows 1, 2, 4 and 5, with the base path deployment and the mismatch screen.
  The slow mobile VPN run is the accuracy harness's 500 kbit/s profile (§5); history, continuous
  mode, sharing and settings arrive with the versions that ship them. A server killed mid-run
  closes the WebSocket, and the run ends with `network changed`
  ([../edge-cases.md §6](../edge-cases.md#6-network-change-mid-test), step 3) or, when three
  download requests fail first, with `requests-failed`; the spec accepts either.
- **v0.3 coverage** (built with the v0.3 UI). Flow 7, Continuous mode, short: `continuous.spec.ts`
  starts a Continuous download with the shortest run length, 60 s, waits for the `complete` result
  and finds it saved in History, then starts another and stops it right after warm-up, expecting
  `partial` with `insufficient-data` and Keep in history offered. `about.spec.ts` starts servers
  with each compatibility toggle (`BITGAUGE_COMPAT__*`) and checks that each snippet shows only for
  its enabled layer. A run on the plain-HTTP/1.1 E2E server reports path B `unavailable_h1`. axe
  scans the new states: the Continuous live view and its two endings, and About with the snippets.
- **v0.2 coverage.** Flows 6, 8 and 9 (`history`, `share` and `settings` specs) and the Result
  detail (`result-detail`). Their history comes from the demo's eight results, imported through
  History's own Import JSON (`web/e2e/fixtures/history.ts`); runs are left to what needs one: the
  Test screen's share dialog, Run again with a result's settings, and flow 9's next run with the
  stored settings and with a URL override. Copy summary and Copy comparison are checked against
  the clipboard on Chromium, which grants the permission; elsewhere either outcome passes, the copy
  or the manual-copy fallback, and a stubbed clipboard that refuses forces Copy summary's fallback
  on every browser.
  The base-path spec also loads History under the base path and downloads a share image there,
  and the CSP spec loads History and downloads a share image under the policy.
- **CSP.** Every test listens for `securitypolicyviolation` in the page, before its own scripts run,
  and in each Worker it starts, where the engine's requests and WebSocket run, and fails on any; a
  negative control proves both listeners report a blocked request.
- **axe.** WCAG 2.2 AA rules (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`), once the
  page's transitions have settled, on every screen. In both themes (`a11y.spec.ts`): the Test
  screen idle, History empty, populated and with no match, the Compare dialog, a Result detail with
  a chart and a table and one not found, Settings with Advanced open and with a change and its
  Reset all confirmation, and About. In the default theme, the states the flow specs reach: the
  Test screen done, cancelled and in error, the base-path error, the share dialog, History
  unavailable, filtered and with Clear all's confirmation, and Settings with an invalid value. The
  Compare dialog in `a11y.spec.ts` and Clear all's confirmation are scanned on their own; the other
  dialogs are scanned with the whole page, where axe skips the content the open dialog hides from
  assistive technology.

## 5. Accuracy Harness

The product claims 300 kbit/s to 10 Gbit/s on Chromium, Firefox and Safari (desktop and iOS). The
harness has three tiers:

| Tier | Profiles (tc tbf/netem on a Docker network, iperf3 reference) | Browsers | Where it runs |
| --- | --- | --- | --- |
| CI | 500 kbit/s + 300 ms; 10 Mbit; 100 Mbit + 50 ms; 1 Gbit; 100 Mbit + 50 ms through Traefik (h1) and through Caddy (h2); 100 Mbit + 50 ms through Traefik (h1) with WebSocket upgrades blocked, forcing the HTTP latency fallback | headless Chromium, headless Firefox, Playwright WebKit | every PR (or nightly for the 1 Gbit profile if CI runners cannot sustain it) |
| Manual range floor | 300 kbit/s + 300 ms + 1 % loss; 300 kbit/s + 600 ms (VPN over mobile) | Chromium, Firefox, WebKit; one real Android Chrome and one real iOS Safari run over an actual VPN | before each release, results recorded in `docs/engineering/harness-runs/<version>.md` |
| Manual range ceiling | 2.5 Gbit and 10 Gbit on bare metal or veth without shaping (shaping at 10 Gbit is CPU-bound and not representative) | Chromium, Firefox, Safari on a machine with ≥ 4 cores; documented CPU/memory counters | before each release, results recorded in `docs/engineering/harness-runs/<version>.md` |

**Method.** For each profile, a Playwright-driven browser runs a Standard test (Extended for the
600 ms floor profile, which the shortfall rule otherwise covers), and iperf3 measures the same
shaped path as the reference. The harness records the headline, the steady window, data used and
the result's notices, read from the result's JSON download (the v0.1 extraction path,
[decisions.md §36](decisions.md#36-v01-harness-extraction--download-json-on-the-test-screen)).

**Reference measurement**
([decisions.md §35](decisions.md#35-accuracy-harness-reference--iperf3-before-and-after-the-browser-run)).
Running iperf3 concurrently with the browser would split the link between them, so iperf3 runs
immediately **before** and immediately **after** the browser run, each for the steady-window
duration of the preset. iperf3 reports TCP goodput, so the shaped profiles are judged against the
**configured goodput**: the goodput the configured rate carries once Ethernet, IP and TCP overhead
are taken off, and on a lossy profile the retransmissions its loss costs, `rate × 1448 / 1514 ×
(1 − loss)` (a full-size frame carries 1448 payload bytes in 1514 bytes on the wire, about 4.4 %
below the rate; at 1 % loss about 1 % of the link carries segments sent again, which iperf3 does
not count).

- **Instability rejection:** if `|before − after| / mean(before, after)` exceeds 5 % (the shaper
  self-test bound), or either run deviates from the configured goodput by more than 5 %, the
  profile is re-run once.
- If it is still unstable, the profile is **inconclusive**: a distinct status that fails CI and is
  never counted as a pass.
- Only a stable profile uses `mean(before, after)` as the reference. Both raw values always go into
  the report.

**Tolerances** (headline vs the iperf3 reference):

| Range | Tolerance |
| --- | --- |
| ≤ 1 Mbit/s | ±15 % |
| 10 to 100 Mbit/s | ±10 % |
| 1 Gbit | ±10 % |
| ≥ 2.5 Gbit | ±20 %, with the explicit note that the browser's CPU is the limit; the result must report `confidence: cpu-bound` when the Worker's busy fraction exceeds 90 % |

**Latency:** judged per direction whose loaded latency is measured with source `websocket` or
`http-h1-reserved` ([../measurement.md §11](../measurement.md#11-latency-under-load)). The
reference is the ICMP ping that runs alongside the browser: the median RTT of the pings sent in
that direction's phase after its first `I_s` (`max(1 s, 4 × RTT)`, with the idle ping median as
the RTT; the engine's own `I_s`, from its idle median, may start its window some tens of
milliseconds apart), minus the median RTT of the pings sent in the idle-latency phase. The engine's
`increaseMs` passes within ±20 % of that ping increase or 5 ms, whichever is larger. The
bufferbloat grade is judged against the larger ping increase over the directions its `basis`
names, as the grade itself takes the larger increase: it must be that increase's letter on the
thresholds of [../measurement.md §11.3](../measurement.md#113-bufferbloat-grade), or the adjacent
letter when that increase lies within the same tolerance of a threshold. A direction measured with
`http-h2` or `http-h3` is recorded with the ping figures and not judged: its probes share the load
connection and wait behind its data (head-of-line blocking), which the ping does not; a grade whose
`basis` includes such a direction is recorded and not judged either. On the profiles the rule
judges, every direction must report a measured loaded latency with `increaseMs`, and the result
must carry `bufferbloat`; an `unavailable` loaded latency, a missing increase or a missing grade
fails the run, as a missing headline does. The ws-blocked profile must
report `http-h1-reserved` with at least 10 samples in each direction, never more than 5 streams,
and the `probe-reservation` notice. The phase windows come from the phase transitions the harness's
browser driver records from the Test screen, never from product code. ICMP is a fair reference
because the shaper's fq_codel isolates sparse flows: the ping and the echo, or the reserved
connection's probes, see the same standing delay, which is the quantity path A claims. netem's
fixed delay is not a queue; it is in both medians and cancels out of the increase.

**No-egress check.** Two layers, which make two different claims
([../security.md §3](../security.md#3-no-outbound-calls)):

- **No packet egress** (the harness and the image test, through `netguard`): BitGauge runs in a
  network namespace owned by a guard container on a Docker network with no route out. The guard
  installs nftables counters and a `sink` interface that routes every non-local destination, so an
  outgoing packet reaches the output hook and is counted and dropped instead of failing early with
  "network unreachable". Separate counters see new connections on any interface but loopback,
  lookups to Docker's embedded DNS (`127.0.0.11:53`), and any other new loopback connection except
  to BitGauge's own listen port. Before BitGauge starts, four negative controls (TCP to
  `192.0.2.1`, TCP to `2001:db8::1`, a DNS lookup, TCP to an unused loopback port) must each
  increment their counter, or the run fails as "instrument blind"; the counters are then reset and
  must stay at zero from process start to the end of the run. This layer cannot see an attempt
  that fails before a packet is built.
- **No connection or write attempt** (the image test's syscall layer only): the binary is run under
  `strace -f` from process start; any `connect`, any send on a socket other than an accepted
  connection, and any file write outside `/dev` and `/proc` fails the test. The healthcheck is
  traced separately and may make exactly one loopback `connect` to the listen address. Anonymous
  inodes (an `eventfd`, an `epoll` instance and the like) are not sockets, and a call strace cannot
  name (`???()`, from a thread that is exiting) has no argument to judge; any other line the
  analyser cannot read fails the test. Negative controls prove the analyser rejects a
  connect-back, a `sendto` to a peer and a file create.

The harness report says which layer each result comes from.

**Environmental limits**, written into every harness report:

- `tc` shaping jitter (tbf burst sizes, netem timer granularity).
- Docker bridge overhead at high rates.
- Playwright WebKit ≠ Safari: Worker XHR and `nextHopProtocol` behavior must be re-checked on real
  Safari.
- Mobile power management: device runs happen with the screen on.

**Path B (v0.3).** On `ci-100m-50ms-caddy-h2` path B must run over HTTP/2 in each measured
direction: `responsiveness.state` `measured` or `uncertain`, with `protocol` `h2` and an RPM. On
`ci-100m-50ms-traefik-h1` it must be `unavailable_h1`. Any other state, or a missing
`responsiveness` on a measured direction, fails the run on those two profiles. Which of `measured`
and `uncertain` a Caddy direction reads is recorded, not judged: it rests on the sample count, the
connection evidence the browser exposes and whether the warm-up ended at its cap (measurement.md
§12.4), none of which the profile controls. On this profile each probe on the loaded HTTP/2
connection takes about 300 to 340 ms, so a Standard download window holds fewer than the 10
samples `measured` needs. Every other profile records the state, with the RPM where there is one,
and does not judge it: neither the protocol nor the connection sharing it rests on is under the
profile's control.

**Compatibility clients (v0.3).** On `ci-100m-50ms-caddy-h2`, the one CI profile with HTTPS, which
networkQuality needs, BitGauge runs with the three compatibility toggles on and
`server.trusted_proxies` set to the proxy network, so the absolute URLs are built from Caddy's
forwarding headers. After the browser runs:

- `librespeed-cli --no-icmp --server-json https://…/.well-known/librespeed --server 1 --json` runs
  in the tools container;
- `goresponsiveness` runs in the tools container against `https://…/nq/config`, with Caddy's
  internal root CA installed in the tools container's trust store;
- a pinned OpenSpeedTest UI container on the client network is opened by Playwright at
  `?Host=` pointing at BitGauge through Caddy, and runs one test.

Each passes when it exits or finishes without an error and reports a non-zero download and upload
throughput, and `goresponsiveness` an RPM. Its numbers follow the client's own method
([../compatibility.md](../compatibility.md)) and are recorded, not held to the tolerance table. A
missing or unreadable output fails the profile; it is never a skip. The no-egress layers stay on
for the whole profile, and the OpenSpeedTest UI's results link is never followed.

**Continuous memory (manual, v0.3).** Beside the three tiers, `make harness-continuous` runs one
hour of a Continuous download on the `ci-100m-50ms` profile in Chromium. Every 60 s from the
steady start the browser driver forces a garbage collection on the Worker's target and reads its
`Runtime.getHeapUsage` through the Chrome DevTools Protocol. The run passes when every sample from
minute 5 to minute 60 lies within 2 MiB of the minute-5 sample. It runs before each release, not on
CI, and is recorded in `docs/engineering/harness-runs/<version>.md` with the floor and ceiling
tiers.

**What the harness cannot prove:** real Wi-Fi behavior, real VPN MTU effects, carrier-grade NAT,
and anything about networks the project does not target.

### 5.1 Implementation

- **Location.** Go tests in `test/harness/` drive the topology over the Docker CLI on the host
  daemon; the browser side is a Playwright driver in `web/harness/` that opens the URL with the
  preset's parameters, waits for the result and downloads its JSON. Pure logic (the profile table,
  report rendering) is untagged and runs with `go test ./...`; the runners build with
  `-tags=harness`. Shared pieces live in `test/internal/testenv` (environment IDs, labels, scoped
  cleanup) and `test/internal/netguard`.
- **Topology per profile.** One Docker network with no egress route. The `netguard` holder owns
  BitGauge's network namespace; BitGauge (the built image, read-only) and `iperf3 -s` join it, so
  the iperf3 server is the same endpoint as BitGauge. An optional Traefik or Caddy container sits
  in front. The client is the Playwright image; a `shaper` sidecar shares the **client's** network
  namespace and shapes it with tbf and netem on egress and an ifb mirror for ingress, modeling the
  user's access link. Each direction's tbf queue, 80 ms of data at the profile's rate and at least
  64 KiB (the shaper queue of [measurement.md §19](../measurement.md#19-worked-timelines)), is an
  fq_codel shared among the flows crossing it, as §19.1 models the link: one drop-tail FIFO lets
  an established TCP stream hold the whole queue and lock a newly opened one out for seconds,
  which measures TCP's fairness rather than BitGauge. Its CoDel target is the queue's own length,
  so it drops nothing early and a single flow still fills the link. fq_codel's limit counts
  packets, sized as full frames, so where the queue is its 64 KiB minimum (below about 6.5 Mbit/s)
  segmentation offload is capped at one segment per packet on both ends of the shaped link, the
  client's namespace and the one that sends to it (BitGauge's, or the proxy's): there CoDel's
  interval is seconds long, the packet limit is what holds the queue, and two-segment packets
  would double it. Faster profiles keep offload, since CoDel holds their queue near its 80 ms
  target within 160 ms, and one segment per packet costs more CPU than a 1 Gbit link leaves. The
  iperf3 client and the concurrent ICMP ping run from the same namespace, so they take the same
  path as the browser.
- **iperf3 runs.** Each iperf3 run, the self-test's and the reference's, settles for
  `max(2 s, 10 × RTT)` before its measured duration, and reads the receiver's one-second intervals
  (the client's on download, the server's on upload): its rate is their median from the settle on.
  iperf3's `--omit` is not used, because it carries the omitted seconds' bytes into its totals, and
  a mean is not used, because over a long round trip a loss recovery holds one second's bytes back
  into the next, which a mean over a few seconds reads as a rate the link never had. Its block
  length is 10 ms of data at the profile's rate, between one segment's payload and 128 KiB, so a
  block never quantizes a slow link's per-second counts.
- **Shaper self-test.** Before a profile counts, the harness confirms that each direction's tbf
  holds the configured rate. While an iperf3 run saturates that direction, settled as above, it
  reads the bytes the tbf sent at the start and at the end of 5 s, in whole frames as tbf meters
  them, and their rate must be within ±5 % of the configured rate. It reads the shaper, not
  iperf3's received rate: on a 64 KiB queue, TCP's first queue overflow can fall inside those
  5 s, and the loss recovery after it holds the receiver's bytes back for seconds, so a correct
  shaper would read as a slow one. A tbf that idles because TCP left its queue empty reads low
  too, and fails: the self-test confirms only a rate it saw. A failed `tc` command fails the run;
  there is never a silently unshaped run.
- **Reports.** Each run writes `dist/harness/<tier>-<UTC>-<envid>/report.json` and `report.md`,
  with the raw exports, both iperf3 values and the environmental limits above. CI uploads them as
  an artifact and writes the Markdown to the step summary. For the floor and ceiling tiers, the
  maintainer commits `report.md` as `docs/engineering/harness-runs/<version>.md`, which the
  release requires before tagging.
- **Evaluation.** The evaluator judges every run with the rules above: `pass`, `fail` or
  `inconclusive`, with its verdict line and findings, beside `failed` for a run that could not
  complete or saw egress. A pass needs a `complete` result with a headline in both directions,
  each within the tolerance of the profile's rate; a rate between the table's rows has no
  tolerance and fails. The re-run of an inconclusive profile is a second attempt in the report;
  the first stays, marked superseded, with its raw values. An unshaped run of a shaped profile
  (`HARNESS_SHAPE=none`) is a debugging run and stays `recorded`, never judged. Any final run that
  is not a `pass`, a `recorded` debugging run included, fails the tier.
- **Cleanup.** Every resource carries the run's environment ID; a run removes only its own, and a
  stale environment of another run is removed only when it is old, not kept on failure, and its
  owner process is provably dead.

## 6. CI Placement

| Suite | Where | When |
| --- | --- | --- |
| Go tests, lint, govulncheck | `ci.yaml` | every PR and push |
| Engine and component tests (vitest), ESLint, `vue-tsc` | `ci.yaml` | every PR and push |
| Playwright E2E (three browsers) | `ci.yaml` | every PR and push |
| Accuracy harness, CI tier | `harness.yaml`, called by `ci.yaml`, or dispatched by hand; its nightly schedule, added once the repository is public ([going-public.md §3](../../engineering/going-public.md#3-restore-the-scheduled-scan)), takes the 1 Gbit profile if runners cannot sustain it on every PR | every PR and push, and nightly once public |
| Accuracy harness, floor and ceiling tiers, Continuous memory check | manual (`make harness-floor`, `make harness-ceiling`, `make harness-continuous`) | before each release; results in `docs/engineering/harness-runs/<version>.md` |
| Real Safari and iOS checks | manual | before each release |

A release is blocked until the manual tiers have passed for that version
([../../release.md](../../release.md)).

## Related

- [Measurement methodology](../measurement.md)
- [Frontend design](frontend.md)
- [Backend design](backend.md)
- [Build and packaging](build-packaging.md)
- [Edge cases](../edge-cases.md)
