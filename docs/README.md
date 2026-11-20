# BitGauge Documentation

Two documentation trees with distinct ownership, plus one for running the project and one for the
prior art behind the design:

| Tree | Owns | Authority |
| --- | --- | --- |
| [`features/`](features/README.md) | Product spec, measurement methodology, wire protocol, compatibility, architecture, technical stack, security model, UI behavior, roadmap | Product and technical contract. Technical decisions are **locked** in [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md); that file wins over any summary elsewhere. |
| [`design_system/`](design_system/README.md) | Brand, tokens, component contracts, UI kits, previews | Visual contract from the Claude Design export, including the `ui_kits/app/` prototype. Where it disagrees with `features/ui/` on behavior, the spec wins. The export is never hand-edited ([Design Export](#design-export)). |
| [`engineering/`](engineering/README.md) | How the project is run rather than what it does: harness runbooks, checklists, audits | Working notes, not a contract. Nothing here constrains the product. |
| [`research/`](research/README.md) | How other speed tests work and which ideas BitGauge takes | Background, ideas only. Where it disagrees with `features/`, `features/` wins. |

How releases are made: [`release.md`](release.md). The record of the port from Go to Rust:
[`rust-port.md`](rust-port.md).

## Design Export

`design_system/` is the Claude Design export, copied in unchanged. Its own
[`README.md`](design_system/README.md) and `SKILL.md` describe the design system; the rules for
keeping it in this repository live here, because every file in that tree is overwritten by the next
export.

### Provenance Rule

**Never hand-edit files under `design_system/`.** The tree is regenerated from the Claude Design
project on every export, so a local edit is silently lost on the next sync. A change goes into the
Claude Design project first and arrives here with the next export. The export carries no spec
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

### Syncing a New Export

1. Replace `design_system/` with the export.
2. Check that every relative link in `docs/` still resolves (`pre-commit run lychee --all-files`), then
   commit the export.

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
7. [`design_system/README.md`](design_system/README.md): visual language, when touching UI.
