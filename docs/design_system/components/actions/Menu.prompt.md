Menu button with a popup of choices (context label picker) or actions (row menu).

```jsx
<Menu label="Context" value="LAN" icon="house" hint="suggested" selected="LAN"
  options={[{ value: 'LAN', label: 'LAN', icon: 'house' }, { value: 'VPN', label: 'VPN', icon: 'shield' }]}
  onSelect={setCtx} />
```

- Trigger name is "<label>: <value>[, <hint>]" — never just the visible value.
