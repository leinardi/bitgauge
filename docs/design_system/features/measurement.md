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
| Ramp: a no-gain trial is followed by one more step from | 900 Mbit/s | §8.2 |
| Upload preparation turn: requests from, held at most | 1 MiB, 1 s | §7.2 |
| Early issue: from an issue gap of | 50 ms | §3 |
| Engine per-request timeout | 30 s | §5 |
| Server upload request lifetime | 120 s | §7 |
| Loaded-latency probe interval | 300 ms | §11 |
| Overhead compensation | 0 % | §9 |

## 1. Phases and Order

A test runs these phases, in this order by default:

1. **Info.** `GET /api/v1/info` returns the server epoch, limits, default settings, the client IP
   and the context label inputs. The engine opens the WebSocket at `/api/v1/ws` and sends one idle
   `GET /api/v1/small` as the path B capability check (§12), whose protocol also decides the HTTP
   latency fallback's probe reservation (§11.2). Info always runs and cannot be skipped:
   every later phase needs the epoch and the limits, and it costs one round trip. (This narrows
   "every phase can be skipped" to the three measuring phases;
   [technical-stack/decisions.md §34](technical-stack/decisions.md#34-info-phase--always-runs).)
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
  responsiveness and is labeled as sending progress. It never feeds a number.

Every decision (ramp, warm-up, extension, stop) reads only the **evaluation series**: the download
series up to the current bucket, or the upload series up to the current window end (§8).

**Statistics over buckets.** Every statistic of a series reads only its known buckets; an unknown
bucket is skipped, never counted as zero, and a range with no known bucket has no value.

- The **mean** is the sum of the known values divided by their count.
- A **percentile** (p90, and the median as p50) interpolates linearly between the closest ranks:
  with the *n* known values sorted ascending as *x₀ … xₙ₋₁*, the p*q* is at rank
  *r* = (*n* − 1) × *q* / 100, and is *x*⌊*r*⌋ plus the fraction of *r* times the step to the
  next value. One value is its own percentile.
- The **coefficient of variation** is the population standard deviation of the known values divided
  by their mean. With a mean of zero it has no value, and a condition on it does not hold.

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
- **Cap** = the server's per-request limit from `GET /info` (`limits.maxDownloadBytes`,
  `limits.maxUploadBytes`, from `limits.max_download_bytes` and `limits.max_upload_bytes`, default
  256 MiB each). At more than about 2.1 Gbit/s per stream, capped
  requests take less than 1 s; this only adds one LAN round trip per request.
- When a data cap is set, a request is shrunk so that data used plus the bytes still to move of all
  requests in flight never exceeds the cap; when less than the floor remains, no new request is
  issued (§5).

**Slow-link example (500 kbit/s ≈ 61 KiB/s, one stream).** The first 64 KiB request takes about
1.05 s plus RTT. `rate_s` ≈ 61 KiB/s, so the next request is 61 KiB and takes about 1 s. With two
streams each sees about 30.5 KiB/s and requests about 30 KiB. Nothing ever waits for a transfer
that cannot finish.

**Fast-link example (10 Gbit/s ≈ 1.25 GB/s).** On one stream, sizes grow 64 KiB → 512 KiB → 4 MiB →
32 MiB → 256 MiB (cap) over four requests, each latency-bound at first and then rate-bound; at the
cap a request takes about 0.2–0.4 s depending on the single-stream rate. With six streams sharing
1.25 GB/s, each stream sees about 208 MB/s and requests about 198 MiB. At this end of the range the
browser CPU, not request sizing, is the limit (§16).

**Issue gap and early issue.** A request's **issue gap** is the time its stream spent neither
waiting for the network nor moving bytes: its client duration minus its transfer time minus the
RTT, the client duration counted from the later of its issue and the end of the stream's previous
request. On download the transfer time is the first-to-last chunk time and the client duration
ends at the last chunk; on upload the transfer time is the server duration `durationMs`, the issue
is `t_send` and the client duration ends at `t_done` (§7.2). The gap is the browser's own cost per
request: the time it takes to start a request, or to prepare an upload body (§7.2). Chromium's is
a few milliseconds; Safari's is about 100–150 ms in both directions, and in a 100 ms bucket a gap
that long on one of two streams is a hole of half the bytes. So once the largest gap seen in the
phase exceeds **50 ms**, every stream issues its next request **early**: by that largest gap
before the current request's expected end, so that the next request's gap passes while the
current one still moves bytes, and never before the current request's first byte. The expected
end is the first byte's instant plus `size / rate_s`, the transfer the size rule expects, plus the
RTT on upload for the response's way back; the first byte is the first chunk on download and the
first byte upload progress reports sent on upload (`t_send` when the browser reports no progress,
§7.2), so an upload body is never asked for before the previous one has been handed over. The
in-flight count, early requests included, never exceeds the server's `limits.maxStreamsPerClient`,
nor 6, the browsers' per-host connection limit, while the latest request reported HTTP/1.1 or no
protocol (HTTP/2 and HTTP/3 multiplex one connection): a stream whose early issue would exceed it
waits for its current request's end as before. A request queued behind that limit waits in the
browser while its client duration runs, which reads as an issue gap and holds the confirmed
watermark back; on a 300 kbit/s link with 1 % loss, four streams issuing early put up to 8
downloads in flight on HTTP/1.1, and the queued ones waited up to 1.6 s for their first byte
against a 360 ms round trip. A stream's first request, whose rate is unknown, is never followed
early. Early issue begins once the ramp has settled (§8.2), so that the ramp compares its steps
on streams that re-request alike and a step that only hides the gap behind more streams still
reads as a gain; a fixed stream count is settled from the start. The bytes of an early request
count as they arrive, like any other's; the stream count the ramp compares (§4, §8.2) is
unchanged; on upload the confirmation delay of §7.5 grows by about one request. Measured from its
predecessor's end, an early request's gap is what the early issue did not hide: the holes that
remain.

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
- **Single**: exactly one stream, for single-connection tests; equivalent to fixed 1 and labeled as
  single-connection in the result.

**Effective cap.** The configured maximum (default 6), bounded by the server's
`limits.maxStreamsPerClient` from `GET /info`, and lowered to 5 while the HTTP/1.1 probe
reservation is active (§11). Auto-mode trials are clamped to the effective cap and may be skipped
by the floor rule (§8).

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
  reported as `unknown`; for the probe reservation an unknown protocol is treated as HTTP/1.1. A
  direction reports the protocol of its latest throughput request that had an entry.

**Per-client limits.** If the server answers `429` because `max_streams_per_client` is shared by
several browsers behind one address, the request counts as failed and the engine records the
`stream-limit` notice with the lowered cap (§16). On download, and on upload over HTTP/2 or HTTP/3
(where the failed upload leaves a failure gap, §7.5), the engine lowers the effective cap by one for
the rest of the phase and continues. On upload over HTTP/1.1 or an unreported protocol, the failure
ends the phase instead (§7.5). When the lowered cap is below the current stream count, the count
drops to the cap: the streams above it finish the request they have in flight and issue no further
one, and a ramp trial in progress ends there with the plateau reason `cap`.

## 5. Adaptive Duration

Each direction has a minimum and a maximum duration taken from the preset (§8):

- A phase runs at least its **minimum**. From the minimum on, it ends as soon as the **end
  condition** holds: the **window condition**, the steady window covering at least 3 s with, on
  upload, at least 3 confirmed requests inside it and, on download, at least two different
  requests contributing bytes to it; and the window's **stability**, the coefficient of variation
  of its 500 ms sums (the reading of `unstable`, §8.3) at most 10 %. Ending at the first instant
  the end condition holds is the early stop on stability: a stable link ends at the minimum.
- If the end condition does not hold, the phase is **extended** past the preset's nominal duration
  (its minimum) up to its **maximum**, so slow links get enough completed requests and bursty ones
  a window long enough to average their bursts. On a slow, lossy or long-RTT link a loss recovery
  holds a second or more of bytes back and then releases them in one burst, which a 3 s window
  reads as a rate the link never had: at 300 kbit/s a single 30 KB release is 0.8 s of the link.
  An extended phase, one whose end condition did not hold at a minimum shorter than its maximum,
  carries the `test extended` notice. On upload the end condition is tested on the confirmed
  window (§8), so the phase keeps sending until the *confirmed* window is long enough and stable.
- At the maximum without the window condition, the direction reports `insufficient data` (§8
  Shortfall). With the window condition but still unstable, it reports its window's number with
  `confidence: low` and the reason `unstable` (§8.3): the extension bought the window every second
  it could.

**Ending a phase.**

- **Download** ends at the end instant: in-flight requests are aborted, bytes already read are kept,
  and the window ends at the abort instant.
- **Upload** stops issuing new requests at `max − 1 s` (the request target), even when that comes
  before its minimum, or when the end condition holds; its minimum and maximum run on the client
  clock from the phase's first request. In-flight requests may finish within a grace of
  `min(2 s, 2 × d)`, where `d` is the expected duration of the longest in-flight request (its size
  over its stream's rate, normally the 1 s target; a stream with no confirmed request yet has no
  expected duration and gets the full 2 s); then they are aborted. Basing the grace on the
  in-flight request's expected duration rather than on the fixed 1 s target is what the slow-link
  budget in §19.1 needs (2 × 1.75 s). A phase that runs to its maximum therefore ends at most
  about 1 s after it. The window ends where the first stream falls quiet, before the drain of the
  others (`M_end`, §7.5). Aborted requests only lower the confirmed watermark; because no request
  is issued after the decision, and every request in flight at it ends after the confirmed window
  that satisfied the end condition, the final window is never shorter than that window.

**Timeouts and failures.** The engine aborts any request after **30 s** and counts it as failed.
An upload that ends with an error result, a user stop or a server restart aborts its requests in
flight at once, without the grace.
With the 1 s size target, a 30 s request is unreachable above about 4 kbit/s per stream. How a
failed request (timeout, error status, rejected response) affects the phase depends on the direction
and protocol:

- **Download, and upload over HTTP/2 or HTTP/3.** A single failure does not stop the phase: the
  stream issues its next request and the measurement continues. On download the bytes already read
  are kept; on upload the request has no telemetry and its server activity becomes a failure gap
  once a later request confirms (§7.5). **Three consecutive failed requests** in a direction end the
  phase with an error result: failures count across the direction's streams in the order they
  occur, and any request that completes resets the count.
- **Upload over HTTP/1.1 or an unreported protocol.** The first failure ends the phase, with a
  number from the window up to that failure or `insufficient data`, and the notice
  `upload interrupted by a failed request` (§7.5). The three-failures rule does not apply there,
  because a single failure already ends the phase.

**Data cap.** An optional limit on data used per test (default: none). Requests are sized so the cap
is never exceeded (§3). When the remaining budget is below the 16 KiB floor at the moment a stream
would issue its next request, the current phase ends at that instant as if its maximum had been
reached (the window condition decides between a number and
`insufficient data`), remaining throughput phases are skipped, and the result carries the
`data cap reached` notice.

**Continuous.** A Continuous direction (§15) has no minimum, no maximum and no extension: the end
condition is never tested, it never carries the `test extended` notice or an `extended` event, and
it never reaches `insufficient data` by running out of time. It ends only by the user's stop, its
optional run length, the data cap (which ends the run, since no other direction follows), an upload
failure over HTTP/1.1 (§7.5), the browser pausing a hidden page, or an error; how each ending reads
is §15.

**Data used** is the sum of throughput bytes in both directions: bytes read by the client on
download and bytes sent by the client on upload, including warm-up and aborted or failed requests.
Latency probes and protocol overhead are not included. It is shown live and in every result.

## 6. Download Mechanics

- Each stream issues `fetch('/api/v1/download?bytes=N', { cache: 'no-store' })` from the Worker,
  with an `AbortController` per request for stop, timeout and phase end.
- The body is read with a `ReadableStream` reader. For every chunk the engine records its byte count
  and the `performance.now()` timestamp at which `read()` resolved, adds it to the bucket of that
  instant, and discards the chunk. Nothing is buffered beyond the current chunk. A bucket that a
  decision has already read never changes: a chunk whose instant falls in one, which only a
  delayed read can produce, counts in the bucket still open.
- The server sends exactly `N` bytes from an in-memory random buffer with `Content-Length`,
  `Cache-Control: no-store` and no `Content-Encoding`. Browsers do not let a page set
  `Accept-Encoding`, so identity encoding is a server and proxy property; random bytes are
  incompressible, so a compressing proxy distorts timing only slightly, and the engine records a
  notice if a response arrives with a `Content-Encoding` header
  ([edge-cases.md](edge-cases.md)).
- A response whose byte count differs from `N` without an abort counts as a failed request.
- A stream issues its next request at the current one's end, or early by the rule of §3 once the
  browser's issue gap has shown to be long.
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
  `crypto.getRandomValues` (in 64 KiB calls). Because a browser may materialize a `Blob` of
  repeated parts, the engine keeps one master `Blob` that grows by doubling to the largest size
  needed and sends `slice(0, N)` of it, so memory stays at about the largest request size.
- `Content-Type: application/octet-stream`, explicit `Content-Length` (never chunked).
- `upload.onprogress` drives only the live gauge and the faint `sending` line of the chart. Some
  browsers report a request's progress in one event once its body is handed to the network stack
  (Firefox does), so the gauge reads it over a longer window than the download's (§14).
- **One request prepares at a time.** Some browsers read or copy an upload body before its first
  byte leaves (Firefox does, at a rate that on a phone is close to a 1 Gbit/s link), and requests
  sent together share that work: when every stream sends at once, the link idles while all the
  bodies are prepared together. So of the requests of at least **1 MiB**, only one may be
  *preparing* at a time: from its `send()` until upload progress first reports a byte sent, the
  request ends (response, failure or abort), or **1 s** passes, whichever comes first. A stream
  whose next request would be 1 MiB or more waits for that turn, in the order the streams asked for
  it, and then sizes its request as usual (§3); a smaller request neither waits nor holds the turn.
  When a request of at least 1 MiB is confirmed without upload progress ever reporting a byte, the
  browser does not report upload progress, and no request waits for the rest of the phase. The wait
  happens before `t_send`, between two requests of the stream, like the round trip between them.
- A stream issues its next request at the current one's end, or early by the rule of §3 once the
  browser's issue gap has shown to be long; the early request asks for the preparation turn at its
  issue, so its body is prepared while the stream's current request still sends.
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
from the bytes it sent, or when its counts are not whole byte counts adding up to `bytes` from the
cell of `startMs`, or when `startMs` or `durationMs` is not a finite instant and duration. If `epoch` differs from the epoch `GET /info` reported at test start, the
server restarted mid-test: grid indices from before and after cannot be combined, so the test is
aborted with the `server restarted` notice ([edge-cases.md](edge-cases.md)).

**Proxy buffering.** With request buffering on at the proxy, the server reads each body in one burst
after the client finished sending. The counts are still exact for what the server saw, but the
series turns into bursts and gaps and fails the stability test (§8). When a request's `durationMs`
is below 10 % of its client duration (counted as for the issue gap, §3) for requests of at least
1 s, the result carries a `proxy buffering suspected` notice ([deployment-example.md](deployment-example.md)).

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
median over confirmed requests of `t_done − (startMs + durationMs)`, over the last 100 of them in
a Continuous upload (§15). This offset is cosmetic, its error under load is unbounded, and it never
feeds a number.

### 7.5 Phase Start, Measurement End and the Confirmed Watermark

- **Phase start** `P_start` = min `startMs` over confirmed requests of the phase.
- **Measurement end** `M_end`, once the phase is over and the grace period has elapsed (no more
  responses can arrive): the instant the first stream fell quiet. When the phase stopped issuing
  (§5) with requests in flight, the streams go quiet one at a time as those requests end, and the
  cells after the first of them carry fewer streams than the window measured, the **drain**; so for
  each stream with requests in flight at the stop, take the latest server end `startMs + durationMs`
  among those of them that confirmed, and `M_end` is the smallest of these over the streams. When
  no stream had a request in flight at the stop, or none of them confirmed (a stop aborts them
  all, §7.8), `M_end` is the maximum of `startMs + durationMs` over the confirmed requests.
  `M_end_so_far` is that maximum over the requests confirmed so far, until the phase is over. Both
  `P_start` and `M_end` are finite for every phase that confirmed at least one request.
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
  runs end the same way, with the outcomes of §15, and a hint that HTTP/2 at the proxy lets long
  upload runs survive transient failures.
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
  present by about one request duration plus one RTT: the **confirmation delay**. A request issued
  early (§3) was sent before its predecessor completed, so its bound is the request before that,
  and the delay grows by about one request.

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
- **Peak.** p90 of `S_up[b]` over *W*, labeled "peak", never the headline.
- **Minimum window.** If `|W| × bucketMs < 3000 ms`, or fewer than 3 confirmed requests lie inside
  *W*, the upload direction status is `insufficient-data` ("insufficient data"): no number, data
  used shown. If the phase was stopped by the user, the result status is `partial`. A bounded phase
  never reports a number from one request. A confirmed request lies inside *W* when every cell of
  its telemetry, from the cell of its first byte read to the cell of its last, belongs to *W*; a
  request that straddles the warm-up end, the window end or a failure gap contributes its bytes in
  *W* but does not count toward the three, and a request that read no bytes never counts. A
  Continuous upload replaces this minimum window, the three requests included, with the rule of §15:
  three fully known 1 s cells since the steady start.
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
| Sum |  | 64.0 | 63.9 | 127.9 | 93.3 over 11 cells |

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
cells inside `[warm-up end, 7000)`; the result is `partial`, and the UI names what it covers as
[ui/flows.md §4](ui/flows.md#4-cancel-mid-test) does: "based on a <window> s steady window · <n>
requests", the window's length and the confirmed requests.

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
`I_m = max(500 ms, 2 × RTT, min(100 × RTT, 1 s + RTT))` (measurement), with RTT = the
idle-latency median (§10; 100 ms if idle latency was skipped). The throughput of an interval is the
mean of its confirmed buckets. A stream loses a few round trips each request cycle: the round trip
between its requests and, in some browsers, the slow start of a connection gone idle. An interval
shorter than the cycle can read the full link in one interval and that gap in the next, so `I_m` is
either 100 round trips, over which those few cost no more than the noise of a mean, or a whole
request cycle, the 1 s request target (§3) and one round trip, over which every interval holds one
gap; whichever is shorter. Over 10 ms of RTT that is the cycle; on a LAN it is the 500 ms floor.

**An idle stream stretches `I_m` (upload).** A browser that prepares each body before sending it
(§7.2) leaves a stream idle between its requests for far longer than a round trip. Each confirmed
request whose server duration is at least one bucket gives its stream's **idle share**: its issue
gap (§3) over its client duration. Early issue (§3) is what removes a stream's idle, so once the
phase has turned to it the share is read only from the requests issued early, each from its
predecessor's end, and the shares read before are forgotten. Once the largest share seen exceeds
**20 %**, a stream's request cycle is about
`(1 s + RTT) / (1 − share)`, the aggregate of *N* streams started one at a time repeats about every
cycle / *N*, and `I_m` is at least that from then on, the cycle capped at 3 s: a shorter interval
would read a burst or a gap of the pattern and compare noise. Below 20 % the idle is the few round
trips the formula already allows for.

1. **Baseline.** Start with 1 stream. After `I_s` from the first confirmed bucket, measure `T_prev`
   and `T_cur` over two consecutive `I_m`. While `T_cur > 1.05 × T_prev` (the single stream is
   still growing) keep measuring, up to a baseline cap of 3 s after `I_s`; `T_base` is the last
   `T_cur`.
2. **Trial.** Move to the next step of the sequence 1 → 2 → 4 → 6 streams, clamped to the
   **effective cap**: the configured maximum (6), lowered to 5 when the HTTP/1.1 probe reservation
   is active (§11), and further lowered by the **floor rule**: a trial to *N* streams is skipped
   (plateau reason `floor-limited`) when the projected per-stream rate `L / N` would make the
   minimum 16 KiB request take longer than `2 × target` (2 s), i.e. when `L / N < 8 KiB/s`. `L`,
   the link the step showed, is the larger of `T_base` and the sum of `rate_s` (§3) over the
   current streams' last completed requests. `T_base` alone understates the link when streams
   idle between requests: one stream over a 600 ms round trip moves bytes for under half of each
   request cycle, so on a 300 kbit/s link its aggregate read ≈ 104 kbit/s while its own transfers
   ran at ≈ 237 kbit/s. One stream's `rate_s` alone understates it when streams overlap, each
   seeing a share: two partly overlapping streams on that link read ≈ 177 kbit/s together and
   ≈ 234 kbit/s each at most, which would skip a trial to 4 that gives each ≈ 9 KiB/s. The sum
   overstates the link only when streams take turns, by at most their count; the trial then shows
   no gain and the ramp plateaus `no-gain`, which costs time, never a number.
   Wait `I_s` (the new streams settle), then measure `T_trial` over `I_m`.
3. **Compare.** If `T_trial ≥ 1.05 × T_base`, the trial is kept, `T_base := T_trial`, and the next
   trial starts. Otherwise the ramp **plateaus**: no further trials, the stream count stays where it
   is (the extra streams are not removed, to avoid churn; the aggregate is what is measured), and
   the plateau reason is recorded (`no-gain`). Reaching the effective cap is the other end (`cap`).

   **One more step on fast links.** When a trial shows no gain, `T_base` is at least
   **900 Mbit/s** and the sequence has a next step under the effective cap, the ramp does not
   plateau yet: it moves to the next step, settles and measures as for any trial, and compares
   that step with the same `T_base`. A gain keeps it as usual; no gain again plateaus `no-gain`,
   with the streams of that step kept. From about a gigabit, one connection is often held by a
   ceiling on the path that is per connection, not per link: a router core or a network card
   queue picked by hashing the connection's addresses and ports, or one member of a link
   aggregate. An added connection can then hash onto the same core, queue or member as one already
   running and show no gain where one more connection, likely to land elsewhere, would. Below
   900 Mbit/s, which a saturated 1 GbE link stays just above, the extra step would cost a trial's
   time on links that one or two streams already fill, and could carry the phase past its
   minimum.
4. On upload, each measurement waits for the watermark to pass the end of its interval; the per-step
   time is therefore `I_s + I_m + confirmation delay`.

Fixed-N and single modes skip the ramp: the N streams start together and the ramp counts as settled
after `I_s`.

**Positions on the series.** The ramp counts its intervals in whole buckets of the evaluation
series, each interval rounded up to a whole number of buckets. The baseline's `I_s` starts at the
first bucket holding bytes: the first chunk's on download, the cell of `P_start` on upload. A
trial's `I_s` starts where the added streams took effect: on download at
the bucket of the add, on upload at the cell of the latest first byte (`startMs`) among the added
streams' first requests, known once they confirm (a stream whose first request failed counts with
its first confirmed one); until then the trial waits. An interval whose
buckets are all unknown (inside a failure gap) measures nothing and is measured again over the next
`I_m`. The baseline always measures its first two intervals; a further one runs only if it ends no
later than 3 s after `I_s`. The ramp settles at the end of the interval that decided its plateau
(fixed and single modes: `I_s` after their start; a trial ended by a `429`, §4: the end of the
series read so far, which is also its last add when its streams were never placed), and that bucket
is the settle instant the warm-up cap moves to (§8.3).

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
condition 2 or 4 gives `insufficient-samples`, condition 3 gives `unstable`. At the end of the
phase `unstable` is set by the steady window alone (§8.4), whatever the warm-up saw, and at the
gauge's resolution (§14): the window's known buckets are summed per **5** (500 ms; a group with an
unknown bucket, or short of five at the end, is left out), and the reason holds when the
coefficient of variation of those sums exceeds 10 %, dropped otherwise. The warm-up reads single
buckets because it has only ten; the window has seconds, and a browser that hands the body to
the page in bursts with pauses of about a bucket (Safari does) swings adjacent buckets while
their sums are flat, which is delivery, not the link. The window therefore shows the stability
the warm-up could not (a browser that sends each request in one burst can keep the first seconds
choppy on a steady link) and the instability a quiet warm-up missed (a rate that steps for
seconds at a time). A direction left with no reason has `normal` confidence. The other two
reasons stay as the warm-up set them: the window shows nothing about them. A Continuous direction
reads `unstable` from its 1 s cells instead of the 500 ms sums (§15).

**A running ramp moves the bounded cap.** A full ramp needs at least `I_s + 2 × I_m` for the
baseline plus `I_s + I_m` per trial, ≈ 6.5 s at the 1 s and 500 ms floors, more than Standard's
5 s download cap. So in a bounded phase, if the ramp has not settled when the cap is reached, the
cap moves to the instant it settles, but no later than `50 % of the phase max` of confirmed series
(Standard: 10 s download, 12.5 s upload); the conditions are then evaluated there as above, and a
ramp still running at that bound gives `ramp-unsettled`. The other half of the max is left for the
steady window and its extension (§8.4). Continuous keeps its absolute 10 s cap with no move, so it
always has a steady window starting at most 10 s of confirmed series after the phase began.

**Reading the series.** The conditions are evaluated at each newly known bucket in order, on the
series up to it, with the request counts known at that moment; an upload series that grows by a
whole request at once is evaluated bucket by bucket. "The last 10 confirmed buckets" are the last
10 known buckets, skipping unknown ones, and conditions 2 and 3 need all 10, so condition 4 holds
whenever they can. On download, "1 s of continuous chunk arrivals" means that those 10 buckets all
hold bytes. `I_s` after the last add (condition 1), the cap, its bound and a fixed warm-up count
known buckets, from the series' first bucket: the phase start on download, the cell of `P_start`
on upload. When the cap has moved, warm-up ends at the settle instant, with the conditions
evaluated on the series up to it, even when that bucket was evaluated before the ramp settled.

**Advanced setting.** The warm-up setting is `auto` (the rule above, default) or a fixed duration.
With a fixed duration, warm-up ends exactly then; the ramp still runs, and an unsettled ramp at that
instant gives `confidence: low` with reason `ramp-unsettled`.

### 8.4 Steady Window and Extension

The **steady window** runs from warm-up end to the phase end (download) or to
`W_end_final = min(C_final, M_end)` (upload). The phase is extended past the preset's nominal
duration, up to its max, until the window holds at least 3 s **and** (upload) at least 3 confirmed
requests inside it (download: at least two contributing requests) **and** is stable, its 500 ms
sums varying by at most 10 % (§5, §8.3); the upload extension test is made on the watermark, so
the phase keeps sending until the *confirmed* window is long enough and stable.

### 8.5 Presets

| Preset | Streams | Download min / max | Upload min / max | Idle pings |
| --- | --- | --- | --- | --- |
| Quick | fixed 3, no ramp | 5 s / 10 s | 5 s / 10 s | 10 |
| Standard (default) | auto, full ramp | 10 s / 20 s | 15 s / 25 s | 20 |
| Extended | auto, full ramp | 20 s / 40 s | 20 s / 40 s | 50 |
| Continuous | auto, Standard ramp | none (`null`) | none (`null`) | 20 |

Standard's upload minimum is 5 s longer than its download minimum because every upload ramp
decision waits for the confirmation delay (§8.2): on a fast link the full ramp to 6 streams settles
at ≈ 8.1 s on the server timeline, known on the client at ≈ 8.8 s, instead of ≈ 6.5 s, and its 3 s
window is confirmed at ≈ 11.8 s (§19.4). The 15 s minimum holds that, so a fast link ends at the
minimum and is never reported as extended.
Quick is meant for fast links. At 300 kbit/s its three fixed streams share ≈ 36.6 KiB/s, so the
three initial 64 KiB uploads take ≈ 5.2 s and first confirm at ≈ 5.5 s. By then the confirmed series
already spans ≈ 5 s, so warm-up ends at Quick's 3 s cap (`max(3 s, 25 % × 10 s)`) before two
requests per stream have confirmed, and the window condition holds at ≈ 7–8 s when the 16 KiB
follow-up requests confirm. Quick then reports an upload number with `confidence: low`
(`insufficient-samples`); the UI suggests Standard for links this slow. Continuous runs one
throughput direction until stopped, until the data cap is reached or until an optional run length
elapses (§15), with a 10 s absolute warm-up cap (§8.3, §15); running a single direction is the
current answer to an item tracked in [open-questions.md](open-questions.md).

**Continuous settings.** A Continuous run resolves to one direction, `continuousDirection`
(`download` by default, or `upload`), and an optional `runLengthMs` from 60 s to 7 days
(60 000–604 800 000 ms), absent for a run that lasts until it is stopped. Its duration bounds are
`{minMs: null, maxMs: null}` for both directions, in the settings, in `GET /info` and in the
result. Its idle ping count is 20. Idle latency runs first unless `phases` leaves it out; the
throughput entries of `phases` do not choose the direction, which is always
`continuousDirection`, so a Continuous run whose `phases` lists no throughput direction still runs
it.

### 8.6 Shortfall

If a phase reaches its max and the window condition is not met, the result for that direction is
`insufficient data` (no number; data used shown), with a notice offering the next larger preset
(Quick → Standard → Extended); the other direction's result is kept. A bounded phase never reports a
number from one request (Continuous follows §15).

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
same window, shown as a secondary number labeled "peak", never as the headline. The headline
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
- **Count.** The preset's ping count (§8.5), the warm-up ping included. Pings are sequential with
  one outstanding: the next ping is sent when the previous one is answered or lost, no sooner than
  100 ms after the previous send and no sooner than 50 ms after the previous answer. A ping sent in
  the moment the previous echo arrives is held a few milliseconds by some browsers (about 4–5 ms
  in Firefox and WebKit at a 300 ms RTT in the accuracy harness), which the loaded pings on their
  own 300 ms tick (§11.1) never meet, so it would raise the idle median and understate the
  increase over idle. The first ping on each path is the warm-up: its sample is
  discarded and it is counted neither in the statistics nor as loss, answered or not. On the HTTP
  path a ping answered with a status other than `204` is lost, and one whose Resource Timing entry
  is missing, waited for as §11.6 says, uses up its place in the count but gives no sample and is
  not counted as loss.
- **Statistics.** min, median and p90 of the RTT samples.
- **Jitter** = mean absolute difference of consecutive successful samples, in send order.
- **Timeout policy, tolerant of VPN RTTs.** The first ping times out after 10 s; later pings after
  `max(2 s, 4 × running median)` of the samples so far, capped at 10 s, and after 10 s while there
  is no sample yet. A timeout is not an error: the ping is counted as lost and the next one is
  sent.
- **Loss percentage** = lost pings ÷ the pings that ended with a sample or a loss, the warm-up
  excluded; a ping without timing and a ping still outstanding when the phase stops count in
  neither. This is a probe-timeout rate over TCP, not packet loss: TCP retransmits hide packet
  loss from the browser, so it never feeds the packet-loss slot (§13, §18).
- **Limits.** The phase stops after 30 s even if the count is not reached. With fewer than 5
  successful samples idle latency is `unavailable`; with all pings lost the test shows the
  `server unreachable` notice with retry.
- **Stop.** A user stop during the phase keeps the samples so far: with at least 5 successful
  samples idle latency is reported from them and the result is `partial`, the directions skipped;
  with fewer, nothing is kept ([ui/flows.md §4](ui/flows.md#4-cancel-mid-test)).
- **Timer resolution.** Browsers coarsen `performance.now()` (to 100 µs or 1 ms, depending on the
  browser and isolation). Sub-millisecond LAN latencies are therefore reported with the timer's
  resolution and never with false precision ([edge-cases.md](edge-cases.md)).

## 11. Latency Under Load

Two independent probe paths run during download and upload; neither is derived from the other.
Path A is specified here; path B in §12.

### 11.1 Path A — WebSocket Echo (Bufferbloat Source)

JSON ping frames with a client sequence number and `performance.now()` every **300 ms** over
`/api/v1/ws`; RTT = echo arrival − send. Up to 4 pings may be outstanding, matched by sequence
number and send time; a tick that would exceed 4 is skipped. A ping not answered within 30 s, or
within the direction's grace after the direction ended (§11.4), is counted as lost.

Path A reports, per direction:

- `loaded latency (WebSocket)`: median and p90 of the samples sent while at least one throughput
  request was in flight, excluding the first `I_s` of the phase (slow start);
- the **increase over idle**: median of loaded minus median of idle (0 if negative);
- the **bufferbloat grade** (§11.3).

A direction has a loaded-latency number, from path A or its fallback, only when it has a steady
window: status `measured`, or `partial` with a number (§8.4). A direction that ended
`insufficient-data` or `error` reports no number, even if pings were answered while it ran, because
its load never settled: its `loadedLatency` is `unavailable` with reason `no-steady-window`, and its
increase is unavailable to the grade (§11.3) and the quality scores (§13). A `skipped` direction
carries no `loadedLatency` at all (§17).

WebSocket connections do not count against the HTTP/1.1 six-connection limit, so path A never queues
behind throughput requests. If the WebSocket cannot be opened (a proxy without upgrade support),
path A is `unavailable` and the HTTP fallback rules below apply.

### 11.2 Path A Fallback — HTTP Probe

`GET /api/v1/ping` (`cache: 'no-store'`) on a 300 ms schedule with **at most one probe
outstanding**: a tick that fires while a probe is pending is skipped, never queued, and there is no
catch-up burst afterwards. The engine records the actual inter-sample gaps and the number of skipped
ticks alongside the samples. At 600 ms RTT this yields one sample per ~600–900 ms instead of
overlapping probes queuing behind each other on the one reserved connection. A probe still
unanswered after 30 s is aborted and counted as lost.

- **HTTP/1.1.** These probes would otherwise queue behind six in-flight throughput requests and
  measure browser scheduling, not the network. Policy: when the fallback is active on HTTP/1.1 the
  engine caps throughput streams at **5** so one connection is always free, and marks the samples
  `source: http-h1-reserved`. Those samples may grade **only** if the reservation held for the whole
  phase (no sample observed with more than 5 requests in flight) **and** at least 10 samples were
  collected in that direction; otherwise loaded latency is `unavailable` and no grade is shown.
- **HTTP/2.** The fallback multiplexes on the load connection and is labeled `http-h2` (`http-h3`
  on HTTP/3); it may grade under the same sample-count rule. No reservation is needed.
- Fallback samples are never mixed with WebSocket samples in one statistic.

**The reservation decision.** It applies only while the HTTP fallback is active: a direction that
starts with a working WebSocket never reserves, whatever the protocol, and the first direction to
start after the fallback took over is the first that may. The protocol is the `nextHopProtocol` of
the Info phase's idle `GET /api/v1/small` (§1): `h2` gives the source `http-h2` and `h3` the source
`http-h3`, with no reservation; `http/1.1`, an empty value or anything else reserves, with the
source `http-h1-reserved`. While the reservation holds, the stream ramp's cap (§4) **and** the requests a
phase issues before its ramp (its early issue) are bounded by 5, a fixed stream count above 5 is
lowered to 5, and the run carries the notice `probe-reservation` with `streams: 5` once, the first
time a direction runs reserved (§16).

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

If only one direction has a gradable increase, the grade is computed from it and labeled with that
direction ("download only"). Without any gradable direction, or without idle latency, no grade is
shown. The grade is displayed as letter and text, never by color alone
([ui/i18n-a11y.md](ui/i18n-a11y.md)).

The result carries it as `bufferbloat: {grade, basis, increaseMs}`: `basis` is `download+upload`
when both directions have an increase, else the one direction that has it (`download` or
`upload`), and `increaseMs` is the increase the grade was read from. Without idle latency or a
gradable direction `bufferbloat` is absent, never `null`.

### 11.4 Loaded-Latency Statistics and Availability

- **Samples.** A sample counts toward a direction when its ping was sent while at least one of the
  direction's throughput requests was in flight and after the first `I_s` of the phase. Every
  source, WebSocket included, needs at least **10** such samples; with fewer the direction's
  loaded latency is `unavailable` with reason `insufficient-samples`. RTTs are quantized to the
  timer resolution like the idle samples (§17).
- **Loss.** `lost` counts the direction's pings unanswered within 30 s or within its grace. The
  pinger stops sending at the direction's end instant; pings still outstanding are waited for up to
  the grace, while whatever follows starts as it would. On upload the grace is the one of §5,
  `min(2 s, 2 × d)`; download, which aborts its requests at once, uses the same `min(2 s, 2 × d)`
  for its pings, with `d` the expected duration of its longest in-flight request at the end
  instant, and the full 2 s when that request's stream has no completed request yet.
- **The increase needs an idle median.** `increaseMs` is present only when idle latency has a
  median: `idle` present and not `unavailable` (§10). When idle latency was left out by the
  settings (§1) or is `unavailable` (fewer than 5 samples), a measured loaded latency still carries
  `medianMs`, `p90Ms` and its series, but `increaseMs` is absent, no grade is computed, and the UI
  shows "no idle latency" in place of the change ([ui/screens.md §6](ui/screens.md#6-result-metrics-units-and-precision)).
  The CSV export's columns are unchanged.
- **Mixed paths.** Idle latency and a direction's loaded latency may come from different paths:
  the increase may compare an idle WebSocket median with a loaded HTTP median, as when the
  WebSocket closed after idle latency. The direction then records the idle path as `idleSource`
  (`websocket` or `http`), present only when it is not the path of `source` (WebSocket for
  `websocket`, HTTP for the three `http-*` sources) and only with an idle median.
- **Two sources in one direction.** When a direction's own samples came from two sources, on
  HTTP/1.1 its loaded latency is `unavailable` with reason `reservation-broken`; on HTTP/2 or
  HTTP/3 only the samples of the later source count, so no statistic ever spans two sources. When
  the WebSocket closes after idle latency on HTTP/1.1 and cannot be reopened
  ([edge-cases.md §6](edge-cases.md#6-network-change-mid-test)), the direction already running
  keeps its stream count and its loaded latency is `reservation-broken`; the next direction runs
  reserved, and the grade's basis names that direction alone.
- **Reasons.** An `unavailable` loaded latency names one reason: `no-steady-window` (the direction
  has no steady window, §11.1), `insufficient-samples` (fewer than 10 samples), `reservation-broken`
  (two sources on HTTP/1.1, or more than 5 requests observed in flight at any sample under the
  reservation) or `no-probe-path` (no probe could be sent during the direction: the WebSocket's
  close sequence covered it).

### 11.5 Time Base and Series

The loaded-latency decisions, whether a request was in flight when a ping was sent and whether it
was sent after the first `I_s`, are taken on the client clock from the direction's phase start.
The stored `series` of `{atMs, rttMs}` follows the direction's own `series` timeline (§17): on
download, milliseconds from the phase start on the client clock; on upload, the server timeline,
each sample's send instant placed with the display offset of §7.4, exactly as upload `events` are
placed, and computed when the direction settles. The live `sample` event carries each answered
ping as `{atMs, rttMs}` on the client clock, and the UI places upload samples with the same offset
it already uses for the `sending` line ([architecture.md
§4](architecture.md#4-engine--ui-message-contract)). The offset is display-only here too: no
statistic reads `series` times.

### 11.6 Probe Bookkeeping

- **One echo, many listeners.** Idle latency and each direction's loaded latency share the one
  WebSocket; every pong reaches every listener, each keeps its own sequence space and matches its
  pings on sequence number and send time together.
- **Close sequence.** While the close sequence of [edge-cases.md
  §6](edge-cases.md#6-network-change-mid-test) runs, the loaded pinger records the ticks it cannot
  send as skipped ticks, a gap in its series, and does not switch to HTTP; it resumes on the
  reopened WebSocket, or on the HTTP fallback when the reopen fails. Idle latency keeps its own
  behavior (§10).
- **Bounds.** At most 4 pings outstanding on the WebSocket and 1 probe on HTTP; an HTTP probe is
  aborted after 30 s.
- **Timing entries.** The browser may add a request's Resource Timing entry after the response,
  so a request that ended without one waits for it, with two patiences:
  - **Probes** (the idle and loaded HTTP pings of §10 and §11.2, the path B capability probe and
    the path B probes of §12.3) wait up to **250 ms** after the answer, on a patience of their
    own. A browser that has reported no probe entry yet in the run is waited for once; after its
    first found probe entry, every probe is waited for, however many miss.
  - **Download and upload requests** wait up to **50 ms**, and after a miss are not waited for
    again until an entry is found at once, so their timing never holds a stream.

  A late upload entry under load must therefore not stop path B finding its own entries. A probe
  being single-outstanding, a tick is skipped only while a late or missing entry is waited for,
  and a probe whose wait runs past its direction's end instant is dropped as any probe outstanding
  then (§12.3), so the longer bound may lose a window's last probe. Either patience costs a browser
  that never reports timing a single wait.

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
  fallback (a tick while a probe is pending is skipped). It runs beside path A, on its own 300 ms
  cadence: neither path waits for the other.
- **Sampling window.** Probing runs from the direction's warm-up end to the direction's end
  instant, on the client clock, so every sample falls under full load:
  - **Start.** On download, the warm-up end (§8.3). On upload, whose warm-up end is decided on the
    server timeline, the client instant the engine learns it: the confirmation that ended the
    warm-up.
  - **End instant.** On download, the end instant of §5, where in-flight requests are aborted. On
    upload, the instant the direction stops issuing requests (the request target `max − 1 s`, the
    end condition, the data cap, or the failure that ends it), or the abort instant of a stop, an
    error or a paused page; the grace's drain that follows is never sampled.

  A probe still outstanding at the end instant is aborted and not counted, so path B needs no
  grace and is settled when its direction finishes. A **valid probe**
  is one answered `200` within the window whose Resource Timing entry was found (waited for as
  §11.6 says) with non-zero `requestStart` and `responseStart`; a failed, aborted or unmatched
  probe is not a sample.
  `samples` counts the valid probes of the window, and the 10-sample rule of §12.4 counts them.
- **Timing.** From the Resource Timing entry for that fetch: `http_l = responseStart −
  requestStart`, quantized to the timer resolution like every other latency (§17);
  `responseEnd − fetchStart` is recorded too, and its median is reported as `totalMedianMs`. The
  entry's `fetchStart`, `connectStart` and `connectEnd` are read as well. Same-origin requests
  expose these fields without `Timing-Allow-Origin`.
- **New connection.** A probe whose entry has `connectStart !== connectEnd` opened a new
  connection. An entry without connect fields (absent, or both zero because the browser did not
  expose them) gives no evidence either way: the connection is unknown, which counts like a new
  one for the state (§12.4).
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
  reverse proxy") and no path B probe runs under load. Any value other than `h2` or `h3`
  (`http/1.0`, a draft label such as `h3-29`) is treated as `http/1.1`. A capability probe that
  fails, or whose timing entry is not found, gives `unavailable_h1` with `protocol: ''`, exactly
  like the empty protocol below and shown with the same words. An empty `nextHopProtocol` (the
  protocol was not reported) is treated the same way: path B is `unavailable_h1`, shown as "protocol
  not reported — treated as HTTP/1.1", because on a possibly HTTP/1.1 connection with every
  connection busy the probe would measure browser scheduling, not a loaded shared connection. This
  matches the reservation rule of §4, which also treats an unknown protocol as HTTP/1.1.

### 12.4 States

| State | Meaning |
| --- | --- |
| `measured` | h2 or h3, at least 10 samples per direction with no new connection opened, and the ramp reached the stability criterion (warm-up ended without the cap) |
| `uncertain` | h2 or h3 but fewer than 10 samples, or any sample opened a new connection or has an unknown connection, or the protocol changed mid-phase (a sample's protocol differs from the capability check's), or the warm-up ended at its cap |
| `unavailable_h1` | the capability check saw any protocol other than `h2` or `h3` (HTTP/1.1, an empty value, anything else), or failed, or found no timing entry |
| `unavailable_insufficient` | the direction has no steady window (it ended `insufficient-data`, `error`, or `partial` without a window), or fewer than 4 samples in the intervals the formula uses, so no meaningful trimmed mean exists; no number is shown |

**Precedence.** When several rows apply, the first of `unavailable_h1`, `unavailable_insufficient`,
`uncertain`, `measured` wins. A `skipped` direction has no `responsiveness` block at all.

`measured` still carries the "not verifiable" qualifier; it only says the observable preconditions
held.

The state names keep the snake_case spelling above, an explicit exception to the kebab-case codes
of [open-questions.md](open-questions.md) item 11: they are states of a result field, not notice
codes, and no notice carries them.

### 12.5 Formula

Loaded responsiveness only:

```text
RPM = 60000 / TM95(http_l)
```

where TM95 is the 95 % single-sided trimmed mean over the samples of the last 4 intervals of the
direction, as in the draft: intervals are 1 s long (the draft's interval length, independent of the
ramp's `I_m`), so at one probe per 300 ms the formula sees about 13 samples. The four intervals end
at the direction's end instant, on the client clock; a sample belongs to them when its probe was
sent (`fetchStart`) within those 4 s. The number of samples dropped from the slow end is
`floor(0.05 × n)`; with fewer than 20 samples nothing is trimmed and TM95 equals the plain mean,
which the result detail states. TM95 is quantized to the timer resolution like every other latency
statistic (§17), and `rpm` is `60000 / tm95Ms` from that quantized value, rounded to a whole
number. Fewer than 4 samples in those 4 s give `unavailable_insufficient`, and so does a quantized
TM95 of 0 (samples below the timer resolution), from which no RPM follows. There is no foreign
component, and the UI copy never compares this number to Apple's RPM. Path B samples feed only
this metric; the bufferbloat grade uses path A or its qualified fallback.

### 12.6 Result Shape

Each direction that ran (not `skipped`) carries `responsiveness: {state, protocol, samples, rpm?,
tm95Ms?, trimmed?, totalMedianMs?}`:

- `protocol` is the capability check's `nextHopProtocol` as the browser reported it (`h2`, `h3`,
  `http/1.1`, or any other value, which gives `unavailable_h1`), or `''` when it was empty, failed
  or had no timing entry;
- `samples` counts the window's valid probes (§12.3), `0` when no probe ran;
- `rpm`, `tm95Ms`, `trimmed` and `totalMedianMs` are present on `measured` and `uncertain`, absent
  otherwise: `tm95Ms` is the TM95 of §12.5, `trimmed` the number of samples dropped from the slow
  end (`0` means the plain mean), and `totalMedianMs` the median of `responseEnd − fetchStart` over
  the window's valid probes, the "recorded too" value (in Continuous, over the last 64, §15).

`tm95Ms` and `totalMedianMs` are quantized to `client.timerResolutionMs`, as the loaded-latency
statistics are (§17).

## 13. Quality Scores

Quality scores follow Cloudflare's AIM (Aggregated Internet Measurement) point tables
([research/cloudflare.md](../research/cloudflare.md)).

### 13.1 Inputs

| AIM metric | BitGauge input | Input name when missing |
| --- | --- | --- |
| `latency` | idle latency median (ms), quantized (§17) | `idle-latency` |
| `jitter` | idle jitter (ms), quantized (§17) | `jitter` |
| `loadedLatencyIncrease` | `bufferbloat.increaseMs` (§11.3): the larger of the per-direction increases from path A or its qualified fallback (ms); when only one direction has an increase (§11.1), that one, and the scores are labeled with the direction ("download only"), as the grade is | `loaded-latency` |
| `download` | the download direction's `bitsPerSecond` headline (bit/s) | `download` |
| `upload` | upload headline (bit/s) | — |
| `packetLoss` | **not measured**: fixed at 0 points | — |

`upload` is listed for completeness with AIM, but no experience of §13.3 uses it, so it is never
an input and never missing.

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

An input is unavailable when its value does not exist: `idle-latency` and `jitter` without an idle
median and jitter (idle latency left out, or `unavailable`, §10), `loaded-latency` without
`bufferbloat` (§11.3), `download` without a download headline (a skipped download, or a direction
with no number).

### 13.4 Packet-Loss Handling

Packet loss is fixed at 0 points in every experience and displayed as "packet loss — not measured"
in its reserved slot. Because a measured loss could only lower the points, the scores are an upper
bound with respect to loss, and the UI notes this next to them.

### 13.5 Result Shape

Every result carries `scores: {basis, packetLoss: "not-measured", streaming, gaming, rtc}`:

- `basis` is `bufferbloat.basis` (`download+upload`, `download` or `upload`), or `none` when the
  result has no `bufferbloat`, so the scores' direction label reads as the grade's;
- each experience is `{points, band}` when all its inputs exist, with `points` the clamped sum, or
  `{missing: [...]}` naming every unavailable input of that experience (§13.3) in the order of
  §13.1 (`idle-latency`, `jitter`, `loaded-latency`, `download`), never both: gaming never names
  `jitter` or `download`;
- `scores` is present even when no experience is scored, as on a `latency`-only run.

## 14. Units and Gauge

- **Units.** Decimal bits by default: kbit/s, Mbit/s, Gbit/s, auto-scaled (1 Mbit/s = 10⁶ bit/s).
  Bytes per second (kB/s, MB/s, GB/s, decimal) are an option. Data used is shown in decimal bytes
  (kB, MB, GB). Request sizes in this specification are in KiB and MiB because they are buffer
  sizes, not rates.
- **Precision.** Three significant digits for rates (e.g. 472 kbit/s, 94.1 Mbit/s, 2.38 Gbit/s);
  latencies in whole milliseconds above 10 ms and one decimal below.
- **Gauge value.** The needle shows the rate over the last 5 buckets; on upload, the client's
  sending progress (§2) over the last **10** buckets (1 s), because a browser that reports each
  request's progress in one burst (§7.2) makes a shorter window swing with every burst. The
  numeric readout always shows the exact value.
- **Gauge window.** The gauge is logarithmic and shows **four decades** at a time, `[10^k,
  10^(k+4))`, with ticks per decade. In bits mode k = 4, 5 or 6 (bit/s): 10 kbit/s–100 Mbit/s,
  100 kbit/s–1 Gbit/s or 1 Mbit/s–10 Gbit/s. In bytes mode the windows are byte decades, k = 3, 4,
  5 or 6 (B/s): 1 kB/s–10 MB/s, 10 kB/s–100 MB/s, 100 kB/s–1 GB/s or 1 MB/s–10 GB/s; four windows
  are needed because byte decades do not line up with bit decades.
  - The window moves **one decade down** when the gauge value stays below `10^(k+1)` (the bottom
    decade) for 2 s, and **one decade up** when it stays above `10^(k+3)` (the top decade) for
    2 s. After a shift the opposite threshold is two decades away, so a value near a boundary
    cannot make the window flip back and forth; the 2 s dwell adds time hysteresis.
  - The **first throughput direction of a run** (download or upload, whichever the configured
    order runs first, or the one direction of a Continuous run) starts in 1 Mbit/s–10 Gbit/s in
    bits mode and 100 kB/s–1 GB/s in bytes mode, the byte window closest to it. The **second
    direction** starts in the window the first one ended in. Nothing carries over between runs.
    From the start window a slow link reaches the bottom window after at most two shifts in
    either mode; in bytes mode a link above 100 MB/s shifts up once.
  - Values outside the outermost windows (below 10 kbit/s or 1 kB/s, above 10 Gbit/s or
    10 GB/s) pin the needle at the edge.
  - The window is presentation only: it never feeds a number, and the caption names it. The
    **UI's gauge component** picks and shifts the window from the gauge values the engine sends;
    the engine never chooses, sends or knows the window. The rule is a pure function of the value
    stream and the clock, unit-tested with synthetic sequences like the engine.
- **Gauge marks.** A band shows the minimum and maximum of the last 10 gauge values (1 s). On
  download, a peak tick shows the steady-window p90 so far and is hidden during warm-up; on upload
  there is no tick while the phase runs, because the gauge shows sending progress, not a
  measurement. In Continuous mode the tick shows "p90, last hour" (§15). At completion an inner
  arc shows the upload headline.
- **Idle latency** switches the gauge to milliseconds: a fixed logarithmic 1–1000 ms scale with no
  window shifts.
- **Live average and peak.** While a direction runs, its live average and peak are computed by the
  engine over the steady window so far, with the rules of §9 and §7.6, and sent in its `sample`
  messages ([architecture.md §4](architecture.md#4-engine--ui-message-contract)). Until warm-up ends
  the UI shows "warming up" instead of either number. A Continuous direction sends its run-wide
  minimum, average and maximum and its "p90, last hour" instead, absent until 3 fully known 1 s
  cells exist (§15); the UI shows "—" for an absent figure, never 0.

## 15. Continuous Mode

Continuous mode runs one throughput direction, `continuousDirection` (the current answer to an item
tracked in [open-questions.md](open-questions.md); settings in §8.5), with the Standard ramp, no
maximum and a 10 s absolute warm-up cap, until the user stops it, the data cap is reached, or an
optional run length (the `duration` URL parameter or the Settings run-length field,
[ui/url-params.md](ui/url-params.md)) elapses. A run without a run length may go on past 7 days.
It shows live min, average and max.

**Run length.** The run length counts from the direction's phase start on the client clock, the
same instant `continuous.elapsedMs` counts from, so idle latency is not part of it. When it
elapses, a download ends at that instant like a bounded download at its end instant (§5), and an
upload stops issuing requests then and gives those in flight the grace of §5, as at a bounded
upload's request target, so its last cells can still be confirmed.

**Direction status and result status.** Result completion is kept apart from measurement
availability. A **fully known 1 s cell** is an hour-tier cell whose ten native cells are all known
(on download every cell is). Counting from the steady start (the warm-up end):

- **Measured.** Once at least **3** fully known 1 s cells exist, the direction is `measured`, and a
  run that ends then has result status `complete`, with no `stopped-early` notice: stopping is how
  such a run normally ends. The three cells are the whole rule: they replace the bounded minimum
  window of §5 and §7.6, request counts included.
- **Insufficient data.** A run that ends during the warm-up, or after the steady start with fewer
  than 3 fully known 1 s cells, gives the direction status `insufficient-data`, with no
  `bitsPerSecond`, `peakBitsPerSecond`, `minBitsPerSecond`, `maxBitsPerSecond` or `confidence`,
  and result status `partial`, which the UI offers through Keep in history (§17), with the
  `stopped-early` notice of a stopped bounded direction when a stop or a hidden page ended it.
  Examples: a stop right after the warm-up ends; an upload whose cells are all unknown because a
  failure gap runs from the steady start to the end.

Every ending reads by these two outcomes: the user's stop, the run length, the data cap (with the
`data cap reached` notice), an upload failure over HTTP/1.1 (§7.5, with the notice
`upload interrupted by a failed request`) and the browser pausing a hidden page
([edge-cases.md §5](edge-cases.md#5-tab-hidden-mid-test)). An error (§5, the error codes of
[architecture.md §4](architecture.md#4-engine--ui-message-contract)) ends the run with result
status `error`, as in a bounded run. There is no `extended` event and no maximum.

**Headline, peak and confidence.**

- `bitsPerSecond` is the run-wide average over the fully known 1 s cells since the steady start:
  their bytes over their time. `windowMs` is that run-wide known time.
- `minBitsPerSecond` and `maxBitsPerSecond` are the lowest and highest of those cells.
- `peakBitsPerSecond` is the **"p90, last hour"**: the p90 of the fully known 1 s cells in the hour
  ring (§2's percentile rule), present only when the ring holds at least 3 of them and absent
  otherwise, also on a `measured` direction whose last hour is all failure gap. An exact run-wide
  p90 is **not** computed; an approximate run-wide quantile sketch is a possible later addition.
- `confidence` is read from **running sums** over the same cells (count, sum and sum of squares),
  which give the population coefficient of variation of §2 over 1 s cells without keeping them:
  the reason `unstable` holds when it exceeds 10 %, in place of the bounded window's 500 ms sums
  (§8.3), and the warm-up's reasons stay as it set them; `cpu-bound`
  (§16) takes the Worker's busy fraction over the same span, from steady start to end, through
  bookkeeping that keeps a bounded number of busy samples and answers that span exactly.
- Overhead compensation (§9.3) applies to the headline, the minimum, the maximum and the peak as it
  does to a bounded direction's numbers.

**Retention (constant memory).** Every retained structure is a fixed-size ring, allocated at its
full length when the run starts; nothing grows with run length:

| Tier | Cell | Ring length | Use |
| --- | --- | --- | --- |
| native | 100 ms | 6000 (10 min) | live gauge, last-minute statistics, live chart |
| hour | 1 s (exact sum of ten native cells) | 3600 (60 min) | chart history, hourly p90 |
| day | 1 min (exact sum of sixty 1 s cells) | 1440 (24 h) | chart history |
| long | 10 min (exact sum of ten 1 min cells) | 1008 (7 days) | chart history; beyond 7 days the oldest cells are dropped |

- Run-wide statistics are **running aggregates** over fully known 1 s cells since the steady start:
  count, sum (giving the average), sum of squares, min, max, and the data-used counter. They need
  constant memory.
- **Unknown cells (upload).** Native cells enter the rings only once confirmed. A native cell that
  overlaps a failure gap (§7.5) is stored as unknown and shown as a gap. Every coarser cell stores
  two exact sums over its finer cells: bytes, and known time (the time covered by known cells). Its
  rate is bytes ÷ known time, and a cell with no known time is a gap. Run-wide aggregates and the
  "p90, last hour" use only fully known 1 s cells. On download every cell is known, and the
  coarser cells are the plain exact sums of the table.
- **Saved series.** The result's `series` (§17) is the run since the steady start, downsampled to
  at most 2000 points from the finest tier whose ring covers the whole run since the steady start
  (native, hour, day or long, in that order), with `knownMs` per point; the other tiers exist only
  in memory while the run is shown. A run longer than the long ring (7 days) saves only its last
  7 days, and the result detail says so.
- **Failure gaps.** The direction's `events` keep the last 100 `failure-gap` events; an older gap
  still shows in the saved series as unknown or partly known cells.
- **Display offset (upload).** The display-only offset of §7.4 is the median over the last 100
  confirmed requests, a fixed ring, rather than over every one.
- **Live chart.** The UI keeps rings of its own of the ring lengths above, which
  `engine/messages.ts` exports as constants, fed by each `sample`'s native buckets and closed coarse
  cells ([architecture.md §4](architecture.md#4-engine--ui-message-contract)). It picks the tier by
  the run's elapsed time, `continuous.elapsedMs` (from the phase start): native up to 10 min, hour
  up to 60 min, day up to 24 h, long beyond, and renders at most about 2000 points:
  - **Clipped only past eviction.** The chart is built from what a ring still holds. Its first
    cell is `max(min(origin, firstBucket), evictedBefore)`, where `origin` is the phase origin,
    `firstBucket` the first received cell and `evictedBefore` the ring's lowest absolute index not
    yet overwritten (unbounded below until the ring has overwritten anything). Before any eviction
    the chart is anchored exactly as a bounded direction's is, an upload's leading unknown cells
    included; after it the chart starts at the oldest retained cell, the elapsed time still read
    from each cell's own position, and sending and latency points before it are dropped.
  - **Re-binned throughput.** A tier that holds more than 2000 cells is drawn re-binned: k = ⌈n ÷
    2000⌉ adjacent cells become one point by summing their bytes and their known time (a native
    cell counts 100 ms when known), and the point's rate is bytes × 8 ÷ known time, unknown when no
    time is known. That is an exact re-binning, not smoothing. A bounded direction is never
    re-binned: its ring holds the whole run.
  - **Loaded-latency overlay.** The chart's loaded latency has rings of its own, all fed from the
    direction's start in parallel, so a tier switch finds its history: native, the raw samples,
    the last 2000; hour, 2 s bins, 1800; day, 1 min bins, 1440; long, 10 min bins, 1008. Each
    bin's value is the true median of the samples that fell in it, taken when the bin closes from
    a scratch buffer of the open bin only, never a median of medians (which differs: [100, 100,
    100, 100] and [1, 1, 1] give 50.5 ms against the median's 100 ms). Every overlay ring holds at
    most 2000 points, so the overlay is never re-binned; its points need not line up with the
    throughput's. The overlay is a display aggregate, never a reported number.
- **Data used** is shown and the per-test data cap applies. The `data-used` notice (§16) appears at
  1 GB, 10 GB, 100 GB and every further tenfold step, so a long run on a metered link is never
  silent.

**Loaded latency, last hour.** Path A keeps running. Its samples fold into **per-second medians**:
a one-second scratch buffer is the only per-sample store, and each second's median enters an hour
ring (3600) and run-wide running aggregates (min, average and max of the per-second medians). The
direction's `loadedLatency.medianMs` and `p90Ms` are the median and p90 over the hour ring's
per-second medians, labeled "last hour", and its `increaseMs`, the bufferbloat grade (§11.3) and
the quality scores (§13) derive from that median. `samples` counts every counted sample of the run,
and `series` is the hour ring's per-second medians, downsampled. The live view shows the median of
the last minute's per-second medians. **Source switch.** No statistic spans two sources (§11.4):
when path A's source changes during the run (the WebSocket lost for the rest of the test,
[edge-cases.md §14](edge-cases.md#14-proxy-idle-timeouts-on-long-continuous-runs)), on HTTP/2 or
HTTP/3 the hour ring, the run-wide aggregates, `samples`, `skippedTicks` and `lost` restart from
the later source's first sample, and `source` names the later source; on HTTP/1.1 the direction's
loaded latency is `unavailable` with reason `reservation-broken`, as §11.4 says, and no grade or
increase follows from it.

**Path B in Continuous.** The prober keeps a ring of its last 64 valid probes. At the run's end,
TM95 is taken over the probes of the last 4 s, as §12.5; `totalMedianMs` is the median over the
ring's probes; the new-connection, unknown-connection and protocol-change evidence of §12.4 is read
over the ring; and `samples` counts every valid probe since the warm-up end.

Fixed-size rings keep memory constant however long the run lasts.

## 16. Confidence and Notices

**Confidence** qualifies a direction's result:

| Level | Condition |
| --- | --- |
| `normal` | no reason remains after the window is read (§8.3) and the window condition held |
| `low` | a reason remains after the window is read: `ramp-unsettled` or `insufficient-samples` from the warm-up's cap, or `unstable` from the steady window (§8.3) |
| `cpu-bound` | the Worker's busy fraction exceeded 90 % over the steady window (Continuous: from the steady start to the end, §15) |

`cpu-bound` takes precedence over the other two levels: `reasons` still lists the warm-up's
reasons, and the direction has no `low-confidence` notice. A direction whose warm-up never ended
has no steady window and no confidence.

The Worker's **busy fraction** is the time it spends executing its own tasks (reader callbacks,
timers, message handling), measured with `performance.now()` around each task, divided by the
elapsed time. At multi-Gbit rates the browser, not the link, is often the limit; `cpu-bound` says so
instead of reporting a link speed.

**Notices** shown with the result and, where relevant, live. Each has a code, in parentheses: the
engine emits the code with the raw values the notice names, and the UI words it. Path B's states
(§12.4) and the quality scores' missing inputs (§13.5) are fields of the result, not notices.

- `test extended` (`slow-link-extended`, per direction; §5): the phase ran past its minimum,
  which a slow link needs, and a fast one whose ramp settled late or whose window stayed unstable
  needs too;
- `low confidence` with its reason (`low-confidence`, per direction with its reasons);
- `data cap reached` (`data-cap-reached`; §5);
- `server stream limit — N streams` (`stream-limit`, per direction with the lowered cap; §4);
- `insufficient data` per direction, with the next-larger-preset offer (`insufficient-data`; §8.6);
- `data used: N GB` at 1 GB, 10 GB, 100 GB and every further tenfold step during Continuous runs
  (`data-used`, with `bytes`, the decimal threshold crossed, 10⁹ × 10ᵏ; §15), informational,
  emitted live as the threshold is crossed and kept in the result;
- `URL parameter ignored` naming each parameter whose value was invalid, with the value the link
  gave, cut to 64 characters (`url-parameter-ignored`; [ui/url-params.md](ui/url-params.md));
- `partial — stopped early` with the covered duration (`stopped-early`; §7.8; never on a
  `complete` Continuous result, §15), which the UI words
  with the stop instant and, on upload, the confirmed requests and the window end the result
  carries ([ui/flows.md §4](ui/flows.md#4-cancel-mid-test));
- `server restarted` (`server-restarted`; epoch change, test aborted; §7.3);
- `server unreachable` with retry (`server-unreachable`; §10);
- `proxy buffering suspected` (`proxy-buffering-suspected`; §7.3);
- `browser upload limit` (`browser-upload-limit`, with the browser's name): the browser's own
  upload path, not the link, may be the limit. Carried when the upload's largest idle share (§8.2)
  exceeded **20 %**, in any browser: the engine saw a stream sit idle between requests far longer
  than a round trip, which is the preparation cost at work. Carried also when the browser is
  Firefox and the upload headline is at least **100 Mbit/s**, with or without a measured idle
  share: a phone's preparation rate sits near 1 Gbit/s on a fast device and lower on a slower one,
  so the name rule is a floor for devices the engine cannot measure in time (§7.2,
  [edge-cases.md §10](edge-cases.md#10-very-fast-links-where-the-browser-cpu-is-the-bottleneck),
  [research/browser-upload-limits.md](../research/browser-upload-limits.md)). The number is the
  server's and stands; the notice says what may bound it;
- `upload interrupted by a failed request` (HTTP/1.1 or unreported protocol), with the hint that
  HTTP/2 at the proxy lets uploads survive transient failures (`upload-interrupted`; §7.5);
- `response compression detected` (`response-compression-detected`; §6);
- `HTTP/1.1 probe reservation active — 5 streams` (`probe-reservation`, with `streams`, the
  reserved cap of 5; once per run, from the first direction that runs reserved; §11.2);
- `overhead compensation +p %` whenever it is non-zero (`overhead-compensation`; §9.3);
- `timer throttling detected` (`timer-throttling-detected`), `page was hidden during the test`
  (`page-hidden`), `network changed` (`network-changed`), `WebSocket reopened`
  (`websocket-reopened`), `WebSocket unavailable — HTTP latency fallback`
  (`websocket-unavailable`) and `base path mismatch` (`base-path-mismatch`), specified in
  [edge-cases.md](edge-cases.md) (§2, §5, §6, §14 and §20 there).

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
  "client": {
    "ip": "10.8.0.2", "contextLabel": "VPN", "protocol": "h2",
    "browser": { "name": "Firefox", "major": 131, "os": "Linux" },
    "timerResolutionMs": 0.1, "crossOriginIsolated": false
  },
  "settings": {
    "preset": "standard", "phases": ["idle", "download", "upload"],
    "streams": { "mode": "auto", "max": 6 },
    "download": { "minMs": 10000, "maxMs": 20000 }, "upload": { "minMs": 15000, "maxMs": 25000 },
    "dataCapBytes": null, "overheadCompensationPercent": 0, "warmup": "auto", "pingCount": 20
  },
  "idle": {
    "path": "websocket", "lossPercent": 0,
    "minMs": 48.2, "medianMs": 51.0, "p90Ms": 55.4, "jitterMs": 1.9,
    "samples": [51.0, 49.8, 52.3]
  },
  "download": {
    "status": "measured", "bitsPerSecond": 94100000, "peakBitsPerSecond": 96800000,
    "uncompensatedBitsPerSecond": 94100000, "windowMs": 5600, "streams": 2,
    "plateau": "no-gain", "confidence": { "level": "normal", "reasons": [] },
    "bytes": 118000000,
    "loadedLatency": {
      "source": "websocket", "samples": 31, "skippedTicks": 0, "lost": 0,
      "medianMs": 132.0, "p90Ms": 151.0, "increaseMs": 81.0,
      "series": [{ "atMs": 1310, "rttMs": 128.4 }]
    },
    "responsiveness": {
      "state": "measured", "protocol": "h2", "samples": 18,
      "rpm": 412, "tm95Ms": 145.6, "trimmed": 0, "totalMedianMs": 147.2
    },
    "series": {
      "bucketMs": 100, "firstCellMs": 4300, "warmupEndMs": 4300, "endMs": 9900, "values": []
    },
    "events": []
  },
  "upload": { "status": "measured", "confirmedRequests": 34, "…": "same fields as download" },
  "bufferbloat": { "grade": "C", "basis": "download+upload", "increaseMs": 81.0 },
  "scores": {
    "basis": "download+upload",
    "streaming": { "points": 20, "band": "average" },
    "gaming": { "points": 0, "band": "bad" },
    "rtc": { "points": 10, "band": "poor" },
    "packetLoss": "not-measured"
  },
  "dataUsedBytes": 268000000,
  "notices": []
}
```

- **Optional fields.** A field the run did not produce is absent, never `null`-filled. Every
  result has `schema`, `schemaVersion`, `id` (a random version 4 UUID), `startedAt`, `durationMs`,
  `status`, `label` (empty without one), `server`, `client` (`ip`, `contextLabel`, `protocol`,
  `browser`, `timerResolutionMs`, `crossOriginIsolated`), `settings`, `idle`, `download`, `upload`,
  `dataUsedBytes` and `notices`. Each direction has `status`, `streams`, `bytes`, `events`,
  `plateau` once the ramp stopped, `windowMs`, `confidence` and `series` once warm-up ended, and
  `bitsPerSecond`, `peakBitsPerSecond` and `uncompensatedBitsPerSecond` when it reports a number;
  upload adds `confirmedRequests`. The other fields are optional, so a result without them stays
  valid, as a stored record that predates one does: `note` (history), each direction's
  `loadedLatency`, the result's `bufferbloat`, `settings.download` and `settings.upload` (each
  direction's resolved duration bounds `{minMs, maxMs}`, shown with its duration among the test
  parameters), `responsiveness`, which the engine writes on every direction that is not `skipped`
  (§12.6), `scores`, which it writes on every result (§13.5), and for Continuous (§15)
  `settings.continuousDirection`, `settings.runLengthMs`, `minBitsPerSecond`, `maxBitsPerSecond`
  and `series.knownMs`. A Continuous direction that is `insufficient-data` has no `confidence`,
  even after its warm-up. `schemaVersion` stays 1: an optional field does not change it.
- `idle` is absent when idle latency did not run. A direction that did not run, left out by the
  settings or not reached, is `{status: "skipped", streams: 0, bytes: 0, events: []}` (upload with
  `confirmedRequests: 0`). `client.contextLabel` is the `start` override's, else the label `GET
  /info` suggests, else empty; `client.protocol` is `unknown` when no request reported one.
- `client.timerResolutionMs` is the resolution the Worker detected for `performance.now()` and
  `client.crossOriginIsolated` whether the page was isolated
  ([edge-cases.md §9](edge-cases.md#9-clock-and-timer-resolution)); the idle statistics and samples
  are rounded to the nearest multiple of that resolution, never reported finer.
- A direction reports a number when it is `measured`, or `partial` with a steady window that meets
  the minimum window (§8.4). On download the window is its full buckets (§9.2): an end between two
  ticks (a stop, a paused page, the data cap) ends the window, its series and the covered time of
  `stopped-early` at the last full bucket, and only requests that fed those buckets count toward
  the window condition. With overhead compensation, `bitsPerSecond` and `peakBitsPerSecond` are
  compensated and `uncompensatedBitsPerSecond` keeps the headline as measured; the uncompensated
  peak is `peakBitsPerSecond / (1 + p / 100)` with `p` from `settings`.
- Direction `status`: `measured`, `insufficient-data`, `partial`, `skipped` or `error`; the UI
  shows `insufficient-data` as "insufficient data". Result `status`: `complete`, `partial` (stopped
  by the user or by the browser pausing a hidden page; for Continuous, whenever its direction is
  `insufficient-data`, §15) or `error`.
- `series` holds the steady-window bucket values for the result-detail charts, downsampled to at
  most 2000 points. All its times are milliseconds from the direction's phase start (on upload, on
  the server timeline): `firstCellMs` is the start of the first value's cell, `warmupEndMs` the end
  of warm-up and `endMs` the window end (`W_end_final` on upload). Unknown cells are `null`. Warm-up
  samples are not stored: the result detail draws `[0, warmupEndMs)` as a marked, excluded
  interval. When a stored cell can be partially known (the coarse tiers of a Continuous upload,
  §15), `series.knownMs[]` gives each cell's known time, so a rate over several cells is Σ bytes ÷
  Σ known time. Above 2000 buckets, each point sums the same number of consecutive buckets and
  `bucketMs` grows to match; a point holding an unknown bucket is unknown, so no rate is
  estimated, and the last point may hold fewer buckets.
- `events` lists what happened to a direction, for the chart marks: `{code, atMs}` with code
  `extended`, `data-cap`, `cancelled` or `error` (an `error` event also carries `notice`, the
  notice code of §16 that ended it, or `requests-failed` for three consecutive failed requests),
  and `{code: "failure-gap", startMs, endMs}` for each failure gap (§7.5). An upload event seen on
  the client (`extended`, `data-cap`, `cancelled`, `error`) is placed on the server timeline with
  the display offset of §7.4.
- `idle.samples` holds the idle RTTs in send order (at most the ping count of §8.5); its length
  is the sample count.
- A Continuous result's `settings` carry `preset: "continuous"`, `continuousDirection` and, when
  set, `runLengthMs`; its `download` and `upload` bounds are `{minMs: null, maxMs: null}`. The
  direction it did not run is `skipped`. A `measured` Continuous direction also carries
  `minBitsPerSecond` and `maxBitsPerSecond`, the run-wide running aggregates over fully known 1 s
  cells (§15); its `peakBitsPerSecond` is the final "p90, last hour", absent with fewer than 3
  fully known cells in the hour ring; `windowMs` is the run-wide known time; `series` holds
  `knownMs`; and its `events` keep at most the last 100 failure gaps. Bounded directions omit
  `minBitsPerSecond`, `maxBitsPerSecond` and `series.knownMs`. `notices` keeps each `data-used`
  notice the run emitted.
- `loadedLatency` is present on a direction that ran while a loaded-latency path existed and is
  absent when the run measured no loaded latency (a `latency`-only run, a skipped direction). It
  has two shapes (§11.4). Measured: `{source, idleSource?, samples, skippedTicks, lost, medianMs,
  p90Ms, increaseMs?, series}`, with no `status`; `source` is `websocket`, `http-h1-reserved`,
  `http-h2` or `http-h3`; `idleSource` (`websocket` or `http`) only when idle latency ran on the
  other path than `source`; `increaseMs` and `idleSource` only when idle latency has a median.
  Unavailable: `{status: "unavailable", reason, source, samples, skippedTicks, lost}` with
  `reason` `no-steady-window`, `insufficient-samples`, `reservation-broken` or `no-probe-path`,
  and `source` absent with `no-probe-path`. `samples` counts the samples that fed the statistics,
  `skippedTicks` the ticks skipped for the outstanding bound or the close sequence, `lost` the
  pings lost. `medianMs`, `p90Ms`, `increaseMs` and `series[].rttMs` are quantized to
  `client.timerResolutionMs`, as the idle statistics are.
  `loadedLatency.series` holds the direction's counted samples as `{atMs, rttMs}` on the
  direction's `series` timeline (§11.5), at most 2000 points; Continuous stores the hour ring's
  per-second medians, downsampled, and its `medianMs`, `p90Ms` and `increaseMs` are the last
  hour's (§15).
- `bufferbloat` is `{grade, basis, increaseMs}` (§11.3), absent without idle latency or a gradable
  direction.
- `responsiveness` is `{state, protocol, samples, rpm?, tm95Ms?, trimmed?, totalMedianMs?}` on
  every direction that is not `skipped` (§12.6); the example's `tm95Ms` of 145.6 ms gives
  `60000 / 145.6` ≈ 412 RPM, from 18 samples with nothing trimmed.
- `scores` is `{basis, packetLoss, streaming, gaming, rtc}` (§13.5). In the example the idle median
  of 51.0 ms gives 0 points, the jitter of 1.9 ms 10, the increase of 81.0 ms 0 and the download
  of 94.1 Mbit/s 20: streaming 0 + 0 + 20 + 0 = 20 (`average`), gaming 0 + 0 + 0 = 0 (`bad`), and
  video calls 0 + 10 + 0 + 0 = 10 (`poor`).
- `client.browser` is the browser's family, major version and operating system, parsed in the
  browser; the raw user-agent string is never stored.
- **Saving.** A `complete` result is saved to history automatically. A `partial` or `error`
  result is saved only when the user chooses Keep in history
  ([ui/flows.md §4](ui/flows.md#4-cancel-mid-test)); it can always be downloaded as JSON.
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

300 kbit/s ≈ 36.6 KiB/s aggregate and 300 ms RTT, so `I_s` = 1.2 s (12 buckets), `I_m` = 1.3 s (13
buckets, a request cycle), request target 1 s, size floor 16 KiB. Request size per stream =
clamp(per-stream rate × 1 s, 16 KiB, cap); the first request on every stream is 64 KiB (§3).

The link is modeled as shared equally among the requests whose bytes are crossing it, with half
the RTT each way. A stream idles for one RTT between its requests (the response travels back, the
next request travels out), so one stream with ≈ 1 s requests keeps the link busy for only
≈ 1 / 1.3 ≈ 77 % of the time, and a second stream fills those gaps. The engine tests drive the ramp
on this model and reproduce the decision times below.

**Upload.** The watermark advances only when a request confirms, so every decision waits for the
requests covering its interval; server times are on the grid, from the phase start.

| Step | Streams | Requests | Confirmed series needed | Elapsed (client) |
| --- | --- | --- | --- | --- |
| first request | 1 | 64 KiB / 1.75 s (server 0.15–1.9 s) | — | confirms at ≈ 2.05 s |
| baseline | 1 | 36.6 KiB / 1.0 s (server 2.2–3.2 s and 3.5–4.5 s) | `I_s` + 2 × `I_m` = 3.8 s from the cell of `P_start` (0.1 s), to 3.9 s; each interval spans a request cycle and holds one RTT gap, so the second shows no growth | decided at ≈ 4.65 s, when request 3 confirms |
| trial → 2 | 2 | stream 2: 64 KiB at 20 KiB/s, 3.2 s (server 4.8–8.0 s) | `I_s` + `I_m` = 2.5 s from the cell of stream 2's first byte (4.7 s), to 7.2 s; the two streams fill each other's gaps: kept | ≈ 8.2 s, when stream 1's request covering 7.2 s confirms after stream 2's first one (until then stream 2 holds the watermark back) |
| trial → 4 | 4 | streams 3 and 4: 64 KiB at 10.2 KiB/s, 6.3 s (server 8.35–14.6 s); streams 1 and 2 at the 16 KiB floor, 1.7 s | 2.5 s from the cell of their first bytes (8.3 s), to 10.8 s; no further gain: plateau `no-gain` | ≈ 14.8 s, when streams 3 and 4 confirm |
| trial → 6 | — | 6.1 KiB/s per stream: 16 KiB would take 2.6 s > 2 s | skipped as `floor-limited`, had the 4-stream trial gained | — |
| warm-up end | 4 |  | cap `max(3 s, 25 % × 25 s)` = 6.25 s, moved to the ramp's settle at 10.8 s (inside the 12.5 s bound); streams 3 and 4 have one confirmed request each, so `confidence: low` (`insufficient-samples`) | known at ≈ 14.8 s |
| steady window | 4 | 16 KiB / 1.3–1.7 s | ≥ 3 s and ≥ 3 confirmed requests wholly inside, from 10.8 s | holds at ≈ 17.6 s (window to 16.2 s: 5.4 s, 3 requests), past the 15 s minimum: `slow-link-extended` |
| shutdown |  | new requests stop at the window decision; grace `min(2 s, 2 × 1.75 s)` = 2 s |  | ends by ≈ 18.3 s; ≤ 25 s |

The upload fits Standard's budget (15–25 s) with ≈ 6.7 s of margin. It is extended by ≈ 2.6 s and
carries `confidence: low` (`insufficient-samples`): the two streams added last spend ≈ 6.3 s on
their first 64 KiB requests at a quarter of the link, so warm-up ends at the moved cap before they
have confirmed two requests each. Six initial 64 KiB requests would have cost ≈ 10.5 s of link
time, which is why the ramp starts at one stream and sizes requests per stream.

**Download equivalent.** No confirmation delay: the evaluation series is live from the first chunk
(≈ 0.3 s, one RTT).

| Step | Streams | Requests | Series needed | Elapsed (client) |
| --- | --- | --- | --- | --- |
| first request | 1 | 64 KiB / 1.75 s + RTT | — | first chunk ≈ 0.3 s, done ≈ 2.05 s |
| baseline | 1 | 36.6 KiB / 1.0 s (chunks 2.35–3.35 s) | `I_s` + 2 × `I_m` = 3.8 s after the first chunk; each interval spans a request cycle and holds one RTT gap, so the second shows no growth | ≈ 4.1 s |
| trial → 2 | 2 | stream 2: 64 KiB | 2.5 s after the add; the two streams fill each other's gaps: kept | ≈ 6.6 s |
| trial → 4 | 4 | streams 3 and 4: 64 KiB; the others shrink toward the 16 KiB floor | 2.5 s after the add; no further gain: plateau `no-gain` | ≈ 9.1 s |
| trial → 6 | — | 6.1 KiB/s per stream | skipped as `floor-limited`, had the 4-stream trial gained | — |
| warm-up end | 4 |  | the ramp settled with `I_s` since the last add (6.6 + 1.2 = 7.8 s); the 5 s cap (`max(3 s, 25 % × 20 s)`) moved to the settle, inside the 10 s bound; four streams keep the link busy, so the last 10 buckets are steady | ≈ 9.1 s |
| steady window | 4 |  | ≥ 3 s, ≥ 2 contributing requests | condition met ≈ 12.1 s |
| end |  | in-flight requests aborted, bytes kept |  | ≈ 12.1 s, past the 10 s minimum: `slow-link-extended` |

Download is extended by ≈ 2.1 s past Standard's 10 s minimum, to a 3 s steady window whose
headline is the goodput, ≈ 0.300 Mbit/s: four streams keep the link busy. The 600 ms RTT manual
floor profile stretches every interval (`I_s` = 2.4 s, `I_m` = 1.6 s) and is expected to need the
Extended preset; the shortfall rule (§8.6) covers the Standard case there. These budgets are
validated by the harness floor profiles
([technical-stack/testing.md](technical-stack/testing.md)).

### 19.2 500 kbit/s + 300 ms RTT (Mobile over VPN, Standard)

The shaper carries ≈ 0.478 Mbit/s of goodput, 1448 payload bytes in each 1514-byte frame, which is
≈ 58.4 KiB/s; the phases below are worked on the shared-link model of §19.1 at that goodput.

- **Info and idle latency.** 20 sequential WebSocket pings at about 0.3–0.4 s each, ≈ 7 s. Median
  ≈ 300 ms, so `I_s` = 1.2 s and `I_m` = 1.3 s.
- **Download.** One stream requests 64 KiB; the first chunk arrives at ≈ 0.3 s and the request
  completes at ≈ 1.4 s; `rate_s` ≈ 58.4 KiB/s, so the next request is 58.4 KiB. Each baseline
  interval spans a request cycle and holds one RTT gap, so the second shows no growth and the
  baseline ends at ≈ 4.1 s. The trials to 2 and 4 streams fill more of the gaps and are kept at
  ≈ 6.6 and 9.1 s. The trial to 6 is still running when warm-up reaches its bound, 50 % of the
  20 s maximum, so warm-up ends at 10 s with `confidence: low` (`ramp-unsettled`); the trial shows
  no further gain at ≈ 11.6 s: plateau `no-gain` at 6 streams. The window condition holds at
  ≈ 13 s, past the 10 s minimum (`slow-link-extended`), and the phase ends there with a 3 s
  window. Headline ≈ 0.478 Mbit/s, the goodput within 0.1 %: six streams at the 16 KiB floor
  leave the link no RTT gap. That is within the ±15 % harness tolerance below 1 Mbit/s
  ([technical-stack/testing.md](technical-stack/testing.md)). Data used ≈ 0.70 MB.
- **Loaded latency.** Path A pings every 300 ms; with a 64 KiB shaper queue the RTT rises from 300
  to ≈ 1300 ms, an increase of ≈ 1000 ms: grade F.
- **Upload.** As in §19.1 but faster: the first request confirms at ≈ 1.4 s, the baseline ends at
  ≈ 5.3 s, and the trials to 2 and 4 streams are kept at ≈ 8.9 and 13.2 s. Warm-up ends at its
  bound, 50 % of the 25 s maximum (12.6 s on the server), while the ramp is still adding streams,
  with `confidence: low` (`ramp-unsettled`, `insufficient-samples`), known at ≈ 13.6 s. The trial
  to 6 shows no gain at ≈ 19.3 s, when the window condition also holds, past the 15 s minimum
  (`slow-link-extended`); new requests stop there, and the grace takes the phase to ≈ 20.3 s.
  Headline ≈ 0.478 Mbit/s.

### 19.3 100 Mbit/s + 50 ms RTT (Standard)

- `I_s` = max(1 s, 200 ms) = 1 s; `I_m` = max(500 ms, 100 ms, min(5 s, 1.05 s)) = 1.05 s, a
  request cycle, 1.1 s in whole buckets.
- **Download.** Request sizes grow 64 KiB → 512 KiB → 4 MiB within ≈ 0.4 s (each latency-bound),
  then settle at ≈ 11.9 MiB per request (≈ 1 s at 12.5 MB/s). On the shared-link model of §19.1
  each baseline interval spans a request cycle and holds one 50 ms gap between ≈ 1 s requests, so
  both read ≈ 95 % of the link: `T_base` is decided at ≈ 3.2 s (single-stream slow start on a real
  link may extend it, up to 3 s past `I_s`). The trial to 2 streams fills the gaps, ≈ 1.05 ×
  `T_base`, no more than the 1.05 a trial needs: plateau `no-gain` at ≈ 5.3 s, with the 2 streams
  kept. Warm-up ends at ≈ 5.3 s, the window condition holds at ≈ 8.3 s, and the phase ends at 10 s
  with a ≈ 4.7 s window and a headline of ≈ 99.9 Mbit/s. On HTTP/1.1 (Traefik
  profile) the streams use one connection each; on HTTP/2 (Caddy profile) they share one, which on
  this clean profile measures the same.
- **Upload.** Confirmation delay ≈ 1 s + 50 ms; the baseline is decided at ≈ 3.7 s and the trial to
  2 streams shows no gain at ≈ 6.7 s; warm-up ends at ≈ 5.8 s on the server timeline, known at
  ≈ 6.7 s; the window condition holds at ≈ 9.9 s, inside the 15 s minimum, so the phase ends at
  its 15 s minimum.
- **Latency.** Idle 50 ms; with a shaper queue adding ≈ 80 ms under load, the grade is C. Path B on
  the Caddy profile: `measured` with the not-verifiable label; on Traefik (HTTP/1.1):
  `unavailable_h1`.
- **Data used** ≈ 121 MB down + 180 MB up.

### 19.4 2.5 Gbit/s LAN (Standard)

- RTT ≈ 0.3 ms: `I_s` = 1 s, `I_m` = 500 ms.
- The timelines below assume that one request carries at most ≈ 0.5 Gbit/s (≈ 62.5 MB/s), as a
  per-connection limit of the browser or the proxy would, so that each added stream adds
  throughput until six share the link; they are worked on the shared-link model of §19.1 with that
  per-request ceiling, which the harness ceiling profile is to confirm.
- **Download.** Sizes grow 64 KiB → 512 KiB → 4 MiB → 32 MiB within ≈ 0.1 s (the early requests
  are latency-bound) and settle at ≈ 60 MiB from ≈ 0.6 s, about 1 s per request. The baseline is
  decided at 2 s and the trials to 2, 4 and 6 streams gain at 3.5, 5 and 6.5 s: plateau `cap` at
  ≈ 6.5 s with ≈ 50 MiB requests per stream. The 5 s warm-up cap waits for the running ramp (§8.3),
  so warm-up end ≈ 6.5 s, window condition ≈ 9.5 s, phase end at 10 s.
- **Upload.** The same ramp, but each decision waits for its interval to be confirmed (§8.2): the
  baseline is decided at ≈ 2.6 s and the trials to 2, 4 and 6 streams at ≈ 4.6, 6.6 and 8.8 s.
  Plateau `cap`; warm-up ends at ≈ 8.1 s on the server timeline, known on the client at ≈ 8.8 s.
  The 3 s window is confirmed at ≈ 11.8 s, inside the 15 s minimum, so new requests stop at 15 s;
  the last in-flight requests confirm at ≈ 15.8 s. The first stream falls quiet at ≈ 15.4 s and
  the window ends there (§7.5), ≈ 8.1–15.4 s, before the other five drain at 0.5 Gbit/s each: it
  averages ≈ 2.5 Gbit/s, the link. A stop before
  ≈ 11.8 s leaves a confirmed window under 3 s, so a cancelled upload shows no number (§7.8).
- **CPU.** The Worker's busy fraction is recorded; above 90 % the direction is `cpu-bound` and the
  harness tolerance is ±20 %.
- **Data used** ≈ 2.2 GB down + 3.7 GB up: the data-used figure is prominent in the result, and a data
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
