A phase row (latency → download → upload) with its state and progress; stack 1–3 for the phase indicator.

```jsx
<PhaseStep phase="latency" state="done" detail="3.1 ms" />
<PhaseStep phase="download" state="active" progress={0.62} detail="4.6 s left" />
<PhaseStep phase="upload" state="pending" detail="~15–25 s" />
```
