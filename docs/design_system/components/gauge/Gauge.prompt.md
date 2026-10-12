The live speed gauge — the Test screen's hero. Read components/gauge.md before changing behaviour.

```jsx
<Gauge value={612e6} bandLo={580e6} bandHi={640e6} peak={640e6} eyebrow="Download" eyebrowIcon="arrow-down" readout="612" unit="Mbit/s" sub="log scale · 1 Mbit/s – 10 Gbit/s · auto" />
<Gauge mode="ms" value={3.1} color="var(--series-latency)" eyebrow="Latency" eyebrowIcon="activity" readout="3.1" unit="ms" />
```

- Always place on a `--surface-2` card (`Card`): the track is `--surface-3`, which equals `--bg-base` in light theme.
- Rate windows shift one decade after a 2 s hold (280 ms); the engine supplies lo/hi.
