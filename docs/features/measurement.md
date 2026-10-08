# Measurement Methodology

[Feature index](README.md) / Measurement

This page is the heart of the specification. It defines how the engine measures throughput, latency,
bufferbloat, responsiveness and quality scores, and which number it reports for each. Terms are
defined in the [glossary](glossary.md). The HTTP endpoints referenced here are specified in
[wire-protocol.md](wire-protocol.md); configuration keys in [configuration.md](configuration.md).

All rules on this page are engine rules: the engine is framework-free TypeScript in a Web Worker
with an injectable clock, so every rule is testable with synthetic timelines
([technical-stack/testing.md](technical-stack/testing.md)).

Defaults used throughout:

| Parameter | Default | Section |
| --- | --- | --- |
| Bucket and server grid cell | 100 ms | §2 |
| Initial request size | 64 KiB | §3 |
| Request target duration | 1 s | §3 |
| Request size floor | 16 KiB | §3 |
| Growth per step | at most 8× | §3 |
| Server cap per request (download and upload) | 256 MiB | §3 |
| Maximum streams | 6 | §4 |
| Engine per-request timeout | 30 s | §5 |
| Server upload request lifetime | 120 s | §7 |
| Loaded-latency probe interval | 300 ms | §11 |
| Overhead compensation | 0 % | §9 |

## 1. Phases and Order

A test runs these phases, in this order by default:

1. **Info.** `GET /api/v1/info` returns the server epoch, limits, default settings, the client IP
   and the context label inputs. The engine opens the WebSocket at `/api/v1/ws` and sends one idle
   `GET /api/v1/small` as the path B capability check (§12). Info always runs and cannot be skipped:
   every later phase needs the epoch and the limits, and it costs one round trip. (This narrows
   "every phase can be skipped" to the three measuring phases; the current answer is tracked in
   [open-questions.md](open-questions.md).)
2. **Idle latency.** Pings with no load on the link (§10).
3. **Download.** Adaptive download (§3–§6, §8).
4. **Upload.** Adaptive, server-timed upload (§3–§5, §7, §8).

Idle latency, download and upload can each be skipped. The order of download and upload is
configurable; idle latency, when enabled, always runs before them because loaded latency is
reported as an increase over idle latency. When idle latency is skipped, loaded latency is reported
without an increase, and neither the bufferbloat grade nor the quality scores that need the increase
are computed.

Loaded latency (§11) and HTTP loaded responsiveness (§12) are not phases: they run alongside
download and upload.

## 2. Sampling Model

Throughput is accounted in **100 ms buckets** summed across all streams of a direction, forming one
time series per direction. That series feeds the live gauge, the live chart and the result.

- **Download** buckets are on the client timeline. Each chunk read from a response body is counted
  into the bucket of its `performance.now()` arrival timestamp (§6). The series is exact and has no
  unknown buckets.
- **Upload** buckets are the cells of the **server grid**. The server counts the bytes of each read
  into the cell of the instant the read returned and reports those arrival counts per request
  (§7). The aggregate is exact per cell but only known up to the window end; later cells are
  `unknown`, which is distinct from a confirmed zero.
- The upload gauge is the one exception: it is driven by client `upload.onprogress` for
  responsiveness and is labelled as sending progress. It never feeds a number.

Every decision (ramp, warm-up, extension, stop) reads only the **evaluation series**: the download
series up to the current bucket, or the upload series up to the current window end (§8).

## 3. Adaptive Request Size

A fixed request size cannot suit both ends of the range: a 30 MiB request takes about eight
minutes at 500 kbit/s and does not complete within a test, while small requests at multi-Gbit
rates are dominated by per-request overhead. BitGauge sizes each request so that it
takes about **1 s** at the rate observed on its stream, following Cloudflare's request-size ramp.

**Rule.** The first request on every stream is 64 KiB. Every next request on a stream has size:

```text
size_next = clamp(rate_s × 1 s, 16 KiB, min(8 × size_prev, cap))
```

- `rate_s` is the stream's rate on its last completed request: bytes ÷ transfer time, where transfer
  time is the server duration `durationMs` on upload and the first-to-last chunk time on download,
  with a floor of one bucket (100 ms). Request latency (RTT, time to first byte) is excluded, so a
  request takes about 1 s plus one RTT.
- **Growth** is at most 8× per step, which bounds overshoot when early requests are latency-bound.
  Sizes may shrink without limit down to the floor when the rate drops.
- **Floor** 16 KiB: below it, per-request overhead dominates.
- **Cap** = the server's per-request limit from `GET /info` (`max_download_bytes`,
  `max_upload_bytes`, default 256 MiB each). At more than about 2.1 Gbit/s per stream, capped
  requests take less than 1 s; this only adds one LAN round trip per request.
- When a data cap is set, a request is shrunk so that data used plus the size of all requests in
  flight never exceeds the cap; when less than the floor remains, no new request is issued (§5).

**Slow-link example (500 kbit/s ≈ 61 KiB/s, one stream).** The first 64 KiB request takes about
1.05 s plus RTT. `rate_s` ≈ 61 KiB/s, so the next request is 61 KiB and takes about 1 s. With two
streams each sees about 30.5 KiB/s and requests about 30 KiB. Nothing ever waits for a transfer
that cannot finish.

**Fast-link example (10 Gbit/s ≈ 1.25 GB/s).** On one stream, sizes grow 64 KiB → 512 KiB → 4 MiB →
32 MiB → 256 MiB (cap) over four requests, each latency-bound at first and then rate-bound; at the
cap a request takes about 0.2–0.4 s depending on the single-stream rate. With six streams sharing
1.25 GB/s, each stream sees about 208 MB/s and requests about 198 MiB. At this end of the range the
browser CPU, not request sizing, is the limit (§16).

The size rule is cross-checked against ndt7's message scaling rule, which grows WebSocket messages
when they are small relative to the bytes already transferred
([research/ndt7.md](../research/ndt7.md)).

## 4. Adaptive Stream Count

One TCP connection cannot fill every link: a single stream may be limited by its congestion window
on high-RTT paths or by per-connection CPU at multi-Gbit rates. Too many streams on a slow link
split it into streams too thin to complete a request. BitGauge therefore ramps the stream count
and keeps a step only when it measurably helps, the way fast.com adds connections.

**Modes.**

- **Auto** (default): the ramp 1 → 2 → 4 → 6, with baseline, trial, settle and compare steps, as
  specified in §8.
- **Fixed N**: N streams (1 to the effective cap) start together; no ramp.
- **Single**: exactly one stream, for single-connection tests; equivalent to fixed 1 and labelled as
  single-connection in the result.

**Effective cap.** The configured maximum (default 6), bounded by the server's
`max_streams_per_client` from `GET /info`, and lowered to 5 while the HTTP/1.1 probe reservation is
active (§11). Auto-mode trials are clamped to the effective cap and may be skipped by the floor
rule (§8).

**HTTP/1.1 and HTTP/2.**

- Browsers open at most **six HTTP/1.1 connections per origin**. Six streams are therefore one
  connection each, and the maximum of 6 is also the default on HTTP/2 and HTTP/3. WebSocket
  connections do not count against this limit.
- With **HTTP/2** (or HTTP/3) at the proxy, all streams are multiplexed on **one** connection and
  share one congestion window. The browser cannot be told to open more connections. On high-RTT or
  lossy paths one shared connection ramps more slowly and can measure lower than six HTTP/1.1
  connections. This is not corrected for; it is surfaced: the result records the negotiated
  protocol, and the proxy guidance says HTTP/2 is optional for the SPA and only required for the
  networkQuality layer ([deployment-example.md](deployment-example.md),
  [edge-cases.md](edge-cases.md)).
- The negotiated protocol is read from `nextHopProtocol` in the Resource Timing entry of each
  throughput request and shown in the connection info. An empty value (some Safari versions) is
  reported as `unknown`; for the probe reservation an unknown protocol is treated as HTTP/1.1.

**Per-client limits.** If the server answers `429` because `max_streams_per_client` is shared by
several browsers behind one address, the request counts as failed and the engine records a notice.
On download, and on upload over HTTP/2 or HTTP/3 (where the failed upload leaves a failure gap,
§7.5), the engine lowers the effective cap by one for the rest of the phase and continues. On upload
over HTTP/1.1 or an unreported protocol, the failure ends the phase instead (§7.5).

