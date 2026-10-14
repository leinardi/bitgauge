Live / per-phase throughput chart with warm-up band, phase separators, event marks and a summary label.

```jsx
<Chart title="Throughput" meta="7.5 s / 10 s" summary="Throughput, download 590 Mbit/s so far, 7.5 of 10 seconds; warm-up shaded"
  legend={[{ label: 'Download', color: 'var(--series-download)' }, { label: 'Latency under load', color: 'var(--series-latency)', dashed: true }]}
  data={{ xMax: 10, series: [{ pts, color: 'var(--series-download)' }], lat, now: 7.5, bands: [{ t0: 0, t1: 6.5 }] }} />
```

- `summary` is required and must describe the data, not repeat the title.
- Format numbers with `Format` (same namespace).
