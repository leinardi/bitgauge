# OpenSpeedTest

[Feature index](../features/README.md) / [Research](README.md) / OpenSpeedTest

OpenSpeedTest is a widely used self-hosted speed test with a web app and a Docker image. This page
records how the studied version works, from its web app (`app-2.5.4.js` and `index.html`) and its
Docker image (`openspeedtest/latest`: nginx configuration and entrypoint), and the contract a
compatibility layer has to honour.

## 1. Licence and Trademark

- MIT licence. OpenSpeedTest™ is a trademark of its owner.
- BitGauge copies no code or assets and uses the name only to describe compatibility. The README
  credits OpenSpeedTest and notes the trademark.

## 2. How It Works

Facts in this section, including the parameter names, aliases and ranges, come from
`app-2.5.4.js` and `index.html` of the studied version; later versions may differ.

### 2.1 Download and Upload

- **Request sizes.** `GET downloading` returns a 30 MiB file of random data; the upload body is
  30 MiB.
- **Streams.** Six XHR streams per direction, started 300 ms apart. A finished request is
  immediately replaced by another of the same size.
- **Duration.** 12 s per direction.
- **Engine tick.** 100 ms. Progress events add to running totals; each tick computes the
  cumulative average since the start, and the result is derived from these averages.
- **Overhead factor.** 1.04, applied to both directions; the `Clean` parameter sets it to 0–4 %.
- **Upload timing.** From `xhr.upload` progress events in the browser.

### 2.2 Ping

- `pingSamples + 1` sequential `GET upload?n=<random>` requests to the empty upload file, each with
  a 5 s timeout.
- Result = the **minimum**; jitter = the mean of the lowest 50 % of the differences between
  consecutive samples.
- The client expects status **200** as the reply.
- Ping runs at idle, before the transfers, and also selects the server when several are
  configured: the lowest minimum wins.

### 2.3 External Calls

- In self-hosted mode nothing is sent automatically.
- The results link, if the user clicks it, sends the results and the user agent to
  openspeedtest.com.

### 2.4 URL Parameters

Read case-insensitively, each with a one-letter alias:

| Parameter | Alias | Meaning |
| --- | --- | --- |
| `Run` | `R` | Start the test on load |
| `Stress` | `S` | Long run per direction |
| `Test` | `T` | Only `download`, `upload` or `ping` |
| `XHR` | `X` | Parallel requests per direction, 1–32 |
| `Clean` | `C` | Overhead factor 0–4 % (0 removes the default 4 %) |
| `Out` | `O` | Ping timeout |
| `Ping` | `P` | Number of ping samples |
| `Host` | `H` | Server URL to test against |

BitGauge's mapping of each one is in
[url-params.md §4](../features/ui/url-params.md#4-mapping-from-openspeedtest-parameters).

## 3. Docker Image

Facts in this section come from the `openspeedtest/latest` image's nginx configuration and
entrypoint script.

- Based on nginx-unprivileged; listens on 3000 (HTTP) and 3001 (HTTPS).
- `client_max_body_size 35m`.
- CORS `Access-Control-Allow-Origin: *` on the test files.
- The entrypoint applies environment variables to the nginx configuration at start: `ALLOW_ONLY`
  (restrict which sites may use the server), `SET_SERVER_NAME`, and the Let's Encrypt variables
  for automatic certificates.

## 4. Endpoint Contract

What a client running the OpenSpeedTest web app requires of a server. It is wider than
`GET /downloading` plus `POST /upload`, because the ping also uses `/upload`:

| Method | Path | Required behaviour |
| --- | --- | --- |
| `GET` | `/downloading?n=…` | 200, about 30 MiB of incompressible data, no `Content-Encoding` |
| `GET`, `HEAD` | `/upload?n=…` | 200 with an empty body (the ping) |
| `POST` | `/upload?n=…` | Accept at least 30 MiB, then 200 |
| `OPTIONS` | both | 200 with `Access-Control-Allow-Origin`, `-Methods` (GET, POST, OPTIONS) and `-Headers` (Content-Type) |

`n` is a cache-buster and is ignored; responses must not be cached. BitGauge's implementation, with
its body cap and route-clash analysis, is
[../features/compatibility.md §1](../features/compatibility.md#1-openspeedtest).

## 5. What BitGauge Shares and Where It Differs

**Shares:**

- The self-hosted, single-container model with no account and no outbound calls.
- The `Run` and `Test` parameters, and a compatibility layer so a hosted copy of the OpenSpeedTest
  UI can run against BitGauge
  ([../features/compatibility.md §1](../features/compatibility.md#1-openspeedtest)).

**Differs, for its own target range** (from well under 1 Mbit/s to multi-Gbit):

- Request sizes adapted to about 1 s per request
  ([../features/measurement.md §3](../features/measurement.md#3-adaptive-request-size)) and a
  stream count chosen by a gain-tested ramp
  ([../features/measurement.md §4](../features/measurement.md#4-adaptive-stream-count)).
- Upload timed by the server on a 100 ms grid
  ([../features/measurement.md §7](../features/measurement.md#7-upload-mechanics)).
- Goodput reported with 0 % overhead compensation by default, and any factor shown next to the
  number ([../features/measurement.md §9.3](../features/measurement.md#93-overhead-compensation)).
- A steady-window average after a measured warm-up
  ([../features/measurement.md §8](../features/measurement.md#8-warm-up-ramp-and-steady-window)).
- Loaded latency and a bufferbloat grade next to idle latency
  ([../features/measurement.md §11](../features/measurement.md#11-latency-under-load)).
- A logarithmic gauge from 0.1 Mbit/s to 10 Gbit/s.

## Related

- [Prior-art summary](prior-art-summary.md)
- [Product: the problem](../features/product.md#14-the-problem)
- [Compatibility layers](../features/compatibility.md)
- [URL parameters](../features/ui/url-params.md)