## 5. Adaptive Duration

Each direction has a minimum and a maximum duration taken from the preset (§8):

- A phase runs at least its **minimum**. From the minimum on, it ends as soon as the **window
  condition** holds: the steady window covers at least 3 s, and on upload at least 3 confirmed
  requests lie inside it; on download at least two different requests contributed bytes to it.
  Ending at the first instant the condition holds is the early stop on stability: a stable link
  ends at the minimum.
- If the condition does not hold, the phase is **extended** past the preset's nominal duration up to
  its **maximum**, so slow links get enough completed requests. An extended phase carries the
  `slow link — test extended` notice. On upload the condition is tested on the confirmed window
  (§8), so the phase keeps sending until the *confirmed* window is long enough.
- At the maximum without the condition, the direction reports `insufficient data` (§8 Shortfall).

**Ending a phase.**

- **Download** ends at the end instant: in-flight requests are aborted, bytes already read are kept,
  and the window ends at the abort instant.
- **Upload** stops issuing new requests at `max − 1 s` (the request target) or when the window
  condition holds. In-flight requests may finish within a grace of `min(2 s, 2 × d)`, where `d` is
  the expected duration of the longest in-flight request (normally the 1 s target); then they are
  aborted. Basing the grace on the in-flight request's expected duration rather than on the fixed
  1 s target is what the slow-link budget in §19.1 needs (2 × 1.75 s); it is the current answer to
  an item tracked in [open-questions.md](open-questions.md). A phase that runs
  to its maximum therefore ends at most about 1 s after it. Aborted
  requests only lower the confirmed watermark; because no request is issued after the decision, the
  final window is never shorter than the window that satisfied the condition.

**Timeouts and failures.** The engine aborts any request after **30 s** and counts it as failed.
With the 1 s size target, a 30 s request is unreachable above about 4 kbit/s per stream. How a
failed request (timeout, error status, rejected response) affects the phase depends on the direction
and protocol:

- **Download, and upload over HTTP/2 or HTTP/3.** A single failure does not stop the phase: the
  stream issues its next request and the measurement continues. On download the bytes already read
  are kept; on upload the request has no telemetry and its server activity becomes a failure gap
  once a later request confirms (§7.5). **Three consecutive failed requests** in a direction end the
  phase with an error result.
- **Upload over HTTP/1.1 or an unreported protocol.** The first failure ends the phase, with a
  number from the window up to that failure or `insufficient data`, and the notice
  `upload interrupted by a failed request` (§7.5). The three-failures rule does not apply there,
  because a single failure already ends the phase.

**Data cap.** An optional limit on data used per test (default: none). Requests are sized so the cap
is never exceeded (§3). When the remaining budget is below the 16 KiB floor, the current phase ends
as if its maximum had been reached (the window condition decides between a number and
`insufficient data`), remaining throughput phases are skipped, and the result carries the
`data cap reached` notice.

**Data used** is the sum of throughput bytes in both directions: bytes read by the client on
download and bytes sent by the client on upload, including warm-up and aborted or failed requests.
Latency probes and protocol overhead are not included. It is shown live and in every result.

## 6. Download Mechanics

- Each stream issues `fetch('/api/v1/download?bytes=N', { cache: 'no-store' })` from the Worker,
  with an `AbortController` per request for stop, timeout and phase end.
- The body is read with a `ReadableStream` reader. For every chunk the engine records its byte count
  and the `performance.now()` timestamp at which `read()` resolved, adds it to the bucket of that
  instant, and discards the chunk. Nothing is buffered beyond the current chunk.
- The server sends exactly `N` bytes from an in-memory random buffer with `Content-Length`,
  `Cache-Control: no-store` and no `Content-Encoding`. Browsers do not let a page set
  `Accept-Encoding`, so identity encoding is a server and proxy property; random bytes are
  incompressible, so a compressing proxy distorts timing only slightly, and the engine records a
  notice if a response arrives with a `Content-Encoding` header
  ([edge-cases.md](edge-cases.md)).
- A response whose byte count differs from `N` without an abort counts as a failed request.
- A cancelled or aborted download keeps every byte already read; the window ends at the abort
  instant. Download therefore needs none of the upload machinery in §7.

## 7. Upload Mechanics

### 7.1 Why the Server Times Upload

Client-side upload progress reports bytes leaving the browser, not bytes arriving at the server. OS,
VPN and modem send buffers hold seconds of data at low speeds, so progress events run ahead of the
link and a client-timed result runs ahead of the real rate. A server that answers before reading
the whole body has the same effect. BitGauge's upload number
therefore comes **only** from server-reported arrival counts of confirmed requests.

### 7.2 Client Side

- Uploads use `XMLHttpRequest` in the Worker; `fetch()` has no cross-browser upload progress.
- The body is a `Blob` built from a 1 MiB buffer filled once per test with
  `crypto.getRandomValues` (in 64 KiB calls). Because a browser may materialise a `Blob` of
  repeated parts, the engine keeps one master `Blob` that grows by doubling to the largest size
  needed and sends `slice(0, N)` of it, so memory stays at about the largest request size.
- `Content-Type: application/octet-stream`, explicit `Content-Length` (never chunked).
- `upload.onprogress` drives only the live gauge and the faint `sending` line of the chart.
- The engine records `t_send` (just before `send()`) and `t_done` (response received) per request
  on the client clock; these are used only for the watermark's causal ordering (§7.5) and the
  display offset.

### 7.3 Server Telemetry per Request

The server keeps one **global 100 ms grid** on its monotonic clock. Its origin is process start plus
a random offset that is a whole number of cells, so the grid reveals neither wall-clock time nor
uptime, and every request shares the same cell boundaries. While draining a body, the handler
counts each read's bytes into the cell of the instant the read returned. The counts live only while
the body is being read and are returned in the response; no state survives the request and the
server correlates nothing across requests, so the stateless invariant holds.

Response of `POST /api/v1/upload`:

```json
{
  "epoch": "<random id generated at process start>",
  "bucketMs": 100,
  "firstBucket": 1234567,
  "buckets": [6144, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 12288, 6144],
  "bytes": 122880,
  "startMs": 123456750,
  "durationMs": 1000
}
```

This example is a 120 KiB request at a steady 120 KiB/s: the first byte is read 50 ms into cell
1234567 (which covers 123456700–123456800 ms), so that cell holds 50 ms of arrivals; nine full cells
follow; the last byte is read at 123457750 ms, 50 ms into cell 1234577.

- `firstBucket` is the absolute grid index of `buckets[0]`, so `firstBucket = floor(startMs / 100)`;
  `Σ buckets == bytes`.
