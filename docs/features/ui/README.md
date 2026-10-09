# UI

[Feature index](../README.md) / UI

## Scope

This section specifies **what the UI shows and does**: the screens, the elements and states of each
screen, the user flows, the URL parameters, and the i18n and accessibility requirements. It does
**not** author visual design: layout details, colours, typography, spacing, iconography and
illustrations come from the Claude Design export that will land in
[../../design_system/README.md](../../design_system/README.md).

## Source of Truth

- **Behaviour:** these pages are canonical for what each screen contains, which states it has, and
  what happens in each flow. The measurement semantics behind every number are in
  [../measurement.md](../measurement.md).
- **Visuals:** the design export is canonical for how things look. A prototype is being produced in
  parallel and is **pending**; until it lands, the implementation uses shadcn-vue defaults and no
  hand-authored visual design.
- When the export lands and disagrees with a page here on behaviour, the disagreement is resolved
  in these pages first, then implemented.

## Screen Hierarchy

```text
BitGauge SPA (base path)
├─ Test (home)                 /
│  ├─ connection info, start/stop, phase indicator
│  ├─ live gauge + live chart
│  └─ result summary + notices ─────────▶ Result detail
├─ Result detail               /result/{id}
├─ History                     /history
│  ├─ list, filters, trend chart
│  └─ compare two results
├─ Settings                    /settings
└─ Other clients / About       /about
```

The routes are the SPA's fixed route list ([../compatibility.md
§1.5](../compatibility.md#15-route-clash-analysis)). A persistent navigation (Test, History,
Settings, About) is available on every screen.

## Sections

- [Screens](screens.md): the five screens with elements, states and notices.
- [Flows](flows.md): the nine user flows as numbered steps.
- [URL parameters](url-params.md): the clean parameter set and the OpenSpeedTest mapping.
- [i18n and accessibility](i18n-a11y.md).

## Related

- [Measurement methodology](../measurement.md)
- [Frontend design](../technical-stack/frontend.md)
- [Design system](../../design_system/README.md)
- [Edge cases](../edge-cases.md)
