---
name: Bug report
about: Report a bug, a wrong measurement or unexpected behavior
title: "[Bug]: "
labels: ["bug"]
assignees: []
---
## Step 1: Are you in the right place?

- [ ] I have checked that there are no duplicate active or recent issues (bugs, questions, or
  feature requests) describing this problem.
- [ ] I am using the latest released version of BitGauge (or have tested on the default branch).
- [ ] This is not a security vulnerability (those go through the private process in SECURITY.md).

## Step 2: Describe your setup

- BitGauge version (shown on the About screen): `?`
- Deployment (image tag or digest, or binary): `?`
- Browser and version: `?`
- Operating system and device: `?`
- Link type (LAN / Wi-Fi / VPN / cellular): `?`
- Reverse proxy name and version, if any: `?`
- Protocol shown in the result (h1 / h2 / h3): `?`
- Base path, if not `/`: `?`
- Preset and settings: `?`
- Compatibility layer used, if any (OpenSpeedTest, LibreSpeed, `networkQuality`): `?`

## Step 3: Describe the problem

### Steps to reproduce

1. ---
2. ---
3. ---

### Expected result and reference measurement

<!--
What did you expect, and what does an independent measurement of the same path show (for example
iperf3 between the same two hosts)? Include the reference tool, its command and its numbers.
-->

-

### Observed result

<!-- What did BitGauge show? A description, the numbers, or an error message. -->

-

### Exported result JSON

<!--
Use Download JSON on the finished result and paste it below.
WARNING: the export contains client IP addresses and any notes you typed (docs/features/security.md
section 7). Redact them before posting; this issue is public.
-->

```json
{ "paste the redacted export here": true }
```

### Configuration

<!--
Your BitGauge configuration (file or BITGAUGE_ environment variables). It holds no secrets, but
redact hostnames you do not want to publish.
-->

```text
<paste configuration here>
```

### Server logs

<!-- If relevant, the server log at debug level (log.level: debug) around the run. -->

```text
<paste logs here>
```

<!-- Screenshots, screen recordings, or additional context are always helpful. -->