- `startMs` (first byte read, on the grid's timeline) and `durationMs` (first to last byte read) are
  diagnostics and inputs to the watermark; the headline never uses them directly.
- Header `Server-Timing: bg-recv;dur=<durationMs>`.
- `bucketMs` is **always 100**. There is no coarsening, so every request's counts add exactly on the
  shared grid. Instead the server bounds each request's **lifetime**: it stops reading a body after
  120 s (1200 cells) and answers `408` with no telemetry. The engine's own 30 s timeout (§5) keeps
  normal requests far below that.

**Validation.** The client rejects a response (counts it as a failed request) when `bytes` differs
from the bytes it sent. If `epoch` differs from the epoch `GET /info` reported at test start, the
server restarted mid-test: grid indices from before and after cannot be combined, so the test is
aborted with the `server restarted` notice ([edge-cases.md](edge-cases.md)).

**Proxy buffering.** With request buffering on at the proxy, the server reads each body in one burst
after the client finished sending. The counts are still exact for what the server saw, but the
series turns into bursts and gaps and fails the stability test (§8). When a request's `durationMs`
is below 10 % of its client duration `t_done − t_send` for requests of at least 1 s, the result
carries a `proxy buffering suspected` notice ([deployment-example.md](deployment-example.md)).

### 7.4 Common Timeline and Aggregation

Because every request reports counts on the same grid, the aggregate for a cell *b* is

```text
S_up[b] = Σ over confirmed requests of their count for cell b
```

and it is the exact number of bytes the server read in that cell. A request whose first byte
arrives at 1050 ms simply has its first count in cell 10 (1000–1100 ms), covering 50 ms of arrivals;
no split is estimated. No client/server clock alignment is needed for the aggregate, the headline,
the peak or the warm-up decisions.

The only place client time meets server time is the live chart, where the faint `sending` line
(client `onprogress`) is drawn against the solid `received` line using a display-only offset: the
median over confirmed requests of `t_done − (startMs + durationMs)`. This offset is cosmetic, its
error under load is unbounded, and it never feeds a number.

### 7.5 Phase Start, Measurement End and the Confirmed Watermark

- **Phase start** `P_start` = min `startMs` over confirmed requests of the phase.
- **Measurement end** `M_end` = max `startMs + durationMs` over confirmed requests, once the phase
  is over and the grace period has elapsed (no more responses can arrive). `M_end_so_far` is the
  same maximum over the requests confirmed so far. Both `P_start` and `M_end` are finite for every
  phase that confirmed at least one request.
- **Confirmed cell.** A cell is confirmed when every request that could have been active in it is
  confirmed; otherwise it is `unknown`.
- **Lower bound.** Let *U* be the set of requests without telemetry (in flight, aborted, failed).
  For each `u ∈ U`, a causal lower bound for its server start is

  ```text
  lb(u) = max { startMs(c) + durationMs(c) : c confirmed, t_done(c) ≤ t_send(u) }
  ```

  A request that fully completed on the client before *u* was even sent certainly ended on the
  server before *u* began there. `lb(u) = P_start` when *u* has no qualifying *c*.
- **Upper bound for ended requests (HTTP/2 and HTTP/3 only).** A request that ended without
  telemetry (aborted, timed out, answered with an error status, or rejected by validation) has a
  client end instant `t_end(u)`. When the upload requests use HTTP/2 or HTTP/3 (from
  `nextHopProtocol`), the bytes of a request sent after `t_end(u)` reach the proxy after the last
  bytes of *u*:
  - **HTTP/2:** every stream shares one TCP connection, which delivers in order. The bytes of *u*
    were written before its stream was reset or answered, so they arrive before any later request's
    bytes.
  - **HTTP/3:** QUIC streams are not ordered relative to each other, but once the client sends
    `RESET_STREAM` for *u* (or receives `STOP_SENDING` or a response), it stops sending and
    retransmitting *u*'s data. Data of *u* still in the network was sent before `t_end(u)` on the
    same path as the later request, which is sent after `t_end(u)`.

  The hop from the proxy to BitGauge is a fast local link that preserves this order within a
  fraction of a cell. Then

  ```text
  ub(u) = min { startMs(c) : c confirmed, t_send(c) ≥ t_end(u) }
  ```

  bounds the server activity of *u* from above.
- **No upper bound on HTTP/1.1.** On HTTP/1.1, or when the protocol is not reported, each stream has
  its own TCP connection. After an abort or an early error response, the kernel send buffer of the
  closed socket and any proxy buffer can keep delivering bytes of *u* after later requests started
  on other connections, so `ub(u)` is never defined there.
- **Open requests and failure gaps.** A request in *U* is **open** while it is in flight or while
  `ub(u)` is undefined (no confirmed request was sent after it ended, or the protocol does not allow
  an upper bound). An ended request with a defined `ub(u)` is **closed**: its unknown server
  activity is confined to the **failure gap** `[lb(u), ub(u))`. Cells overlapping a failure gap are
  excluded from every statistic, bytes and time alike; the series continues after the gap. On
  HTTP/2 and HTTP/3 a transient failure (a `429`, a timeout, a rejected response) therefore costs
  only its gap, not the rest of the phase.
- **Failures on HTTP/1.1.** A failed upload request stays open and freezes the window end at
  `lb(u)`, so continuing to send would only spend data. The engine therefore ends the phase at the
  failure: it stops issuing requests, gives the in-flight ones the grace of §5, and reports the
  window up to `W_end_final` if it meets the minimum window (§7.6), otherwise
  `insufficient data`, with the notice `upload interrupted by a failed request`. Continuous upload
  runs end the same way, with a hint that HTTP/2 at the proxy lets long upload runs survive
  transient failures. The failure-gap refinement and this HTTP/1.1 rule are the current answer to
  an item tracked in [open-questions.md](open-questions.md).
- **Confirmed watermark `C`.** `C = min over open u of lb(u)` when there is an open request; when
  there is none (every request of the phase was confirmed or is closed) the watermark is not a limit
  and `C = M_end`.
- **Window end.** At any instant `W_end = min(C, M_end_so_far)`; after the phase
  `W_end_final = min(C_final, M_end)`, always finite. Every cell that ends at or before `W_end` and
  does not overlap a failure gap is confirmed; the cell containing `W_end` and everything after it
  is `unknown`. Requests aborted at the end of a phase have no later confirmed request, stay open
  and bound `C`, exactly as in worked example B.
- Because streams re-request immediately after each completion, `lb(u)` for an in-flight request on
  a stream is tight (its predecessor on that stream), so the confirmed prefix normally lags the
  present by about one request duration plus one RTT: the **confirmation delay**.

### 7.6 Headline, Peak and Minimum Window

- **Headline.**

  ```text
  upload = Σ_{b ∈ W} S_up[b] / (|W| × bucketMs)
  ```

  where *W* is the set of grid cells that lie **entirely** inside `[warm-up end, W_end_final)` on
  the server timeline and overlap no failure gap. The partial cells at either edge are excluded;
  they are the only approximation (at most 2 cells of at least 30, plus the edge cells of any
  failure gap), and their bytes are simply not counted on either side of the ratio. Requests
  straddling the warm-up boundary count only for their cells inside *W*. No alignment error term
  exists and no intra-cell split is ever estimated.
- **Peak.** p90 of `S_up[b]` over *W*, labelled "peak", never the headline.
- **Minimum window.** If `|W| × bucketMs < 3000 ms`, or fewer than 3 confirmed requests lie inside
  *W*, the upload result is `insufficient data`: no number, data used shown. If the phase was
  stopped by the user it is additionally `partial`. The phase never reports a number from one
  request.
- **Phase end and aborted requests.** As in §5: no new requests from `max − 1 s` or from the window
  decision; in-flight requests get the grace, then are aborted. Aborted and failed requests have no
  telemetry, so they only lower `C` (while open) or leave a failure gap (once closed); their bytes
  are never counted. On HTTP/2 and HTTP/3, three consecutive failed requests end the phase with an
  error result; on HTTP/1.1 the first failure ends it (§5).

### 7.7 Worked Example A — Two Overlapping Streams With Non-Aligned Starts

Server grid, cells of 100 ms (cell *k* covers `[100k, 100k + 100)` ms).

- **r1**: first byte at 1050 ms, last at 2100 ms, 64 KiB at a steady ≈ 61 KiB/s → `firstBucket` 10,
  counts ≈ [3.0, 6.1 × 10] KiB (cell 10 holds 50 ms of arrivals, cells 11–20 a full 100 ms each).
- **r2**: first byte at 1620 ms, last at 2720 ms, 64 KiB at ≈ 58 KiB/s → `firstBucket` 16,
  counts ≈ [4.7, 5.8 × 10, 1.2] KiB (cell 16 holds 80 ms, cell 27 the last 20 ms).

`S_up` per cell is the plain sum:

| Cell | Interval (ms) | r1 (KiB) | r2 (KiB) | `S_up` (KiB) | In window `[1600, 2700)` |
| --- | --- | --- | --- | --- | --- |
| 10 | 1000–1100 | 3.0 | — | 3.0 | no |
| 11 | 1100–1200 | 6.1 | — | 6.1 | no |
| 12 | 1200–1300 | 6.1 | — | 6.1 | no |
| 13 | 1300–1400 | 6.1 | — | 6.1 | no |
| 14 | 1400–1500 | 6.1 | — | 6.1 | no |
| 15 | 1500–1600 | 6.1 | — | 6.1 | no |
| 16 | 1600–1700 | 6.1 | 4.7 | 10.8 | yes |
| 17 | 1700–1800 | 6.1 | 5.8 | 11.9 | yes |
| 18 | 1800–1900 | 6.1 | 5.8 | 11.9 | yes |
| 19 | 1900–2000 | 6.1 | 5.8 | 11.9 | yes |
| 20 | 2000–2100 | 6.1 | 5.8 | 11.9 | yes |
| 21 | 2100–2200 | — | 5.8 | 5.8 | yes |
| 22 | 2200–2300 | — | 5.8 | 5.8 | yes |
| 23 | 2300–2400 | — | 5.8 | 5.8 | yes |
| 24 | 2400–2500 | — | 5.8 | 5.8 | yes |
| 25 | 2500–2600 | — | 5.8 | 5.8 | yes |
| 26 | 2600–2700 | — | 5.8 | 5.8 | yes |
| 27 | 2700–2800 | — | 1.2 | 1.2 | no |
| Sum | | 64.0 | 63.9 | 127.9 | 93.3 over 11 cells |

If the window were `[1600, 2700)`, *W* is cells 16–26 (11 full cells) and the headline is Σ ≈ 93.3
KiB (from the unrounded counts; the rounded cells above add to 93.2) / 1.1 s ≈ 85 KiB/s ≈ 0.69
Mbit/s, read straight off the grid. A completion-based estimate, 2 × 64 KiB / 1.67 s (first byte of
r1 to last byte of r2), would say 0.63 Mbit/s, and it would move with where the completions happened
to fall.

### 7.8 Worked Example B — Cancellation Mid-Request

Two streams, requests of about 1 s.

- Stream 1: **r7** confirmed (`startMs` 6000, `durationMs` 1000, done on the client at t ≈ 7.15 s);
  **r9** sent at 7.15 s.
- Stream 2: **r8** confirmed (`startMs` 6400, `durationMs` 1000, done on the client at ≈ 7.55 s);
  **r10** sent at 7.55 s.
- The user stops at 7.8 s; r9 and r10 are aborted and have no telemetry.

Then:

- `lb(r9)` = max end of confirmed requests done by 7.15 s = r7's end = 7000 (r8 finished later on
  the client, so it does not qualify).
