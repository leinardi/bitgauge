# BitGauge Feature Specification

BitGauge is a self-hosted, browser-based network speed test for LAN, homelab and VPN links, from
well under 1 Mbit/s on mobile over VPN up to multi-Gbit LAN.

This feature specification is split by topic so each area can evolve independently while still
linking back to the same product constraints. Terms used across all pages are defined once in the
[glossary](glossary.md).

Implementation progress per feature area is tracked in [`../STATUS.md`](../STATUS.md). The
specification was approved by the maintainer on 2026-10-12 and v0.1 is implemented, not yet
released: the approved specification is the contract, and a behavior change still starts as a
docs change.

## Start Here

- [Summary — TL;DR](summary.md)
- [Product identity](product.md)
- [Guiding principles](principles.md)
- [Glossary](glossary.md)
- [Architecture](architecture.md)
- [Security model](security.md)
- [Roadmap](roadmap.md)
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

- [Implementation status](../STATUS.md)
- [Roadmap / MVP](roadmap.md)
- [Technical stack](technical-stack/README.md)
- [Technical decisions (locked + open)](technical-stack/decisions.md)
- [Wire protocol — native HTTP API](wire-protocol.md)
- [Open questions](open-questions.md)

## Core Invariant

**The server never stores a result and never calls out.**

BitGauge's server streams bytes, drains bytes, echoes pings and describes itself. Every measured
number is computed in the browser and kept only in the browser. The server holds no database,
writes nothing to disk, keeps no state that outlives a request beyond ephemeral counters, and makes
no outbound network connection of any kind. Any feature that would break either half of this
invariant is out of scope, however convenient.
