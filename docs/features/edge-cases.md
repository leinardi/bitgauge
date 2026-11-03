# Edge Cases

[Feature index](README.md) / Edge Cases

Situations where a naive speed test gives a wrong number, hangs or loses data, and what BitGauge
does in each. Each entry gives the situation, the behavior and what the user sees. Notices are
listed in [measurement.md §16](measurement.md#16-confidence-and-notices).

## 1. Sub-1 Mbit and High-RTT VPN Links

**Situation.** Mobile over VPN at 300 kbit/s to 1 Mbit/s with 300–600 ms RTT. Fixed large requests
never complete; client-side upload progress runs seconds ahead of the link.

**Behavior.** Requests start at 64 KiB and are sized to about 1 s at the observed per-stream rate,
down to a 16 KiB floor; the ramp starts at one stream and skips trials that would make requests too
thin (`floor-limited`); upload is server-timed; phases extend up to their maximum; idle-latency
timeouts scale with the running median and cap at 10 s. The slow-link budget is worked out in
[measurement.md §19.1](measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard).

**User sees.** `test extended` when a phase extends; `insufficient data` with an offer
of the next larger preset when even the maximum is not enough; data used is always shown.

> **Rust implementation (from the cutover):** a slow link is never cut by the 30 s stall rule as
> long as each write makes progress; the rule holds for every write of every response and of an
> upgraded WebSocket. ([rust-port.md](../rust-port.md#intended-differences-from-go), row 7.)

## 2. Mobile Browsers Throttling Background Tabs and Workers

**Situation.** Mobile browsers throttle timers and may suspend JavaScript, Workers included, when
the tab is in the background or the screen locks (iOS suspends almost immediately; Android Chrome
throttles hidden pages).

**Behavior.** During a test the SPA requests a screen wake lock (`navigator.wakeLock`) where
available, requests it again when the page becomes visible during the test (the browser releases
it while the page is hidden), and releases it when the run ends; a refused request changes
nothing else. The Worker runs a 100 ms housekeeping tick; a tick that arrives more than 1 s late
means the engine was throttled or suspended, and timestamps around it cannot be trusted. Hidden
pages are handled by §5.

A Continuous run holds the wake lock for as long as it runs; a late tick while the page is visible
never ends it, as in a bounded run.

**User sees.** A `timer throttling detected` notice on the result when late ticks occurred while
the page was visible (for example Low Power Mode); the advice to keep the screen on during tests.

## 3. HTTP/2 vs HTTP/1.1 via the Proxy

**Situation.** The browser speaks whatever the proxy negotiates: HTTP/1.1 (one TCP connection per
stream, six per origin), HTTP/2 (all streams on one connection) or HTTP/3. BitGauge itself always
speaks HTTP/1.1 to the proxy.

**Behavior.** The engine reads `nextHopProtocol` from each request's Resource Timing entry and
records it. On HTTP/1.1 with the WebSocket unavailable, the HTTP latency fallback reserves one
connection and caps streams at 5; path B (HTTP loaded responsiveness) is `unavailable_h1`. On HTTP/2
and HTTP/3, path B runs and transient upload failures leave failure gaps instead of ending the phase
([measurement.md §7.5](measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)).

**User sees.** The protocol in the connection info and in every result; "needs HTTP/2 or HTTP/3 at
the reverse proxy" where path B is unavailable. How the protocol changes throughput is §12.

## 4. Proxy Buffering That Distorts Upload

**Situation.** A proxy with request buffering on (nginx's default `proxy_request_buffering on`, or
a buffering middleware) receives the whole body before forwarding it. Client-timed tests then
measure the client-to-proxy hop plus buffer, and server-timed tests see each body arrive in one
burst.

**Behavior.** Arrival counts stay exact for what the server saw, so no number is invented, but the
series becomes bursts and gaps and fails the stability test. When a request's server duration is
below 10 % of its client duration (requests of at least 1 s), the engine flags it
([measurement.md §7.3](measurement.md#73-server-telemetry-per-request)).

**User sees.** `upload buffering suspected` (`proxy-buffering-suspected`), saying that a proxy or
the browser buffers request bodies, since the rule cannot tell the two apart (a browser can hold
the body back before sending it, with no proxy on the path), with a link to the proxy
requirements in [deployment-example.md](deployment-example.md); usually `confidence: low` with
reason `unstable`.

## 5. Tab Hidden Mid-Test

**Situation.** The user switches tabs or apps during a throughput phase. On mobile, JavaScript is
throttled or suspended almost at once; desktop browsers throttle the hidden page's main thread but
usually keep a dedicated Worker's timers and network callbacks running. Only suspension or
throttling of the Worker makes chunk timestamps and probe timings stop reflecting the network.

**Behavior.** The SPA forwards `visibilitychange` to the Worker, and the Worker watches its own
100 ms housekeeping tick (§2). While the page is hidden:

- If no tick arrives more than 1 s late, the engine keeps measuring; the Worker's timing is intact.
  This is the usual desktop case, so long Continuous runs survive a tab switch. The result carries
  the informational notice `page was hidden during the test`.
- At the first tick more than 1 s late while hidden, the engine stops the test at the last on-time
  tick, exactly like a user stop: in-flight requests are aborted, completed phases keep their
  results, and the interrupted direction reports a number only if its window up to that instant
  meets the minimum window. The download window ends at that tick; the upload, timed on the
  server grid, stops at once and its window ends at the confirmed watermark, as after any stop.
  Continuous runs end the same way, with the outcomes of [measurement.md
  §15](measurement.md#15-continuous-mode).
- A late tick counts as a pause of the hidden page when the page was hidden at any point since the
  last on-time tick, whichever of the late tick and the visibility message the resumed Worker
  handles first; only a tick late while the page stayed visible is timer throttling (§2).
- Idle latency, being short, is restarted when the page becomes visible again, also after a late
  tick; a late tick in the Info phase, which times nothing, changes nothing.

**User sees.** Either the informational notice, or `partial — stopped early` with "stopped because
the page was hidden and the browser paused the test", and a Run again button. A Continuous run
stopped this way with at least 3 fully known 1 s cells since its steady start is `complete`, as
after a user stop, and one with fewer is `partial` with its direction `insufficient-data`
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

**Behavior.**

- **On a network event**, the path the test is measuring has changed: the engine stops the test
  with an error result for the current phase, keeps completed phases, and does not merge
  measurements across the change. No WebSocket is reopened.
- **On an unexpected WebSocket close**, one sequence decides what happened:
  1. The engine tries once to reopen `/api/v1/ws` and calls `GET /api/v1/info`, with the
     idle-latency timeout policy ([measurement.md §10](measurement.md#10-idle-latency)).
     Throughput requests keep running meanwhile. Loaded latency records the ticks it cannot send
     as skipped ticks, a gap in its series, and does not switch to the HTTP fallback while the
     sequence runs; idle latency keeps its own behavior
     ([measurement.md §11.6](measurement.md#116-probe-bookkeeping)).
  2. `GET /info` succeeds with a **different epoch**: the server restarted, and §11 applies.
  3. `GET /info` **fails**, or a network event arrives meanwhile: the network changed, handled as
     above.
  4. `GET /info` succeeds with the **same epoch** and the reopen **succeeds**: the close was a
     transport event such as a proxy timeout; the test continues with the notice
     `WebSocket reopened` (§14).
  5. `GET /info` succeeds with the **same epoch** but the reopen **fails** (upgrade refused, or a
     `429` while the old slot is released): path A switches to the HTTP fallback for the rest of
     the test with the notice `WebSocket unavailable — HTTP latency fallback`
     ([measurement.md §11.2](measurement.md#112-path-a-fallback--http-probe)). The browser does
     not expose why a handshake failed, so the notice names both causes: the server or a reverse
     proxy did not accept a WebSocket, and other tabs on this address may be using the server's 4.
     On HTTP/1.1 the 5-stream reservation starts with the next direction: the current direction
     keeps its stream count and its loaded latency is `unavailable` with reason
     `reservation-broken`, because its reservation did not hold for the whole phase, and the
     grade's basis names the next direction alone. On HTTP/2 or HTTP/3 the current direction goes
     on with the fallback, and only its fallback samples count ([measurement.md §11.4](measurement.md#114-loaded-latency-statistics-and-availability)).

Request failures are handled by the phase rules (three consecutive failures end a phase, and on
HTTP/1.1 upload the first one does; [measurement.md §5](measurement.md#5-adaptive-duration)).

**User sees.** `network changed` — "Network changed during the test" with a retry button; completed
phases remain visible. Or, when the network did not change, one of the two WebSocket notices.

## 7. IndexedDB Unavailable (Private Mode)

**Situation.** Some private-browsing modes disable IndexedDB, keep it in memory only, or impose tiny
quotas; storage can also be blocked by policy.

**Behavior.** The history module opens its database at startup; if that fails or the quota is
exhausted, history is disabled for the session. Tests run normally; the current result can still
be exported as JSON or CSV and shared as an image.

**User sees.** "History is unavailable in this browser mode — results are not saved" on the
History screen and after each test.

## 8. Different Origins Give Separate Histories

**Situation.** The same BitGauge is reached as `http://192.168.1.10:8080` on the LAN and as
`https://speed.vpn.example` over the VPN. Browser storage is per origin.

**Behavior.** Each origin has its own history. Export from one and import into the other merges
them; import deduplicates by result `id`.

**User sees.** The History screen names the origin it shows ("stored only in this browser, for
speed.vpn.example") and points to export/import.

## 9. Clock and Timer Resolution

**Situation.** Browsers coarsen `performance.now()`: commonly to 100 µs, to 1 ms in some browsers
or modes, and finer (5 µs in Chromium) only when the page is cross-origin isolated.

**Behavior.** The SPA is served with COOP and COEP headers
([security.md §5](security.md#5-content-security-policy-and-security-headers)) to get the finest
timer available. Cross-origin isolation, like the wake lock (§2) and persistent storage (§17),
needs a **secure context**: it takes effect behind an HTTPS proxy (or on `localhost`), not on a
plain-HTTP LAN address such as `http://192.168.1.10:8080`, where timers stay coarser. 100 ms buckets
are unaffected by any of these resolutions. Latency statistics are reported no finer than the
detected resolution; a sub-resolution LAN RTT is shown as "< 1 ms" rather than as 0. Jitter on
sub-millisecond LANs is quantized and labeled with the resolution.

**User sees.** Honest latency numbers on LANs; the timer resolution, and whether the page was
cross-origin isolated, in the result detail.

## 10. Very Fast Links Where the Browser CPU Is the Bottleneck

**Situation.** At 2.5–10 Gbit/s the browser's network stack and the Worker's chunk loop saturate a
CPU core before the link saturates.

**Behavior.** The engine measures the Worker's busy fraction; above 90 % over the steady window the
direction is `confidence: cpu-bound`. Requests at the 256 MiB cap and up to 6 streams keep the
round trip between requests small, but not every per-request cost: some browsers prepare each upload
body before its first byte leaves, Firefox at about 4–5 Gbit/s on a desktop and close to 1 Gbit/s
on a phone. The engine lets one request prepare at a time while the others send
([measurement.md §7.2](measurement.md#72-client-side)); where preparation is still slower than the
link, the server sees short pauses between bursts, and the upload is reported as measured, usually
with `low` confidence for `unstable`. Safari takes about 100–150 ms to start each request, in both
directions, which on two streams empties half of every bucket at a request boundary; the engine
issues each stream's next request early ([measurement.md §3](measurement.md#3-adaptive-request-size))
so the link stays busy across the gap, in every browser whose gap shows. Firefox's ceiling is a
known, open browser issue. A result
whose upload idle share exceeded 20 %, in any browser, and a Firefox result with an upload headline
of at least 100 Mbit/s carry the `browser-upload-limit` notice
([measurement.md §16](measurement.md#16-confidence-and-notices)), which links to the reports
collected in [research/browser-upload-limits.md](../research/browser-upload-limits.md). The
harness tolerance at
≥ 2.5 Gbit/s is ±20 %
([technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness)); the confidence
level is defined in [measurement.md §16](measurement.md#16-confidence-and-notices).

A ceiling can also sit on the path and hold each connection rather than the link: a router that
forwards each connection on one CPU core, a network card queue, or one member of a link aggregate,
picked by hashing the connection. Two connections that hash together share it, so a ramp trial can
show no gain where one more connection would; from 900 Mbit/s the ramp tries one more step before
it plateaus
([measurement.md §8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare)). A
connection the browser replaces mid-phase can still land elsewhere and step the rate up or down;
the window then reads `unstable`.

**User sees.** "Limited by this device's CPU, not by the network", with tips: close other tabs, use
a desktop browser, compare with `networkQuality` or iperf3; where the browser's preparation
showed, or on Firefox at 100 Mbit/s and above, `browser upload limit` with a link to the known
reports.

## 11. Server Restart Mid-Test

**Situation.** The container restarts (deploy, crash, image update) during a test. Upload grid
indices from before and after the restart cannot be combined, and in-flight requests fail.

**Behavior.** A restart is detected by an epoch change, whichever arrives first:

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

**Behavior.** The engine does not correct for it; it records the protocol and the plateau reason.
The ramp still adds streams (each is an HTTP/2 stream) and keeps them only if throughput rises.

**User sees.** The protocol next to the number. The deployment guide notes that HTTP/2 is optional
for the SPA, required only for the networkQuality layer, and that HTTP/1.1 may measure higher on
bad links; an operator can expose an HTTP/1.1-only entrypoint to compare
([deployment-example.md](deployment-example.md)).

## 13. Proxy Response Compression

**Situation.** A proxy compression middleware (Traefik `compress`, Caddy `encode`, nginx `gzip`)
compresses responses. Random bytes do not shrink, but the proxy may buffer, drop
`Content-Length`, switch to chunked encoding and add CPU latency.

**Behavior.** BitGauge never compresses API responses. The engine checks each throughput response
for a `Content-Encoding` header.

**User sees.** `response compression detected`, with the advice to exclude BitGauge's routes from
compression.

## 14. Proxy Idle Timeouts on Long Continuous Runs

**Situation.** Proxies close idle or long-lived connections: nginx `proxy_read_timeout` (60 s by
default), Traefik entrypoint `readTimeout` (60 s by default in v3), load balancers in front of the
proxy. Continuous runs last hours.

**Behavior.** Throughput requests last about 1 s and are re-issued continuously, so they never hit
idle timeouts; a connection closed by the proxy between requests is simply reopened. The WebSocket
carries a ping every 300 ms during load; if the proxy still closes it, the WebSocket-close sequence
of §6 runs: with the same epoch and no network event, the WebSocket is reopened and the test
continues with a gap in loaded latency (§6 step 4); if it cannot be reopened, path A falls back to
the HTTP probe for the rest of the test (§6 step 5). A connection reopened mid-phase shows in the
next path B probe's timing entry (`connectStart ≠ connectEnd`) as a new connection, which makes the
direction's path B `uncertain` ([measurement.md §12.4](measurement.md#124-states)).

Path B keeps only its last 64 probes in Continuous, and reads its new-connection evidence over
them ([measurement.md §15](measurement.md#15-continuous-mode)): a connection the proxy reopened
hours before the end does not make the run's responsiveness `uncertain`, one reopened within its
last 64 probes does.

**User sees.** Loaded-latency gaps in the chart and the `WebSocket reopened` notice. The deployment
guide sets read timeouts above the 120 s upload lifetime.

## 15. WebSocket Through Proxies

**Situation.** nginx needs explicit `Upgrade` and `Connection` headers to proxy WebSockets; some
proxies or security appliances block upgrades entirely.

**Behavior.** If `/api/v1/ws` cannot be opened, including a handshake that neither opens nor
fails within 10 s (the ceiling of the idle-latency timeout), path A uses the HTTP fallback
([measurement.md §11.2](measurement.md#112-path-a-fallback--http-probe)): on HTTP/1.1 with the
5-stream reservation and grading only under its conditions; on HTTP/2 or HTTP/3 multiplexed on
the load connection. Idle latency uses `GET /api/v1/ping`.

**User sees.** The latency source (`websocket`, `http-h1-reserved`, `http-h2`, `http-h3`) in the
result detail; `WebSocket unavailable — HTTP latency fallback`, naming both causes as in §6 step 5
(the server or a reverse proxy did not accept a WebSocket; other tabs on this address may be using
the server's 4); `HTTP/1.1 probe reservation active — 5 streams` when it applies.

## 16. IPv6 vs IPv4 and the LAN/VPN Label

**Situation.** Dual-stack networks: the browser may reach BitGauge over IPv6 with a global address
even on the LAN, or over IPv4 through the VPN. Proxies report the address they saw.

**Behavior.** The client IP is derived through trusted proxies only; IPv4-mapped IPv6 addresses
are normalized to IPv4. The suggested label is the label of the longest `server.labels` prefix
that contains the normalized address, so an operator can name a WireGuard range in RFC 1918 space
`VPN` or a dual-stack LAN's global IPv6 prefix `LAN`
([configuration.md §2.1](configuration.md#21-server)). Without a match it comes from the address
class ([wire-protocol.md §5](wire-protocol.md#5-get-apiv1info)): private, link-local and ULA
addresses suggest `LAN`, CGNAT and the Tailscale range suggest `VPN`, and a global IPv6 address
suggests nothing. An operator who wants both families labeled lists a prefix for each.

**User sees.** The client IP with its version, and a label suggestion they can change; no
suggestion for a global address that no `server.labels` entry covers.

## 17. Safari and iOS Quirks

**Situation.** Safari and every iOS browser (all WebKit) differ in ways that matter here: some
versions leave `nextHopProtocol` empty; Worker `XMLHttpRequest` upload progress and timing have had
bugs; JavaScript is suspended when the screen locks; script-writable storage of sites without user
interaction for seven days of browser use may be deleted (Intelligent Tracking Prevention); Low
Power Mode throttles timers.

**Behavior.** An empty protocol is treated as HTTP/1.1 for the probe reservation and makes path B
`unavailable_h1` ([measurement.md §12.3](measurement.md#123-path-b-procedure)). The engine requests
a wake lock and handles suspension as §2 and §5. The history module asks for persistent storage
(`navigator.storage.persist()`, available in a secure context only, see §9) and the History screen
recommends export on Safari, which the page recognizes from `navigator.vendor` in `web/src/lib/`,
never in the engine. Playwright's
WebKit is not Safari, so Worker XHR and `nextHopProtocol` behavior are re-checked on real Safari
and iOS before each release ([technical-stack/testing.md](technical-stack/testing.md)).

**User sees.** "Protocol not reported — treated as HTTP/1.1" where relevant; a storage-persistence
hint on Safari.

## 18. Clock Skew Between Server and Client Timing

**Situation.** Server and client clocks are unrelated: different hosts, no synchronization, and the
server grid deliberately reveals no wall-clock time.

**Behavior.** No number depends on aligning them. Download timing is purely client-side; upload
aggregation, warm-up and the watermark use only the server grid plus causal ordering of client
events ([measurement.md §7.4](measurement.md#74-common-timeline-and-aggregation)); WebSocket and
HTTP RTTs are purely client-side. The only cross-clock element is the display offset between the
`sending` and `received` upload lines in the live chart, which is cosmetic. Result timestamps
(`startedAt`) come from the client's wall clock.

**User sees.** Nothing, unless the client's clock is wrong, in which case history dates are wrong
too.

## 19. Data Cap Hit Mid-Phase

**Situation.** The user set a data cap and it is reached while a direction is running.

**Behavior.** Requests are sized so the cap is never exceeded; when less than the 16 KiB floor
remains, the current phase ends as if its maximum had been reached, so the window condition decides
between a number and `insufficient data`, and remaining throughput phases are skipped
([measurement.md §5](measurement.md#5-adaptive-duration)).

In Continuous mode the data cap ends the run, which then reads like any other ending: `complete`
with at least 3 fully known 1 s cells since the steady start, `partial` with its direction
`insufficient-data` otherwise ([measurement.md §15](measurement.md#15-continuous-mode)).

**User sees.** `data cap reached`, the data used, and which phases were skipped. A direction the
cap ended without a number reads `insufficient data` with no larger-preset offer, its wording
saying the data cap ended it ([measurement.md §8.6](measurement.md#86-shortfall)).

## 20. Base Path Mismatches

**Situation.** BitGauge runs with `server.base_path: /speed` but the proxy strips the prefix, or the
proxy forwards `/speed` to an instance configured for `/`. Either the page itself is not found, or
it loads with broken asset paths or calls API routes that do not exist.

**Behavior.** BitGauge routes on the full path and never guesses. The embedded `index.html` is a
template: once, at startup, the server substitutes the configured base path into its asset URLs
and into a `<meta name="bitgauge-base-path" content="/speed">` element, and serves the result from
memory. It uses neither `<base href>` (the CSP sets `base-uri 'none'`) nor an inline script (the
CSP allows none). The SPA reads the meta element and compares it with its own `location.pathname`
and with `basePath` from `GET /api/v1/info`. Unknown paths answer `404`.

The page fails the comparison when its path is not under the meta element's base path, when the
path under it is not one of the fixed SPA routes, or when `GET /api/v1/info` reports another
`basePath`; trailing slashes do not count. The first two are checked before any request, so a page
that fails them sends none.

The comparison runs only once the SPA's script has loaded, and the asset URLs are absolute under
the configured base path, which `/result/{id}` needs. So the error screen covers a page whose
assets still load, such as a proxy that forwards both the prefixed and the unprefixed paths to an
instance configured for `/`. The common stripping setups end earlier: an instance configured for
`/speed` behind a proxy that strips the prefix answers `404` for the page itself, and an instance
configured for `/` behind a proxy that strips `/speed` serves `index.html`, whose `/assets/…`
requests the proxy does not forward, so the page stays blank.

**User sees.** When the page's assets load, an error screen instead of a broken page:
`base path mismatch` — "BitGauge is configured for /speed but this page was served at /", with
the page path, the server's base path and, when it differs, the API's, a Reload button and a link
to the sub-path instructions in
[deployment-example.md §6](deployment-example.md#6-sub-path-deployment). When they do not, a `404`
or a blank page; the sub-path instructions say not to strip the prefix for that reason.

## Related

- [Measurement methodology](measurement.md)
- [Wire protocol](wire-protocol.md)
- [Example deployment and proxy requirements](deployment-example.md)
- [Security model](security.md)
- [UI screens](ui/screens.md)