- `lb(r10)` = max(r7 end 7000, r8 end 7400) = 7400.
- `C = min(7000, 7400) = 7000`; `M_end = 7400`; `W_end_final = min(7000, 7400) = 7000`.

Confirmed cells end at server time 7000 ms. r8's cells from 7000 to 7400 are known, but they sit
after `W_end` because r9 might have been active there, so they are excluded. The window is the full
cells inside `[warm-up end, 7000)`; the result is `partial` and the UI says "stopped early, upload
based on the first 7.0 s".

Had the phase instead ended cleanly (r9 and r10 confirmed, say ending at 8200 and 8600), *U* would
be empty, `M_end = 8600`, `W_end_final = 8600`, and the window would be every full cell up to 8600.

### 7.9 Download Needs None of This

The `ReadableStream` reader yields chunk sizes and `performance.now()` timestamps directly, so
`S_down[t]` is exact on the client timeline and has no unknown buckets. Cancelled downloads keep the
bytes already read; the window ends at the abort instant.

## 8. Warm-Up, Ramp and Steady Window

### 8.1 Evaluation Series and Confirmation Delay

All decisions below read the **evaluation series**: for download, `S_down` up to the current bucket
(exact, live); for upload, `S_up` up to the current window end `W_end = min(C, M_end_so_far)` only.
Cells at or after `W_end`, and cells overlapping a failure gap (§7.5), are `unknown` and are never
treated as zero; interval means and the "last 10 confirmed buckets" skip them. Every upload decision
lags the present by roughly one request duration plus one RTT: the **confirmation delay**, typically
1–2 s and longer on slow or high-RTT links. Phase minimums for upload include this delay.

### 8.2 Ramp (Auto Mode) — Baseline, Trial, Settle, Compare

Intervals: `I_s = max(1 s, 4 × RTT)` (settling; lets a new stream leave slow start) and
`I_m = max(500 ms, 2 × RTT)` (measurement), with RTT = the idle-latency median (§10; 100 ms if idle
latency was skipped). The throughput of an interval is the mean of its confirmed buckets.

1. **Baseline.** Start with 1 stream. After `I_s` from the first confirmed bucket, measure `T_prev`
   and `T_cur` over two consecutive `I_m`. While `T_cur > 1.05 × T_prev` (the single stream is
   still growing) keep measuring, up to a baseline cap of 3 s after `I_s`; `T_base` is the last
   `T_cur`.
2. **Trial.** Move to the next step of the sequence 1 → 2 → 4 → 6 streams, clamped to the
   **effective cap**: the configured maximum (6), lowered to 5 when the HTTP/1.1 probe reservation
   is active (§11), and further lowered by the **floor rule**: a trial to *N* streams is skipped
   (plateau reason `floor-limited`) when the projected per-stream rate `T_base / N` would make the
   minimum 16 KiB request take longer than `2 × target` (2 s), i.e. when `T_base / N < 8 KiB/s`.
   Wait `I_s` (the new streams settle), then measure `T_trial` over `I_m`.
3. **Compare.** If `T_trial ≥ 1.05 × T_base`, the trial is kept, `T_base := T_trial`, and the next
   trial starts. Otherwise the ramp **plateaus**: no further trials, the stream count stays where it
   is (the extra streams are not removed, to avoid churn; the aggregate is what is measured), and
   the plateau reason is recorded (`no-gain`). Reaching the effective cap is the other end (`cap`).
4. On upload, each measurement waits for the watermark to pass the end of its interval; the per-step
   time is therefore `I_s + I_m + confirmation delay`.

Fixed-N and single modes skip the ramp: the N streams start together and the ramp counts as settled
after `I_s`.

### 8.3 Warm-Up End

Warm-up samples are excluded from the result. The warm-up is **hybrid with guards**: it ends on
observed stability rather than at a fixed time, because a fixed time is either too short for slow
links or wastes most of a short test on fast ones, and a stability test alone gives false positives
during startup or before the ramp has tried another stream.

Warm-up ends at the first instant where all of the following hold, evaluated whenever the
evaluation series gains a bucket:

1. **Ramp settled.** Plateau or cap reached, and at least `I_s` of confirmed series after the last
   stream was added.
2. **Meaningful observations.** The last 10 confirmed buckets contain at least 8 non-empty buckets;
   for upload, at least 2 confirmed requests completed on every active stream since the phase
   began; for download, at least 2 completed requests per active stream **or** 1 s of continuous
   chunk arrivals.
3. **Stability.** The coefficient of variation of the last 10 confirmed bucket values is at most
   10 %.
4. **Minimum elapsed.** At least 1 s of confirmed series.

**Cap.** If the conditions are not all met once the confirmed series reaches
`max(3 s, 25 % of the phase max)` for bounded phases, or an **absolute 10 s** for Continuous (which
has no max), warm-up ends there and the result carries `confidence: low` with one reason per
unmet condition, in the `reasons` array of the result (§17): condition 1 gives `ramp-unsettled`,
condition 2 or 4 gives `insufficient-samples`, condition 3 gives `unstable`.
Continuous therefore always has a steady window starting at most 10 s of confirmed series after the
phase began.

**Advanced setting.** The warm-up setting is `auto` (the rule above, default) or a fixed duration.
With a fixed duration, warm-up ends exactly then; the ramp still runs, and an unsettled ramp at that
instant gives `confidence: low` with reason `ramp-unsettled`.

### 8.4 Steady Window and Extension

The **steady window** runs from warm-up end to the phase end (download) or to
`W_end_final = min(C_final, M_end)` (upload). The phase is extended past the preset's nominal
duration, up to its max, until the window holds at least 3 s **and** (upload) at least 3 confirmed
requests inside it (download: at least two contributing requests, §5); the upload extension test is
made on the watermark, so the phase keeps sending until the *confirmed* window is long enough.

### 8.5 Presets

| Preset | Streams | Download min / max | Upload min / max | Idle pings |
| --- | --- | --- | --- | --- |
| Quick | fixed 3, no ramp | 5 s / 10 s | 5 s / 10 s | 10 |
| Standard (default) | auto, full ramp | 10 s / 20 s | 12 s / 25 s | 20 |
| Extended | auto, full ramp | 20 s / 40 s | 20 s / 40 s | 50 |
| Continuous | auto, Standard ramp | no max | no max | 20 |

