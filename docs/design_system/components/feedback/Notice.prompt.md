Inline notice for run conditions ("Low confidence result", "Server unreachable") — see components/notices.md.

```jsx
<Notice tone="danger" icon="wifi-off" title="Server unreachable" actions={<Button size="sm" icon="refresh-cw">Retry</Button>}>
  speed.home.lan didn't answer. Check the VPN, then retry.
</Notice>
<Notice tone="neutral" title="Test cancelled during download">Latency completed. Upload did not run.</Notice>
<Notice icon="globe" title="Firefox may limit the upload" actions={<Link external href="#">Known browser limits</Link>}>…</Notice>
```
