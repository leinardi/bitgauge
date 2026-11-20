# BitGauge Documentation

Two documentation trees with distinct ownership, plus one for running the project and one for the
prior art behind the design. The visual contract is the design export
([Design Export](#design-export)).

| Tree | Owns | Authority |
| --- | --- | --- |
| [`features/`](features/README.md) | Product spec, measurement methodology, wire protocol, compatibility, architecture, technical stack, security model, UI behavior, roadmap | Product and technical contract. Technical decisions are **locked** in [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md); that file wins over any summary elsewhere. |
| [`engineering/`](engineering/README.md) | How the project is run rather than what it does: harness runbooks, checklists, audits | Working notes, not a contract. Nothing here constrains the product. |
| [`research/`](research/README.md) | How other speed tests work and which ideas BitGauge takes | Background, ideas only. Where it disagrees with `features/`, `features/` wins. |

How releases are made: [`release.md`](release.md). The record of the port from Go to Rust:
[`rust-port.md`](rust-port.md).

## Design Export

The visual contract comes from the Claude Design export: brand, tokens, component contracts and
the `ui_kits/app/` prototype. The export is not in the repository for now: Claude Design is moving
to artifacts, and the next export is imported when it is available. Until then:

- The files the web app ships from the last export are vendored unchanged in `web/design/`:
  `colors_and_type.css`, `base.css` and `assets/` (fonts, icons, web manifest)
  ([frontend.md §8](features/technical-stack/frontend.md#8-theming-hook)).
- The tooling that read the rest of it is disabled: the demo parity harness
  ([runbook](engineering/demo-parity.md)) and the `design-system-guard`, `demo-parity` and
  `parity-triage` skills, kept in `.agents/skills-disabled/`.
- Changes the export still needs are written down in
  [`engineering/design-system-upstream.md`](engineering/design-system-upstream.md).

### Provenance Rule

**Never hand-edit the export or the files vendored from it in `web/design/`.** A change goes into
the Claude Design project first and arrives here with the next export. The export carries no spec
pages: the product spec lives only in [`features/`](features/README.md).

### Precedence

- **Visuals:** the export is canonical for how things look: color, type, spacing, iconography,
  motion and layout details.
- **Behavior:** [`features/ui/`](features/ui/README.md) is canonical for what each screen
  contains, which states it has and what each flow does; the numbers' meaning is in
  [`features/measurement.md`](features/measurement.md).
- **Conflicts:** when the export disagrees with the UI spec on behavior, the disagreement is
  resolved in the spec first and then implemented. Technical decisions in
  [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md) win over both.
- **Accessibility:** the export must meet the contrast and focus requirements of
  [`features/ui/i18n-a11y.md`](features/ui/i18n-a11y.md); a token that fails them is fixed in
  Claude Design, not overridden in code.

### Importing a New Export

1. Copy the export to `design_system/` and refresh `web/design/` from it, or point the build back
   at it.
2. Move the three skills back to `.agents/skills/` and check the parity harness against the new
   kit.
3. Check that every relative link in `docs/` still resolves (`pre-commit run lychee --all-files`),
   then commit the export.

## Reading Order

1. [`features/product.md`](features/product.md): what BitGauge is, and is not.
2. [`features/principles.md`](features/principles.md): guiding principles, including the core
   invariant: the server never stores a result and never calls out.
3. [`features/glossary.md`](features/glossary.md): the terms every other page uses.
4. [`features/measurement.md`](features/measurement.md): how every number is produced.
5. [`features/architecture.md`](features/architecture.md): the single binary, the Worker engine and
   the data flow.
6. [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md): locked
   technical decisions.
7. [Design Export](#design-export): where the visual language comes from, when touching UI.