Standard's upload budget is longer than its download budget to account for the confirmation delay.
Quick is meant for fast links. At 300 kbit/s its three fixed streams share ≈ 36.6 KiB/s, so the
three initial 64 KiB uploads take ≈ 5.2 s and first confirm at ≈ 5.5 s. By then the confirmed series
already spans ≈ 5 s, so warm-up ends at Quick's 3 s cap (`max(3 s, 25 % × 10 s)`) before two
requests per stream have confirmed, and the window condition holds at ≈ 7–8 s when the 16 KiB
follow-up requests confirm. Quick then reports an upload number with `confidence: low`
(`insufficient-samples`); the UI suggests Standard for links this slow. Continuous runs one
throughput direction (download by default, upload selectable) until stopped or until the data cap is
reached, with a 10 s absolute warm-up cap (§8.3, §15); running a single direction is the current
answer to an item tracked in [open-questions.md](open-questions.md).

### 8.6 Shortfall

If a phase reaches its max and the window condition is not met, the result for that direction is
`insufficient data` (no number; data used shown), with a notice offering the next larger preset
(Quick → Standard → Extended); the other direction's result is kept. A phase never reports a number
from one request.

The slow-link time budget that shows how Standard fits a 300 kbit/s link is worked out per ramp step
in §19.1.

## 9. Final Value

### 9.1 Evaluation

Two candidates were evaluated for the headline:

- **Request percentile** (Cloudflare): the p90 of per-request bandwidth. It works for Cloudflare
  because Cloudflare runs requests sequentially, one at a time per size step, so each request has
  the whole link. With parallel adaptive streams, per-request bandwidth is a *share* of the link,
  not the link: a percentile over requests measures stream fairness, changes with the stream count
  and cannot be the headline.
- **Steady-window average**: total bytes ÷ total time over the 100 ms buckets of the steady window,
  warm-up excluded. It counts every byte exactly once, is independent of how the bytes were split
  across streams and requests, and matches what a reference tool such as iperf3 reports over the
  same interval.

### 9.2 Chosen Method

The headline is the **steady-window average**:

```text
headline = Σ bytes over the full buckets of the steady window / (number of those buckets × 100 ms)
```

On upload this is exactly the formula of §7.6. The **peak** is the p90 of bucket rates over the
same window, shown as a secondary number labelled "peak", never as the headline. The headline
measures goodput: HTTP payload bytes, without TCP/IP or HTTP overhead.

### 9.3 Overhead Compensation

There is **no hidden fudge factor**. The overhead compensation setting defaults to **0 %**. When it
is non-zero, both directions' headline and peak are multiplied by `1 + p / 100`, the uncompensated
values are kept in the result, and every place that shows a compensated number shows the setting
next to it (for example "+6 % overhead compensation").

For comparison with other tools, the settings UI offers LibreSpeed's documented factors as presets:

| Preset | Factor | Percent | LibreSpeed's description |
| --- | --- | --- | --- |
| None (default) | 1.0 | 0 % | no compensation |
| LibreSpeed default | 1.06 | 6 % | HTTP + TCP + IPv4 + Ethernet, over the internet |
| LibreSpeed IPv6 | 1.0513 | 5.13 % | HTTP + TCP + IPv6 + Ethernet, over the internet (empirical) |
| LibreSpeed alternative | 1.0369 | 3.69 % | alternative value for HTTP + TCP + IPv4 + Ethernet |
| LibreSpeed alternative 2 | 1.081 | 8.1 % | another empirical value, over the internet |

OpenSpeedTest applies a fixed 1.04 to both directions; Cloudflare uses no fixed factor and prefers
the Resource Timing `transferSize`, falling back to a +0.5 % header estimate
([research/cloudflare.md](../research/cloudflare.md)).

## 10. Idle Latency

- **Path.** JSON ping frames over the WebSocket `/api/v1/ws`: the client sends a sequence number and
  its `performance.now()` timestamp, the server echoes both immediately, and RTT = echo arrival −
  send. If the WebSocket cannot be opened, the HTTP fallback is `GET /api/v1/ping` (204,
  `cache: 'no-store'`), timed from the Resource Timing entry as `responseStart − requestStart`,
  which excludes connection setup.
- **Count.** The preset's ping count (§8.5). Pings are sequential with one outstanding: the next
  ping is sent when the previous one is answered or lost, and no sooner than 100 ms after the
  previous send. The first sample on each path is discarded as a warm-up sample and counted neither
  in the statistics nor as loss.
- **Statistics.** min, median and p90 of the RTT samples.
- **Jitter** = mean absolute difference of consecutive successful samples, in send order.
- **Timeout policy, tolerant of VPN RTTs.** The first ping times out after 10 s; later pings after
  `max(2 s, 4 × running median)`, capped at 10 s. A timeout is not an error: the ping is counted as
  lost and the next one is sent.
- **Loss percentage** = lost pings ÷ pings sent. This is a probe-timeout rate over TCP, not packet
  loss: TCP retransmits hide packet loss from the browser, so it never feeds the packet-loss slot
  (§13, §18).
- **Limits.** The phase stops after 30 s even if the count is not reached. With fewer than 5
  successful samples idle latency is `unavailable`; with all pings lost the test shows the
  `server unreachable` notice with retry.
- **Timer resolution.** Browsers coarsen `performance.now()` (to 100 µs or 1 ms, depending on the
  browser and isolation). Sub-millisecond LAN latencies are therefore reported with the timer's
  resolution and never with false precision ([edge-cases.md](edge-cases.md)).

## 11. Latency Under Load

Two independent probe paths run during download and upload; neither is derived from the other.
Path A is specified here; path B in §12.

### 11.1 Path A — WebSocket Echo (Bufferbloat Source)

JSON ping frames with a client sequence number and `performance.now()` every **300 ms** over
`/api/v1/ws`; RTT = echo arrival − send. Up to 4 pings may be outstanding, matched by sequence
number; a tick that would exceed 4 is skipped. A ping not answered within 30 s, or within the
phase's grace after the phase ended, is counted as lost.

Path A reports, per direction:

- `loaded latency (WebSocket)`: median and p90 of the samples sent while at least one throughput
  request was in flight, excluding the first `I_s` of the phase (slow start);
- the **increase over idle**: median of loaded minus median of idle (0 if negative);
- the **bufferbloat grade** (§11.3).

WebSocket connections do not count against the HTTP/1.1 six-connection limit, so path A never queues
behind throughput requests. If the WebSocket cannot be opened (a proxy without upgrade support),
path A is `unavailable` and the HTTP fallback rules below apply.

### 11.2 Path A Fallback — HTTP Probe

`GET /api/v1/ping` (`cache: 'no-store'`) on a 300 ms schedule with **at most one probe
outstanding**: a tick that fires while a probe is pending is skipped, never queued, and there is no
catch-up burst afterwards. The engine records the actual inter-sample gaps and the number of skipped
ticks alongside the samples. At 600 ms RTT this yields one sample per ~600–900 ms instead of
overlapping probes queuing behind each other on the one reserved connection.

- **HTTP/1.1.** These probes would otherwise queue behind six in-flight throughput requests and
  measure browser scheduling, not the network. Policy: when the fallback is active on HTTP/1.1 the
  engine caps throughput streams at **5** so one connection is always free, and marks the samples
  `source: http-h1-reserved`. Those samples may grade **only** if the reservation held for the whole
  phase (no sample observed with more than 5 requests in flight) **and** at least 10 samples were
  collected in that direction; otherwise loaded latency is `unavailable` and no grade is shown.
- **HTTP/2.** The fallback multiplexes on the load connection and is labelled `http-h2` (`http-h3`
  on HTTP/3); it may grade under the same sample-count rule. No reservation is needed.
- Fallback samples are never mixed with WebSocket samples in one statistic.

### 11.3 Bufferbloat Grade

The grade uses Waveform's thresholds on the **added latency**, taking the worse (larger) of the
download and upload increases:

| Grade | Latency increase |
| --- | --- |
| A+ | < 5 ms |
| A | < 30 ms |
| B | < 60 ms |
| C | < 200 ms |
| D | < 400 ms |
| F | ≥ 400 ms |

