# Glossary

[Feature index](README.md) / Glossary

Every page of this specification uses the terms below with exactly these meanings. When a page
needs a new term, it is added here first. Section references (`§`) point at
[measurement.md](measurement.md) unless another page is named.

## Test Structure

**Phase.** One stage of a test run. The phases are `info`, `idle latency`, `download` and
`upload`, run in that order by default. Each phase can be skipped and the order is configurable
(§1). A phase that measures throughput is a *direction*: download or upload.

**Preset.** A named set of test settings: `Quick`, `Standard`, `Extended` or `Continuous`. A preset
fixes the stream mode, the per-phase minimum and maximum durations and the ping count (§8).

**Stream.** One sequential chain of throughput requests within a phase. A stream issues its next
request as soon as the previous one completes, so the number of streams is the number of requests
in flight. Whether streams share one TCP connection depends on the HTTP version (§4).

**Request.** One HTTP transfer within a stream: a `GET` of `N` bytes on download, a `POST` of an
`N`-byte body on upload. Request size adapts to the observed rate (§3).

**Data cap.** An optional upper limit on bytes transferred per test, summed over both directions.
Reaching it ends the current phase early with a notice (§5).

**Data used.** Total bytes transferred by the test in both directions, including warm-up and
aborted requests. Always reported, whether or not a data cap is set.

## Sampling and Windows

**Bucket.** A 100 ms interval of the throughput time series, holding the bytes transferred across
all streams in that interval. On download, buckets are on the client timeline; on upload, they are
the cells of the server grid. Also called a *sample* when the context is the gauge or chart.

**Server grid.** The single, process-wide 100 ms grid on the server's monotonic clock. Its origin
is process start plus a random whole number of cells, so the grid reveals neither wall-clock time
nor uptime, and every upload request shares the same cell boundaries (§7).

**Cell.** One 100 ms interval of the server grid, identified by its absolute index.

**Epoch.** A random identifier the server generates at process start and reports in `GET /info`
and in every upload response. A change of epoch mid-test means the server restarted, so grid
indices from before and after cannot be combined.

**Arrival counts.** The per-request upload telemetry: the bytes the server read in each cell of the
server grid while draining that request's body, returned as `firstBucket` plus a `buckets` array
(see [wire-protocol.md](wire-protocol.md)).

**Server-timed upload.** BitGauge's upload method: the upload headline is computed only from
arrival counts reported by the server, never from client-side send progress. Client
`upload.onprogress` drives the live gauge only (§7).

**Confirmed request.** An upload request whose response carried valid arrival counts: matching
epoch and a byte total equal to the bytes sent. In-flight, aborted and failed requests are
unconfirmed and their bytes are never counted.

**Phase start / measurement end.** On the server timeline: phase start (`P_start`) is the earliest
first-byte instant over confirmed requests of the phase; measurement end (`M_end`) is the latest
last-byte instant over confirmed requests once no more responses can arrive. Both are finite for
any phase with at least one confirmed request.

**Confirmed watermark.** The instant `C` on the server timeline before which no unconfirmed request
can have contributed bytes. It is derived from causal lower bounds on the start of every
unconfirmed request (§7). When every request is confirmed, `C = M_end`.

**Window end.** `W_end = min(C, M_end_so_far)`: the end of the contiguous confirmed prefix of the
upload series. Every cell ending at or before `W_end` is confirmed. After the phase, the final value
is `W_end_final = min(C_final, M_end)`, always finite.

**Unknown cell.** An upload cell at or after the window end. Its value is not known yet and is never
treated as zero, which is distinct from a confirmed cell that holds zero bytes.

**Confirmation delay.** How far the upload window end lags the present: roughly one request
duration plus one RTT, typically 1–2 s and longer on slow or high-RTT links. Every upload decision
(ramp, warm-up, extension) is delayed by it.

**Evaluation series.** The part of the time series that decisions may read: on download, every
bucket up to the current one; on upload, only cells before the current window end (§8).

**Warm-up.** The start of a direction during which streams ramp and TCP leaves slow start. Buckets
in warm-up are excluded from the result. Warm-up ends by the guarded rule in §8, or at the warm-up
cap.

