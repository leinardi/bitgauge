# BitGauge Feature Specification

BitGauge is a self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s on mobile over VPN up to multi-Gbit LAN.

This feature specification is split by topic so each area can evolve independently while still
linking back to the same product constraints. Terms used across all pages are defined once in the
[glossary](glossary.md).

The specification was approved by the maintainer on 2026-10-12, and it is implemented, not yet
released. These pages are the behavior contract: a change to what the product does starts here, and
code follows. Implementation details live in the code.

## Start Here

- [Product identity](product.md)
- [Guiding principles](principles.md)
- [Glossary](glossary.md)
- [Architecture](architecture.md)
- [Security model](security.md)
- [Design system](../design_system/README.md)

## Feature Areas

- [Measurement methodology](measurement.md)
- [Compatibility layers](compatibility.md)
- [UI structure](ui/README.md)
- [Configuration](configuration.md)
- [Edge cases](edge-cases.md)
- [Example deployment and proxy requirements](deployment-example.md)
- [Prior-art research](../research/README.md)

## Technical Contract

- [Technical stack](technical-stack/README.md)
- [Technical decisions](technical-stack/decisions.md)
- [Wire protocol — native HTTP API](wire-protocol.md)
- [Later and open items](#later-and-open-items)

## Core Invariant

**The server never stores a result and never calls out.**

BitGauge's server streams bytes, drains bytes, echoes pings and describes itself. Every measured
number is computed in the browser and kept only in the browser. The server holds no database,
writes nothing to disk, keeps no state that outlives a request beyond ephemeral counters, and makes
no outbound network connection of any kind. Any feature that would break either half of this
invariant is out of scope, however convenient.

## Later and Open Items

**Later**, unscheduled:

- Packet loss through a WebRTC data channel answered by the server itself, behind an opt-in UDP
  port ([measurement.md §18](measurement.md#18-packet-loss)).
- A headless CLI client of the native API for scheduled tests, as an exception to the native
  clients non-goal ([product.md §1.6](product.md#16-non-goals)).
- linux/arm/v7 images for 32-bit Raspberry Pi systems, built on
  `gcr.io/distroless/static-debian12` for that platform only, because `dhi.io/static` has none
  ([technical-stack/build-packaging.md §2](technical-stack/build-packaging.md#2-platforms)).

**Out of scope:** multi-server selection, public-internet hosting, native mobile or desktop clients,
and telemetry of any kind ([product.md §1.6](product.md#16-non-goals)).

**Open**, each with the answer the specification currently relies on:

- **The `/nq/upload` drain limit** (`compat.networkquality.max_upload_bytes`): 1 GiB, to confirm
  against `networkQuality` and `goresponsiveness` on a 10 Gbit LAN
  ([compatibility.md §3.1](compatibility.md#31-routes)).
- **The slow-link budgets** of [measurement.md §19](measurement.md#19-worked-timelines): to confirm
  on the harness floor profiles; if they show low confidence there, consider sizing an added
  stream's first request down.
- **Where a path B probe waits on a loaded HTTP/2 connection through Caddy** (about 300 to 340 ms
  per probe on `ci-100m-50ms-caddy-h2`): not investigated; the value is reported as measured
  ([measurement.md §12.3](measurement.md#123-path-b-procedure)).
- **Whether an upload's path B starts before the engine learns the warm-up end**: today it starts
  at the learned warm-up end, so a run that learns it late has few samples or none. Decide before
  the first release whether to probe from the first request and keep only the probes sent after
  the warm-up end, or to keep §12.3 and accept that failure mode
  ([measurement.md §12.3](measurement.md#123-path-b-procedure)).
