Metric tile for download, upload, latency, jitter — the number always ships with its qualifier.

```jsx
<MetricTile label="Download" value="612" unit="Mbit/s" note="peak 640 Mbit/s" accent="var(--series-download)" />
<MetricTile label="Upload" value="8.9" unit="Mbit/s" state="partial" />
<MetricTile label="Jitter" state="empty" />
<MetricTile label="Download" state="error" note="error · connection lost" />
```

`error`, `incomplete` and `insufficient-data` always render "—", even if `value` is passed.
