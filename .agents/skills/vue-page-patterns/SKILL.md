---
name: vue-page-patterns
description: >
  Frontend page and test patterns for BitGauge. Tests mock the @/api fetch helper,
  never fetch itself; production .vue/.ts files stay under 400 lines (ESLint
  max-lines); pages are thin and composable-first; the
  app imports only web/src/engine/messages.ts from the engine. Composition API with
  <script setup>, shadcn-vue defaults, no external URLs. Use when writing or editing
  anything under web/src/pages/, web/src/composables/ or web/src/components/, or a
  test that touches @/api. Vitest technique lives in vue-testing-best-practices.
---

# Vue Page Patterns — BitGauge

Four rules for the SPA. The generic Vue skills cover technique; this one covers what this codebase
does differently and why. `web/src/` holds the app, the engine, the pages, components and
composables, laid out as
[frontend.md §1](../../../docs/features/technical-stack/frontend.md#1-spa-layout) says, and the
rules are enforced by `web/eslint.config.ts`.

---

## 1. Mock the `@/api` helper, never `fetch`

`web/src/api/` holds the generated types and one typed fetch helper for `GET /info`. A component or
composable test that needs `/info` mocks that helper's request function. It does not stub
`globalThis.fetch`: a test that hand-writes the URL, the headers and the JSON it expects has forked
the helper's request and decoding, and stays green after the helper changes.

Spread the real module and replace only the request; anything the factory closes over goes through
`vi.hoisted`:

```ts
const mocks = vi.hoisted(() => ({ info: infoFixture() }))

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn().mockResolvedValue(mocks.info),
}))
```

Module and function names here are illustrative; use what `web/src/api/` exports. Fixtures are
typed against `components["schemas"]["Info"]` from `types.gen.ts`, so a spec change breaks them at
compile time.

The engine is different: it never calls `fetch` directly, and its tests inject a fake `Clock` and
`Transport` that replay a synthetic timeline
([testing.md §2](../../../docs/features/technical-stack/testing.md#2-engine-tests-with-synthetic-timelines)),
not `vi.mock`.

## 2. A file has a line budget

ESLint's `max-lines` (`web/eslint.config.ts`) holds every `.vue` and `.ts` file under `web/src`
to **400** lines. Out of scope: `web/src/api/types.gen.ts`, `web/src/components/ui/` (shadcn-vue,
copied by its CLI), `web/src/test/`, and every `*.test.ts` and `*.spec.ts`.

When a page will not fit, that is the design telling you which of §3's pieces it is hiding.

## 3. Pages are thin, composables first

Pages orchestrate data and layout; components render; composables hold stateful UI logic; `api/`
talks to the server; `engine/` measures, and nothing else does.

| Concern | Where it goes | Examples |
| --- | --- | --- |
| A running test's live view, settings, history, sharing | `web/src/composables/` | `useRun`, `useUrlParams`, `useCountdown`, `useSettings`, `useHistory`, `useShare` |
| A block of the screen with its own markup | `web/src/components/` | gauge, chart, tiles, notices |
| Route parameters, layout, which sections exist | the page | `TestPage`, `AboutPage`, `ResultDetailPage`, `HistoryPage`, `SettingsPage` |
| IndexedDB, export and import | `web/src/history/` | `idb` database (`db.ts`), migrations (`migrate.ts`) |

- No store library: composables with module-level reactive state are enough for five screens
  ([frontend.md §4](../../../docs/features/technical-stack/frontend.md#4-state-ownership)).
- A composable is testable without a page, and a shared flow behaves the same everywhere by
  construction. The page stays readable as a list of sections, which keeps §2's budget achievable.
- Before writing a composable, search `web/src/composables/` for one that already answers the
  question, by behaviour, not by the name you were about to give it.

## 4. The app imports only `engine/messages.ts`

`web/eslint.config.ts` enforces the engine boundary in both directions
([frontend.md §2](../../../docs/features/technical-stack/frontend.md#2-engine-package-rules)):

- Application code may import `@/engine/messages` and nothing else under `engine/`. It starts the
  Worker by URL, `new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })`,
  which is not an import.
- The engine imports only from itself and `@/api/types.gen`: no Vue, Reka UI, `idb` or uPlot, and no
  `../` out of its folder. Outside `clock.ts`, `transport.ts` and `worker.ts` it may not touch
  timers, `performance`, `fetch`, `WebSocket`, the DOM or storage.
- A page never computes a measured number; it renders what the engine's `result` and `sample`
  events carry.

---

## Standing constraints

- Composition API with `<script setup>` only; no class components, no Nuxt, no SSR, no TanStack
  Query.
- Visuals come from the design export (`design-system-guard`), shadcn-vue defaults where it says
  nothing, and no hand-authored visual design.
- No external URL anywhere: fonts, icons and scripts are embedded, and the CSP allows only the
  page's own origin.
- Text goes through vue-i18n's central catalog: no raw template text, no `<i18n>` blocks, no
  dynamic keys (ESLint).

## Checklist

- [ ] Tests mock the `@/api` request function with the real module spread; no `fetch` stub
- [ ] Every production file under the 400-line ceiling
- [ ] Page holds route, layout and sections; logic lives in composables
- [ ] Searched for an existing composable before adding one
- [ ] App imports only `@/engine/messages` from the engine
- [ ] `<script setup>`, shadcn-vue defaults, no external URL
- [ ] `make verify-web` clean; fix and re-run until it is