**Steady-state window.** The part of a direction from warm-up end to the phase end (download) or to
`W_end_final` (upload). The headline throughput is computed over it. Also called the *steady
window*.

**Headline.** The single throughput number reported per direction: total bytes divided by total
time over the full buckets of the steady-state window (§9).

**Peak.** The p90 of bucket rates over the steady-state window. A secondary number, never the
headline. In Continuous mode it is the p90 over the last hour (§15).

## Adaptivity

**Ramp.** The auto-mode procedure that adds streams one step at a time (1 → 2 → 4 → 6) and keeps a
step only if it raised throughput (§4, §8).

**Ramp trial.** One step of the ramp: move to the next stream count, let the new streams settle,
measure, and compare against the baseline. A trial that gains at least 5 % is kept.

**Plateau.** The end of the ramp. Its recorded reason is one of `no-gain` (the last trial gained
less than 5 %), `cap` (the effective stream cap was reached) or `floor-limited` (the next step would
make the minimum request size take longer than twice the request target).

**Effective cap.** The maximum stream count for a direction: the configured maximum (default 6),
lowered to 5 while the HTTP/1.1 probe reservation is active.

## Latency and Responsiveness

**Idle latency.** Round-trip time measured before any throughput phase, with no load on the link.
Reported as min, median and p90 (§10).

**Loaded latency.** Round-trip time measured during download or upload, per direction (§11).

**Jitter.** Mean absolute difference between consecutive latency samples.

**Probe path.** One independent way of measuring latency under load. Path A is the **WebSocket
echo**: JSON ping frames over `/api/v1/ws`; it is the source of loaded latency and the bufferbloat
grade, with an HTTP fallback when the WebSocket cannot be opened. Path B is the **HTTP
responsiveness probe**: `GET /api/v1/small` timed with Resource Timing, which feeds only the
responsiveness metric. Neither path is derived from the other (§11, §12).

**Bufferbloat grade.** A letter grade (A+ to F) from the increase of loaded latency over idle
latency, taking the worse of the two directions (§11).

**Responsiveness.** A measure of how quickly the network answers small requests while it is
loaded, expressed in round trips per minute.

**RPM.** Round trips per minute. In BitGauge it is HTTP loaded responsiveness only, computed from
path B as `60000 / TM95(http_l)`. It is labelled "HTTP loaded responsiveness — connection sharing
not verifiable" and is never presented as comparable to Apple's networkQuality RPM (§12).

**Quality score.** A rating of how well the measured link suits streaming, gaming and video calls,
computed with Cloudflare AIM-style point tables (§13).

**Confidence.** A per-result qualifier: `normal`, `low` (with a reason such as `ramp-unsettled`,
`unstable` or `insufficient-samples`) or `cpu-bound` (the Worker was busy more than 90 % of the
time). Shown next to the number it qualifies (§16).

## Network and Deployment

**nextHopProtocol.** The Resource Timing field that names the protocol a request used (`http/1.1`,
`h2` or `h3`). BitGauge surfaces it as the negotiated protocol.

**Origin.** The browser origin (scheme, host and port) the SPA was loaded from. Browser storage is
per origin, so the same server reached by LAN IP and by VPN hostname keeps two separate histories.

**Trusted proxy.** A reverse proxy whose address is in the configured `trusted_proxies` CIDRs.
Only a trusted proxy's forwarding headers are used to derive the client IP.

**Context label.** A suggested `LAN` or `VPN` label for a result, derived from the client IP subnet
reported by `GET /info`. The user can change it; it only groups and filters history.

**Compatibility layer.** An optional set of routes that lets a third-party client (OpenSpeedTest
web UI, LibreSpeed clients, Apple `networkQuality`) test against BitGauge. Each layer is off by
default and enabled by one toggle (see [compatibility.md](compatibility.md)).

## Related

- [Measurement methodology](measurement.md)
- [Wire protocol](wire-protocol.md)
- [Compatibility layers](compatibility.md)
- [Summary](summary.md)
