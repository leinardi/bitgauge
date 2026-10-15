# Summary — TL;DR

[Feature index](README.md) / Summary

**What.** BitGauge is a self-hosted, browser-based network speed test: one Go binary with an
embedded Vue SPA, shipped as one container image. It measures download, upload, idle latency,
latency under load with a bufferbloat grade, HTTP loaded responsiveness (RPM) and quality scores.

**For whom.** Homelab operators testing LAN, Wi-Fi and VPN links to their own server, from well
under 1 Mbit/s on mobile over VPN to multi-Gbit LAN.

**What it is not.** Not a public-internet speed test, not multi-tenant, not a native app, not a
multi-server selector, and never a collector of results: the server stores nothing and calls
nothing.

```text
Measure: adaptive download and server-timed upload, idle and loaded latency, RPM, quality scores.
Keep:    results and history only in the browser (IndexedDB), with export and import.
Serve:   a stateless server, plus optional OpenSpeedTest, LibreSpeed and networkQuality layers.
```

**Headline methodology.**

- **Adaptive request size.** Requests start at 64 KiB and grow (at most 8× per step) so that one
  request takes about 1 s at the observed rate; slow links finish requests, fast links are not
  limited by request overhead.
- **Adaptive streams.** In auto mode the engine ramps 1 → 2 → 4 → 6 streams and keeps a step only
  if it gains at least 5 %.
- **Server-timed upload.** The server counts the bytes it reads on a shared 100 ms grid and returns
  the counts; the upload number never comes from client send progress.
- **Steady-window headline.** The headline is bytes ÷ time over the 100 ms buckets after a guarded
  warm-up; the p90 of bucket rates is shown only as "peak".
- **No fudge factor.** Overhead compensation is 0 unless the user sets it, and then it is shown.
- **Loaded latency on its own path.** A WebSocket echo measures latency under load and grades
  bufferbloat (A+ to F); a separate HTTP probe estimates loaded responsiveness and is labeled as
  not verifiable where the browser cannot prove which connection it used.
- **Honest qualifiers.** Low confidence, partial results and insufficient data are reported as
  such.

The defining constraint: **the server never stores a result and never calls out.** See the
[core invariant](README.md#core-invariant).

## Related

- [Product identity](product.md)
- [Guiding principles](principles.md)
- [Measurement methodology](measurement.md)
- [Roadmap](roadmap.md)
