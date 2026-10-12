# BitGauge Documentation

Two documentation trees with distinct ownership, plus one for running the project and one for the
prior art behind the design:

| Tree | Owns | Authority |
| --- | --- | --- |
| [`features/`](features/README.md) | Product spec, measurement methodology, wire protocol, compatibility, architecture, technical stack, security model, UI behaviour, roadmap | Product and technical contract. Technical decisions are **locked** in [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md); that file wins over any summary elsewhere. |
| [`design_system/`](design_system/README.md) | Brand, tokens, component contracts, UI kits, previews | Visual contract from the Claude Design export. The first export, the prototype boards, has landed; where it disagrees with `features/ui/` on behaviour, the spec wins. The export is never hand-edited. |
| [`engineering/`](engineering/README.md) | How the project is run rather than what it does: harness runbooks, checklists, audits | Working notes, not a contract. Nothing here constrains the product. |
| [`research/`](research/README.md) | How other speed tests work and which ideas BitGauge takes | Background, ideas only. Where it disagrees with `features/`, `features/` wins. |

Implementation progress per feature area: [`STATUS.md`](STATUS.md). How releases are made:
[`release.md`](release.md).

## Symlink Contract

`design_system/` mirrors the Claude Design project, whose uploads include the product-spec files
the design is drawn from. Once an export carries those files, identical to the spec, they live
physically under `design_system/features/` and are **symlinked** into `features/`:

- `features/product.md` → `design_system/features/product.md`
- `features/principles.md` → `design_system/features/principles.md`
- `features/ui/` → `design_system/features/ui/`

Editing via either path then edits the same file. Windows checkouts need
`git config core.symlinks true`. The first export (the prototype boards) has no such mirror, so
these files are still ordinary files under `features/` and no symlinks exist; the activation steps
and their preconditions are in
[`design_system/README.md`](design_system/README.md#symlink-activation).

## Reading Order

1. [`features/summary.md`](features/summary.md): the TL;DR.
2. [`features/product.md`](features/product.md): what BitGauge is, and is not.
3. [`features/principles.md`](features/principles.md): guiding principles, including the core
   invariant: the server never stores a result and never calls out.
4. [`features/glossary.md`](features/glossary.md): the terms every other page uses.
5. [`features/measurement.md`](features/measurement.md): how every number is produced.
6. [`features/architecture.md`](features/architecture.md): the single binary, the Worker engine and
   the data flow.
7. [`features/technical-stack/decisions.md`](features/technical-stack/decisions.md): locked
   technical decisions.
8. [`STATUS.md`](STATUS.md): what is built and what is only specified.
9. [`design_system/README.md`](design_system/README.md): visual language, when touching UI.
