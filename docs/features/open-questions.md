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
   1918 space labeled `VPN`)? Today the label is suggested from the address class only.
   Recommendation: **yes, in v0.2**, as an optional list of `{cidr, label}` entries in the server
   configuration, evaluated before the address-class rule and validated fail-closed. See
   [edge-cases.md §16](edge-cases.md#16-ipv6-vs-ipv4-and-the-lanvpn-label) and
   [wire-protocol.md §5](wire-protocol.md#5-get-apiv1info).
3. Which format should the share image use? Current answer: **PNG** from a `<canvas>`.
   Recommendation: keep PNG, which every chat app and photo viewer accepts; SVG would be smaller
   but depends on fonts on the receiving side and is refused by several sharing targets. See
   [technical-stack/frontend.md §6](technical-stack/frontend.md#6-charts-gauge-and-share-image).
4. Should Continuous mode run one direction or alternate between both? Current answer: **one
   direction per run**, chosen by the user, because alternating would mix two steady windows in one
   series and halve each direction's coverage. Recommendation: keep it; a user who wants both runs
   two sessions. See [measurement.md §15](measurement.md#15-continuous-mode).
5. How does a release validate the configuration keys of features it does not ship yet, and an
   empty duration bound? Current answer: **a toggle for an unshipped feature is rejected, naming
   its milestone** (`metrics.enabled` before v0.2; the three `compat.*.enabled` toggles and
   `test_defaults.preset: continuous` before v0.3), while their other keys are parsed and
   validated; the compatibility conflict rules apply from v0.3; and a duration pair is checked with
   an empty bound counting as the preset's value. Recommendation: keep it, since accepting a
   toggle that does nothing would be a silent default. See
   [configuration.md §4](configuration.md#4-fail-closed-validation).
6. Which `429` code do the WebSocket and networkQuality flow limits answer with? Current answer:
   **`too_many_streams`**, since both are concurrency limits like the throughput-stream limit;
   `rate_limited` stays with the per-minute limit and `table_full` with a full table.
   Recommendation: keep it; a browser cannot read the body of a refused WebSocket handshake
   anyway. See [wire-protocol.md §9](wire-protocol.md#9-rate-limits).
7. How does `GET /info` carry a fixed warm-up? Current answer: **`warmup` is `"auto"` or the
   fixed duration in whole milliseconds** (`3000`), the unit every other duration of the info
   response uses. Recommendation: keep it; a duration string such as `"3s"` would need a parser in
   the SPA for one field. See [wire-protocol.md §5](wire-protocol.md#5-get-apiv1info).
8. What may `GET /api/v1/download` allocate per request? Current answer: **nothing for the body,
   and two small allocations for the `Content-Length` header**, its formatted value and the
   one-element slice holding it, which `net/http`'s header map cannot avoid. Recommendation: keep
   it; leaving out `Content-Length` would break the response contract. See
   [wire-protocol.md §3.1](wire-protocol.md#31-get-apiv1downloadbytesn).
9. Which `400` code does a zero or negative `bytes` get? Current answer: **`bytes_out_of_range`
   with the limit in `details`**, like a value above the limit, since §2 defines the parameter as
   an integer of at least 1 and §7 assigns that code to a parameter outside its range;
   `bad_request` stays for a missing or non-integer value. Recommendation: keep it. See
   [wire-protocol.md §3.1](wire-protocol.md#31-get-apiv1downloadbytesn).
10. What does `POST /api/v1/upload` answer for an empty body? Current answer: **`200` with empty
    telemetry**: `buckets: []`, `bytes: 0`, `durationMs: 0`, and `startMs` (with `firstBucket`)
    at handler entry, since there is no first byte. Recommendation: keep it; the engine never
    sends one, and a `400` would add a code for a request that harms nothing. See
    [wire-protocol.md §4](wire-protocol.md#4-upload-telemetry).
11. How are the percentiles and the coefficient of variation of a bucket series computed? Current
    answer: **percentiles interpolate linearly between the closest ranks, and the coefficient of
    variation is the population standard deviation over the mean**, both over known buckets only;
    a mean of zero leaves the coefficient without a value, so a stability condition on it does not
    hold. Recommendation: keep it; the warm-up's last 10 buckets are the whole population the
    condition judges, not a sample of a larger one. See
    [measurement.md §2](measurement.md#2-sampling-model).
12. Which codes do the engine's notices and errors carry? Current answer: **one kebab-case code
    per notice of measurement.md §16, and five error codes** (`invalid-settings`,
    `requests-failed`, `network-changed`, `server-restarted`, `server-unreachable`) with the
    message key `errors.<code>`; the engine emits codes and raw values, never text.
    Recommendation: keep it. See
    [measurement.md §16](measurement.md#16-confidence-and-notices) and
    [architecture.md §4](architecture.md#4-engine--ui-message-contract).
13. When does a confirmed upload request "lie inside" the steady window for the three-request
    minimum? Current answer: **when every cell of its telemetry, from its first byte's cell to its
    last's, belongs to the window W**; a request straddling the warm-up end, the window end or a
    failure gap still contributes its bytes but is not counted, and one that read no bytes never
    is. This is the stricter reading: download's rule says "contributed bytes", upload's
    says "lie inside", and the §19.1 worst case sizes its window for whole requests.
    Recommendation: keep it. See
    [measurement.md §7.6](measurement.md#76-headline-peak-and-minimum-window).
14. Where do the ramp's intervals sit on the evaluation series? Current answer: **in whole
    buckets, rounded up**; the baseline starts at the first bucket holding bytes, a trial at the
    add on download and at the latest first byte of the added streams' first requests on upload
    (the only server instant known to follow the add); an interval with no known bucket is
    measured again; the baseline measures two intervals and further ones only while they end by
    3 s after `I_s`; a `429` that lowers the cap below the stream count drops the count to the cap
    and ends a running trial as `cap`; the ramp settles at the end of the interval that decided
    its plateau, which is where the warm-up cap moves to. Recommendation: keep it. See
    [measurement.md §8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare) and
    [§4](measurement.md#4-adaptive-stream-count).
15. Do the slow-link budgets of measurement.md §19.1 and §19.2 hold? Current answer: **they are
    recomputed from the rules on a link shared equally among the requests crossing it, with half
    the RTT each way**. A sequential stream idles one RTT between requests, so a second stream
    gains and the ramp settles at 4 streams with `no-gain`; on upload the added streams' first
    64 KiB requests hold the watermark back. At 300 kbit/s and 300 ms, with the `I_m` of item 40,
    the upload trial to 2 is decided at ≈ 8.2 s, the trial to 4 at ≈ 14.8 s, the window condition
    holds at ≈ 17.6 s, and the upload ends by ≈ 18.3 s with `confidence: low`
    (`insufficient-samples`); the download settles at ≈ 9.1 s and is extended to ≈ 12.1 s for its
    3 s window.
    Recommendation: confirm on the harness floor profiles; if they show low confidence there,
    consider sizing an added stream's first request from `T_base / N` rather than 64 KiB. See
    [measurement.md §19.1](measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard).
16. How do the warm-up conditions read the evaluation series? Current answer: **bucket by bucket
    on the series up to each newly known bucket**, with the request counts known at that moment;
    "the last 10 confirmed buckets" are the last 10 known ones and conditions 2 and 3 need all 10,
    which makes condition 4 hold whenever they can; download's "1 s of continuous chunk arrivals"
    is those 10 buckets all holding bytes; condition 1's `I_s`, the cap, its bound and a fixed
    warm-up count known buckets from the series' first bucket; a moved cap ends warm-up at the
    settle instant, which a trial ended by a `429` places at the end of the series read, also its
    last add if its streams were never placed. A phase is extended when its end condition (the
    window condition and a stable window, measurement.md §5) did not hold at a minimum shorter
    than its maximum, and upload stops issuing at `max − 1 s` even
    before its minimum. Recommendation: keep it; a stricter condition 2 would count only requests
    that ended before the bucket evaluated.
    See [measurement.md §8.3](measurement.md#83-warm-up-end) and
    [§5](measurement.md#5-adaptive-duration).
17. How does a run resolve its settings, and how does idle latency count its edge cases? Current
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
18. How does a throughput phase handle a `429`, failures and the data cap? Current answer: **a
    `429` records the `stream-limit` notice with the lowered cap**, a code §16 lacked although §4
    called for a notice; the streams above a lowered cap finish their request in flight and issue
    no further one; three consecutive failures count across the direction's streams in the order
    they occur, and any completed request resets the count; the phase ends on the data cap at the
    instant a stream would issue a request with less than 16 KiB of budget left, the budget
    counting the bytes still to move of the requests in flight; a direction reports the protocol
    of its latest throughput request with a Resource Timing entry. §19.2 is worked at the
    ≈ 0.478 Mbit/s of goodput its 500 kbit/s shaper carries. With the `I_m` of item 40, which spans
    a request cycle, the 100 Mbit/s download of §19.3 plateaus at 2 streams at ≈ 5.3 s and ends at
    10 s with a ≈ 4.7 s window, and the §19.2 download ramps to 6 streams at the 16 KiB floor,
    whose headline is the goodput within 0.1 %; before it, four streams there ended their requests
    together and left the link idle for one RTT gap. A delayed chunk never changes a bucket a
    decision has read. Recommendation: keep it; the harness CI profiles confirmed both headlines
    (item 41). See [measurement.md §4](measurement.md#4-adaptive-stream-count),
    [§5](measurement.md#5-adaptive-duration), [§6](measurement.md#6-download-mechanics),
    [§19.2](measurement.md#192-500-kbits--300-ms-rtt-mobile-over-vpn-standard) and
    [§19.3](measurement.md#193-100-mbits--50-ms-rtt-standard).
19. How does the upload runner apply the rules of §5 and §7? Current answer: **its minimum and
    maximum run on the client clock from the phase's first request**; a request whose stream has
    no confirmed request yet has no expected duration and gets the full 2 s grace; an error
    result, a user stop and a server restart abort the requests in flight at once, without the
    grace; telemetry whose counts are not whole byte counts adding up to `bytes` from the cell of
    `startMs` is rejected like a byte mismatch; an added stream whose first request failed is
    placed by its first confirmed one; events seen on the client are placed on the server timeline
    with the display offset. Recomputed on the shared-link model, the §19.4 link needs a
    per-request ceiling of ≈ 0.5 Gbit/s for its ramp to gain up to 6 streams (one stream at
    ≈ 1.6 Gbit/s would plateau at 4); its upload warm-up then ends at ≈ 8.1 s and its window is
    confirmed at ≈ 11.8 s (they were ≈ 9.5 s and ≈ 13.5 s), and the window ends where the first
    stream falls quiet, before the last requests drain. Recommendation: keep it; confirm §19.4 on
    the harness ceiling profile. See [measurement.md §5](measurement.md#5-adaptive-duration),
    [§7.3](measurement.md#73-server-telemetry-per-request),
    [§8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare),
    [§17](measurement.md#17-result-object) and
    [§19.4](measurement.md#194-25-gbits-lan-standard).
20. How does the UI tell the engine about the network and the browser, and how does a run order
    its phases? Current answer: **a `network` command carries the `offline` event and
    `navigator.connection.type` changes**, which edge-cases.md §6 needs and the contract lacked;
    the transport's `info()` returns the browser's family, major version and operating system
    with the `GET /info` answer, so the engine never reads `navigator`; the `start` override
    already carries `label` and `contextLabel` (question 17). A measuring phase the settings
    leave out is announced `skipped` after Info; a run with nothing to keep emits no result; the
    housekeeping tick sends the live samples; a paused hidden page ends the download window at
    the last on-time tick while the upload, timed by the server, stops at once, and a late tick
    counts as a pause whenever the page was hidden since the last on-time tick, whichever message
    the resumed Worker handles first; a late tick during idle latency restarts it once visible; a
    WebSocket close survived during idle latency restarts it; a network change or a restart, by
    either path, leaves the current direction with nothing measured. Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [edge-cases.md §5, §6](edge-cases.md#5-tab-hidden-mid-test).
21. What does a v0.1 result object hold, and how does the application check one? Current answer:
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
22. How does the Worker wire the browser in, and what does its message loop do with commands out
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
23. Which URLs may the built SPA contain? Current answer: **exactly the SVG, XLink and MathML
    namespaces, the GNU licenses URL of the license header, Tailwind's license comment URL, Vue's
    console error-reference link with its paths, and `https://github.com/leinardi/bitgauge` with
    its paths** (the About screen's source and documentation links, the base-path error's link to
    the deployment guide); the namespaces, the license comment and the console link are strings
    the browser never fetches. A hyperlink the user clicks is navigation, not an outbound call, and
    the allowlist is the complete set, checked in every file of the dist, binary files included,
    for `http`, `https`, `ws` and `wss` URLs. Recommendation: keep it. See
    [technical-stack/build-packaging.md §4](technical-stack/build-packaging.md#4-ci-workflows)
    and [security.md §3](security.md#3-no-outbound-calls).
24. How large may the engine's Worker chunk be? Current answer: **128 KiB minified**, held in
    `.chunk-budget` and enforced by the `chunk-size` step, which also fails when the dist has no
    Worker chunk; the number is lowered once the real size is known. Recommendation: keep it. See
    [technical-stack/frontend.md §3](technical-stack/frontend.md#3-worker-bundling-with-vite).
25. What replaces the Settings screen in v0.1? Current answer: **nothing: navigation shows Test
    and About, `/history`, `/settings` and `/result/{id}` render a "not available in this
    version" page from the fixed route list, the test settings are the server defaults with the
    URL parameters on top, the header's theme is the only persisted setting, the settings summary
    has no Edit link, and the stored-language step of locale detection is empty**. The v0.1
    About screen says the other-client layers arrive in v0.3, shows no snippets, and summarizes
    the v0.1 metrics only. Recommendation: keep it. See
    [ui/screens.md §1](ui/screens.md#1-test-home--), [§5](ui/screens.md#5-other-clients--about--about)
    and [ui/i18n-a11y.md §1.2](ui/i18n-a11y.md#12-locale-detection).
26. Where are the favicons, app icons and web manifest served? Current answer: **from the base
    path itself, as an explicit list of eight files in the SPA group's routes** (`favicon.svg`,
    `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
    `icon-512-maskable.png`, `site.webmanifest`), never a catch-all, with
    `Cache-Control: public, max-age=86400` because their names are not content-hashed.
    Recommendation: keep it. See [architecture.md §3](architecture.md#3-spa-embedding-and-base-path)
    and [compatibility.md §5](compatibility.md#5-route-table).
27. How is the v0.1 SPA shell put together? Current answer: **the locale catalog is one directory
    per language with one JSON file per screen namespace; the header shows the server's name and
    reachability only once `GET /info` has answered, announces later changes only, and on narrow
    screens cycles the theme through light, dark and system with one button; the Test screen
    starts the engine's Worker with the page and configures it with the server defaults as soon as
    they are known; the engine is type-checked on its own with `exactOptionalPropertyTypes`,
    which the application's program turns off for Vue's prop types and the copied shadcn-vue
    components**. Recommendation: keep it. See
    [technical-stack/frontend.md §1, §2, §4, §7](technical-stack/frontend.md#1-spa-layout) and
    [ui/i18n-a11y.md §1.1](ui/i18n-a11y.md#11-structure).
28. What does the SPA show before a test runs? Current answer: **`GET /api/v1/info` on load and
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
    The About screen has no credits, which the README holds, and its links point into the
    repository: the source, `LICENSE`, `docs/features/measurement.md` for the
    methodology, and `docs/features/deployment-example.md` §6 from the base-path error**.
    Recommendation: keep it. See [ui/screens.md §1, §5](ui/screens.md#1-test-home--) and
    [edge-cases.md §16, §20](edge-cases.md#20-base-path-mismatches).
29. How does the server render `index.html`? Current answer: **once at startup: the web build
    leaves the asset URLs relative (`./assets/…`) and the root assets' links as bare names, and
    the server makes both absolute under the base path and writes the base path into the single
    `bitgauge-base-path` meta element; an embedded SPA without `index.html`, a root asset or
    exactly one such meta element stops the startup with exit status 1, after the configuration,
    route collisions included, has been validated with exit status 2**. Hashed assets and root
    assets are served by name only, never as a directory listing, without `Last-Modified`. The
    absolute URLs mean a proxy that strips the prefix in front of an instance configured for `/`
    gives a blank page, not the base-path error screen, whose check needs the script to load.
    Recommendation: keep it. See [architecture.md §3](architecture.md#3-spa-embedding-and-base-path),
    [edge-cases.md §20](edge-cases.md#20-base-path-mismatches) and
    [technical-stack/backend.md §5](technical-stack/backend.md#5-server-settings-and-graceful-shutdown).
30. How does a release recovery select the recorded toolchains, and what does a dry run rehearse?
    Current answer: **`.github/scripts/recover-toolchains.sh` runs after the pinned setup actions,
    reads `Go:` and `Node:` from the tag's annotation, selects both in its own process (Go through
    `GOTOOLCHAIN`, Node from the `nodejs.org` tarball checked against `SHASUMS256.txt`), checks
    both versions and only then hands them to the later steps; an annotation with neither line is
    a warning and a rebuild with the current toolchains, which the published assets' SHA-256 check
    stops if the bytes differ, and one with only one line fails. A dry run rehearses a fresh
    release only, and fails at the tag gate on a version whose image exists.** Recommendation:
    keep it. See [release.md](../release.md#why-the-build-happens-before-the-tag) and
    [release.md, Dry Runs](../release.md#dry-runs).
31. How does the UI know a run has ended, and what does it do with an engine defect? Current
    answer: **from the order of the events, with no event of its own: a `result` ends the run, and
    so do the measuring phases' `finished`, `failed` or `skipped` events when none is `finished`,
    idle latency excepted after a stop, since a stop during it emits nothing for it. A late phase
    event or `result` after a stop has returned the screen to Idle still applies. A refused `start`
    ends with its `invalid-settings` error alone, and a refused `configure` makes the next `start`
    end at once with it. The Worker's uncaught error ends a run in progress as `test failed` with
    no result, and outside a run it makes every later `start` end that way. The wake lock is held
    during a run, requested again when the page becomes visible, and released when the run ends.**
    Recommendation: keep it. See [architecture.md §4](architecture.md#4-engine--ui-message-contract),
    [ui/flows.md §5](ui/flows.md#5-error-mid-test) and
    [edge-cases.md §2](edge-cases.md#2-mobile-browsers-throttling-background-tabs-and-workers).
32. Does a rate keep its trailing zeros? The export disagreed with itself: `tokens.md` shows
    "9.4 kbit/s", the kit's formatter in `bg-lib.js` writes "9.40 kbit/s", and ui/i18n-a11y.md
    §1.3 asked for `maximumSignificantDigits: 3`, which drops them. Current answer: **three
    significant digits with the trailing zeros kept (1.00 Mbit/s, 9.40 kbit/s), as measurement.md
    §14 reads; only the gauge caption's round scale ends drop them (1 Mbit/s – 10 Gbit/s)**. The
    `tokens.md` example is export content, left for the Claude Design project to correct.
    Recommendation: keep it. See [ui/i18n-a11y.md §1.3](ui/i18n-a11y.md#13-number-unit-and-date-formatting)
    and [measurement.md §14](measurement.md#14-units-and-gauge).
33. How does the live chart place the upload's `sending` line and the warm-up band, when the UI
    does not share the Worker's clock? Current answer: **the engine sends them on the direction's
    own bucket axis: every `sample` after warm-up carries `warmupEndBucket`, and an upload `sample`
    carries `startBucket` (P_start on the server grid) and `sendingBucket`, its own instant moved
    onto the grid by the display-only offset, both once a request has confirmed**. The chart
    places the sending value in the cell that instant falls in. Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract).
34. Which unit does a rate below 1 Mbit/s take, and which tone does each notice have? Current
    answer: **the largest unit, from kbit/s (kB/s) up to Gbit/s (GB/s), whose number is at least
    1, as the kit's formatter scales, so 472,000 bit/s reads 472 kbit/s; measurement.md §14's
    precision example said 0.472 Mbit/s and now says 472 kbit/s. The notices take the tones of
    ui/screens.md §7, which extends `notices.md`'s examples to every v0.1 code.**
    Recommendation: keep it. See [measurement.md §14](measurement.md#14-units-and-gauge) and
    [ui/screens.md §7](ui/screens.md#7-notices).
35. What is the Download JSON file called, and what is its `exportedAt`? Current answer:
    **`bitgauge-<YYYY-MM-DD>-<HHMM>.json` after the result's start in the browser's local time, as
    the design export's kit names it, with `exportedAt` the moment of the download in ISO 8601**.
    A result that fails `validateResult` is never exported: the button shows an error instead.
    Recommendation: keep it. See [ui/screens.md §1](ui/screens.md#1-test-home--).
36. Where does the Test screen's "Running: idle latency" state get its ping counter and live
    median, and how does it word a stopped direction and an engine error? Current answer: **an
    `idle` event after each answered or lost ping carries the counter, the last RTT for the
    gauge and the running median; a stopped direction with a number reads "partial — stopped
    early" and "upload based on the first 7.0 s" (its window end from the phase start, as
    measurement.md §7.8 words it), while the stop notice names the phase, the stop instant and
    the steady window ("a 3.6 s steady window", as ui/flows.md §4 words it); an engine error is
    worded by its message key `errors.<code>` in an `errors` namespace**. Recommendation: keep
    it. See [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [ui/i18n-a11y.md §1.1](ui/i18n-a11y.md#11-structure).
37. How do the URL parameters reach a run, when the UI cannot resolve a preset's durations
    without importing the engine, and which values are invalid? Current answer: **the page sends
    the settings parameters as the `configure` override, the engine resolves and stores them and
    answers with a `settings` event, which the screen shows (scope `configured`, and `run` as each
    run starts); the parameters whose values were ignored travel in each `start` override as
    `ignoredParameters`, each with its value, so the run carries a `url-parameter-ignored` notice
    for each up to the result. A value outside the table or the configuration ranges is invalid:
    a `cap` below 1 MiB, a fixed `streams` above the server's maximum, `preset=continuous` before
    v0.3. The first occurrence of a repeated name counts. The countdown waits for the engine's
    `settings` answer.
    Enter's "interactive control" is a link, a form control, editable text, an element with an
    ARIA widget role or a tab index of 0 or more, and Escape is left to a control that already
    handled it.** Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract),
    [ui/url-params.md §1](ui/url-params.md#1-rules) and
    [ui/i18n-a11y.md §2.4](ui/i18n-a11y.md#24-keyboard).
38. How does the harness evaluator treat what testing.md §5 leaves open? Current answer: **a pass
    needs a `complete` result with a headline in both directions; a rate between the tolerance
    table's rows has no tolerance and fails; at 2.5 Gbit and above, a headline outside its
    tolerance without `confidence: cpu-bound` adds a finding of its own, since the result carries
    the confidence but not the busy fraction; the re-run of an inconclusive profile is a second
    attempt in the report, the first kept and marked superseded; an unshaped run of a shaped
    profile is a debugging run, recorded and not judged, and like every final run that is not a
    pass it fails the tier; and the loaded-latency rule is not applicable in v0.1, which measures
    none.** Recommendation: keep it. See
    [technical-stack/testing.md §5.1](technical-stack/testing.md#51-implementation).
39. How does the v0.1 screen reader output get its numbers and words, when the engine sends a
    direction's headline only in the result? Current answer: **a `finished` download or upload
    `phase` event carries its headline, computed by the same code as the result's, so the live
    region announces it once as the direction finishes; spoken numbers keep the visual scale and
    digits with the locale's long unit names; the rate announced is the one the gauge shows, the
    upload's sending progress named as such; the announcements of one change are read as one
    message, headline first; the result summary holds the v0.1 metrics in the order of §2.7; a
    skip link opens every screen.** Recommendation: keep it. See
    [architecture.md §4](architecture.md#4-engine--ui-message-contract) and
    [ui/i18n-a11y.md §2](ui/i18n-a11y.md#2-accessibility).
40. How long is the ramp's measurement interval `I_m`? Current answer: **`max(500 ms, 2 × RTT,
    min(100 × RTT, 1 s + RTT))`**, where it was `max(500 ms, 2 × RTT)`. A stream loses a few round
    trips each request cycle, the round trip between its requests and, in WebKit, the slow start of
    a connection gone idle or opened anew. On the harness CI tier a 500 ms interval read the full
    link in one interval and that gap in the next: at 500 kbit/s and 300 ms the floor rule tripped
    on a gap interval, and at 100 Mbit/s and 50 ms `T_base` came from a lucky interval, so the
    trials showed no gain and WebKit's upload read 20–27 % low. `I_m` is now a whole request cycle
    over 10 ms of RTT, which holds one gap in every interval, and 100 RTT below it, over which those
    few round trips cost no more than the noise of a mean; a LAN keeps the 500 ms floor. The §19.1
    to §19.3 timelines are recomputed: slow links take longer to ramp and are extended past their
    minimum. Recommendation: keep it. See [measurement.md
    §8.2](measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare) and
    [§19](measurement.md#19-worked-timelines).
41. How does the harness measure its iperf3 reference and shape its link? Current answer:
    **each iperf3 run settles for `max(2 s, 10 × RTT)`, then takes the median of the receiver's
    one-second intervals, with a block length of 10 ms of data; each direction's queue is 80 ms
    of data and at least 64 KiB, an fq_codel whose target is its own length; and a run whose
    verdict fails keeps its environment under `HARNESS_KEEP_ON_FAILURE`, as a failed run does.**
    iperf3's `--omit` carries the omitted seconds' bytes into its totals; a mean over a few seconds
    reads a loss recovery's held-back bytes as a rate the link never had; a 128 KiB block
    quantizes the counts of a 500 kbit/s link; and a drop-tail FIFO let an established stream lock
    a new one out for 20 s, measuring TCP's fairness rather than BitGauge. With these, every CI
    profile passes on Chromium, Firefox and WebKit. Recommendation: keep it. See
    [technical-stack/testing.md §5.1](technical-stack/testing.md#51-implementation) and the
    [harness runbook](../engineering/accuracy-harness.md).
42. How does the v0.1 end-to-end suite run, and what does it check? Current answer: **in parallel
    against one host-built binary whose per-client stream limit is raised to 64, because every spec
    reaches it from one address; a spec that needs a base path, a server it stops or the WebSocket
    path, which that server's four WebSockets per client cannot promise, starts a binary of its own;
    a CSP listener runs in the page and in its Workers; it covers flows 1, 2, 4 and 5 and the base
    path, accepts either cause a server killed mid-run may end with, `network changed` or
    `requests-failed`, and runs axe's WCAG 2.2 AA rules once transitions settle, on every v0.1
    screen.** Its first runs found two defects, now fixed: the router's history rewrote the address
    under the base path before the base-path check read it, so a page served at another path loaded
    instead of showing the mismatch screen; and the start button's key hint, at the export's reduced
    opacity, failed 4.5:1 on the light theme. Recommendation: keep it. See
    [technical-stack/testing.md §4.1](technical-stack/testing.md#41-implementation), [ui/flows.md
    §5](ui/flows.md#5-error-mid-test) and [ui/i18n-a11y.md §2.6](ui/i18n-a11y.md#26-contrast).
43. How does the demo build stand in for a server? Current answer: **a demo Worker entry runs the
    real engine through its message loop against a simulated link on a sped-up clock, one scenario
    per v0.1 state of the UI kit, each a link and a scripted stop, failure or hold.** Writing it
    settled three points. The kit's VPN, 640 kbit/s with 48 ms, finds its steady window before the 10
    s minimum and is not extended, as the kit's own notes say and the engine agrees; the slow-link
    extension shows on the kit's 20 kbit/s insufficient-data link instead. And a simulated restart
    lets the requests in flight drain, as a graceful shutdown does: resetting every parallel request
    at once is three failures in a row, which ends the run as `requests-failed` before the
    WebSocket's close sequence finds the new epoch, an outcome the end-to-end suite accepts for a
    killed server but not the restart the demo means to show. The kit's early error, a server that
    stops answering during idle latency, ends as `network changed`, as [ui/flows.md
    §5](ui/flows.md#5-error-mid-test) says of a server that goes away mid-run. Recommendation: keep
    it. See [technical-stack/frontend.md §9](technical-stack/frontend.md#9-demo-build).
44. How does a demo build reach the page, and how is the production bundle proven free of it?
    Current answer: **a panel over every screen applies its choice by loading the page again; the
    page reaches the demo only through dynamic imports behind `import.meta.env.VITE_DEMO`, and the
    build step's sentinel scan fails a dist that holds any of it.** Dead-code elimination is not
    enough for a Worker: with the demo's constructor beside the engine's in `useWorker.ts`, the
    first production build still carried a demo Worker chunk, with the fixture server's name,
    because Vite bundles a Worker for every constructor it finds in a module it loads, whichever
    branch it sits in. The constructor now lives in `demo/start.ts`, which a production build never
    loads, and the sentinel scan passes on `web/dist` and fails on `web/dist-demo`. A choice reloads
    the page because a scenario's URL parameters apply only on load and a run in progress cannot be
    taken over by the next scenario's session. Recommendation: keep it. See
    [technical-stack/frontend.md §9](technical-stack/frontend.md#9-demo-build) and
    [technical-stack/build-packaging.md §4](technical-stack/build-packaging.md#4-ci-workflows).
45. How do the deployment examples show a setting the running release does not have yet? The
    Traefik shape enabled the networkQuality layer, which v0.1 rejects at startup
    ([configuration.md §4](configuration.md#4-fail-closed-validation)), so a copy of it exited
    with status 2. Current answer: **the toggle is shown commented out, with the release that
    brings it, in the page and in the shipped files alike; every shipped compose file's BitGauge
    environment must load and validate with no problem, which `test/deployments` checks against the
    configuration package itself.** At v0.3 the line is uncommented in the page and the examples
    together. Recommendation: keep it. See
    [deployment-example.md §2](deployment-example.md#2-compose-with-traefik).

Resolved and removed:

- _Should the upload grace after the end decision depend on the in-flight request's expected
  duration?_ **Yes**: `min(2 s, 2 × d)`, with `d` the expected duration of the longest in-flight
  request, which the slow-link budget needs. Confirmed by the maintainer on 2026-10-16 by the
  accuracy harness floor tier: all six floor runs (300 kbit/s with 300 ms and 1 % loss, and
  300 kbit/s with 600 ms, in Chromium, Firefox and WebKit) passed on their first attempt, once
  that day's method changes were in. See [measurement.md §5](measurement.md#5-adaptive-duration).
- _How should upload failures be handled?_ **Failure gaps on HTTP/2 and HTTP/3; on HTTP/1.1 the
  first failure ends the upload phase**, because a failed request there freezes the window end.
  Confirmed by the maintainer on 2026-10-16 with upload failures injected through the CI tier's
  proxy profiles: through Traefik (HTTP/1.1) one failure ended the phase with
  `upload-interrupted` and a 3.7 s window; through Caddy (HTTP/2) one failure left a 1.5 s failure
  gap, its cells unknown and outside the headline, while the phase went on, and repeated failures
  ended it with `requests-failed`. See
  [measurement.md §7.5](measurement.md#75-phase-start-measurement-end-and-the-confirmed-watermark)
  and the runbook step in
  [accuracy-harness.md §6](../engineering/accuracy-harness.md#6-inject-upload-failures).
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
- _Which license variant: GPL-3.0-only or GPL-3.0-or-later?_ **GPL-3.0-or-later**, used
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
