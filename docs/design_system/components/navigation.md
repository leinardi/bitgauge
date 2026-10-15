# Navigation, menus and live regions

Components `AppHeader`, `TabBar` (`components/navigation/`), `Menu`, `Link` (`components/actions/`),
`LiveRegion` (`components/feedback/`). Spec: `features/ui/README.md` (screen hierarchy),
`features/ui/screens.md` §1 (server name, "Before v0.2"), `features/ui/i18n-a11y.md` §2.

## AppHeader

Wordmark (home link "BitGauge home") · hairline separator · server identity · primary navigation ·
theme switch (Segmented, icon-only options named Light / Dark / Follow system). Compact layout (< 1140 px
or the kit's 390 px frame): 52 px header with the wordmark, the server identity under it, and one
theme button named "Theme: <current>" that cycles light → dark → system; navigation moves to the TabBar.
The compact mark is `Logo decorative` (aria-hidden, no role or name): the visible wordmark already names the product.

**Data rules — props only, no defaults, no sample data:**

- `server` is `server.display_name` from `GET /info`. While `/info` fails it is unknown: pass `null` and
  the header shows the page's `host` with "Unreachable". It never shows a name it cannot know.
- `host` is the page's own host, always known.
- `items` is the navigation for the **version scope**, decided once by the app (not by the header, not by
  each screen): v0.1 → Test, About; v0.2+ → Test, History, Settings, About. The same items feed the TabBar.

**Accessibility:** the status dot is `aria-hidden`, with visually hidden ", connected" / ", unreachable"
after the name; a polite live region inside the header announces status **changes** only (mounting a
screen is silent). Current page: `aria-current="page"`.

## TabBar

Sticky 64 px bottom bar, `--surface-1`, one tab per scoped item, teal 2 px marker on the current tab.

## Version scope

One switch, applied everywhere from the app layer (`features/ui/screens.md` "Before v0.2", §5 "Before
v0.3"): v0.1 hides History, Settings, share, loaded latency, grade, quality scores and RPM; the settings
summary shows no Edit link; `/history`, `/settings`, `/result/{id}` render "Not available in this version";
About says the other-client layers arrive in v0.3, shows no snippets, and summarises the v0.1 metrics only.

## Menu

Menu button + popup. The trigger's accessible name is **"<purpose>: <value>[, <hint>]"** ("Context: LAN,
suggested"), never the visible value alone; it carries `aria-haspopup="menu"` and `aria-expanded`. The popup
is `role="menu"` named by the purpose; single-choice rows are `menuitemradio` with `aria-checked`, actions
are `menuitem`. Escape closes and returns focus to the trigger. An icon-only row-menu trigger is named
"Actions for <row label>".

## Link

Standalone text action ("Edit", "View", "Why?", docs): `--primary-text`, `--weight-semibold`, no
underline until hover; `external` adds the external-link glyph. Weight and colour are never set per screen.

## Keyboard hints

A button's keyboard hint (Enter, Esc) is decorative: rendered `aria-hidden`, exposed as
`aria-keyshortcuts`, and never part of the accessible name. Desktop layouts only (`StartButton` drops it
when compact).

## LiveRegion

Exactly one per screen, visually hidden, polite, a direct child of `<main>` (not inside the gauge, a card
or the header). The Test screen uses it for phase changes, the rate at most every 5 s, each direction's
headline and the result summary (`i18n-a11y.md` §2.1, §2.7).
