# URL Parameters

[Feature index](../README.md) / [UI](README.md) / URL Parameters

A small, documented set of query parameters lets a link start a test or carry settings. Parameters
apply to the page load they appear on; they are not stored unless the user saves them in Settings.

## 1. Rules

- **Precedence:** URL parameters > settings stored in this browser > server defaults from
  `GET /api/v1/info` ([../configuration.md §2.3](../configuration.md#23-test-defaults)). v0.1
  stores no test settings, so there the URL parameters apply over the server defaults
  ([screens.md §1](screens.md#1-test-home--)).
- Parameter names are matched case-insensitively (`Run=1` works); canonical names are lowercase.
  Values are case-insensitive for enums and for the units of `cap`. When a name appears more than
  once, its first occurrence counts.
- An invalid value is ignored, the rest of the URL still applies, and the notice
  `URL parameter ignored` names the ignored parameter. Unknown parameters are ignored silently.
  A value is invalid when it is outside the table below or outside the ranges of
  [../configuration.md §2.3](../configuration.md#23-test-defaults): a `cap` below 1 MiB, or a
  fixed `streams` count above the server's `streams.max`. `run` accepts only the values its row
  lists. Before v0.3, `preset=continuous` is invalid, since Continuous is a v0.3 preset.
- The page hands the settings parameters to the engine with its configuration, so every run of
  the page load uses them, and the engine resolves a `preset` there with its durations, ping count
  and stream mode ([../architecture.md §4](../architecture.md#4-engine--ui-message-contract)).
  The ignored parameters travel with each run, so the result carries the notice too.
- There is **no `server` parameter**: a test always runs against the server that served the page
  (multi-server selection is dropped, [../product.md §1.6](../product.md#16-non-goals)).
- Parameters live in the query string of any SPA route, normally `/`.

## 2. Parameters

| Parameter | Type and values | Default | Effect |
| --- | --- | --- | --- |
| `run` | flag: present, `1` or `true` starts; `0` or `false` does not | not set | Auto-start after the cancellable countdown ([flows.md §2](flows.md#2-auto-run-from-url)). |
| `test` | `all`, `download`, `upload`, `latency` (`ping` accepted as an alias of `latency`) | `all` | Which phases run: `all` = idle latency, download and upload in the configured order; `download` or `upload` = idle latency plus that direction; `latency` = idle latency only. With `preset=continuous`, picks the direction. |
| `preset` | `quick`, `standard`, `extended`, `continuous` | server default (`standard`) | Selects the preset ([../measurement.md §8.5](../measurement.md#85-presets)). |
| `duration` | integer seconds: 5–600 for bounded presets; 60–604800 (1 minute to 7 days, the retention horizon) with `preset=continuous` | preset; none for Continuous | Bounded presets: maximum duration per direction (the minimum becomes the smaller of the preset's minimum and this value). Continuous: the run length, after which the run ends as `complete`. |
| `streams` | `auto`, `single`, or an integer 1–6 | server default (`auto`) | Stream mode; an integer means fixed N. |
| `cap` | size: integer bytes or a number with `kB`, `MB`, `GB`, `KiB`, `MiB`, `GiB`; `0` or `none` | server default (none) | Data cap per test. |
| `units` | `bits`, `bytes` | server default (`bits`) | Display units. |
| `lang` | a supported locale tag (`en`, …) | browser language | UI language ([i18n-a11y.md §1](i18n-a11y.md#1-internationalization)). |
| `theme` | `system`, `light`, `dark` | `system` | Color theme. |
| `label` | text, at most 64 characters | suggested label | Pre-fills the result's label (for example `VPN`, `LAN`, `Kitchen Wi-Fi`). |

Advanced settings (warm-up, ping count, overhead compensation) are not URL parameters: they change
what a number means, so they are set deliberately in Settings and shown with the result.

## 3. Shareable Settings URL

The Settings screen builds a URL from the current settings:

- Base: the page's origin and base path.
- Only parameters whose value differs from the server default are included, in the table order,
  so links stay short and keep following the server's defaults for everything else.
- `run=1` is added only if the user ticks "start automatically".
- `label` is included only if set.
- Values are percent-encoded with `encodeURIComponent`.

Example: `https://speed.example.lan/?preset=extended&streams=4&cap=500MB&run=1&label=VPN`.

## 4. Mapping From OpenSpeedTest Parameters

OpenSpeedTest reads its parameters case-insensitively, each also with a one-letter alias. BitGauge
matches `Run` and `Test` by name (case-insensitive matching) and interprets no other OpenSpeedTest
parameter; the one-letter aliases are not supported.

| OpenSpeedTest | Meaning there | BitGauge | Status and reason |
| --- | --- | --- | --- |
| `Run` (`R`) | Start the test on load | `run` | **Kept.** Same meaning, now with a cancellable countdown. |
| `Stress` (`S`) | Long run: `low` 300 s, `medium` 600 s, `high` 900 s, `veryhigh` 1800 s, `extreme` 3600 s, `day`, `year`, or a number of seconds > 12, per direction | `preset=continuous` with `duration` and `test` | **Renamed.** Continuous mode with constant-memory retention replaces stress levels; one direction per run (the current answer to an item in [../open-questions.md](../open-questions.md)). `low` → `duration=300`, `medium` → `600`, `high` → `900`, `veryhigh` → `1800`, `extreme` → `3600`, `day` → `86400`; a custom number of seconds maps to the same `duration` within 60–604800; `year` has no equivalent (runs are capped at 7 days, the retention horizon) and is approximated by Continuous without `duration`, which runs until stopped. |
| `Test` (`T`) | Only `download`, `upload` or `ping` | `test` | **Kept**: `download` and `upload` unchanged, `ping` renamed to `latency` (and still accepted as an alias), `all` added. |
| `XHR` (`X`) | 1–32 parallel requests per direction | `streams` | **Renamed**, range 1–6 plus `auto` and `single`: browsers allow six HTTP/1.1 connections per origin, and the auto ramp usually does better than a fixed count. |
| `Clean` (`C`) | Overhead factor of 1–4 % applied to both directions (0 removes the default 4 %) | — | **Dropped.** Not settable through a link; overhead compensation is an advanced setting, 0 by default and shown next to every number ([../measurement.md §9.3](../measurement.md#93-overhead-compensation)). |
| `Out` (`O`) | Ping timeout | — | **Dropped.** Timeouts adapt to the measured RTT ([../measurement.md §10](../measurement.md#10-idle-latency)). |
| `Ping` (`P`) | Number of ping samples | — | **Dropped** as a URL parameter; the preset sets the ping count, adjustable in Settings → Advanced. |
| `Host` (`H`) | Server URL to test against | — | **Dropped.** Multi-server selection is dropped; the test runs against the serving origin. (The OpenSpeedTest UI's own `Host` still works against BitGauge's compatibility layer, [../compatibility.md §1.3](../compatibility.md#13-client-usage).) |

## Related

- [Flows](flows.md)
- [Screens](screens.md)
- [Configuration](../configuration.md)
- [OpenSpeedTest research](../../research/openspeedtest.md)
