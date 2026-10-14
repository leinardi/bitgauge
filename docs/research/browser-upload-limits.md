# Browser Upload Limits

[Feature index](../features/README.md) / [Research](README.md) / Browser upload limits

Every browser speed test uploads from JavaScript, so the browser's own networking stack sits
between the test and the link. On fast links that stack, not the link, can be the limit, and the
upload number then describes the browser on that device. This page records what is known about it,
with the public reports, so that a user who sees one browser below another at multi-Gbit rates can
tell why. The behaviour BitGauge derives from it is specified in
[../features/measurement.md §7.2 and §16](../features/measurement.md#72-client-side) and
[../features/edge-cases.md §10](../features/edge-cases.md#10-very-fast-links-where-the-browser-cpu-is-the-bottleneck).
Facts were checked in October 2026; the bugs change, so a reader should follow the links.

## 1. Firefox

Firefox prepares an upload body before its first byte leaves: the body crosses from the content
process to the networking process, and the copying and the thread hand-offs cost CPU time in
proportion to the bytes. Measured with BitGauge's own probes, that preparation runs at about
4–5 Gbit/s on a desktop and close to 1 Gbit/s on a phone, and requests prepared together share it.
Two consequences follow:

- a per-device ceiling on upload throughput, below what the same device reaches in Chromium;
- bursts: upload progress events are timer-batched, and a request's bytes can be reported as sent
  in one event once its body is handed over, so a client-side rate swings with every request.

BitGauge lets one request prepare at a time, so the others keep the link busy while a body is
prepared, reads the upload gauge over a longer window, and times upload on the server, which sees
the bursts and the gaps as they are. It cannot raise the ceiling, which is the browser's. A result
whose upload showed the preparation at work (an idle share over 20 %, in any browser), and a
Firefox result with an upload headline of at least 100 Mbit/s, carry the `browser-upload-limit`
notice that links here ([../features/measurement.md §16](../features/measurement.md#16-confidence-and-notices)).
The Firefox floor is low on purpose: the preparation rate measured on a high-end phone is close to
1 Gbit/s, and an older or cheaper device prepares slower still.

### 1.1 Mozilla bug reports

| Bug | What it reports | Status when checked |
| --- | --- | --- |
| [1939152](https://bugzilla.mozilla.org/show_bug.cgi?id=1939152) | Poor throughput with a self-hosted OpenSpeedTest server: on a 10 GbE Mac, Firefox uploads at 3.5–4 Gbit/s where Chrome reaches 10, at about twice the CPU power. Mozilla staff call upload performance on high-bandwidth connections a known problem being worked on. | Open, unconfirmed; blocks the upload-speed meta bug 1709343 |
| [1709343](https://bugzilla.mozilla.org/show_bug.cgi?id=1709343) | The meta bug collecting Firefox's upload-speed work. | Open |
| [1531123](https://bugzilla.mozilla.org/show_bug.cgi?id=1531123) | Upload slower than expected, fine in other browsers. A profile shows content-process contention: large memory copies in the networking IPC, thread wake-ups and polling adding up to a large share of the time. | Open |
| [1676603](https://bugzilla.mozilla.org/show_bug.cgi?id=1676603) | A public speed test's upload capped at about 300 Mbit/s in Firefox where Chrome reaches two to three times more; reporters on later versions see higher caps of the same kind. | Open, unconfirmed |
| [1596576](https://bugzilla.mozilla.org/show_bug.cgi?id=1596576) | HTTP/2 uploads far slower than in other browsers: 16 KB writes and a forced TCP send buffer. | Fixed in Firefox 115 |
| [1852924](https://bugzilla.mozilla.org/show_bug.cgi?id=1852924) | HTTP/3 uploads up to three times slower than other browsers; improved since, still the slowest of the three protocols. | Fixed in part |
| [1708868](https://bugzilla.mozilla.org/show_bug.cgi?id=1708868) | Slow uploads of large files with HTTP/3 enabled. | Open |
| [1556022](https://bugzilla.mozilla.org/show_bug.cgi?id=1556022) | Firefox for Android (GeckoView) at about 90 % of Chrome's download and 50 % of its upload on a public speed test; network preferences did not change it. | Open |
| [1187239](https://bugzilla.mozilla.org/show_bug.cgi?id=1187239) | The last upload progress event waits for the start of the server's response; a Mozilla engineer's [note](https://lists.w3.org/Archives/Public/public-webapps/2011JanMar/0994.html) explains that upload progress events fire from a timer, not per byte. | Fixed; the timer behaviour remains |

### 1.2 What other tests do

- OpenSpeedTest's maintainer answers the same report in
  [issue #149](https://github.com/openspeedtest/Speed-Test/issues/149) with "a known issue that has
  been reported for quite some time", and points at bug 1939152; no workaround is offered.
- LibreSpeed's worker settings start concurrent streams 300 ms apart so that they do not finish
  together, use one upload stream on Firefox for a steadier number, wait 3 s before measuring the
  upload "to let buffers fill", and build the body as a Blob of repeated 1 MB buffers
  ([librespeed.md](librespeed.md)).
- A 2026 [benchmark](https://dev.to/coffer/the-bug-was-in-my-benchmark-attaching-a-debugger-to-chromium-throttles-fetch-uploads-20x-38db)
  of `fetch()` upload bodies found no difference between Blob and typed-array bodies in Firefox,
  which matches BitGauge's phone probe: the body's construction does not move the ceiling.

### 1.3 What helps and what does not

| Measure | Effect |
| --- | --- |
| Staggering requests so that one body prepares while the others send | Keeps the link busy up to the preparation rate; BitGauge's preparation turn ([measurement.md §7.2](../features/measurement.md#72-client-side)) |
| HTTP/1.1 at the proxy for the test endpoints | Avoids the HTTP/2 upload path, slow before Firefox 115, and the HTTP/3 one, still slower ([deployment-example.md §5](../features/deployment-example.md#5-proxy-requirements-checklist)) |
| Fewer, larger requests | No change: the preparation cost is per byte |
| The body as an ArrayBuffer, a flat Blob or a Blob of parts | No change ([§1.2](#12-what-other-tests-do)) |
| Comparing with another browser on the same device | Tells the browser's ceiling from the link's |

## 2. Chromium and WebKit

Chromium reports upload progress about every 100 ms and sends without a preparation step that
BitGauge could measure; at multi-Gbit rates its limit is the CPU of the Worker and the network
service, which the busy fraction reports as `cpu-bound`
([measurement.md §16](../features/measurement.md#16-confidence-and-notices)). Safari 27 on macOS,
measured with BitGauge on a 2.5 GbE LAN, leaves about 100–150 ms between a request's end and the
next one's first byte on the same stream, download and upload alike, so with two streams half the
bytes of a bucket were missing at every request boundary and the download read `unstable`; no
public report of it was found. BitGauge issues each stream's next request early once the gap has
shown ([measurement.md §3](../features/measurement.md#3-adaptive-request-size)), which keeps the
link busy across it. Chrome for Android
once limited the size of an XHR upload body, which LibreSpeed caps at 4 MB there; BitGauge's
adaptive request size keeps requests at about one second of sending and has not met the limit. No
public report of a WebKit upload ceiling was found; Safari is covered by the manual checks of the
release ([testing.md §5](../features/technical-stack/testing.md#5-accuracy-harness)).

## Related

- [Prior-art summary](prior-art-summary.md)
- [Edge cases: very fast links](../features/edge-cases.md#10-very-fast-links-where-the-browser-cpu-is-the-bottleneck)
- [Upload mechanics](../features/measurement.md#7-upload-mechanics)
