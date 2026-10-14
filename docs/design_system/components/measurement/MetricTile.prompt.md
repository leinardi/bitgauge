Metric tile for download, upload, latency, jitter — the number always ships with its qualifier.

```jsx
<MetricTile label="Download" icon="arrow-down" accent="var(--series-download)" value="612" unit="Mbit/s" note="peak 641 · 6 streams" />
<MetricTile label="Download" icon="arrow-down" accent="var(--series-download)" state="warming-up" />
<MetricTile label="Upload" icon="arrow-up" accent="var(--series-upload)" value="402" unit="Mbit/s" state="partial" tag="Partial — stopped early" note="based on a 3.6 s steady window · 21 requests" />
<MetricTile label="Download" icon="arrow-down" accent="var(--series-download)" state="error" note="error · connection lost" />
<MetricTile label="Jitter" icon="activity" accent="var(--series-latency)" state="empty" />
```

`error`, `insufficient-data`, `skipped` and `warming-up` never render a number, even if `value` is passed.
