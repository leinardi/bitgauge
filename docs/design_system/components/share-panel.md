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
- The image carries every qualifier the result has (partial, low confidence, insufficient data).
