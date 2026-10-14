# Research

[Feature index](../features/README.md) / Research

Prior art studied while specifying BitGauge: how other speed tests measure and which ideas
BitGauge takes. These pages record facts and ideas; the BitGauge behaviour they
inform is specified in [../features/](../features/README.md), which is canonical.

## Ideas Only, No Code

- **No code, assets, configuration files or text are copied** from any source below, whatever its
  licence. BitGauge implements its own engine and, for the compatibility layers, the documented
  wire contracts ([../features/compatibility.md](../features/compatibility.md)).
- Short identifiers (route names, parameter names, JSON keys, constant names) are quoted only to
  describe behaviour and wire compatibility.
- A fact is recorded with where it came from (file, configuration or document), so it can be
  re-checked when the source changes. Source versions are the ones studied in October 2026.
- Product names are used only to identify the tools. OpenSpeedTest™ is a trademark of its owner.

## Pages

| Page | Source | What BitGauge takes |
| --- | --- | --- |
| [OpenSpeedTest](openspeedtest.md) | `app-2.5.4.js`, `index.html`, the `openspeedtest/latest` Docker image | The self-hosted model and the compatibility contract |
| [LibreSpeed](librespeed.md) | LibreSpeed web worker, `speedtest-go` server, `librespeed-cli` | Overhead factor presets, the compatibility routes, discarding the warm-up |
| [Cloudflare](cloudflare.md) | `@cloudflare/speedtest` | The 1 s request-size rule, Resource Timing for HTTP probes, `Server-Timing`, loaded-latency throttle, AIM score tables |
| [Apple networkQuality](networkquality.md) | Apple's server specification and reference configurations, draft-ietf-ippm-responsiveness-05, `goresponsiveness` | The compatibility layer, the trimmed-mean RPM formula for the browser-feasible half |
| [ndt7](ndt7.md) | The ndt7 protocol specification | Server-side measurement of upload, message size scaling as a cross-check |
| [Browser upload limits](browser-upload-limits.md) | Mozilla bug reports, other tests' issue trackers and settings, BitGauge's own probes | The preparation turn, the upload gauge window and the `browser-upload-limit` notice |
| [Prior-art summary](prior-art-summary.md) | All of the above plus fast.com and Waveform | Who each idea comes from |

## Licences of the Sources

The licence decides nothing here, because nothing is copied; it is recorded so the "ideas only"
rule is easy to audit.

| Source | Licence |
| --- | --- |
| OpenSpeedTest (web app and Docker image) | MIT; OpenSpeedTest™ is a trademark of its owner |
| LibreSpeed (`speedtest`, `speedtest-go`, `librespeed-cli`) | LGPL-3.0 |
| Cloudflare `@cloudflare/speedtest` | MIT |
| Apple networkQuality server specification and reference configurations | Published for server operators; used as a protocol description only |
| draft-ietf-ippm-responsiveness-05 | IETF Trust legal provisions (BCP 78); used as a specification |
| ndt7 protocol specification and `ndt-server` | Apache-2.0 |
| fast.com, Waveform bufferbloat test | Proprietary; only their public methodology descriptions are used |

## Related

- [Product](../features/product.md)
- [Measurement methodology](../features/measurement.md)
- [Compatibility layers](../features/compatibility.md)
- [Technical decisions](../features/technical-stack/decisions.md)
