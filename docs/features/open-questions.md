# Open Questions

[Feature index](README.md) / Open Questions

These surfaced while writing the specification and should be decided before or during the milestone
named in [technical-stack/decisions.md](technical-stack/decisions.md#open-technical-decisions). Each
carries a recommendation; where the specification already relies on an answer, it is marked
"Current answer" and stays open until confirmed.

1. What should the default drain limit for `/nq/upload` be
   (`compat.networkquality.max_upload_bytes`)? Apple's reference nginx configuration allows 250 MB
   bodies, while `networkQuality` keeps posting for the duration of its test and a fast LAN moves
   more than that in a few seconds. Current answer: **1 GiB**, configurable from 1 MiB to 64 GiB.
   Recommendation: keep 1 GiB and confirm it against `networkQuality` and `goresponsiveness` on a
   10 Gbit LAN during v0.3. See [compatibility.md §3.1](compatibility.md#31-routes).
2. Should operators be able to map subnets to context labels (for example a WireGuard range in RFC
   1918 space labelled `VPN`)? Today the label is suggested from the address class only.
   Recommendation: **yes, in v0.2**, as an optional list of `{cidr, label}` entries in the server
   configuration, evaluated before the address-class rule and validated fail-closed. See
   [edge-cases.md §16](edge-cases.md#16-ipv6-vs-ipv4-and-the-lanvpn-label) and
   [wire-protocol.md §5](wire-protocol.md#5-get-apiv1info).
3. Which format should the share image use? Current answer: **PNG** from a `<canvas>`.
   Recommendation: keep PNG, which every chat app and photo viewer accepts; SVG would be smaller
   but depends on fonts on the receiving side and is refused by several sharing targets. See
   [technical-stack/frontend.md §6](technical-stack/frontend.md#6-charts-gauge-and-share-image).
4. Should the upload grace after the end decision depend on the in-flight request's expected
   duration? Current answer: **yes**, `min(2 s, 2 × d)` with `d` the expected duration of the
   longest in-flight request, which the slow-link budget needs. Recommendation: confirm with the
   floor tier of the accuracy harness in v0.1. See
   [measurement.md §5](measurement.md#5-adaptive-duration).
5. How should upload failures be handled? Current answer: **failure gaps on HTTP/2 and HTTP/3; on
   HTTP/1.1 the first failure ends the upload phase**, because a failed request there freezes the
   window end. Recommendation: confirm with the h1 and h2 proxy profiles of the CI tier in v0.1. See
   [measurement.md §7.5](measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark).
6. Should Continuous mode run one direction or alternate between both? Current answer: **one
   direction per run**, chosen by the user, because alternating would mix two steady windows in one
   series and halve each direction's coverage. Recommendation: keep it; a user who wants both runs
   two sessions. See [measurement.md §15](measurement.md#15-continuous-mode).
7. How does a release validate the configuration keys of features it does not ship yet, and an
   empty duration bound? Current answer: **a toggle for an unshipped feature is rejected, naming
   its milestone** (`metrics.enabled` before v0.2; the three `compat.*.enabled` toggles and
   `test_defaults.preset: continuous` before v0.3), while their other keys are parsed and
   validated; the compatibility conflict rules apply from v0.3; and a duration pair is checked with
   an empty bound counting as the preset's value. Recommendation: keep it, since accepting a
   toggle that does nothing would be a silent default. See
   [configuration.md §4](configuration.md#4-fail-closed-validation).
8. Which `429` code do the WebSocket and networkQuality flow limits answer with? Current answer:
   **`too_many_streams`**, since both are concurrency limits like the throughput-stream limit;
   `rate_limited` stays with the per-minute limit and `table_full` with a full table.
   Recommendation: keep it; a browser cannot read the body of a refused WebSocket handshake
   anyway. See [wire-protocol.md §9](wire-protocol.md#9-rate-limits).
9. How does `GET /info` carry a fixed warm-up? Current answer: **`warmup` is `"auto"` or the
   fixed duration in whole milliseconds** (`3000`), the unit every other duration of the info
   response uses. Recommendation: keep it; a duration string such as `"3s"` would need a parser in
   the SPA for one field. See [wire-protocol.md §5](wire-protocol.md#5-get-apiv1info).
10. What may `GET /api/v1/download` allocate per request? Current answer: **nothing for the body,
    and two small allocations for the `Content-Length` header**, its formatted value and the
    one-element slice holding it, which `net/http`'s header map cannot avoid. Recommendation: keep
    it; leaving out `Content-Length` would break the response contract. See
    [wire-protocol.md §3.1](wire-protocol.md#31-get-apiv1downloadbytesn).
11. Which `400` code does a zero or negative `bytes` get? Current answer: **`bytes_out_of_range`
    with the limit in `details`**, like a value above the limit, since §2 defines the parameter as
    an integer of at least 1 and §7 assigns that code to a parameter outside its range;
    `bad_request` stays for a missing or non-integer value. Recommendation: keep it. See
    [wire-protocol.md §3.1](wire-protocol.md#31-get-apiv1downloadbytesn).
12. What does `POST /api/v1/upload` answer for an empty body? Current answer: **`200` with empty
    telemetry**: `buckets: []`, `bytes: 0`, `durationMs: 0`, and `startMs` (with `firstBucket`)
    at handler entry, since there is no first byte. Recommendation: keep it; the engine never
    sends one, and a `400` would add a code for a request that harms nothing. See
    [wire-protocol.md §4](wire-protocol.md#4-upload-telemetry).

Resolved and removed:

- _Can the info phase be skipped like the measuring phases?_ **No**: every later phase needs the
  epoch and the limits, and it costs one round trip. Resolved by the maintainer's approval of the
  specification on 2026-10-12. See [measurement.md §1](measurement.md#1-phases-and-order) and
  [decisions.md §34](technical-stack/decisions.md#34-info-phase--always-runs).
- _How should the accuracy harness take its iperf3 reference "over the same window"?_ **iperf3
  before and after the browser run**, each for the steady-window duration; if the two differ by more
  than 5 %, or either deviates by more than 5 % from the configured goodput (the configured rate
  less Ethernet, IP and TCP overhead), the profile is re-run once, and a profile still unstable is
  **inconclusive**, which fails CI. Resolved by the maintainer's approval of the specification on
  2026-10-12. See [technical-stack/testing.md §5](technical-stack/testing.md#5-accuracy-harness)
  and
  [decisions.md §35](technical-stack/decisions.md#35-accuracy-harness-reference--iperf3-before-and-after-the-browser-run).
- _How does the harness read a v0.1 result?_ **A single-result "Download JSON" action on the v0.1
  Test screen**, so the harness uses a real user path and no test-only hook. Resolved by the
  maintainer's approval of the specification on 2026-10-12. See
  [ui/screens.md §1](ui/screens.md#1-test-home--) and
  [decisions.md §36](technical-stack/decisions.md#36-v01-harness-extraction--download-json-on-the-test-screen).
- _Which licence variant: GPL-3.0-only or GPL-3.0-or-later?_ **GPL-3.0-or-later**, used
  consistently in the README, the image label and source headers. Resolved by the user on
  2026-10-08. See [technical-stack/decisions.md](technical-stack/decisions.md).
- _Which default listen port?_ **8080.** Resolved by the user on 2026-10-08. See
  [configuration.md §2.1](configuration.md#21-server).
- _Should a test be able to pick among several BitGauge servers?_ **No: multi-server selection is
  dropped completely**, with no server list and no `server` URL parameter. Resolved by the user on
  2026-10-08. See [product.md §1.6](product.md#16-non-goals).
- _Should the compatibility layers be on or off by default?_ **Off by default**, one toggle each.
  Resolved by the user on 2026-10-08. See
  [configuration.md §2.4](configuration.md#24-compatibility-toggles).
- _What is the final throughput value?_ **The steady-window average** (bytes ÷ time over the 100 ms
  buckets after warm-up); the p90 of buckets is reported as "peak", never as the headline. Resolved
  by the user on 2026-10-08. See [measurement.md §9](measurement.md#9-final-value).
- _Which registries should images be published to?_ **GHCR only**; Docker Hub is not chosen, and a
  mirror can be added later. Resolved by the user on 2026-10-08. See
  [technical-stack/decisions.md](technical-stack/decisions.md).

## Related

- [Roadmap](roadmap.md)
- [Technical decisions](technical-stack/decisions.md)
- [Principles](principles.md)
