# Cloudflare Speed Test

[Feature index](../features/README.md) / [Research](README.md) / Cloudflare

Cloudflare's speed test (speed.cloudflare.com) is built on the open-source `@cloudflare/speedtest`
JavaScript library, which runs in the browser against Cloudflare's edge. BitGauge takes its
request-size rule, its use of Resource Timing for HTTP probe timing, `Server-Timing` to carry
server-side timing, its loaded-latency throttle and its AIM score tables.

## 1. License

MIT. BitGauge copies no code; the ideas and the published score tables are reimplemented and
credited.

## 2. Measurement Sequence

The library runs a fixed list of measurement steps. Each step is a latency, download, upload or
packet-loss step; transfer steps name a request size and a count. The default list interleaves the
directions and grows the size step by step:

| Step | Type | Size | Count |
| --- | --- | --- | --- |
| 1 | latency | — | 1 (initial estimate) |
| 2 | download | 100 kB | 1 (exempt from the minimum duration) |
| 3 | latency | — | 20 |
| 4 | download | 100 kB | 9 |
| 5 | download | 1 MB | 8 |
| 6 | upload | 100 kB | 8 |
| 7 | packet loss | — | 1000 packets |
| 8 | upload | 1 MB | 6 |
| 9 | download | 10 MB | 6 |
| 10 | upload | 10 MB | 4 |
| 11 | download | 25 MB | 4 |
| 12 | upload | 25 MB | 4 |
| 13 | download | 100 MB | 3 |
| 14 | upload | 50 MB | 3 |
| 15 | download | 250 MB | 2 |

Requests within a step run **sequentially**, one at a time; there are no parallel streams.

## 3. Finish and Minimum Durations

- **Finish rule** (`bandwidthFinishRequestDuration`, 1000 ms). Once a request in a direction takes
  at least 1 s, that direction skips its remaining larger steps. On a slow link a direction ends
  after a few small requests; on a fast link it climbs to the largest size. This is the idea behind
  BitGauge's 1 s request target
  ([../features/measurement.md §3](../features/measurement.md#3-adaptive-request-size)).
- **Minimum duration** (`bandwidthMinRequestDuration`, 10 ms). Requests shorter than this are
  excluded from bandwidth, because their timing is dominated by latency and timer resolution.

## 4. Timing: Resource Timing and `Server-Timing`

- Every request is timed from its Resource Timing entry rather than from JavaScript timestamps.
- The server reports its own processing time in a `Server-Timing` response header
  (`cfRequestDuration;dur=…`). The library parses it and subtracts it from the time to first byte,
  so latency is network time, not server time. Without the header an estimated server time is
  subtracted instead.
- **Bytes on the wire.** When Resource Timing exposes `transferSize`, the library uses it, which
  includes headers. Otherwise it estimates headers as **+0.5 %** of the payload. There is no fixed
  overhead factor of the LibreSpeed kind.

BitGauge uses `Server-Timing` too, for a different purpose: its upload response carries the server's
receive duration (`bg-recv`) next to the per-bucket arrival counts
([../features/wire-protocol.md](../features/wire-protocol.md)).

## 5. Percentiles

- **Bandwidth** is the **p90** of the per-request bandwidths of a direction.
- **Latency** is the median (p50) of the latency samples; jitter is the mean absolute difference
  between consecutive samples.
- **Why p90 works there.** Requests run one at a time, so each request has the whole link to
  itself and its bandwidth is a sample of the link rate. With BitGauge's parallel adaptive
  streams a request gets a *share* of the link: a percentile over requests would measure how fairly
  streams share it, and would change with the stream count. BitGauge's headline is therefore the
  steady-window average, and the p90 of 100 ms buckets is shown only as "peak"
  ([../features/measurement.md §9.1](../features/measurement.md#91-evaluation)).

## 6. Loaded Latency

- Latency probes run **during** download and upload requests, but only during requests that last
  at least 250 ms (`loadedRequestMinDuration`), so the link is actually loaded.
- Probes are **throttled** to one every 400 ms (`loadedLatencyThrottle`), and at most 20 are kept
  per direction (`loadedLatencyMaxPoints`).
- The loaded-latency result is the median per direction.

BitGauge probes every 300 ms, over a WebSocket echo so the probe does not queue behind the load on
an HTTP/1.1 connection
([../features/measurement.md §11](../features/measurement.md#11-latency-under-load)).

## 7. AIM Scores

The Aggregated Internet Measurement (AIM) scores turn the metrics into a rating per experience
(streaming, gaming, video calls). Each metric is mapped to points by a threshold table; each
experience sums the points of its metrics and maps the sum to a band: bad, poor, average, good or
great. The tables BitGauge uses unchanged are reproduced in
[../features/measurement.md §13](../features/measurement.md#13-quality-scores). When packet loss is
unavailable, the library treats it as 0 points; BitGauge does the same and labels it "not
measured".

## 8. Packet Loss via TURN

- The library opens a WebRTC data channel through a Cloudflare TURN server, with unordered,
  no-retransmit delivery, and fetches short-lived TURN credentials from a Cloudflare endpoint.
- It sends 1000 small messages in batches, which the TURN server relays back, waits 3 s for late
  replies, and reports the fraction not returned as packet loss.
- This needs a TURN server and a credentials service; BitGauge would have to embed or require one.
  It is deferred ([../features/measurement.md
  §18](../features/measurement.md#18-packet-loss)).

## 9. What BitGauge Takes and What It Changes

**Takes:** the 1 s request-size target; Resource Timing for HTTP probe timing and
`nextHopProtocol` (BitGauge times download chunks with `performance.now()` and upload on the server
grid); `Server-Timing` to carry server-side timing; loaded-latency probes only while the link is
loaded, with a throttle; the AIM tables and their bands; packet loss at 0 points when it is not
measured.

**Changes:** parallel adaptive streams instead of sequential requests; a steady-window average
instead of a request percentile as the headline; upload timed by the server; no overhead estimate
at all by default; a self-hosted server on the user's own network instead of a CDN edge; results
kept only in the user's browser.

## Related

- [Measurement methodology](../features/measurement.md)
- [Wire protocol](../features/wire-protocol.md)
- [Prior-art summary](prior-art-summary.md)
- [Apple networkQuality](networkquality.md)