If only one direction has a gradable increase, the grade is computed from it and labelled with that
direction ("download only"). Without any gradable direction, or without idle latency, no grade is
shown. The grade is displayed as letter and text, never by colour alone
([ui/i18n-a11y.md](ui/i18n-a11y.md)).

## 12. HTTP Loaded Responsiveness

### 12.1 What the Draft Specifies

The IETF draft "Responsiveness under Working Conditions" (draft-ietf-ippm-responsiveness-05),
implemented by Apple's `networkQuality`, loads the link with parallel HTTP/2 transfers and measures
two kinds of probes: **foreign probes** on new connections (DNS, TCP handshake, TLS handshake and an
HTTP request, each timed separately) and **self probes** (`http_l`: a small GET multiplexed over a
loaded connection). Responsiveness is reported in round trips per minute (RPM) from trimmed means of
both, once the load and the probe results are stable
([research/networkquality.md](../research/networkquality.md)).

### 12.2 What Is Not Feasible in a Browser

- **Foreign probes** need TCP and TLS handshake timings on *new* connections. A browser pools
  connections per origin and gives a page no control over opening a fresh one, so foreign probes
  cannot be measured.
- **Connection identity.** Even the self probe cannot be verified: the browser does not say which
  connection a request used.

BitGauge therefore implements only an approximation of the self-probe half, as a separate HTTP probe
path. It is not the WebSocket echo: the WebSocket measures its own transport and says nothing about
the HTTP/2 connection that carries the load.

### 12.3 Path B Procedure

- **Probe.** `GET /api/v1/small` (200, one-byte body, `no-store`; the same object the networkQuality
  layer serves, added to the native API for this purpose — `/ping` stays 204 for path A) every
  300 ms during the working-conditions part of each direction, single-outstanding like the HTTP
  fallback (a tick while a probe is pending is skipped).
- **Timing.** From the Resource Timing entry for that fetch: `http_l = responseStart −
  requestStart`; `responseEnd − fetchStart` is recorded too. Same-origin requests expose these
  fields without `Timing-Allow-Origin`.
- **What the browser can and cannot tell.** The entry's `nextHopProtocol` gives the protocol the
  probe used, and `connectStart === connectEnd` shows that *an* existing connection was reused. It
  does **not** identify which connection. Browsers coalesce same-origin HTTP/2 and HTTP/3 traffic
  onto one connection per origin in practice, so with at most 6 load streams the reused connection
  is very likely the loaded one, but this is an assumption the browser does not let the engine
  verify. The user-facing label is therefore **"HTTP loaded responsiveness — connection sharing not
  verifiable"**, with the actual protocol (`h2` or `h3`) shown next to it; the wording "self-probe"
  is not used in the UI.
- **Capability check before load.** One probe at idle, during the info phase (§1). If
  `nextHopProtocol` is `http/1.1`, path B is `unavailable_h1` ("needs HTTP/2 or HTTP/3 at the
  reverse proxy") and no path B probe runs under load. An empty `nextHopProtocol` (the protocol was
  not reported) is treated the same way: path B is `unavailable_h1`, shown as "protocol not
  reported — treated as HTTP/1.1", because on a possibly HTTP/1.1 connection with every connection
  busy the probe would measure browser scheduling, not a loaded shared connection. This matches the
  reservation rule of §4, which also treats an unknown protocol as HTTP/1.1.

### 12.4 States

| State | Meaning |
| --- | --- |
| `measured` | h2 or h3, at least 10 samples per direction with no new connection opened, and the ramp reached the stability criterion (warm-up ended without the cap) |
| `uncertain` | h2 or h3 but fewer than 10 samples, or any sample opened a new connection, or the protocol changed mid-phase |
| `unavailable_h1` | the capability check saw HTTP/1.1 or an empty protocol |
| `unavailable_insufficient` | fewer than 4 samples in the intervals the formula uses, so no meaningful trimmed mean exists; no number is shown |

`measured` still carries the "not verifiable" qualifier; it only says the observable preconditions
held.

### 12.5 Formula

Loaded responsiveness only:

```text
RPM = 60000 / TM95(http_l)
```

where TM95 is the 95 % single-sided trimmed mean over the samples of the last 4 intervals of the
direction, as in the draft: intervals are 1 s long (the draft's interval length, independent of the
ramp's `I_m`), so at one probe per 300 ms the formula sees about 13 samples. The number of samples
dropped from the slow end is `floor(0.05 × n)`; with fewer than 20 samples nothing is trimmed and
TM95 equals the plain mean, which the result detail states. Fewer than 4 samples in those 4 s give
`unavailable_insufficient`. There is no
foreign component, and the UI copy never compares this number to Apple's RPM. Path B samples feed
only this metric; the bufferbloat grade uses path A or its qualified fallback.

## 13. Quality Scores

Quality scores follow Cloudflare's AIM (Aggregated Internet Measurement) point tables
([research/cloudflare.md](../research/cloudflare.md)).

### 13.1 Inputs

| AIM metric | BitGauge input |
| --- | --- |
| `latency` | idle latency median (ms) |
| `jitter` | idle jitter (ms) |
| `loadedLatencyIncrease` | the larger of the per-direction increases from path A or its qualified fallback (ms) |
| `download` | download headline (bit/s) |
| `upload` | upload headline (bit/s) |
| `packetLoss` | **not measured**: fixed at 0 points |

### 13.2 Point Functions

A value below the first threshold gets the first point value; a value at or above threshold *i*
and below threshold *i + 1* gets point value *i + 1*.

| Metric | Thresholds | Points |
| --- | --- | --- |
| `latency` (ms) | 10, 20, 50, 100, 500 | 20, 10, 5, 0, −10, −20 |
| `loadedLatencyIncrease` (ms) | 10, 20, 50, 100, 500 | 20, 10, 5, 0, −10, −20 |
| `jitter` (ms) | 10, 20, 100, 500 | 10, 5, 0, −10, −20 |
| `download` (bit/s) | 1 M, 10 M, 50 M, 100 M | 0, 5, 10, 20, 30 |
| `upload` (bit/s) | 1 M, 10 M, 50 M, 100 M | 0, 5, 10, 20, 30 |
| `packetLoss` (fraction) | not measured | 0 (Cloudflare's own default when loss is unavailable) |

For reference, Cloudflare's packet-loss function (thresholds 0.01, 0.05, 0.25, 0.5; points 10, 5,
0, −10, −20) is not applied, because BitGauge does not measure packet loss (§18).

### 13.3 Experiences and Bands

Each experience sums the points of its inputs, clamps the sum at a minimum of 0, and maps it to a
band:

| Experience | Inputs | Band thresholds (points) |
| --- | --- | --- |
| Streaming | latency, packet loss, download, loaded latency increase | 15, 20, 40, 60 |
| Gaming | latency, packet loss, loaded latency increase | 5, 15, 25, 30 |
| Video calls (RTC) | latency, jitter, packet loss, loaded latency increase | 5, 15, 25, 40 |

Bands, by the same threshold rule: `bad` (below the first), `poor`, `average`, `good`, `great` (at
or above the last). An experience is not scored when any of its inputs is unavailable (for example
no loaded latency), and the UI says which input is missing.

### 13.4 Packet-Loss Handling

Packet loss is fixed at 0 points in every experience and displayed as "packet loss — not measured"
in its reserved slot. Because a measured loss could only lower the points, the scores are an upper
bound with respect to loss, and the UI notes this next to them.

## 14. Units and Gauge

- **Units.** Decimal bits by default: kbit/s, Mbit/s, Gbit/s, auto-scaled (1 Mbit/s = 10⁶ bit/s).
  Bytes per second (kB/s, MB/s, GB/s, decimal) are an option. Data used is shown in decimal bytes
  (kB, MB, GB). Request sizes in this specification are in KiB and MiB because they are buffer
  sizes, not rates.
- **Precision.** Three significant digits for rates (e.g. 0.472 Mbit/s, 94.1 Mbit/s, 2.38 Gbit/s);
  latencies in whole milliseconds above 10 ms and one decimal below.
- **Gauge.** Logarithmic from 0.1 Mbit/s to 10 Gbit/s (five decades, ticks at 0.1, 1, 10, 100,
  1000 and 10 000 Mbit/s). The needle shows the rate over the last 5 buckets; values outside the
  range pin the needle at the edge while the numeric readout stays exact.

## 15. Continuous Mode

Continuous mode runs one throughput direction with the Standard ramp, no maximum and a 10 s absolute
warm-up cap, until the user stops it or the data cap is reached. It shows live min, average and max.

**Retention (constant memory).** Every retained structure is a fixed-size ring; nothing grows with
run length:

| Tier | Cell | Ring length | Use |
| --- | --- | --- | --- |
| native | 100 ms | 6000 (10 min) | live gauge, last-minute statistics, live chart |
| hour | 1 s (exact sum of ten native cells) | 3600 (60 min) | chart history, hourly p90 |
| day | 1 min (exact sum of sixty 1 s cells) | 1440 (24 h) | chart history |
| long | 10 min (exact sum of ten 1 min cells) | 1008 (7 days) | chart history; beyond 7 days the oldest cells are dropped |

- Run-wide statistics are **running aggregates** over 1 s cells since the steady window began:
  count, sum (giving the average), min, max, and the data-used counter. They need constant memory.
- The **peak** for a continuous run is the p90 over the hour ring (the last 60 min of 1 s cells),
  labelled "p90, last hour", plus the run-wide max. An exact run-wide p90 is **not** computed;
  an approximate run-wide quantile sketch is a possible later addition.
- **Unknown cells (upload).** Native cells enter the rings only once confirmed. A native cell that
  overlaps a failure gap (§7.5) is stored as unknown and shown as a gap. Every coarser cell stores
  two exact sums over its finer cells: bytes, and known time (the time covered by known cells). Its
  rate is bytes ÷ known time, and a cell with no known time is a gap. Run-wide aggregates and the
  "p90, last hour" use only 1 s cells whose ten native cells are all known. On download every cell
  is known, and the coarser cells are the plain exact sums of the table.
- Loaded latency keeps running on path A; its last-minute median is shown live and run-wide min,
  average and max of per-second medians are kept as running aggregates.
- The chart renders at most about 2000 points by picking the tier that fits the visible range.
- **Data used** is shown and the per-test data cap applies. Data-used notices appear at 1 GB, 10 GB,
  100 GB and every further tenfold step, so a long run on a metered link is never silent.

Fixed-size rings keep memory constant however long the run lasts.

## 16. Confidence and Notices

**Confidence** qualifies a direction's result:

| Level | Condition |
| --- | --- |
| `normal` | warm-up ended by the guarded rule and the window condition held |
| `low` | warm-up ended at the cap; reason `ramp-unsettled`, `unstable` or `insufficient-samples` (§8.3) |
| `cpu-bound` | the Worker's busy fraction exceeded 90 % over the steady window |

The Worker's **busy fraction** is the time it spends executing its own tasks (reader callbacks,
timers, message handling), measured with `performance.now()` around each task, divided by the
elapsed time. At multi-Gbit rates the browser, not the link, is often the limit; `cpu-bound` says so
instead of reporting a link speed.

