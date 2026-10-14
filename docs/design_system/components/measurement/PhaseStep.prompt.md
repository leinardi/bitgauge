A phase row (idle latency → download → upload) with its state and progress; `PhaseIndicator` stacks 1–3 of them.

```jsx
<PhaseIndicator steps={[
  { phase: 'latency', state: 'done', detail: '3.1 ms' },
  { phase: 'download', state: 'active', progress: 0.62, detail: '4.6 s left' },
  { phase: 'upload', state: 'pending', detail: '~15–25 s' }
]} />
<PhaseStep phase="latency" state="active" label="Connecting…" detail="server info" />
```
