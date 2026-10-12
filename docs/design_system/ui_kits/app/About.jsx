/* BitGauge web UI kit — About
 * Props:
 *   mobile: boolean  (default false)
 *   openspeedtest: boolean  (default true)
 *   librespeed: boolean  (default true)
 *   networkquality: boolean  (default true)
 *   unreachable: boolean  (default false) — /api/v1/info failed: snippets come from the page's own origin, layer state unknown
 */
class About extends React.Component {
  renderVals() {
    const cm = 'var(--slate-5)', cmd = 'var(--teal-5)', tx = 'var(--slate-2)';
    const ln = (t, c) => ({ t, c: c || tx });
    const flag = (k) => { const v = this.props[k]; return v == null ? true : !(v === false || v === 'false' || v === '0' || v === 0); };
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const un = !!this.props.unreachable && this.props.unreachable !== 'false';
    // Snippets are always built from the page's own origin (location.origin + base path); the kit mocks it.
    const host = 'https://speed.home.lan', hostName = host.replace(/^https?:\/\//, '');
    const srvName = un ? hostName : 'Basement NAS';
    const on = un ? { ost: true, ls: true, nq: true } : { ost: flag('openspeedtest'), ls: flag('librespeed'), nq: flag('networkquality') };
    const clients = [
      { k: 'ost', name: 'OpenSpeedTest™ web UI', icon: 'globe', tag: 'Web UI',
        desc: 'Open your own self-hosted OpenSpeedTest UI and point it at this server with the Host parameter.',
        offWhat: 'The OpenSpeedTest protocol endpoints are switched off, so an OpenSpeedTest UI can’t test against this server.',
        note: 'The results link in the OpenSpeedTest UI contacts OpenSpeedTest, not this server.',
        blocks: [{ cap: null, copy: 'Copy OpenSpeedTest URL', lines: [ln('https://ost.example.lan/?Host=' + host, cmd)] }] },
      { k: 'ls', name: 'librespeed-cli', icon: 'terminal', tag: 'CLI',
        desc: 'Save this server to a local list, then run the CLI against it.',
        offWhat: 'The LibreSpeed protocol endpoints are switched off, so librespeed-cli can’t test against this server.',
        blocks: [
          { cap: 'servers.json', copy: 'Copy servers.json', lines: [ln('[{ "id": 1, "name": "' + srvName + '",'), ln('   "server": "' + host + '/",'), ln('   "dlURL": "garbage", "ulURL": "empty",'), ln('   "pingURL": "empty", "getIpURL": "getIP" }]')] },
          { cap: null, copy: 'Copy librespeed-cli command', lines: [ln('# --no-icmp: measure ping over HTTP', cm), ln('librespeed-cli --local-json servers.json --server 1 --no-icmp', cmd)] },
          { cap: 'Or let the CLI fetch the list from this server', copy: 'Copy librespeed-cli command with server list URL', lines: [ln('librespeed-cli --server-json ' + host + '/.well-known/librespeed --server 1 --no-icmp', cmd)] },
          { cap: 'Slow VPN link', copy: 'Copy librespeed-cli command for slow links', lines: [ln('# fewer chunks per download request (default 100), so each one finishes in time', cm), ln('librespeed-cli --local-json servers.json --server 1 --no-icmp --chunks 10', cmd)] }
        ],
        note: 'On a slow VPN link, lower --chunks: each download request asks for that many chunks, and the default 100 can outlast the test.' },
      { k: 'nq', name: 'macOS networkQuality', icon: 'monitor', tag: 'macOS 12+',
        desc: 'Apple’s built-in tool reports throughput and responsiveness (RPM). Point it at this server’s config.',
        offWhat: 'The networkQuality config isn’t served, so networkQuality -C can’t use this server.',
        blocks: [{ cap: null, copy: 'Copy networkQuality commands', lines: [ln('# throughput and responsiveness', cm), ln('networkQuality -C ' + host + '/nq/config', cmd), ln('# verbose output', cm), ln('networkQuality -v -C ' + host + '/nq/config', cmd)] }],
        note: 'networkQuality needs TLS 1.3 and HTTP/2 at the reverse proxy. Over HTTP/1.1 or plain HTTP it won’t run.' }
    ].map(c => ({ ...c, hid: 'cl-' + c.k, on: on[c.k], off: !on[c.k], note: c.note || null, unk: un, docsAria: c.name + ' in the BitGauge docs' }));
    const names = { ost: 'OpenSpeedTest', ls: 'LibreSpeed', nq: 'networkQuality' };
    const enabled = Object.keys(on).filter(k => on[k]).map(k => names[k]);
    return {
      mobile: m, desktop: !m, un, host,
      L: m ? { pad: '16px 16px 24px', cols: 'minmax(0,1fr)', h1: 'var(--text-3xl)' } : { pad: '24px 40px 48px', cols: 'minmax(0,1fr) 340px', h1: 'var(--text-4xl)' },
      clients,
      facts: (un ? [['Version', '— · server unreachable'], ['License', 'GPL-3.0-or-later'], ['Server name', '—'], ['Clients', 'Unknown']] : [['Version', 'v1.4.0 · a1b2c3d · 2026-09-30'], ['License', 'GPL-3.0-or-later'], ['Server name', 'Basement NAS'], ['Clients', enabled.length ? enabled.join(' · ') : 'None enabled']]).map(([k, v]) => ({ k, v })),
      credits: [
        { n: 'OpenSpeedTest™', d: 'Protocol compatibility for its web UI.' },
        { n: 'LibreSpeed', d: 'Protocol compatibility for librespeed-cli.' },
        { n: 'Cloudflare', d: 'AIM quality scores for streaming, gaming and video calls.' },
        { n: 'Apple networkQuality and the IETF responsiveness draft', d: 'The RPM responsiveness metric and config format.' },
        { n: 'Waveform', d: 'Bufferbloat grade thresholds.' }
      ]
    };
  }
  render() {
    const v = this.renderVals();
    return (
      <div style={{ background: "var(--bg-base)", color: "var(--fg)", fontFamily: "var(--font-sans)", minHeight: "100%" }}>
        {v.desktop ? (
          <Nav variant="top" active="about" status={this.props.srvStatus || (this.props.unreachable && this.props.unreachable !== "false" ? "unreachable" : "connected")} />
        ) : null}
        {v.mobile ? (
          <Nav variant="mobile-top" active="about" status={this.props.srvStatus || (this.props.unreachable && this.props.unreachable !== "false" ? "unreachable" : "connected")} />
        ) : null}
        <main style={{ maxWidth: "1200px", margin: "0 auto", padding: v.L?.pad, display: "grid", gridTemplateColumns: v.L?.cols, gap: "24px", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
            <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h1 style={{ margin: "0", fontSize: v.L?.h1, fontWeight: "600", letterSpacing: "var(--tracking-tight)" }}>Use with other clients</h1>
              <p style={{ margin: "0", fontSize: "var(--text-base)", color: "var(--fg-muted)", maxWidth: "640px", lineHeight: "1.55", textWrap: "pretty" }}>
                This server can answer the LibreSpeed and OpenSpeedTest protocols and serve an Apple networkQuality config, so you can test against it from a terminal or another UI. The operator chooses which are on.
              </p>
            </header>
            {v.un ? (
              <div role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 12px", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--warn-border)", background: "var(--warn-bg)" }}>
                <span style={{ color: "var(--warn)", display: "flex", marginTop: "1px" }}><bg-icon name="server-off" size="17" /></span>
                <div style={{ flex: "1 1 260px", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: "600", color: "var(--warn-fg)" }}>Server unreachable</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>
                    {"The commands below are built from this page's address, "}
                    <span style={{ fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{v.host}</span>
                    . BitGauge can't check which clients the operator enabled, or the server's name, until the server answers.
                  </span>
                </div>
                <button className="btn secondary sm" style={{ marginLeft: "auto" }}><bg-icon name="refresh-cw" size="14" />Retry</button>
              </div>
            ) : null}
            {(v.clients || []).map((c, $index) => (
              <React.Fragment key={$index}>
                <section className="card" aria-labelledby={c?.hid} style={{ overflow: "hidden" }}>
                  <div className="card-h">
                    <span className="ico" style={{ display: "flex" }}><bg-icon name={c?.icon} size="16" /></span>
                    <span className="t" id={c?.hid}>{c?.name}</span>
                    <span className="pill neutral" style={{ height: "20px", fontSize: "10px" }}>{c?.tag}</span>
                    {c?.off ? (
                      <span className="pill neutral" style={{ height: "20px", fontSize: "10px", background: "transparent", borderStyle: "dashed" }}>Off</span>
                    ) : null}
                    {c?.unk ? (
                      <span className="pill neutral" style={{ height: "20px", fontSize: "10px", background: "transparent", borderStyle: "dashed" }}>Not confirmed</span>
                    ) : null}
                    <a className="right" href="#" aria-label={c?.docsAria} style={{ fontSize: "var(--text-caption)", color: "var(--primary-text)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
                      BitGauge docs
                      <bg-icon name="external-link" size="12" />
                    </a>
                  </div>
                  {c?.on ? (
                    <>
                      <div style={{ padding: "12px 16px 4px", fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>
                      {c?.desc}
                    </div>
                      {(c?.blocks || []).map((b, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {b?.cap ? (
                            <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>{b?.cap}</span>
                          ) : null}
                          <div style={{ position: "relative", background: "var(--term-bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                            <pre style={{ margin: "0", padding: "12px 52px 12px 14px", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", lineHeight: "1.7", color: "var(--term-fg)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{(b?.lines || []).map((l, $index) => (
                                <React.Fragment key={$index}>
                                  <span style={{ display: "block", color: l?.c }}>{l?.t}</span>
                                </React.Fragment>
                              ))}</pre>
                            <button className="btn ghost icon sm" aria-label={b?.copy} style={{ position: "absolute", top: "6px", right: "6px", width: "30px", color: "var(--slate-3)" }}>
                              <bg-icon name="copy" size="14" />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                      {c?.note ? (
                      <div style={{ margin: "10px 16px 0", display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                        <span style={{ display: "flex", color: "var(--info)", marginTop: "1px" }}><bg-icon name="info" size="14" /></span>
                        <span style={{ textWrap: "pretty" }}>{c?.note}</span>
                      </div>
                    ) : null}
                      <div style={{ height: "16px" }} />
                    </>
                  ) : null}
                  {c?.off ? (
                    <div style={{ padding: "14px 16px 16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ display: "flex", color: "var(--fg-subtle)", marginTop: "1px" }}><bg-icon name="circle-minus" size="16" /></span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "500", color: "var(--fg)" }}>Not enabled on this server — the operator can enable it.</span>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.5" }}>{c?.offWhat}</span>
                      </div>
                    </div>
                  ) : null}
                </section>
              </React.Fragment>
            ))}
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
            <section className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "18px 16px 14px", display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
                <bg-logo size="40" style={{ color: "var(--fg)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-tight)" }}>
                    Bit
                    <span style={{ color: "var(--primary-text)", fontWeight: "var(--weight-semibold)" }}>Gauge</span>
                  </span>
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-subtle)" }}>Self-hosted network speed test</span>
                </div>
              </div>
              <dl style={{ margin: "0", padding: "4px 16px 8px" }}>
                {(v.facts || []).map((f, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                      <dt style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", flex: "none" }}>{f?.k}</dt>
                      <dd style={{ margin: "0", fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)", color: "var(--fg)", textAlign: "right", minWidth: "0" }}>
                        {f?.v}
                      </dd>
                    </div>
                  </React.Fragment>
                ))}
              </dl>
              <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <a className="btn secondary" href="#" style={{ justifyContent: "center", textDecoration: "none" }}>
                  <bg-icon name="github" size="15" />
                  Source repository
                  <bg-icon name="external-link" size="13" />
                </a>
                <a className="btn ghost sm" href="#" style={{ justifyContent: "center", textDecoration: "none" }}>LICENSE file in the repository</a>
              </div>
            </section>
            <section className="card card-b" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                How it measures
              </span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.55", textWrap: "pretty" }}>
                Download and upload run over one or more HTTP streams; the warm-up is discarded before the rate is computed. Latency is measured idle over WebSocket (HTTP if unavailable), then again under load — the increase sets the bufferbloat grade. Quality ratings for streaming, gaming and video calls are derived from those numbers.
              </span>
              <a href="#" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-sm)", color: "var(--primary-text)", textDecoration: "none" }}>
                Methodology in the BitGauge docs
                <bg-icon name="external-link" size="12" />
              </a>
            </section>
            <section className="card card-b" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                Privacy
              </span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "1.55" }}>
                No accounts, no tracking, no ads. The server keeps no results — history lives only in your browser.
              </span>
            </section>
            <section className="card card-b" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontFamily: "var(--font-cond)", fontWeight: "600", fontSize: "11px", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--fg-subtle)" }}>
                Credits
              </span>
              <ul style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                {(v.credits || []).map((cr, $index) => (
                  <React.Fragment key={$index}>
                    <li style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: "500", color: "var(--fg)" }}>{cr?.n}</span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)", lineHeight: "1.5", textWrap: "pretty" }}>{cr?.d}</span>
                    </li>
                  </React.Fragment>
                ))}
              </ul>
              <span style={{ paddingTop: "10px", borderTop: "1px solid var(--border-subtle)", fontSize: "var(--text-caption)", color: "var(--fg-subtle)", lineHeight: "1.5", textWrap: "pretty" }}>
                OpenSpeedTest™ is a trademark of its owner. BitGauge is an independent project, not affiliated with or endorsed by OpenSpeedTest, LibreSpeed, Cloudflare, Apple or Waveform.
              </span>
            </section>
          </aside>
        </main>
        {v.mobile ? (
          <Nav variant="mobile-bottom" active="about" status={this.props.srvStatus || (this.props.unreachable && this.props.unreachable !== "false" ? "unreachable" : "connected")} />
        ) : null}
      </div>
    );
  }
}

window.About = About;
