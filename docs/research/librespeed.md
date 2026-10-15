# LibreSpeed

[Feature index](../features/README.md) / [Research](README.md) / LibreSpeed

LibreSpeed is a self-hosted speed test with a JavaScript web worker client, PHP and Go backends
(`speedtest-go`), a command-line client (`librespeed-cli`) and an Android app template. BitGauge
offers a compatibility layer for its clients and takes a few ideas; this page records how the
studied version works. Later versions may differ.

## 1. License

LGPL-3.0 (web client, `speedtest-go` and `librespeed-cli`). BitGauge uses **ideas only**: no code,
no assets, no configuration is copied. The compatibility layer implements the wire behavior
described here ([../features/compatibility.md §2](../features/compatibility.md#2-librespeed)).

## 2. Server Routes

The Go server answers every route in four spellings: bare, with a `backend/` prefix, with a `.php`
suffix, and with both, so clients configured for the PHP backend work unchanged.

| Route | Behavior |
| --- | --- |
| `GET /garbage?ckSize=N` | Streams `N` chunks of 1 MiB of random data (`N` documented in MB units). Default 4, maximum 1024 |
| `GET`, `POST /empty` | Reads and discards any body, answers 200 with an empty body. Used for upload and ping |
| `GET /getIP` | Client IP and optional ISP information as JSON `{processedString, rawIspInfo}`; `isp=true` adds the ISP lookup, `distance` the server distance |
| `/results`, `/results/telemetry` | Store a result in a database and return an id; an image of the result can be fetched later |
| `/stats` | Password-protected page listing stored results |

- **CORS** headers (`Access-Control-Allow-Origin: *`, methods `GET, POST`, headers
  `Content-Encoding, Content-Type`) are sent only when the request carries `cors=true`, which the
  web client adds in multi-server mode.
- **ISP lookup** calls an external IP-information service (or a local database in newer
  versions) when `isp=true`. BitGauge makes no outbound calls, so its `/getIP` returns an empty
  `rawIspInfo`.
- **Private addresses** are classified in `processedString` (`private IPv4 access`,
  `CGNAT IPv4 access`, `ULA IPv6 access` and so on); BitGauge reuses the strings for compatibility.

## 3. Web Worker Defaults

The browser client runs the test in a web worker. Defaults of the studied version:

| Setting | Default | Meaning |
| --- | --- | --- |
| `test_order` | `IP_D_U` | IP, ping, download, upload; `_` is a 1 s pause |
| `time_dl_max`, `time_ul_max` | 15 s | Maximum duration per direction |
| `time_auto` | `true` | Shorten the test on fast links (§4) |
| `time_dlGraceTime` | 1.5 s | Download warm-up discarded at the start |
| `time_ulGraceTime` | 3 s | Upload warm-up discarded at the start |
| `count_ping` | 10 | Ping samples |
| `xhr_dlMultistream` | 6 | Parallel download streams |
| `xhr_ulMultistream` | 3 | Parallel upload streams |
| `xhr_multistreamDelay` | 300 ms | Delay between stream starts |
| `xhr_ignoreErrors` | 1 | On a failed stream: 0 fail the test, 1 restart the stream, 2 ignore |
| `xhr_ul_blob_megabytes` | 20 | Upload request size in MB |
| `garbagePhp_chunkSize` | 100 | `ckSize` per download request (100 MiB) |
| `ping_allowPerformanceApi` | `true` | Use Resource Timing for ping when available |
| `overheadCompensationFactor` | 1.06 | Multiplied into both directions (§5) |
| `useMebibits` | `false` | Report Mbit/s, not Mibit/s |
| `telemetry_level` | 0 | No result upload to the server |

## 4. Algorithm

- **Download.** Each stream requests `garbage` with the configured `ckSize` and counts bytes from
  progress events; a finished request is replaced at once. When the grace time has passed, the
  byte counter and the clock are reset once, discarding the warm-up. The speed is total bytes ÷
  elapsed time × the overhead factor, updated every 200 ms.
- **Upload.** The same with `POST empty` and a 20 MB body of random data, timed from upload progress
  events in the browser. Browsers known to misreport upload progress get smaller requests (the
  "quirks" mode).
- **Duration.** With `time_auto`, each tick adds a bonus proportional to the current speed to the
  elapsed time, so fast links reach `time_*_max` sooner. Otherwise the test runs for the configured
  maximum duration.
- **Ping.** Sequential requests to `empty`; the result is the minimum, and jitter is a smoothed
  difference between consecutive pings, weighted more heavily when the difference grows than when
  it shrinks.
- **Errors.** By default a failed stream is restarted; status codes are not part of the speed
  calculation.

## 5. Overhead Factor

LibreSpeed multiplies both directions by a fixed factor to approximate wire rate from HTTP payload.
Its documentation lists:

| Factor | Description |
| --- | --- |
| 1.06 | Default: HTTP + TCP + IPv4 + Ethernet, over the internet, empirically tested |
| 1.0513 | HTTP + TCP + IPv6 + Ethernet, over the internet, empirically tested |
| 1.0369 | Alternative value for HTTP + TCP + IPv4 + Ethernet |
| 1.081 | Another empirical value, over the internet |
| 1 | No compensation |

BitGauge reports goodput with **0 % compensation by default** and offers these values as presets,
always shown next to the number
([../features/measurement.md §9.3](../features/measurement.md#93-overhead-compensation)).

## 6. `librespeed-cli`

- A Go client. By default it fetches a public server list; `--local-json FILE` (or `-` for stdin)
  and `--server-json URL` point it at other lists, `--server ID` picks an entry.
- Server list entries: `id`, `name`, `server` (base URL), `dlURL`, `ulURL`, `pingURL`, `getIpURL`,
  plus optional sponsor fields. Paths are relative to `server`.

  ```json
  [
    {
      "id": 1,
      "name": "Example",
      "server": "https://speed.example.lan/",
      "dlURL": "garbage",
      "ulURL": "empty",
      "pingURL": "empty",
      "getIpURL": "getIP"
    }
  ]
  ```

- **Ping.** ICMP by default (needs privileges on Linux); `--no-icmp` pings with HTTP `GET` to
  `pingURL`.
- **Download.** `--chunks` sets `ckSize` (default 100, so 100 MiB per request, MB units, maximum
  1024). `--concurrent` sets the stream count (default 3), `--duration` the test length (default
  15 s).
- **Upload.** `--upload-size` in KiB (default 1024). Every upload request carries an explicit
  `Content-Length`; the client never sends chunked bodies.
- **getIP.** The response must be JSON `{processedString, rawIspInfo}`; a plain-text answer (as
  the PHP backend gives without `isp`) fails to decode.
- **Output.** Human-readable by default, `--simple`, `--json` or `--csv` for scripts; `--share`
  uploads the result to the telemetry server for a share link.

How BitGauge serves it, including `/.well-known/librespeed`, is in
[../features/compatibility.md §2.3](../features/compatibility.md#23-librespeed-cli-server-list).

## 7. What BitGauge Takes and Where It Differs

**Takes:**

- The four route spellings and the `cors=true` convention, for compatibility.
- The overhead factor values, as optional presets with the default at 0 %.
- Discarding the warm-up rather than counting it.
- The private-address classification strings in `/getIP`.

**Differs:**

- Adaptive request sizes and stream counts instead of fixed `ckSize` and 6 or 3 streams
  ([../features/measurement.md §3–§4](../features/measurement.md#3-adaptive-request-size)).
- Streams added by a gain-tested ramp, or started together in fixed mode, instead of a fixed
  300 ms stagger.
- A measured warm-up end instead of a fixed grace time
  ([../features/measurement.md §8](../features/measurement.md#8-warm-up-ramp-and-steady-window)).
- Server-timed upload instead of upload progress events.
- Loaded latency and a bufferbloat grade.
- No results database, telemetry, ISP lookup or stats page, because BitGauge's server stores
  nothing and calls nowhere.
- The client IP is derived through a trusted-proxy rule
  ([../features/security.md §4](../features/security.md#4-client-ip-and-trusted-proxies)).

## Related

- [Compatibility layers](../features/compatibility.md)
- [Security](../features/security.md)
- [Prior-art summary](prior-art-summary.md)
- [Measurement methodology](../features/measurement.md)
