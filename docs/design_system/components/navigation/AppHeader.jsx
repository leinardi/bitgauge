import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { Logo } from '../brand/Logo.jsx';
import { Segmented } from '../forms/Segmented.jsx';
const THEMES = [{ value: 'light', label: 'Light', icon: 'sun', iconOnly: true }, { value: 'dark', label: 'Dark', icon: 'moon', iconOnly: true }, { value: 'system', label: 'Follow system', icon: 'monitor', iconOnly: true }];
// Server identity: name from GET /info when known, the page's host always; status as dot + text.
function Server({ name, host, down }) {
  const [ann, setAnn] = React.useState('');
  const last = React.useRef(undefined);
  React.useEffect(() => { const s = down ? 'unreachable' : 'connected'; if (last.current !== undefined && last.current !== s) setAnn(down ? 'Server unreachable' : 'Server connected'); last.current = s; }, [down]);
  return <div className={'srv' + (down ? ' down' : '')} title={down ? 'Server unreachable' : 'Server connected'}>
    <span className="dot" aria-hidden="true"></span>
    {name ? <span className="nm">{name}</span> : null}
    <span className="sr-only">{down ? ', unreachable' : ', connected'}</span>
    {down ? <span className="st" aria-hidden="true">{name ? 'Unreachable' : 'Unreachable ·'}</span> : null}
    <span className="host">{host}</span>
    <span className="sr-only" role="status" aria-live="polite">{ann}</span>
  </div>;
}
export function AppHeader({ compact = false, server, host, status = 'connected', items = [], active, theme = 'system', onThemeChange, onNavigate }) {
  const down = status === 'unreachable';
  const nav = (e, it) => { if (onNavigate) { e.preventDefault(); onNavigate(it.key); } };
  if (compact) {
    const cur = THEMES.find(t => t.value === theme) || THEMES[2];
    const next = THEMES[(THEMES.indexOf(cur) + 1) % 3].value;
    return <header className="hdr compact">
      <Logo size={26} />
      <div className="hdr-id"><span className="wm md"><span>Bit<span className="g">Gauge</span></span></span><Server name={server} host={host} down={down} /></div>
      <button type="button" className="btn ghost icon touch hdr-theme" aria-label={'Theme: ' + cur.label} onClick={() => onThemeChange && onThemeChange(next)}><Icon name={cur.icon} size={18} /></button>
    </header>;
  }
  return <header className="hdr"><div className="hdr-in">
    <Logo size={28} wordmark href="#" />
    <span className="hdr-sep" aria-hidden="true"></span>
    <Server name={server} host={host} down={down} />
    <nav className="nav" aria-label="Primary">{items.map(it => <a key={it.key} href={it.href || '#'} className="nav-l" aria-current={it.key === active ? 'page' : undefined} onClick={e => nav(e, it)}><Icon name={it.icon} size={15} />{it.label}</a>)}</nav>
    <Segmented size="sm" ariaLabel="Theme" options={THEMES} value={theme} onChange={onThemeChange} />
  </div></header>;
}
export function TabBar({ items = [], active, onNavigate }) {
  return <nav className="tabbar" aria-label="Primary">{items.map(it => <a key={it.key} href={it.href || '#'} className="tab-l" aria-current={it.key === active ? 'page' : undefined} onClick={e => { if (onNavigate) { e.preventDefault(); onNavigate(it.key); } }}><Icon name={it.icon} size={20} />{it.label}</a>)}</nav>;
}
