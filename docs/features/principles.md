# Principles

[Feature index](README.md) / Principles

## 2. Guiding Principles

### 2.1 Honest Numbers

Every number BitGauge shows is the plain result of a documented computation over measured data.

- **No hidden fudge factor.** Overhead compensation defaults to 0. When a user sets a non-zero
  value, the result shows it next to the number it changed.
- **Show confidence.** A number that rests on too little data, an unsettled ramp or a saturated
  browser CPU carries a visible `confidence` qualifier. A direction without enough data reports
  `insufficient data` and no number at all; a phase never reports a number from one request.
- **Measure where the truth is.** Upload is timed by the server, which sees bytes arrive, not by
  the browser, which only sees bytes leave its buffers.
- **Say what cannot be verified.** Where the browser hides something the methodology depends on,
  the label says so ("HTTP loaded responsiveness — connection sharing not verifiable"), and no
  number is presented as comparable to a tool it is not comparable to.

### 2.2 Stateless Server

The server keeps no state that outlives a request beyond ephemeral, in-memory counters: a random
buffer generated at startup, a bounded rate-limit table and Prometheus counters. Per-request upload
arrival counts exist only while a body is being read and die with the response.

- No database, no disk writes, no volume.
- Configuration is read-only.
- No cross-request correlation: the server cannot tell which requests belong to one test.

### 2.3 The Browser Owns History

Results exist only in the browser that ran the test, in IndexedDB, with JSON and CSV export and
JSON import. The server never receives a result. Clearing browser data clears history, and that is
stated in the UI.

### 2.4 No Outbound Calls

The server never opens an outbound connection: no update checks, no telemetry, no IP lookups, no
time servers, no font or script CDNs. The SPA only talks to the origin that served it. This is
enforced in review and verifiable in the accuracy harness.

### 2.5 Works at 300 kbit/s and at 10 Gbit/s

Methodology choices must hold across the whole range, not only in the middle of it.

- Request sizes adapt so a request takes about one second at the observed rate, from a 16 KiB floor
  to the server cap.
- Stream count adapts so slow links are not split into streams too thin to complete a request and
  fast links get enough parallelism.
- Phase duration adapts so slow links get enough completed requests; timeouts tolerate VPN RTTs.
- At the top of the range the browser CPU becomes the bottleneck; BitGauge detects that and says
  so instead of reporting a link limit.

### 2.6 Engine Independent of the UI

The measurement engine is framework-free TypeScript in a Web Worker. It has no DOM, no Vue and no
imports from application code. It talks to the UI only through typed messages and takes an
injectable clock, so every rule in [measurement.md](measurement.md) is unit-testable with synthetic
timelines.

### 2.7 Compatibility Is a Layer, Not the Core

The native API and the measurement engine are designed for BitGauge's methodology alone.
Compatibility with the OpenSpeedTest web UI, LibreSpeed clients and Apple `networkQuality` is a set
of optional route groups, each off by default, that adapt third-party protocols to the same
handlers. No compatibility requirement may bend the native API or the engine.

### 2.8 Small Surface

BitGauge does one thing. Every endpoint, setting and screen has to justify itself against the cost
of maintaining it. Accounts, server-side history, multi-server selection, ISP lookups and
public-internet hardening are out of scope (see [product.md](product.md)). Library additions follow
the same rule: a dependency is adopted only if it earns its place (see
[technical-stack/decisions.md](technical-stack/decisions.md)).

## Related

- [Product identity](product.md)
- [Measurement methodology](measurement.md)
- [Security model](security.md)
- [Technical decisions](technical-stack/decisions.md)
