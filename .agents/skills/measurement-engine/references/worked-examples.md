# Worked Examples A and B — Verbatim

Copied from measurement.md
[§7.7](../../../../docs/features/measurement.md#77-worked-example-a--two-overlapping-streams-with-non-aligned-starts)
and
[§7.8](../../../../docs/features/measurement.md#78-worked-example-b--cancellation-mid-request)
so an engine test can be written against them without leaving this skill. measurement.md is the
source: if the two disagree, measurement.md wins and this file is out of date. Only the headings
are changed; every number, step and sentence under them is the spec's own, up to "What a Scenario
Asserts".

## Example A — Two Overlapping Streams With Non-Aligned Starts (§7.7)

Server grid, cells of 100 ms (cell *k* covers `[100k, 100k + 100)` ms).

- **r1**: first byte at 1050 ms, last at 2100 ms, 64 KiB at a steady ≈ 61 KiB/s → `firstBucket` 10,
  counts ≈ [3.0, 6.1 × 10] KiB (cell 10 holds 50 ms of arrivals, cells 11–20 a full 100 ms each).
- **r2**: first byte at 1620 ms, last at 2720 ms, 64 KiB at ≈ 58 KiB/s → `firstBucket` 16,
  counts ≈ [4.7, 5.8 × 10, 1.2] KiB (cell 16 holds 80 ms, cell 27 the last 20 ms).

`S_up` per cell is the plain sum:

| Cell | Interval (ms) | r1 (KiB) | r2 (KiB) | `S_up` (KiB) | In window `[1600, 2700)` |
| --- | --- | --- | --- | --- | --- |
| 10 | 1000–1100 | 3.0 | — | 3.0 | no |
| 11 | 1100–1200 | 6.1 | — | 6.1 | no |
| 12 | 1200–1300 | 6.1 | — | 6.1 | no |
| 13 | 1300–1400 | 6.1 | — | 6.1 | no |
| 14 | 1400–1500 | 6.1 | — | 6.1 | no |
| 15 | 1500–1600 | 6.1 | — | 6.1 | no |
| 16 | 1600–1700 | 6.1 | 4.7 | 10.8 | yes |
| 17 | 1700–1800 | 6.1 | 5.8 | 11.9 | yes |
| 18 | 1800–1900 | 6.1 | 5.8 | 11.9 | yes |
| 19 | 1900–2000 | 6.1 | 5.8 | 11.9 | yes |
| 20 | 2000–2100 | 6.1 | 5.8 | 11.9 | yes |
| 21 | 2100–2200 | — | 5.8 | 5.8 | yes |
| 22 | 2200–2300 | — | 5.8 | 5.8 | yes |
| 23 | 2300–2400 | — | 5.8 | 5.8 | yes |
| 24 | 2400–2500 | — | 5.8 | 5.8 | yes |
| 25 | 2500–2600 | — | 5.8 | 5.8 | yes |
| 26 | 2600–2700 | — | 5.8 | 5.8 | yes |
| 27 | 2700–2800 | — | 1.2 | 1.2 | no |
| Sum |  | 64.0 | 63.9 | 127.9 | 93.3 over 11 cells |

If the window were `[1600, 2700)`, *W* is cells 16–26 (11 full cells) and the headline is Σ ≈ 93.3
KiB (from the unrounded counts; the rounded cells above add to 93.2) / 1.1 s ≈ 85 KiB/s ≈ 0.69
Mbit/s, read straight off the grid. A completion-based estimate, 2 × 64 KiB / 1.67 s (first byte of
r1 to last byte of r2), would say 0.63 Mbit/s, and it would move with where the completions happened
to fall.

## Example B — Cancellation Mid-Request (§7.8)

Two streams, requests of about 1 s.

- Stream 1: **r7** confirmed (`startMs` 6000, `durationMs` 1000, done on the client at t ≈ 7.15 s);
  **r9** sent at 7.15 s.
- Stream 2: **r8** confirmed (`startMs` 6400, `durationMs` 1000, done on the client at ≈ 7.55 s);
  **r10** sent at 7.55 s.
- The user stops at 7.8 s; r9 and r10 are aborted and have no telemetry.

Then:

- `lb(r9)` = max end of confirmed requests done by 7.15 s = r7's end = 7000 (r8 finished later on
  the client, so it does not qualify).
- `lb(r10)` = max(r7 end 7000, r8 end 7400) = 7400.
- `C = min(7000, 7400) = 7000`; `M_end = 7400`; `W_end_final = min(7000, 7400) = 7000`.

Confirmed cells end at server time 7000 ms. r8's cells from 7000 to 7400 are known, but they sit
after `W_end` because r9 might have been active there, so they are excluded. The window is the full
cells inside `[warm-up end, 7000)`; the result is `partial` and the UI says "stopped early, upload
based on the first 7.0 s".

Had the phase instead ended cleanly (r9 and r10 confirmed, say ending at 8200 and 8600), *U* would
be empty, `M_end = 8600`, `W_end_final = 8600`, and the window would be every full cell up to 8600.

## What a Scenario Asserts

[testing.md §2](../../../../docs/features/technical-stack/testing.md#2-engine-tests-with-synthetic-timelines)
requires both examples to be "reproduced exactly":

- **Example A** (overlapping upload histograms): cells 10–27, 93.3 KiB over 11 cells, 0.69 Mbit/s,
  plus random overlaps checked against a brute-force reference.
- **Example B** (cancel mid-request with the watermark rule): `C = 7000`, `W_end_final = 7000`,
  `partial`.

Example A's 93.3 KiB comes from the unrounded counts; the rounded table cells add to 93.2. A test
that feeds the table's one-decimal values gets 93.2, so feed counts generated from the two steady
rates the example states, not the rounded table.
