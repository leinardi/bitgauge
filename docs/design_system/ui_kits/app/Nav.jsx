/* BitGauge web UI kit — Nav: composes DS.AppHeader / DS.TabBar with app state from BGPrefs.
 * Props: variant "top" | "mobile-top" | "mobile-bottom", active, status "connected" | "unreachable".
 * Server name, host, theme and the navigation items come from the Prototype (context);
 * nothing here defaults to sample data. */
window.BGPrefs = window.BGPrefs || React.createContext({ theme: 'system', server: null, host: '' });
const NAV_ITEMS = [
  { key: 'test', label: 'Test', icon: 'gauge' }, { key: 'history', label: 'History', icon: 'history' },
  { key: 'settings', label: 'Settings', icon: 'sliders' }, { key: 'about', label: 'About', icon: 'info' }
];
function Nav({ variant = 'top', active = 'test', status = 'connected' }) {
  const p = React.useContext(window.BGPrefs);
  const items = NAV_ITEMS;
  const st = status === 'offline' || status === 'unreachable' ? 'unreachable' : 'connected';
  if (variant === 'mobile-bottom') return <DS.TabBar items={items} active={active} />;
  return <DS.AppHeader compact={variant === 'mobile-top'} server={p.server} host={p.host} status={st} items={items} active={active} theme={p.theme} />;
}
window.Nav = Nav;
