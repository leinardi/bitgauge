Inline notice for run conditions ("Low confidence result", "Server unreachable") — see components/notices.md.

```jsx
<Notice tone="danger" icon="wifi-off" title="Server unreachable" actions={<Button size="sm">Retry</Button>}>
  speed.home.lan didn't answer. Check the VPN, then retry.
</Notice>
```
