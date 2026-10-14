The live speed gauge — the Test screen's hero. Read components/gauge.md before changing behaviour.

```jsx
<Gauge value={612e6} bandLo={580e6} bandHi={640e6} peak={640e6} eyebrow="Download" eyebrowIcon="arrow-down" readout="612" unit="Mbit/s" note="avg so far 598 · peak 612" />
<Gauge units="bytes" value={76.5e6} eyebrow="Download" eyebrowIcon="arrow-down" readout="76.5" unit="MB/s" />
<Gauge mode="ms" value={3.1} color="var(--series-latency)" eyebrow="Latency" eyebrowIcon="activity" readout="3.1" unit="ms" note="median 3.1 · ping 12 of 20" />
<Gauge state="countdown" countdownLeft={2.4} eyebrow="Auto-start in" eyebrowIcon="timer" unit={['second', 'seconds']} note="Esc cancels" />
<Gauge state="offline" icon="server-off" title="Server unreachable" message="speed.home.lan didn't respond." action={<Button size="sm" icon="refresh-cw">Retry</Button>} />
<Gauge state="cancelled" value={612e6} icon="circle-minus" title="Cancelled" message="Partial results · not saved" />
```

- Always place on a `--surface-2` card: the track is `--surface-3`, which equals `--bg-base` in light theme.
- Pass gauge values only. The component picks and shifts the window itself and renders the caption naming it.
- To start the second direction where the first ended, pass the first direction's final k as `startDecade`.
- `compact` for the narrow layout (272 px, 46 px readout). Never pass font sizes.
