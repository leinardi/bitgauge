Keycap hint for keyboard shortcuts. Decorative — put `aria-keyshortcuts` on the control it belongs
to. Inside Button, use the `kbd` prop instead.

```jsx
<Kbd keys="Esc" />
<Kbd keys={['/', 'Ctrl+K']} />
```
