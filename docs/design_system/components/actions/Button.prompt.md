Verb-first action button ("Start test", "Run again", "Download JSON") — primary for the one main action per view.

```jsx
<Button variant="primary" size="lg" icon="play">Start test</Button>
<Button icon="download">Download JSON</Button>
<Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" />
<Button variant="secondary" size="sm" iconAfter="chevron-right">Details</Button>
<Button variant="primary" disabled disabledReason="Server unreachable">Start test</Button>
<Button href="/docs" icon="external-link">Deployment docs</Button>
```

- Variants: primary, secondary, ghost, danger (outline), danger-solid (destructive confirm).
- Sizes: sm 28, md 34, lg 38, xl 46 (Start/Stop; use `StartButton`). `touch` lifts targets to ≥ 44 px on compact layouts.
- `kbd` is decorative and never part of the accessible name (`aria-keyshortcuts` carries it).
- `disabledReason` keeps the button focusable and explains why — BitGauge never disables silently.
- Do not restyle a Button with `style`; add a variant here instead.