**Notices** shown with the result and, where relevant, live:

- `slow link — test extended` (§5);
- `low confidence` with its reason;
- `data cap reached` (§5);
- `insufficient data` per direction, with the next-larger-preset offer (§8.6);
- `partial — stopped early` with the covered duration (§7.8);
- `server restarted` (epoch change, test aborted; §7.3);
- `server unreachable` with retry (§10);
- `proxy buffering suspected` (§7.3);
- `upload interrupted by a failed request` (HTTP/1.1 or unreported protocol), with the hint that
  HTTP/2 at the proxy lets uploads survive transient failures (§7.5);
- `response compression detected` (§6);
- `HTTP/1.1 probe reservation active — 5 streams` (§11.2);
- `overhead compensation +p %` whenever it is non-zero (§9.3).

## 17. Result Object

One versioned schema is shared by the engine's `result` message, browser history and JSON export.
CSV export flattens the same fields, one row per result.

```json
{
  "schema": "bitgauge.result",
  "schemaVersion": 1,
  "id": "0b6f…",
  "startedAt": "2026-10-08T21:04:05.123Z",
  "durationMs": 41250,
  "status": "complete",
  "label": "VPN",
  "note": "",
  "server": { "name": "home", "version": "0.1.0", "epoch": "…" },
  "client": { "ip": "10.8.0.2", "contextLabel": "VPN", "protocol": "h2" },
  "settings": {
    "preset": "standard", "phases": ["idle", "download", "upload"],
    "streams": { "mode": "auto", "max": 6 },
    "dataCapBytes": null, "overheadCompensationPercent": 0, "warmup": "auto", "pingCount": 20
  },
  "idle": {
    "path": "websocket", "samples": 19, "lossPercent": 0,
    "minMs": 48.2, "medianMs": 51.0, "p90Ms": 55.4, "jitterMs": 1.9
  },
  "download": {
    "status": "measured", "bitsPerSecond": 94100000, "peakBitsPerSecond": 96800000,
    "uncompensatedBitsPerSecond": 94100000, "windowMs": 5600, "streams": 2,
    "plateau": "no-gain", "confidence": { "level": "normal", "reasons": [] },
    "bytes": 118000000,
    "loadedLatency": {
      "source": "websocket", "samples": 31, "skippedTicks": 0,
      "medianMs": 132.0, "p90Ms": 151.0, "increaseMs": 81.0
    },
    "responsiveness": { "state": "measured", "protocol": "h2", "samples": 18, "rpm": 412 },
    "series": { "bucketMs": 100, "values": [] }
  },
  "upload": { "status": "measured", "confirmedRequests": 34, "…": "same fields as download" },
  "bufferbloat": { "grade": "C", "basis": "download+upload", "increaseMs": 81.0 },
  "scores": {
    "streaming": { "points": 20, "band": "average" },
    "gaming": { "points": 0, "band": "bad" },
    "rtc": { "points": 10, "band": "poor" },
    "packetLoss": "not-measured"
  },
  "dataUsedBytes": 268000000,
  "notices": []
}
```

- Direction `status`: `measured`, `insufficient-data`, `partial`, `skipped` or `error`. Result
  `status`: `complete`, `partial` (stopped by the user) or `error`.
- `series` holds the steady-window bucket values for the result-detail charts, downsampled to at
  most 2000 points.
- **Versioning.** `schemaVersion` is an integer. Import accepts any version up to the current one
  and migrates older records forward; a higher version is rejected with a message naming it. Field
  renames or removals bump the version; additions do not.
- The result contains the client IP and the user's label and note; export and share warnings are
  specified in [security.md](security.md).

## 18. Future: Packet Loss via WebRTC/TURN

