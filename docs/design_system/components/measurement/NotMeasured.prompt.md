Packet-loss placeholder — dashed "Not measured" badge with a "Why?" link. In a MetaList row the badge is the value
and the reason is the visible `sub` line, followed by the link (a tooltip is not seen on touch).

```jsx
<MetaList rows={[{ icon: 'signal', label: 'Packet loss', node: <NotMeasured link={false} />,
  sub: <>{NOT_MEASURED_REASON}<NotMeasuredWhy /></> }]} />
```
