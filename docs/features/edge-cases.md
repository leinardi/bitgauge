# Edge Cases

[Feature index](README.md) / Edge Cases

Situations where a naive speed test gives a wrong number, hangs or loses data, and what BitGauge
does in each. Each entry gives the situation, the behaviour and what the user sees. Notices are
listed in [measurement.md §16](measurement.md#16-confidence-and-notices).

## 1. Sub-1 Mbit and High-RTT VPN Links

**Situation.** Mobile over VPN at 300 kbit/s to 1 Mbit/s with 300–600 ms RTT. Fixed large requests
never complete; client-side upload progress runs seconds ahead of the link.

**Behaviour.** Requests start at 64 KiB and are sized to about 1 s at the observed per-stream rate,
down to a 16 KiB floor; the ramp starts at one stream and skips trials that would make requests too
thin (`floor-limited`); upload is server-timed; phases extend up to their maximum; idle-latency
timeouts scale with the running median and cap at 10 s. The slow-link budget is worked out in
[measurement.md §19.1](measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard).

**User sees.** `slow link — test extended` when a phase extends; `insufficient data` with an offer
of the next larger preset when even the maximum is not enough; data used is always shown.

## 2. Mobile Browsers Throttling Background Tabs and Workers

**Situation.** Mobile browsers throttle timers and may suspend JavaScript, Workers included, when
the tab is in the background or the screen locks (iOS suspends almost immediately; Android Chrome
throttles hidden pages).

**Behaviour.** During a test the SPA requests a screen wake lock (`navigator.wakeLock`) where
available. The Worker runs a 100 ms housekeeping tick; a tick that arrives more than 1 s late
means the engine was throttled or suspended, and timestamps around it cannot be trusted. Hidden
pages are handled by §5.

**User sees.** A `timer throttling detected` notice on the result when late ticks occurred while
the page was visible (for example Low Power Mode); the advice to keep the screen on during tests.

## 3. HTTP/2 vs HTTP/1.1 via the Proxy

**Situation.** The browser speaks whatever the proxy negotiates: HTTP/1.1 (one TCP connection per
stream, six per origin), HTTP/2 (all streams on one connection) or HTTP/3. BitGauge itself always
speaks HTTP/1.1 to the proxy.

**Behaviour.** The engine reads `nextHopProtocol` from each request's Resource Timing entry and
records it. On HTTP/1.1 with the WebSocket unavailable, the HTTP latency fallback reserves one
connection and caps streams at 5; path B (HTTP loaded responsiveness) is `unavailable_h1`. On HTTP/2
and HTTP/3, path B runs and transient upload failures leave failure gaps instead of ending the phase
(the current answer to an item in [open-questions.md](open-questions.md);
[measurement.md §7.5](measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)).

**User sees.** The protocol in the connection info and in every result; "needs HTTP/2 or HTTP/3 at
the reverse proxy" where path B is unavailable. How the protocol changes throughput is §12.

## 4. Proxy Buffering That Distorts Upload

**Situation.** A proxy with request buffering on (nginx's default `proxy_request_buffering on`, or
a buffering middleware) receives the whole body before forwarding it. Client-timed tests then
measure the client-to-proxy hop plus buffer, and server-timed tests see each body arrive in one
burst.

**Behaviour.** Arrival counts stay exact for what the server saw, so no number is invented, but the
series becomes bursts and gaps and fails the stability test. When a request's server duration is
below 10 % of its client duration (requests of at least 1 s), the engine flags it
([measurement.md §7.3](measurement.md#73-server-telemetry-per-request)).

**User sees.** `proxy buffering suspected` with a link to the proxy requirements in
[deployment-example.md](deployment-example.md); usually `confidence: low` with reason `unstable`.

## 5. Tab Hidden Mid-Test

**Situation.** The user switches tabs or apps during a throughput phase. On mobile, JavaScript is
throttled or suspended almost at once; desktop browsers throttle the hidden page's main thread but
usually keep a dedicated Worker's timers and network callbacks running. Only suspension or
throttling of the Worker makes chunk timestamps and probe timings stop reflecting the network.

**Behaviour.** The SPA forwards `visibilitychange` to the Worker, and the Worker watches its own
100 ms housekeeping tick (§2). While the page is hidden:

- If no tick arrives more than 1 s late, the engine keeps measuring; the Worker's timing is intact.
  This is the usual desktop case, so long Continuous runs survive a tab switch. The result carries
  the informational notice `page was hidden during the test`.
- At the first tick more than 1 s late while hidden, the engine stops the test at the last on-time
  tick, exactly like a user stop: in-flight requests are aborted, completed phases keep their
  results, and the interrupted direction reports a number only if its window up to that instant
  meets the minimum window. The download window ends at that tick; the upload, timed on the
  server grid, stops at once and its window ends at the confirmed watermark, as after any stop.
  Continuous runs end the same way.
- A late tick counts as a pause of the hidden page when the page was hidden at any point since the
  last on-time tick, whichever of the late tick and the visibility message the resumed Worker
  handles first; only a tick late while the page stayed visible is timer throttling (§2).
- Idle latency, being short, is restarted when the page becomes visible again, also after a late
  tick; a late tick in the Info phase, which times nothing, changes nothing.

**User sees.** Either the informational notice, or `partial — stopped early` with "stopped because
the page was hidden and the browser paused the test", and a Run again button. A Continuous run
stopped this way after its steady window began is `complete`, as after a user stop
([measurement.md §15](measurement.md#15-continuous-mode)).

## 6. Network Change Mid-Test

**Situation.** The device moves from Wi-Fi to cellular, the VPN reconnects, or the link drops.
Connections reset, the WebSocket closes and the client IP may change. A proxy idle timeout (§14)
or a server restart (§11) also closes the WebSocket, and the engine cannot tell these apart from
the close alone.

**Network events.** Only two browser signals count as a network change: an `offline` event, and a
change of `navigator.connection.type` where the browser exposes it (for example `wifi` to
`cellular`). Changes of `effectiveType`, `downlink` or `rtt` are ignored: they are the browser's
own throughput and RTT estimates, and the test itself moves them.

**Behaviour.**

- **On a network event**, the path the test is measuring has changed: the engine stops the test
  with an error result for the current phase, keeps completed phases, and does not merge
  measurements across the change. No WebSocket is reopened.
- **On an unexpected WebSocket close**, one sequence decides what happened:
  1. The engine tries once to reopen `/api/v1/ws` and calls `GET /api/v1/info`, with the
     idle-latency timeout policy ([measurement.md §10](measurement.md#10-idle-latency)).
     Throughput requests keep running meanwhile; loaded latency records a gap.
  2. `GET /info` succeeds with a **different epoch**: the server restarted, and §11 applies.
  3. `GET /info` **fails**, or a network event arrives meanwhile: the network changed, handled as
     above.
  4. `GET /info` succeeds with the **same epoch** and the reopen **succeeds**: the close was a
     transport event such as a proxy timeout; the test continues with the notice
     `WebSocket reopened` (§14).
  5. `GET /info` succeeds with the **same epoch** but the reopen **fails** (upgrade refused, or a
     `429` while the old slot is released): path A switches to the HTTP fallback for the rest of
     the test with the notice `WebSocket unavailable — HTTP latency fallback`
     ([measurement.md §11.2](measurement.md#112-path-a-fallback--http-probe)). On HTTP/1.1 the
     5-stream reservation starts with the next direction; the current direction's loaded latency
     is `unavailable`, because its reservation did not hold for the whole phase.

Request failures are handled by the phase rules (three consecutive failures end a phase, and on
HTTP/1.1 upload the first one does; [measurement.md §5](measurement.md#5-adaptive-duration)).

**User sees.** `network changed` — "Network changed during the test" with a retry button; completed
phases remain visible. Or, when the network did not change, one of the two WebSocket notices.

## 7. IndexedDB Unavailable (Private Mode)

**Situation.** Some private-browsing modes disable IndexedDB, keep it in memory only, or impose tiny
quotas; storage can also be blocked by policy.

**Behaviour.** The history module opens its database at startup; if that fails or the quota is
exhausted, history is disabled for the session. Tests run normally; the current result can still
be exported as JSON or CSV and shared as an image.

**User sees.** "History is unavailable in this browser mode — results are not saved" on the
History screen and after each test.

## 8. Different Origins Give Separate Histories

**Situation.** The same BitGauge is reached as `http://192.168.1.10:8080` on the LAN and as
`https://speed.vpn.example` over the VPN. Browser storage is per origin.

**Behaviour.** Each origin has its own history. Export from one and import into the other merges
them; import deduplicates by result `id`.

**User sees.** The History screen names the origin it shows ("stored only in this browser, for
speed.vpn.example") and points to export/import.

## 9. Clock and Timer Resolution

**Situation.** Browsers coarsen `performance.now()`: commonly to 100 µs, to 1 ms in some browsers
or modes, and finer (5 µs in Chromium) only when the page is cross-origin isolated.

**Behaviour.** The SPA is served with COOP and COEP headers
([security.md §5](security.md#5-content-security-policy-and-security-headers)) to get the finest
timer available. Cross-origin isolation, like the wake lock (§2) and persistent storage (§17),
needs a **secure context**: it takes effect behind an HTTPS proxy (or on `localhost`), not on a
plain-HTTP LAN address such as `http://192.168.1.10:8080`, where timers stay coarser. 100 ms buckets
are unaffected by any of these resolutions. Latency statistics are reported no finer than the
detected resolution; a sub-resolution LAN RTT is shown as "< 1 ms" rather than as 0. Jitter on
sub-millisecond LANs is quantised and labelled with the resolution.

**User sees.** Honest latency numbers on LANs; the timer resolution, and whether the page was
cross-origin isolated, in the result detail.

## 10. Very Fast Links Where the Browser CPU Is the Bottleneck

**Situation.** At 2.5–10 Gbit/s the browser's network stack and the Worker's chunk loop saturate a
CPU core before the link saturates.

**Behaviour.** The engine measures the Worker's busy fraction; above 90 % over the steady window the
direction is `confidence: cpu-bound`. Requests at the 256 MiB cap and up to 6 streams keep
per-request overhead negligible. The harness tolerance at ≥ 2.5 Gbit/s is ±20 %
([technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness)); the confidence
level is defined in [measurement.md §16](measurement.md#16-confidence-and-notices).

**User sees.** "Limited by this device's CPU, not by the network", with tips: close other tabs, use
a desktop browser, compare with `networkQuality` or iperf3.

## 11. Server Restart Mid-Test

**Situation.** The container restarts (deploy, crash, image update) during a test. Upload grid
indices from before and after the restart cannot be combined, and in-flight requests fail.

**Behaviour.** A restart is detected by an epoch change, whichever arrives first:

- an upload response whose `epoch` differs from the one `GET /info` returned at test start; or
- the `GET /info` call of the WebSocket-close sequence (§6, step 2) returning a different epoch.

Either aborts the test at once. Completed phases are kept; the current phase reports nothing.

**User sees.** `server restarted` — the test was aborted, completed phases are kept, and Run again
is offered.

## 12. HTTP/2 Single Connection vs Multi-Connection Ramp

**Situation.** With HTTP/2 or HTTP/3 at the proxy, six streams share one connection and one
congestion window. On high-RTT or lossy paths a single connection recovers more slowly from loss
and can measure lower than six HTTP/1.1 connections, which spread loss across six windows. The
browser cannot be made to open more connections.

**Behaviour.** The engine does not correct for it; it records the protocol and the plateau reason.
The ramp still adds streams (each is an HTTP/2 stream) and keeps them only if throughput rises.

**User sees.** The protocol next to the number. The deployment guide notes that HTTP/2 is optional
for the SPA, required only for the networkQuality layer, and that HTTP/1.1 may measure higher on
bad links; an operator can expose an HTTP/1.1-only entrypoint to compare
([deployment-example.md](deployment-example.md)).

## 13. Proxy Response Compression

**Situation.** A proxy compression middleware (Traefik `compress`, Caddy `encode`, nginx `gzip`)
compresses responses. Random bytes do not shrink, but the proxy may buffer, drop
`Content-Length`, switch to chunked encoding and add CPU latency.

**Behaviour.** BitGauge never compresses API responses. The engine checks each throughput response
for a `Content-Encoding` header.

**User sees.** `response compression detected`, with the advice to exclude BitGauge's routes from
compression.

## 14. Proxy Idle Timeouts on Long Continuous Runs

**Situation.** Proxies close idle or long-lived connections: nginx `proxy_read_timeout` (60 s by
default), Traefik entrypoint `readTimeout` (60 s by default in v3), load balancers in front of the
proxy. Continuous runs last hours.

**Behaviour.** Throughput requests last about 1 s and are re-issued continuously, so they never hit
idle timeouts; a connection closed by the proxy between requests is simply reopened. The WebSocket
carries a ping every 300 ms during load; if the proxy still closes it, the WebSocket-close sequence
of §6 runs: with the same epoch and no network event, the WebSocket is reopened and the test
continues with a gap in loaded latency (§6 step 4); if it cannot be reopened, path A falls back to
the HTTP probe for the rest of the test (§6 step 5). A connection reopened mid-phase marks path B
samples as having opened a new connection (`uncertain`).

**User sees.** Loaded-latency gaps in the chart and the `WebSocket reopened` notice. The deployment
guide sets read timeouts above the 120 s upload lifetime.

## 15. WebSocket Through Proxies

**Situation.** nginx needs explicit `Upgrade` and `Connection` headers to proxy WebSockets; some
proxies or security appliances block upgrades entirely.

**Behaviour.** If `/api/v1/ws` cannot be opened, including a handshake that neither opens nor
fails within 10 s (the ceiling of the idle-latency timeout), path A uses the HTTP fallback
([measurement.md §11.2](measurement.md#112-path-a-fallback--http-probe)): on HTTP/1.1 with the
5-stream reservation and grading only under its conditions; on HTTP/2 or HTTP/3 multiplexed on
the load connection. Idle latency uses `GET /api/v1/ping`.

**User sees.** The latency source (`websocket`, `http-h1-reserved`, `http-h2`, `http-h3`) in the
result detail;
`HTTP/1.1 probe reservation active — 5 streams` when it applies.

## 16. IPv6 vs IPv4 and the LAN/VPN Label

**Situation.** Dual-stack networks: the browser may reach BitGauge over IPv6 with a global address
even on the LAN, or over IPv4 through the VPN. Proxies report the address they saw.

**Behaviour.** The client IP is derived through trusted proxies only; IPv4-mapped IPv6 addresses
are normalised to IPv4. The suggested label comes from the address class
([wire-protocol.md §5](wire-protocol.md#5-get-apiv1info)): private, link-local and ULA addresses
suggest `LAN`, CGNAT and the Tailscale range suggest `VPN`, and a global IPv6 address suggests
nothing. A configurable subnet-to-label mapping is an open question
([open-questions.md](open-questions.md)).

**User sees.** The client IP with its version, and a label suggestion they can change; no
suggestion for global addresses.

## 17. Safari and iOS Quirks

**Situation.** Safari and every iOS browser (all WebKit) differ in ways that matter here: some
versions leave `nextHopProtocol` empty; Worker `XMLHttpRequest` upload progress and timing have had
bugs; JavaScript is suspended when the screen locks; script-writable storage of sites without user
interaction for seven days of browser use may be deleted (Intelligent Tracking Prevention); Low
Power Mode throttles timers.

**Behaviour.** An empty protocol is treated as HTTP/1.1 for the probe reservation and makes path B
`unavailable_h1` ([measurement.md §12.3](measurement.md#123-path-b-procedure)). The engine requests
a wake lock and handles suspension as §2 and §5. The history module asks for persistent storage
(`navigator.storage.persist()`, available in a secure context only, see §9) and the History screen
recommends export on Safari. Playwright's
WebKit is not Safari, so Worker XHR and `nextHopProtocol` behaviour are re-checked on real Safari
and iOS before each release ([technical-stack/testing.md](technical-stack/testing.md)).

**User sees.** "Protocol not reported — treated as HTTP/1.1" where relevant; a storage-persistence
hint on Safari.

## 18. Clock Skew Between Server and Client Timing

**Situation.** Server and client clocks are unrelated: different hosts, no synchronisation, and the
server grid deliberately reveals no wall-clock time.

**Behaviour.** No number depends on aligning them. Download timing is purely client-side; upload
aggregation, warm-up and the watermark use only the server grid plus causal ordering of client
events ([measurement.md §7.4](measurement.md#74-common-timeline-and-aggregation)); WebSocket and
HTTP RTTs are purely client-side. The only cross-clock element is the display offset between the
`sending` and `received` upload lines in the live chart, which is cosmetic. Result timestamps
(`startedAt`) come from the client's wall clock.

**User sees.** Nothing, unless the client's clock is wrong, in which case history dates are wrong
too.

## 19. Data Cap Hit Mid-Phase

**Situation.** The user set a data cap and it is reached while a direction is running.

**Behaviour.** Requests are sized so the cap is never exceeded; when less than the 16 KiB floor
remains, the current phase ends as if its maximum had been reached, so the window condition decides
between a number and `insufficient data`, and remaining throughput phases are skipped
([measurement.md §5](measurement.md#5-adaptive-duration)).

**User sees.** `data cap reached`, the data used, and which phases were skipped.

## 20. Base Path Mismatches

**Situation.** BitGauge runs with `server.base_path: /speed` but the proxy strips the prefix, or the
proxy forwards `/speed` to an instance configured for `/`. The SPA then loads with broken asset
paths or calls API routes that do not exist.

**Behaviour.** BitGauge routes on the full path and never guesses. The embedded `index.html` is a
template: once, at startup, the server substitutes the configured base path into its asset URLs
and into a `<meta name="bitgauge-base-path" content="/speed">` element, and serves the result from
memory. It uses neither `<base href>` (the CSP sets `base-uri 'none'`) nor an inline script (the
CSP allows none). The SPA reads the meta element and compares it with its own `location.pathname`
and with `basePath` from `GET /api/v1/info`. Unknown paths answer `404`.

The page fails the comparison when its path is not under the meta element's base path, when the
path under it is not one of the fixed SPA routes (a proxy that strips the prefix in front of an
instance configured for `/` serves the SPA at a path it does not know), or when `GET /api/v1/info`
reports another `basePath`; trailing slashes do not count. The first two are checked before any
request, so a page that fails them sends none.

**User sees.** Instead of a blank page, an error screen: `base path mismatch` — "BitGauge is
configured for /speed but this page was served at /", with the page path, the server's base path
and, when it differs, the API's, a Reload button and a link to the sub-path instructions in
[deployment-example.md §6](deployment-example.md#6-sub-path-deployment).

## Related

- [Measurement methodology](measurement.md)
- [Wire protocol](wire-protocol.md)
- [Example deployment and proxy requirements](deployment-example.md)
- [Security model](security.md)
- [UI screens](ui/screens.md)
