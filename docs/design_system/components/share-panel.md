# Share panel

Result detail rail; the same content in ShareDialog (`Dialog` wide, from the save bar). The image preview is
the `SharePreview` component; the summary preview is a `Snippet`. Spec:
`features/ui/screens.md` §2, `features/ui/flows.md` §8.

## Anatomy

- **Share image preview:** 1200×630 PNG from `<canvas>`, always rendered in the dark theme.
- **Summary preview:** `<pre>` on `--term-bg` showing **exactly** the text that gets copied.
- "Include label" option, **off by default**.
- Actions: Download image, Copy summary and, where the Web Share API is available, Share.

## Rules

- Previews show exactly what each output contains (see `features/ui/flows.md` §8).
- Always visible beside the metrics on desktop; follows the charts on mobile.
- Toasts confirm: "Image downloaded.", "Summary copied."
- **Clipboard denied:** if the browser refuses the clipboard write, no "copied" toast appears.
  The summary `<pre>` gets focus with its whole text shown selected, so the user can copy it with
  the keyboard or the context menu.
- The image carries every qualifier the result has; where each goes is fixed in "Share image layout" below.

## Share image layout

The image is one geometry at two scales. It is laid out on a **480 × 252 reference box** (`--share-w`, `--share-h`)
with the card-scale tokens below; the PNG is that box at `--share-scale` **2.5**, so 1200 × 630. `SharePreview`
renders the same box and scales it to its frame (fluid in the share panel, exact 1200 × 630 with `size="full"`), so
the preview is the image at every panel width. Every image value = card value × 2.5. States sheet:
`preview/share-image-states.html`.

### Regions

Vertically the box is three bands: the compact header on the top padding, the foot on the bottom padding, and the
**middle band** between them. The middle band holds one **group**: the block grid (label row, number row, qualifier
stacks) and the grade. The group is centred in the middle band of **this image**, so where it sits depends on the
image's own content (its tallest qualifier stack, its grade, its foot lines), not on the worst case.

