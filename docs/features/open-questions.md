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
13. How are the percentiles and the coefficient of variation of a bucket series computed? Current
    answer: **percentiles interpolate linearly between the closest ranks, and the coefficient of
    variation is the population standard deviation over the mean**, both over known buckets only;
    a mean of zero leaves the coefficient without a value, so a stability condition on it does not
    hold. Recommendation: keep it; the warm-up's last 10 buckets are the whole population the
    condition judges, not a sample of a larger one. See
    [measurement.md §2](measurement.md#2-sampling-model).
14. Which codes do the engine's notices and errors carry? Current answer: **one kebab-case code
    per notice of measurement.md §16, and five error codes** (`invalid-settings`,
    `requests-failed`, `network-changed`, `server-restarted`, `server-unreachable`) with the
    message key `errors.<code>`; the engine emits codes and raw values, never text.
    Recommendation: keep it. See
    [measurement.md §16](measurement.md#16-confidence-and-notices) and
    [architecture.md §4](architecture.md#4-engine--ui-message-contract).
15. When does a confirmed upload request "lie inside" the steady window for the three-request
    minimum? Current answer: **when every cell of its telemetry, from its first byte's cell to its
    last's, belongs to the window W**; a request straddling the warm-up end, the window end or a
    failure gap still contributes its bytes but is not counted, and one that read no bytes never
    is. This is the stricter reading: download's rule says "contributed bytes", upload's
    says "lie inside", and the §19.1 worst case sizes its window for whole requests.
    Recommendation: keep it. See
    [measurement.md §7.6](measurement.md#76-headline-peak-and-minimum-window).
16. Where do the ramp's intervals sit on the evaluation series? Current answer: **in whole
    buckets, rounded up**; the baseline starts at the first bucket holding bytes, a trial at the
    add on download and at the latest first byte of the added streams' first requests on upload
    (the only server instant known to follow the add); an interval with no known bucket is
    measured again; the baseline measures two intervals and further ones only while they end by
    3 s after `I_s`; a `429` that lowers the cap below the stream count drops the count to the cap
    and ends a running trial as `cap`; the ramp settles at the end of the interval that decided
    its plateau, which is where the warm-up cap moves to. Recommendation: keep it. See
    [measurement.md §8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare) and
    [§4](measurement.md#4-adaptive-stream-count).
17. Do the slow-link budgets of measurement.md §19.1 and §19.2 hold? Current answer: **they are
    recomputed from the rules on a link shared equally among the requests crossing it, with half
    the RTT each way**. A sequential stream idles one RTT between requests, so a second stream
    gains and the ramp settles at 4 streams with `no-gain`; on upload the added streams' first
    64 KiB requests hold the watermark back. At 300 kbit/s and 300 ms the upload trial to 2 is
    decided at ≈ 6.85 s (it was ≈ 9.3 s), the trial to 4 at ≈ 13.5 s, the window condition holds
    at ≈ 15.4 s, and the upload ends by ≈ 17.4 s with `confidence: low`
    (`insufficient-samples`); the download settles at ≈ 6.3 s with a ≈ 3.7 s window.
    Recommendation: confirm on the harness floor profiles; if they show low confidence there,
    consider sizing an added stream's first request from `T_base / N` rather than 64 KiB. See
    [measurement.md §19.1](measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard).
18. How do the warm-up conditions read the evaluation series? Current answer: **bucket by bucket
    on the series up to each newly known bucket**, with the request counts known at that moment;
    "the last 10 confirmed buckets" are the last 10 known ones and conditions 2 and 3 need all 10,
    which makes condition 4 hold whenever they can; download's "1 s of continuous chunk arrivals"
    is those 10 buckets all holding bytes; condition 1's `I_s`, the cap, its bound and a fixed
    warm-up count known buckets from the series' first bucket; a moved cap ends warm-up at the
    settle instant, which a trial ended by a `429` places at the end of the series read, also its
    last add if its streams were never placed. A phase is extended when its window condition did
    not hold at a minimum shorter than its maximum, and upload stops issuing at `max − 1 s` even
    before its minimum. Recommendation: keep it; a stricter condition 2 would count only requests
    that ended before the bucket evaluated.
    See [measurement.md §8.3](measurement.md#83-warm-up-end) and
    [§5](measurement.md#5-adaptive-duration).
19. How does a run resolve its settings, and how does idle latency count its edge cases? Current
    answer: **a `start` override replaces the fields it sets; selecting another preset brings that
    preset's durations, ping count and stream mode unless the override sets them; `durationMs`
    caps both directions and lowers their minimum to it; any out-of-range value fails with
    `invalid-settings`**. Idle latency counts the warm-up ping in the ping count, never as loss;
    times out after 10 s while there is no sample; treats a non-`204` HTTP answer as lost and an
    answer without its timing entry as using up its place in the count but neither sampled nor lost;
    and leaves that answer, and a ping still outstanding at the 30 s limit, out of the loss
    percentage's denominator. Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [measurement.md §10](measurement.md#10-idle-latency).
20. How does a throughput phase handle a `429`, failures and the data cap? Current answer: **a
    `429` records the `stream-limit` notice with the lowered cap**, a code §16 lacked although §4
    called for a notice; the streams above a lowered cap finish their request in flight and issue
    no further one; three consecutive failures count across the direction's streams in the order
    they occur, and any completed request resets the count; the phase ends on the data cap at the
    instant a stream would issue a request with less than 16 KiB of budget left, the budget
    counting the bytes still to move of the requests in flight; a direction reports the protocol
    of its latest throughput request with a Resource Timing entry. On the shared-link model the
    100 Mbit/s download of §19.3 keeps its trial to 2 streams, because its baseline's last interval
    holds a request gap, and plateaus at 4 streams at ≈ 5 s (it was 2 streams at ≈ 4 s); it still
    ends at 10 s, with a ≈ 5 s window. §19.2 is worked at the ≈ 0.478 Mbit/s of goodput its
    500 kbit/s shaper carries, and its download headline is ≈ 95.5 % of it: four streams at the
    16 KiB floor end their requests together once in the window and leave the link idle for one
    RTT gap. A delayed chunk never changes a bucket a decision has read. Recommendation: keep it;
    confirm the §19.3 ramp and the §19.2 headline on the harness CI profile, and if the harness
    shows the coinciding gaps, consider letting a floor-sized stream issue its next request before
    the last byte of the current one arrives. See [measurement.md §4](measurement.md#4-adaptive-stream-count),
    [§5](measurement.md#5-adaptive-duration), [§6](measurement.md#6-download-mechanics),
    [§19.2](measurement.md#192-500-kbits--300-ms-rtt-mobile-over-vpn-standard) and
    [§19.3](measurement.md#193-100-mbits--50-ms-rtt-standard).
21. How does the upload runner apply the rules of §5 and §7? Current answer: **its minimum and
    maximum run on the client clock from the phase's first request**; a request whose stream has
    no confirmed request yet has no expected duration and gets the full 2 s grace; an error
    result, a user stop and a server restart abort the requests in flight at once, without the
    grace; telemetry whose counts are not whole byte counts adding up to `bytes` from the cell of
    `startMs` is rejected like a byte mismatch; an added stream whose first request failed is
    placed by its first confirmed one; events seen on the client are placed on the server timeline
    with the display offset. Recomputed on the shared-link model, the §19.4 link needs a
    per-request ceiling of ≈ 0.5 Gbit/s for its ramp to gain up to 6 streams (one stream at
    ≈ 1.6 Gbit/s would plateau at 4); its upload warm-up then ends at ≈ 8.1 s and its window is
    confirmed at ≈ 11.8 s (they were ≈ 9.5 s and ≈ 13.5 s), and the window averages ≈ 97 % of the
    link as the last requests drain. Recommendation: keep it; confirm §19.4 on the harness ceiling
    profile. See [measurement.md §5](measurement.md#5-adaptive-duration),
    [§7.3](measurement.md#73-server-telemetry-per-request),
    [§8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare),
    [§17](measurement.md#17-result-object) and
    [§19.4](measurement.md#194-25-gbits-lan-standard).
22. How does the UI tell the engine about the network and the browser, and how does a run order
    its phases? Current answer: **a `network` command carries the `offline` event and
    `navigator.connection.type` changes**, which edge-cases.md §6 needs and the contract lacked;
    the transport's `info()` returns the browser's family, major version and operating system
    with the `GET /info` answer, so the engine never reads `navigator`; the `start` override
    already carries `label` and `contextLabel` (question 19). A measuring phase the settings
    leave out is announced `skipped` after Info; a run with nothing to keep emits no result; the
    housekeeping tick sends the live samples; a paused hidden page ends the download window at
    the last on-time tick while the upload, timed by the server, stops at once, and a late tick
    counts as a pause whenever the page was hidden since the last on-time tick, whichever message
    the resumed Worker handles first; a late tick during idle latency restarts it once visible; a
    WebSocket close survived during idle latency restarts it; a network change or a restart, by
    either path, leaves the current direction with nothing measured. Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [edge-cases.md §5, §6](edge-cases.md#5-tab-hidden-mid-test).
23. What does a v0.1 result object hold, and how does the application check one? Current answer:
    **the v0.1 field set of measurement.md §17, with the fields of later versions absent rather
    than `null`**; `client.timerResolutionMs` and `client.crossOriginIsolated` join `client`, as
    edge-cases.md §9 shows them in the result detail; a direction that did not run is a `skipped`
    block, and one whose warm-up never ended has no window, series or confidence; `cpu-bound`
    takes precedence over `low` and keeps the reasons; the idle statistics are rounded to the
    timer resolution, or left as measured when no resolution was detected; a `cpu-bound`
    direction has no `low-confidence` notice; downsampling sums consecutive buckets and leaves a
    point with an unknown bucket unknown; the download window holds only full buckets, so an end
    between two ticks drops the partial one from the headline, the series, the window condition
    and the covered time alike. `engine/messages.ts` re-exports one runtime function, `validateResult`
    from `engine/result/validate.ts`, so the application checks a result before Download JSON
    without importing engine internals, and the `Clock` reports the busy time, the resolution and
    cross-origin isolation. A download phase whose bucket ticks fall on fractional instants closes
    each bucket on its own tick and ends at the bucket end exactly. Recommendation: keep it. See
    [measurement.md §16, §17](measurement.md#17-result-object) and
    [technical-stack/frontend.md §2](technical-stack/frontend.md#2-engine-package-rules).
24. How does the Worker wire the browser in, and what does its message loop do with commands out
    of order? Current answer: **one run at a time; a `start` meanwhile is ignored, a `start`
    before a valid `configure` and an invalid `configure` answer `invalid-settings`, and the last
    valid configuration stays**. The busy time sums the Worker's timed tasks (timers, messages,
    network callbacks, the engine's handling of each download chunk); the timer resolution is the
    median of about 20 consecutive reading differences, 50 ms when the clock barely moves; a
    request's timing entry is the earliest with its URL started at or after its send, waited for
    up to 50 ms after the request ended, in a 2000-entry buffer cleared when full;
    `client.browser` comes from a fixed family and system table. A WebSocket handshake that
    neither opens nor fails within 10 s counts as unavailable, and a run that fails inside the
    engine is the Worker's uncaught error rather than an `error` message. Recommendation: keep
    it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [technical-stack/frontend.md §2](technical-stack/frontend.md#2-engine-package-rules).
25. Which URLs may the built SPA contain? Current answer: **exactly the SVG, XLink and MathML
    namespaces, the GNU licences URL of the licence header, Tailwind's licence comment URL, Vue's
    console error-reference link with its paths, and `https://github.com/leinardi/bitgauge` with
    its paths** (the About screen's source and documentation links, the base-path error's link to
    the deployment guide); the namespaces, the licence comment and the console link are strings
    the browser never fetches. A hyperlink the user clicks is navigation, not an outbound call, and
    the allowlist is the complete set, checked in every file of the dist, binary files included,
    for `http`, `https`, `ws` and `wss` URLs. Recommendation: keep it. See
    [technical-stack/build-packaging.md §4](technical-stack/build-packaging.md#4-ci-workflows)
    and [security.md §3](security.md#3-no-outbound-calls).
26. How large may the engine's Worker chunk be? Current answer: **128 KiB minified**, held in
    `.chunk-budget` and enforced by the `chunk-size` step, which also fails when the dist has no
    Worker chunk; the number is lowered once the real size is known. Recommendation: keep it. See
    [technical-stack/frontend.md §3](technical-stack/frontend.md#3-worker-bundling-with-vite).
27. What replaces the Settings screen in v0.1? Current answer: **nothing: navigation shows Test
    and About, `/history`, `/settings` and `/result/{id}` render a "not available in this
    version" page from the fixed route list, the test settings are the server defaults with the
    URL parameters on top, the header's theme is the only persisted setting, the settings summary
    has no Edit link, and the stored-language step of locale detection is empty**. The v0.1
    About screen says the other-client layers arrive in v0.3, shows no snippets, and summarises
    the v0.1 metrics only. Recommendation: keep it. See
    [ui/screens.md §1](ui/screens.md#1-test-home--), [§5](ui/screens.md#5-other-clients--about--about)
    and [ui/i18n-a11y.md §1.2](ui/i18n-a11y.md#12-locale-detection).
28. Where are the favicons, app icons and web manifest served? Current answer: **from the base
    path itself, as an explicit list of eight files in the SPA group's routes** (`favicon.svg`,
    `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
    `icon-512-maskable.png`, `site.webmanifest`), never a catch-all, with
    `Cache-Control: public, max-age=86400` because their names are not content-hashed.
    Recommendation: keep it. See [architecture.md §3](architecture.md#3-spa-embedding-and-base-path)
    and [compatibility.md §5](compatibility.md#5-route-table).
29. How is the v0.1 SPA shell put together? Current answer: **the locale catalog is one directory
    per language with one JSON file per screen namespace; the header shows the server's name and
    reachability only once `GET /info` has answered, announces later changes only, and on narrow
    screens cycles the theme through light, dark and system with one button; the Test screen
    starts the engine's Worker with the page and configures it with the server defaults as soon as
    they are known; the engine is type-checked on its own with `exactOptionalPropertyTypes`,
    which the application's program turns off for Vue's prop types and the copied shadcn-vue
    components**. Recommendation: keep it. See
    [technical-stack/frontend.md §1, §2, §4, §7](technical-stack/frontend.md#1-spa-layout) and
    [ui/i18n-a11y.md §1.1](ui/i18n-a11y.md#11-structure).
30. What does the SPA show before a test runs? Current answer: **`GET /api/v1/info` on load and
    on Retry, with no automatic retry; while it fails, a "Server unreachable" notice with Retry on
    the Test and About screens. The connection info shows the protocol as "not reported" and the
    stream count as the configured mode (the fixed count, one stream, or "auto, up to" the
    maximum) until a run reports them; the context label starts at the server's suggestion,
    marked "suggested", and the user can pick LAN, VPN, none or a custom text, kept in memory
    for the page's lifetime and never stored. The settings summary reads the preset, the stream
    mode and the data cap ("Standard preset · Auto streams · No data cap") when nothing differs
    from the server defaults, and otherwise one chip per changed setting after "N changed:". The
    base-path check runs before anything renders, and an API that reports another base path gets
    its own wording.
    The v0.1 About screen credits each project with the milestone that uses it, and its links
    point into the repository: the source, `LICENSE`, `docs/features/measurement.md` for the
    methodology, and `docs/features/deployment-example.md` §6 from the base-path error**.
    Recommendation: keep it. See [ui/screens.md §1, §5](ui/screens.md#1-test-home--) and
    [edge-cases.md §16, §20](edge-cases.md#20-base-path-mismatches).

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
