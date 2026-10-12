/* BitGauge web UI kit — Nav
 * Props:
 *   variant: "top" | "mobile-top" | "mobile-bottom"  (default "top")
 *   active: "test" | "history" | "settings" | "about"  (default "test")
 *   theme: "light" | "dark" | "system"  (default "system")
 *   server: string  (default "Basement NAS")
 *   host: string  (default "speed.home.lan")
 *   status: "connected" | "unreachable"  (default "connected")
 */
/* Prefs context: the prototype provides the current theme so every Nav shows it. */
window.BGPrefs = window.BGPrefs || React.createContext({ theme: 'system' });
class Nav extends React.Component {
  static contextType = window.BGPrefs;
  renderVals() {
    const v = this.props.variant || 'top';
    const active = this.props.active || 'test';
    const items = [['test', 'Test', 'gauge'], ['history', 'History', 'history'], ['settings', 'Settings', 'sliders'], ['about', 'About', 'info']]
      .filter(([k]) => !(this.props.v01 && this.props.v01 !== 'false' && k === 'history'))
      .map(([k, label, icon]) => ({ label, icon, on: k === active, off: k !== active }));
    const th = this.props.theme || (this.context && this.context.theme) || 'system';
    const themes = [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'Follow system', 'monitor']]
      .map(([k, label, icon]) => ({ label, icon, on: k === th, off: k !== th }));
    const cur = themes.find(t => t.on);
    const down = this.props.status === 'offline' || this.props.status === 'unreachable';
    return {
      isTop: v === 'top', isMobileTop: v === 'mobile-top', isMobileBottom: v === 'mobile-bottom',
      items, themes, themeIcon: cur.icon, themeLabel: cur.label,
      down, dotBg: down ? 'transparent' : 'var(--ok)', dotBd: down ? '1.5px solid var(--warn)' : '0',
      srStatus: down ? 'unreachable' : 'connected', dotTitle: down ? 'Server unreachable' : 'Server connected',
      server: this.props.server || 'Basement NAS', host: this.props.host || 'speed.home.lan'
    };
  }
  render() {
    const v = this.renderVals();
    return (
      <>
        {v.isTop ? (
        <header style={{ height: "56px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", fontFamily: "var(--font-sans)", color: "var(--fg)" }}>
          <div style={{ flex: "1", maxWidth: "1200px", margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", gap: "20px" }}>
            <a href="#" aria-label="BitGauge home" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", textDecoration: "none", color: "var(--fg)" }}>
              <bg-logo size="28" style={{ color: "var(--fg)" }} />
              <span style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>
                Bit
                <span style={{ color: "var(--primary-text)", fontWeight: "var(--weight-semibold)" }}>Gauge</span>
              </span>
            </a>
            <span style={{ width: "1px", height: "20px", background: "var(--border-default)" }} />
            <div title={v.dotTitle} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "0" }}>
              <span aria-hidden="true" style={{ width: "7px", height: "7px", boxSizing: "border-box", borderRadius: "50%", background: v.dotBg, border: v.dotBd, flex: "none" }} />
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "500", color: "var(--fg)" }}>{v.server}</span>
              <span role="status" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: "0" }}>
                {v.srStatus}
              </span>
              {v.down ? (
                <span aria-hidden="true" style={{ fontSize: "var(--text-caption)", fontWeight: "500", color: "var(--warn-fg)" }}>Unreachable</span>
              ) : null}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{v.host}</span>
            </div>
            <nav aria-label="Primary" style={{ marginLeft: "auto", display: "flex", gap: "2px" }}>
              {(v.items || []).map((it, $index) => (
                <React.Fragment key={$index}>
                  {it?.on ? (
                    <a href="#" aria-current="page" style={{ display: "flex", alignItems: "center", gap: "7px", height: "32px", padding: "0 12px", borderRadius: "var(--radius-md)", background: "var(--surface-3)", color: "var(--fg)", fontSize: "var(--text-sm)", fontWeight: "600", textDecoration: "none" }}>
                      <bg-icon name={it?.icon} size="15" />
                      {it?.label}
                    </a>
                  ) : null}
                  {it?.off ? (
                    <a className="hv-nav-1" href="#" style={{ display: "flex", alignItems: "center", gap: "7px", height: "32px", padding: "0 12px", borderRadius: "var(--radius-md)", color: "var(--fg-muted)", fontSize: "var(--text-sm)", fontWeight: "500", textDecoration: "none" }}>
                      <bg-icon name={it?.icon} size="15" />
                      {it?.label}
                    </a>
                  ) : null}
                </React.Fragment>
              ))}
            </nav>
            <div className="seg" role="radiogroup" aria-label="Theme" style={{ height: "30px" }}>
              {(v.themes || []).map((t, $index) => (
                <React.Fragment key={$index}>
                  {t?.on ? (
                    <button className="seg-btn on" role="radio" aria-checked="true" aria-label={t?.label} style={{ height: "28px", padding: "0 8px" }}>
                      <bg-icon name={t?.icon} size="14" />
                    </button>
                  ) : null}
                  {t?.off ? (
                    <button className="seg-btn" role="radio" aria-checked="false" aria-label={t?.label} style={{ height: "28px", padding: "0 8px" }}>
                      <bg-icon name={t?.icon} size="14" />
                    </button>
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        </header>
      ) : null}
        {v.isMobileTop ? (
        <header style={{ height: "52px", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", fontFamily: "var(--font-sans)", color: "var(--fg)" }}>
          <bg-logo size="26" style={{ color: "var(--fg)" }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: "0", lineHeight: "1.15" }}>
            <span style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>
              Bit
              <span style={{ color: "var(--primary-text)", fontWeight: "var(--weight-semibold)" }}>Gauge</span>
            </span>
            <span title={v.dotTitle} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-micro)", color: "var(--fg-subtle)" }}>
              <span aria-hidden="true" style={{ width: "6px", height: "6px", boxSizing: "border-box", borderRadius: "50%", background: v.dotBg, border: v.dotBd }} />
              {v.server}
              <span role="status" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: "0" }}>
                {v.srStatus}
              </span>
              {v.down ? (
                <span aria-hidden="true" style={{ color: "var(--warn-fg)", fontWeight: "500" }}>· Unreachable</span>
              ) : null}
            </span>
          </div>
          <button className="btn ghost icon" aria-label={`Theme: ${v.themeLabel ?? ""}`} style={{ marginLeft: "auto", width: "44px", height: "44px" }}>
            <bg-icon name={v.themeIcon} size="18" />
          </button>
        </header>
      ) : null}
        {v.isMobileBottom ? (
        <nav aria-label="Primary" style={{ position: "sticky", bottom: "0", zIndex: "var(--z-nav)", height: "64px", display: "grid", gridTemplateColumns: `repeat(${(v.items || []).length || 4}, minmax(0,1fr))`, borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)", fontFamily: "var(--font-sans)", paddingBottom: "4px" }}>
          {(v.items || []).map((it, $index) => (
            <React.Fragment key={$index}>
              {it?.on ? (
                <a href="#" aria-current="page" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", color: "var(--primary-text)", fontSize: "var(--text-micro)", fontWeight: "600", textDecoration: "none" }}>
                  <span style={{ position: "absolute", top: "-1px", left: "28%", right: "28%", height: "2px", borderRadius: "2px", background: "var(--primary)" }} />
                  <bg-icon name={it?.icon} size="20" />
                  {it?.label}
                </a>
              ) : null}
              {it?.off ? (
                <a href="#" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", color: "var(--fg-subtle)", fontSize: "var(--text-micro)", fontWeight: "500", textDecoration: "none" }}>
                  <bg-icon name={it?.icon} size="20" />
                  {it?.label}
                </a>
              ) : null}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
      </>
    );
  }
}

window.Nav = Nav;
