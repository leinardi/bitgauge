/* BitGauge design helpers: <bg-icon> (Lucide glyphs), number formatting, gauge + chart geometry.
   Production: @lucide/vue for icons; the math below ports 1:1 to a composable. */
(function () {
  const G = {
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'wifi-off': '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    'circle-minus': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    'circle-alert': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    'circle-dashed': '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
    'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
    gamepad: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    'hard-drive': '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
    'git-compare': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
    filter: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'arrow-up-down': '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    'sort-desc': '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    infinity: '<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    'file-json': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    enter: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
    ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    'list': '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    'share-2': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
    'undo-2': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    'server-off': '<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"/><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z"/><path d="M22 17v-1a2 2 0 0 0-2-2h-1"/><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z"/><path d="M6 18h.01"/><path d="m2 2 20 20"/>'
  };
  if (!customElements.get('bg-icon')) {
    customElements.define('bg-icon', class extends HTMLElement {
      static get observedAttributes() { return ['name', 'size', 'stroke']; }
      connectedCallback() { this.r(); }
      attributeChangedCallback() { this.r(); }
      r() {
        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
        const s = this.getAttribute('size') || 16, w = this.getAttribute('stroke') || 1.75;
        this.setAttribute('aria-hidden', 'true');
        this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;flex:none;line-height:0;vertical-align:middle}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${G[this.getAttribute('name')] || '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="2 2"/>'}</svg>`;
      }
    });
  }

  // ---------- formatting ----------
  // Three significant digits for every rate and data amount: "9.40 kbit/s", "94.1 Mbit/s", "12.3 Gbit/s", "12.3 MB".
  const sig = x => x >= 100 ? Math.round(x).toString() : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toPrecision(3);
  // Picks the unit from the decimal prefix; a value that rounds to 1000 moves up one unit.
  function scaled(v, U) {
    let i = Math.max(0, Math.min(U.length - 1, Math.floor(Math.log10(Math.max(v, 1)) / 3) - 1)), x = v / Math.pow(10, 3 * (i + 1));
    if (x >= 999.5 && i < U.length - 1) { i++; x /= 1000; }
    return { n: sig(x), u: U[i] };
  }
  function rate(bps, unit) {
    const bytes = unit === 'bytes';
    return scaled(bytes ? bps / 8 : bps, bytes ? ['kB/s', 'MB/s', 'GB/s'] : ['kbit/s', 'Mbit/s', 'Gbit/s']);
  }
  const rateStr = (b, u) => { const r = rate(b, u); return r.n + ' ' + r.u; };
  // Latency and jitter: one decimal below 10 ms, whole ms at/above 10, "< res" below the timer resolution
  // (res in ms; a 1 ms timer gives "< 1 ms").
  const jit = (v, res = 0.1) => v < res ? '< ' + (res >= 1 ? Math.round(res) : res.toFixed(1)) : v < 10 ? v.toFixed(1) : Math.round(v).toString();
  const ms = jit;
  const bytes = b => { const r = scaled(b, ['kB', 'MB', 'GB', 'TB']); return r.n + ' ' + r.u; };
  const tickLabel = v => v >= 1e9 ? (v / 1e9) + 'G' : v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : String(v);

  // ---------- gauge (270° log arc) ----------
  const A0 = 135, SW = 270;
  const pt = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  function arc(cx, cy, r, f0, f1) {
    f0 = Math.max(0, Math.min(1, f0)); f1 = Math.max(f0 + 0.0005, Math.min(1, f1));
    const a0 = A0 + SW * f0, a1 = A0 + SW * f1, p0 = pt(cx, cy, r, a0), p1 = pt(cx, cy, r, a1);
    return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  }
  // ---------- gauge window (engine-side; the gauge only draws lo/hi) ----------
  // Windows are 4 log decades [10^k, 10^(k+4)) in the display unit.
  //   bits:  k 4..6 (10 kbit/s–100 Mbit/s … 1 Mbit/s–10 Gbit/s), start k = 6. Pin edges 10 kbit/s / 10 Gbit/s.
  //   bytes: k 3..6 (1 kB/s–10 MB/s … 1 MB/s–10 GB/s), start k = 5 (100 kB/s–1 GB/s). Pin edges 1 kB/s / 10 GB/s.
  // The FIRST throughput direction of a run (download or upload per configured order, or the single
  // Continuous direction) starts at the start window; the SECOND passes k0 = first.k. Nothing carries between runs.
  // Shift down one decade after `hold` s continuously in the bottom decade (< 10^(k+1)),
  // up one decade after `hold` s continuously in the top decade (> 10^(k+3)). One decade per shift.
  // pts: [[t s, bit/s]] at 10 Hz. Returns final k plus the shift log and per-sample k.
  function track(pts, o = {}) {
    const by = o.unit === 'bytes', kMin = by ? 3 : 4, kMax = 6, hold = o.hold ?? 2;
    let k = o.k0 ?? (by ? 5 : 6), dir = 0, since = null;
    const shifts = [], ks = [];
    for (const [t, raw] of pts) {
      const v = by ? raw / 8 : raw;
      const d = v < Math.pow(10, k + 1) && k > kMin ? -1 : v > Math.pow(10, k + 3) && k < kMax ? 1 : 0;
      if (d !== dir) { dir = d; since = t; }
      if (d && t - since >= hold - 1e-9) { shifts.push({ t, from: k, to: k + d, held: [since, t] }); k += d; dir = 0; since = null; }
      ks.push([t, k]);
    }
    const tl = pts.length ? pts[pts.length - 1][0] : 0;
    return { k, lo: Math.pow(10, k), hi: Math.pow(10, k + 4), shifts, ks, dir, holdFor: dir ? tl - since : 0 };
  }
  const decStr = (e, unit) => { const U = unit === 'bytes' ? ['kB/s', 'MB/s', 'GB/s'] : ['kbit/s', 'Mbit/s', 'Gbit/s']; const i = Math.max(0, Math.min(2, Math.floor((e - 3) / 3))); return Math.pow(10, e - 3 - 3 * i) + ' ' + U[i]; };
  const winLabel = (k, unit) => 'log scale · ' + decStr(k, unit) + ' – ' + decStr(k + 4, unit) + ' · auto';
  // Shift tween: 280 ms ease-out in log space. The caller animates k and passes the fractional value as
  // lo = 10^k, hi = 10^(k+4) (TestScreen._animK); under prefers-reduced-motion it jumps.
  const SHIFT_MS = 280;

  // mode: 'rate' | 'ms'. lo/hi come from the engine (track); default 1 Mbit/s–10 Gbit/s, ms fixed 1–1000.
  // Out-of-range values pin the needle at the start or end; the readout stays exact.
  function gauge({ size, value, lo, hi, mode = 'rate', bandLo, bandHi, peak, inner }) {
    const cx = size / 2, cy = size / 2, r = size / 2 - 10;
    if (lo == null) { if (mode === 'ms') { lo = 1; hi = 1000; } else { lo = 1e6; hi = 1e10; } }
    const L0 = Math.log10(lo), L1 = Math.log10(hi);
    const f = v => (Math.log10(Math.min(Math.max(v, lo), hi)) - L0) / (L1 - L0);
    const ticks = [], labels = [];
    for (let d = Math.floor(L0 + 1e-9); d <= Math.ceil(L1 - 1e-9); d++) {
      const base = Math.pow(10, d);
      [1, 2, 5].forEach(m => {
        const v = base * m; if (v > hi * 1.0001 || v < lo * 0.9999) return;
        const major = m === 1, fr = f(v), a = A0 + SW * fr;
        const p1 = pt(cx, cy, r - 14, a), p2 = pt(cx, cy, r - (major ? 22 : 18), a);
        ticks.push({ x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1), w: major ? 1.5 : 1, o: major ? 1 : 0.6 });
        if (major) { const pl = pt(cx, cy, r - 36, a); labels.push({ x: pl[0].toFixed(1), y: (pl[1] + 4).toFixed(1), t: mode === 'ms' ? String(v) : tickLabel(v) }); }
      });
    }
    const out = { size, vb: `0 0 ${size} ${size}`, track: arc(cx, cy, r, 0, 1), ticks, labels, fill: '', band: '', hasValue: value != null, dot: null, peak: null, pinned: value == null ? null : value < lo ? 'start' : value > hi ? 'end' : null };
    if (value != null) {
      const fv = f(value); out.fill = arc(cx, cy, r, 0, fv);
      const d = pt(cx, cy, r, A0 + SW * fv); out.dot = { x: d[0].toFixed(1), y: d[1].toFixed(1) };
      if (bandLo != null) out.band = arc(cx, cy, r, f(bandLo), f(bandHi));
      if (inner != null) out.inner = arc(cx, cy, r - 10, 0, f(inner));
      if (peak != null) { const a = A0 + SW * f(peak), q1 = pt(cx, cy, r + 8, a), q2 = pt(cx, cy, r - 8, a); out.peak = { x1: q1[0].toFixed(1), y1: q1[1].toFixed(1), x2: q2[0].toFixed(1), y2: q2[1].toFixed(1) }; }
    }
    return out;
  }

  // ---------- series + chart ----------
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // throughput ramp: target bit/s, tEnd seconds, step s
  function thr(seed, target, tEnd, step = 0.1, noise = 0.06, tau = 0.5) {
    const R = rng(seed), p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, target * (1 - Math.exp(-t / tau)) * (1 + noise * (R() - 0.5) * 2 + 0.02 * Math.sin(t * 2.1))]);
    return p;
  }
  function lat(seed, idle, loaded, tEnd, step = 0.1, noise = 0.18, tau = 1.0) {
    const R = rng(seed), p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, (idle + (loaded - idle) * (1 - Math.exp(-t / tau))) * (1 + noise * (R() - 0.5) * 2)]);
    return p;
  }
  function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e; return 10 * e; }
  // opts: {w,h,xMax, series:[pts], yMax?, lat?:pts, latMax?, unit:'bits'|'bytes', xLabel?:fn}
  function chart(o) {
    const all = o.series.flat(); const ym = o.yMax || niceMax(Math.max(...all.map(p => p[1])) * 1.08);
    // Axis label gutters grow to fit the longest label (e.g. "1.00 Gbit/s") so it is never clipped.
    const lab = f => { const v = ym * f, r = o.ms ? { n: ms(v), u: 'ms' } : rate(v, o.unit); return f === 0 ? '0' : r.n + (f === 1 ? ' ' + r.u : ''); };
    const CH = 6.7, fit = (min, s) => Math.max(min, Math.ceil(s.length * CH) + 14);
    const pl = o.padL ?? fit(44, lab(1));
    let lm0 = 0; if (o.lat) lm0 = o.latMax || niceMax(Math.max(...o.lat.map(p => p[1])) * 1.9);
    const pr = o.lat ? (o.padR ?? fit(40, Math.round(lm0) + ' ms')) : 12, pt_ = 10, pb = 22, W = o.w - pl - pr, H = o.h - pt_ - pb;
    const X = t => pl + W * t / o.xMax, Y = v => pt_ + H * (1 - v / ym);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = ym * f; return { y: Y(v).toFixed(1), x1: pl, x2: pl + W, t: lab(f), ly: (Y(v) + 3.5).toFixed(1), lx: pl - 8 }; });
    const xt = []; const stepX = o.xStep || niceMax(o.xMax / 6);
    for (let t = 0; t <= o.xMax + 1e-9; t += stepX) xt.push({ x: X(t).toFixed(1), y: (o.h - 6).toFixed(1), t: o.xLabel ? o.xLabel(t) : (Math.round(t * 10) / 10) + 's' });
    const line = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    const series = o.series.map(pts => { const l = line(pts); const last = pts[pts.length - 1]; return { line: l, area: l + `L${X(last[0]).toFixed(1)} ${Y(0)}L${X(pts[0][0]).toFixed(1)} ${Y(0)}Z`, endX: X(last[0]).toFixed(1), endY: Y(last[1]).toFixed(1) }; });
    let latOut = null;
    if (o.lat) {
      const lm = lm0; const LY = v => pt_ + H * (1 - v / lm);
      latOut = { line: o.lat.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + LY(p[1]).toFixed(1)).join(''), ticks: [0, 0.5, 1].map(f => ({ y: (LY(lm * f) + 3.5).toFixed(1), x: pl + W + 8, t: Math.round(lm * f) + (f === 1 ? ' ms' : '') })) };
    }
    const seps = (o.seps || []).map(q => ({ x: X(q.t).toFixed(1), lx: (X(q.t) + 6).toFixed(1), ly: pt_ + 12, t: q.label, y1: pt_, y2: pt_ + H }));
    const wins = (o.wins || []).map(q => ({ x: X(q.t0).toFixed(1), w: (X(q.t1) - X(q.t0)).toFixed(1), y: pt_, h: H, t: q.label, lx: (X(q.t0) + 4).toFixed(1), ly: pt_ + H - 8 }));
    const marks = (o.marks || []).map(q => ({ x: X(q.t).toFixed(1), y1: pt_, y2: pt_ + H, t: q.label, lx: (X(q.t) - 6).toFixed(1), ly: pt_ + 12 }));
    return { vb: `0 0 ${o.w} ${o.h}`, w: o.w, h: o.h, grid, seps, wins, marks, xt, series, lat: latOut, plotL: pl, plotR: pl + W, plotT: pt_, plotB: pt_ + H, nowX: o.now != null ? X(o.now).toFixed(1) : null };
  }
  function spark(pts, w, h, yMax) {
    const xm = pts[pts.length - 1][0] || 1, ym = yMax || Math.max(...pts.map(p => p[1])) * 1.1;
    return pts.map((p, i) => (i ? 'L' : 'M') + (w * p[0] / xm).toFixed(1) + ' ' + (h - 2 - (h - 4) * p[1] / ym).toFixed(1)).join('');
  }

  const GRADES = {
    'A+': { tone: 'ok', text: 'Minimal bufferbloat' }, A: { tone: 'ok', text: 'Low bufferbloat' }, B: { tone: 'ok', text: 'Mild bufferbloat' },
    C: { tone: 'warn', text: 'Moderate bufferbloat' }, D: { tone: 'warn', text: 'High bufferbloat' }, F: { tone: 'danger', text: 'Severe bufferbloat' }
  };
  const QUALITY = { Great: { tone: 'ok', icon: 'circle-check' }, Good: { tone: 'ok', icon: 'check' }, Average: { tone: 'warn', icon: 'circle-minus' }, Poor: { tone: 'warn', icon: 'circle-alert' }, Bad: { tone: 'danger', icon: 'circle-x' } };

  window.BG = { rate, rateStr, ms, jit, bytes, gauge, track, winLabel, decStr, SHIFT_MS, arc, thr, lat, chart, spark, niceMax, rng, GRADES, QUALITY, glyphs: Object.keys(G) };
  window.dispatchEvent(new Event('bg-lib-ready'));
})();

/* <bg-logo size="28" variant="color|mono">: BitGauge mark (1f Three series).
   color: --series-download / --series-upload / --series-latency (dashed). mono: every arc in currentColor.
   size <= 20 switches to the favicon geometry: two heavier arcs, no dashed latency arc. */
(function () {
  if (customElements.get('bg-logo')) return;
  const FULL = (d, u, l) => '<path d="M14.32 53.68 A25 25 0 1 1 49.68 53.68" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M14.32 53.68 A25 25 0 1 1 53.65 23.5" fill="none" style="stroke:' + d + '" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M19.98 48.02 A17 17 0 0 1 32 19" fill="none" style="stroke:' + u + '" stroke-width="5" stroke-linecap="round"/>'
    + '<path d="M25.64 42.36 A9 9 0 0 1 27.5 28.21" fill="none" style="stroke:' + l + '" stroke-width="4" stroke-dasharray="2.6 3"/>';
  const SMALL = (d, u) => '<path d="M15.03 48.97 A24 24 0 1 1 48.97 48.97" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M15.03 48.97 A24 24 0 1 1 54.35 23.24" fill="none" style="stroke:' + d + '" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M23.51 40.49 A12 12 0 0 1 32 20" fill="none" style="stroke:' + u + '" stroke-width="7" stroke-linecap="round"/>';
  class BgLogo extends HTMLElement {
    static get observedAttributes() { return ['size', 'variant', 'geometry']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }
    render() {
      const s = this.getAttribute('size') || '28', mono = this.getAttribute('variant') === 'mono';
      const g = this.getAttribute('geometry') || (parseFloat(s) <= 20 ? 'small' : 'full');
      const c = mono ? ['currentColor', 'currentColor', 'currentColor'] : ['var(--series-download)', 'var(--series-upload)', 'var(--series-latency)'];
      // Shadow root: React owns this element's light-DOM children.
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = '<style>:host{display:inline-flex;flex:none;line-height:0}svg{display:block}</style><svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true">' + (g === 'small' ? SMALL(c[0], c[1]) : FULL(...c)) + '</svg>';
    }
  }
  customElements.define('bg-logo', BgLogo);
})();