| Region | Position (card → image) | Holds |
| --- | --- | --- |
| Box | 480 × 252 → 1200 × 630; `--bg-base` (dark); padding `--share-pad-y` 14 → 35, `--share-pad-x` 16 → 40; content 448 × 224 → 1120 × 560 | — |
| Header | top band: y 14–34 → 35–85 (`--share-header-h` 20 → 50), full content width | Wordmark (`Logo` 20 → 50, wordmark); the label, right-aligned, only when "include label" is ticked |
| Middle band | from the header's bottom to the foot's top, padded `--share-gap-min` 10 → 25 at top and bottom; the group is centred in it vertically | The group |
| Number blocks | in the group, left 16 → 40; two columns `--share-block-w` 148 → 370, gap `--space-3-5` 14 → 35 (x 16–164 and 178–326 → 40–410 and 445–815) | One block per direction in the run's phases, in phase order: block label, number + unit, qualifier stack |
| Grade | in the group, on the **number row**: third column, right-aligned at the right edge (ends x 464 → 1160), ≥ 14 → 35 from the second block; vertically centred on the number row | Grade tile (`--share-grade-size` 42 → 105, the number row's height), then the words **beside** it: first word, "bufferbloat", and the basis when it is one direction (≤ 3 lines, 39 → 97.5, within the row) |
| Foot | bottom band: on the bottom padding (bottom 14 → 35), full content width; wraps upward | Idle latency, jitter, loaded-latency increase; then server name · date and time, right-aligned |

**Group rows** (heights, not positions): label row `--share-label-h` 14 → 35; gap `--space-0-75` 3 → 7.5; number
row `--type-share-value` 42 → 105 at line-height 1; gap `--space-0-75` + `--space-0-5` 5 → 12.5; qualifier row
(auto, 0–5 lines of 13 → 32.5). The grade sits in the number row and never makes it taller.
Group height = 14 + 3 + 42 + (stack ? 5 + 13 × lines : 0) → × 2.5.

**Widest row:** a four-character value plus the longest unit ("9.41 Gbit/s") is 101 + 4 + ≈ 41 = ≈ 146 → 365 of the
148 → 370 column. Two such blocks (148 + 14 + 148) + 14 + grade (tile 42 + 6 + words ≤ 62, "download only") = 434 → 1085
of the 448 → 1120 content width. Rates have 3 significant digits, so no value is longer than four characters.

### Type roles

| Element | Card → image | Font |
| --- | --- | --- |
| Block label ("↓ DOWNLOAD") | `--type-share-label` 12 → 30, line `--share-label-h` | `--font-cond`, semibold, caps tracking, series colour |
| Number | `--type-share-value` 42 → 105, line-height 1 | `--font-mono`, medium, `--fg`; "—" in `--fg-subtle` |
| Unit | `--type-share-unit` 15 → 37.5, `--space-1` 4 → 10 after the number, on its baseline | `--font-sans`, `--fg-muted` |
| Qualifier line | `--type-share-qual` 10 → 25, `--lh-snug` (13 → 32.5 per line) | `--font-mono`; tone: insufficient data, low confidence, CPU-bound `--warn-fg`; error `--danger-fg`; partial, skipped, overhead `--fg-muted` |
| Grade letter | tile `--share-grade-size` 42 → 105, `--radius-md`; letter `--type-share-grade` 24 → 60 | grade tone (A+–B ok, C–D warn, F danger) |
| Grade words | `--type-share-meta` 10 → 25, `--lh-snug`, `--space-1-5` 6 → 15 beside the tile, left-aligned | `--font-sans`; first word bold `--fg`, "bufferbloat" and basis `--fg-subtle` |
| Header label | `--type-share-head` 11 → 27.5 | `--font-mono`, `--fg-subtle` |
| Foot | `--type-share-meta` 10 → 25, `--lh-snug` | `--font-mono`; items `--fg-muted`, server · date `--fg-subtle` |

### Rules

- **One baseline per image.** Within an image, all numbers sit in one grid row of fixed height
  (`--type-share-value`, line-height 1), so both numbers share one baseline whatever qualifiers either direction has.
  The row's height on the image is set per image: the group is centred in the middle band, so an image with no
  qualifiers places it higher than one with a 5-line stack. Images are seen on their own; the numbers do not sit at
  the same y across states. Qualifiers grow the group downward from the number row; the foot grows upward from the
  bottom padding; centring then splits the remaining space evenly above and below the group.
- **Never overlapping.** The middle band keeps `--share-gap-min` 10 → 25 between the group and the header and
  between the group and the foot. The limits below make the worst group fit the worst middle band, so centring never
  pushes the group into either one.
- **Fixed columns.** Block columns have a fixed width; column 1 is the first direction in the run's phases. A
  missing block, a "—" or a short number never moves the other block. The grade column is pinned to the right edge.
- **Qualifier placement (one rule everywhere): a qualifier sits with the number it qualifies.** For the rates that is
  the block's qualifier stack, one entry per qualifier, in this order:
  1. **Direction status** other than measured: `partial`, `insufficient data`, `skipped`, `error`.
  2. **Confidence** other than normal: `low confidence: <reasons>` (`ramp unsettled`, `insufficient samples`,
     `unstable`, comma-separated) or `limited by this device’s CPU` (CPU-bound).
  3. **Overhead compensation** when non-zero: `+p % overhead compensation`, under every compensated number.

  Confidence and overhead qualify a number, so they appear only on a block that has one. An entry wraps inside its
  column. The loaded-latency increase (a foot item) is followed, in parentheses, by: the direction the increase is
  from; a source other than the WebSocket (`HTTP/2 probe`, `HTTP/3 probe`, `HTTP/1.1 reserved`); and, when idle
  latency ran on the other path (`loadedLatency.idleSource`), `vs idle over WebSocket` or `vs idle over HTTP` —
  `+41 ms under load (upload, HTTP/2 probe, vs idle over WebSocket)`. Only the worse direction's source is named.
  The grade's basis follows the grade words: `download only`, `upload only`.
- **Space budget (bounds the worst case; nothing is reserved).** A column holds 24 qualifier characters per line
  (148 ÷ 6 at `--type-share-qual`), so the longest entries take: status 1 line, `low confidence: insufficient samples,
  unstable` 2, `limited by this device’s CPU` 2, `+5.13 % overhead compensation` 2. A qualifier stack holds at most **5 lines**; the foot at most
  **3 lines** (3 × 13 + 2 × 3 = 45 → 112.5). Worst case: middle band = 252 − 28 padding − 20 header − 45 foot = 159
  (→ 397.5); minus 2 × 10 gap = 139 (→ 347.5) for the group; worst group = 14 + 3 + 42 + 5 + 5 × 13 = 129 (→ 322.5).
  It fits with 10 → 25 to spare, so the gaps to header and foot are always at least **10 → 25**.
- **Foot wrapping.** Items are never broken inside (each is one line); they wrap as whole items, gap `--space-0-75`
  3 → 7.5 between lines and `--space-3-5` 14 → 35 between items. Server · date is the last item, pushed right; when it
  does not fit it takes its own line, right-aligned. Lines are added at the top, so the last line stays on the bottom
  padding.
- **Truncation.** The header label is one line, ellipsis at the end, in the width the wordmark leaves (minus
  `--space-4-5`). The server name (`server.display_name`, 1–64 printable characters) is one line, ellipsis at the end
  past `--share-server-max` 224 → 560 (about 37 characters); the date and time are never truncated.
- **Direction did not run.** A direction not in the run's phases (`settings.phases`) has **no block**; the other block
  stays in column 1. A direction in the phases with status `skipped` (not reached) keeps its block: "—" with
  `skipped`. A Continuous result follows the same rules: one block for the direction it ran, with its headline and
  qualifiers; no peak block and no extra foot item.
- **No number.** `insufficient data`, `skipped`, `error` (and `partial` without a reported number) show "—" in
  `--fg-subtle` with no unit, and the status line under it. A result-level partial is not shown; only the direction
  status is.
- **No grade.** Without a grade (no gradable direction or no idle latency) the grade column is empty; nothing else
  moves. A foot item whose value is absent (no idle latency, no increase) is left out; the image does not say
  "not graded" or "no idle latency".
- **Never** shown: the client IP, the note, the browser, the server URL.

### SharePreview props

`blocks: [{ dir, value, unit, status, confidence }]`, `overhead`, `grade`, `basis`, `idle`, `jitter`,
`loaded: { increase, dir, source, idleSource }`, `where` (server), `when` (date and time), `head` (label), `size`.
The component words every qualifier itself, and `ShareFormat.summary(props)` builds the copied text's lines from the
same props (flows.md §8: the same lines as the image), so a caller passes result fields, not strings.