Real packet loss needs unreliable datagrams. HTTP and WebSocket run over TCP (or QUIC with its own
retransmission), which recovers lost packets and turns loss into latency, so the browser cannot see
it. The only browser route is a WebRTC data channel in unreliable mode, relayed through a TURN
server (Cloudflare's approach).

It is deferred because it needs UDP ports and a TURN server: a second network surface beside the
reverse proxy, which breaks the single-binary, proxy-only-TLS deployment model. Until then the
result reserves a "packet loss — not measured" slot, the AIM scores fix loss at 0 points (§13.4),
and the probe-timeout percentage of §10 is never presented as packet loss. The roadmap lists it
under Later ([roadmap.md](roadmap.md)).

## 19. Worked Timelines

All times are approximate and measured from the start of the phase on the client, unless stated.

### 19.1 Slow-Link Budget (300 kbit/s, 300 ms RTT, Standard)

300 kbit/s ≈ 36.6 KiB/s aggregate and 300 ms RTT, so `I_s` = 1.2 s, `I_m` = 0.6 s, request target
1 s, size floor 16 KiB. Request size per stream = clamp(per-stream rate × 1 s, 16 KiB, cap).

**Upload**, recomputed per ramp step (confirmation delay ≈ one request duration + RTT; the
watermark advances only when a request confirms):

| Step | Streams | Per-stream rate | Request size / duration | Confirmed series needed | Elapsed (client) |
| --- | --- | --- | --- | --- | --- |
| first request | 1 | 36.6 KiB/s | 64 KiB / 1.75 s | — | confirms at ≈ 2.05 s |
| baseline | 1 | 36.6 KiB/s | 36 KiB / ≈ 1.0 s | `I_s` + 2 × `I_m` = 2.4 s (3 s cap if still growing) | ≈ 4.7–5.9 s |
| trial → 2 | 2 | 18.3 KiB/s | 18 KiB / ≈ 1.0 s | `I_s` + `I_m` = 1.8 s after the add | ≈ 9.3 s (two request confirmations + RTT) |
| trial → 4 | 4 | 9.2 KiB/s | 16 KiB (floor) / 1.75 s | 1.8 s after the add | ≈ 13.8 s, only if the 2-stream trial showed gain |
| trial → 6 | — | 6.1 KiB/s → 16 KiB would take 2.6 s > 2 s | skipped: `floor-limited` | — | — |
| steady window | 2 (typical, `no-gain` at the 2-stream trial because one stream already saturates 300 kbit/s) | | ≈ 1 s requests | ≥ 3 s and ≥ 3 confirmed requests | ≈ 9.3 + 3 + 1.3 ≈ 13.6 s |
| steady window, worst case | 4 | | 1.75 s requests | ≥ 3 s and ≥ 3 confirmed requests (≈ 2 cells of 2 streams each) | ≈ 13.8 + 3.5 + 2.1 ≈ 19.4 s |
| shutdown | | | stop new requests at `max − 1 s` or at the window decision, grace `min(2 s, 2 × 1.75 s)` = 2 s | | ≈ 15.6 s typical, ≈ 21.4 s worst case; ≤ 25 s |

Both cases fit Standard's upload budget (12–25 s) with at least 5 s of margin in the worst case; the
typical case finishes about 1.6 s past the 12 s minimum, so the phase extends slightly rather than
ending at the minimum. Six initial 64 KiB requests would have cost ≈ 10.5 s of link time, which is
why the ramp starts at one stream and sizes requests per stream.

**Download equivalent.** No confirmation delay: the evaluation series is live from the first chunk
(≈ 0.3 s, one RTT).

| Step | Streams | Per-stream rate | Request size / duration | Series needed | Elapsed (client) |
| --- | --- | --- | --- | --- | --- |
| first request | 1 | 36.6 KiB/s | 64 KiB / 1.75 s + RTT | — | first chunk ≈ 0.3 s, done ≈ 2.05 s |
| baseline | 1 | 36.6 KiB/s | 36 KiB / ≈ 1.0 s | `I_s` + 2 × `I_m` = 2.4 s after the first chunk (3 s cap if still growing) | ≈ 2.7–4.5 s |
| trial → 2 | 2 | 18.3 KiB/s | 18 KiB / ≈ 1.0 s | 1.8 s after the add | ≈ 4.5 s |
| trial → 4 | 4 | 9.2 KiB/s | 16 KiB (floor) / 1.75 s | 1.8 s after the add | ≈ 6.3 s, only if the 2-stream trial showed gain |
| trial → 6 | — | 6.1 KiB/s | skipped: `floor-limited` | — | — |
| steady window | 2 (typical, `no-gain`) | | ≈ 1 s requests | ≥ 3 s, ≥ 2 contributing requests | warm-up end ≈ 4.5 s, condition met ≈ 7.5 s |
| steady window, worst case | 4 | | 1.75 s requests | ≥ 3 s, ≥ 2 contributing requests | warm-up end ≈ 6.3 s, condition met ≈ 9.3 s |
| end | | | in-flight requests aborted, bytes kept | | at the 10 s minimum in both cases |

Download fits Standard's 10 s minimum with the steady window at ≈ 3.7–5.5 s. The 600 ms RTT manual
floor profile stretches every interval (`I_s` = 2.4 s, `I_m` = 1.2 s) and is expected to need the
Extended preset; the shortfall rule (§8.6) covers the Standard case there. These budgets are
validated by the harness floor profiles
([technical-stack/testing.md](technical-stack/testing.md)).

### 19.2 500 kbit/s + 300 ms RTT (Mobile over VPN, Standard)

- **Info and idle latency.** 20 sequential WebSocket pings at about 0.3–0.4 s each, ≈ 7 s. Median
  ≈ 300 ms, so `I_s` = 1.2 s and `I_m` = 0.6 s.
- **Download.** One stream requests 64 KiB; the first chunk arrives at ≈ 0.3 s and the request
  completes at ≈ 1.35 s; `rate_s` ≈ 61 KiB/s, so the next request is 61 KiB. Baseline ends at
  ≈ 2.7 s. The trial to 2 streams (30 KiB requests each) is measured at ≈ 4.5 s and shows no gain:
  plateau `no-gain`. Warm-up ends at ≈ 4.5 s, the window condition holds at ≈ 7.5 s, and the phase
  ends at its 10 s minimum with a ≈ 5.5 s window. Headline ≈ 0.47 Mbit/s of goodput on a link
  shaped to 500 kbit/s at the IP layer. Data used ≈ 0.6 MB.
- **Loaded latency.** Path A pings every 300 ms; with a 64 KiB shaper queue the RTT rises from 300
  to ≈ 1300 ms, an increase of ≈ 1000 ms: grade F.
- **Upload.** As in §19.1 but faster: the first request confirms at ≈ 1.35 s, the trial to 2
  streams is decided at ≈ 7 s, and the window condition holds after the 12 s minimum, at ≈ 12–13 s.
  Grace takes the phase to ≈ 14 s.

### 19.3 100 Mbit/s + 50 ms RTT (Standard)

- `I_s` = max(1 s, 200 ms) = 1 s; `I_m` = max(500 ms, 100 ms) = 500 ms.
- **Download.** Request sizes grow 64 KiB → 512 KiB → 4 MiB within ≈ 0.4 s (each latency-bound),
  then settle at ≈ 11 MiB per request (≈ 1 s at ≈ 12 MB/s). Baseline is measured at ≈ 2–3 s
  (single-stream slow start may extend it to the 3 s cap). The trial to 2 streams shows no gain on a
  shaped link: plateau `no-gain` at ≈ 4 s, warm-up end ≈ 4–4.5 s, window condition at ≈ 7.5 s, phase
  end at 10 s with a ≈ 5.5–6 s window. On HTTP/1.1 (Traefik profile) the two streams use two
  connections; on HTTP/2 (Caddy profile) they share one, which on this clean profile measures the
  same.
- **Upload.** Confirmation delay ≈ 1 s + 50 ms; warm-up end ≈ 5.5 s; the phase ends at its 12 s
  minimum.
- **Latency.** Idle 50 ms; with a shaper queue adding ≈ 80 ms under load, the grade is C. Path B on
  the Caddy profile: `measured` with the not-verifiable label; on Traefik (HTTP/1.1):
  `unavailable_h1`.
- **Data used** ≈ 120 MB down + 145 MB up.

### 19.4 2.5 Gbit/s LAN (Standard)

- RTT ≈ 0.3 ms: `I_s` = 1 s, `I_m` = 500 ms.
- **Download.** One stream reaches ≈ 1.6 Gbit/s (≈ 200 MB/s), below the ≈ 2.1 Gbit/s at which the
  256 MiB cap binds. Sizes grow 64 KiB → 512 KiB → 4 MiB → 32 MiB within ≈ 0.2 s (the early requests
  are latency-bound) and then settle at ≈ 190 MiB, about 1 s per request. Trials to 2, 4 and 6
  streams gain until the cap: plateau `cap` at ≈ 6.5 s with ≈ 50 MiB requests per stream. Warm-up
  end ≈ 6.5 s, window condition ≈ 9.5 s, phase end at 10 s.
- **CPU.** The Worker's busy fraction is recorded; above 90 % the direction is `cpu-bound` and the
  harness tolerance is ±20 %.
- **Data used** ≈ 3 GB down + 3.7 GB up: the data-used figure is prominent in the result, and a data
  cap, if set, ends the test early with a notice.

## Related

- [Glossary](glossary.md)
- [Wire protocol](wire-protocol.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Edge cases](edge-cases.md)
- [UI screens](ui/screens.md)
- [Testing and accuracy harness](technical-stack/testing.md)
- [Cloudflare research](../research/cloudflare.md)
- [networkQuality research](../research/networkquality.md)
