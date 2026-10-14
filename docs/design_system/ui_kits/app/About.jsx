/* BitGauge web UI kit — About
 * Props:
 *   mobile: boolean  (default false)
 *   openspeedtest: boolean  (default true)
 *   librespeed: boolean  (default true)
 *   networkquality: boolean  (default true)
 *   unreachable: boolean  (default false) — /api/v1/info failed: snippets come from the page's own origin, layer state unknown
 *   caps: version scope (caps.clients false before v0.3: no snippets, v0.1 methodology)
 *   server: string | null — server.display_name; null while /info fails
 */
class About extends React.Component {
  renderVals() {
    const cm = 'comment', cmd = 'command';
    const ln = (t, kind) => ({ t, kind });
    const flag = (k) => { const v = this.props[k]; return v == null ? true : !(v === false || v === 'false' || v === '0' || v === 0); };
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const un = !!this.props.unreachable && this.props.unreachable !== 'false';
    // Snippets are always built from the page's own origin (location.origin + base path); the kit mocks it.
    const host = BG.KIT.origin, hostName = BG.KIT.host;
    const srvName = this.props.server || hostName;
    const caps = this.props.caps || { clients: true };
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
    const S = BG.KIT.server;
    return {
      mobile: m, un, host, clients, layers: !!caps.clients,
      L: m ? { cols: 'minmax(0,1fr)' } : { cols: 'minmax(0,1fr) var(--layout-rail)' },
      facts: (un ? [['Version', '— · server unreachable'], ['License', 'GPL-3.0-or-later'], ['Server name', '—'], ['Clients', 'Unknown']]
        : [['Version', S.version + ' · ' + S.commit + ' · ' + S.buildDate], ['License', 'GPL-3.0-or-later'], ['Server name', srvName], ['Clients', !caps.clients ? 'Arrive in v0.3' : enabled.length ? enabled.join(' · ') : 'None enabled']]).map(([k, v]) => ({ label: k, value: v })),
      // Before v0.3 the methodology summary covers the v0.1 metrics only (screens.md §5).
      method: caps.clients ? 'Download and upload run over one or more HTTP streams; the warm-up is discarded before the rate is computed. Latency is measured idle over WebSocket (HTTP if unavailable), then again under load — the increase sets the bufferbloat grade. Quality ratings for streaming, gaming and video calls are derived from those numbers.'
        : 'Download and upload run over one or more HTTP streams; the warm-up is discarded before the rate is computed. Idle latency and jitter are measured over WebSocket (HTTP if unavailable). Each result also reports the data used and the test duration.',
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
    const status = this.props.srvStatus || (v.un ? 'unreachable' : 'connected');
    const pill = (txt, dashed) => <DS.StatusPill size="sm" dot={false} dashed={dashed}>{txt}</DS.StatusPill>;
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <Nav variant={v.mobile ? "mobile-top" : "top"} active="about" status={status} />
        <main className={"page" + (v.mobile ? " compact" : "")} style={{ display: "grid", gridTemplateColumns: v.L.cols, gap: "var(--space-6)", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
            <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-1-5)" }}>
              <h1 className={v.mobile ? "ds-h2" : "ds-h1"} style={{ margin: 0 }}>Use with other clients</h1>
              <p className="ds-body-sm" style={{ margin: 0, fontSize: "var(--text-base)", maxWidth: "640px", lineHeight: "var(--lh-prose)" }}>
                This server can answer the LibreSpeed and OpenSpeedTest protocols and serve an Apple networkQuality config, so you can test against it from a terminal or another UI. The operator chooses which are on.
              </p>
            </header>
            {v.un ? (
              <DS.Notice tone="danger" icon="server-off" title="Server unreachable" actions={<DS.Button size="sm" icon="refresh-cw">Retry</DS.Button>}>
                {"The commands below are built from this page's address, " + v.host + ". BitGauge can't check which clients the operator enabled, or the server's name, until the server answers."}
              </DS.Notice>
            ) : null}
            {!v.layers ? (
              <DS.Notice tone="info" icon="layers" live={false} title="Other clients arrive in v0.3">
                The LibreSpeed, OpenSpeedTest and networkQuality layers are not part of this version, so there are no snippets yet.
              </DS.Notice>
            ) : v.clients.map(c => (
              <DS.Card key={c.k} as="section" labelledBy={c.hid} padded={false}
                title={<span id={c.hid}>{c.name}</span>} icon={c.icon}
                actions={<>{pill(c.tag)}{c.off ? pill('Off', true) : null}{c.unk ? pill('Not confirmed', true) : null}<DS.Link external href="#" aria-label={c.docsAria}>BitGauge docs</DS.Link></>}>
                {c.on ? (
                  <div style={{ padding: "var(--space-3) var(--space-4) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <span className="ds-body-sm">{c.desc}</span>
                    {c.blocks.map((b, i) => <DS.Snippet key={i} caption={b.cap} copyLabel={b.copy} lines={b.lines} />)}
                    {c.note ? <span className="ds-caption" style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", color: "var(--fg-muted)", lineHeight: "var(--lh-normal)" }}><span style={{ display: "flex", color: "var(--info)" }}><DS.Icon name="info" size={14} /></span>{c.note}</span> : null}
                  </div>
                ) : (
                  <div style={{ padding: "var(--space-3-5) var(--space-4) var(--space-4)", display: "flex", gap: "var(--space-2-5)", alignItems: "flex-start" }}>
                    <span style={{ display: "flex", color: "var(--fg-subtle)" }}><DS.Icon name="circle-minus" size={16} /></span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0-5)", minWidth: 0 }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>Not enabled on this server — the operator can enable it.</span>
                      <span className="ds-caption">{c.offWhat}</span>
                    </div>
                  </div>
                )}
              </DS.Card>
            ))}
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
            <DS.Card padded={false}>
              <div style={{ padding: "var(--space-4-5) var(--space-4) var(--space-3-5)", display: "flex", flexDirection: "column", gap: "var(--space-0-5)", borderBottom: "1px solid var(--border-subtle)" }}>
                <DS.Logo size={40} wordmark />
                <span className="ds-caption" style={{ paddingLeft: "calc(40px + var(--space-3))" }}>Self-hosted network speed test</span>
              </div>
              <div style={{ padding: "var(--space-1) var(--space-4) var(--space-2)" }}><DS.MetaList facts rows={v.facts} /></div>
              <div style={{ padding: "var(--space-2) var(--space-4) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <DS.Button href="#" block icon="github" iconAfter="external-link">Source repository</DS.Button>
                <DS.Button href="#" block variant="ghost" size="sm">LICENSE file in the repository</DS.Button>
              </div>
            </DS.Card>
            <DS.Card>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                <span className="ds-eyebrow">How it measures</span>
                <span className="ds-body-sm" style={{ lineHeight: "var(--lh-prose)" }}>{v.method}</span>
                <DS.Link external href="#">Methodology in the BitGauge docs</DS.Link>
              </div>
            </DS.Card>
            <DS.Card>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                <span className="ds-eyebrow">Privacy</span>
                <span className="ds-body-sm" style={{ lineHeight: "var(--lh-prose)" }}>No accounts, no tracking, no ads. The server keeps no results — history lives only in your browser.</span>
              </div>
            </DS.Card>
            <DS.Card>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <span className="ds-eyebrow">Credits</span>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
                  {v.credits.map(cr => <li key={cr.n} style={{ display: "flex", flexDirection: "column", gap: "var(--space-0-5)" }}><span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>{cr.n}</span><span className="ds-caption" style={{ color: "var(--fg-muted)", lineHeight: "var(--lh-normal)" }}>{cr.d}</span></li>)}
                </ul>
                <span className="ds-caption" style={{ paddingTop: "var(--space-2-5)", borderTop: "1px solid var(--border-subtle)", lineHeight: "var(--lh-normal)" }}>
                  OpenSpeedTest™ is a trademark of its owner. BitGauge is an independent project, not affiliated with or endorsed by OpenSpeedTest, LibreSpeed, Cloudflare, Apple or Waveform.
                </span>
              </div>
            </DS.Card>
          </aside>
        </main>
        {v.mobile ? <Nav variant="mobile-bottom" active="about" status={status} /> : null}
      </div>
    );
  }
}

window.About = About;
