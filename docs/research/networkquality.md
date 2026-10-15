# Apple networkQuality and the Responsiveness Draft

[Feature index](../features/README.md) / [Research](README.md) / networkQuality

`networkQuality` is the command-line tool in macOS 12 and later (and a hidden test on iOS) that
measures capacity and **responsiveness** in round trips per minute (RPM). Its method is written up
as the IETF draft "Responsiveness under Working Conditions"; this page follows
draft-ietf-ippm-responsiveness-05. `goresponsiveness` is an independent open-source implementation.
BitGauge serves the protocol through a compatibility layer and computes a browser-feasible subset
itself.

## 1. Server Specification

Apple publishes what a server must offer for `networkQuality -C <config URL>`:

- **Config.** A JSON document with a version and the URLs of three objects:

  ```json
  {
    "version": 1,
    "urls": {
      "small_https_download_url": "https://example.com/api/v1/small",
      "large_https_download_url": "https://example.com/api/v1/large",
      "https_upload_url": "https://example.com/api/v1/upload"
    }
  }
  ```

  The draft names the same keys without `https_` (`small_download_url`, `large_download_url`,
  `upload_url`). URLs are absolute `https://`.
- **Small object.** One byte. It is the target of the latency probes.
- **Large object.** Large enough never to finish during a test (8 GB in the reference setup);
  clients close the connection when they are done.
- **Upload.** Accepts arbitrarily large `POST` bodies for the duration of the test, reads them
  fully, and answers 200.
- **Transport.** TLS 1.3 and HTTP/2 (HTTP/3 optional). No redirects; no content encoding.
- **Discovery.** The draft defines `https://<host>/.well-known/nq` as the well-known config
  location; the CLI also takes any config URL with `-C`.

## 2. Reference nginx Configuration

The reference nginx setup shows what matters operationally:

- `http2` and TLS 1.3 on the listener.
- The config, small and large objects served as static locations under `/api/v1/`.
- Upload bodies up to 250 MB, with **request buffering off**, so the client's upload streams
  through instead of being spooled to disk before anything is answered.
- No compression on any of these locations.

BitGauge's layer lives under `/nq/` instead, because these default paths collide with its native
`/api/v1`; it needs its own, larger drain limit for uploads, and must drain fully before
answering on HTTP/1.1 between proxy and server
([../features/compatibility.md §3](../features/compatibility.md#3-apple-networkquality)).

## 3. Draft Algorithm (-05)

### 3.1 Working Conditions

- The client loads the link with **parallel load-generating connections** (HTTP/2 or HTTP/3), each
  downloading the large object or uploading to the upload URL, in one direction at a time or both
  at once.
- Time is divided into **intervals** of 1 s. At each interval the client adds load-generating
  connections until the aggregate goodput stops increasing, up to a maximum number of connections
  (16 in the draft's parameters).
- **Goodput stability.** The moving average of the aggregate goodput is taken over the last
  `MAD` = 4 intervals. Goodput is stable when the standard deviation of the last `MAD` moving
  averages is within `SDT` = 5 % of their mean.

### 3.2 Probes

- **Foreign probes** open a **new** connection for each probe and time its parts separately: the
  TCP handshake (`tcp_f`), the TLS handshake (`tls_f`) and the HTTP request for the small object
  (`http_f`). They show the latency a new flow sees on the loaded path.
- **Self probes** (`http_l`) request the small object as a new stream **multiplexed on one of the
  load-generating connections**. They show the latency a request sees behind the load on the
  same connection, including the sender's queues.
- Probes run in rounds at a bounded rate (at most 100 probes per second, and probe traffic at most
  5 % of the measured capacity).
- **Responsiveness stability** uses the same moving-average rule on the probe results.

### 3.3 Trimmed Means and RPM

- Each probe kind is summarized by a **95 % trimmed mean** (`TMP`): the slowest 5 % of samples
  over the last `MAD` intervals are dropped and the rest averaged.
- The foreign component is the mean of the trimmed means of `tcp_f`, `tls_f` and `http_f`; the
  final responsiveness weighs the foreign component and the trimmed mean of `http_l` equally:

  ```text
  foreign = (TM(tcp_f) + TM(tls_f) + TM(http_f)) / 3
  RPM     = 60000 / ((foreign + TM(http_l)) / 2)        (times in ms)
  ```

- The test ends when both goodput and responsiveness are stable, or at a maximum duration, and
  reports capacity per direction plus RPM.

## 4. goresponsiveness

`goresponsiveness` is a Go implementation of the draft maintained alongside it. It is useful to
BitGauge as a second, non-Apple client for the compatibility layer, and in its verbose output as a
reference for what each probe kind measures. It is used as a client only; nothing is copied.

## 5. What a Browser Can Do

| Draft element | In a browser |
| --- | --- |
| Parallel HTTP/2 load connections | **No control.** A browser pools same-origin HTTP/2 traffic onto one connection; the page cannot ask for more. BitGauge loads with up to 6 streams on whatever the browser chooses |
| Goodput stability | **Yes**, on the 100 ms server grid and the ramp; BitGauge's warm-up rule is its own ([../features/measurement.md §8](../features/measurement.md#8-warm-up-ramp-and-steady-window)) |
| Foreign probes (`tcp_f`, `tls_f`, `http_f`) | **No.** The page cannot force a new connection, and handshake timings for a reused pool connection are absent |
| Self probes (`http_l`) | **Approximately.** A small `GET` timed with Resource Timing; `nextHopProtocol` shows h2 or h3, and `connectStart === connectEnd` shows *a* connection was reused, but not *which* one |
| 95 % trimmed mean | **Yes**, over the last four 1 s intervals |
| Apple-comparable RPM | **No.** Without foreign probes and without connection identity the number is a different metric |

BitGauge's result is therefore "HTTP loaded responsiveness — connection sharing not verifiable",
`RPM = 60000 / TM95(http_l)` over the self-probe approximation only, with states that say when even
that is unavailable, and never presented as comparable to Apple's RPM
([../features/measurement.md §12](../features/measurement.md#12-http-loaded-responsiveness)).

## 6. What BitGauge Takes

- The server side of the protocol, as an optional compatibility layer, so `networkQuality` and
  `goresponsiveness` can test against a LAN or VPN host.
- The one-byte small object, shared by `/nq/small` and the native `/api/v1/small`.
- The trimmed-mean formula and the 1 s interval for the browser-feasible half.
- The honesty rule: what cannot be measured in a browser is labeled, not approximated silently.

## Related

- [Measurement methodology](../features/measurement.md)
- [Compatibility layers](../features/compatibility.md)
- [Deployment example](../features/deployment-example.md)
- [Cloudflare](cloudflare.md)
