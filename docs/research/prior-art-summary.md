# Prior-Art Summary

[Feature index](../features/README.md) / [Research](README.md) / Prior-Art Summary

Which idea BitGauge takes from whom. Open-source tools are described from their code and
specifications ([OpenSpeedTest](openspeedtest.md), [LibreSpeed](librespeed.md),
[Cloudflare](cloudflare.md), [networkQuality](networkquality.md), [ndt7](ndt7.md)); fast.com and
Waveform only from their public methodology descriptions.

## 1. Which Idea Comes From Whom

| Idea in BitGauge | Taken from | Where specified |
| --- | --- | --- |
| Size requests to take about 1 s | Cloudflare's finish rule, cross-checked against ndt7's message scaling | [measurement §3](../features/measurement.md#3-adaptive-request-size) |
| Scale the stream count until throughput stops growing | fast.com and networkQuality | [measurement §4](../features/measurement.md#4-adaptive-stream-count) |
| Run until the estimate is stable, not for a fixed time | fast.com and networkQuality's stability rule | [measurement §5](../features/measurement.md#5-adaptive-duration) and [§8](../features/measurement.md#8-warm-up-ramp-and-steady-window) |
| Discard the warm-up instead of counting it | LibreSpeed (grace time); BitGauge ends it by measurement | [measurement §8](../features/measurement.md#8-warm-up-ramp-and-steady-window) |
| Measure upload where it arrives | ndt7 | [measurement §7](../features/measurement.md#7-upload-mechanics) |
| Resource Timing for HTTP probe timing, `Server-Timing` for server-side timing | Cloudflare | [measurement §10](../features/measurement.md#10-idle-latency) and [§12](../features/measurement.md#12-http-loaded-responsiveness), [wire protocol](../features/wire-protocol.md) |
| Loaded latency probes with a throttle | Cloudflare (400 ms) and fast.com | [measurement §11](../features/measurement.md#11-latency-under-load) |
| Bufferbloat grade thresholds | Waveform | [measurement §11.3](../features/measurement.md#113-bufferbloat-grade) |
| RPM from a 95 % trimmed mean of self probes | networkQuality and the IETF draft | [measurement §12](../features/measurement.md#12-http-loaded-responsiveness) |
| Quality scores per experience | Cloudflare AIM | [measurement §13](../features/measurement.md#13-quality-scores) |
| Packet loss via WebRTC and TURN (deferred) | Cloudflare | [measurement §18](../features/measurement.md#18-future-packet-loss-via-webrtcturn) |
| Overhead factor presets, off by default | LibreSpeed | [measurement §9.3](../features/measurement.md#93-overhead-compensation) |
| Self-hosted single container, compatibility with existing clients | OpenSpeedTest and LibreSpeed | [compatibility](../features/compatibility.md) |

## 2. BitGauge's Focus

BitGauge combines a self-hosted server, server-timed upload over plain HTTP, adaptive request
size, streams and duration, and loaded latency with a grade, aimed at the 300 kbit/s to 10 Gbit/s
range of LAN, homelab and VPN links
([../features/product.md §1.8](../features/product.md#18-positioning)).

## Related

- [Research overview](README.md)
- [Product](../features/product.md)
- [Measurement methodology](../features/measurement.md)
