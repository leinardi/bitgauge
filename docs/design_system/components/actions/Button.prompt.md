Verb-first action button ("Start test", "Run again", "Download JSON") — primary for the one main action per view.

```jsx
<Button variant="primary" size="lg" icon="play" kbd="Enter">Start test</Button>
<Button icon="download">Download JSON</Button>
<Button variant="primary" disabled disabledReason="Server unreachable">Start test</Button>
```

- Variants: primary, secondary, ghost, danger (outline), danger-solid (destructive confirm).
- `disabledReason` keeps the button focusable and explains why — BitGauge never disables silently.
