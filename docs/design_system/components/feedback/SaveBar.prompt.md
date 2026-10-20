Result status bar under the Test screen's instrument card — saved / unsaved / kept / complete.

```jsx
<SaveBar status="saved" title="Saved to history" time="14:02:11"
  label={{ value: label, onChange: e => setLabel(e.target.value), suggestions: ['LAN', 'Home Wi-Fi'] }}
  actions={<><Button variant="ghost" size="sm" icon="share-2">Share</Button><Button variant="secondary" size="sm" iconAfter="chevron-right">Details</Button></>} />
<SaveBar status="unsaved" title="Partial results are not saved" actions={<Button size="sm" icon="history">Keep in history</Button>} />
```
