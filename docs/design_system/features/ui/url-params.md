# URL Parameters

[Feature index](../README.md) / [UI](README.md) / URL Parameters

A small, documented set of query parameters lets a link start a test or carry settings. Parameters
apply to the page load they appear on; they are not stored unless the user saves them in Settings.

## 1. Rules

- **Precedence:** URL parameters > settings stored in this browser > server defaults from
  `GET /api/v1/info` ([../configuration.md §2.3](../configuration.md#23-test-defaults)). The
  stored settings are the ones the user set on the Settings screen, kept under
  `bitgauge.settings.v1` ([screens.md §4](screens.md#4-settings--settings)). A stored Auto-start
  that is on counts as `run=1` on every load; `run=0` in the URL wins for that load.
- Parameter names are matched case-insensitively (`Run=1` works); canonical names are lowercase.
  Values are case-insensitive for enums and for the units of `cap`. When a name appears more than
  once, its first occurrence counts.
- An invalid value is ignored, the rest of the URL still applies, and the notice
  `URL parameter ignored` names the ignored parameter with the value the link gave (cut to 64
  characters), the values it allows and what the setting stays on: "streams=12 ignored, allowed
  1–6. Streams stay on Auto; the other parameters from the link were applied." It offers
  **Dismiss**, which hides it for the page load; the result still carries it. Unknown parameters
  are ignored silently.
  A value is invalid when it is outside the table below or outside the ranges of
  [../configuration.md §2.3](../configuration.md#23-test-defaults): a `cap` below 1 MiB, or a
  fixed `streams` count above the server's `streams.max`. `run` accepts only the values its row
  lists. `duration` is checked against the range of the **resolved** preset, the URL's `preset`,
  else the stored one, else the server's: 5–600 s for a bounded preset, 60–604800 s for Continuous.
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
| `test` | `all`, `download`, `upload`, `latency` (`ping` accepted as an alias of `latency`) | `all` | Which phases run: `all` = idle latency, download and upload in the configured order; `download` or `upload` = idle latency plus that direction; `latency` = idle latency only. Under a resolved Continuous preset it picks the direction instead: `download` or `upload` runs that direction, `all` gives download, and `latency` is ignored with the `URL parameter ignored` notice and gives download; idle latency runs first as the stored phases say. |
| `preset` | `quick`, `standard`, `extended`, `continuous` | server default (`standard`) | Selects the preset ([../measurement.md §8.5](../measurement.md#85-presets)). |
| `duration` | integer seconds: 5–600 for bounded presets; 60–604800 (1 minute to 7 days, the retention horizon) when the resolved preset is Continuous | preset; none for Continuous | Bounded presets: maximum duration per direction (the minimum becomes the smaller of the preset's minimum and this value). Continuous: the run length, after which the run ends, its status following [../measurement.md §15](../measurement.md#15-continuous-mode). |
| `streams` | `auto`, `single`, or an integer 1–6 | server default (`auto`) | Stream mode; an integer means fixed N. |
| `cap` | size: integer bytes or a number with `kB`, `MB`, `GB`, `KiB`, `MiB`, `GiB`; `0` or `none` | server default (none) | Data cap per test. |
| `units` | `bits`, `bytes` | server default (`bits`) | Display units. |
| `lang` | a supported locale tag (`en`, …) | browser language | UI language ([i18n-a11y.md §1](i18n-a11y.md#1-internationalization)). |
| `theme` | `system`, `light`, `dark` | `system` | Color theme. |
| `label` | text, at most 64 characters | suggested label | Pre-fills the result's label (for example `VPN`, `LAN`, `Kitchen Wi-Fi`). |

The `URL parameter ignored` notice words each parameter so, with the run's own value in the second
sentence; a list of three or more is joined in the locale's list format, in English with the serial
comma:

| Parameter | Allowed | Stays on |
| --- | --- | --- |
| `run` | 1, true, 0, or false | The test waits for Start |
| `test` | all, download, upload, or latency; under Continuous, all, download, or upload | Phases stay on the run's phases ("idle latency, download, and upload"); under Continuous, the direction is download |
| `preset` | quick, standard, extended, or continuous | The preset stays on the run's ("Standard") |
| `duration` | 5–600 s; under Continuous, 60–604800 s | Durations stay on the run's (the stored ones, or the preset's when none are stored or the link sets another preset); under Continuous, the run length stays on the stored one, or none |
| `streams` | 1–`streams.max` for a number, otherwise auto, single, or 1–`streams.max` | Streams stay on the run's mode ("Auto", "Single" or the count) |
| `cap` | 1 MiB or more, 0, or none | The data cap stays on the run's ("none" or the size) |
| `units` | bits or bytes | Units stay on the run's ("bits") |
| `lang` | the supported locale tags (`en`) | The language stays on the page's ("English") |
| `theme` | system, light, or dark | The theme stays on the page's ("System") |
| `label` | at most 64 characters | The label stays on the stored one, or the suggested one when none is stored |

Advanced settings (warm-up, ping count, overhead compensation) are not URL parameters: they change
what a number means, so they are set deliberately in Settings and shown with the result.

## 3. Shareable Settings URL

The Settings screen builds a URL from the current settings:

- Base: the page's origin and base path.
- Only parameters whose value differs from the server default are included, in the table order of
  §2 (`run`, `test`, `preset`, `duration`, `streams`, `cap`, `units`, `lang`, `theme`, `label`), so
  links stay short and keep following the server's defaults for everything else.
- `run=1` is added only if the user ticks "start automatically".
- `lang` and `theme` are included only when the user stored them in Settings, never from the
  browser's own language or the system theme.
- `label` is included only if the Settings screen's result label is set.
- Values are percent-encoded with `encodeURIComponent`.
- Under Continuous, `test=upload` carries a stored `continuousDirection` of upload and `duration`
  a stored `runLengthS`; the stored settings map back onto them when the link is opened.
- A changed setting that no parameter carries is named in a "Not in the link" line under the
  field: the advanced settings (warm-up, ping count, overhead compensation), the auto-start
  countdown length, and any phase set or order, or per-direction duration, that `test` and
  `duration` cannot express. Opening the link applies the server defaults for them.

Example: `https://speed.example.lan/?run=1&preset=extended&streams=4&cap=500MB&label=VPN`.

## 4. Mapping From OpenSpeedTest Parameters

OpenSpeedTest reads its parameters case-insensitively, each also with a one-letter alias. BitGauge
matches `Run` and `Test` by name (case-insensitive matching) and interprets no other OpenSpeedTest
parameter; the one-letter aliases are not supported.

| OpenSpeedTest | Meaning there | BitGauge | Status and reason |
| --- | --- | --- | --- |
| `Run` (`R`) | Start the test on load | `run` | **Kept.** Same meaning, now with a cancellable countdown. |
| `Stress` (`S`) | Long run: `low` 300 s, `medium` 600 s, `high` 900 s, `veryhigh` 1800 s, `extreme` 3600 s, `day`, `year`, or a number of seconds > 12, per direction | `preset=continuous` with `duration` and `test` | **Renamed.** Continuous mode with constant-memory retention replaces stress levels; one direction per run. `low` → `duration=300`, `medium` → `600`, `high` → `900`, `veryhigh` → `1800`, `extreme` → `3600`, `day` → `86400`; a custom number of seconds maps to the same `duration` within 60–604800; `year` has no equivalent (the longest run length `duration` can set is 7 days, the retention horizon) and is approximated by Continuous without `duration`, which runs until stopped, past 7 days if need be, and saves its last 7 days. |
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
