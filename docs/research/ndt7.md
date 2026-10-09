# ndt7

[Feature index](../features/README.md) / [Research](README.md) / ndt7

ndt7 is the current version of the Network Diagnostic Tool protocol run by Measurement Lab
(M-Lab). Its specification lives with the Apache-2.0 `ndt-server`. BitGauge borrows one idea from
it and explains here why its main strengths do not apply behind a reverse proxy.

## 1. Protocol Summary

- **Transport.** A single WebSocket over TLS per direction, subprotocol `net.measurementlab.ndt.v7`,
  at `/ndt/v7/download` and `/ndt/v7/upload`. One TCP connection carries the whole test.
- **Duration.** About 10 s per direction, ended by the server, with a hard timeout a few seconds
  later.
- **Data.** Binary WebSocket messages carry the load. Text messages carry JSON **measurements**:
  `AppInfo` (elapsed time and bytes at the application level), `TCPInfo` (the kernel's `TCP_INFO`
  for the connection: RTT, retransmissions, delivery rate and more), `BBRInfo` (the BBR congestion
  control's bandwidth and minimum RTT estimates) and `ConnectionInfo`.
- **Who measures.** Both ends send measurements. On upload the **server** reports what it
  received, so upload is measured where the bytes arrive rather than where they leave.
- **Server discovery.** Clients find a nearby server through M-Lab's locate service; every test is
  published as open data.

## 2. Message Size Scaling

The sender does not use a fixed message size:

- Messages start at 8 KiB (2¹³ bytes).
- Whenever the current size is at most 1/16 of the bytes already sent on the connection, the size
  doubles.
- The size never exceeds 16 MiB (2²⁴ bytes).

Small messages early keep a slow link responsive; doubling relative to the bytes sent so far lets a
fast link reach large messages within a fraction of a second, so per-message overhead never
dominates.

## 3. Why `TCP_INFO` and BBR Are Out of Scope

- **The kernel socket is the wrong hop.** BitGauge runs behind a reverse proxy that terminates TLS
  ([../features/deployment-example.md](../features/deployment-example.md)). The TCP connection
  BitGauge's kernel sees is proxy → BitGauge, usually on the same host or LAN. Its `TCP_INFO`
  (RTT, retransmits, delivery rate) describes that hop, not the client's link, and would be
  confidently wrong.
- **BBR needs control of the sender's congestion control.** BBR estimates come from the sending
  host's kernel on the client-facing connection; behind a proxy that connection belongs to the
  proxy. BitGauge also cannot choose the congestion control of the proxy or the browser.
- **One connection only.** ndt7 measures what one TCP flow achieves, by design. BitGauge measures
  what the browser can get with up to 6 streams, which is what the adaptive ramp is for.
- **Public data and discovery.** M-Lab's open-data publication and its locate service serve a
  public measurement platform; BitGauge's server stores no result and never calls out, so neither
  applies.

## 4. What BitGauge Borrows

- **Message size scaling as a cross-check.** BitGauge sizes requests to take about 1 s at the
  observed rate, growing at most 8× per step
  ([../features/measurement.md §3](../features/measurement.md#3-adaptive-request-size)). The ndt7
  rule, growing when a unit is small relative to the bytes already moved, is an independent sanity
  check on that design: both rules reach large units on fast links within the first second or two
  and keep small ones on slow links, so a size schedule that diverges sharply from ndt7's on the
  same timeline needs an explanation.
- **Measure upload where it arrives.** ndt7's server-reported upload is the same principle as
  BitGauge's server-timed upload
  ([../features/measurement.md §7](../features/measurement.md#7-upload-mechanics)), implemented
  over HTTP with per-bucket arrival counts instead of a WebSocket.

## Related

- [Measurement methodology](../features/measurement.md)
- [Prior-art summary](prior-art-summary.md)
- [Testing and accuracy harness](../features/technical-stack/testing.md)
