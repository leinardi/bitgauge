# Share panel

Result detail rail; the same content in ShareDialog from the save bar. Spec:
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
- The image carries every qualifier the result has (partial, low confidence, insufficient data).
