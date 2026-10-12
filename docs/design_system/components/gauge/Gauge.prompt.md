The live speed gauge — the Test screen's hero. Read components/gauge.md before changing behaviour.

```jsx
<Gauge value={612e6} bandLo={580e6} bandHi={640e6} peak={640e6} eyebrow="Download" eyebrowIcon="arrow-down" readout="612" unit="Mbit/s" />
<Gauge units="bytes" value={76.5e6} eyebrow="Download" eyebrowIcon="arrow-down" readout="76.5" unit="MB/s" />
<Gauge mode="ms" value={3.1} color="var(--series-latency)" eyebrow="Latency" eyebrowIcon="activity" readout="3.1" unit="ms" />
```

- Always place on a `--surface-2` card (`Card`): the track is `--surface-3`, which equals `--bg-base` in light theme.
- Pass gauge values only. The component picks and shifts the window itself (one decade after a 2 s hold) and renders the caption naming it; the engine never supplies a window.
- Bytes mode: `value` is in B/s and the byte windows apply (start 100 kB/s – 1 GB/s).
- To start the second direction where the first ended, keep the k from `onWindowChange` and pass it as `startDecade`; reset between runs.
- The readout text is the accessible value; the dial is `aria-hidden`. No transition under `prefers-reduced-motion`.
