/**
 * AppHeader — persistent header: wordmark (home link), server identity, primary navigation, theme switch.
 * TabBar — the narrow-layout bottom tab bar (64 px, position-neutral; the page pins it with a fixed wrapper plus a 64 px spacer). Contract: components/navigation.md.
 *
 * Data comes from props only — no defaults, no sample data:
 * - `server` is `server.display_name` from GET /info. Pass null when it is not known (/info failed): the
 *   header then shows the page's `host` alone with "Unreachable".
 * - `host` is the page's own host (location.host), always known.
 * - `items` is the navigation for the current version scope (v0.1: Test and About; v0.2+: Test, History,
 *   Settings, About). The header never filters items itself.
 * Accessibility: the status dot is aria-hidden with visually hidden ", connected" / ", unreachable" text;
 * a polite live region inside the header announces status CHANGES only (mounting is silent).
 * The compact theme button is named "Theme: <current>" and cycles light → dark → system.
 */
export interface NavItem { key: string; label: string; icon: string; href?: string; }
export interface AppHeaderProps {
  /** Compact header for narrow layouts (52 px, theme cycle button, no nav — use TabBar). */
  compact?: boolean;
  /** server.display_name, or null when unknown. */
  server?: string | null;
  /** The page's host, e.g. "speed.home.lan". */
  host: string;
  /** @default "connected" */
  status?: 'connected' | 'unreachable';
  items?: NavItem[];
  active?: string;
  /** @default "system" */
  theme?: 'light' | 'dark' | 'system';
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
  onNavigate?: (key: string) => void;
}
export declare function AppHeader(props: AppHeaderProps): JSX.Element;
export interface TabBarProps { items: NavItem[]; active?: string; onNavigate?: (key: string) => void; }
export declare function TabBar(props: TabBarProps): JSX.Element;
