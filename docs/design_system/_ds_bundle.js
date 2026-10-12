/* @ds-bundle: {"format":4,"namespace":"BitGaugeDesignSystem_1ab699","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Tooltip","sourcePath":"components/actions/Tooltip.jsx"},{"name":"ICON_NAMES","sourcePath":"components/brand/Icon.jsx"},{"name":"Icon","sourcePath":"components/brand/Icon.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Dialog","sourcePath":"components/dialog/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Notice","sourcePath":"components/feedback/Notice.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"SkeletonRows","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Segmented","sourcePath":"components/forms/Segmented.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Toggle","sourcePath":"components/forms/Toggle.jsx"},{"name":"Gauge","sourcePath":"components/gauge/Gauge.jsx"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"Table","sourcePath":"components/layout/Table.jsx"},{"name":"Tabs","sourcePath":"components/layout/Tabs.jsx"},{"name":"MetricTile","sourcePath":"components/measurement/MetricTile.jsx"},{"name":"PhaseStep","sourcePath":"components/measurement/PhaseStep.jsx"},{"name":"Chip","sourcePath":"components/status/Chip.jsx"},{"name":"StatusBadge","sourcePath":"components/status/StatusBadge.jsx"},{"name":"StatusPill","sourcePath":"components/status/StatusPill.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"6fce05445985","components/actions/Tooltip.jsx":"f42dbb8ea713","components/brand/Icon.jsx":"e1019af90087","components/brand/Logo.jsx":"e1a4ca1a83f3","components/dialog/Dialog.jsx":"6c14394e9387","components/feedback/EmptyState.jsx":"1b92bb9fd6e5","components/feedback/Notice.jsx":"cd02eee12687","components/feedback/Skeleton.jsx":"55d36fb5b863","components/feedback/Toast.jsx":"0603b9239c67","components/forms/Input.jsx":"2dd0d901408e","components/forms/Segmented.jsx":"678f79aef18c","components/forms/Switch.jsx":"e693da722e8c","components/forms/Toggle.jsx":"85f15c6fd4bf","components/gauge/Gauge.jsx":"4dfad9524422","components/layout/Card.jsx":"6ce9811f3210","components/layout/Table.jsx":"8ef4e1d9f2b6","components/layout/Tabs.jsx":"48a81a6e8ddf","components/measurement/MetricTile.jsx":"cefeac1830c7","components/measurement/PhaseStep.jsx":"3a99ec901e2e","components/status/Chip.jsx":"71ff738f21d8","components/status/StatusBadge.jsx":"825b7d61b854","components/status/StatusPill.jsx":"64955672fda0","ui_kits/app/About.jsx":"6fc495cd2c44","ui_kits/app/App.jsx":"dfd6cc915546","ui_kits/app/History.jsx":"901415fad3e4","ui_kits/app/Nav.jsx":"a3584678d6cd","ui_kits/app/Prototype.jsx":"d2577715f0e1","ui_kits/app/ResultDetail.jsx":"c465d671322d","ui_kits/app/Settings.jsx":"afbb6e756858","ui_kits/app/TestScreen.jsx":"5e1d7ffcc6a4","ui_kits/app/bg-lib.js":"f9975c3a3777"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BitGaugeDesignSystem_1ab699 = window.BitGaugeDesignSystem_1ab699 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Tooltip.jsx
try { (() => {
function Tooltip({
  content,
  align = 'center',
  open,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'has-tip' + (align === 'end' ? ' tip-end' : ''),
    style: {
      display: 'inline-flex'
    }
  }, children, /*#__PURE__*/React.createElement("span", {
    className: "tip",
    role: "tooltip",
    style: open ? {
      opacity: 1
    } : undefined
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/brand/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Lucide glyphs (outline, 24-grid), copied from the BitGauge kit's bg-lib.js.
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
const ICON_NAMES = Object.keys(G);
function Icon({
  name,
  size = 16,
  stroke = 1.75,
  style,
  className,
  ...rest
}) {
  const body = G[name] || '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="2 2"/>';
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className: className,
    style: {
      display: 'inline-block',
      flex: 'none',
      verticalAlign: 'middle',
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: body
    }
  }, rest));
}
Object.assign(__ds_scope, { ICON_NAMES, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Icon.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(' ');
function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconOnly = false,
  kbd,
  disabled = false,
  disabledReason,
  children,
  className,
  ...rest
}) {
  const iconSize = size === 'lg' ? 16 : size === 'sm' ? 14 : 15;
  const soft = !!disabledReason && disabled;
  const btn = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cx('btn', variant, size !== 'md' && size, iconOnly && 'icon', className),
    disabled: disabled && !soft,
    "aria-disabled": soft ? 'true' : undefined
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize
  }) : null, iconOnly ? null : children, kbd ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-micro)',
      opacity: 0.8,
      color: variant === 'primary' ? 'var(--primary-fg)' : 'var(--fg-subtle)'
    }
  }, kbd) : null);
  if (!soft) return btn;
  return /*#__PURE__*/React.createElement("span", {
    className: "has-tip",
    style: {
      display: 'inline-flex'
    }
  }, btn, /*#__PURE__*/React.createElement("span", {
    className: "tip",
    role: "tooltip"
  }, disabledReason));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/brand/Logo.jsx
try { (() => {
const FULL = (d, u, l) => '<path d="M14.32 53.68 A25 25 0 1 1 49.68 53.68" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>' + '<path d="M14.32 53.68 A25 25 0 1 1 53.65 23.5" fill="none" style="stroke:' + d + '" stroke-width="5" stroke-linecap="round"/>' + '<path d="M19.98 48.02 A17 17 0 0 1 32 19" fill="none" style="stroke:' + u + '" stroke-width="5" stroke-linecap="round"/>' + '<path d="M25.64 42.36 A9 9 0 0 1 27.5 28.21" fill="none" style="stroke:' + l + '" stroke-width="4" stroke-dasharray="2.6 3"/>';
const SMALL = (d, u) => '<path d="M15.03 48.97 A24 24 0 1 1 48.97 48.97" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>' + '<path d="M15.03 48.97 A24 24 0 1 1 54.35 23.24" fill="none" style="stroke:' + d + '" stroke-width="7" stroke-linecap="round"/>' + '<path d="M23.51 40.49 A12 12 0 0 1 32 20" fill="none" style="stroke:' + u + '" stroke-width="7" stroke-linecap="round"/>';
function Logo({
  size = 28,
  variant = 'color',
  geometry,
  wordmark = false,
  style
}) {
  const g = geometry || (size <= 20 ? 'small' : 'full');
  const c = variant === 'mono' ? ['currentColor', 'currentColor', 'currentColor'] : ['var(--series-download)', 'var(--series-upload)', 'var(--series-latency)'];
  const mark = /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    "aria-hidden": wordmark ? 'true' : undefined,
    role: wordmark ? undefined : 'img',
    "aria-label": wordmark ? undefined : 'BitGauge',
    style: {
      display: 'block',
      flex: 'none'
    },
    dangerouslySetInnerHTML: {
      __html: g === 'small' ? SMALL(c[0], c[1]) : FULL(...c)
    }
  });
  if (!wordmark) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      lineHeight: 0,
      ...style
    }
  }, mark);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: Math.round(size * 0.32),
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: Math.round(size * 0.6),
      letterSpacing: '-0.01em',
      color: 'var(--fg)',
      ...style
    }
  }, mark, "BitGauge");
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/dialog/Dialog.jsx
try { (() => {
function Dialog({
  open = true,
  inline = false,
  tone = 'primary',
  icon,
  title,
  children,
  scope,
  footer,
  wide = false,
  onClose
}) {
  if (!open) return null;
  const box = /*#__PURE__*/React.createElement("div", {
    className: 'modal' + (wide ? ' wide' : ''),
    role: tone === 'danger' ? 'alertdialog' : 'dialog',
    "aria-modal": inline ? undefined : 'true',
    style: inline ? {
      opacity: 1,
      transform: 'none',
      animation: 'none'
    } : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "mh"
  }, icon ? /*#__PURE__*/React.createElement("div", {
    className: 'mi ' + tone
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18
  })) : null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mt"
  }, title), children ? /*#__PURE__*/React.createElement("div", {
    className: "md"
  }, children) : null)), scope ? /*#__PURE__*/React.createElement("div", {
    className: "scope"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shield",
    size: 14
  })), scope) : null, footer ? /*#__PURE__*/React.createElement("div", {
    className: "mf"
  }, footer) : null);
  if (inline) return box;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 'var(--z-overlay)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "scrim",
    onClick: onClose
  }), box);
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/dialog/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function EmptyState({
  icon = 'history',
  title,
  children,
  actions,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty",
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    className: "eg"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "et"
  }, title), children ? /*#__PURE__*/React.createElement("div", {
    className: "em"
  }, children) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Notice.jsx
try { (() => {
const DEF = {
  info: 'info',
  warn: 'triangle-alert',
  danger: 'circle-x',
  ok: 'circle-check'
};
function Notice({
  tone = 'info',
  icon,
  title,
  children,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'signal ' + tone,
    role: tone === 'danger' ? 'alert' : undefined
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--' + tone + ')',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || DEF[tone],
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st"
  }, title), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--fg-muted)',
      marginTop: 2
    }
  }, children) : null), actions);
}
Object.assign(__ds_scope, { Notice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Notice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function Skeleton({
  width = '100%',
  height = 12,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "skel",
    style: {
      width,
      height,
      ...style
    },
    "aria-hidden": "true"
  });
}
function SkeletonRows({
  rows = 3,
  columns = [90, '1fr', 48]
}) {
  return /*#__PURE__*/React.createElement("div", {
    "aria-busy": "true"
  }, Array.from({
    length: rows
  }, (_, i) => /*#__PURE__*/React.createElement("div", {
    className: "skel-row",
    key: i
  }, columns.map((c, j) => /*#__PURE__*/React.createElement(Skeleton, {
    key: j,
    width: c === '1fr' ? undefined : c,
    style: c === '1fr' ? {
      flex: 1
    } : undefined
  })))));
}
Object.assign(__ds_scope, { Skeleton, SkeletonRows });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const DEF = {
  ok: 'circle-check',
  info: 'info',
  warn: 'triangle-alert',
  danger: 'circle-x'
};
function Toast({
  tone = 'ok',
  icon,
  title,
  message,
  action,
  animate = true
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'toast ' + tone,
    role: "status",
    style: animate ? undefined : {
      opacity: 1,
      transform: 'none',
      animation: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "i"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || DEF[tone],
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "t"
  }, title), message ? /*#__PURE__*/React.createElement("div", {
    className: "m"
  }, message) : null), action);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(' ');
function Input({
  icon,
  mono = false,
  size = 'md',
  invalid = false,
  error,
  label,
  className,
  style,
  ...rest
}) {
  const shell = /*#__PURE__*/React.createElement("div", {
    className: cx('input', mono && 'mono', size === 'sm' && 'sm', invalid || error ? 'invalid' : '', className),
    style: style
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  }) : null, /*#__PURE__*/React.createElement("input", _extends({
    "aria-invalid": invalid || !!error || undefined
  }, rest)));
  if (!label && !error) return shell;
  return /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--fg)'
    }
  }, label) : null, shell, error ? /*#__PURE__*/React.createElement("span", {
    className: "fmsg"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-alert",
    size: 12
  }), error) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Segmented.jsx
try { (() => {
function Segmented({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'seg' + (size === 'sm' ? ' seg-sm' : ''),
    role: "radiogroup",
    "aria-label": ariaLabel
  }, options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    const on = opt.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: opt.value,
      type: "button",
      role: "radio",
      "aria-checked": on,
      className: 'seg-btn' + (on ? ' on' : ''),
      onClick: () => onChange && onChange(opt.value)
    }, opt.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: opt.icon,
      size: 14
    }) : null, opt.label);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  checked = false,
  onChange,
  label,
  disabled = false
}) {
  const sw = /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    className: 'switch' + (checked ? ' on' : ''),
    onClick: () => onChange && onChange(!checked),
    style: {
      padding: 0,
      opacity: disabled ? 0.45 : 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "knob"
  }));
  if (!label) return sw;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, sw, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: checked ? 'var(--fg)' : 'var(--fg-muted)'
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Toggle.jsx
try { (() => {
function Toggle({
  pressed = false,
  onChange,
  icon,
  children
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-pressed": pressed,
    className: 'toggle' + (pressed ? ' on' : ''),
    onClick: () => onChange && onChange(!pressed)
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }) : null, children);
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/gauge/Gauge.jsx
try { (() => {
const A0 = 135,
  SW = 270;
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
function arc(cx, cy, r, f0, f1) {
  f0 = Math.max(0, Math.min(1, f0));
  f1 = Math.max(f0 + 0.0005, Math.min(1, f1));
  const a0 = A0 + SW * f0,
    a1 = A0 + SW * f1,
    p0 = pt(cx, cy, r, a0),
    p1 = pt(cx, cy, r, a1);
  return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
}
const tickLabel = v => v >= 1e9 ? v / 1e9 + 'G' : v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(v);
function Gauge({
  size = 300,
  value,
  lo,
  hi,
  mode = 'rate',
  bandLo,
  bandHi,
  peak,
  inner,
  color = 'var(--series-download)',
  eyebrow,
  eyebrowIcon,
  readout,
  unit,
  sub,
  numSize
}) {
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 10;
  if (lo == null) {
    if (mode === 'ms') {
      lo = 1;
      hi = 1000;
    } else {
      lo = 1e6;
      hi = 1e10;
    }
  }
  const L0 = Math.log10(lo),
    L1 = Math.log10(hi);
  const f = v => (Math.log10(Math.min(Math.max(v, lo), hi)) - L0) / (L1 - L0);
  const ticks = [],
    labels = [];
  for (let d = Math.floor(L0 + 1e-9); d <= Math.ceil(L1 - 1e-9); d++) {
    const base = Math.pow(10, d);
    [1, 2, 5].forEach(m => {
      const v = base * m;
      if (v > hi * 1.0001 || v < lo * 0.9999) return;
      const major = m === 1,
        a = A0 + SW * f(v),
        p1 = pt(cx, cy, r - 14, a),
        p2 = pt(cx, cy, r - (major ? 22 : 18), a);
      ticks.push({
        x1: p1[0],
        y1: p1[1],
        x2: p2[0],
        y2: p2[1],
        w: major ? 1.5 : 1,
        o: major ? 1 : 0.6
      });
      if (major && size >= 220) {
        const pl = pt(cx, cy, r - 36, a);
        labels.push({
          x: pl[0],
          y: pl[1] + 4,
          t: mode === 'ms' ? String(v) : tickLabel(v)
        });
      }
    });
  }
  const has = value != null,
    fv = has ? f(value) : 0,
    dot = has ? pt(cx, cy, r, A0 + SW * fv) : null;
  const pk = peak != null ? [pt(cx, cy, r + 8, A0 + SW * f(peak)), pt(cx, cy, r - 8, A0 + SW * f(peak))] : null;
  const ns = numSize || Math.round(size * 0.193);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    role: "img",
    "aria-label": eyebrow ? eyebrow + ' ' + (readout ?? '') + ' ' + (unit ?? '') : 'Gauge',
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: arc(cx, cy, r, 0, 1),
    style: {
      fill: 'none',
      stroke: 'var(--surface-3)',
      strokeWidth: 10,
      strokeLinecap: 'round'
    }
  }), ticks.map((t, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: t.x1,
    y1: t.y1,
    x2: t.x2,
    y2: t.y2,
    style: {
      stroke: 'var(--fg-faint)',
      strokeWidth: t.w,
      opacity: t.o
    }
  })), has && bandLo != null ? /*#__PURE__*/React.createElement("path", {
    d: arc(cx, cy, r, f(bandLo), f(bandHi)),
    style: {
      fill: 'none',
      stroke: color,
      strokeOpacity: 0.2,
      strokeWidth: 22
    }
  }) : null, has ? /*#__PURE__*/React.createElement("path", {
    d: arc(cx, cy, r, 0, fv),
    style: {
      fill: 'none',
      stroke: color,
      strokeWidth: 10,
      strokeLinecap: 'round',
      transition: 'd var(--dur-base) var(--ease-out)'
    }
  }) : null, has && inner != null ? /*#__PURE__*/React.createElement("path", {
    d: arc(cx, cy, r - 10, 0, f(inner)),
    style: {
      fill: 'none',
      stroke: 'var(--series-upload)',
      strokeWidth: 4,
      strokeLinecap: 'round'
    }
  }) : null, has && pk ? /*#__PURE__*/React.createElement("line", {
    x1: pk[0][0],
    y1: pk[0][1],
    x2: pk[1][0],
    y2: pk[1][1],
    style: {
      stroke: 'var(--fg-muted)',
      strokeWidth: 2,
      strokeLinecap: 'round'
    }
  }) : null, dot ? /*#__PURE__*/React.createElement("circle", {
    cx: dot[0],
    cy: dot[1],
    r: "7",
    style: {
      fill: 'var(--surface-2)',
      stroke: color,
      strokeWidth: 3
    }
  }) : null), labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: l.x,
      top: l.y,
      transform: 'translate(-50%,-80%)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--fg-subtle)',
      whiteSpace: 'nowrap'
    }
  }, l.t)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingTop: 8,
      textAlign: 'center'
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontFamily: 'var(--font-cond)',
      fontWeight: 600,
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      textTransform: 'uppercase',
      color
    }
  }, eyebrowIcon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: eyebrowIcon,
    size: 13,
    stroke: 2.25
  }) : null, eyebrow) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      fontSize: ns,
      lineHeight: 1.05,
      letterSpacing: '-0.03em',
      color: has ? 'var(--fg)' : 'var(--fg-subtle)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, readout ?? (has ? '' : '—')), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 500,
      color: 'var(--fg-muted)'
    }
  }, unit) : null, sub ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-caption)',
      color: 'var(--fg-subtle)'
    }
  }, sub) : null));
}
Object.assign(__ds_scope, { Gauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gauge/Gauge.jsx", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
function Card({
  title,
  icon,
  actions,
  children,
  padded = true,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      overflow: 'hidden',
      ...style
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    className: "card-h"
  }, icon ? /*#__PURE__*/React.createElement("span", {
    className: "ico",
    style: {
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  })) : null, /*#__PURE__*/React.createElement("span", {
    className: "t"
  }, title), actions ? /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, actions) : null) : null, padded ? /*#__PURE__*/React.createElement("div", {
    className: "card-b"
  }, children) : children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/Table.jsx
try { (() => {
function Table({
  columns,
  rows,
  selected = [],
  onRowClick,
  flip = false
}) {
  return /*#__PURE__*/React.createElement("table", {
    className: 'tbl' + (flip ? ' flip' : '')
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    className: c.num ? 'num' : undefined,
    style: c.width ? {
      width: c.width
    } : undefined
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id ?? i,
    className: (onRowClick ? 'rowlink' : '') + (selected.includes(r.id ?? i) ? ' sel' : ''),
    onClick: onRowClick ? () => onRowClick(r) : undefined
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    "data-label": c.label,
    className: c.num ? 'num' : undefined
  }, c.render ? c.render(r) : r[c.key]))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Table.jsx", error: String((e && e.message) || e) }); }

// components/layout/Tabs.jsx
try { (() => {
function Tabs({
  tabs,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tabs",
    role: "tablist"
  }, tabs.map(t => {
    const tab = typeof t === 'string' ? {
      value: t,
      label: t
    } : t;
    const on = tab.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.value,
      type: "button",
      role: "tab",
      "aria-selected": on,
      className: 'tab' + (on ? ' active' : ''),
      onClick: () => onChange && onChange(tab.value)
    }, tab.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: tab.icon,
      size: 15
    }) : null, tab.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/measurement/MetricTile.jsx
try { (() => {
const NOTE = {
  partial: 'var(--warn-fg)',
  incomplete: 'var(--warn-fg)',
  'low-confidence': 'var(--warn-fg)'
};
function MetricTile({
  label,
  value,
  unit,
  note,
  state = 'done',
  accent
}) {
  const empty = state === 'empty' || value == null;
  const word = state === 'live' && value == null;
  return /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 'var(--space-3-5) var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ds-eyebrow",
    style: {
      fontSize: 11,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, accent ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 2,
      borderRadius: 1,
      background: accent
    }
  }) : null, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-1)',
      marginTop: 'var(--space-1-5)',
      minHeight: 34
    }
  }, word ? /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 500,
      color: 'var(--fg-subtle)'
    }
  }, "warming up") : /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 24,
      fontWeight: 500,
      letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
      color: empty ? 'var(--fg-subtle)' : 'var(--fg)'
    }
  }, empty ? '—' : value), !empty && unit ? /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--fg-muted)'
    }
  }, unit) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-caption)',
      color: NOTE[state] || 'var(--fg-subtle)'
    }
  }, note ?? (state === 'done' ? '' : state.replace('-', ' '))));
}
Object.assign(__ds_scope, { MetricTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/measurement/MetricTile.jsx", error: String((e && e.message) || e) }); }

// components/measurement/PhaseStep.jsx
try { (() => {
const ST = {
  pending: {
    icon: 'circle-dashed',
    c: 'var(--fg-subtle)'
  },
  done: {
    icon: 'circle-check',
    c: 'var(--ok)'
  },
  failed: {
    icon: 'circle-x',
    c: 'var(--danger)'
  },
  cancelled: {
    icon: 'circle-minus',
    c: 'var(--fg-subtle)'
  },
  skipped: {
    icon: 'circle-minus',
    c: 'var(--fg-faint)'
  },
  capped: {
    icon: 'database',
    c: 'var(--warn)'
  }
};
const DIR = {
  download: {
    icon: 'arrow-down',
    c: 'var(--series-download)'
  },
  upload: {
    icon: 'arrow-up',
    c: 'var(--series-upload)'
  },
  latency: {
    icon: 'activity',
    c: 'var(--series-latency)'
  }
};
function PhaseStep({
  phase = 'download',
  label,
  state = 'pending',
  progress = 0,
  detail
}) {
  const s = state === 'active' ? DIR[phase] : ST[state];
  const fill = state === 'pending' || state === 'skipped' ? 0 : state === 'active' ? progress : state === 'done' ? 1 : progress;
  const bar = state === 'failed' ? 'var(--danger)' : state === 'capped' ? 'var(--warn)' : state === 'cancelled' ? 'var(--fg-faint)' : DIR[phase].c;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: s.c,
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: s.icon,
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, label || phase[0].toUpperCase() + phase.slice(1)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      marginLeft: 'auto',
      fontSize: 'var(--text-caption)',
      color: 'var(--fg-subtle)'
    }
  }, state, detail ? ' · ' + detail : '')), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      borderRadius: 2,
      background: 'var(--surface-3)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: Math.round(fill * 100) + '%',
      background: bar,
      transition: 'width var(--dur-base) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { PhaseStep });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/measurement/PhaseStep.jsx", error: String((e && e.message) || e) }); }

// components/status/Chip.jsx
try { (() => {
function Chip({
  selected = false,
  icon,
  count,
  sort = false,
  onClick,
  children
}) {
  const cls = 'chip' + (selected ? ' on' : '') + (sort ? ' sort' : '');
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }) : null, children, count != null ? /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, count) : null);
  return onClick ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cls,
    "aria-pressed": selected,
    onClick: onClick
  }, inner) : /*#__PURE__*/React.createElement("span", {
    className: cls
  }, inner);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/status/Chip.jsx", error: String((e && e.message) || e) }); }

// components/status/StatusBadge.jsx
try { (() => {
const DEF = {
  ok: 'circle-check',
  warn: 'triangle-alert',
  danger: 'circle-x',
  info: 'info',
  neutral: 'circle-dashed'
};
function StatusBadge({
  tone = 'neutral',
  icon,
  dashed = false,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'sbadge ' + tone,
    style: dashed ? {
      borderStyle: 'dashed'
    } : undefined
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || DEF[tone],
    size: 13
  }), children);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/status/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/status/StatusPill.jsx
try { (() => {
function StatusPill({
  tone = 'neutral',
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'pill ' + tone
  }, /*#__PURE__*/React.createElement("span", {
    className: "d"
  }), children);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/status/StatusPill.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/About.jsx
try { (() => {
/* BitGauge web UI kit — About
 * Props:
 *   mobile: boolean  (default false)
 *   openspeedtest: boolean  (default true)
 *   librespeed: boolean  (default true)
 *   networkquality: boolean  (default true)
 */
class About extends React.Component {
  renderVals() {
    const cm = 'var(--slate-5)',
      cmd = 'var(--teal-5)',
      tx = 'var(--slate-2)';
    const ln = (t, c) => ({
      t,
      c: c || tx
    });
    const flag = k => {
      const v = this.props[k];
      return v == null ? true : !(v === false || v === 'false' || v === '0' || v === 0);
    };
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const host = 'https://speed.home.lan';
    const on = {
      ost: flag('openspeedtest'),
      ls: flag('librespeed'),
      nq: flag('networkquality')
    };
    const clients = [{
      k: 'ost',
      name: 'OpenSpeedTest™ web UI',
      icon: 'globe',
      tag: 'Web UI',
      desc: 'Open your own self-hosted OpenSpeedTest UI and point it at this server with the Host parameter.',
      offWhat: 'The OpenSpeedTest protocol endpoints are switched off, so an OpenSpeedTest UI can’t test against this server.',
      note: 'The results link in the OpenSpeedTest UI contacts OpenSpeedTest, not this server.',
      blocks: [{
        cap: null,
        copy: 'Copy OpenSpeedTest URL',
        lines: [ln('https://ost.example.lan/?Host=' + host, cmd)]
      }]
    }, {
      k: 'ls',
      name: 'librespeed-cli',
      icon: 'terminal',
      tag: 'CLI',
      desc: 'Save this server to a local list, then run the CLI against it.',
      offWhat: 'The LibreSpeed protocol endpoints are switched off, so librespeed-cli can’t test against this server.',
      blocks: [{
        cap: 'servers.json',
        copy: 'Copy servers.json',
        lines: [ln('[{ "id": 1, "name": "Basement NAS",'), ln('   "server": "' + host + '/",'), ln('   "dlURL": "garbage", "ulURL": "empty",'), ln('   "pingURL": "empty", "getIpURL": "getIP" }]')]
      }, {
        cap: null,
        copy: 'Copy librespeed-cli command',
        lines: [ln('# --no-icmp: measure ping over HTTP', cm), ln('librespeed-cli --local-json servers.json --server 1 --no-icmp', cmd)]
      }, {
        cap: 'Or let the CLI fetch the list from this server',
        copy: 'Copy librespeed-cli command with server list URL',
        lines: [ln('librespeed-cli --server-json ' + host + '/.well-known/librespeed --server 1 --no-icmp', cmd)]
      }]
    }, {
      k: 'nq',
      name: 'macOS networkQuality',
      icon: 'monitor',
      tag: 'macOS 12+',
      desc: 'Apple’s built-in tool reports throughput and responsiveness (RPM). Point it at this server’s config.',
      offWhat: 'The networkQuality config isn’t served, so networkQuality -C can’t use this server.',
      blocks: [{
        cap: null,
        copy: 'Copy networkQuality commands',
        lines: [ln('# throughput and responsiveness', cm), ln('networkQuality -C ' + host + '/nq/config', cmd), ln('# verbose output', cm), ln('networkQuality -v -C ' + host + '/nq/config', cmd)]
      }]
    }].map(c => ({
      ...c,
      hid: 'cl-' + c.k,
      on: on[c.k],
      off: !on[c.k],
      note: c.note || null
    }));
    const names = {
      ost: 'OpenSpeedTest',
      ls: 'LibreSpeed',
      nq: 'networkQuality'
    };
    const enabled = Object.keys(on).filter(k => on[k]).map(k => names[k]);
    return {
      mobile: m,
      desktop: !m,
      L: m ? {
        pad: '16px 16px 24px',
        cols: 'minmax(0,1fr)',
        h1: 'var(--text-3xl)'
      } : {
        pad: '24px 40px 48px',
        cols: 'minmax(0,1fr) 340px',
        h1: 'var(--text-4xl)'
      },
      clients,
      facts: [['Version', 'v1.4.0 · a1b2c3d · 2026-09-30'], ['License', 'GPL-3.0-or-later'], ['Server name', 'Basement NAS'], ['Clients', enabled.length ? enabled.join(' · ') : 'None enabled']].map(([k, v]) => ({
        k,
        v
      })),
      credits: [{
        n: 'OpenSpeedTest™',
        d: 'Protocol compatibility for its web UI.'
      }, {
        n: 'LibreSpeed',
        d: 'Protocol compatibility for librespeed-cli.'
      }, {
        n: 'Cloudflare',
        d: 'AIM quality scores for streaming, gaming and video calls.'
      }, {
        n: 'Apple networkQuality and the IETF responsiveness draft',
        d: 'The RPM responsiveness metric and config format.'
      }, {
        n: 'Waveform',
        d: 'Bufferbloat grade thresholds.'
      }]
    };
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        minHeight: "100%"
      }
    }, v.desktop ? /*#__PURE__*/React.createElement(Nav, {
      variant: "top",
      active: "about"
    }) : null, v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-top",
      active: "about"
    }) : null, /*#__PURE__*/React.createElement("main", {
      style: {
        maxWidth: "1200px",
        margin: "0 auto",
        padding: v.L?.pad,
        display: "grid",
        gridTemplateColumns: v.L?.cols,
        gap: "24px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("header", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: "0",
        fontSize: v.L?.h1,
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Use with other clients"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0",
        fontSize: "var(--text-base)",
        color: "var(--fg-muted)",
        maxWidth: "640px",
        lineHeight: "1.55",
        textWrap: "pretty"
      }
    }, "This server can answer the LibreSpeed and OpenSpeedTest protocols and serve an Apple networkQuality config, so you can test against it from a terminal or another UI. The operator chooses which are on.")), (v.clients || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": c?.hid,
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("span", {
      className: "ico",
      style: {
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: c?.icon,
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: c?.hid
    }, c?.name), /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        height: "20px",
        fontSize: "10px"
      }
    }, c?.tag), c?.off ? /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        height: "20px",
        fontSize: "10px",
        background: "transparent",
        borderStyle: "dashed"
      }
    }, "Off") : null, /*#__PURE__*/React.createElement("a", {
      className: "right",
      href: "#",
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--primary-text)",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }
    }, "Docs", /*#__PURE__*/React.createElement("bg-icon", {
      name: "external-link",
      size: "12"
    }))), c?.on ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 16px 4px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, c?.desc), (c?.blocks || []).map((b, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, b?.cap ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, b?.cap) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        background: "var(--term-bg)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)"
      }
    }, /*#__PURE__*/React.createElement("pre", {
      style: {
        margin: "0",
        padding: "12px 52px 12px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        lineHeight: "1.7",
        color: "var(--term-fg)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all"
      }
    }, (b?.lines || []).map((l, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        color: l?.c
      }
    }, l?.t)))), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": b?.copy,
      style: {
        position: "absolute",
        top: "6px",
        right: "6px",
        width: "30px",
        color: "var(--slate-3)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "copy",
      size: "14"
    })))))), c?.note ? /*#__PURE__*/React.createElement("div", {
      style: {
        margin: "10px 16px 0",
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.5"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        color: "var(--info)",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "info",
      size: "14"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        textWrap: "pretty"
      }
    }, c?.note)) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "16px"
      }
    })) : null, c?.off ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 16px 16px",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        color: "var(--fg-subtle)",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-minus",
      size: "16"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "500",
        color: "var(--fg)"
      }
    }, "Not enabled on this server \u2014 the operator can enable it."), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.5"
      }
    }, c?.offWhat))) : null)))), /*#__PURE__*/React.createElement("aside", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "18px 16px 14px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "40",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-xl)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Gauge")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Self-hosted network speed test"))), /*#__PURE__*/React.createElement("dl", {
      style: {
        margin: "0",
        padding: "4px 16px 8px"
      }
    }, (v.facts || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        padding: "9px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("dt", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        flex: "none"
      }
    }, f?.k), /*#__PURE__*/React.createElement("dd", {
      style: {
        margin: "0",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg)",
        textAlign: "right",
        minWidth: "0"
      }
    }, f?.v))))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("a", {
      className: "btn secondary",
      href: "#",
      style: {
        justifyContent: "center",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "github",
      size: "15"
    }), "Source repository", /*#__PURE__*/React.createElement("bg-icon", {
      name: "external-link",
      size: "13"
    })), /*#__PURE__*/React.createElement("a", {
      className: "btn ghost sm",
      href: "#",
      style: {
        justifyContent: "center",
        textDecoration: "none"
      }
    }, "GPL-3.0 license text"))), /*#__PURE__*/React.createElement("section", {
      className: "card card-b",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "How it measures"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.55",
        textWrap: "pretty"
      }
    }, "Download and upload run over one or more HTTP streams; the warm-up is discarded before the rate is computed. Latency is measured idle over WebSocket (HTTP if unavailable), then again under load \u2014 the increase sets the bufferbloat grade. Quality ratings for streaming, gaming and video calls are derived from those numbers."), /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-sm)",
        color: "var(--primary-text)",
        textDecoration: "none"
      }
    }, "Read the methodology", /*#__PURE__*/React.createElement("bg-icon", {
      name: "external-link",
      size: "12"
    }))), /*#__PURE__*/React.createElement("section", {
      className: "card card-b",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Privacy"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.55"
      }
    }, "No accounts, no tracking, no ads. The server keeps no results \u2014 history lives only in your browser.")), /*#__PURE__*/React.createElement("section", {
      className: "card card-b",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Credits"), /*#__PURE__*/React.createElement("ul", {
      style: {
        margin: "0",
        padding: "0",
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, (v.credits || []).map((cr, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("li", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "500",
        color: "var(--primary-text)",
        textDecoration: "none"
      }
    }, cr?.n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, cr?.d))))), /*#__PURE__*/React.createElement("span", {
      style: {
        paddingTop: "10px",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, "OpenSpeedTest\u2122 is a trademark of its owner. BitGauge is an independent project, not affiliated with or endorsed by OpenSpeedTest, LibreSpeed, Cloudflare, Apple or Waveform.")))), v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-bottom",
      active: "about"
    }) : null);
  }
}
window.About = About;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/About.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/App.jsx
try { (() => {
/* BitGauge web UI kit — App
 * Mounts the clickable prototype and the Demo state panel.
 * The panel is kit-only debug scaffolding: it drives scenarios and forces the
 * states the product reaches through real conditions (offline, base-path
 * mismatch, fallbacks, history variants…). It is not a product control.
 * Anything the product itself lets you change (theme, units, test settings,
 * chart/table toggles, share, keep in history) is changed in the UI, not here.
 */
const DEMO_KEY = 'bitgauge-kit-demo';
const DEMO_DEFAULTS = {
  scenario: 'normal',
  speed: '1',
  mobile: false,
  testState: '',
  v01: false,
  cpu: false,
  errKind: 'requests',
  probe: 'auto',
  resp: 'ok',
  historyVariant: '',
  resultState: 'result',
  resultKind: 'standard',
  resultDemo: 'none',
  openspeedtest: true,
  librespeed: true,
  networkquality: true
};
const TEST_STATES = ['idle', 'countdown', 'connecting', 'latency', 'download', 'upload', 'complete', 'error', 'error-early', 'cancelled', 'cancelled-late', 'slow', 'slowdone', 'continuous', 'cont-warmup', 'cont-done', 'offline', 'basepath', 'ws-fallback', 'insufficient', 'param-ignored'];
const HISTORY_VARIANTS = ['populated', 'select3', 'deleted', 'compare', 'confirm', 'export', 'daterange', 'loading', 'nomatch', 'empty', 'unavailable', 'importing', 'importresult', 'importerror', 'safari'];
function DemoSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "demo-row"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    className: "input sm"
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => Array.isArray(o) ? /*#__PURE__*/React.createElement("option", {
    key: o[0],
    value: o[0]
  }, o[1]) : /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o)))));
}
function DemoSeg({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "demo-row"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("div", {
    className: "seg seg-sm"
  }, options.map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    type: "button",
    className: 'seg-btn' + (value === k ? ' on' : ''),
    onClick: () => onChange(k)
  }, l))));
}
function DemoCheck({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "demo-chk"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!value,
    onChange: e => onChange(e.target.checked)
  }), label);
}
function DemoPanel({
  d,
  set,
  reset
}) {
  const [open, setOpenRaw] = React.useState(() => localStorage.getItem(DEMO_KEY + '-open') === '1');
  const setOpen = o => {
    setOpenRaw(o);
    try {
      localStorage.setItem(DEMO_KEY + '-open', o ? '1' : '0');
    } catch (e) {}
  };
  return /*#__PURE__*/React.createElement("aside", {
    className: 'demo' + (open ? '' : ' closed'),
    "aria-label": "Demo state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "demo-h",
    onClick: open ? undefined : () => setOpen(true),
    style: open ? undefined : {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("bg-icon", {
    name: "sliders",
    size: "14",
    style: {
      color: 'var(--primary-text)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "t"
  }, "Demo", /*#__PURE__*/React.createElement("span", {
    className: "t-long"
  }, " state", open ? '' : ' \u00b7 ' + (d.mobile ? 'Mobile' : 'Auto') + ' \u00b7 ' + d.scenario)), open ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn ghost sm",
    onClick: reset
  }, "Reset") : null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn ghost sm icon",
    "aria-label": open ? 'Collapse demo panel' : 'Expand demo panel',
    onClick: () => setOpen(!open)
  }, /*#__PURE__*/React.createElement("bg-icon", {
    name: open ? 'chevron-down' : 'chevron-up',
    size: "14"
  }))), open ? /*#__PURE__*/React.createElement("div", {
    className: "demo-b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "Run"), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Scenario",
    value: d.scenario,
    options: ['normal', 'error', 'slow', 'autostart', 'continuous'],
    onChange: v => set({
      scenario: v,
      testState: ''
    })
  }), /*#__PURE__*/React.createElement(DemoSeg, {
    label: "Speed",
    value: d.speed,
    options: [['1', '1×'], ['2', '2×'], ['4', '4×']],
    onChange: v => set({
      speed: v
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "demo-note"
  }, "Start with the button or Enter; Escape stops.")), /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "View"), /*#__PURE__*/React.createElement(DemoSeg, {
    label: "Frame",
    value: d.mobile ? 'm' : 'd',
    options: [['d', 'Auto'], ['m', 'Mobile']],
    onChange: v => set({
      mobile: v === 'm'
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "demo-note"
  }, "Auto: desktop from 1140 px wide, mobile below.")), /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "Test screen"), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Force state",
    value: d.testState,
    options: [['', 'follow run'], ...TEST_STATES],
    onChange: v => set({
      testState: v
    })
  }), /*#__PURE__*/React.createElement(DemoCheck, {
    label: "v0.1 scope (no history)",
    value: d.v01,
    onChange: v => set({
      v01: v
    })
  }), /*#__PURE__*/React.createElement(DemoCheck, {
    label: "CPU-bound",
    value: d.cpu,
    onChange: v => set({
      cpu: v
    })
  })), "            ", /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Error kind",
    value: d.errKind,
    options: ['requests', 'unreachable', 'restarted', 'network'],
    onChange: v => set({
      errKind: v
    })
  }), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Latency probe",
    value: d.probe,
    options: ['auto', 'WebSocket', 'HTTP/2 probe', 'HTTP/1.1 reserved'],
    onChange: v => set({
      probe: v
    })
  }), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Responsiveness",
    value: d.resp,
    options: ['ok', 'uncertain', 'needs-h2', 'not-reported', 'few-samples'],
    onChange: v => set({
      resp: v
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "History"), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Force variant",
    value: d.historyVariant,
    options: [['', 'follow clicks'], ...HISTORY_VARIANTS],
    onChange: v => set({
      historyVariant: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "Result detail"), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "State",
    value: d.resultState,
    options: ['result', 'not-found', 'history-unavailable'],
    onChange: v => set({
      resultState: v
    })
  }), /*#__PURE__*/React.createElement(DemoSeg, {
    label: "Kind",
    value: d.resultKind,
    options: [['standard', 'Standard'], ['continuous', 'Continuous']],
    onChange: v => set({
      resultKind: v
    })
  }), /*#__PURE__*/React.createElement(DemoSelect, {
    label: "Demo",
    value: d.resultDemo,
    options: ['none', 'deleted', 'clipboard-denied'],
    onChange: v => set({
      resultDemo: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "demo-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st"
  }, "About \xB7 compatibility layers"), /*#__PURE__*/React.createElement(DemoCheck, {
    label: "OpenSpeedTest",
    value: d.openspeedtest,
    onChange: v => set({
      openspeedtest: v
    })
  }), /*#__PURE__*/React.createElement(DemoCheck, {
    label: "LibreSpeed",
    value: d.librespeed,
    onChange: v => set({
      librespeed: v
    })
  }), /*#__PURE__*/React.createElement(DemoCheck, {
    label: "networkQuality",
    value: d.networkquality,
    onChange: v => set({
      networkquality: v
    })
  }))) : null);
}
function App() {
  const [d, setD] = React.useState(() => {
    try {
      return Object.assign({}, DEMO_DEFAULTS, JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, DEMO_DEFAULTS);
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(d));
    } catch (e) {}
  }, [d]);
  const set = patch => setD(prev => Object.assign({}, prev, patch));
  const testExtra = {
    v01: d.v01,
    cpu: d.cpu,
    errKind: d.errKind,
    probe: d.probe,
    resp: d.resp
  };
  if (d.testState) testExtra.state = d.testState;
  const historyExtra = d.historyVariant ? {
    variant: d.historyVariant
  } : {};
  const resultExtra = {
    state: d.resultState,
    kind: d.resultKind,
    demo: d.resultDemo
  };
  const aboutExtra = {
    openspeedtest: d.openspeedtest,
    librespeed: d.librespeed,
    networkquality: d.networkquality
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Prototype, {
    scenario: d.scenario,
    speed: d.speed,
    mobile: d.mobile,
    testExtra: testExtra,
    historyExtra: historyExtra,
    resultExtra: resultExtra,
    aboutExtra: aboutExtra
  }), /*#__PURE__*/React.createElement(DemoPanel, {
    d: d,
    set: set,
    reset: () => setD(Object.assign({}, DEMO_DEFAULTS))
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/History.jsx
try { (() => {
/* BitGauge web UI kit — History
 * Props:
 *   variant: "populated" | "select3" | "deleted" | "compare" | "confirm" | "export" | "daterange" | "loading" | "nomatch" | "empty" | "unavailable" | "importing" | "importresult" | "importerror" | "safari"  (default "populated")
 *   mobile: boolean  (default false)
 *   whyOpen: boolean  (default false)
 */
class History extends React.Component {
  state = {
    why: null
  };
  renderVals() {
    const why = this.state.why ?? (this.props.whyOpen === true || this.props.whyOpen === 'true');
    const m = !!this.props.mobile && this.props.mobile !== 'false';
    const v = this.props.variant || 'populated';
    const is = k => v === k;
    const BG = window.BG;
    const L = m ? {
      pad: '16px 16px 24px',
      gap: '14px',
      h1: 'var(--text-3xl)',
      chipWrap: 'nowrap',
      filterML: '0',
      legendML: '0',
      cardPad: '14px',
      trendCols: 'minmax(0,1fr)',
      tw: 311,
      th: 120,
      thpx: '120px',
      tL: '12px',
      tR: '12px',
      tB: '76px',
      cfAlign: 'flex-end',
      cfTop: '0',
      cfW: '100%',
      cfRad: 'var(--radius-xl) var(--radius-xl) 0 0'
    } : {
      pad: '24px 40px 48px',
      gap: '18px',
      h1: 'var(--text-4xl)',
      chipWrap: 'wrap',
      filterML: 'auto',
      legendML: 'auto',
      cardPad: '16px 20px',
      trendCols: 'repeat(3, minmax(0,1fr))',
      tw: 340,
      th: 130,
      thpx: '130px',
      tL: 'auto',
      tR: '24px',
      tB: '24px',
      cfAlign: 'flex-start',
      cfTop: '140px',
      cfW: '460px',
      cfRad: 'var(--radius-xl)'
    };
    const empty = is('empty'),
      unavail = is('unavailable'),
      loading = is('loading'),
      nomatch = is('nomatch'),
      deleted = is('deleted');
    const hasData = !empty && !unavail && !loading;
    const total = deleted ? 46 : is('importresult') ? 60 : 48;
    // [date, label, down, up, lat, jit, grade, flag, day, protocol, status]
    const R = [['2026-10-08 08:41', 'VPN via 5G', 640e3, 210e3, 48, 9.4, 'D', 'Low confidence', 23, 'HTTP/2', 'complete'], ['2026-10-07 19:12', 'VPN · hotel Wi-Fi', 38.4e6, 12.1e6, 61, 4.2, 'C', null, 22, 'HTTP/1.1', 'complete'], ['2026-10-05 12:30', 'VPN via 5G', 84.2e6, 21.7e6, 39, 6.8, 'C', null, 20, 'HTTP/2', 'complete'], ['2026-10-02 09:05', 'VPN · office', 241e6, 198e6, 14, 1.9, 'B', null, 17, 'HTTP/1.1', 'complete'], ['2026-09-29 22:47', 'VPN via 5G', 52.9e6, null, 44, 7.1, 'D', null, 14, 'HTTP/2', 'partial'], ['2026-09-26 18:20', 'VPN · office', 233e6, 187e6, 15, 2.2, 'A', null, 11, 'HTTP/2', 'complete'], ['2026-09-21 07:58', 'VPN via 5G', null, null, 41, 5.9, null, null, 6, 'HTTP/2', 'error'], ['2026-09-17 13:14', 'VPN · café', 19.6e6, 4.1e6, 72, 11.3, 'F', null, 2, 'HTTP/2', 'complete']];
    const selIdx = is('select3') ? [1, 3, 5] : deleted ? [] : [3, 5];
    let list = R.map((r, i) => ({
      r,
      i,
      sel: selIdx.includes(i)
    }));
    if (deleted) list = list.filter(x => x.i !== 3 && x.i !== 5);
    const selN = selIdx.length;
    const tone = {
      'A+': 'ok',
      A: 'ok',
      B: 'ok',
      C: 'warn',
      D: 'warn',
      F: 'danger'
    };
    const fr = b => b == null ? {
      n: '—',
      u: ''
    } : BG ? BG.rate(b) : {
      n: '',
      u: ''
    };
    const ST = {
      complete: ['Complete', 'pill neutral', false],
      partial: ['Partial', 'pill warn', true],
      error: ['Error', 'pill danger', true]
    };
    const rows = list.map(({
      r,
      sel
    }) => {
      const [d, label, down, up, lat, jit, grade, flag,, proto, st] = r;
      const dn = fr(down),
        un = fr(up),
        t = grade ? tone[grade] : null,
        S = ST[st];
      return {
        d,
        label,
        down: dn.n,
        du: dn.u,
        up: un.n,
        uu: un.u,
        lat: String(lat),
        jit: jit.toFixed(1),
        grade: grade || '—',
        gAria: grade ? 'Grade ' + grade : 'No grade',
        flag,
        proto,
        st: S[0],
        stCls: S[1],
        stDot: S[2],
        stM: st !== 'complete',
        sel,
        unsel: !sel,
        cls: sel ? 'rowlink sel' : 'rowlink',
        ctx: 'VPN',
        cicon: 'shield',
        gbd: t ? `var(--${t}-border)` : 'var(--border-subtle)',
        gbg: t ? `var(--${t}-bg)` : 'transparent',
        gfg: t ? `var(--${t}-fg)` : 'var(--fg-subtle)',
        cardBd: sel ? 'var(--primary-border)' : 'var(--border-subtle)',
        cardBg: sel ? 'var(--primary-bg)' : 'var(--surface-2)'
      };
    });
    const colDefs = [['Date', 'left', true], ['Label', 'left'], ['Context', 'left'], ['Protocol', 'left'], ['Status', 'left'], ['Download', 'right'], ['Upload', 'right'], ['Latency', 'right'], ['Jitter', 'right'], ['Grade', 'center']];
    const cols = colDefs.map(([t, align, on]) => ({
      t,
      align,
      on: !!on,
      aria: on ? 'descending' : 'none',
      icon: on ? 'chevron-down' : 'arrow-up-down',
      c: on ? 'var(--primary-text)' : 'var(--fg-subtle)'
    }));
    const chips = [['All', total], ['LAN', 21], ['VPN', list.length, true], ['Wi-Fi', 13], ['Mobile', 6]].map(([t, n, on]) => ({
      t,
      n,
      cls: on ? 'chip on' : 'chip',
      pressed: on ? 'true' : 'false'
    }));
    const pts = list.slice().reverse().map(({
      r,
      sel
    }) => ({
      day: r[8],
      down: r[2],
      up: r[3],
      lat: r[4],
      done: r[10] === 'complete',
      sel
    }));
    const mkTrend = (key, title, icon, c, log) => {
      const w = L.tw,
        h = L.th,
        pl = 40,
        pr = 8,
        pt = 6,
        pb = 20,
        W = w - pl - pr,
        H = h - pt - pb;
      const X = d => pl + W * (d - 1) / 23;
      let Y, grid;
      if (log) {
        const lo = 5,
          hi = 9;
        Y = v => pt + H * (1 - (Math.log10(v) - lo) / (hi - lo));
        grid = [1e5, 1e6, 1e7, 1e8, 1e9].map(v => ({
          y: Y(v).toFixed(1),
          t: v >= 1e9 ? '1G' : v >= 1e6 ? v / 1e6 + 'M' : v / 1e3 + 'k'
        }));
      } else {
        Y = v => pt + H * (1 - v / 80);
        grid = [0, 40, 80].map(v => ({
          y: Y(v).toFixed(1),
          t: v + (v === 80 ? ' ms' : '')
        }));
      }
      const P = [];
      let line = '',
        pen = false,
        hollow = 0;
      pts.forEach(p => {
        const val = p[key];
        if (val == null) {
          pen = false;
          return;
        }
        const x = X(p.day).toFixed(1),
          y = Y(val).toFixed(1);
        line += (pen ? 'L' : 'M') + x + ' ' + y;
        pen = true;
        if (!p.done) hollow++;
        P.push({
          x,
          y,
          r: p.sel ? 4.5 : p.done ? 3 : 3.5,
          fill: p.done ? c : 'var(--surface-2)'
        });
      });
      const xt = [[2, '17 Sep'], [9, '24 Sep'], [16, '1 Oct'], [23, '8 Oct']].map(([d, t]) => ({
        x: X(d).toFixed(1),
        t
      }));
      return {
        title,
        icon,
        c,
        w,
        h,
        grid,
        pts: P,
        line,
        xt,
        x0: pl,
        x1: pl + W,
        lx: pl - 6,
        xy: h - 14,
        scale: log ? 'log' : 'linear',
        aria: `${title} trend, ${P.length} results, ${hollow} partial or error`
      };
    };
    let trends = [mkTrend('down', 'Download', 'arrow-down', 'var(--series-download)', true), mkTrend('up', 'Upload', 'arrow-up', 'var(--series-upload)', true), mkTrend('lat', 'Idle latency', 'activity', 'var(--series-latency)', false)];
    if (m) trends = trends.slice(0, 1);
    const ch = (d, w, dw) => ({
      dc: w === 'better' ? 'var(--ok-fg)' : w === 'worse' || w === 'crit' ? 'var(--warn-fg)' : w === 'differs' ? 'var(--fg-muted)' : 'var(--fg-subtle)',
      di: w === 'better' ? 'trending-up' : w === 'worse' || w === 'crit' ? 'triangle-alert' : w === 'differs' ? 'info' : 'minus',
      d,
      dw: dw || w
    });
    const CRIT = ['Label', 'Preset', 'Protocol'];
    const params = [['Label', 'VPN · office', 'VPN · office'], ['Preset', 'Standard', 'Standard'], ['Protocol', 'HTTP/2', 'HTTP/1.1'], ['Streams', '4', '4'], ['Duration', '10 s + 10 s', '10 s + 10 s'], ['Browser', 'Firefox 131', 'Safari 18']].map(([k, a, b]) => {
      const diff = a !== b,
        crit = diff && CRIT.includes(k);
      return Object.assign({
        k,
        a,
        b,
        diff,
        crit
      }, ch('', crit ? 'crit' : diff ? 'differs' : 'same', diff ? 'differs' : 'same'));
    });
    const metrics = [['Download', '233 Mbit/s', '241 Mbit/s', '+3.4%', 'better'], ['Upload', '187 Mbit/s', '198 Mbit/s', '+5.9%', 'better'], ['Idle latency', '15 ms', '14 ms', '−1 ms', 'better'], ['Jitter', '2.2 ms', '1.9 ms', '−0.3 ms', 'better'], ['Under load · download', '31 ms', '29 ms', '−2 ms', 'better'], ['Under load · upload', '58 ms', '71 ms', '+13 ms', 'worse'], ['Bufferbloat grade', 'A', 'B', '', 'worse', '1 grade worse'], ['Responsiveness', '980 RPM', '1,040 RPM', '+6%', 'better']].map(([k, a, b, d, w, dw]) => Object.assign({
      k,
      a,
      b
    }, ch(d, w, dw)));
    const cmpWarn = params.filter(p => p.crit).map(p => `different ${p.k.toLowerCase()} (${p.a} vs ${p.b})`).join('; ');
    const cmpRows = [{
      head: true,
      row: false,
      k: 'Parameters'
    }, ...params.map(p => Object.assign({
      head: false,
      row: true
    }, p)), {
      head: true,
      row: false,
      k: 'Results'
    }, ...metrics.map(p => Object.assign({
      head: false,
      row: true
    }, p))];
    const cmpCards = [{
      id: 'A',
      aria: 'Result A',
      label: 'VPN · office',
      date: '2026-09-26 18:20',
      params: params.map(p => ({
        k: p.k,
        v: p.a,
        ch: false
      })),
      metrics: metrics.map(p => ({
        k: p.k,
        v: p.a,
        ch: false
      }))
    }, {
      id: 'B',
      aria: 'Result B',
      label: 'VPN · office',
      date: '2026-10-02 09:05',
      params: params.map(p => ({
        k: p.k,
        v: p.b,
        ch: p.diff,
        dc: p.dc,
        di: p.di,
        dw: p.dw
      })),
      metrics: metrics.map(p => ({
        k: p.k,
        v: p.b,
        ch: true,
        d: p.d,
        dc: p.dc,
        di: p.di,
        dw: p.dw
      }))
    }];
    const shownN = list.length;
    const countText = empty ? '0 results' : unavail ? 'Not saved in this window' : loading ? 'Loading…' : nomatch ? `0 of ${total} shown` : `${shownN} of ${total} shown`;
    const sk = (w, f) => ({
      w,
      f
    });
    return {
      rootH: m && (is('compare') || is('confirm')) ? '100%' : 'auto',
      rootOv: m && (is('compare') || is('confirm')) ? 'hidden' : 'visible',
      mobile: m,
      desktop: !m,
      L,
      total,
      shownN,
      countText,
      isEmpty: empty,
      unavailable: unavail,
      loading,
      hasData,
      showFilters: hasData,
      noMatch: nomatch,
      showResults: hasData && !nomatch,
      showOrigin: !unavail,
      safari: is('safari'),
      importing: is('importing'),
      importResult: is('importresult'),
      importError: is('importerror'),
      importDisabled: unavail || is('importing'),
      importLabel: is('importing') ? 'Importing…' : 'Import JSON',
      whyOpen: why,
      whyAria: why ? 'true' : 'false',
      toggleWhy: () => this.setState({
        why: !why
      }),
      exportFormats: [{
        t: 'Export JSON',
        s: 'Full samples · re-importable',
        icon: 'file-json'
      }, {
        t: 'Export CSV',
        s: 'One row per test · summary only',
        icon: 'file-text'
      }],
      rows: m ? rows.slice(0, 6) : rows,
      cols,
      chips,
      trends,
      trendMeta: `${shownN} results · 17 Sep – 8 Oct`,
      hasSel: selN > 0,
      selN,
      cmpDisabled: selN !== 2,
      cmpHint: selN > 0 && selN !== 2,
      selSummary: selN === 2 ? 'VPN · office · 26 Sep and 2 Oct' : '26 Sep – 7 Oct',
      toast: deleted,
      cmpRows,
      cmpCards,
      cmpWarn,
      showCompareD: is('compare') && !m,
      showCompareM: is('compare') && m,
      showConfirm: is('confirm'),
      showExport: is('export'),
      exportAria: is('export') ? 'true' : 'false',
      showDate: is('daterange'),
      dateAria: is('daterange') ? 'true' : 'false',
      dateLabel: nomatch ? 'Last 7 days' : 'Last 30 days',
      searchVal: nomatch ? 'airport' : '',
      noMatchText: nomatch ? `Nothing labelled VPN in the last 7 days matches “airport”. All ${total} results are still in history.` : '',
      noop: () => {},
      skChips: [56, 64, 64, 72, 76].map(n => ({
        w: n + 'px'
      })),
      skTrends: m ? [1] : [1, 2, 3],
      skRows: (m ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8]).map(() => ({
        cols: [sk('16px', 'none'), sk('110px', 'none'), sk('auto', '1'), sk('52px', 'none'), sk('56px', 'none'), sk('64px', 'none'), sk('80px', 'none'), sk('80px', 'none'), sk('56px', 'none'), sk('52px', 'none'), sk('26px', 'none')]
      })),
      ranges: [['Last 7 days', 3], ['Last 30 days', 8, true], ['Last 90 days', 8], ['All time', 8]].map(([t, n, on]) => ({
        t,
        n,
        on: !!on,
        aria: on ? 'true' : 'false',
        bg: on ? 'var(--primary-bg)' : 'transparent',
        c: on ? 'var(--primary-text)' : 'var(--fg)'
      }))
    };
  }
  componentDidMount() {
    if (!window.BG) {
      this._h = () => this.forceUpdate();
      window.addEventListener('bg-lib-ready', this._h);
    }
  }
  componentWillUnmount() {
    if (this._h) window.removeEventListener('bg-lib-ready', this._h);
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        minHeight: "100%",
        height: v.rootH,
        overflow: v.rootOv,
        display: "flex",
        flexDirection: "column"
      }
    }, v.desktop ? /*#__PURE__*/React.createElement(Nav, {
      variant: "top",
      active: "history"
    }) : null, v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-top",
      active: "history"
    }) : null, /*#__PURE__*/React.createElement("main", {
      style: {
        flex: "1",
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: v.L?.pad,
        display: "flex",
        flexDirection: "column",
        gap: v.L?.gap
      }
    }, /*#__PURE__*/React.createElement("header", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: "0",
        fontSize: v.L?.h1,
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "History"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
        color: "var(--fg-subtle)"
      }
    }, v.countText)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      disabled: v.importDisabled
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "upload",
      size: "14"
    }), v.importLabel), v.hasData ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      "aria-haspopup": "menu",
      "aria-expanded": v.exportAria
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "14"
    }), "Export", /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "13"
    })), v.showExport ? /*#__PURE__*/React.createElement("div", {
      role: "menu",
      "aria-label": "Export",
      style: {
        position: "absolute",
        right: "0",
        top: "calc(100% + 6px)",
        zIndex: "20",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-pop)",
        padding: "6px",
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        width: "320px"
      }
    }, (v.exportFormats || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      role: "group",
      "aria-label": f?.t,
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "8px 10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: f?.icon,
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        color: "var(--fg)"
      }
    }, f?.t), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, f?.s))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0,1fr))",
        gap: "6px",
        paddingLeft: "26px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      role: "menuitem",
      style: {
        justifyContent: "center"
      }
    }, "All results (", v.total, ")"), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      role: "menuitem",
      style: {
        justifyContent: "center"
      }
    }, "Current filter (", v.shownN, ")"))))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: "1px",
        background: "var(--border-subtle)",
        margin: "4px 2px"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "6px 10px 4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "13",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-muted)",
        lineHeight: "1.45"
      }
    }, "Contains client IP addresses, labels and notes. Files are created in your browser."))) : null), /*#__PURE__*/React.createElement("button", {
      className: "btn danger sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "14"
    }), "Clear all")) : null)), v.showOrigin ? /*#__PURE__*/React.createElement("div", {
      role: "note",
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        background: "var(--info-bg)",
        border: "1px solid var(--info-border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--info)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "hard-drive",
      size: "16"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: "0",
        fontSize: "var(--text-sm)",
        lineHeight: "1.5"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "4px 8px"
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        color: "var(--fg)",
        fontWeight: "600"
      }
    }, "Stored only in this browser, for ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500",
        overflowWrap: "anywhere"
      }
    }, "https://speed.home.lan")), /*#__PURE__*/React.createElement("button", {
      "aria-expanded": v.whyAria,
      onClick: v.toggleWhy,
      style: {
        all: "unset",
        cursor: "pointer",
        color: "var(--info-fg)",
        textDecoration: "underline",
        textUnderlineOffset: "2px"
      }
    }, "Why?")), v.whyOpen ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)",
        maxWidth: "760px",
        textWrap: "pretty"
      }
    }, "Browsers keep site data per address — scheme, host and port. Opening BitGauge at another address, such as ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, "http://192.168.1.10:8080"), ", shows a separate, empty history. The server keeps no results. Export JSON to move them.") : null)) : null, v.safari ? /*#__PURE__*/React.createElement("div", {
      role: "note",
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "10px 12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--warn-border)",
        background: "var(--warn-bg)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 260px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        color: "var(--warn-fg)"
      }
    }, "Safari may delete this history"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, "Safari removes site data for sites you haven't opened in 7 days of browsing. Export a JSON copy to keep your results.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px",
        alignItems: "center",
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "14"
    }), "Export JSON"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Dismiss",
      style: {
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "14"
    })))) : null, v.importing ? /*#__PURE__*/React.createElement("div", {
      role: "status",
      "aria-live": "polite",
      style: {
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "upload",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 260px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Importing ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500"
      }
    }, "bitgauge-2026-10-01.json")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Checking 9 of 16 results\u2026")), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm",
      style: {
        marginLeft: "auto"
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("div", {
      role: "progressbar",
      "aria-label": "Import progress",
      "aria-valuemin": "0",
      "aria-valuemax": "16",
      "aria-valuenow": "9",
      style: {
        position: "absolute",
        left: "0",
        right: "0",
        bottom: "0",
        height: "2px",
        background: "var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: "56%",
        height: "100%",
        background: "var(--primary)"
      }
    }))) : null, v.importResult ? /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "10px 12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ok)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-check",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 260px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Imported ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500"
      }
    }, "bitgauge-2026-10-01.json")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5"
      }
    }, "12 added, 3 skipped as duplicates, 1 rejected: schema version 3 is newer than this app"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill ok",
      style: {
        height: "20px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), "12 added"), /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        height: "20px"
      }
    }, "3 skipped"), /*#__PURE__*/React.createElement("span", {
      className: "pill warn",
      style: {
        height: "20px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), "1 rejected"))), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Dismiss",
      style: {
        width: "28px",
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "14"
    }))) : null, v.importError ? /*#__PURE__*/React.createElement("div", {
      role: "alert",
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "10px 12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--danger-border)",
        background: "var(--danger-bg)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--danger)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "file-json",
      size: "18"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 260px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        color: "var(--danger-fg)"
      }
    }, "Couldn't import ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500"
      }
    }, "bitgauge-2026-10-01.csv")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5"
      }
    }, "Import accepts BitGauge JSON exports only. CSV exports are summaries and can't be restored. Nothing in your history was changed.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px",
        alignItems: "center",
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "upload",
      size: "14"
    }), "Choose another file"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Dismiss",
      style: {
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "14"
    })))) : null, v.isEmpty ? /*#__PURE__*/React.createElement("section", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "eg"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "history",
      size: "22"
    })), /*#__PURE__*/React.createElement("div", {
      className: "et"
    }, "No results yet"), /*#__PURE__*/React.createElement("div", {
      className: "em"
    }, "Each finished test is saved here automatically, with its label and note. Run a test on this device, or import a JSON export from another browser."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px",
        marginTop: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn primary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "play",
      size: "15"
    }), "Start a test"), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "upload",
      size: "15"
    }), "Import JSON")))) : null, v.unavailable ? /*#__PURE__*/React.createElement("section", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "eg"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "hard-drive",
      size: "22"
    })), /*#__PURE__*/React.createElement("div", {
      className: "et"
    }, "History isn't available in this window"), /*#__PURE__*/React.createElement("div", {
      className: "em"
    }, "The browser isn't letting this site store data \u2014 usually because this is a private window. Tests still run, and you can copy or download each result, but nothing is saved here. Open BitGauge in a normal window to keep history."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px",
        marginTop: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn primary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "play",
      size: "15"
    }), "Start a test")))) : null, v.loading ? /*#__PURE__*/React.createElement("div", {
      "aria-busy": "true",
      "aria-label": "Loading history",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: v.L?.gap
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px",
        overflow: "hidden"
      }
    }, (v.skChips || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        flex: "none",
        width: c?.w,
        height: "28px",
        borderRadius: "var(--radius-full)"
      }
    })))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        padding: v.L?.cardPad,
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        width: "180px",
        height: "14px",
        display: "block"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.trendCols,
        gap: "20px"
      }
    }, (v.skTrends || []).map((t, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        display: "block",
        height: v.L?.thpx
      }
    }))))), v.desktop ? /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "38px",
        borderBottom: "1px solid var(--border-default)"
      }
    }), (v.skRows || []).map((sr, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      className: "skel-row"
    }, (sr?.cols || []).map((sc, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        display: "block",
        height: "12px",
        width: sc?.w,
        flex: sc?.f
      }
    }))))))) : null, v.mobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }
    }, (v.skRows || []).map((sr, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "14px",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface-2)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        display: "block",
        width: "60%",
        height: "13px"
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "skel",
      style: {
        display: "block",
        width: "90%",
        height: "12px"
      }
    }))))) : null) : null, v.showFilters ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      role: "group",
      "aria-label": "Filter by label",
      style: {
        display: "flex",
        gap: "6px",
        flexWrap: v.L?.chipWrap,
        overflowX: "auto",
        maxWidth: "100%"
      }
    }, (v.chips || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: c?.cls,
      "aria-pressed": c?.pressed,
      style: {
        flex: "none"
      }
    }, c?.t, " ", /*#__PURE__*/React.createElement("span", {
      className: "n"
    }, c?.n))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        marginLeft: v.L?.filterML
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      "aria-haspopup": "dialog",
      "aria-expanded": v.dateAria,
      style: {
        height: "30px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "calendar",
      size: "14"
    }), v.dateLabel, /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "13"
    })), v.showDate ? /*#__PURE__*/React.createElement("div", {
      role: "dialog",
      "aria-label": "Date range",
      style: {
        position: "absolute",
        right: "0",
        top: "calc(100% + 6px)",
        zIndex: "20",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-pop)",
        padding: "6px",
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        width: "300px",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      role: "radiogroup",
      "aria-label": "Preset range",
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, (v.ranges || []).map((rg, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      role: "radio",
      "aria-checked": rg?.aria,
      style: {
        all: "unset",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "34px",
        padding: "0 10px",
        borderRadius: "var(--radius-md)",
        background: rg?.bg,
        color: rg?.c,
        fontSize: "var(--text-sm)",
        cursor: "pointer"
      }
    }, rg?.t, /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, rg?.n), /*#__PURE__*/React.createElement("span", {
      style: {
        width: "14px",
        display: "flex",
        color: "var(--primary-text)"
      }
    }, rg?.on ? /*#__PURE__*/React.createElement("bg-icon", {
      name: "check",
      size: "14",
      stroke: "2.25"
    }) : null))))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: "1px",
        background: "var(--border-subtle)",
        margin: "4px 2px"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: "4px 10px 2px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Custom range"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px 8px"
      }
    }, /*#__PURE__*/React.createElement("label", {
      className: "input sm mono",
      style: {
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: "2026-09-08",
      "aria-label": "From date",
      onChange: v.noop
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "\u2013"), /*#__PURE__*/React.createElement("label", {
      className: "input sm mono",
      style: {
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: "2026-10-08",
      "aria-label": "To date",
      onChange: v.noop
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "6px",
        padding: "6px 6px 2px",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary sm"
    }, "Apply"))) : null), v.desktop ? /*#__PURE__*/React.createElement("label", {
      className: "input sm",
      style: {
        height: "30px",
        width: "220px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "search",
      size: "14"
    }), /*#__PURE__*/React.createElement("input", {
      placeholder: "Search labels and notes",
      "aria-label": "Search",
      value: v.searchVal,
      onChange: v.noop
    })) : null)) : null, v.noMatch ? /*#__PURE__*/React.createElement("section", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "eg"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "search",
      size: "22"
    })), /*#__PURE__*/React.createElement("div", {
      className: "et"
    }, "No results match these filters"), /*#__PURE__*/React.createElement("div", {
      className: "em"
    }, v.noMatchText), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px",
        marginTop: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "15"
    }), "Clear filters")))) : null, v.showResults ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-label": "Trend",
      style: {
        padding: v.L?.cardPad,
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 14px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-base)",
        fontWeight: "600"
      }
    }, "Trend"), /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        gap: "5px",
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "shield",
      size: "12",
      stroke: "2"
    }), "VPN"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.trendMeta), /*#__PURE__*/React.createElement("div", {
      role: "list",
      "aria-label": "Legend",
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 14px",
        marginLeft: v.L?.legendML,
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      role: "listitem",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "var(--fg-muted)"
      }
    }), "Complete"), /*#__PURE__*/React.createElement("span", {
      role: "listitem",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "8px",
        height: "8px",
        boxSizing: "border-box",
        borderRadius: "50%",
        border: "1.5px solid var(--fg-muted)"
      }
    }), "Partial or error")), v.mobile ? /*#__PURE__*/React.createElement("div", {
      className: "seg seg-sm",
      role: "radiogroup",
      "aria-label": "Metric"
    }, /*#__PURE__*/React.createElement("button", {
      className: "seg-btn on",
      role: "radio",
      "aria-checked": "true"
    }, "Download"), /*#__PURE__*/React.createElement("button", {
      className: "seg-btn",
      role: "radio",
      "aria-checked": "false"
    }, "Upload"), /*#__PURE__*/React.createElement("button", {
      className: "seg-btn",
      role: "radio",
      "aria-checked": "false"
    }, "Latency")) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.trendCols,
        gap: "20px"
      }
    }, (v.trends || []).map((tr, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: tr?.c,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: tr?.icon,
      size: "13",
      stroke: "2"
    })), tr?.title, /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        color: "var(--fg-subtle)"
      }
    }, tr?.scale)), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: tr?.w,
      height: tr?.h,
      style: {
        display: "block",
        overflow: "visible"
      },
      role: "img",
      "aria-label": tr?.aria
    }, (tr?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: tr?.x0,
      y1: gl?.y,
      x2: tr?.x1,
      y2: gl?.y,
      style: {
        stroke: "var(--border-subtle)"
      }
    }))), /*#__PURE__*/React.createElement("path", {
      d: tr?.line,
      style: {
        fill: "none",
        stroke: tr?.c,
        strokeWidth: "1.5",
        strokeLinejoin: "round"
      }
    }), (tr?.pts || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("circle", {
      cx: p?.x,
      cy: p?.y,
      r: p?.r,
      style: {
        fill: p?.fill,
        stroke: tr?.c,
        strokeWidth: "1.5"
      }
    })))), /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: "var(--fg-subtle)"
      }
    }, (tr?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${tr?.lx ?? ""}px`,
        top: `${gl?.y ?? ""}px`,
        transform: "translate(-100%,-50%)"
      }
    }, gl?.t))), (tr?.xt || []).map((xt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${xt?.x ?? ""}px`,
        top: `${tr?.xy ?? ""}px`,
        transform: "translateX(-50%)",
        whiteSpace: "nowrap"
      }
    }, xt?.t)))))))))), v.desktop ? /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-label": "Results",
      style: {
        overflow: "hidden",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("table", {
      className: "tbl"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: {
        width: "36px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clip: "rect(0 0 0 0)"
      }
    }, "Select")), (v.cols || []).map((h, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("th", {
      "aria-sort": h?.aria,
      style: {
        textAlign: h?.align
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        color: h?.c
      }
    }, h?.t, h?.on ? /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "12",
      stroke: "2"
    }) : null)))), /*#__PURE__*/React.createElement("th", {
      style: {
        width: "40px"
      }
    }))), /*#__PURE__*/React.createElement("tbody", null, (v.rows || []).map((r, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("tr", {
      className: r?.cls
    }, /*#__PURE__*/React.createElement("td", null, r?.sel ? /*#__PURE__*/React.createElement("span", {
      role: "checkbox",
      "aria-checked": "true",
      tabIndex: "0",
      style: {
        width: "16px",
        height: "16px",
        borderRadius: "4px",
        background: "var(--primary)",
        color: "var(--primary-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "check",
      size: "12",
      stroke: "3"
    })) : null, r?.unsel ? /*#__PURE__*/React.createElement("span", {
      role: "checkbox",
      "aria-checked": "false",
      tabIndex: "0",
      style: {
        width: "16px",
        height: "16px",
        boxSizing: "border-box",
        borderRadius: "4px",
        border: "1.5px solid var(--border-strong)",
        display: "block"
      }
    }) : null), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        whiteSpace: "nowrap"
      }
    }, r?.d), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px 8px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        color: "var(--fg)",
        fontWeight: "500",
        textDecoration: "none"
      }
    }, r?.label), r?.flag ? /*#__PURE__*/React.createElement("span", {
      className: "pill warn",
      style: {
        height: "18px",
        fontSize: "10px",
        padding: "0 7px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), r?.flag) : null)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        height: "20px",
        gap: "4px",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: r?.cicon,
      size: "11",
      stroke: "2"
    }), r?.ctx)), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        whiteSpace: "nowrap"
      }
    }, r?.proto), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: r?.stCls,
      style: {
        height: "20px",
        fontSize: "10px",
        padding: "0 8px"
      }
    }, r?.stDot ? /*#__PURE__*/React.createElement("span", {
      className: "d"
    }) : null, r?.st)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r?.down, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "var(--text-micro)"
      }
    }, r?.du)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r?.up, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "var(--text-micro)"
      }
    }, r?.uu)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r?.lat, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "var(--text-micro)"
      }
    }, "ms")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r?.jit, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "var(--text-micro)"
      }
    }, "ms")), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-label": r?.gAria,
      style: {
        display: "inline-flex",
        width: "26px",
        height: "22px",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${r?.gbd ?? ""}`,
        background: r?.gbg,
        color: r?.gfg,
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "var(--text-caption)"
      }
    }, r?.grade)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": `Actions for ${r?.label ?? ""}`,
      style: {
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "ellipsis",
      size: "15"
    })))))))), v.hasSel ? /*#__PURE__*/React.createElement("div", {
      role: "toolbar",
      "aria-label": "Selection",
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 12px",
        padding: "10px 14px",
        borderTop: "1px solid var(--border-default)",
        background: "var(--surface-1)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, v.selN, " selected"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.selSummary), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px"
      }
    }, v.cmpHint ? /*#__PURE__*/React.createElement("span", {
      id: "cmp-hint",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "info",
      size: "13"
    }), "Compare needs exactly 2") : null, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, "Clear selection"), /*#__PURE__*/React.createElement("button", {
      className: "btn danger sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "14"
    }), "Delete selected"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary sm",
      disabled: v.cmpDisabled,
      "aria-describedby": "cmp-hint"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "git-compare",
      size: "14"
    }), "Compare"))) : null) : null, v.mobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", null, "Newest first"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sort-desc",
      size: "14"
    }), "Sort")), (v.rows || []).map((r, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${r?.cardBd ?? ""}`,
        background: r?.cardBg,
        color: "var(--fg)",
        textDecoration: "none",
        minHeight: "44px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: "0",
        flex: "1"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: "600",
        fontSize: "var(--text-sm)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, r?.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, r?.d, " · ", r?.proto)), r?.flag ? /*#__PURE__*/React.createElement("span", {
      className: "pill warn",
      style: {
        height: "18px",
        fontSize: "10px",
        padding: "0 7px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), r?.flag) : null, r?.stM ? /*#__PURE__*/React.createElement("span", {
      className: r?.stCls,
      style: {
        height: "18px",
        fontSize: "10px",
        padding: "0 7px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), r?.st) : null, /*#__PURE__*/React.createElement("span", {
      "aria-label": r?.gAria,
      style: {
        display: "inline-flex",
        width: "28px",
        height: "24px",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${r?.gbd ?? ""}`,
        background: r?.gbg,
        color: r?.gfg,
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "var(--text-caption)"
      }
    }, r?.grade)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0,1fr))",
        gap: "8px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "arrow-down",
      size: "12",
      stroke: "2.25"
    })), r?.down, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "10px"
      }
    }, r?.du)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--series-upload)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "arrow-up",
      size: "12",
      stroke: "2.25"
    })), r?.up, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "10px"
      }
    }, r?.uu)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--series-latency)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "activity",
      size: "12",
      stroke: "2.25"
    })), r?.lat, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "10px"
      }
    }, "ms")))))), v.hasSel ? /*#__PURE__*/React.createElement("div", {
      role: "toolbar",
      "aria-label": "Selection",
      style: {
        position: "sticky",
        bottom: "12px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 6px 6px 14px",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-3)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-md)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        marginRight: "auto"
      }
    }, v.selN, " selected"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": "Clear selection",
      style: {
        width: "44px",
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "17"
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": "Delete selected",
      style: {
        width: "44px",
        height: "44px",
        color: "var(--danger-fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "17"
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn primary",
      disabled: v.cmpDisabled,
      style: {
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "git-compare",
      size: "15"
    }), "Compare")) : null) : null) : null), v.mobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "auto",
        position: "sticky",
        bottom: "0",
        zIndex: "var(--z-nav)"
      }
    }, /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-bottom",
      active: "history"
    })) : null, v.toast ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: v.L?.tL,
        right: v.L?.tR,
        bottom: v.L?.tB,
        zIndex: "50",
        display: "flex",
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "toast info",
      role: "status",
      "aria-live": "polite",
      style: {
        maxWidth: "100%",
        boxSizing: "border-box",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "i",
      style: {
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "16",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "t"
    }, "2 results deleted."), /*#__PURE__*/React.createElement("div", {
      className: "m"
    }, "Removed from history in 8 s.")), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "undo-2",
      size: "13"
    }), "Undo"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm icon",
      "aria-label": "Dismiss"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "14"
    })))) : null, v.showCompareD ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: "0",
        background: "var(--scrim)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "64px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "cmp-t",
      style: {
        width: "760px",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-pop)",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 20px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "34px",
        height: "34px",
        borderRadius: "var(--radius-md)",
        background: "var(--primary-bg)",
        border: "1px solid var(--primary-border)",
        color: "var(--primary-text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "git-compare",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("span", {
      id: "cmp-t",
      style: {
        fontSize: "var(--text-lg)",
        fontWeight: "600"
      }
    }, "Compare results"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Change is B relative to A")), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Close",
      style: {
        marginLeft: "auto",
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "15"
    }))), v.cmpWarn ? /*#__PURE__*/React.createElement("div", {
      role: "note",
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 20px",
        background: "var(--warn-bg)",
        borderBottom: "1px solid var(--warn-border)",
        fontSize: "var(--text-sm)",
        lineHeight: "1.5"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "2px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "15",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontWeight: "600",
        color: "var(--warn-fg)"
      }
    }, "Not directly comparable:"), " ", v.cmpWarn)) : null, /*#__PURE__*/React.createElement("table", {
      className: "tbl",
      style: {
        tableLayout: "fixed"
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: {
        width: "30%",
        background: "var(--surface-2)"
      }
    }, "Metric"), /*#__PURE__*/React.createElement("th", {
      style: {
        background: "var(--surface-2)",
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "2px",
        textTransform: "none",
        letterSpacing: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "var(--fg)",
        fontWeight: "600"
      }
    }, "A \xB7 VPN \xB7 office"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "400",
        color: "var(--fg-subtle)"
      }
    }, "2026-09-26 18:20"))), /*#__PURE__*/React.createElement("th", {
      style: {
        background: "var(--surface-2)",
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "2px",
        textTransform: "none",
        letterSpacing: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "var(--fg)",
        fontWeight: "600"
      }
    }, "B \xB7 VPN \xB7 office"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "400",
        color: "var(--fg-subtle)"
      }
    }, "2026-10-02 09:05"))), /*#__PURE__*/React.createElement("th", {
      style: {
        background: "var(--surface-2)",
        textAlign: "right",
        width: "24%"
      }
    }, "Change"))), /*#__PURE__*/React.createElement("tbody", null, (v.cmpRows || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, c?.head ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      style: {
        paddingTop: "14px",
        paddingBottom: "6px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, c?.k), /*#__PURE__*/React.createElement("td", null), /*#__PURE__*/React.createElement("td", null), /*#__PURE__*/React.createElement("td", null)) : null, c?.row ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      style: {
        color: "var(--fg-muted)"
      }
    }, c?.k), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, c?.a), /*#__PURE__*/React.createElement("td", {
      className: "num",
      style: {
        color: "var(--fg)"
      }
    }, c?.b), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        color: c?.dc,
        fontSize: "var(--text-caption)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: c?.di,
      size: "13",
      stroke: "2"
    }), c?.d ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, c?.d) : null, /*#__PURE__*/React.createElement("span", null, c?.dw)))) : null)))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        padding: "14px 20px",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "copy",
      size: "14"
    }), "Copy comparison"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary"
    }, "Done")))) : null, v.showCompareM ? /*#__PURE__*/React.createElement("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "cmpm-t",
      style: {
        position: "absolute",
        inset: "0",
        zIndex: "40",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 8px 6px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      id: "cmpm-t",
      style: {
        fontSize: "var(--text-lg)",
        fontWeight: "600"
      }
    }, "Compare results"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Change is shown on B, relative to A")), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": "Close",
      style: {
        width: "44px",
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "18"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minHeight: "0",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "12px 0 16px"
      }
    }, v.cmpWarn ? /*#__PURE__*/React.createElement("div", {
      role: "note",
      style: {
        margin: "0 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "var(--warn-bg)",
        border: "1px solid var(--warn-border)",
        fontSize: "var(--text-sm)",
        lineHeight: "1.5"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "2px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "15",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontWeight: "600",
        color: "var(--warn-fg)"
      }
    }, "Not directly comparable:"), " ", v.cmpWarn)) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "0 8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": "Previous result",
      disabled: true,
      style: {
        width: "44px",
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-left",
      size: "18"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-live": "polite",
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, "Result A \xB7 1 of 2"), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        display: "flex",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "16px",
        height: "4px",
        borderRadius: "2px",
        background: "var(--primary)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "4px",
        borderRadius: "2px",
        background: "var(--border-strong)"
      }
    }))), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": "Next result",
      style: {
        width: "44px",
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-right",
      size: "18"
    }))), /*#__PURE__*/React.createElement("div", {
      role: "group",
      "aria-label": "Results, swipe to page",
      style: {
        display: "flex",
        gap: "10px",
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        padding: "0 16px",
        scrollPadding: "0 16px"
      }
    }, (v.cmpCards || []).map((cd, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("section", {
      "aria-label": cd?.aria,
      style: {
        flex: "0 0 calc(100% - 28px)",
        boxSizing: "border-box",
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
        padding: "14px",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        paddingBottom: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "26px",
        height: "26px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-3)",
        border: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "var(--text-caption)"
      }
    }, cd?.id), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, cd?.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, cd?.date))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: "8px 0 4px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Parameters"), (cd?.params || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        padding: "7px 0",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: "var(--text-sm)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)"
      }
    }, p?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "2px",
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, p?.v), p?.ch ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        color: p?.dc,
        fontSize: "var(--text-micro)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: p?.di,
      size: "11",
      stroke: "2"
    }), p?.dw) : null)))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: "12px 0 4px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Results"), (cd?.metrics || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        padding: "7px 0",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: "var(--text-sm)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)"
      }
    }, p?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "2px",
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, p?.v), p?.ch ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        color: p?.dc,
        fontSize: "var(--text-micro)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: p?.di,
      size: "11",
      stroke: "2"
    }), p?.d ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, p?.d) : null, p?.dw) : null))))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "8px",
        padding: "10px 16px 16px",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--surface-1)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      style: {
        flex: "1",
        height: "44px",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "copy",
      size: "14"
    }), "Copy"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary",
      style: {
        flex: "1",
        height: "44px",
        justifyContent: "center"
      }
    }, "Done"))) : null, v.showConfirm ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: "0",
        zIndex: "40",
        background: "var(--scrim)",
        display: "flex",
        alignItems: v.L?.cfAlign,
        justifyContent: "center",
        paddingTop: v.L?.cfTop
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "modal",
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "clr-t",
      style: {
        width: v.L?.cfW,
        maxWidth: "100%",
        boxSizing: "border-box",
        borderRadius: v.L?.cfRad
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mh"
    }, /*#__PURE__*/React.createElement("div", {
      className: "mi danger"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "mt",
      id: "clr-t"
    }, "Clear all history?"), /*#__PURE__*/React.createElement("div", {
      className: "md"
    }, "This removes ", /*#__PURE__*/React.createElement("b", null, "48 results"), " with their labels and notes from this browser. This cannot be undone. Export first if you want a copy."))), v.desktop ? /*#__PURE__*/React.createElement("div", {
      className: "mf"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "14"
    }), "Export JSON first"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1"
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary"
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "btn danger-solid"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "14"
    }), "Clear 48 results")) : null, v.mobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "4px 16px 20px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn danger-solid",
      style: {
        height: "44px",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "15"
    }), "Clear 48 results"), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      style: {
        height: "44px",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "15"
    }), "Export JSON first"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost",
      style: {
        height: "44px",
        justifyContent: "center"
      }
    }, "Cancel")) : null)) : null);
  }
}
window.History = History;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/History.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Nav.jsx
try { (() => {
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
window.BGPrefs = window.BGPrefs || React.createContext({
  theme: 'system'
});
class Nav extends React.Component {
  static contextType = window.BGPrefs;
  renderVals() {
    const v = this.props.variant || 'top';
    const active = this.props.active || 'test';
    const items = [['test', 'Test', 'gauge'], ['history', 'History', 'history'], ['settings', 'Settings', 'sliders'], ['about', 'About', 'info']].filter(([k]) => !(this.props.v01 && this.props.v01 !== 'false' && k === 'history')).map(([k, label, icon]) => ({
      label,
      icon,
      on: k === active,
      off: k !== active
    }));
    const th = this.props.theme || this.context && this.context.theme || 'system';
    const themes = [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'Follow system', 'monitor']].map(([k, label, icon]) => ({
      label,
      icon,
      on: k === th,
      off: k !== th
    }));
    const cur = themes.find(t => t.on);
    const down = this.props.status === 'offline' || this.props.status === 'unreachable';
    return {
      isTop: v === 'top',
      isMobileTop: v === 'mobile-top',
      isMobileBottom: v === 'mobile-bottom',
      items,
      themes,
      themeIcon: cur.icon,
      themeLabel: cur.label,
      down,
      dotBg: down ? 'transparent' : 'var(--ok)',
      dotBd: down ? '1.5px solid var(--warn)' : '0',
      srStatus: down ? 'unreachable' : 'connected',
      dotTitle: down ? 'Server unreachable' : 'Server connected',
      server: this.props.server || 'Basement NAS',
      host: this.props.host || 'speed.home.lan'
    };
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement(React.Fragment, null, v.isTop ? /*#__PURE__*/React.createElement("header", {
      style: {
        height: "56px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
        fontFamily: "var(--font-sans)",
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0 40px",
        display: "flex",
        alignItems: "center",
        gap: "20px"
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      "aria-label": "BitGauge home",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        textDecoration: "none",
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "28",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-lg)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Gauge"))), /*#__PURE__*/React.createElement("span", {
      style: {
        width: "1px",
        height: "20px",
        background: "var(--border-default)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      title: v.dotTitle,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        width: "7px",
        height: "7px",
        boxSizing: "border-box",
        borderRadius: "50%",
        background: v.dotBg,
        border: v.dotBd,
        flex: "none"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "500",
        color: "var(--fg)"
      }
    }, v.server), /*#__PURE__*/React.createElement("span", {
      role: "status",
      style: {
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: "0"
      }
    }, v.srStatus), v.down ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        fontSize: "var(--text-caption)",
        fontWeight: "500",
        color: "var(--warn-fg)"
      }
    }, "Unreachable") : null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.host)), /*#__PURE__*/React.createElement("nav", {
      "aria-label": "Primary",
      style: {
        marginLeft: "auto",
        display: "flex",
        gap: "2px"
      }
    }, (v.items || []).map((it, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, it?.on ? /*#__PURE__*/React.createElement("a", {
      href: "#",
      "aria-current": "page",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "7px",
        height: "32px",
        padding: "0 12px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-3)",
        color: "var(--fg)",
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: it?.icon,
      size: "15"
    }), it?.label) : null, it?.off ? /*#__PURE__*/React.createElement("a", {
      className: "hv-nav-1",
      href: "#",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "7px",
        height: "32px",
        padding: "0 12px",
        borderRadius: "var(--radius-md)",
        color: "var(--fg-muted)",
        fontSize: "var(--text-sm)",
        fontWeight: "500",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: it?.icon,
      size: "15"
    }), it?.label) : null))), /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Theme",
      style: {
        height: "30px"
      }
    }, (v.themes || []).map((t, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, t?.on ? /*#__PURE__*/React.createElement("button", {
      className: "seg-btn on",
      role: "radio",
      "aria-checked": "true",
      "aria-label": t?.label,
      style: {
        height: "28px",
        padding: "0 8px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: t?.icon,
      size: "14"
    })) : null, t?.off ? /*#__PURE__*/React.createElement("button", {
      className: "seg-btn",
      role: "radio",
      "aria-checked": "false",
      "aria-label": t?.label,
      style: {
        height: "28px",
        padding: "0 8px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: t?.icon,
      size: "14"
    })) : null))))) : null, v.isMobileTop ? /*#__PURE__*/React.createElement("header", {
      style: {
        height: "52px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "0 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
        fontFamily: "var(--font-sans)",
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "26",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
        lineHeight: "1.15"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-md)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Gauge")), /*#__PURE__*/React.createElement("span", {
      title: v.dotTitle,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        width: "6px",
        height: "6px",
        boxSizing: "border-box",
        borderRadius: "50%",
        background: v.dotBg,
        border: v.dotBd
      }
    }), v.server, /*#__PURE__*/React.createElement("span", {
      role: "status",
      style: {
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: "0"
      }
    }, v.srStatus), v.down ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: "var(--warn-fg)",
        fontWeight: "500"
      }
    }, "\xB7 Unreachable") : null)), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon",
      "aria-label": `Theme: ${v.themeLabel ?? ""}`,
      style: {
        marginLeft: "auto",
        width: "44px",
        height: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.themeIcon,
      size: "18"
    }))) : null, v.isMobileBottom ? /*#__PURE__*/React.createElement("nav", {
      "aria-label": "Primary",
      style: {
        position: "sticky",
        bottom: "0",
        zIndex: "var(--z-nav)",
        height: "64px",
        display: "grid",
        gridTemplateColumns: `repeat(${(v.items || []).length || 4}, minmax(0,1fr))`,
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
        fontFamily: "var(--font-sans)",
        paddingBottom: "4px"
      }
    }, (v.items || []).map((it, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, it?.on ? /*#__PURE__*/React.createElement("a", {
      href: "#",
      "aria-current": "page",
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        color: "var(--primary-text)",
        fontSize: "var(--text-micro)",
        fontWeight: "600",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: "-1px",
        left: "28%",
        right: "28%",
        height: "2px",
        borderRadius: "2px",
        background: "var(--primary)"
      }
    }), /*#__PURE__*/React.createElement("bg-icon", {
      name: it?.icon,
      size: "20"
    }), it?.label) : null, it?.off ? /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        color: "var(--fg-subtle)",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: it?.icon,
      size: "20"
    }), it?.label) : null))) : null);
  }
}
window.Nav = Nav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Prototype.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* BitGauge web UI kit — Prototype
 * ThemeSync mirrors the active theme onto <html> so content outside the app wrapper (Demo panel, scrollbars) follows it. */
function ThemeSync({
  theme
}) {
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return null;
}
/*
 * Props:
 *   scenario: "normal" | "error" | "slow" | "autostart" | "continuous"  (default "normal")
 *   speed: "1" | "2" | "4"  (default "1")
 *   mobile: boolean  (default false)
 * Theme, units and every test setting are real product state: they live here,
 * are changed from Settings (theme also from the header) and persist in this
 * browser, like the product does.
 */
const PREFS_KEY = 'bitgauge-kit-prefs';
const DESKTOP_MIN = 1140;
const CHIP_ICONS = {
  'Preset': 'gauge',
  'Parallel streams': 'layers',
  'Download duration': 'timer',
  'Upload duration': 'timer',
  'Phases': 'list',
  'Phase order': 'arrow-up-down',
  'Data cap': 'database',
  'Units': 'sliders',
  'Auto-start': 'play',
  'Warm-up': 'hourglass',
  'Ping count': 'activity',
  'Overhead': 'sliders'
};
class Prototype extends React.Component {
  state = Object.assign({
    screen: 'test',
    ts: 'idle',
    p: null,
    hv: 'populated',
    theme: 'dark',
    settings: null,
    changed: []
  }, (() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  })());
  savePrefs(patch) {
    this.setState(patch, () => {
      try {
        const {
          theme,
          settings,
          changed
        } = this.state;
        localStorage.setItem(PREFS_KEY, JSON.stringify({
          theme,
          settings,
          changed: changed.map(c => ({
            k: c.k,
            v: c.v
          }))
        }));
      } catch (e) {}
    });
  }
  onSettings(st, changed) {
    const patch = {
      settings: Object.assign({}, st, {
        copied: false,
        confirm: false
      }),
      changed: (changed || []).map(c => ({
        k: c.k,
        v: c.v
      }))
    };
    if (st.theme && st.theme !== this.state.theme) patch.theme = st.theme;
    this.savePrefs(patch);
  }
  prefs() {
    const s = this.state.settings,
      ch = (this.state.changed || []).filter(c => c.k !== 'Theme');
    return {
      units: s && s.units || 'bits',
      overhead: s && s.overhead && s.overhead !== '0' ? s.overhead : false,
      custom: ch.some(c => c.k !== 'Units'),
      chips: ch.length ? ch.map(c => ({
        t: c.k === 'Preset' ? c.v : c.k + ' · ' + c.v,
        icon: CHIP_ICONS[c.k] || 'sliders'
      })) : null
    };
  }
  SEQ = {
    normal: {
      segs: [['connecting', 0.6, 0.6], ['latency', 2, 2], ['download', 12, 12], ['upload', 12, 12]],
      end: 'complete'
    },
    error: {
      segs: [['connecting', 0.6, 0.6], ['latency', 2, 2], ['download', 6.4, 12]],
      end: 'error'
    },
    slow: {
      segs: [['connecting', 0.6, 0.6], ['slow', 20, 20]],
      end: 'slowdone'
    },
    countdown: {
      segs: [['countdown', 3, 3]],
      end: null,
      then: 'normal'
    },
    continuous: {
      segs: [],
      end: 'continuous'
    }
  };
  scen() {
    return this.props.scenario || 'normal';
  }
  speed() {
    return parseFloat(this.props.speed || '1') || 1;
  }
  componentDidMount() {
    this._k = e => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      // Escape stops a run or cancels the countdown from anywhere (dialogs handle their own Escape first).
      if (e.key === 'Escape') {
        if (this.running() || this.state.ts === 'continuous') this.stop();
        return;
      }
      if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (this.state.screen !== 'test' || this.running()) return;
      if (document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
      // Only from the page body or a non-interactive element; focused links/buttons/fields keep native Enter.
      const t = e.target;
      if (t && t.closest && t.closest('a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"], [role="textbox"]')) return;
      e.preventDefault();
      this.start();
    };
    window.addEventListener('keydown', this._k);
    // Desktop layouts are fully supported from DESKTOP_MIN px; narrower windows switch to the mobile layout.
    this._rs = () => {
      const n = window.innerWidth < DESKTOP_MIN;
      if (n !== this.state.narrow) this.setState({
        narrow: n
      });
    };
    window.addEventListener('resize', this._rs);
    this._rs();
    this.reset();
  }
  componentDidUpdate(pp) {
    if (pp.scenario !== this.props.scenario) this.reset();
  }
  componentWillUnmount() {
    clearInterval(this._t);
    window.removeEventListener('keydown', this._k);
    window.removeEventListener('resize', this._rs);
  }
  running() {
    return !!this._t;
  }
  halt() {
    clearInterval(this._t);
    this._t = null;
  }
  reset() {
    this.halt();
    if (this.scen() === 'autostart') this.run('countdown');else this.setState({
      ts: 'idle',
      p: null
    });
  }
  start(forceNormal) {
    const s = this.scen();
    this.run(forceNormal || s === 'autostart' ? 'normal' : s);
  }
  run(name) {
    this.halt();
    const q = this.SEQ[name];
    if (!q.segs.length) {
      this.setState({
        screen: 'test',
        ts: q.end,
        p: null
      });
      return;
    }
    let i = 0,
      el = 0;
    this.setState({
      screen: 'test',
      ts: q.segs[0][0],
      p: 0
    });
    this._t = setInterval(() => {
      el += 0.1 * this.speed();
      const seg = q.segs[i];
      if (el >= seg[1]) {
        i++;
        el = 0;
        if (i >= q.segs.length) {
          this.halt();
          if (q.then) return this.run(q.then);
          return this.setState({
            ts: q.end,
            p: null
          });
        }
      }
      const cur = q.segs[i];
      this.setState({
        ts: cur[0],
        p: Math.min(1, el / cur[2])
      });
    }, 100);
  }
  stop() {
    if (!this.running() && this.state.ts !== 'continuous') return;
    const ts = this.state.ts;
    this.halt();
    // Upload needs a confirmed steady window ≥ 3 s (warm-up ends ~4 s) for a partial value.
    const late = ts === 'upload' && (this.state.p || 0) * 12 >= 8.5;
    this.setState({
      ts: ts === 'upload' ? late ? 'cancelled-late' : 'cancelled' : 'idle',
      p: null
    });
  }
  setTheme(theme) {
    this.savePrefs({
      theme,
      settings: this.state.settings ? Object.assign({}, this.state.settings, {
        theme
      }) : this.state.settings
    });
  }
  go(screen, extra) {
    this.setState(Object.assign({
      screen
    }, extra || {}));
    window.scrollTo(0, 0);
  }
  route(t, el) {
    const S = this.state.screen,
      has = (...a) => a.some(x => t === x),
      sw = (...a) => a.some(x => t.startsWith(x));
    if (t === 'BitGauge home' || t === 'Test') return this.go('test');
    if (t === 'History') return this.go('history', {
      hv: 'populated'
    });
    if (t === 'Settings') return this.go('settings');
    if (t === 'About') return this.go('about');
    if (has('Light', 'Dark', 'Follow system')) return this.setTheme(t === 'Light' ? 'light' : t === 'Dark' ? 'dark' : 'system');
    if (sw('Theme:')) {
      const o = ['light', 'dark', 'system'],
        c = this.theme();
      return this.setTheme(o[(o.indexOf(c) + 1) % 3]);
    }
    if (sw('Retry test')) return this.start(true);
    if (sw('Start test', 'Start now', 'Run again', 'Start a test')) return this.start();
    if (sw('Stop test')) return this.stop();
    if (sw('Details', 'Last test')) return this.go('result');
    if (sw('Keep as incomplete')) return this.go('history', {
      hv: 'populated'
    });
    if (sw('Edit', 'Change cap')) return this.go('settings');
    if (S === 'test' && t === 'Cancel') {
      this.halt();
      return this.setState({
        ts: 'idle',
        p: null
      });
    }
    if (S === 'history') {
      const hv = this.state.hv,
        set = v => this.setState({
          hv: v
        });
      if (t === 'Compare') return set('compare');
      if (has('Done', 'Close', 'Cancel', 'Apply', 'Dismiss', 'Choose another file', 'Export JSON first', 'Clear selection')) return set('populated');
      if (t === 'Clear all') return set('confirm');
      if (sw('Clear 48')) return set('empty');
      if (sw('Export JSON', 'Export CSV')) return set('populated');
      if (sw('Export')) return set(hv === 'export' ? 'populated' : 'export');
      if (sw('Last 30 days')) return set(hv === 'daterange' ? 'populated' : 'daterange');
      if (sw('Import JSON')) return set('importerror');
      if (el.tagName === 'A' && el.closest('main')) return this.go('result');
    }
  }
  theme() {
    return this.state.theme || 'dark';
  }
  renderVals() {
    const m = !!this.props.mobile && this.props.mobile !== 'false' || !!this.state.narrow;
    const th = this.theme();
    const sysDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    const S = this.state.screen;
    return {
      ts: this.state.ts,
      p: this.state.p,
      hv: this.state.hv,
      mobile: m,
      theme: th,
      themeAttr: th === 'system' ? sysDark ? 'dark' : 'light' : th,
      frameW: m && !this.state.narrow ? '390px' : 'none',
      frameBd: m && !this.state.narrow ? '1px solid var(--border-subtle)' : 'none',
      testExtra: Object.assign(this.prefs(), this.props.testExtra),
      saved: this.state.settings,
      onSettings: (st, ch) => this.onSettings(st, ch),
      historyExtra: this.props.historyExtra,
      resultExtra: this.props.resultExtra,
      settingsExtra: this.props.settingsExtra,
      aboutExtra: this.props.aboutExtra,
      isTest: S === 'test',
      isHistory: S === 'history',
      isResult: S === 'result',
      isSettings: S === 'settings',
      isAbout: S === 'about',
      onClick: e => {
        const el = e.target.closest && e.target.closest('a,button');
        if (!el) return;
        if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
        const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        this.route(t, el);
      }
    };
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement(BGPrefs.Provider, {
      value: {
        theme: v.theme
      }
    }, /*#__PURE__*/React.createElement(ThemeSync, {
      theme: v.themeAttr
    }), /*#__PURE__*/React.createElement("div", {
      "data-theme": v.themeAttr,
      onClickCapture: v.onClick,
      style: {
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        maxWidth: v.frameW,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        borderLeft: v.frameBd,
        borderRight: v.frameBd
      }
    }, v.isTest ? /*#__PURE__*/React.createElement(TestScreen, _extends({
      state: v.ts,
      progress: v.p,
      mobile: v.mobile,
      theme: v.theme
    }, v.testExtra || {})) : null, v.isHistory ? /*#__PURE__*/React.createElement(History, _extends({
      variant: v.hv,
      mobile: v.mobile
    }, v.historyExtra || {})) : null, v.isResult ? /*#__PURE__*/React.createElement(ResultDetail, _extends({
      mobile: v.mobile
    }, v.resultExtra || {})) : null, v.isSettings ? /*#__PURE__*/React.createElement(Settings, _extends({
      mobile: v.mobile,
      preset: "standard",
      theme: v.theme,
      saved: v.saved,
      onSettings: v.onSettings
    }, v.settingsExtra || {})) : null, v.isAbout ? /*#__PURE__*/React.createElement(About, _extends({
      mobile: v.mobile
    }, v.aboutExtra || {})) : null)));
  }
}
window.Prototype = Prototype;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Prototype.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ResultDetail.jsx
try { (() => {
/* BitGauge web UI kit — ResultDetail
 * Props:
 *   mobile: boolean  (default false)
 *   state: "result" | "not-found" | "history-unavailable"  (default "result")
 *   kind: "standard" | "continuous"  (default "standard")
 *   tableView: boolean  (default false)
 *   includeLabel: boolean  (default false)
 *   demo: "none" | "deleted" | "clipboard-denied"  (default "none")
 */
class ResultDetail extends React.Component {
  state = {
    views: null,
    inc: null,
    clipDenied: null,
    toast: null,
    del: null,
    delN: 8,
    paramsOpen: false,
    note: null
  };
  preRef = React.createRef();
  componentDidMount() {
    if (!window.BG) {
      this._h = () => this.forceUpdate();
      window.addEventListener('bg-lib-ready', this._h);
    }
    this._sel();
  }
  componentDidUpdate() {
    this._sel();
  }
  componentWillUnmount() {
    if (this._h) window.removeEventListener('bg-lib-ready', this._h);
    clearTimeout(this._tt);
    clearInterval(this._di);
  }
  on(v) {
    return !!v && v !== 'false';
  }
  denied() {
    return this.state.clipDenied ?? this.props.demo === 'clipboard-denied';
  }
  // Clipboard fallback: select the summary text so the user can copy it by hand.
  _sel() {
    const el = this.preRef.current;
    if (!this.denied()) {
      this._selDone = false;
      return;
    }
    if (el && !this._selDone) {
      this._selDone = true;
      try {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } catch (e) {}
    }
  }
  toast(t) {
    clearTimeout(this._tt);
    this.setState({
      toast: t
    });
    this._tt = setTimeout(() => this.setState({
      toast: null
    }), 4000);
  }
  renderVals() {
    const BG = window.BG,
      on = v => this.on(v);
    const m = on(this.props.mobile),
      tv = on(this.props.tableView);
    const st = this.props.state || 'result',
      hu = st === 'history-unavailable',
      cont = this.props.kind === 'continuous';
    const delSt = this.state.del ?? (this.props.demo === 'deleted' ? 'pending' : 'none');
    const notFound = st === 'not-found' || delSt === 'done';
    const inc = this.state.inc ?? on(this.props.includeLabel);
    const denied = this.denied();
    const L = m ? {
      pad: '14px 16px 24px',
      h1: 'var(--text-3xl)',
      cols: 'minmax(0,1fr)',
      tileCols: 'repeat(2, minmax(0,1fr))',
      tileGap: '10px',
      tileNum: '24px',
      midCols: 'minmax(0,1fr)',
      chartCols: 'minmax(0,1fr)',
      confCols: 'minmax(0,1fr)',
      nfMargin: '40px auto'
    } : {
      pad: '20px 40px 48px',
      h1: 'var(--text-4xl)',
      cols: 'minmax(0,1fr) 352px',
      tileCols: 'repeat(4, minmax(0,1fr))',
      tileGap: '12px',
      tileNum: '28px',
      midCols: 'minmax(0,1.4fr) minmax(0,1fr)',
      chartCols: 'repeat(2, minmax(0,1fr))',
      confCols: 'repeat(2, minmax(0,1fr))',
      nfMargin: '96px auto'
    };
    const mb = v => v / 1e6,
      rn = v => v == null ? '—' : mb(v) >= 100 ? String(Math.round(mb(v))) : mb(v).toFixed(1),
      rs = v => v == null ? '—' : rn(v) + ' Mbit/s';
    const jit = v => v < 10 ? v.toFixed(1) : String(Math.round(v));
    const med = a => {
      if (!a.length) return null;
      const s = a.slice().sort((x, y) => x - y),
        h = s.length >> 1;
      return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
    };
    const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
    const T = {
      ok: 'var(--ok)',
      warn: 'var(--warn)',
      danger: 'var(--danger)',
      info: 'var(--info)',
      neutral: 'var(--fg-subtle)'
    };
    const it = (tone, icon, title, body) => ({
      c: T[tone],
      icon,
      title,
      body
    });

    // Continuous: stored 1-min cells from warm-up end (3 s); cells 12–13 unknown; data cap ends the run at 27:43.
    const CWU = 3,
      CEND = 1663,
      cells = [];
    for (let i = 0; CWU + 60 * i < CEND; i++) {
      const a = CWU + 60 * i,
        b = Math.min(a + 60, CEND),
        unk = i === 12 || i === 13;
      cells.push({
        a,
        b,
        known: unk ? 0 : b - a,
        v: unk ? null : 412e6 + 26e6 * Math.sin(i * 0.7) + 11e6 * Math.cos(i * 2.3) - (i >= 4 && i <= 9 ? 31e6 : 0),
        l: unk ? null : 17 + 3.5 * Math.sin(i * 1.3) + i % 5 * 0.5
      });
    }
    const kc = cells.filter(c => c.known),
      cAvg = kc.reduce((s, c) => s + c.v * c.known, 0) / kc.reduce((s, c) => s + c.known, 0);
    const D = cont ? {
      label: 'Overnight check',
      ctx: 'LAN',
      ctxIcon: 'house',
      when: 'Thu 8 Oct 2026 · 01:00:04',
      abs: '2026-10-08 01:00:04 CEST',
      crumb: '2026-10-08 01:00',
      short: 'Thu 8 Oct 2026 · 01:00',
      file: 'bitgauge-2026-10-08-0100',
      preset: 'Continuous',
      server: 'Basement NAS',
      note: 'Checking whether the evening dip comes back after midnight.',
      down: cAvg,
      up: null,
      worst: ['download', 15]
    } : {
      label: 'Home Wi-Fi',
      ctx: 'LAN',
      ctxIcon: 'house',
      when: 'Thu 8 Oct 2026 · 14:02:11',
      abs: '2026-10-08 14:02:11 CEST',
      crumb: '2026-10-08 14:02',
      short: 'Thu 8 Oct 2026 · 14:02',
      file: 'bitgauge-2026-10-08-1402',
      preset: 'Standard',
      server: 'Basement NAS',
      note: 'Office desk, 5 GHz. Router is in the hallway, one wall between.',
      down: 612e6,
      up: 438e6,
      worst: ['upload', 39]
    };
    const IDLE = 3.1,
      JIT = 0.8;
    const worstStr = '+' + D.worst[1] + ' ms loaded (' + D.worst[0] + ')';
    const summary = ['BitGauge' + (inc ? ' · ' + D.label : ''), D.short, 'Download ' + rs(D.down) + ' · Upload ' + rs(D.up), 'Idle latency ' + IDLE.toFixed(1) + ' ms · Jitter ' + jit(JIT) + ' ms', 'Loaded latency +' + D.worst[1] + ' ms (' + D.worst[0] + ')', 'Bufferbloat grade B · Mild', 'Server: ' + D.server].join('\n');
    const tiles = [{
      label: cont ? 'Download · average' : 'Download',
      icon: 'arrow-down',
      ic: 'var(--series-download)',
      num: rn(D.down),
      unit: 'Mbit/s',
      nc: 'var(--fg)',
      sub: cont ? 'time-weighted over ' + kc.length + ' of ' + cells.length + ' cells · 6 streams' : 'peak 641 · 6 streams · plateau: no-gain'
    }, cont ? {
      label: 'Upload',
      icon: 'arrow-up',
      ic: 'var(--series-upload)',
      num: '—',
      unit: '',
      nc: 'var(--fg-subtle)',
      sub: 'not measured · Continuous runs one direction'
    } : {
      label: 'Upload',
      icon: 'arrow-up',
      ic: 'var(--series-upload)',
      num: '438',
      unit: 'Mbit/s',
      nc: 'var(--fg)',
      sub: 'peak 455 · 6 streams · plateau: no-gain · 12.3 of 14.5 s known'
    }, {
      label: 'Idle latency',
      icon: 'activity',
      ic: 'var(--series-latency)',
      num: IDLE.toFixed(1),
      unit: 'ms',
      nc: 'var(--fg)',
      sub: 'min 2.4 · p90 4.1 ms · WebSocket · 0 % probe timeouts'
    }, {
      label: 'Jitter',
      icon: 'activity',
      ic: 'var(--series-latency)',
      num: jit(JIT),
      unit: 'ms',
      nc: 'var(--fg)',
      sub: 'mean of consecutive differences'
    }];
    const loadRows = [{
      icon: 'arrow-down',
      ic: 'var(--primary-text)',
      label: 'During download · WebSocket',
      sub: 'p90 24 · +15 ms vs idle',
      num: '18',
      unit: 'ms'
    }];
    if (!cont) loadRows.push({
      icon: 'arrow-up',
      ic: 'var(--series-upload)',
      label: 'During upload · WebSocket',
      sub: 'p90 55 · +39 ms vs idle',
      num: '42',
      unit: 'ms'
    });
    const rpm = [{
      icon: 'arrow-down',
      ic: 'var(--series-download)',
      num: '1,420'
    }].concat(cont ? [] : [{
      icon: 'arrow-up',
      ic: 'var(--series-upload)',
      num: '980'
    }]);
    const conf = cont ? {
      label: 'Medium confidence',
      tone: 'neutral'
    } : {
      label: 'High confidence',
      tone: 'ok'
    };
    const confGroups = cont ? [{
      h: 'Confidence reasons',
      items: [it('warn', 'circle-alert', '26 of 28 cells have known time', 'Cells 12:03–14:03 have no known time and are left out of the average.'), it('ok', 'circle-check', 'Throughput stable across cells', 'Known cells stay within 12 % of the average.'), it('ok', 'circle-check', 'Idle latency from 20 of 20 pings', 'No probe timeouts.'), it('ok', 'circle-check', 'Precise timers', 'Timer resolution 0.02 ms; the page is cross-origin isolated.')]
    }, {
      h: 'Notices',
      items: [it('warn', 'database', 'Data cap reached at 27:43', 'The 80 GB cap ended the run. The last cell covers 40 s, not a full minute.'), it('warn', 'pause', 'No data from 12:03 to 14:03', 'The tab was in the background and the browser throttled requests.'), it('neutral', 'circle-dashed', 'Upload not measured', 'Continuous runs one direction.'), it('neutral', 'circle-dashed', 'Packet loss not measured', 'Browsers can’t see packet loss over TCP, so the grade is an upper bound.'), it('neutral', 'gauge', 'Connection sharing not verifiable', 'Responsiveness ran over HTTP/2; the browser doesn’t report whether probes shared the load connections.')]
    }] : [{
      h: 'Confidence reasons',
      items: [it('ok', 'circle-check', 'Both directions reached a plateau', 'Adding streams stopped helping at 6 (no-gain), inside the 20 s maximum.'), it('warn', 'circle-alert', '85 % of upload time known', '2.2 s of 14.5 s is unknown after a failed request. The average uses known time only.'), it('ok', 'circle-check', 'Idle latency from 20 of 20 pings', 'No probe timeouts.'), it('ok', 'circle-check', 'Precise timers', 'Timer resolution 0.02 ms; the page is cross-origin isolated.')]
    }, {
      h: 'Notices',
      items: [it('danger', 'circle-x', 'Upload request failed at 7.4 s', 'It was retried. 7.4–9.6 s has no known data and is drawn as a gap.'), it('info', 'timer', 'Upload extended to 16 s', 'Throughput was still rising at 12 s, so the phase ran longer.'), it('neutral', 'circle-dashed', 'Packet loss not measured', 'Browsers can’t see packet loss over TCP, so the grade is an upper bound.'), it('neutral', 'gauge', 'Connection sharing not verifiable', 'Responsiveness ran over HTTP/2; the browser doesn’t report whether probes shared the load connections.'), it('neutral', 'sliders', 'Overhead compensation on', 'Throughput includes an estimated 2.6 % for HTTP/2 and TLS framing.')]
    }];
    const P = (h, rows) => ({
      h,
      rows: rows.map(([k, v]) => ({
        k,
        v
      }))
    });
    const params = cont ? [P('Test', [['Preset', 'Continuous'], ['Phases and order', 'Idle latency → Download (continuous)'], ['Streams', 'Auto · 6 · plateau: no-gain']]), P('Limits', [['Duration', '27:43 · no maximum · ended by data cap'], ['Cell size', '1 min'], ['Data cap', '80 GB · reached']]), P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Fixed · 3 s'], ['Ping count', '20'], ['Overhead compensation', 'On · +2.6 %'], ['Protocol', 'HTTP/2']]), P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', 'Firefox 131 · Linux'], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']])] : [P('Test', [['Preset', 'Standard'], ['Phases and order', 'Idle latency → Download → Upload'], ['Streams', 'Auto · 6 · plateau: no-gain']]), P('Limits', [['Download', '12.0 s · min 8 · max 20'], ['Upload', '16.0 s · min 8 · max 20 · extended'], ['Data cap', '5 GB · 1.48 GB used']]), P('Measurement', [['Units', 'Bits · Mbit/s'], ['Warm-up', 'Auto · 1.5 s'], ['Ping count', '20'], ['Overhead compensation', 'On · +2.6 %'], ['Protocol', 'HTTP/2']]), P('Environment', [['Server', 'Basement NAS · v1.4.0'], ['Browser', 'Firefox 131 · Linux'], ['Client IP', '192.168.1.42'], ['Timer resolution', '0.02 ms'], ['Cross-origin isolated', 'Yes']])];
    let toast = this.state.toast;
    if (delSt === 'pending') toast = {
      kind: 'info',
      icon: 'trash',
      t: 'Result deleted.',
      m: 'Removed from history in ' + this.state.delN + ' s.',
      undo: true
    };
    const commit = () => {
      clearInterval(this._di);
      this.setState({
        del: 'done',
        toast: null
      });
    };
    const base = {
      mobile: m,
      desktop: !m,
      L,
      D,
      hu,
      canEdit: !hu,
      found: !notFound,
      notFound,
      nf: delSt === 'done' ? {
        icon: 'trash',
        title: 'Result deleted',
        body: 'It has been removed from history in this browser.'
      } : {
        icon: 'search',
        title: 'Result not found',
        body: 'This result isn’t in this browser’s history. It may have been deleted, or saved in a different browser.'
      },
      dimOp: delSt === 'pending' ? '0.45' : '1',
      tiles,
      loadRows,
      rpm,
      rpmSub: cont ? 'round trips per minute, download only' : 'round trips per minute, one per direction',
      fit: [['Streaming', 'tv', 'Great', 'ok', 'circle-check'], ['Gaming', 'gamepad', 'Good', 'ok', 'circle-check'], ['Video calls', 'video', 'Great', 'ok', 'circle-check']].map(([label, icon, rating, tone, ricon]) => ({
        label,
        icon,
        rating,
        cls: 'sbadge ' + tone,
        ricon
      })),
      conf,
      confGroups,
      params,
      summary,
      inc,
      denied,
      note: this.state.note ?? D.note,
      setNote: e => this.setState({
        note: e.target.value
      }),
      toggleInc: () => this.setState({
        inc: !inc
      }),
      shareBlocks: [{
        k: '↓ DOWNLOAD',
        c: 'var(--series-download)',
        n: rn(D.down),
        u: 'Mbit/s'
      }, {
        k: '↑ UPLOAD',
        c: 'var(--series-upload)',
        n: rn(D.up),
        u: D.up == null ? '' : 'Mbit/s'
      }],
      shareFoot: [IDLE.toFixed(1) + ' ms idle', jit(JIT) + ' ms jitter', worstStr],
      shareAria: 'Share image: ' + summary.replace(/\n/g, ', '),
      preRef: this.preRef,
      preOutline: denied ? '2px solid var(--ring)' : 'none',
      paramsShown: !m || this.state.paramsOpen,
      paramsAria: this.state.paramsOpen ? 'true' : 'false',
      paramsChevron: this.state.paramsOpen ? 'chevron-up' : 'chevron-down',
      paramsBorder: this.state.paramsOpen ? '1px solid var(--border-subtle)' : '0',
      toggleParams: () => this.setState(s => ({
        paramsOpen: !s.paramsOpen
      })),
      toast,
      dismiss: () => {
        if (delSt === 'pending') commit();else {
          clearTimeout(this._tt);
          this.setState({
            toast: null
          });
        }
      },
      undo: () => {
        clearInterval(this._di);
        this.setState({
          del: 'none'
        });
        this.toast({
          kind: 'ok',
          icon: 'circle-check',
          t: 'Result restored.'
        });
      },
      del: () => {
        clearInterval(this._di);
        clearTimeout(this._tt);
        this.setState({
          del: 'pending',
          delN: 8,
          toast: null
        });
        this._di = setInterval(() => {
          if (this.state.delN <= 1) commit();else this.setState(s => ({
            delN: s.delN - 1
          }));
        }, 1000);
      },
      copy: () => {
        const ok = () => {
          this.setState({
            clipDenied: false
          });
          this.toast({
            kind: 'ok',
            icon: 'circle-check',
            t: 'Summary copied.'
          });
        };
        const no = () => {
          this._selDone = false;
          this.setState({
            clipDenied: true
          });
        };
        try {
          navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(summary).then(ok, no) : no();
        } catch (e) {
          no();
        }
      },
      share: () => {
        if (navigator.share) navigator.share({
          title: 'BitGauge result',
          text: summary
        }).catch(() => {});else this.toast({
          kind: 'info',
          icon: 'info',
          t: 'Sharing isn’t available in this browser.',
          m: 'Use Download image or Copy instead.'
        });
      },
      dlImg: () => this.toast({
        kind: 'ok',
        icon: 'circle-check',
        t: 'Image downloaded.',
        m: D.file + '.png'
      }),
      dlJson: () => {
        const obj = {
          format: 'bitgauge-result',
          version: 1,
          startedAt: D.abs,
          label: D.label,
          note: this.state.note ?? D.note,
          preset: D.preset,
          server: {
            name: D.server,
            version: '1.4.0'
          },
          download_bps: Math.round(D.down),
          upload_bps: D.up,
          idle_latency_ms: IDLE,
          jitter_ms: JIT,
          grade: 'B',
          params: params.flatMap(g => g.rows)
        };
        try {
          const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {
            type: 'application/json'
          }));
          const a = document.createElement('a');
          a.href = u;
          a.download = D.file + '.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        } catch (e) {}
        this.toast({
          kind: 'ok',
          icon: 'circle-check',
          t: 'JSON downloaded.',
          m: D.file + '.json'
        });
      }
    };
    if (!BG) return Object.assign(base, {
      charts: []
    });

    // ---------- charts ----------
    const EV = {
      extended: {
        icon: 'timer',
        c: 'var(--info)',
        fg: 'var(--info-fg)',
        bd: 'var(--info-border)',
        t: 'Extended'
      },
      cap: {
        icon: 'database',
        c: 'var(--warn)',
        fg: 'var(--warn-fg)',
        bd: 'var(--warn-border)',
        t: 'Data cap'
      },
      cancelled: {
        icon: 'square',
        c: 'var(--fg-muted)',
        fg: 'var(--fg-muted)',
        bd: 'var(--border-strong)',
        t: 'Cancelled'
      },
      error: {
        icon: 'circle-x',
        c: 'var(--danger)',
        fg: 'var(--danger-fg)',
        bd: 'var(--danger-border)',
        t: 'Error'
      }
    };
    const split = pts => {
      const out = [];
      let cur = [];
      pts.forEach(p => {
        if (p[1] == null) {
          if (cur.length) out.push(cur);
          cur = [];
        } else cur.push(p);
      });
      if (cur.length) out.push(cur);
      return out;
    };
    const view = key => (this.state.views || {})[key] ?? (key === 'down' && tv ? 'table' : 'chart');
    const setView = (key, v) => () => this.setState(s => ({
      views: Object.assign({}, s.views || {}, {
        [key]: v
      })
    }));
    const C = (al, c) => v => ({
      v,
      al,
      c
    });
    const cL = C('left', 'var(--fg-muted)'),
      cK = C('right', 'var(--fg-muted)'),
      cV = C('right', 'var(--fg)');
    const mk = o => {
      const known = o.pts.filter(p => p[1] != null);
      const ym = BG.niceMax(Math.max(...known.map(p => p[1])) * 1.08);
      const latK = o.lat ? o.lat.filter(p => p[1] != null) : null;
      const lm = latK ? BG.niceMax(Math.max(...latK.map(p => p[1])) * 1.9) : null;
      const g = BG.chart({
        w: o.w,
        h: o.h,
        xMax: o.xMax,
        series: [known],
        yMax: ym,
        lat: latK,
        latMax: lm,
        ms: o.ms,
        xStep: o.xStep,
        xLabel: o.xLabel
      });
      const X = t => g.plotL + (g.plotR - g.plotL) * t / o.xMax,
        Y = v => g.plotT + (g.plotB - g.plotT) * (1 - v / ym),
        LY = v => g.plotT + (g.plotB - g.plotT) * (1 - v / lm);
      const path = (s, f) => s.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + f(p[1]).toFixed(1)).join('');
      const S = split(o.pts),
        H = g.plotB - g.plotT;
      const segs = S.map(s => {
        const l = path(s, Y);
        return {
          line: l,
          area: l + 'L' + X(s[s.length - 1][0]).toFixed(1) + ' ' + g.plotB + 'L' + X(s[0][0]).toFixed(1) + ' ' + g.plotB + 'Z'
        };
      });
      const gaps = [];
      for (let i = 1; i < S.length; i++) {
        const x0 = X(S[i - 1][S[i - 1].length - 1][0]),
          x1 = X(S[i][0][0]);
        gaps.push({
          x: x0.toFixed(1),
          w: (x1 - x0).toFixed(1),
          y: g.plotT,
          h: H
        });
      }
      // Chips go right of the line unless they'd pass plotR; overlapping chips stagger down one row.
      const placed = [];
      const marks = (o.marks || []).map(([t, type]) => {
        const e = EV[type],
          x = X(t),
          cwid = e.t.length * 6 + 22,
          left = x + 4 + cwid > g.plotR;
        const x0 = left ? x - 4 - cwid : x + 4,
          x1 = x0 + cwid;
        let row = 0;
        while (placed.some(p => p.row === row && x0 < p.x1 + 4 && x1 > p.x0 - 4)) row++;
        placed.push({
          x0,
          x1,
          row
        });
        return Object.assign({
          x: x.toFixed(1),
          lx: (left ? x - 4 : x + 4).toFixed(1),
          ly: g.plotT + 2 + row * 18,
          tf: left ? 'translateX(-100%)' : 'none'
        }, e);
      });
      const v = view(o.key),
        tbl = v === 'table';
      return {
        title: o.title,
        icon: o.icon,
        c: o.c,
        meta: o.meta,
        span: o.span,
        g,
        segs,
        gaps,
        marks,
        hasGaps: gaps.length > 0,
        gapLabel: o.gapLabel || 'No known data',
        latSegs: o.lat ? split(o.lat).map(s => path(s, LY)) : [],
        wu: o.wu != null ? {
          x: g.plotL,
          y: g.plotT,
          w: Math.max(2, X(o.wu) - g.plotL).toFixed(1),
          h: H
        } : null,
        wuLabel: o.wu != null ? 'Warm-up · not stored (' + o.wuText + ')' : '',
        aria: o.title + ' chart' + (o.marks && o.marks.length ? '; events: ' + o.marks.map(q => EV[q[1]].t + ' at ' + (o.xLabel ? mmss(q[0]) : q[0] + ' s')).join(', ') : ''),
        c2: !!o.lat && !tbl,
        toggleML: o.lat && !tbl ? '0' : 'auto',
        isChart: !tbl,
        isTable: tbl,
        chartCls: tbl ? 'seg-btn' : 'seg-btn on',
        tableCls: tbl ? 'seg-btn on' : 'seg-btn',
        chartAria: tbl ? 'false' : 'true',
        tableAria: tbl ? 'true' : 'false',
        toChart: setView(o.key, 'chart'),
        toTable: setView(o.key, 'table'),
        cols: o.cols.map((t, i) => ({
          t,
          al: i ? 'right' : 'left'
        })),
        cols0: o.cols[0],
        rows: o.rows,
        foot: o.foot,
        tblMaxH: o.rows.length > 10 ? '360px' : 'none'
      };
    };
    // 2 s windows from warm-up end; samples are 0.1 s; throughput = bytes / known time; latency = median in window.
    const winRows = (pts, lat, t0, end) => {
      const out = [];
      for (let i = 0; t0 + 2 * i < end - 1e-6; i++) {
        const a = t0 + 2 * i,
          b = Math.min(a + 2, end),
          inW = p => p[0] >= a - 1e-6 && p[0] < b - 1e-6;
        const k = pts.filter(p => inW(p) && p[1] != null),
          kt = k.length * 0.1;
        const thr = k.length ? k.reduce((s, p) => s + p[1], 0) / k.length : null,
          lmed = med(lat.filter(inW).map(p => p[1]));
        out.push([cL(a.toFixed(1) + '–' + b.toFixed(1) + ' s'), cK(kt.toFixed(1) + ' s'), cV(rs(thr)), cV(lmed == null ? '—' : BG.ms(lmed) + ' ms')]);
      }
      return out;
    };
    const tidy = (pts, t0, end) => pts.map(p => [Math.round(p[0] * 100) / 100, p[1]]).filter(p => p[0] >= t0 - 1e-6 && p[0] < end - 1e-6);
    const TCOLS = ['2 s windows', 'Known', 'Throughput', 'Latency (median)'];
    const TFOOT = 'From warm-up end (1.5 s). Throughput = bytes ÷ known time; “—” = no known time in that window. Full samples are in the JSON export.';
    const cw = m ? 309 : 320,
      ch = m ? 150 : 170,
      sp = m ? 'auto' : 'span 1',
      wide = m ? 309 : 690;
    const ping = tidy(BG.lat(4, 3.1, 3.1, 1.9, 0.1, 0.4), 0, 2);
    const pingRows = [0, 5, 10, 15].map(s => {
      const g = ping.slice(s, s + 5).map(p => p[1]);
      return [cL(s + 1 + '–' + (s + 5)), cV(BG.ms(med(g)) + ' ms'), cK(BG.ms(Math.min(...g)) + ' ms'), cK(BG.ms(Math.max(...g)) + ' ms')];
    });
    const idle = mk({
      key: 'idle',
      title: 'Idle latency',
      icon: 'activity',
      c: 'var(--series-latency)',
      pts: ping,
      xMax: 2,
      ms: true,
      meta: '20 pings · median 3.1 ms',
      w: wide,
      h: m ? 100 : 120,
      span: m ? 'auto' : 'span 2',
      cols: ['Pings', 'Median', 'Min', 'Max'],
      rows: pingRows,
      foot: 'Groups of 5 pings in send order. No warm-up for latency.'
    });
    let charts;
    if (cont) {
      const cpts = cells.map(c => [(c.a + c.b) / 2, c.v]),
        clat = cells.map(c => [(c.a + c.b) / 2, c.l]);
      const crow = cells.map(c => [cL(mmss(c.a) + '–' + mmss(c.b)), cK(c.known + ' s'), cV(rs(c.v)), cV(c.l == null ? '—' : BG.ms(c.l) + ' ms')]);
      charts = [mk({
        key: 'down',
        title: 'Download',
        icon: 'arrow-down',
        c: 'var(--series-download)',
        pts: cpts,
        lat: clat,
        xMax: 1680,
        xStep: 300,
        xLabel: t => Math.round(t / 60) + 'm',
        wu: CWU,
        wuText: '0–0:03',
        marks: [[CEND, 'cap']],
        meta: '27:43 · 1 min cells · 6 streams',
        w: wide,
        h: m ? 150 : 190,
        span: m ? 'auto' : 'span 2',
        gapLabel: 'Unknown cells',
        cols: ['1 min averages', 'Known', 'Throughput', 'Latency (median)'],
        rows: crow,
        foot: 'One row per stored cell, from warm-up end (0:03). The last cell is shorter because the data cap ended the run. “—” = no known time.'
      }), idle];
    } else {
      const dEnd = 12,
        uEnd = 16,
        WU = 1.5;
      const dPts = tidy(BG.thr(3, 612e6, dEnd), WU, dEnd),
        dLat = tidy(BG.lat(5, 3.1, 18, dEnd, 0.25), WU, dEnd);
      const uPts = tidy(BG.thr(7, 438e6, uEnd), WU, uEnd).map(p => p[0] > 7.4 + 1e-6 && p[0] < 9.6 - 1e-6 ? [p[0], null] : p),
        uLat = tidy(BG.lat(9, 3.1, 42, uEnd, 0.25), WU, uEnd);
      charts = [mk({
        key: 'down',
        title: 'Download',
        icon: 'arrow-down',
        c: 'var(--series-download)',
        pts: dPts,
        lat: dLat,
        xMax: dEnd,
        wu: WU,
        wuText: '0–1.5 s',
        meta: '12 s · 6 streams',
        w: cw,
        h: ch,
        span: sp,
        cols: TCOLS,
        rows: winRows(dPts, dLat, WU, dEnd),
        foot: TFOOT
      }), mk({
        key: 'up',
        title: 'Upload',
        icon: 'arrow-up',
        c: 'var(--series-upload)',
        pts: uPts,
        lat: uLat,
        xMax: uEnd,
        wu: WU,
        wuText: '0–1.5 s',
        marks: [[7.4, 'error'], [12, 'extended']],
        meta: '16 s · 6 streams',
        w: cw,
        h: ch,
        span: sp,
        gapLabel: 'No known data (failed request)',
        cols: TCOLS,
        rows: winRows(uPts, uLat, WU, uEnd),
        foot: TFOOT
      }), idle];
    }
    return Object.assign(base, {
      charts
    });
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column"
      }
    }, v.desktop ? /*#__PURE__*/React.createElement(Nav, {
      variant: "top",
      active: "history"
    }) : null, v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-top",
      active: "history"
    }) : null, v.notFound ? /*#__PURE__*/React.createElement("main", {
      style: {
        flex: "1",
        maxWidth: "1200px",
        width: "100%",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: v.L?.pad,
        display: "flex",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        maxWidth: "440px",
        margin: v.L?.nfMargin,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "48px",
        height: "48px",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.nf?.icon,
      size: "22"
    })), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: "4px 0 0",
        fontSize: "var(--text-2xl)",
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)"
      }
    }, v.nf?.title), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.55",
        textWrap: "pretty"
      }
    }, v.nf?.body), /*#__PURE__*/React.createElement("a", {
      className: "btn primary",
      href: "#",
      style: {
        marginTop: "8px",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "history",
      size: "15"
    }), "Go to History"))) : null, v.found ? /*#__PURE__*/React.createElement("main", {
      style: {
        maxWidth: "1200px",
        width: "100%",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: v.L?.pad,
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        opacity: v.dimOp,
        transition: "opacity var(--dur-base) var(--ease-out)"
      }
    }, /*#__PURE__*/React.createElement("nav", {
      "aria-label": "Breadcrumb",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        color: "var(--fg-muted)",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-left",
      size: "14"
    }), "History"), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)"
      }
    }, v.D?.crumb)), v.hu ? /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        display: "flex",
        gap: "12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--warn-border)",
        background: "var(--warn-bg)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "database",
      size: "16",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "History unavailable"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, "This browser is blocking storage, so results can't be saved. You're seeing this session's result from memory; it's gone when you close the tab. Download JSON to keep it."))) : null, /*#__PURE__*/React.createElement("header", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "16px 24px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "0",
        flex: "1 1 360px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: "0",
        fontSize: v.L?.h1,
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)",
        lineHeight: "1.15"
      }
    }, v.D?.label), v.canEdit ? /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Edit label",
      style: {
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "pencil",
      size: "14"
    })) : null, v.hu ? /*#__PURE__*/React.createElement("span", {
      className: "has-tip"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Edit label",
      "aria-disabled": "true",
      "aria-describedby": "tip-label",
      style: {
        width: "28px",
        opacity: "0.45"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "pencil",
      size: "14"
    })), /*#__PURE__*/React.createElement("span", {
      className: "tip",
      role: "tooltip",
      id: "tip-label"
    }, "History unavailable \xB7 labels can't be saved")) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 12px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        gap: "5px",
        color: "var(--fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.D?.ctxIcon,
      size: "12",
      stroke: "2"
    }), v.D?.ctx), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)"
      },
      title: v.D?.abs
    }, v.D?.when), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", null, v.D?.preset, " preset"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", null, v.D?.server))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      onClick: v.dlJson
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "file-json",
      size: "15"
    }), "Download JSON"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "rotate-ccw",
      size: "15"
    }), "Run again"), v.canEdit ? /*#__PURE__*/React.createElement("button", {
      className: "btn danger icon",
      "aria-label": "Delete result",
      title: "Delete result",
      onClick: v.del
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "15"
    })) : null, v.hu ? /*#__PURE__*/React.createElement("span", {
      className: "has-tip tip-end"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn danger icon",
      "aria-label": "Delete result",
      "aria-disabled": "true",
      "aria-describedby": "tip-del",
      style: {
        opacity: "0.45"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "trash",
      size: "15"
    })), /*#__PURE__*/React.createElement("span", {
      className: "tip",
      role: "tooltip",
      id: "tip-del"
    }, "History unavailable \xB7 nothing saved to delete")) : null)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.cols,
        gap: "24px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.tileCols,
        gap: v.L?.tileGap
      }
    }, (v.tiles || []).map((t, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: t?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: t?.icon,
      size: "14",
      stroke: "2"
    })), t?.label), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500",
        fontSize: v.L?.tileNum,
        letterSpacing: "-0.02em",
        lineHeight: "1.1",
        color: t?.nc
      }
    }, t?.num), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, t?.unit)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, t?.sub))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.midCols,
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: "14px 16px",
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 0 150px",
        maxWidth: "220px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Bufferbloat"), /*#__PURE__*/React.createElement("span", {
      "aria-label": "Bufferbloat grade B, mild",
      style: {
        width: "52px",
        height: "52px",
        boxSizing: "border-box",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--ok-border)",
        background: "var(--ok-bg)",
        color: "var(--ok-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "24px"
      }
    }, "B"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, "Mild bufferbloat \xB7 latency rises under load but stays usable.")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "999 1 260px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column"
      }
    }, (v.loadRows || []).map((r, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: r?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: r?.icon,
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)"
      }
    }, r?.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, r?.sub)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-lg)",
        fontWeight: "500",
        whiteSpace: "nowrap"
      }
    }, r?.num, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        fontWeight: "400"
      }
    }, r?.unit))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        paddingTop: "10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex",
        marginTop: "2px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "gauge",
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        lineHeight: "1.4",
        textWrap: "pretty"
      }
    }, "HTTP loaded responsiveness \u2014 connection sharing not verifiable"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, v.rpmSub)), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-muted)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xs)",
        padding: "1px 6px",
        whiteSpace: "nowrap"
      }
    }, "h2")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 18px",
        paddingLeft: "24px"
      }
    }, (v.rpm || []).map((rd, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: rd?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: rd?.icon,
      size: "12",
      stroke: "2.25"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-lg)",
        fontWeight: "500",
        whiteSpace: "nowrap"
      }
    }, rd?.num, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        fontWeight: "400"
      }
    }, "RPM"))))))))), /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)",
        marginBottom: "4px"
      }
    }, "Good for"), (v.fit || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "38px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: f?.icon,
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        flex: "1"
      }
    }, f?.label), /*#__PURE__*/React.createElement("span", {
      className: f?.cls
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: f?.ricon,
      size: "13",
      stroke: "2"
    }), f?.rating)))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "38px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "signal",
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        flex: "1"
      }
    }, "Packet loss"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flex: "none"
      }
    }, /*#__PURE__*/React.createElement("span", {
      title: "Browsers can't see packet loss over TCP",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-full)",
        padding: "2px 8px",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-dashed",
      size: "12"
    }), "Not measured"), /*#__PURE__*/React.createElement("a", {
      href: "#",
      title: "Browsers can't see packet loss over TCP",
      style: {
        fontSize: "var(--text-caption)",
        fontWeight: "600",
        color: "var(--primary-text)",
        textDecoration: "none"
      }
    }, "Why?"))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        lineHeight: "1.4"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "info",
      size: "12"
    }), "Upper bound: packet loss is not measured"))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      },
      "aria-labelledby": "conf-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "shield",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "conf-h"
    }, "Confidence and notices"), /*#__PURE__*/React.createElement("span", {
      className: "right",
      style: {
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: `pill ${v.conf?.tone ?? ""}`
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), v.conf?.label))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.confCols,
        gap: "0 24px",
        padding: "4px 16px 8px"
      }
    }, (v.confGroups || []).map((cg, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: "10px 0 4px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, cg?.h), /*#__PURE__*/React.createElement("ul", {
      style: {
        listStyle: "none",
        margin: "0",
        padding: "0"
      }
    }, (cg?.items || []).map((n, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("li", {
      style: {
        display: "flex",
        gap: "10px",
        padding: "9px 0",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: n?.c,
        display: "flex",
        marginTop: "2px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: n?.icon,
      size: "15",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "500",
        lineHeight: "1.4"
      }
    }, n?.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.45",
        textWrap: "pretty"
      }
    }, n?.body))))))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.chartCols,
        gap: "12px"
      }
    }, (v.charts || []).map((k, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        gridColumn: k?.span,
        padding: "14px 16px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minWidth: "0",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 14px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: k?.c,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: k?.icon,
      size: "14",
      stroke: "2"
    })), k?.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, k?.meta), k?.c2 ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "14px",
        borderTop: "2px dashed var(--series-latency)"
      }
    }), "Latency under load") : null, /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": `${k?.title ?? ""} view`,
      style: {
        marginLeft: k?.toggleML
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: k?.chartCls,
      role: "radio",
      "aria-checked": k?.chartAria,
      onClick: k?.toChart,
      style: {
        height: "28px",
        padding: "0 10px",
        fontSize: "var(--text-caption)"
      }
    }, "Chart"), /*#__PURE__*/React.createElement("button", {
      className: k?.tableCls,
      role: "radio",
      "aria-checked": k?.tableAria,
      onClick: k?.toTable,
      style: {
        height: "28px",
        padding: "0 10px",
        fontSize: "var(--text-caption)"
      }
    }, "Table"))), k?.isChart ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        alignSelf: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: k?.g?.w,
      height: k?.g?.h,
      style: {
        display: "block",
        overflow: "visible"
      },
      role: "img",
      "aria-label": k?.aria
    }, (k?.g?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: gl?.x1,
      y1: gl?.y,
      x2: gl?.x2,
      y2: gl?.y,
      style: {
        stroke: "var(--border-subtle)"
      }
    }))), (k?.segs || []).map((sg, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("path", {
      d: sg?.area,
      style: {
        fill: k?.c,
        fillOpacity: "0.1"
      }
    }), /*#__PURE__*/React.createElement("path", {
      d: sg?.line,
      style: {
        fill: "none",
        stroke: k?.c,
        strokeWidth: "1.5",
        strokeLinejoin: "round"
      }
    }))), (k?.latSegs || []).map((ls, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("path", {
      d: ls,
      style: {
        fill: "none",
        stroke: "var(--series-latency)",
        strokeWidth: "1.25",
        strokeDasharray: "4 3"
      }
    }))), (k?.marks || []).map((mk, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: mk?.x,
      y1: k?.g?.plotT,
      x2: mk?.x,
      y2: k?.g?.plotB,
      style: {
        stroke: mk?.c,
        strokeWidth: "1.25",
        strokeDasharray: "3 3"
      }
    })))), /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: "var(--fg-subtle)"
      }
    }, k?.wu ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${k?.wu?.x ?? ""}px`,
        top: `${k?.wu?.y ?? ""}px`,
        width: `${k?.wu?.w ?? ""}px`,
        height: `${k?.wu?.h ?? ""}px`,
        boxSizing: "border-box",
        borderRight: "1px dashed var(--border-strong)",
        background: "repeating-linear-gradient(135deg, var(--border-default) 0 1px, transparent 1px 5px)"
      }
    }) : null, (k?.gaps || []).map((gp, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${gp?.x ?? ""}px`,
        top: `${gp?.y ?? ""}px`,
        width: `${gp?.w ?? ""}px`,
        height: `${gp?.h ?? ""}px`,
        boxSizing: "border-box",
        borderLeft: "1px dashed var(--border-strong)",
        borderRight: "1px dashed var(--border-strong)"
      }
    }))), (k?.g?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${gl?.lx ?? ""}px`,
        top: `${gl?.ly ?? ""}px`,
        transform: "translate(-100%,-75%)",
        whiteSpace: "nowrap"
      }
    }, gl?.t))), (k?.g?.xt || []).map((xt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${xt?.x ?? ""}px`,
        top: `${xt?.y ?? ""}px`,
        transform: "translate(-50%,-75%)"
      }
    }, xt?.t))), k?.g?.lat ? /*#__PURE__*/React.createElement(React.Fragment, null, (k?.g?.lat?.ticks || []).map((lt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${lt?.x ?? ""}px`,
        top: `${lt?.y ?? ""}px`,
        transform: "translateY(-75%)",
        whiteSpace: "nowrap",
        color: "var(--series-latency)"
      }
    }, lt?.t)))) : null, (k?.marks || []).map((mk, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${mk?.lx ?? ""}px`,
        top: `${mk?.ly ?? ""}px`,
        transform: mk?.tf,
        display: "flex",
        alignItems: "center",
        gap: "3px",
        padding: "1px 5px",
        borderRadius: "var(--radius-xs)",
        background: "var(--surface-2)",
        border: `1px solid ${mk?.bd ?? ""}`,
        color: mk?.fg,
        fontFamily: "var(--font-sans)",
        fontSize: "10px",
        fontWeight: "600",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: mk?.icon,
      size: "10",
      stroke: "2.25"
    }), mk?.t))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px 14px",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, k?.wu ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "14px",
        height: "10px",
        boxSizing: "border-box",
        borderRight: "1px dashed var(--border-strong)",
        background: "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 4px)"
      }
    }), k?.wuLabel) : null, k?.hasGaps ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "12px",
        height: "10px",
        boxSizing: "border-box",
        borderLeft: "1px dashed var(--border-strong)",
        borderRight: "1px dashed var(--border-strong)"
      }
    }), k?.gapLabel) : null)) : null, k?.isTable ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        maxHeight: k?.tblMaxH,
        overflow: "auto",
        margin: "0 -4px"
      }
    }, /*#__PURE__*/React.createElement("table", {
      className: "tbl",
      "aria-label": `${k?.title ?? ""} ${k?.cols0 ?? ""}`
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, (k?.cols || []).map((col, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("th", {
      style: {
        textAlign: col?.al,
        position: "sticky",
        top: "0",
        background: "var(--surface-2)"
      }
    }, col?.t))))), /*#__PURE__*/React.createElement("tbody", null, (k?.rows || []).map((r, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("tr", null, (r || []).map((cell, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: cell?.al,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: cell?.c,
        whiteSpace: "nowrap"
      }
    }, cell?.v))))))))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, k?.foot)) : null))))), /*#__PURE__*/React.createElement("aside", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("label", {
      htmlFor: "note",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "file-text",
      size: "13"
    }), "Note"), v.canEdit ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("textarea", {
      id: "note",
      rows: "3",
      onChange: v.setNote,
      value: v.note,
      style: {
        resize: "vertical",
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        lineHeight: "1.5",
        padding: "8px 10px"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, "Saved automatically in this browser. Never included when you share.")) : null, v.hu ? /*#__PURE__*/React.createElement("div", {
      className: "has-tip",
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("textarea", {
      id: "note",
      rows: "3",
      readOnly: true,
      "aria-disabled": "true",
      "aria-describedby": "tip-note",
      placeholder: "Add a note",
      style: {
        resize: "none",
        cursor: "not-allowed",
        opacity: "0.45",
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        lineHeight: "1.5",
        padding: "8px 10px"
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "tip",
      role: "tooltip",
      id: "tip-note"
    }, "History unavailable \xB7 notes can't be saved")) : null), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "image",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Share image"), /*#__PURE__*/React.createElement("span", {
      className: "right",
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, "1200 \xD7 630 PNG")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      "data-theme": "dark",
      role: "img",
      "aria-label": v.shareAria,
      style: {
        aspectRatio: "1200/630",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-base)",
        border: "1px solid var(--border-default)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "6px",
        color: "var(--fg)",
        boxSizing: "border-box"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        fontWeight: "600",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "15",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Gauge")), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        display: "flex",
        gap: "5px",
        minWidth: "0",
        fontFamily: "var(--font-mono)",
        fontWeight: "400",
        fontSize: "9px",
        color: "var(--fg-subtle)",
        whiteSpace: "nowrap"
      }
    }, v.inc ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg)",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, v.D?.label, " ·") : null, /*#__PURE__*/React.createElement("span", null, v.D?.short))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "16px",
        alignItems: "flex-end"
      }
    }, (v.shareBlocks || []).map((b, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontSize: "8px",
        letterSpacing: ".08em",
        color: b?.c,
        fontWeight: "600"
      }
    }, b?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "24px",
        fontWeight: "500",
        lineHeight: "1"
      }
    }, b?.n, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "10px",
        color: "var(--fg-muted)",
        marginLeft: "3px"
      }
    }, b?.u))))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "30px",
        height: "30px",
        boxSizing: "border-box",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--ok-border)",
        background: "var(--ok-bg)",
        color: "var(--ok-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "15px"
      }
    }, "B"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        fontSize: "9px",
        lineHeight: "1.25"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: "600"
      }
    }, "Mild"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "bufferbloat")))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "3px 10px",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        color: "var(--fg-muted)"
      }
    }, (v.shareFoot || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", null, f))), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        color: "var(--fg-subtle)"
      }
    }, v.D?.server))), /*#__PURE__*/React.createElement("label", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        fontSize: "var(--text-sm)",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: v.inc,
      onChange: v.toggleInc,
      style: {
        width: "16px",
        height: "16px",
        margin: "2px 0 0",
        accentColor: "var(--primary)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "1px"
      }
    }, "Include label ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, "Adds \u201C", v.D?.label, "\u201D to the image and the text. IP address and note are never shared."))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0,1fr))",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      onClick: v.share,
      title: "Opens the system share sheet where the browser supports it",
      style: {
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "share",
      size: "15"
    }), "Share"), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      onClick: v.dlImg,
      style: {
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "15"
    }), "Download image")))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "file-text",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Text summary"), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm right",
      onClick: v.copy,
      style: {
        marginLeft: "auto"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "copy",
      size: "13"
    }), "Copy")), v.denied ? /*#__PURE__*/React.createElement("div", {
      role: "alert",
      style: {
        display: "flex",
        gap: "8px",
        padding: "10px 16px",
        background: "var(--warn-bg)",
        borderBottom: "1px solid var(--warn-border)",
        fontSize: "var(--text-caption)",
        lineHeight: "1.45"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        textWrap: "pretty"
      }
    }, "Clipboard access was denied. The text below is selected — press ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, "Ctrl+C"), " (", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, "\u2318C"), " on Mac) to copy it.")) : null, /*#__PURE__*/React.createElement("pre", {
      ref: v.preRef,
      tabIndex: "0",
      "aria-label": "Text summary",
      style: {
        margin: "0",
        padding: "12px 16px",
        background: "var(--term-bg)",
        color: "var(--term-fg)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        lineHeight: "1.65",
        whiteSpace: "pre-wrap",
        userSelect: "text",
        outline: v.preOutline,
        outlineOffset: "-2px"
      }
    }, v.summary)), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, v.mobile ? /*#__PURE__*/React.createElement("button", {
      className: "card-h",
      onClick: v.toggleParams,
      "aria-expanded": v.paramsAria,
      "aria-controls": "params",
      style: {
        width: "100%",
        boxSizing: "border-box",
        background: "none",
        border: "0",
        borderBottom: v.paramsBorder,
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        minHeight: "44px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sliders",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Test parameters"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        display: "flex",
        color: "var(--fg-subtle)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.paramsChevron,
      size: "16"
    }))) : null, v.desktop ? /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sliders",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Test parameters")) : null, v.paramsShown ? /*#__PURE__*/React.createElement("div", {
      id: "params",
      style: {
        padding: "2px 16px 10px"
      }
    }, (v.params || []).map((pg, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: "12px 0 4px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, pg?.h), /*#__PURE__*/React.createElement("dl", {
      style: {
        margin: "0"
      }
    }, (pg?.rows || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "7px 0",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("dt", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        flex: "none"
      }
    }, p?.k), /*#__PURE__*/React.createElement("dd", {
      style: {
        margin: "0",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg)",
        textAlign: "right",
        minWidth: "0",
        textWrap: "pretty"
      }
    }, p?.v))))))))) : null)))) : null, v.toast ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "sticky",
        bottom: "16px",
        zIndex: "50",
        display: "flex",
        justifyContent: "flex-end",
        padding: "16px",
        pointerEvents: "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `toast ${v.toast?.kind ?? ""}`,
      role: "status",
      "aria-live": "polite",
      style: {
        pointerEvents: "auto",
        maxWidth: "100%",
        boxSizing: "border-box",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "i",
      style: {
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.toast?.icon,
      size: "16",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "t"
    }, v.toast?.t), v.toast?.m ? /*#__PURE__*/React.createElement("div", {
      className: "m"
    }, v.toast?.m) : null), v.toast?.undo ? /*#__PURE__*/React.createElement("button", {
      className: "btn secondary sm",
      onClick: v.undo
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "undo-2",
      size: "13"
    }), "Undo") : null, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm icon",
      "aria-label": "Dismiss",
      onClick: v.dismiss
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "14"
    })))) : null, v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-bottom",
      active: "history"
    }) : null);
  }
}
window.ResultDetail = ResultDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ResultDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Settings.jsx
try { (() => {
/* BitGauge web UI kit — Settings
 * Props:
 *   mobile: boolean  (default false)
 *   preset: "quick" | "standard" | "extended" | "continuous"  (default "extended")
 *   advanced: boolean  (default false)
 *   invalid: boolean  (default false)
 *   confirmReset: boolean  (default false)
 */
class Settings extends React.Component {
  state = this.initState();
  P() {
    return {
      quick: {
        t: 'Quick',
        icon: 'zap',
        d: 'Fixed 3 streams · 5–10 s per direction · 10 pings',
        streams: 'fixed',
        n: 3,
        dl: [5, 10],
        ul: [5, 10],
        pings: 10
      },
      standard: {
        t: 'Standard',
        icon: 'gauge',
        d: 'Auto streams · 10–20 s down, 12–25 s up · 20 pings',
        streams: 'auto',
        dl: [10, 20],
        ul: [12, 25],
        pings: 20,
        def: true
      },
      extended: {
        t: 'Extended',
        icon: 'timer',
        d: 'Auto streams · 20–40 s per direction · 50 pings',
        streams: 'auto',
        dl: [20, 40],
        ul: [20, 40],
        pings: 50
      },
      continuous: {
        t: 'Continuous',
        icon: 'infinity',
        d: 'One direction until stopped',
        streams: 'auto',
        pings: 20
      }
    };
  }
  on(v) {
    return !!v && v !== 'false' && v !== '0';
  }
  defaults() {
    return {
      preset: 'standard',
      dir: 'download',
      runLimit: false,
      runUnit: 'h',
      phases: {
        latency: true,
        download: true,
        upload: true
      },
      order: 'down',
      ov: {},
      v: {
        capMB: 500,
        countdown: 3,
        warmS: 2,
        runVal: 1
      },
      cap: false,
      units: 'bits',
      theme: 'system',
      autostart: false,
      warm: 'auto',
      overhead: '0',
      drafts: {},
      err: {}
    };
  }
  initState() {
    const p = this.props || {};
    // Real product state: the prototype keeps the saved settings and passes them back in.
    if (p.saved) return Object.assign(this.defaults(), p.saved, {
      theme: p.theme || p.saved.theme,
      advOpen: !!p.saved.advOpen,
      confirm: false,
      copied: false,
      drafts: {},
      err: {}
    });
    const preset = p.preset || 'extended';
    if (p.onSettings) return Object.assign(this.defaults(), {
      preset,
      theme: p.theme || 'system',
      advOpen: this.on(p.advanced),
      confirm: false,
      incRun: false,
      copied: false
    });
    const st = Object.assign(this.defaults(), {
      preset,
      ov: {
        streams: 'fixed',
        n: 4
      },
      cap: true,
      advOpen: this.on(p.advanced),
      confirm: this.on(p.confirmReset),
      incRun: false,
      copied: false
    });
    if (preset === 'continuous') {
      st.runLimit = true;
      st.v.runVal = 2;
    }
    const P = this.P()[preset];
    if (this.on(p.invalid) && P.dl) {
      st.drafts = {
        dlMin: String(P.dl[1] + 10)
      };
      st.err = {
        dlMin: 'Must be at most the maximum (' + P.dl[1] + ' s). Not saved · Esc restores ' + P.dl[0] + ' s.'
      };
    }
    return st;
  }
  componentDidUpdate(pp, ps) {
    const p = this.props;
    if (p.onSettings) {
      if (pp.theme !== p.theme && p.theme && p.theme !== this.state.theme) this.setState({
        theme: p.theme
      });else if (ps !== this.state) p.onSettings(this.state, this._changed);
      return;
    }
    if (pp.preset !== p.preset || pp.invalid !== p.invalid) this.setState(this.initState());else {
      if (pp.advanced !== p.advanced) this.setState({
        advOpen: this.on(p.advanced)
      });
      if (pp.confirmReset !== p.confirmReset) this.setState({
        confirm: this.on(p.confirmReset)
      });
    }
  }
  pv(st) {
    const P = this.P()[st.preset];
    return {
      dlMin: P.dl && P.dl[0],
      dlMax: P.dl && P.dl[1],
      ulMin: P.ul && P.ul[0],
      ulMax: P.ul && P.ul[1],
      pings: P.pings
    };
  }
  eff(k, st) {
    if (k in st.ov) return st.ov[k];
    const pv = this.pv(st);
    if (k in pv) return pv[k];
    return st.v[k];
  }
  unitOf(k, st) {
    return k === 'capMB' ? 'MB' : k === 'pings' ? 'pings' : k === 'runVal' ? {
      m: 'min',
      h: 'h',
      d: 'days'
    }[st.runUnit] : 's';
  }
  validate(k, str, st) {
    const R = {
      dlMin: [1, 600],
      dlMax: [1, 600],
      ulMin: [1, 600],
      ulMax: [1, 600],
      capMB: [1, 100000],
      countdown: [1, 30],
      pings: [1, 100],
      warmS: [0.5, 10, true],
      runVal: {
        m: [1, 10080],
        h: [1, 168],
        d: [1, 7]
      }[st.runUnit]
    }[k];
    const s = String(str).trim(),
      n = Number(s),
      u = this.unitOf(k, st);
    let msg = null;
    if (s === '' || !isFinite(n) || !R[2] && !Number.isInteger(n) || n < R[0] || n > R[1]) msg = k === 'runVal' ? 'Run length must be 1 minute to 7 days.' : 'Enter a ' + (R[2] ? '' : 'whole ') + 'number from ' + R[0] + ' to ' + R[1] + '.';else if (/Min$/.test(k) && n > this.eff(k.replace('Min', 'Max'), st)) msg = 'Must be at most the maximum (' + this.eff(k.replace('Min', 'Max'), st) + ' s).';else if (/Max$/.test(k) && n < this.eff(k.replace('Max', 'Min'), st)) msg = 'Must be at least the minimum (' + this.eff(k.replace('Max', 'Min'), st) + ' s).';
    return msg ? msg + ' Not saved · Esc restores ' + this.eff(k, st) + ' ' + u + '.' : null;
  }
  drop(o, k) {
    const c = Object.assign({}, o);
    delete c[k];
    return c;
  }
  check(k, el) {
    const st = this.state,
      str = st.drafts[k];
    if (str === undefined) return;
    const e = this.validate(k, str, st);
    if (e) {
      this.setState({
        err: Object.assign({}, st.err, {
          [k]: e
        })
      });
      if (el) setTimeout(() => el.focus(), 0);
      return;
    }
    const n = Number(String(str).trim());
    this.setState(s => {
      const pv = this.pv(s),
        out = {
          drafts: this.drop(s.drafts, k),
          err: this.drop(s.err, k)
        };
      if (k in pv) {
        const ov = Object.assign({}, s.ov);
        if (n === pv[k]) delete ov[k];else ov[k] = n;
        out.ov = ov;
      } else out.v = Object.assign({}, s.v, {
        [k]: n
      });
      return out;
    });
  }
  field(k) {
    const st = this.state,
      e = st.err[k],
      d = st.drafts[k];
    return {
      val: d !== undefined ? d : String(this.eff(k, st)),
      bad: !!e,
      err: e || '',
      eid: 'err-' + k,
      desc: e ? 'err-' + k : undefined,
      cls: 'input mono' + (e ? ' invalid focused' : ''),
      aria: e ? 'true' : 'false',
      onChange: ev => {
        const val = ev.target.value;
        this.setState(s => {
          const out = {
            drafts: Object.assign({}, s.drafts, {
              [k]: val
            })
          };
          if (s.err[k]) {
            const ne = this.validate(k, val, s);
            out.err = ne ? Object.assign({}, s.err, {
              [k]: ne
            }) : this.drop(s.err, k);
          }
          return out;
        });
      },
      onBlur: ev => this.check(k, ev.target),
      onKeyDown: ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          this.check(k, ev.target);
        } else if (ev.key === 'Escape') this.setState(s => ({
          drafts: this.drop(s.drafts, k),
          err: this.drop(s.err, k)
        }));
      }
    };
  }
  seg(opts, cur, set) {
    return opts.map(o => ({
      t: o[1],
      icon: o[2],
      c: o[3],
      cls: 'seg-btn' + (o[0] === cur ? ' on' : ''),
      aria: o[0] === cur ? 'true' : 'false',
      on: () => set(o[0])
    }));
  }
  sw(isOn, toggle) {
    return {
      cls: 'switch' + (isOn ? ' on' : ''),
      aria: isOn ? 'true' : 'false',
      on: toggle
    };
  }
  resetOv(keys, extra) {
    this.setState(s => {
      const ov = Object.assign({}, s.ov),
        drafts = Object.assign({}, s.drafts),
        err = Object.assign({}, s.err);
      keys.forEach(k => {
        delete ov[k];
        delete drafts[k];
        delete err[k];
      });
      return Object.assign({
        ov,
        drafts,
        err
      }, extra || {});
    });
  }
  renderVals() {
    const s = this.state,
      m = this.on(this.props.mobile),
      PR = this.P(),
      P = PR[s.preset],
      D = this.defaults();
    const isCont = s.preset === 'continuous',
      timed = !isCont;
    const set = o => this.setState(o);
    const sm = s.ov.streams || P.streams,
      pn = P.n || 4,
      n = s.ov.n != null ? s.ov.n : pn;
    const streamsLbl = (mode, k) => mode === 'auto' ? 'Auto' : mode === 'single' ? 'Single' : 'Fixed · ' + k;
    const dur = (a, b) => a + '–' + b + ' s';
    const e = k => this.eff(k, s);
    const dirName = s.dir === 'download' ? 'download' : 'upload';
    const runStr = s.v.runVal + {
      m: ' min',
      h: ' h',
      d: ' d'
    }[s.runUnit];
    const phOn = s.phases,
      phAll = phOn.latency && phOn.download && phOn.upload;
    const C = {
      streams: sm !== P.streams || sm === 'fixed' && n !== pn,
      dl: timed && ('dlMin' in s.ov || 'dlMax' in s.ov),
      ul: timed && ('ulMin' in s.ov || 'ulMax' in s.ov),
      phases: !phAll,
      cap: s.cap,
      units: s.units !== 'bits',
      theme: s.theme !== 'system',
      auto: s.autostart || s.v.countdown !== 3,
      warm: s.warm !== 'auto',
      pings: 'pings' in s.ov,
      overhead: s.overhead !== '0'
    };
    const changed = [];
    const add = (k, d, v, reset) => changed.push({
      k,
      d,
      v,
      reset,
      label: 'Reset ' + k.toLowerCase()
    });
    if (s.preset !== 'standard') add('Preset', 'Standard', P.t + (isCont ? ' · ' + dirName + (s.runLimit ? ' · ' + runStr : '') : ''), () => set({
      preset: 'standard',
      drafts: {},
      err: {}
    }));
    if (C.streams) add('Parallel streams', streamsLbl(P.streams, pn), streamsLbl(sm, n), () => this.resetOv(['streams', 'n']));
    if (C.dl) add('Download duration', dur(P.dl[0], P.dl[1]), dur(e('dlMin'), e('dlMax')), () => this.resetOv(['dlMin', 'dlMax']));
    if (C.ul) add('Upload duration', dur(P.ul[0], P.ul[1]), dur(e('ulMin'), e('ulMax')), () => this.resetOv(['ulMin', 'ulMax']));
    if (C.phases) add('Phases', 'All three', ['latency', 'download', 'upload'].filter(k => phOn[k]).map(k => k[0].toUpperCase() + k.slice(1)).join(', '), () => set({
      phases: D.phases
    }));
    if (s.order === 'up') add('Phase order', 'Download first', 'Upload first', () => set({
      order: 'down'
    }));
    if (C.cap) add('Data cap', 'Off', s.v.capMB + ' MB', () => set({
      cap: false,
      v: Object.assign({}, s.v, {
        capMB: 500
      })
    }));
    if (C.units) add('Units', 'Bits', 'Bytes', () => set({
      units: 'bits'
    }));
    if (C.theme) add('Theme', 'System', s.theme === 'light' ? 'Light' : 'Dark', () => set({
      theme: 'system'
    }));
    if (C.auto) add('Auto-start', 'Off · 3 s', (s.autostart ? 'On' : 'Off') + ' · ' + s.v.countdown + ' s', () => set({
      autostart: false,
      v: Object.assign({}, s.v, {
        countdown: 3
      })
    }));
    if (C.warm) add('Warm-up', 'Auto', 'Fixed · ' + s.v.warmS + ' s', () => set({
      warm: 'auto'
    }));
    if (C.pings) add('Ping count', String(P.pings), String(e('pings')), () => this.resetOv(['pings']));
    if (C.overhead) add('Overhead', 'None', s.overhead + ' %', () => set({
      overhead: '0'
    }));
    this._changed = changed;
    const q = [];
    if (s.preset !== 'standard') q.push('preset=' + s.preset);
    if (isCont && s.dir === 'upload') q.push('dir=up');
    if (isCont && s.runLimit) q.push('for=' + s.v.runVal + s.runUnit);
    if (C.phases) q.push('phases=' + ['latency', 'download', 'upload'].filter(k => phOn[k]).map(k => ({
      latency: 'ping',
      download: 'down',
      upload: 'up'
    })[k]).join(','));
    if (s.order === 'up') q.push('order=up');
    if (C.streams) q.push('streams=' + (sm === 'fixed' ? n : sm === 'single' ? 1 : 'auto'));
    if (C.dl) q.push('down=' + e('dlMin') + '-' + e('dlMax'));
    if (C.ul) q.push('up=' + e('ulMin') + '-' + e('ulMax'));
    if (C.cap) q.push('cap=' + s.v.capMB + 'MB');
    if (C.pings) q.push('pings=' + e('pings'));
    if (C.warm) q.push('warmup=' + s.v.warmS);
    if (C.overhead) q.push('overhead=' + s.overhead);
    if (s.incRun) q.push('run=1');
    const url = 'https://speed.home.lan/' + (q.length ? '?' + q.join('&') : '');
    const presets = Object.keys(PR).map(k => {
      const p = PR[k],
        sel = k === s.preset,
        pick = () => {
          if (!sel) set({
            preset: k,
            drafts: {},
            err: {}
          });
        };
      return {
        t: p.t,
        icon: p.icon,
        d: p.d,
        def: !!p.def,
        pick,
        key: ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            pick();
          }
        },
        aria: sel ? 'true' : 'false',
        bd: sel ? 'var(--primary-border)' : 'var(--border-default)',
        bg: sel ? 'var(--primary-bg)' : 'var(--surface-1)',
        ic: sel ? 'var(--primary-text)' : 'var(--fg-subtle)',
        ring: sel ? '5px solid var(--primary)' : '1.5px solid var(--border-strong)',
        dot: sel ? 'var(--surface-2)' : 'transparent'
      };
    });
    const onCount = Object.values(phOn).filter(Boolean).length;
    const phases = [['latency', 'Latency', 'activity', 'var(--series-latency)'], ['download', 'Download', 'arrow-down', 'var(--series-download)'], ['upload', 'Upload', 'arrow-up', 'var(--series-upload)']].map(([k, t, icon, c]) => {
      const v = phOn[k],
        dis = isCont || v && onCount === 1;
      return {
        t,
        icon,
        c,
        on2: v,
        aria: v ? 'true' : 'false',
        dis,
        bg: v ? 'var(--primary)' : 'transparent',
        bd: v ? 'none' : '1.5px solid var(--border-strong)',
        on: () => {
          if (!dis) set({
            phases: Object.assign({}, phOn, {
              [k]: !v
            })
          });
        }
      };
    });
    const orderOk = timed && phOn.download && phOn.upload;
    const errKeys = Object.keys(s.err);
    const F = {};
    ['dlMin', 'dlMax', 'ulMin', 'ulMax', 'capMB', 'countdown', 'pings', 'warmS', 'runVal'].forEach(k => {
      F[k] = this.field(k);
    });
    return {
      mobile: m,
      desktop: !m,
      stop: ev => ev.stopPropagation(),
      L: m ? {
        pad: '16px 16px 24px',
        cols: 'minmax(0,1fr)',
        h1: 'var(--text-3xl)',
        presetCols: 'minmax(0,1fr)',
        orderMl: '0',
        cfAlign: 'flex-end',
        cfTop: '0',
        cfW: '100%',
        cfRad: 'var(--radius-xl) var(--radius-xl) 0 0'
      } : {
        pad: '24px 40px 48px',
        cols: 'minmax(0,1fr) 340px',
        h1: 'var(--text-4xl)',
        presetCols: 'repeat(2, minmax(0,1fr))',
        orderMl: 'auto',
        cfAlign: 'flex-start',
        cfTop: '160px',
        cfW: '460px',
        cfRad: 'var(--radius-xl)'
      },
      allSaved: !errKeys.length,
      hasErr: !!errKeys.length,
      errCountLabel: errKeys.length === 1 ? '1 value not saved' : errKeys.length + ' values not saved',
      presets,
      isCont,
      timed,
      C,
      F,
      phases,
      S: {
        dir: this.seg([['download', 'Download', 'arrow-down', 'var(--series-download)'], ['upload', 'Upload', 'arrow-up', 'var(--series-upload)']], s.dir, v => set({
          dir: v
        })),
        order: this.seg([['down', 'Download first'], ['up', 'Upload first']], s.order, v => set({
          order: v
        })),
        streams: this.seg([['auto', 'Auto'], ['fixed', 'Fixed'], ['single', 'Single']], sm, v => this.setState(st => {
          const ov = Object.assign({}, st.ov);
          if (v === this.P()[st.preset].streams) delete ov.streams;else ov.streams = v;
          return {
            ov
          };
        })),
        units: this.seg([['bits', 'Bits · Mbit/s'], ['bytes', 'Bytes · MB/s']], s.units, v => set({
          units: v
        })),
        theme: this.seg([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']], s.theme, v => set({
          theme: v
        })),
        warm: this.seg([['auto', 'Auto'], ['fixed', 'Fixed']], s.warm, v => set({
          warm: v
        }))
      },
      phasesOpacity: isCont ? '0.45' : '1',
      orderOpacity: orderOk ? '1' : '0.45',
      orderPe: orderOk ? 'auto' : 'none',
      phasesHelp: isCont ? 'Continuous runs one direction. Phases apply to the timed presets.' : 'Latency always runs first. At least one phase stays on.',
      runSw: this.sw(s.runLimit, () => set({
        runLimit: !s.runLimit,
        drafts: this.drop(s.drafts, 'runVal'),
        err: this.drop(s.err, 'runVal')
      })),
      runLimit: s.runLimit,
      noRunLimit: !s.runLimit,
      runUnit: s.runUnit,
      setRunUnit: ev => {
        const u = ev.target.value,
          max = {
            m: 10080,
            h: 168,
            d: 7
          }[u];
        set({
          runUnit: u,
          v: Object.assign({}, s.v, {
            runVal: Math.min(s.v.runVal, max)
          }),
          drafts: this.drop(s.drafts, 'runVal'),
          err: this.drop(s.err, 'runVal')
        });
      },
      isFixed: sm === 'fixed',
      n,
      nMin: n <= 1,
      nMax: n >= 6,
      nDec: () => this.setState(st => {
        const ov = Object.assign({}, st.ov),
          nv = Math.max(1, n - 1);
        if (nv === pn) delete ov.n;else ov.n = nv;
        return {
          ov
        };
      }),
      nInc: () => this.setState(st => {
        const ov = Object.assign({}, st.ov),
          nv = Math.min(6, n + 1);
        if (nv === pn) delete ov.n;else ov.n = nv;
        return {
          ov
        };
      }),
      capSw: this.sw(s.cap, () => set({
        cap: !s.cap
      })),
      capOff: !s.cap,
      capOpacity: s.cap ? '1' : '0.45',
      autoSw: this.sw(s.autostart, () => set({
        autostart: !s.autostart
      })),
      autoOff: !s.autostart,
      autoOpacity: s.autostart ? '1' : '0.45',
      advOpen: s.advOpen,
      advAria: s.advOpen ? 'true' : 'false',
      advIcon: s.advOpen ? 'chevron-up' : 'chevron-down',
      toggleAdv: () => set({
        advOpen: !s.advOpen
      }),
      advSummary: 'Warm-up, ping count, overhead compensation',
      warmFixed: s.warm === 'fixed',
      pingsHelp: 'Preset default: ' + P.pings + '.',
      overhead: s.overhead,
      setOverhead: ev => set({
        overhead: ev.target.value
      }),
      overheadOpts: [['0', 'None · 0 %'], ['6', 'LibreSpeed default · 6 %'], ['5.13', 'IPv6 · 5.13 %'], ['3.69', 'Alternative · 3.69 %'], ['8.1', 'Alternative 2 · 8.1 %']].map(([v, t]) => ({
        v,
        t
      })),
      url,
      copyIcon: s.copied ? 'check' : 'copy',
      copyUrl: () => {
        try {
          navigator.clipboard && navigator.clipboard.writeText(url);
        } catch (x) {}
        set({
          copied: true
        });
        clearTimeout(this._ct);
        this._ct = setTimeout(() => this.setState({
          copied: false
        }), 1500);
      },
      incRun: s.incRun,
      incRunAria: s.incRun ? 'true' : 'false',
      incRunBg: s.incRun ? 'var(--primary)' : 'transparent',
      incRunBd: s.incRun ? 'none' : '1.5px solid var(--border-strong)',
      toggleIncRun: () => set({
        incRun: !s.incRun
      }),
      changed,
      changedCount: String(changed.length),
      hasChanges: changed.length > 0,
      noChanges: changed.length === 0,
      confirm: s.confirm,
      openReset: () => set({
        confirm: true
      }),
      closeReset: () => set({
        confirm: false
      }),
      doReset: () => this.setState(Object.assign(this.defaults(), {
        confirm: false
      })),
      resetLine: (changed.length === 1 ? '1 setting returns to its default: ' : changed.length + ' settings return to their defaults: ') + changed.map(c => c.k).join(', ') + '. Your test history is not affected.'
    };
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column"
      }
    }, v.desktop ? /*#__PURE__*/React.createElement(Nav, {
      variant: "top",
      active: "settings"
    }) : null, v.mobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-top",
      active: "settings"
    }) : null, /*#__PURE__*/React.createElement("main", {
      style: {
        flex: "1",
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: v.L?.pad,
        display: "grid",
        gridTemplateColumns: v.L?.cols,
        gap: "24px",
        alignItems: "start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("header", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: "0",
        fontSize: v.L?.h1,
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Settings"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 12px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-subtle)"
      }
    }, v.allSaved ? /*#__PURE__*/React.createElement("span", {
      role: "status",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        color: "var(--ok-fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-check",
      size: "14"
    }), "Saved") : null, v.hasErr ? /*#__PURE__*/React.createElement("span", {
      role: "status",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        color: "var(--danger-fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "14"
    }), v.errCountLabel) : null, /*#__PURE__*/React.createElement("span", null, "Changes save automatically in this browser and apply to the next test."))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-preset"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "gauge",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "s-preset"
    }, "Test preset")), /*#__PURE__*/React.createElement("div", {
      className: "card-b",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      role: "radiogroup",
      "aria-labelledby": "s-preset",
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.presetCols,
        gap: "10px"
      }
    }, (v.presets || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      role: "radio",
      "aria-checked": p?.aria,
      tabIndex: "0",
      onClick: p?.pick,
      onKeyDown: p?.key,
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${p?.bd ?? ""}`,
        background: p?.bg,
        cursor: "pointer",
        minHeight: "44px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: p?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: p?.icon,
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, p?.t), p?.def ? /*#__PURE__*/React.createElement("span", {
      className: "pill neutral",
      style: {
        height: "18px",
        fontSize: "10px",
        padding: "0 7px"
      }
    }, "Default") : null, /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        width: "16px",
        height: "16px",
        boxSizing: "border-box",
        borderRadius: "50%",
        border: p?.ring,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: p?.dot
      }
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.45"
      }
    }, p?.d))))), v.isCont ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-1)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "12px 14px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 200px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Direction"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Continuous measures one direction until you stop it.")), /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Continuous direction"
    }, (v.S?.dir || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on,
      style: {
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: o?.c,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: o?.icon,
      size: "14",
      stroke: "2"
    })), o?.t))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "12px 14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 200px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Run length"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Optional. No limit by default. 1 minute to 7 days.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: v.runSw?.cls,
      role: "switch",
      "aria-checked": v.runSw?.aria,
      "aria-label": "Stop after a set time",
      onClick: v.runSw?.on
    }, /*#__PURE__*/React.createElement("span", {
      className: "knob"
    })), v.runLimit ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
      className: v.F?.runVal?.cls,
      style: {
        width: "72px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.runVal?.val,
      "aria-label": "Run length",
      "aria-invalid": v.F?.runVal?.aria,
      "aria-describedby": v.F?.runVal?.desc,
      onChange: v.F?.runVal?.onChange,
      onBlur: v.F?.runVal?.onBlur,
      onKeyDown: v.F?.runVal?.onKeyDown
    })), /*#__PURE__*/React.createElement("label", {
      className: "input",
      style: {
        width: "112px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("select", {
      "aria-label": "Run length unit",
      value: v.runUnit,
      onChange: v.setRunUnit
    }, /*#__PURE__*/React.createElement("option", {
      value: "m"
    }, "minutes"), /*#__PURE__*/React.createElement("option", {
      value: "h"
    }, "hours"), /*#__PURE__*/React.createElement("option", {
      value: "d"
    }, "days")), /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "14"
    }))) : null, v.noRunLimit ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "No limit") : null), v.F?.runVal?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.runVal?.eid,
      style: {
        maxWidth: "280px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.runVal?.err) : null))) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 16px",
        opacity: v.phasesOpacity
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Phases", v.C?.phases ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), (v.phases || []).map((ph, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      role: "checkbox",
      "aria-checked": ph?.aria,
      disabled: ph?.dis,
      onClick: ph?.on,
      style: {
        all: "unset",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        minHeight: "32px",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "16px",
        height: "16px",
        boxSizing: "border-box",
        borderRadius: "4px",
        background: ph?.bg,
        border: ph?.bd,
        color: "var(--primary-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, ph?.on2 ? /*#__PURE__*/React.createElement("bg-icon", {
      name: "check",
      size: "12",
      stroke: "3"
    }) : null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: ph?.c,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: ph?.icon,
      size: "14",
      stroke: "2"
    })), ph?.t))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginLeft: v.L?.orderMl,
        opacity: v.orderOpacity,
        pointerEvents: v.orderPe
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Order"), /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Phase order"
    }, (v.S?.order || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on,
      style: {
        whiteSpace: "nowrap"
      }
    }, o?.t))))), /*#__PURE__*/React.createElement("span", {
      style: {
        flexBasis: "100%",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, v.phasesHelp)))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-conn"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "layers",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "s-conn"
    }, "Connections and limits")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Parallel streams", v.C?.streams ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Auto ramps 1 \u2192 2 \u2192 4 \u2192 6 streams and stops when adding streams no longer helps. Fixed runs 1\u20136. Single shows one connection.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Parallel streams"
    }, (v.S?.streams || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on
    }, o?.t)))), v.isFixed ? /*#__PURE__*/React.createElement("div", {
      role: "group",
      "aria-label": "Stream count",
      style: {
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        height: "34px",
        overflow: "hidden",
        background: "var(--surface-1)"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "Fewer streams",
      disabled: v.nMin,
      onClick: v.nDec,
      style: {
        height: "32px",
        width: "32px",
        borderRadius: "0"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "minus",
      size: "14"
    })), /*#__PURE__*/React.createElement("span", {
      "aria-live": "polite",
      style: {
        width: "34px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)"
      }
    }, v.n), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": "More streams",
      disabled: v.nMax,
      onClick: v.nInc,
      style: {
        height: "32px",
        width: "32px",
        borderRadius: "0"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "plus",
      size: "14"
    }))) : null)), v.timed ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "12px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Duration per direction"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "A direction ends after the minimum once results are stable, and runs up to the maximum on slow or noisy links.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "118px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-sm)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--series-download)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "arrow-down",
      size: "14",
      stroke: "2"
    })), "Download", v.C?.dl ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "custom") : null), /*#__PURE__*/React.createElement("label", {
      className: v.F?.dlMin?.cls,
      style: {
        width: "76px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.dlMin?.val,
      "aria-label": "Download minimum seconds",
      "aria-invalid": v.F?.dlMin?.aria,
      "aria-describedby": v.F?.dlMin?.desc,
      onChange: v.F?.dlMin?.onChange,
      onBlur: v.F?.dlMin?.onBlur,
      onKeyDown: v.F?.dlMin?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s")), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "\u2013"), /*#__PURE__*/React.createElement("label", {
      className: v.F?.dlMax?.cls,
      style: {
        width: "76px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.dlMax?.val,
      "aria-label": "Download maximum seconds",
      "aria-invalid": v.F?.dlMax?.aria,
      "aria-describedby": v.F?.dlMax?.desc,
      onChange: v.F?.dlMax?.onChange,
      onBlur: v.F?.dlMax?.onBlur,
      onKeyDown: v.F?.dlMax?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s"))), v.F?.dlMin?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.dlMin?.eid,
      style: {
        maxWidth: "320px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.dlMin?.err) : null, v.F?.dlMax?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.dlMax?.eid,
      style: {
        maxWidth: "320px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.dlMax?.err) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "118px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-sm)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--series-upload)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "arrow-up",
      size: "14",
      stroke: "2"
    })), "Upload", v.C?.ul ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "custom") : null), /*#__PURE__*/React.createElement("label", {
      className: v.F?.ulMin?.cls,
      style: {
        width: "76px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.ulMin?.val,
      "aria-label": "Upload minimum seconds",
      "aria-invalid": v.F?.ulMin?.aria,
      "aria-describedby": v.F?.ulMin?.desc,
      onChange: v.F?.ulMin?.onChange,
      onBlur: v.F?.ulMin?.onBlur,
      onKeyDown: v.F?.ulMin?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s")), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "\u2013"), /*#__PURE__*/React.createElement("label", {
      className: v.F?.ulMax?.cls,
      style: {
        width: "76px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.ulMax?.val,
      "aria-label": "Upload maximum seconds",
      "aria-invalid": v.F?.ulMax?.aria,
      "aria-describedby": v.F?.ulMax?.desc,
      onChange: v.F?.ulMax?.onChange,
      onBlur: v.F?.ulMax?.onBlur,
      onKeyDown: v.F?.ulMax?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s"))), v.F?.ulMin?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.ulMin?.eid,
      style: {
        maxWidth: "320px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.ulMin?.err) : null, v.F?.ulMax?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.ulMax?.eid,
      style: {
        maxWidth: "320px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.ulMax?.err) : null))) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Data cap per test", v.C?.cap ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Useful on metered mobile links. A direction stops early when the cap is reached and the result is marked.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: v.capSw?.cls,
      role: "switch",
      "aria-checked": v.capSw?.aria,
      "aria-label": "Data cap",
      onClick: v.capSw?.on
    }, /*#__PURE__*/React.createElement("span", {
      className: "knob"
    })), /*#__PURE__*/React.createElement("label", {
      className: v.F?.capMB?.cls,
      style: {
        width: "110px",
        height: "34px",
        opacity: v.capOpacity
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.capMB?.val,
      disabled: v.capOff,
      "aria-label": "Data cap in MB",
      "aria-invalid": v.F?.capMB?.aria,
      "aria-describedby": v.F?.capMB?.desc,
      onChange: v.F?.capMB?.onChange,
      onBlur: v.F?.capMB?.onBlur,
      onKeyDown: v.F?.capMB?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "MB"))), v.F?.capMB?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.capMB?.eid,
      style: {
        maxWidth: "280px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.capMB?.err) : null)))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-disp"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "monitor",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "s-disp"
    }, "Display and behaviour")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Units", v.C?.units ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null)), /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Units"
    }, (v.S?.units || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on,
      style: {
        whiteSpace: "nowrap"
      }
    }, o?.t))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Theme", v.C?.theme ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null)), /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Theme"
    }, (v.S?.theme || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: o?.icon,
      size: "14"
    }), o?.t))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Language"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Only shipped languages are listed.")), /*#__PURE__*/React.createElement("label", {
      className: "input",
      style: {
        width: "200px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "languages",
      size: "14"
    }), /*#__PURE__*/React.createElement("select", {
      "aria-label": "Language"
    }, /*#__PURE__*/React.createElement("option", null, "English")), /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "14"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Auto-start on page load", v.C?.auto ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Shows a countdown first, so you can cancel. Also available as ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, "?run=1"), ".")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: v.autoSw?.cls,
      role: "switch",
      "aria-checked": v.autoSw?.aria,
      "aria-label": "Auto-start",
      onClick: v.autoSw?.on
    }, /*#__PURE__*/React.createElement("span", {
      className: "knob"
    })), /*#__PURE__*/React.createElement("label", {
      className: v.F?.countdown?.cls,
      style: {
        width: "96px",
        height: "34px",
        opacity: v.autoOpacity
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.countdown?.val,
      disabled: v.autoOff,
      "aria-label": "Countdown seconds",
      "aria-invalid": v.F?.countdown?.aria,
      "aria-describedby": v.F?.countdown?.desc,
      onChange: v.F?.countdown?.onChange,
      onBlur: v.F?.countdown?.onBlur,
      onKeyDown: v.F?.countdown?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s"))), v.F?.countdown?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.countdown?.eid,
      style: {
        maxWidth: "280px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.countdown?.err) : null)))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-adv"
    }, /*#__PURE__*/React.createElement("button", {
      "aria-expanded": v.advAria,
      "aria-controls": "adv-body",
      onClick: v.toggleAdv,
      style: {
        all: "unset",
        boxSizing: "border-box",
        width: "100%",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        minHeight: "44px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sliders",
      size: "15"
    })), /*#__PURE__*/React.createElement("span", {
      id: "s-adv",
      style: {
        fontSize: "var(--text-base)",
        fontWeight: "600"
      }
    }, "Advanced"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, v.advSummary), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.advIcon,
      size: "16"
    }))), v.advOpen ? /*#__PURE__*/React.createElement("div", {
      id: "adv-body",
      style: {
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Warm-up", v.C?.warm ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Auto ends warm-up once throughput settles. Samples during warm-up are discarded.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "seg",
      role: "radiogroup",
      "aria-label": "Warm-up"
    }, (v.S?.warm || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: o?.cls,
      role: "radio",
      "aria-checked": o?.aria,
      onClick: o?.on
    }, o?.t)))), v.warmFixed ? /*#__PURE__*/React.createElement("label", {
      className: v.F?.warmS?.cls,
      style: {
        width: "84px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.warmS?.val,
      "aria-label": "Warm-up seconds",
      "aria-invalid": v.F?.warmS?.aria,
      "aria-describedby": v.F?.warmS?.desc,
      onChange: v.F?.warmS?.onChange,
      onBlur: v.F?.warmS?.onBlur,
      onKeyDown: v.F?.warmS?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "s")) : null), v.F?.warmS?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.warmS?.eid,
      style: {
        maxWidth: "280px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.warmS?.err) : null)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Ping count", v.C?.pings ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Used for idle latency and jitter. ", v.pingsHelp)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("label", {
      className: v.F?.pings?.cls,
      style: {
        width: "110px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: v.F?.pings?.val,
      "aria-label": "Ping count",
      "aria-invalid": v.F?.pings?.aria,
      "aria-describedby": v.F?.pings?.desc,
      onChange: v.F?.pings?.onChange,
      onBlur: v.F?.pings?.onBlur,
      onKeyDown: v.F?.pings?.onKeyDown
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)"
      }
    }, "pings")), v.F?.pings?.bad ? /*#__PURE__*/React.createElement("span", {
      className: "fmsg",
      id: v.F?.pings?.eid,
      style: {
        maxWidth: "280px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "12"
    }), v.F?.pings?.err) : null)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 20px",
        padding: "14px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 240px",
        display: "flex",
        flexDirection: "column",
        gap: "3px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, "Overhead compensation", v.C?.overhead ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        color: "var(--primary-text)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--primary)"
      }
    }), "changed") : null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Adds estimated protocol overhead to measured throughput. Shown next to every number when not 0 %."), v.C?.overhead ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "4px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Shown as", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        color: "var(--fg)"
      }
    }, "941.2 Mbit/s"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-muted)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-full)",
        padding: "1px 7px"
      }
    }, "+", v.overhead, " % overhead")) : null), /*#__PURE__*/React.createElement("label", {
      className: "input",
      style: {
        width: "240px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("select", {
      "aria-label": "Overhead compensation",
      value: v.overhead,
      onChange: v.setOverhead
    }, (v.overheadOpts || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("option", {
      value: o?.v
    }, o?.t)))), /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "14"
    })))) : null)), /*#__PURE__*/React.createElement("aside", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-share"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "link",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "s-share"
    }, "Shareable link")), /*#__PURE__*/React.createElement("div", {
      className: "card-b",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45"
      }
    }, "Opens BitGauge with the test settings that differ from defaults. Units and theme stay on each device."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("label", {
      className: "input mono sm",
      style: {
        flex: "1",
        minWidth: "0",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      readOnly: true,
      value: v.url,
      "aria-label": "Shareable URL",
      style: {
        fontSize: "var(--text-caption)"
      }
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary icon",
      "aria-label": "Copy link",
      onClick: v.copyUrl
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.copyIcon,
      size: "15"
    }))), /*#__PURE__*/React.createElement("button", {
      role: "checkbox",
      "aria-checked": v.incRunAria,
      onClick: v.toggleIncRun,
      style: {
        all: "unset",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        minHeight: "32px",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "16px",
        height: "16px",
        flex: "none",
        boxSizing: "border-box",
        borderRadius: "4px",
        background: v.incRunBg,
        border: v.incRunBd,
        color: "var(--primary-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, v.incRun ? /*#__PURE__*/React.createElement("bg-icon", {
      name: "check",
      size: "12",
      stroke: "3"
    }) : null), /*#__PURE__*/React.createElement("span", null, "Include ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)"
      }
    }, "run=1"), " (start automatically)")))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-labelledby": "s-changed"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sliders",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t",
      id: "s-changed"
    }, "Changed from defaults"), /*#__PURE__*/React.createElement("span", {
      className: "right",
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.changedCount)), v.hasChanges ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "4px 16px 4px"
      }
    }, (v.changed || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1",
        minWidth: "0",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)"
      }
    }, c?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, "default ", c?.d)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--primary-text)",
        textAlign: "right"
      }
    }, c?.v), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost icon sm",
      "aria-label": c?.label,
      title: c?.label,
      onClick: c?.reset,
      style: {
        width: "28px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "rotate-ccw",
      size: "13"
    })))))) : null, v.noChanges ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 16px 2px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Everything is at its default.") : null, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 16px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn danger sm",
      disabled: v.noChanges,
      onClick: v.openReset,
      style: {
        width: "100%",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "rotate-ccw",
      size: "14"
    }), "Reset all to defaults"))))), v.mobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "auto",
        position: "sticky",
        bottom: "0",
        zIndex: "var(--z-nav)"
      }
    }, /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-bottom",
      active: "settings"
    })) : null, v.confirm ? /*#__PURE__*/React.createElement("div", {
      onClick: v.closeReset,
      style: {
        position: "absolute",
        inset: "0",
        zIndex: "40",
        background: "var(--scrim)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: v.L?.cfAlign,
        justifyContent: "center",
        paddingTop: v.L?.cfTop
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "modal",
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "rst-t",
      "aria-describedby": "rst-d",
      onClick: v.stop,
      style: {
        width: v.L?.cfW,
        maxWidth: "100%",
        maxHeight: "none",
        boxSizing: "border-box",
        borderRadius: v.L?.cfRad
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mh"
    }, /*#__PURE__*/React.createElement("div", {
      className: "mi danger"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "rotate-ccw",
      size: "17"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "mt",
      id: "rst-t"
    }, "Reset all settings?"), /*#__PURE__*/React.createElement("div", {
      className: "md",
      id: "rst-d"
    }, v.resetLine))), /*#__PURE__*/React.createElement("div", {
      className: "mf"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1"
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      onClick: v.closeReset
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "btn danger",
      onClick: v.doReset
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "rotate-ccw",
      size: "14"
    }), "Reset all")))) : null);
  }
}
window.Settings = Settings;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Settings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/TestScreen.jsx
try { (() => {
/* BitGauge web UI kit — TestScreen
 * Props:
 *   state: "idle" | "countdown" | "connecting" | "latency" | "download" | "upload" | "complete" | "error" | "error-early" | "cancelled" | "cancelled-late" | "slow" | "slowdone" | "continuous" | "cont-warmup" | "cont-done" | "offline" | "basepath" | "ws-fallback" | "insufficient" | "param-ignored"  (default "download")
 *   mobile: boolean  (default false)
 *   custom: boolean  (default false)
 *   units: "bits" | "bytes"  (default "bits")
 *   theme: "light" | "dark" | "system"  (default "system")
 *   v01: boolean  (default false)
 *   kept: boolean  (default false)
 *   share: boolean  (default false)
 *   label: string  (default "")
 *   tips: boolean  (default false)
 *   resp: "ok" | "uncertain" | "needs-h2" | "not-reported" | "few-samples"  (default "ok")
 *   probe: "auto" | "WebSocket" | "HTTP/2 probe" | "HTTP/1.1 reserved"  (default "auto")
 *   errKind: "requests" | "unreachable" | "restarted" | "network"  (default "requests")
 *   overhead: boolean  (default false)
 *   cpu: boolean  (default false)
 */
class TestScreen extends React.Component {
  state = {
    ann: '',
    ctxOpen: false,
    ctxSel: null,
    ctxCustom: '',
    kept: null,
    share: null,
    label: null,
    inc: false,
    cw: null
  };
  chartRef = React.createRef();
  // The chart fills its card: measure the container and redraw on resize.
  _obs() {
    const el = this.chartRef.current;
    if (el === this._obsEl) return;
    if (this._ro) this._ro.disconnect();
    this._obsEl = el;
    if (!el || !window.ResizeObserver) return;
    this._ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      if (w > 0 && w !== this.state.cw) this.setState({
        cw: w
      });
    });
    this._ro.observe(el);
  }
  componentDidMount() {
    if (!window.BG) {
      this._h = () => this.forceUpdate();
      window.addEventListener('bg-lib-ready', this._h);
    }
    this._tick();
    this._obs();
  }
  componentWillUnmount() {
    if (this._h) window.removeEventListener('bg-lib-ready', this._h);
    if (this._ro) this._ro.disconnect();
  }
  componentDidUpdate() {
    this._tick();
    this._obs();
  }
  // Visually hidden polite region: phase changes immediately, live rate at most every 5 s. The 10 Hz readout is not live.
  _tick() {
    const c = this._live;
    if (!c) return;
    const now = Date.now();
    let msg = null;
    if (c.st !== this._st) {
      this._st = c.st;
      this._at = now;
      msg = c.msg;
    } else if (c.rate && now - this._at >= 5000) {
      this._at = now;
      msg = c.rate;
    }
    if (msg && msg !== this.state.ann) this.setState({
      ann: msg
    });
  }
  renderVals() {
    const BG = window.BG;
    const on = v => !!v && v !== 'false';
    const m = on(this.props.mobile);
    const st = this.props.state || 'idle',
      bp = st === 'basepath',
      v01 = on(this.props.v01);
    const base = {
      mobile: m,
      desktop: !m,
      srvStatus: st === 'offline' || st === 'error-early' || st === 'error' && ['unreachable', 'restarted'].includes(this.props.errKind) ? 'offline' : 'online',
      navMobile: m && !bp,
      navDesktop: !m && !bp,
      basePath: bp,
      v01,
      BP: m ? {
        pad: '28px 16px 40px',
        h: '22px',
        minH: '720px'
      } : {
        pad: '72px 40px',
        h: '28px',
        minH: '760px'
      },
      theme: this.props.theme || 'system',
      liveMsg: this.state.ann || ''
    };
    if (!BG || bp) return {
      ...base,
      ready: false
    };
    const unit = this.props.units === 'bytes' ? 'bytes' : 'bits';
    const rs = v => BG.rateStr(v, unit),
      rn = v => BG.rate(v, unit).n;
    const custom = on(this.props.custom) || unit === 'bytes';
    const OH = on(this.props.overhead) ? ['+' + (parseFloat(this.props.overhead) || 6) + ' % overhead compensation'] : [];
    const RS = this.props.resp || 'ok';
    const C = {
      lat: 'var(--series-latency)',
      down: 'var(--series-download)',
      up: 'var(--series-upload)'
    };
    const L = m ? {
      pad: '16px 16px 24px',
      gap: '14px',
      tileGap: '10px',
      instCols: 'minmax(0,1fr)',
      gPad: '20px 16px 20px',
      cPad: '14px 16px 16px',
      bl: 'none',
      bt: '1px solid var(--border-subtle)',
      gSize: 272,
      gNum: '46px',
      gTitle: '22px',
      btnW: '100%',
      btnH: '52px',
      kbd: false,
      chartW: 311,
      chartH: 150,
      stepPad: '12px 14px',
      stepGap: '10px',
      stepDir: 'column',
      stepAlign: 'flex-start',
      stepInnerGap: '2px',
      metaML: '0',
      metaWS: 'normal',
      resCols: 'repeat(2, minmax(0,1fr))',
      tilePad: '12px 14px',
      tileNum: '24px',
      loadSpan: 'span 2',
      fitSpan: 'span 2',
      metaSpan: 'span 2',
      loadCols: 'minmax(0,1fr)'
    } : {
      pad: '24px 40px 40px',
      gap: '20px',
      tileGap: '16px',
      instCols: '400px minmax(0,1fr)',
      gPad: '28px 24px 28px',
      cPad: '20px 24px 20px',
      bl: '1px solid var(--border-subtle)',
      bt: 'none',
      gSize: 316,
      gNum: '58px',
      gTitle: '26px',
      btnW: '248px',
      btnH: '46px',
      kbd: true,
      chartW: 672,
      chartH: 300,
      stepPad: '16px 24px',
      stepGap: '24px',
      stepDir: 'row',
      stepAlign: 'center',
      stepInnerGap: '8px',
      metaML: 'auto',
      metaWS: 'nowrap',
      resCols: 'repeat(4, minmax(0,1fr))',
      tilePad: '16px 18px',
      tileNum: '30px',
      loadSpan: 'span 2',
      fitSpan: 'span 1',
      metaSpan: 'span 1',
      loadCols: '172px minmax(0,1fr)'
    };
    const slow = st === 'slow' || st === 'slowdone';
    const after = ['complete', 'cancelled', 'cancelled-late', 'slowdone'].includes(st);
    const src = this.props.probe && this.props.probe !== 'auto' ? this.props.probe : slow || st === 'ws-fallback' ? 'HTTP/2 probe' : 'WebSocket';
    const lowLink = slow || st === 'insufficient';

    // ---- connection strip (context pill is editable)
    const CO = [['LAN', 'house'], ['VPN', 'shield'], ['None', 'circle-dashed'], ['Custom…', 'pencil']];
    const sel = this.state.ctxSel || (slow ? 'VPN' : 'LAN');
    let ctx = {
      label: sel === 'Custom…' ? this.state.ctxCustom || 'Custom' : sel,
      icon: CO.find(o => o[0] === sel)[1],
      suggested: !this.state.ctxSel
    };
    const ctxOpts = CO.map(([label, icon]) => ({
      label,
      icon,
      on: label === sel,
      checked: label === sel ? 'true' : 'false',
      bg: label === sel ? 'var(--primary-bg)' : 'transparent',
      pick: () => this.setState({
        ctxSel: label,
        ctxOpen: label === 'Custom…'
      })
    }));
    const streams = lowLink ? '2' : custom ? '4' : '6',
      auto = slow || !custom;
    const plateau = auto ? ' · plateau: no-gain' : '';
    const conn = [{
      k: 'Client IP',
      v: slow ? '10.8.0.6' : '192.168.1.42',
      s: 'IPv4'
    }, {
      k: 'Protocol',
      v: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? '—' : 'HTTP/2',
      s: RS === 'not-reported' ? 'not reported' : ''
    }, {
      k: 'Streams',
      v: streams,
      s: (auto ? 'auto' : 'fixed') + (after ? plateau : '')
    }];
    if (st === 'offline') {
      conn.forEach(c => {
        c.v = '—';
        c.s = '';
      });
      if (!this.state.ctxSel) ctx = {
        label: '—',
        icon: 'circle-dashed',
        suggested: false
      };
    }
    const customChips = this.props.chips || [{
      t: 'Extended · 60 s',
      icon: 'timer'
    }, {
      t: '4 streams',
      icon: 'layers'
    }, {
      t: 'Cap 500 MB',
      icon: 'database'
    }];

    // ---- phases
    const PI = {
      lat: ['Latency', 'activity'],
      down: ['Download', 'arrow-down'],
      up: ['Upload', 'arrow-up']
    };
    const ph = (k, status, meta, pct, label) => {
      const S = {
        pending: {
          bar: 'transparent',
          icon: null,
          ic: '',
          lc: 'var(--fg-muted)',
          mc: 'var(--fg-subtle)',
          pct: 0
        },
        active: {
          bar: C[k],
          icon: PI[k][1],
          ic: C[k],
          lc: 'var(--fg)',
          mc: 'var(--fg-muted)'
        },
        done: {
          bar: C[k],
          icon: 'circle-check',
          ic: 'var(--ok)',
          lc: 'var(--fg)',
          mc: 'var(--fg-muted)',
          pct: 100
        },
        failed: {
          bar: 'var(--danger)',
          icon: 'circle-x',
          ic: 'var(--danger)',
          lc: 'var(--fg)',
          mc: 'var(--danger-fg)'
        },
        cancelled: {
          bar: 'var(--fg-subtle)',
          icon: 'circle-minus',
          ic: 'var(--fg-subtle)',
          lc: 'var(--fg)',
          mc: 'var(--fg-muted)'
        },
        skipped: {
          bar: 'transparent',
          icon: 'circle-dashed',
          ic: 'var(--fg-subtle)',
          lc: 'var(--fg-subtle)',
          mc: 'var(--fg-subtle)',
          pct: 0
        },
        capped: {
          bar: 'var(--warn)',
          icon: 'triangle-alert',
          ic: 'var(--warn)',
          lc: 'var(--fg)',
          mc: 'var(--warn-fg)'
        }
      }[status];
      return {
        label: label || PI[k][0],
        meta,
        pct: (S.pct ?? pct) + '%',
        bar: S.bar,
        icon: S.icon,
        ic: S.ic,
        lc: S.lc,
        mc: S.mc,
        hasIcon: !!S.icon,
        isPending: !S.icon,
        aria: status === 'active' ? 'step' : 'false'
      };
    };
    const PD = {
      lat: '~2 s',
      down: '~10–20 s',
      up: '~12–25 s'
    };
    const pend = (k, meta) => ph(k, 'pending', meta || PD[k]);

    // ---- tiles
    const T = o => Object.assign({
      icon: 'circle-dot',
      ic: 'var(--fg-subtle)',
      num: '—',
      unit: '',
      sub: '',
      notes: [],
      span: 'auto',
      tag: null,
      tagCls: '',
      nc: 'var(--fg)'
    }, o);
    const rt = (label, icon, ic, v, o) => {
      const r = BG.rate(v, unit);
      return T(Object.assign({
        label,
        icon,
        ic,
        num: r.n,
        unit: r.u,
        notes: OH
      }, o));
    };
    const em = (label, icon, ic, sub) => T({
      label,
      icon,
      ic,
      nc: 'var(--fg-subtle)',
      sub: sub || ''
    });
    const LIVE = {
      tag: 'Live',
      tagCls: 'pill info'
    };
    const msT = (label, icon, v, sub, o) => T(Object.assign({
      label,
      icon,
      ic: C.lat,
      num: BG.ms(v),
      unit: 'ms',
      sub
    }, o));
    const eDown = s => em('Download', 'arrow-down', C.down, s),
      eUp = s => em('Upload', 'arrow-up', C.up, s);
    const eLat = () => em('Idle latency', 'activity', C.lat),
      eJit = () => em('Jitter', 'activity', C.lat);
    const idleSub = (mn, p9) => 'min ' + mn + ' · p90 ' + p9 + ' ms · ' + src + ' · 0 % probe timeouts';
    const IDLE = lowLink ? {
      v: 48,
      sub: idleSub('41', '66'),
      jit: 9.4
    } : {
      v: 3.1,
      sub: idleSub('2.4', '4.1'),
      jit: 0.8
    };
    const latT = o => msT('Idle latency', 'activity', IDLE.v, IDLE.sub, o);
    const jitT = o => T(Object.assign({
      label: 'Jitter',
      icon: 'activity',
      ic: C.lat,
      num: BG.jit(IDLE.jit),
      unit: 'ms',
      sub: 'mean of consecutive differences'
    }, o));

    // ---- steady-window stats: avg and peak (= p90) over warm-up end → now only
    const q90 = a => {
      const s = a.slice().sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))];
    };
    const steady = (pts, warm) => {
      const v = pts.filter(q => q[0] >= warm).map(q => q[1]);
      return v.length < 3 ? null : {
        avg: v.reduce((a, b) => a + b, 0) / v.length,
        peak: q90(v)
      };
    };
    const liveSub = sw => sw ? 'avg so far ' + rn(sw.avg) + ' · peak ' + rn(sw.peak) : 'warming up';
    const tail = pts => {
      const tl = pts[pts.length - 1][0],
        v = pts.filter(q => q[0] > tl - 1 + 1e-6).map(q => q[1]);
      return {
        cur: pts[pts.length - 1][1],
        lo: Math.min(...v),
        hi: Math.max(...v)
      };
    };
    const lastLat = (lp, min) => Math.max(min, lp[lp.length - 1][1]);
    const latP90 = lp => q90(lp.slice(-20).map(q => q[1]));

    // ---- load card
    const GR = g => {
      const scale = ['A+', 'A', 'B', 'C', 'D', 'F'].map(x => {
        const sel = x === g,
          tone = BG.GRADES[x].tone;
        return {
          g: x,
          w: sel ? 700 : 500,
          bg: sel ? 'var(--' + tone + '-bg)' : 'var(--surface-3)',
          c: sel ? 'var(--' + tone + '-fg)' : 'var(--fg-subtle)'
        };
      });
      if (!g) return {
        grade: '—',
        gStyle: 'dashed',
        gBd: 'var(--border-strong)',
        gBg: 'transparent',
        gFg: 'var(--fg-subtle)',
        scale,
        gAria: 'Bufferbloat grade pending'
      };
      const t = BG.GRADES[g].tone;
      return {
        grade: g,
        gStyle: 'solid',
        gBd: 'var(--' + t + '-border)',
        gBg: 'var(--' + t + '-bg)',
        gFg: 'var(--' + t + '-fg)',
        gText: BG.GRADES[g].text,
        scale,
        gAria: 'Bufferbloat grade ' + g + ', ' + BG.GRADES[g].text
      };
    };
    const lrow = (k, v, o) => {
      o = o || {};
      const label = (k === 'down' ? 'During download' : 'During upload') + ' · ' + src;
      if (v == null) return {
        icon: PI[k][1],
        ic: C[k],
        label,
        sub: o.sub || 'Pending',
        num: '—',
        unit: '',
        nc: 'var(--fg-subtle)'
      };
      const sub = (o.p90 != null ? 'p90 ' + BG.ms(o.p90) + ' · ' : '') + '+' + BG.ms(v - IDLE.v) + ' ms vs idle' + (o.partial ? ' · partial' : '');
      return {
        icon: PI[k][1],
        ic: C[k],
        label,
        sub: o.sub || sub,
        num: BG.ms(v),
        unit: 'ms',
        nc: o.live ? 'var(--primary-text)' : 'var(--fg)'
      };
    };
    // HTTP loaded responsiveness: one RPM per direction; no High/Low levels.
    const respB = (d, u) => {
      const blocked = RS === 'needs-h2' || RS === 'not-reported';
      const dir = (k, v) => {
        const b = {
          icon: PI[k][1],
          ic: C[k],
          num: null,
          unit: 'RPM',
          text: null,
          nc: RS === 'uncertain' ? 'var(--fg-muted)' : 'var(--fg)'
        };
        if (blocked) return Object.assign(b, {
          text: '—'
        });
        if (v === 'few' || RS === 'few-samples' && k === 'up' && typeof v === 'number') return Object.assign(b, {
          text: 'not enough samples'
        });
        if (v == null) return Object.assign(b, {
          text: '—'
        });
        return Object.assign(b, {
          num: v.toLocaleString('en-US')
        });
      };
      const has = typeof d === 'number' || typeof u === 'number';
      return {
        proto: RS === 'needs-h2' ? 'HTTP/1.1' : RS === 'not-reported' ? 'not reported' : 'h2',
        note: RS === 'needs-h2' ? 'needs HTTP/2 or HTTP/3 at the reverse proxy' : RS === 'not-reported' ? 'protocol not reported — treated as HTTP/1.1' : RS === 'uncertain' && has ? 'round trips per minute · uncertain' : 'round trips per minute, one per direction',
        tag: RS === 'uncertain' && has ? 'Uncertain' : null,
        dirs: [dir('down', d), dir('up', u)]
      };
    };
    const load = (g, rows, resp, text) => Object.assign(GR(g), {
      rows,
      resp
    }, text ? {
      gText: text
    } : {});
    const FIT = [['Streaming', 'tv'], ['Gaming', 'gamepad'], ['Video calls', 'video']];
    const fit = (q, none) => FIT.map(([label, icon], i) => {
      const nn = Array.isArray(none) ? none[i] : none;
      if (!q || q[i] == null) return {
        label,
        icon,
        rating: null,
        none: nn || '—'
      };
      const Q = BG.QUALITY[q[i]];
      return {
        label,
        icon,
        rating: q[i],
        cls: 'sbadge ' + Q.tone,
        ricon: Q.icon,
        none: null
      };
    });
    const PL = {
      icon: 'signal',
      label: 'Packet loss',
      na: true
    };
    const meta = (data, dataSub, dur, durSub) => [{
      icon: 'database',
      label: 'Data used',
      sub: dataSub,
      value: data,
      vc: data === '—' ? 'var(--fg-subtle)' : 'var(--fg)'
    }, {
      icon: 'timer',
      label: 'Duration',
      sub: durSub,
      value: dur,
      vc: dur === '—' ? 'var(--fg-subtle)' : 'var(--fg)'
    }, PL];
    const N = (tone, icon, title, body, actions) => {
      const t = tone === 'neutral' ? {
        bg: 'var(--surface-2)',
        bd: 'var(--border-default)',
        fg: 'var(--fg)',
        ic: 'var(--fg-subtle)'
      } : {
        bg: 'var(--' + tone + '-bg)',
        bd: 'var(--' + tone + '-border)',
        fg: 'var(--' + tone + '-fg)',
        ic: 'var(--' + tone + ')'
      };
      return Object.assign(t, {
        icon,
        title,
        body,
        actions: actions || [],
        role: tone === 'danger' ? 'alert' : 'status'
      });
    };
    const BTN = {
      start: {
        label: 'Start test',
        icon: 'play',
        cls: 'btn lg primary',
        kbd: 'Enter'
      },
      stop: {
        label: 'Stop test',
        icon: 'square',
        cls: 'btn lg secondary',
        kbd: 'Esc'
      },
      again: {
        label: 'Run again',
        icon: 'rotate-ccw',
        cls: 'btn lg primary',
        kbd: 'Enter'
      },
      retry: {
        label: 'Retry test',
        icon: 'refresh-cw',
        cls: 'btn lg primary',
        kbd: 'Enter'
      },
      now: {
        label: 'Start now',
        icon: 'play',
        cls: 'btn lg primary',
        kbd: 'Enter'
      }
    };
    const shift = (pts, dt) => pts.map(p => [p[0] + dt, p[1]]);
    // Upload: "received" (server-confirmed) trails client "sending" progress.
    const delay = (pts, d, tMax) => {
      const r = pts.map(q => [q[0] + d, q[1]]).filter(q => q[0] <= tMax);
      return r.length >= 2 ? r : [[0, 0], [Math.max(0.01, tMax), 0]];
    };
    const ser = (pts, c, faint) => ({
      pts,
      c,
      so: faint ? 0.4 : 1,
      fo: faint ? 0 : 0.1
    });
    const lg = (t, c, dash, o) => ({
      t,
      c,
      dash: dash ? 'dashed' : 'solid',
      o: o || 1
    });
    const LG = {
      d: lg('Download', C.down),
      u: lg('Upload', C.up),
      ur: lg('Upload · received', C.up),
      us: lg('Upload · sending', C.up, false, 0.4),
      l: lg('Latency under load', C.lat, true)
    };
    const DOWN = BG.thr(3, 612e6, 12),
      DLAT = BG.lat(5, 3.1, 18, 12);
    const DONE_D = rt('Download', 'arrow-down', C.down, 612e6, {
      sub: 'peak ' + rn(641e6) + ' · ' + streams + ' streams' + plateau
    });
    const DONE_U = rt('Upload', 'arrow-up', C.up, 438e6, {
      sub: 'peak ' + rn(455e6) + ' · ' + streams + ' streams' + plateau
    });
    const ROW_D = lrow('down', 18, {
      p90: 24
    });
    const EK = {
      requests: ['3 requests in a row failed during download', '3 requests in a row failed'],
      unreachable: ['server unreachable', 'server unreachable'],
      restarted: ['server restarted', 'server restarted'],
      network: ['network changed', 'network changed']
    }[this.props.errKind || 'requests'] || ['3 requests in a row failed during download', '3 requests in a row failed'];
    const P = this.props.progress == null || this.props.progress === '' ? null : Math.max(0, Math.min(1, +this.props.progress));
    const pv = d => P == null ? d : P;
    const cdN = Math.max(1, Math.ceil(3 * (1 - pv(0.2)) - 1e-9));
    const EMPTY = {
      xMax: 12,
      yMax: 1e9,
      series: [],
      empty: 'Throughput over time appears here while the test runs.',
      title: 'Throughput',
      legend: [LG.d, LG.u, LG.l],
      meta: ''
    };
    const preLoad = () => load(null, [lrow('down'), lrow('up')], respB(null, null), 'Graded after upload');
    let S;
    switch (st) {
      case 'countdown':
      case 'param-ignored':
      case 'idle':
        S = {
          phases: [pend('lat'), pend('down'), pend('up')],
          gauge: {
            opts: {}
          },
          R: st !== 'countdown' ? {
            textual: true,
            title: 'Ready',
            sub: m ? 'Tap Start test to begin' : 'Press Enter to start',
            icon: null
          } : {
            numeric: true,
            eyebrow: 'Auto-start in',
            icon: 'timer',
            ec: 'var(--primary-text)',
            num: String(cdN),
            unit: cdN === 1 ? 'second' : 'seconds',
            sub: 'Esc cancels'
          },
          countdown: st === 'countdown',
          chart: EMPTY,
          prim: [eDown(), eUp(), eLat(), eJit()],
          load: preLoad(),
          fit: fit(null),
          meta: meta('—', '', '—', ''),
          notices: st === 'countdown' ? [N('info', 'timer', 'Auto-start in ' + cdN + ' s', 'This page was opened from a link with autostart enabled.', [{
            label: 'Cancel',
            icon: 'x',
            cls: 'btn sm secondary'
          }])] : st === 'param-ignored' ? [N('warn', 'link', 'URL parameter ignored', 'streams=12 ignored, allowed 1–6. Streams stay on Auto; the other parameters from the link were applied.', [{
            label: 'Dismiss',
            icon: 'x',
            cls: 'btn sm ghost'
          }])] : [],
          btn: st === 'countdown' ? BTN.now : BTN.start,
          lastLine: st !== 'countdown'
        };
        break;
      case 'connecting':
        {
          const p = pv(0.5);
          S = {
            phases: [ph('lat', 'active', 'server info', p * 100, 'Connecting…'), pend('down'), pend('up')],
            gauge: {
              opts: {}
            },
            R: {
              textual: true,
              title: 'Connecting…',
              sub: 'Basement NAS · reading server info',
              icon: null
            },
            chart: EMPTY,
            prim: [eDown(), eUp(), eLat(), eJit()],
            load: preLoad(),
            fit: fit(null),
            meta: meta('—', '', (0.6 * p).toFixed(1) + ' s', 'elapsed'),
            notices: [],
            btn: BTN.stop
          };
        }
        break;
      case 'latency':
        {
          const p = pv(0.7),
            t = Math.max(0.1, 2 * p),
            n = Math.max(1, Math.round(20 * p)),
            lp = BG.lat(5, 3.1, 3.1, t, 0.1, 0.35),
            lv = lp.map(q => q[1]);
          S = {
            phases: [ph('lat', 'active', n + ' / 20 pings', p * 100), pend('down'), pend('up')],
            gauge: {
              opts: {
                mode: 'ms',
                value: lv[lv.length - 1],
                bandLo: Math.min(...lv),
                bandHi: Math.max(...lv)
              },
              scale: 'log scale · 1 – 1000 ms',
              c: C.lat
            },
            R: {
              numeric: true,
              eyebrow: 'Latency',
              icon: 'activity',
              ec: C.lat,
              num: BG.ms(lv[lv.length - 1]),
              unit: 'ms',
              sub: 'median 3.1 · ping ' + n + ' of 20'
            },
            chart: {
              xMax: 2,
              ms: true,
              series: [ser(lp, C.lat)],
              now: t,
              title: 'Latency samples',
              legend: [lg('Round-trip time', C.lat)],
              meta: t.toFixed(1) + ' s / ~2 s'
            },
            prim: [eDown(), eUp(), latT(LIVE), jitT(LIVE)],
            load: preLoad(),
            fit: fit(null),
            meta: meta(Math.max(1, Math.round(17 * p)) + ' kB', 'so far', (t + 0.6).toFixed(1) + ' s', 'elapsed'),
            notices: [],
            btn: BTN.stop
          };
        }
        break;
      case 'ws-fallback':
      case 'download':
        {
          const p = pv(0.617),
            t = Math.max(0.2, 12 * p),
            dp = BG.thr(3, 590e6, t),
            d = tail(dp),
            sw = steady(dp, 2),
            lp = BG.lat(5, 3.1, 17, t),
            all = dp.reduce((a, q) => a + q[1], 0) / dp.length;
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'active', (12 - t).toFixed(1) + ' s left', p * 100), pend('up')],
            gauge: {
              opts: {
                value: d.cur,
                bandLo: d.lo,
                bandHi: d.hi,
                peak: sw ? sw.peak : null
              },
              src: dp,
              c: C.down
            },
            R: {
              numeric: true,
              eyebrow: 'Download',
              icon: 'arrow-down',
              ec: C.down,
              num: rn(d.cur),
              unit: BG.rate(d.cur, unit).u,
              sub: liveSub(sw),
              oh: OH[0]
            },
            chart: {
              xMax: 12,
              series: [ser(dp, C.down)],
              lat: lp,
              now: t,
              title: 'Throughput',
              legend: [LG.d, LG.l],
              meta: t.toFixed(1) + ' s / 12 s'
            },
            prim: [rt('Download', 'arrow-down', C.down, d.cur, Object.assign({
              sub: liveSub(sw)
            }, LIVE)), eUp('up next'), latT(), jitT()],
            load: load(null, [lrow('down', lastLat(lp, 3.2), {
              p90: latP90(lp),
              live: true
            }), lrow('up')], respB(null, null), 'Graded after upload'),
            fit: fit(null),
            meta: meta(BG.bytes(all * t / 8), 'so far', (t + 2.3).toFixed(1) + ' s', 'elapsed'),
            notices: st === 'ws-fallback' ? [N('info', 'info', 'WebSocket unavailable — HTTP latency fallback', 'The reverse proxy did not accept a WebSocket upgrade, so latency is measured with HTTP/2 requests. Values can read slightly higher.')] : [],
            btn: BTN.stop
          };
        }
        break;
      case 'upload':
        {
          const p = pv(0.567),
            t = Math.max(0.2, 12 * p),
            snd = BG.thr(7, 431e6, t),
            rcv = delay(snd, 0.4, t),
            u = tail(snd),
            sw = steady(rcv, 4),
            lp = BG.lat(9, 3.1, 40, t),
            rc = rcv[rcv.length - 1][1];
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'active', (12 - t).toFixed(1) + ' s left', p * 100)],
            gauge: {
              opts: {
                value: u.cur,
                bandLo: u.lo,
                bandHi: u.hi
              },
              prev: DOWN,
              src: snd,
              c: C.up
            },
            R: {
              numeric: true,
              eyebrow: 'Upload · sending',
              icon: 'arrow-up',
              ec: C.up,
              num: rn(u.cur),
              unit: BG.rate(u.cur, unit).u,
              sub: liveSub(sw),
              oh: OH[0]
            },
            chart: {
              xMax: 24,
              series: [ser(DOWN, C.down), ser(shift(snd, 12), C.up, true), ser(shift(rcv, 12), C.up)],
              lat: DLAT.concat(shift(lp, 12)),
              seps: [{
                t: 0,
                label: 'Download'
              }, {
                t: 12,
                label: 'Upload'
              }],
              now: 12 + t,
              title: 'Throughput',
              legend: [LG.d, LG.ur, LG.us, LG.l],
              meta: (12 + t).toFixed(1) + ' s / 24 s'
            },
            prim: [DONE_D, rt('Upload', 'arrow-up', C.up, rc || u.cur, Object.assign({
              sub: liveSub(sw)
            }, LIVE)), latT(), jitT()],
            load: load(null, [ROW_D, lrow('up', lastLat(lp, 3.2), {
              p90: latP90(lp),
              live: true
            })], respB(1420, null), 'Graded after upload'),
            fit: fit(null),
            meta: meta(BG.bytes(0.918e9 + 431e6 * t / 8), 'so far', (t + 14.3).toFixed(1) + ' s', 'elapsed'),
            notices: [],
            btn: BTN.stop
          };
        }
        break;
      case 'complete':
        S = {
          phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'done', rs(438e6))],
          gauge: {
            opts: {
              value: 612e6,
              inner: 438e6
            },
            prev: DOWN,
            c: C.down
          },
          R: {
            numeric: true,
            eyebrow: 'Download',
            icon: 'arrow-down',
            ec: C.down,
            num: rn(612e6),
            unit: BG.rate(612e6, unit).u,
            sub: '',
            up: rs(438e6) + ' upload',
            oh: OH[0]
          },
          chart: {
            xMax: 24,
            series: [ser(DOWN, C.down), ser(shift(BG.thr(7, 438e6, 12), 12), C.up)],
            lat: DLAT.concat(shift(BG.lat(9, 3.1, 42, 12), 12)),
            seps: [{
              t: 0,
              label: 'Download'
            }, {
              t: 12,
              label: 'Upload'
            }],
            title: 'Throughput',
            legend: [LG.d, LG.u, LG.l],
            meta: '24.6 s total'
          },
          prim: [DONE_D, DONE_U, latT(), jitT()],
          load: load('B', [ROW_D, lrow('up', 42, {
            p90: 55
          })], respB(1420, 980)),
          fit: fit(['Great', 'Good', 'Great']),
          meta: meta('1.58 GB', '', '24.6 s', ''),
          notices: on(this.props.cpu) ? [N('warn', 'cpu', "Limited by this device's CPU", 'The browser ran at full CPU during download, so the link may be faster than measured. Close other tabs or test from a faster device.')] : [],
          btn: BTN.again,
          saved: {
            time: '14:02:11',
            label: '',
            chips: ['LAN', 'Home Wi-Fi', 'Office']
          },
          share: {
            blocks: [['↓ DOWNLOAD', 612e6, C.down], ['↑ UPLOAD', 438e6, C.up]],
            foot: ['3.1 ms idle', '0.8 ms jitter', 'Bufferbloat B'],
            lines: ['↓ ' + rs(612e6) + '   ↑ ' + rs(438e6), 'Latency 3.1 ms (2.4–7.9) · jitter 0.8 ms', 'Under load ↓ 18 ms (+15) · ↑ 42 ms (+39)', 'Bufferbloat B · 1,420 RPM', 'Basement NAS · HTTP/2 · 6 streams']
          }
        };
        break;
      case 'error':
        S = {
          phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'failed', 'Error at 6.4 s', 53), ph('up', 'skipped', 'Not run')],
          gauge: {
            opts: {}
          },
          R: {
            textual: true,
            title: 'Connection lost',
            sub: 'Error during download',
            faint: 'last sample ' + rs(575e6),
            icon: 'wifi-off',
            ec: 'var(--danger)'
          },
          chart: {
            xMax: 12,
            series: [ser(BG.thr(3, 575e6, 6.2).concat([[6.3, 2.2e8], [6.4, 0]]), C.down)],
            lat: BG.lat(5, 3.1, 17, 6.2),
            marks: [{
              t: 6.4,
              label: 'Connection lost'
            }],
            markColor: 'var(--danger)',
            title: 'Throughput',
            legend: [LG.d, LG.l],
            meta: 'stopped at 6.4 s',
            noEnd: true
          },
          prim: [T({
            label: 'Download',
            icon: 'arrow-down',
            ic: C.down,
            nc: 'var(--fg-subtle)',
            tag: 'Error',
            tagCls: 'pill danger',
            sub: EK[1]
          }), eUp('not run'), latT(), jitT()],
          load: load(null, [lrow('down', null, {
            sub: 'not measured · download failed'
          }), lrow('up', null, {
            sub: 'Not run'
          })], respB(null, null), 'Not graded — test incomplete'),
          fit: fit(null, ['needs download', 'needs loaded latency', 'needs loaded latency']),
          meta: meta('460 MB', 'not saved', '8.7 s', ''),
          notices: [N('danger', 'wifi-off', 'Connection to Basement NAS lost — ' + EK[0], 'Download stopped at 6.4 s. Latency finished before the error.')],
          btn: BTN.retry,
          partial: {
            kind: 'error',
            keep: true
          }
        };
        break;
      // Cancelled direction: a number only when the CONFIRMED steady window (warm-up end → final confirmed watermark) is ≥ 3 s AND holds ≥ 3 confirmed requests.
      case 'cancelled':
        {
          const snd = BG.thr(7, 402e6, 3.1),
            rcv = delay(snd, 0.4, 2.7);
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'cancelled', 'Cancelled at 3.1 s', 26)],
            gauge: {
              opts: {
                value: 612e6
              },
              prev: DOWN,
              c: C.down,
              noDot: true
            },
            R: {
              textual: true,
              title: 'Cancelled',
              sub: 'Partial results · not saved',
              icon: 'circle-minus',
              ec: 'var(--fg-subtle)'
            },
            chart: {
              xMax: 24,
              series: [ser(DOWN, C.down), ser(shift(snd, 12), C.up, true), ser(shift(rcv, 12), C.up)],
              lat: DLAT.concat(shift(BG.lat(9, 3.1, 37, 3.1), 12)),
              seps: [{
                t: 0,
                label: 'Download'
              }, {
                t: 12,
                label: 'Upload'
              }],
              marks: [{
                t: 15.1,
                label: 'Cancelled'
              }],
              markColor: 'var(--fg-muted)',
              title: 'Throughput',
              legend: [LG.d, LG.ur, LG.us, LG.l],
              meta: 'stopped at 15.1 s',
              noEnd: true
            },
            prim: [DONE_D, T({
              label: 'Upload',
              icon: 'arrow-up',
              ic: C.up,
              nc: 'var(--fg-subtle)',
              tag: 'Cancelled',
              tagCls: 'pill neutral',
              sub: 'Insufficient data — confirmed steady window shorter than 3 s',
              notes: ['156 MB used']
            }), latT(), jitT()],
            load: load(null, [ROW_D, lrow('up', null, {
              sub: 'no steady window'
            })], respB(1420, 'few'), 'Not graded — upload incomplete'),
            fit: fit(['Great', null, null], [null, 'needs loaded latency', 'needs upload']),
            meta: meta('1.08 GB', '', '17.3 s', ''),
            notices: [N('neutral', 'circle-minus', 'Test cancelled during upload', 'Latency and download completed. Upload stopped before a 3 s confirmed steady window, so it has no value.')],
            btn: BTN.again,
            partial: {
              kind: 'partial',
              keep: true
            }
          };
        }
        break;
      case 'cancelled-late':
        {
          const snd = BG.thr(7, 402e6, 9.0),
            rcv = delay(snd, 0.4, 7.6);
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', rs(612e6)), ph('up', 'cancelled', 'Cancelled at 9.0 s', 75)],
            gauge: {
              opts: {
                value: 612e6,
                inner: 402e6
              },
              prev: DOWN,
              c: C.down,
              noDot: true
            },
            R: {
              textual: true,
              title: 'Cancelled',
              sub: 'Partial results · not saved',
              icon: 'circle-minus',
              ec: 'var(--fg-subtle)'
            },
            chart: {
              xMax: 24,
              series: [ser(DOWN, C.down), ser(shift(snd, 12), C.up, true), ser(shift(rcv, 12), C.up)],
              lat: DLAT.concat(shift(BG.lat(9, 3.1, 37, 9.0), 12)),
              seps: [{
                t: 0,
                label: 'Download'
              }, {
                t: 12,
                label: 'Upload'
              }],
              wins: [{
                t0: 16,
                t1: 19.6,
                label: 'Steady 3.6 s'
              }],
              marks: [{
                t: 21,
                label: 'Cancelled'
              }],
              markColor: 'var(--fg-muted)',
              title: 'Throughput',
              legend: [LG.d, LG.ur, LG.us, LG.l],
              meta: 'stopped at 21.0 s',
              noEnd: true
            },
            prim: [DONE_D, rt('Upload', 'arrow-up', C.up, 402e6, {
              tag: 'Partial — stopped early',
              tagCls: 'pill warn',
              sub: 'based on a 3.6 s steady window · 14 requests'
            }), latT(), jitT()],
            load: load(null, [ROW_D, lrow('up', 37, {
              p90: 46,
              partial: true
            })], respB(1420, 610), 'Not graded — upload incomplete'),
            fit: fit(['Great', null, null], [null, 'needs full upload', 'needs full upload']),
            meta: meta('1.37 GB', '', '23.2 s', ''),
            notices: [N('neutral', 'circle-minus', 'Test cancelled during upload', 'Latency and download completed. Upload has a 3.6 s confirmed steady window with 14 requests, enough for a partial value.')],
            btn: BTN.again,
            partial: {
              kind: 'partial',
              keep: true
            }
          };
        }
        break;
      case 'slow':
        {
          const p = pv(0.467),
            t = Math.max(0.5, 20 * p),
            dp = BG.thr(11, 640e3, t, 0.1, 0.22, 2.5),
            d = tail(dp),
            sw = steady(dp, 6),
            lp = BG.lat(13, 48, 162, t, 0.25, 0.25, 2),
            all = dp.reduce((a, q) => a + q[1], 0) / dp.length,
            mb = (all * t / 8 / 1e6).toFixed(1);
          S = {
            phases: [ph('lat', 'done', '48 ms'), ph('down', 'active', 'extended · ' + Math.round(20 - t) + ' s left', p * 100), pend('up', '~25 s')],
            gauge: {
              opts: {
                value: d.cur,
                bandLo: d.lo,
                bandHi: d.hi,
                peak: sw ? sw.peak : null
              },
              src: dp,
              c: C.down
            },
            R: {
              numeric: true,
              eyebrow: 'Download',
              icon: 'arrow-down',
              ec: C.down,
              num: rn(d.cur),
              unit: BG.rate(d.cur, unit).u,
              sub: liveSub(sw),
              oh: OH[0]
            },
            chart: {
              xMax: 20,
              series: [ser(dp, C.down)],
              lat: lp,
              now: t,
              marks: t >= 10 ? [{
                t: 10,
                label: 'Extended'
              }] : [],
              markColor: 'var(--info)',
              title: 'Throughput',
              legend: [LG.d, LG.l],
              meta: Math.round(t) + ' s / 20 s'
            },
            prim: [rt('Download', 'arrow-down', C.down, d.cur, Object.assign({
              sub: liveSub(sw)
            }, LIVE)), eUp('up next'), latT(), jitT()],
            load: load(null, [lrow('down', lastLat(lp, 49), {
              p90: latP90(lp),
              live: true
            }), lrow('up')], respB(null, null), 'Graded after upload'),
            fit: fit(null),
            meta: meta(mb + ' MB', 'so far · cap 2 MB', (t + 4.2).toFixed(1) + ' s', 'elapsed'),
            notices: [N('info', 'hourglass', 'Slow connection detected — test extended', 'Download now runs for up to 20 s to collect enough samples. ' + mb + ' MB of your 2 MB cap used so far.')],
            btn: BTN.stop
          };
        }
        break;
      case 'slowdone':
        S = {
          phases: [ph('lat', 'done', '48 ms'), ph('down', 'done', rs(640e3)), ph('up', 'capped', 'stopped at data cap', 64)],
          gauge: {
            opts: {
              value: 640e3,
              inner: 210e3
            },
            prev: BG.thr(11, 640e3, 20, 0.1, 0.22, 2.5),
            c: C.down
          },
          R: {
            numeric: true,
            eyebrow: 'Download',
            icon: 'arrow-down',
            ec: C.down,
            num: rn(640e3),
            unit: BG.rate(640e3, unit).u,
            sub: '',
            up: rs(210e3) + ' upload',
            oh: OH[0]
          },
          chart: {
            xMax: 36,
            series: [ser(BG.thr(11, 640e3, 20, 0.1, 0.22, 2.5), C.down), ser(shift(BG.thr(17, 210e3, 16, 0.25, 0.3, 2.5), 20), C.up)],
            lat: BG.lat(13, 48, 162, 20, 0.25, 0.25, 2).concat(shift(BG.lat(15, 48, 310, 16, 0.25, 0.25, 2), 20)),
            seps: [{
              t: 0,
              label: 'Download'
            }, {
              t: 20,
              label: 'Upload'
            }],
            marks: [{
              t: 36,
              label: 'Data cap'
            }],
            markColor: 'var(--warn)',
            title: 'Throughput',
            legend: [LG.d, LG.u, LG.l],
            meta: '39.6 s total',
            noEnd: true
          },
          prim: [rt('Download', 'arrow-down', C.down, 640e3, {
            sub: 'peak ' + rn(702e3) + ' · 2 streams · plateau: no-gain'
          }), rt('Upload', 'arrow-up', C.up, 210e3, {
            sub: 'insufficient samples · stopped at cap',
            tag: 'Low confidence',
            tagCls: 'pill warn'
          }), latT(), jitT()],
          load: load('D', [lrow('down', 162, {
            p90: 205
          }), lrow('up', 310, {
            p90: 380
          })], respB(240, 'few')),
          fit: fit(['Poor', 'Average', 'Bad']),
          meta: meta('2.0 MB', 'cap reached', '39.6 s', 'extended'),
          notices: [N('warn', 'database', 'Data cap reached', 'Upload stopped at the 2 MB per-test cap after 16 s.', [{
            label: 'Change cap',
            icon: 'sliders',
            cls: 'btn sm ghost'
          }]), N('warn', 'triangle-alert', 'Low confidence — upload: insufficient samples', 'Upload confirmed 18 requests before the cap; 30 are needed for a stable estimate. Treat the upload value as approximate.')],
          btn: BTN.again,
          saved: {
            time: '08:41:57',
            label: 'VPN via 5G',
            chips: ['VPN', 'Mobile']
          },
          share: {
            blocks: [['↓ DOWNLOAD', 640e3, C.down], ['↑ UPLOAD', 210e3, C.up]],
            foot: ['48 ms idle', '9.4 ms jitter', 'Bufferbloat D'],
            lines: ['↓ ' + rs(640e3) + '   ↑ ' + rs(210e3) + ' (low confidence)', 'Latency 48 ms (41–66) · jitter 9.4 ms', 'Under load ↓ 162 ms (+114) · ↑ 310 ms (+262)', 'Bufferbloat D · 240 RPM', 'Basement NAS · HTTP/2 · 2 streams']
          }
        };
        break;
      case 'offline':
        S = {
          phases: [pend('lat'), pend('down'), pend('up')],
          gauge: {
            opts: {}
          },
          R: {
            textual: true,
            title: 'Server unreachable',
            sub: "Basement NAS didn't respond. Next check in 8 s.",
            icon: 'server-off',
            ec: 'var(--danger)',
            action: {
              label: 'Retry',
              icon: 'refresh-cw'
            }
          },
          chart: Object.assign({}, EMPTY, {
            empty: 'Nothing to measure yet. The chart fills in once Basement NAS responds.'
          }),
          prim: [eDown(), eUp(), eLat(), eJit()],
          load: preLoad(),
          fit: fit(null),
          meta: meta('—', '', '—', ''),
          notices: [],
          btn: Object.assign({}, BTN.start, {
            dis: true,
            tip: 'Server unreachable — use Retry first'
          })
        };
        break;
      case 'insufficient':
        {
          const p = pv(0.45),
            t = Math.max(0.3, 12 * p),
            DP = BG.thr(23, 2.6e6, 20, 0.1, 0.55, 2.5),
            snd = BG.thr(29, 1.1e6, t, 0.1, 0.25, 2.5),
            rcv = delay(snd, 0.4, t),
            u = tail(snd),
            sw = steady(rcv, 4),
            lp = BG.lat(15, 48, 210, t, 0.25, 0.25, 2),
            rc = rcv[rcv.length - 1][1];
          S = {
            phases: [ph('lat', 'done', '48 ms'), ph('down', 'capped', 'insufficient data', 100), ph('up', 'active', (12 - t).toFixed(1) + ' s left', p * 100)],
            gauge: {
              opts: {
                value: u.cur,
                bandLo: u.lo,
                bandHi: u.hi
              },
              prev: DP,
              src: snd,
              c: C.up
            },
            R: {
              numeric: true,
              eyebrow: 'Upload · sending',
              icon: 'arrow-up',
              ec: C.up,
              num: rn(u.cur),
              unit: BG.rate(u.cur, unit).u,
              sub: liveSub(sw),
              oh: OH[0]
            },
            chart: {
              xMax: 32,
              series: [ser(DP, C.down), ser(shift(snd, 20), C.up, true), ser(shift(rcv, 20), C.up)],
              lat: BG.lat(13, 48, 140, 20, 0.25, 0.25, 2).concat(shift(lp, 20)),
              seps: [{
                t: 0,
                label: 'Download'
              }, {
                t: 20,
                label: 'Upload'
              }],
              marks: [{
                t: 20,
                label: '20 s max'
              }],
              markColor: 'var(--warn)',
              now: 20 + t,
              title: 'Throughput',
              legend: [LG.d, LG.ur, LG.us, LG.l],
              meta: (20 + t).toFixed(1) + ' s / 32 s'
            },
            prim: [T({
              label: 'Download',
              icon: 'arrow-down',
              ic: C.down,
              nc: 'var(--fg-subtle)',
              tag: 'Insufficient data',
              tagCls: 'pill warn',
              sub: 'no 3 s steady window within the 20 s max',
              notes: ['6.1 MB used']
            }), rt('Upload', 'arrow-up', C.up, rc || u.cur, Object.assign({
              sub: liveSub(sw)
            }, LIVE)), latT(), jitT()],
            load: load(null, [lrow('down', 140, {
              p90: 176
            }), lrow('up', lastLat(lp, 49), {
              p90: latP90(lp),
              live: true
            })], respB(null, null), 'Graded after upload'),
            fit: fit(null),
            meta: meta(BG.bytes(6.1e6 + 1.1e6 * t / 8), 'so far · download 6.1 MB', (t + 22.4).toFixed(1) + ' s', 'elapsed'),
            notices: [N('warn', 'database', 'Download: insufficient data', 'Download ran for its 20 s maximum without a 3 s steady window, so it has no value. 6.1 MB used. Upload continues; Extended allows up to 60 s per direction.', [{
              label: 'Try Extended',
              icon: 'timer',
              cls: 'btn sm secondary'
            }])],
            btn: BTN.stop
          };
        }
        break;
      case 'error-early':
        {
          const lp = BG.lat(5, 3.1, 3.1, 1.2, 0.1, 0.35);
          S = {
            phases: [ph('lat', 'failed', 'Error at 1.2 s', 60), ph('down', 'skipped', 'Not run'), ph('up', 'skipped', 'Not run')],
            gauge: {
              opts: {}
            },
            R: {
              textual: true,
              title: 'Connection lost',
              sub: 'Error during latency',
              faint: '12 of 20 pings',
              icon: 'wifi-off',
              ec: 'var(--danger)'
            },
            chart: {
              xMax: 2,
              ms: true,
              series: [ser(lp, C.lat)],
              marks: [{
                t: 1.2,
                label: 'Connection lost'
              }],
              markColor: 'var(--danger)',
              title: 'Latency samples',
              legend: [lg('Round-trip time', C.lat)],
              meta: 'stopped at 1.2 s',
              noEnd: true
            },
            prim: [eDown('not run'), eUp('not run'), T({
              label: 'Idle latency',
              icon: 'activity',
              ic: C.lat,
              nc: 'var(--fg-subtle)',
              tag: 'Error',
              tagCls: 'pill danger',
              sub: '12 of 20 pings before the error'
            }), eJit()],
            load: load(null, [lrow('down', null, {
              sub: 'Not run'
            }), lrow('up', null, {
              sub: 'Not run'
            })], respB(null, null), 'Not graded — test incomplete'),
            fit: fit(null, 'needs a full test'),
            meta: meta('9 kB', '', '1.8 s', ''),
            notices: [N('danger', 'wifi-off', 'Connection to Basement NAS lost — server stopped responding', 'The test stopped at 1.2 s, during latency. No phase finished.')],
            btn: BTN.retry,
            partial: {
              kind: 'error',
              keep: false
            }
          };
        }
        break;
      case 'cont-warmup':
        {
          const pts = BG.thr(19, 921e6, 6.2, 0.1, 0.05, 10),
            d = tail(pts);
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'cancelled', 'stopped in warm-up · 0:06', 1, 'Download · continuous')],
            gauge: {
              opts: {
                value: d.cur
              },
              src: pts,
              c: C.down,
              noDot: true
            },
            R: {
              textual: true,
              title: 'Stopped',
              sub: 'During warm-up · not saved',
              icon: 'circle-minus',
              ec: 'var(--fg-subtle)'
            },
            chart: {
              xMax: 14,
              series: [ser(pts, C.down)],
              lat: BG.lat(21, 3.1, 21, 6.2, 0.1, 0.3, 10),
              seps: [{
                t: 0,
                label: 'Warm-up'
              }, {
                t: 10,
                label: 'Steady'
              }],
              marks: [{
                t: 6.2,
                label: 'Stopped'
              }],
              markColor: 'var(--fg-muted)',
              title: 'Throughput · session',
              legend: [LG.d, LG.l],
              meta: 'stopped at 6.2 s',
              noEnd: true
            },
            prim: [em('Current', 'arrow-down', C.down, 'stopped'), em('Average', 'arrow-down', C.down, 'starts after the 10 s warm-up'), em('Peak · p90, last hour', 'trending-up', C.down, 'starts after warm-up'), em('Loaded latency', 'activity', C.lat, 'starts after warm-up'), T({
              label: 'Data used',
              icon: 'database',
              num: '540',
              unit: 'MB',
              sub: 'warm-up included',
              span: m ? 'span 2' : 'auto'
            })],
            resCols: m ? null : 'repeat(5, minmax(0,1fr))',
            load: null,
            fit: null,
            metaTitle: 'Session',
            metaSpan: m ? 'span 2' : 'span 5',
            metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
            meta: [{
              icon: 'timer',
              label: 'Elapsed',
              sub: 'stopped during the 10 s warm-up',
              value: '0:06',
              vc: 'var(--fg)'
            }, {
              icon: 'arrow-up-down',
              label: 'Min / max',
              sub: 'download, 0.5 s windows',
              value: '—',
              vc: 'var(--fg-subtle)'
            }, {
              icon: 'activity',
              label: 'Idle latency',
              sub: 'measured at start',
              value: '3.1 ms',
              vc: 'var(--fg)'
            }, PL],
            notices: [N('neutral', 'circle-minus', 'Continuous run stopped during warm-up', 'Stopped at 6.2 s, before the 10 s warm-up ended. Warm-up samples are left out of averages, so the run has no steady value.')],
            btn: BTN.again,
            partial: {
              kind: 'partial',
              keep: true
            }
          };
        }
        break;
      case 'cont-done':
        {
          const pts = BG.thr(19, 921e6, 2538, 10, 0.025, 30);
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'done', 'stopped at 42:18', 100, 'Download · continuous')],
            gauge: {
              opts: {
                value: 921e6,
                peak: 936e6
              },
              note: 'session average',
              src: pts,
              c: C.down
            },
            R: {
              numeric: true,
              eyebrow: 'Average',
              icon: 'arrow-down',
              ec: C.down,
              num: rn(921e6),
              unit: BG.rate(921e6, unit).u,
              sub: 'peak ' + rn(936e6) + ' · p90, last hour',
              oh: OH[0]
            },
            chart: {
              xMax: 2700,
              xStep: 600,
              xLabel: t => t / 60 + 'm',
              series: [ser(pts, C.down)],
              lat: BG.lat(21, 3.1, 21, 2538, 10, 0.3, 30),
              marks: [{
                t: 2538,
                label: 'Stopped'
              }],
              markColor: 'var(--fg-muted)',
              title: 'Throughput · session',
              legend: [LG.d, LG.l],
              meta: '42:18 · stopped by you',
              noEnd: true
            },
            prim: [rt('Average', 'arrow-down', C.down, 921e6, {
              sub: 'after warm-up'
            }), rt('Peak · p90, last hour', 'trending-up', C.down, 936e6, {
              sub: '0.5 s windows'
            }), rt('Minimum', 'arrow-down', C.down, 702e6, {
              sub: '0.5 s windows'
            }), msT('Loaded latency', 'activity', 21, 'session median'), T({
              label: 'Data used',
              icon: 'database',
              num: '292',
              unit: 'GB',
              sub: '≈ 6.9 GB/min',
              span: m ? 'span 2' : 'auto'
            })],
            resCols: m ? null : 'repeat(5, minmax(0,1fr))',
            load: null,
            fit: null,
            metaTitle: 'Session',
            metaSpan: m ? 'span 2' : 'span 5',
            metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
            meta: [{
              icon: 'timer',
              label: 'Duration',
              sub: 'stopped by you · planned 2:00:00',
              value: '42:18',
              vc: 'var(--fg)'
            }, {
              icon: 'arrow-up-down',
              label: 'Min / max',
              sub: 'download, 0.5 s windows',
              value: rn(702e6) + ' / ' + rs(941e6),
              vc: 'var(--fg)'
            }, {
              icon: 'activity',
              label: 'Idle latency',
              sub: 'measured at start',
              value: '3.1 ms',
              vc: 'var(--fg)'
            }, PL],
            notices: [],
            btn: BTN.again,
            saved: {
              time: '15:26:40',
              label: '',
              chips: ['LAN', 'Home Wi-Fi', 'Office']
            },
            share: {
              blocks: [['↓ AVERAGE', 921e6, C.down], ['PEAK · P90', 936e6, C.down]],
              foot: ['3.1 ms idle', '21 ms loaded', 'continuous · 42:18'],
              lines: ['↓ avg ' + rs(921e6) + ' · peak ' + rs(936e6), 'Continuous · 42:18 · 292 GB', 'Latency 3.1 ms idle · 21 ms loaded', 'Basement NAS · HTTP/2 · 6 streams']
            }
          };
        }
        break;
      case 'continuous':
        {
          const pts = BG.thr(19, 921e6, 2538, 10, 0.025, 30),
            d = tail(pts);
          S = {
            phases: [ph('lat', 'done', '3.1 ms'), ph('down', 'active', '42:18 of 2:00:00', 35, 'Download · continuous')],
            gauge: {
              opts: {
                value: 934e6,
                bandLo: d.lo,
                bandHi: d.hi,
                peak: 936e6
              },
              note: 'tick p90, last hour',
              c: C.down
            },
            R: {
              numeric: true,
              eyebrow: 'Download',
              icon: 'arrow-down',
              ec: C.down,
              num: rn(934e6),
              unit: BG.rate(934e6, unit).u,
              sub: 'avg ' + rn(921e6) + ' · peak ' + rn(936e6),
              oh: OH[0]
            },
            chart: {
              xMax: 2700,
              xStep: 600,
              xLabel: t => t / 60 + 'm',
              series: [ser(pts, C.down)],
              lat: BG.lat(21, 3.1, 21, 2538, 10, 0.3, 30),
              now: 2538,
              title: 'Throughput · session',
              legend: [LG.d, LG.l],
              meta: '42:18 elapsed'
            },
            prim: [rt('Current', 'arrow-down', C.down, 934e6, Object.assign({
              sub: 'last 0.5 s'
            }, LIVE)), rt('Average', 'arrow-down', C.down, 921e6, {
              sub: 'since start'
            }), rt('Peak · p90, last hour', 'trending-up', C.down, 936e6, {
              sub: '0.5 s windows'
            }), msT('Loaded latency', 'activity', 21, 'last-minute median'), T({
              label: 'Data used',
              icon: 'database',
              num: '289',
              unit: 'GB',
              sub: '≈ 6.8 GB/min',
              span: m ? 'span 2' : 'auto'
            })],
            resCols: m ? null : 'repeat(5, minmax(0,1fr))',
            load: null,
            fit: null,
            metaTitle: 'Session',
            metaSpan: m ? 'span 2' : 'span 5',
            metaCols: m ? 'minmax(0,1fr)' : 'repeat(4, minmax(0,1fr))',
            meta: [{
              icon: 'timer',
              label: 'Elapsed',
              sub: 'of 2:00:00 · ends 16:44',
              value: '42:18',
              vc: 'var(--fg)'
            }, {
              icon: 'arrow-up-down',
              label: 'Min / max',
              sub: 'download, 0.5 s windows',
              value: rn(702e6) + ' / ' + rs(941e6),
              vc: 'var(--fg)'
            }, {
              icon: 'activity',
              label: 'Idle latency',
              sub: 'measured at start',
              value: '3.1 ms',
              vc: 'var(--fg)'
            }, PL],
            notices: [],
            btn: BTN.stop
          };
        }
        break;
    }
    S.phases.forEach((p, i) => {
      p.num = String(i + 1);
    });
    const tipO = on(this.props.tips) ? '1' : '';
    const kept = this.state.kept ?? on(this.props.kept);
    const label = this.state.label ?? (this.props.label || (S.saved ? S.saved.label : ''));
    const shareOpen = !!S.saved && !v01 && !!(this.state.share ?? on(this.props.share));
    if (v01) {
      S.load = null;
      S.fit = null;
      S.lastLine = false;
      if (S.chart.legend) S.chart = Object.assign({}, S.chart, {
        lat: null,
        legend: S.chart.legend.filter(x => x !== LG.l)
      });
      if (!S.metaTitle) {
        S.metaSpan = m ? 'span 2' : 'span 4';
        S.metaCols = m ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))';
      }
    }
    const A = (text, icon, cls, onClick, after) => ({
      text,
      icon,
      cls,
      on: onClick || (() => {}),
      after: after || null,
      wrap: '',
      tip: null,
      tipO: ''
    });
    const JSONA = Object.assign(A('Download JSON', 'file-json', 'btn ghost sm'), {
      wrap: 'has-tip tip-end',
      tip: 'Contains your IP address and notes',
      tipO
    });
    const DET = A('Details', null, 'btn secondary sm', null, 'chevron-right');
    let bar = null;
    if (S.saved) bar = v01 ? {
      icon: 'circle-check',
      ic: 'var(--ok)',
      title: 'Test complete',
      time: S.saved.time,
      sub: 'Not stored in this browser. Download the JSON to keep it.',
      labelled: false,
      actions: [Object.assign({}, JSONA, {
        cls: 'btn secondary sm'
      })]
    } : {
      icon: 'circle-check',
      ic: 'var(--ok)',
      title: 'Saved to history',
      time: S.saved.time,
      sub: null,
      labelled: true,
      chips: S.saved.chips,
      actions: [A('Share', 'share-2', 'btn ghost sm', () => this.setState({
        share: true
      })), JSONA, DET]
    };else if (S.partial) {
      const canKeep = S.partial.keep && !v01;
      if (canKeep && kept) {
        bar = {
          icon: 'circle-check',
          ic: 'var(--ok)',
          title: 'Saved as ' + S.partial.kind,
          time: '14:06:52',
          sub: null,
          labelled: false,
          actions: [A('Undo', 'undo-2', 'btn ghost sm', () => this.setState({
            kept: false
          })), JSONA, DET]
        };
        if (S.R.sub && S.R.sub.indexOf('not saved') >= 0) S.R = Object.assign({}, S.R, {
          sub: S.R.sub.replace('not saved', 'saved as ' + S.partial.kind)
        });
        if (S.meta && S.meta[0] && S.meta[0].sub === 'not saved') S.meta[0].sub = 'saved as ' + S.partial.kind;
      } else bar = {
        icon: 'circle-minus',
        ic: 'var(--fg-subtle)',
        title: 'Partial results are not saved',
        time: '',
        sub: v01 ? 'Download the JSON to keep them.' : canKeep ? null : 'No phase finished, so there is nothing to keep in history.',
        labelled: false,
        actions: canKeep ? [A('Keep in history', 'history', 'btn secondary sm', () => this.setState({
          kept: true
        })), JSONA] : [JSONA]
      };
    }
    const SH = S.share,
      inc = !!label && !!this.state.inc,
      dateT = '2026-10-12 ' + (S.saved ? S.saved.time.slice(0, 5) : '');
    const share = SH ? {
      blocks: SH.blocks.map(([k, v, c]) => ({
        k,
        c,
        n: rn(v),
        u: BG.rate(v, unit).u
      })),
      foot: SH.foot,
      head: (inc ? label + ' · ' : '') + '12 Oct 2026',
      text: ['BitGauge · ' + (inc ? label + ' · ' : '') + dateT].concat(SH.lines).join('\n')
    } : null;
    const gopts = Object.assign({
      size: L.gSize
    }, S.gauge.opts);
    let gScale = S.gauge.scale || 'log scale · 1 – 1000 ms';
    if (!gopts.mode) {
      let k = BG.track(S.gauge.prev || [], {
        unit
      }).k;
      if (S.gauge.src) k = BG.track(S.gauge.src, {
        unit,
        k0: k
      }).k;
      if (unit === 'bytes') ['value', 'bandLo', 'bandHi', 'peak', 'inner'].forEach(n => {
        if (gopts[n] != null) gopts[n] /= 8;
      });
      gopts.lo = Math.pow(10, k);
      gopts.hi = Math.pow(10, k + 4);
      gScale = BG.winLabel(k, unit) + (S.gauge.note ? ' · ' + S.gauge.note : '');
    }
    const g = BG.gauge(gopts);
    if (S.countdown) g.fill = BG.arc(L.gSize / 2, L.gSize / 2, L.gSize / 2 - 10, 0, Math.max(0.002, 1 - pv(0.2)));
    if (S.gauge.noDot) g.dot = null;
    g.sizePx = L.gSize + 'px';
    g.scale = gScale;
    const gc = S.countdown ? 'var(--primary)' : S.gauge.c || C.down;
    const cc = S.chart;
    const c = BG.chart({
      unit,
      w: this.state.cw || L.chartW,
      h: L.chartH,
      xMax: cc.xMax,
      yMax: cc.yMax,
      ms: cc.ms,
      series: cc.series.map(s => s.pts),
      lat: cc.lat,
      now: cc.now,
      seps: cc.seps,
      wins: cc.wins,
      marks: cc.marks,
      xStep: cc.xStep || (m && cc.xMax > 20 ? cc.xMax > 40 ? 18 : 8 : null),
      xLabel: cc.xLabel
    });
    const series = c.series.map((s, i) => Object.assign(s, {
      c: cc.series[i].c,
      so: cc.series[i].so,
      fo: cc.series[i].fo
    }));
    const lastS = series[series.length - 1];
    const endDot = lastS && !cc.noEnd ? {
      x: lastS.endX,
      y: lastS.endY,
      c: lastS.c
    } : null;
    const R = Object.assign({
      numeric: false,
      textual: false,
      ec: 'var(--fg-subtle)',
      up: null,
      oh: null,
      faint: null,
      action: null
    }, S.R);
    const PH = {
      countdown: 'Test starts automatically in ' + cdN + ' seconds. Press Escape to cancel.',
      connecting: 'Connecting to Basement NAS.',
      latency: 'Measuring latency.',
      download: 'Latency 3.1 milliseconds. Measuring download.',
      upload: 'Download finished: ' + rs(612e6) + '. Measuring upload.',
      complete: 'Upload finished: ' + rs(438e6) + '. Test complete and saved to history.',
      error: 'Connection to Basement NAS lost: ' + EK[0] + '. Partial results were not saved.',
      cancelled: 'Test cancelled during upload. Upload has insufficient data. Partial results were not saved.',
      'cancelled-late': 'Test cancelled during upload. Partial upload ' + rs(402e6) + ' from a 3.6 second steady window. Not saved.',
      slow: 'Slow connection detected. Download extended to 20 seconds.',
      slowdone: 'Download finished: ' + rs(640e3) + '. Upload stopped at the data cap: ' + rs(210e3) + ', low confidence. Saved to history.',
      continuous: 'Continuous download running.',
      offline: 'Server unreachable. Start is unavailable until Basement NAS responds.',
      'ws-fallback': 'WebSocket unavailable, using HTTP latency fallback. Measuring download.',
      insufficient: 'Download has insufficient data. Measuring upload.',
      'param-ignored': 'URL parameter streams=12 ignored, allowed 1 to 6.',
      'error-early': 'Connection lost during latency. Nothing was saved.',
      'cont-warmup': 'Continuous run stopped during warm-up. Partial results were not saved.',
      'cont-done': 'Continuous run stopped. Saved to history.'
    };
    if (v01) Object.keys(PH).forEach(k => {
      PH[k] = PH[k].replace(' and saved to history', '').replace(' Saved to history.', '');
    });
    this._live = {
      st,
      msg: PH[st] || '',
      rate: ['latency', 'download', 'ws-fallback', 'insufficient', 'upload', 'slow', 'continuous'].includes(st) && R.numeric ? R.eyebrow + ' ' + R.num + ' ' + R.unit : null
    };
    const bytesOnly = unit === 'bytes' && !on(this.props.custom);
    return {
      ...base,
      ready: true,
      chartRef: this.chartRef,
      L,
      ctx,
      ctxOpts,
      conn,
      custom,
      notCustom: !custom,
      ctxOpen: this.state.ctxOpen,
      ctxOpenStr: this.state.ctxOpen ? 'true' : 'false',
      ctxIsCustom: sel === 'Custom…',
      ctxCustom: this.state.ctxCustom,
      toggleCtx: () => this.setState(s => ({
        ctxOpen: !s.ctxOpen
      })),
      onCtxCustom: e => this.setState({
        ctxCustom: e.target.value
      }),
      onCtxKey: e => {
        if (e.key === 'Enter' || e.key === 'Escape') this.setState({
          ctxOpen: false
        });
      },
      customChips: bytesOnly && !this.props.chips ? [{
        t: 'Units · MB/s',
        icon: 'sliders'
      }] : customChips,
      customCount: (bytesOnly && !this.props.chips ? 1 : customChips.length) + ' changed:',
      phases: S.phases,
      phaseCols: 'repeat(' + S.phases.length + ', minmax(0,1fr))',
      g,
      gc,
      R,
      gaugeAria: R.numeric ? R.eyebrow + ' ' + R.num + ' ' + R.unit : R.title,
      btn: S.btn,
      ch: {
        title: cc.title,
        legend: cc.legend,
        meta: cc.meta,
        empty: cc.empty || null,
        markColor: cc.markColor || 'var(--fg-muted)',
        aria: cc.title + ' chart'
      },
      c,
      series,
      endDot,
      notices: S.notices,
      noop: () => {},
      bar,
      shareOpen,
      share,
      label,
      incLabel: inc,
      incDis: !label,
      incNote: label ? '“' + label + '”' : 'no label set',
      incC: label ? 'var(--fg)' : 'var(--fg-subtle)',
      toggleInc: e => this.setState({
        inc: e.target.checked
      }),
      closeShare: () => this.setState({
        share: false
      }),
      stopProp: e => e.stopPropagation(),
      onLabel: e => this.setState({
        label: e.target.value
      }),
      SD: m ? {
        pad: '56px 12px 24px',
        dir: 'column-reverse'
      } : {
        pad: '72px 24px',
        dir: 'row'
      },
      btnWrap: S.btn.tip ? 'has-tip' : '',
      btnDis: S.btn.dis ? 'true' : 'false',
      btnOp: S.btn.dis ? '0.45' : '1',
      btnTipId: S.btn.tip ? 'start-tip' : null,
      tipO,
      prim: S.prim,
      resCols: S.resCols || L.resCols,
      load: S.load,
      fit: S.fit,
      meta: S.meta,
      metaTitle: S.metaTitle || 'Test',
      metaSpan: S.metaSpan || L.metaSpan,
      metaCols: S.metaCols || 'minmax(0,1fr)',
      lastLine: !!S.lastLine
    };
  }
  render() {
    const v = this.renderVals();
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        background: "var(--bg-base)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        minHeight: "100%"
      }
    }, v.navMobile ? /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-top",
      active: "test",
      v01: v.v01,
      status: v.srvStatus
    }) : null, v.navDesktop ? /*#__PURE__*/React.createElement(Nav, {
      variant: "top",
      active: "test",
      theme: v.theme,
      v01: v.v01,
      status: v.srvStatus
    }) : null, v.basePath ? /*#__PURE__*/React.createElement("main", {
      role: "alert",
      "aria-labelledby": "bp-title",
      style: {
        flex: "1",
        minHeight: v.BP?.minH,
        boxSizing: "border-box",
        padding: v.BP?.pad,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        maxWidth: "600px",
        display: "flex",
        flexDirection: "column",
        gap: "22px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-md)",
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "22",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("span", null, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)"
      }
    }, "Gauge"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--danger-fg)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-alert",
      size: "13",
      stroke: "2.25"
    }), "Deployment error"), /*#__PURE__*/React.createElement("h1", {
      id: "bp-title",
      style: {
        margin: "0",
        fontSize: v.BP?.h,
        lineHeight: "1.2",
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)",
        textWrap: "pretty"
      }
    }, "The base path doesn't match this URL"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0",
        fontSize: "var(--text-base)",
        color: "var(--fg-muted)",
        lineHeight: "1.55",
        textWrap: "pretty"
      }
    }, "This page was opened at ", /*#__PURE__*/React.createElement("code", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "0.92em",
        color: "var(--fg)",
        background: "var(--surface-3)",
        padding: "1px 5px",
        borderRadius: "var(--radius-xs)"
      }
    }, "/speed/"), ", but the server is configured for ", /*#__PURE__*/React.createElement("code", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "0.92em",
        color: "var(--fg)",
        background: "var(--surface-3)",
        padding: "1px 5px",
        borderRadius: "var(--radius-xs)"
      }
    }, "/"), ". Its API answers at a different path, so no test can run from here.")), /*#__PURE__*/React.createElement("dl", {
      style: {
        margin: "0",
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "4px 16px",
        padding: "9px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("dt", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Page path"), /*#__PURE__*/React.createElement("dd", {
      style: {
        margin: "0",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg)"
      }
    }, "/speed/")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "4px 16px",
        padding: "9px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("dt", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Server base path"), /*#__PURE__*/React.createElement("dd", {
      style: {
        margin: "0",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg)"
      }
    }, "/ \xB7 BITGAUGE_BASE_PATH not set")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "4px 16px",
        padding: "9px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("dt", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, "Check"), /*#__PURE__*/React.createElement("dd", {
      style: {
        margin: "0",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--danger-fg)"
      }
    }, "GET /speed/api/info \u2192 404"))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-label": "Deployment hint",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "terminal",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "How to fix it")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5"
      }
    }, "Set the base path to the reverse-proxy prefix and restart the container:"), /*#__PURE__*/React.createElement("pre", {
      style: {
        margin: "0",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "var(--term-bg)",
        color: "var(--term-fg)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      }
    }, "environment:\n  BITGAUGE_BASE_PATH: /speed/"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: "0",
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5"
      }
    }, "Or strip the ", /*#__PURE__*/React.createElement("code", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "0.92em",
        color: "var(--fg)"
      }
    }, "/speed"), " prefix at the proxy so BitGauge is served from ", /*#__PURE__*/React.createElement("code", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "0.92em",
        color: "var(--fg)"
      }
    }, "/"), "."))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn primary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "refresh-cw",
      size: "15"
    }), "Reload"), /*#__PURE__*/React.createElement("a", {
      className: "btn secondary",
      href: "#",
      style: {
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "external-link",
      size: "15"
    }), "Deployment docs")))) : null, v.ready ? /*#__PURE__*/React.createElement("main", {
      style: {
        flex: "1",
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: v.L?.pad,
        display: "flex",
        flexDirection: "column",
        gap: v.L?.gap
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "12px 28px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "10px 24px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "5px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Context"), /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "hv-testsc-1",
      "aria-haspopup": "menu",
      "aria-expanded": v.ctxOpenStr,
      onClick: v.toggleCtx,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: "24px",
        padding: "0 7px 0 9px",
        borderRadius: "var(--radius-full)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)",
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        fontWeight: "600",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.ctx?.icon,
      size: "12",
      stroke: "2"
    }), v.ctx?.label, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "chevron-down",
      size: "12",
      stroke: "2"
    }))), v.ctx?.suggested ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "suggested") : null, v.ctxOpen ? /*#__PURE__*/React.createElement("div", {
      role: "menu",
      "aria-label": "Context",
      style: {
        position: "absolute",
        top: "calc(100% + 6px)",
        left: "0",
        zIndex: "20",
        width: "212px",
        boxSizing: "border-box",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-pop)",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, (v.ctxOpts || []).map((o, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: "hv-testsc-2",
      role: "menuitemradio",
      "aria-checked": o?.checked,
      onClick: o?.pick,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        height: "32px",
        padding: "0 8px",
        border: "0",
        borderRadius: "var(--radius-sm)",
        background: o?.bg,
        color: "var(--fg)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        textAlign: "left",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: o?.icon,
      size: "14"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1"
      }
    }, o?.label), o?.on ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "check",
      size: "14",
      stroke: "2"
    })) : null))), v.ctxIsCustom ? /*#__PURE__*/React.createElement("label", {
      className: "input",
      style: {
        height: "32px",
        margin: "4px 2px 2px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      "aria-label": "Custom context",
      value: v.ctxCustom,
      placeholder: "e.g. Hotel Wi-Fi",
      onChange: v.onCtxCustom,
      onKeyDown: v.onCtxKey
    })) : null) : null)), (v.conn || []).map((c, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "5px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, c?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-base)",
        color: "var(--fg)",
        lineHeight: "22px"
      }
    }, c?.v, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        fontSize: "var(--text-caption)"
      }
    }, c?.s)))))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px"
      }
    }, v.custom ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        marginRight: "2px"
      }
    }, v.customCount), (v.customChips || []).map((ch, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: "24px",
        padding: "0 9px",
        borderRadius: "var(--radius-full)",
        background: "var(--primary-bg)",
        border: "1px solid var(--primary-border)",
        color: "var(--primary-text)",
        fontSize: "var(--text-caption)",
        fontWeight: "600"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: ch?.icon,
      size: "12",
      stroke: "2"
    }), ch?.t)))) : null, v.notCustom ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, "Standard preset \xB7 Auto streams \xB7 No data cap") : null, /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: "28px",
        padding: "0 8px",
        borderRadius: "var(--radius-md)",
        color: "var(--primary-text)",
        fontSize: "var(--text-caption)",
        fontWeight: "600",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "sliders",
      size: "13"
    }), "Edit"))), (v.notices || []).map((n, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      role: n?.role,
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "10px 12px",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${n?.bd ?? ""}`,
        background: n?.bg
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: n?.ic,
        display: "flex",
        marginTop: "1px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: n?.icon,
      size: "18"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 1 220px",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        color: n?.fg
      }
    }, n?.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)",
        lineHeight: "1.5",
        textWrap: "pretty"
      }
    }, n?.body)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        marginLeft: "auto"
      }
    }, (n?.actions || []).map((a, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: a?.cls
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: a?.icon,
      size: "14"
    }), a?.label))))))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-label": "Speed test",
      style: {
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 var(--card-highlight)"
      }
    }, /*#__PURE__*/React.createElement("ol", {
      "aria-label": "Test phases",
      style: {
        display: "grid",
        gridTemplateColumns: v.phaseCols,
        gap: v.L?.stepGap,
        listStyle: "none",
        margin: "0",
        padding: v.L?.stepPad,
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, (v.phases || []).map((p, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("li", {
      "aria-current": p?.aria,
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "9px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "3px",
        borderRadius: "2px",
        background: "var(--surface-4)",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: p?.pct,
        background: p?.bar,
        borderRadius: "2px"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: v.L?.stepDir,
        alignItems: v.L?.stepAlign,
        gap: v.L?.stepInnerGap,
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "7px",
        minWidth: "0"
      }
    }, p?.isPending ? /*#__PURE__*/React.createElement("span", {
      style: {
        width: "16px",
        height: "16px",
        boxSizing: "border-box",
        borderRadius: "50%",
        border: "1.5px solid var(--border-strong)",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: "600",
        color: "var(--fg-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none"
      }
    }, p?.num) : null, p?.hasIcon ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: p?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: p?.icon,
      size: "16"
    })) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        fontWeight: "600",
        color: p?.lc,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, p?.label)), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: v.L?.metaML,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: p?.mc,
        whiteSpace: v.L?.metaWS,
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
        lineHeight: "1.35"
      }
    }, p?.meta)))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.L?.instCols
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: v.L?.gPad,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        width: v.g?.sizePx,
        height: v.g?.sizePx
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: v.g?.size,
      height: v.g?.size,
      role: "img",
      "aria-label": v.gaugeAria,
      style: {
        display: "block",
        overflow: "visible"
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: v.g?.track,
      style: {
        fill: "none",
        stroke: "var(--surface-3)",
        strokeWidth: "10",
        strokeLinecap: "round"
      }
    }), (v.g?.ticks || []).map((t, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: t?.x1,
      y1: t?.y1,
      x2: t?.x2,
      y2: t?.y2,
      style: {
        stroke: "var(--fg-faint)",
        strokeWidth: t?.w,
        opacity: t?.o
      }
    }))), v.g?.band ? /*#__PURE__*/React.createElement("path", {
      d: v.g?.band,
      style: {
        fill: "none",
        stroke: v.gc,
        strokeOpacity: "0.2",
        strokeWidth: "22"
      }
    }) : null, v.g?.fill ? /*#__PURE__*/React.createElement("path", {
      d: v.g?.fill,
      style: {
        fill: "none",
        stroke: v.gc,
        strokeWidth: "10",
        strokeLinecap: "round"
      }
    }) : null, v.g?.inner ? /*#__PURE__*/React.createElement("path", {
      d: v.g?.inner,
      style: {
        fill: "none",
        stroke: "var(--series-upload)",
        strokeWidth: "4",
        strokeLinecap: "round"
      }
    }) : null, v.g?.peak ? /*#__PURE__*/React.createElement("line", {
      x1: v.g?.peak?.x1,
      y1: v.g?.peak?.y1,
      x2: v.g?.peak?.x2,
      y2: v.g?.peak?.y2,
      style: {
        stroke: "var(--fg-muted)",
        strokeWidth: "2",
        strokeLinecap: "round"
      }
    }) : null, v.g?.dot ? /*#__PURE__*/React.createElement("circle", {
      cx: v.g?.dot?.x,
      cy: v.g?.dot?.y,
      r: "7",
      style: {
        fill: "var(--surface-2)",
        stroke: v.gc,
        strokeWidth: "3"
      }
    }) : null), (v.g?.labels || []).map((l, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute",
        left: `${l?.x ?? ""}px`,
        top: `${l?.y ?? ""}px`,
        transform: "translate(-50%,-80%)",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--fg-subtle)",
        whiteSpace: "nowrap"
      }
    }, l?.t))), /*#__PURE__*/React.createElement("div", {
      role: "status",
      "aria-live": "polite",
      style: {
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap"
      }
    }, v.liveMsg), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        paddingTop: "8px",
        textAlign: "center"
      }
    }, v.R?.numeric ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "12px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: v.R?.ec
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.R?.icon,
      size: "13",
      stroke: "2.25"
    }), v.R?.eyebrow), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500",
        fontSize: v.L?.gNum,
        lineHeight: "1.05",
        letterSpacing: "-0.03em",
        color: "var(--fg)",
        fontVariantNumeric: "tabular-nums"
      }
    }, v.R?.num), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-md)",
        fontWeight: "500",
        color: "var(--fg-muted)"
      }
    }, v.R?.unit), /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: "6px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.R?.sub), v.R?.oh ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, v.R?.oh) : null, v.R?.up ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--series-upload)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "arrow-up",
      size: "12",
      stroke: "2.25"
    })), v.R?.up) : null) : null, v.R?.textual ? /*#__PURE__*/React.createElement(React.Fragment, null, v.R?.icon ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: v.R?.ec,
        display: "flex",
        marginBottom: "4px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.R?.icon,
      size: "22"
    })) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: v.L?.gTitle,
        fontWeight: "600",
        letterSpacing: "var(--tracking-tight)",
        color: "var(--fg)"
      }
    }, v.R?.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-subtle)",
        maxWidth: "180px",
        lineHeight: "1.4"
      }
    }, v.R?.sub), v.R?.faint ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginTop: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-faint)"
      }
    }, v.R?.faint) : null, v.R?.action ? /*#__PURE__*/React.createElement("button", {
      className: "btn sm secondary",
      style: {
        marginTop: "10px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.R?.action?.icon,
      size: "14"
    }), v.R?.action?.label) : null) : null)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        marginTop: "-18px"
      }
    }, v.g?.scale), /*#__PURE__*/React.createElement("span", {
      className: v.btnWrap,
      style: {
        position: "relative",
        display: "flex",
        width: v.L?.btnW
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: v.btn?.cls,
      "aria-disabled": v.btnDis,
      "aria-describedby": v.btnTipId,
      style: {
        height: v.L?.btnH,
        width: "100%",
        opacity: v.btnOp,
        justifyContent: "center",
        fontSize: "var(--text-md)",
        gap: "10px",
        borderRadius: "var(--radius-md)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.btn?.icon,
      size: "16",
      stroke: "2"
    }), v.btn?.label, v.L?.kbd ? /*#__PURE__*/React.createElement("kbd", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        fontWeight: "500",
        padding: "1px 6px",
        borderRadius: "var(--radius-xs)",
        border: "1px solid currentColor",
        opacity: "0.6",
        marginLeft: "4px"
      }
    }, v.btn?.kbd) : null), v.btn?.tip ? /*#__PURE__*/React.createElement("span", {
      className: "tip",
      role: "tooltip",
      id: "start-tip",
      style: {
        opacity: v.tipO
      }
    }, v.btn?.tip) : null)), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: "0",
        padding: v.L?.cPad,
        borderLeft: v.L?.bl,
        borderTop: v.L?.bt,
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 16px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-base)",
        fontWeight: "600"
      }
    }, v.ch?.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 14px"
      }
    }, (v.ch?.legend || []).map((lg, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "14px",
        height: "0",
        borderTop: `2px ${lg?.dash ?? ""} ${lg?.c ?? ""}`,
        opacity: lg?.o
      }
    }), lg?.t)))), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.ch?.meta)), /*#__PURE__*/React.createElement("div", {
      ref: v.chartRef,
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: v.c?.w,
      height: v.c?.h,
      style: {
        display: "block",
        overflow: "visible"
      },
      role: "img",
      "aria-label": v.ch?.aria
    }, (v.c?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: gl?.x1,
      y1: gl?.y,
      x2: gl?.x2,
      y2: gl?.y,
      style: {
        stroke: "var(--border-subtle)",
        strokeWidth: "1"
      }
    }))), (v.c?.seps || []).map((sp, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: sp?.x,
      y1: sp?.y1,
      x2: sp?.x,
      y2: sp?.y2,
      style: {
        stroke: "var(--border-default)",
        strokeWidth: "1",
        strokeDasharray: "2 3"
      }
    }))), (v.c?.wins || []).map((w, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("rect", {
      x: w?.x,
      y: w?.y,
      width: w?.w,
      height: w?.h,
      style: {
        fill: "var(--series-upload)",
        fillOpacity: "0.08",
        stroke: "var(--series-upload)",
        strokeOpacity: "0.4",
        strokeDasharray: "2 3"
      }
    }))), (v.series || []).map((s, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("path", {
      d: s?.area,
      style: {
        fill: s?.c,
        fillOpacity: s?.fo,
        stroke: "none"
      }
    }), /*#__PURE__*/React.createElement("path", {
      d: s?.line,
      style: {
        fill: "none",
        stroke: s?.c,
        strokeOpacity: s?.so,
        strokeWidth: "1.75",
        strokeLinejoin: "round"
      }
    }))), v.c?.lat ? /*#__PURE__*/React.createElement("path", {
      d: v.c?.lat?.line,
      style: {
        fill: "none",
        stroke: "var(--series-latency)",
        strokeWidth: "1.25",
        strokeDasharray: "4 3",
        opacity: "0.9"
      }
    }) : null, (v.c?.marks || []).map((mk, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("line", {
      x1: mk?.x,
      y1: mk?.y1,
      x2: mk?.x,
      y2: mk?.y2,
      style: {
        stroke: v.ch?.markColor,
        strokeWidth: "1.5",
        strokeDasharray: "3 3"
      }
    }))), v.c?.nowX ? /*#__PURE__*/React.createElement("line", {
      x1: v.c?.nowX,
      y1: v.c?.plotT,
      x2: v.c?.nowX,
      y2: v.c?.plotB,
      style: {
        stroke: "var(--fg-subtle)",
        strokeWidth: "1",
        opacity: "0.5"
      }
    }) : null, v.endDot ? /*#__PURE__*/React.createElement("circle", {
      cx: v.endDot?.x,
      cy: v.endDot?.y,
      r: "4",
      style: {
        fill: "var(--surface-2)",
        stroke: v.endDot?.c,
        strokeWidth: "2"
      }
    }) : null), /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: "var(--fg-subtle)"
      }
    }, (v.c?.grid || []).map((gl, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${gl?.lx ?? ""}px`,
        top: `${gl?.ly ?? ""}px`,
        transform: "translate(-100%,-75%)",
        whiteSpace: "nowrap"
      }
    }, gl?.t))), (v.c?.xt || []).map((xt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${xt?.x ?? ""}px`,
        top: `${xt?.y ?? ""}px`,
        transform: "translate(-50%,-75%)",
        whiteSpace: "nowrap"
      }
    }, xt?.t))), (v.c?.seps || []).map((sp, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${sp?.lx ?? ""}px`,
        top: `${sp?.ly ?? ""}px`,
        transform: "translateY(-75%)",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        letterSpacing: "0.08em",
        textTransform: "uppercase"
      }
    }, sp?.t))), v.c?.lat ? /*#__PURE__*/React.createElement(React.Fragment, null, (v.c?.lat?.ticks || []).map((lt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${lt?.x ?? ""}px`,
        top: `${lt?.y ?? ""}px`,
        transform: "translateY(-75%)",
        whiteSpace: "nowrap",
        color: "var(--series-latency)"
      }
    }, lt?.t)))) : null, (v.c?.wins || []).map((w, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${w?.lx ?? ""}px`,
        top: `${w?.ly ?? ""}px`,
        transform: "translateY(-75%)",
        whiteSpace: "nowrap",
        color: "var(--series-upload)"
      }
    }, w?.t))), (v.c?.marks || []).map((mk, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: `${mk?.lx ?? ""}px`,
        top: `${mk?.ly ?? ""}px`,
        transform: "translate(-100%,-75%)",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans)",
        fontWeight: "600",
        fontSize: "11px",
        color: v.ch?.markColor
      }
    }, mk?.t)))), v.ch?.empty ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        top: `${v.c?.plotT ?? 0}px`,
        left: `${v.c?.plotL ?? 44}px`,
        width: `${(v.c?.plotR ?? 0) - (v.c?.plotL ?? 0)}px`,
        height: `${(v.c?.plotB ?? 0) - (v.c?.plotT ?? 0)}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 16px",
        boxSizing: "border-box"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        color: "var(--fg-subtle)",
        maxWidth: "300px",
        lineHeight: "1.45",
        textWrap: "pretty",
        textAlign: "left",
        padding: "8px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "activity",
      size: "15",
      style: {
        flex: "none",
        color: "var(--fg-faint)"
      }
    }), v.ch?.empty)) : null)))), v.bar ? /*#__PURE__*/React.createElement("section", {
      className: "card",
      "aria-label": "Result status",
      style: {
        overflow: "visible",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 14px",
        padding: "12px 16px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      role: "status",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        fontWeight: "600"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: v.bar?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: v.bar?.icon,
      size: "16"
    })), v.bar?.title, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "400",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, v.bar?.time)), v.bar?.sub ? /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "1 1 220px",
        minWidth: "0",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        lineHeight: "1.45",
        textWrap: "pretty"
      }
    }, v.bar?.sub) : null, v.bar?.labelled ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
      className: "input",
      style: {
        flex: "1 1 200px",
        maxWidth: "340px",
        height: "34px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "tag",
      size: "14"
    }), /*#__PURE__*/React.createElement("input", {
      "aria-label": "Result label",
      value: v.label,
      placeholder: "Add a label, e.g. Home Wi-Fi",
      onChange: v.onLabel
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap"
      }
    }, (v.bar?.chips || []).map((sc, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("button", {
      className: "chip",
      style: {
        height: "26px",
        fontSize: "var(--text-caption)",
        padding: "0 10px"
      }
    }, sc))))) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginLeft: "auto"
      }
    }, (v.bar?.actions || []).map((a, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      className: a?.wrap,
      style: {
        display: "inline-flex"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: a?.cls,
      onClick: a?.on
    }, a?.icon ? /*#__PURE__*/React.createElement("bg-icon", {
      name: a?.icon,
      size: "14"
    }) : null, a?.text, a?.after ? /*#__PURE__*/React.createElement("bg-icon", {
      name: a?.after,
      size: "14"
    }) : null), a?.tip ? /*#__PURE__*/React.createElement("span", {
      className: "tip",
      role: "tooltip",
      style: {
        opacity: a?.tipO,
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "triangle-alert",
      size: "12",
      stroke: "2"
    })), a?.tip) : null))))) : null, /*#__PURE__*/React.createElement("section", {
      "aria-label": "Results",
      style: {
        display: "grid",
        gridTemplateColumns: v.resCols,
        gap: v.L?.tileGap
      }
    }, (v.prim || []).map((t, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: t?.span,
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "inset 0 1px 0 var(--card-highlight)",
        padding: v.L?.tilePad,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px",
        minHeight: "20px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: t?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: t?.icon,
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, t?.label), t?.tag ? /*#__PURE__*/React.createElement("span", {
      className: t?.tagCls,
      style: {
        marginLeft: "auto",
        height: "18px",
        padding: "0 7px",
        fontSize: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), t?.tag) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: "6px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: "500",
        fontSize: v.L?.tileNum,
        lineHeight: "1.1",
        letterSpacing: "-0.02em",
        color: t?.nc,
        fontVariantNumeric: "tabular-nums"
      }
    }, t?.num), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg-muted)"
      }
    }, t?.unit)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        minHeight: "15px",
        lineHeight: "1.45",
        textWrap: "pretty"
      }
    }, t?.sub), (t?.notes || []).map((nt, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        marginTop: "-4px"
      }
    }, nt)))))), v.load ? /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: v.L?.loadSpan,
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "inset 0 1px 0 var(--card-highlight)",
        padding: v.L?.tilePad,
        display: "flex",
        flexWrap: "wrap",
        gap: "16px 20px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1 0 172px",
        maxWidth: "220px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)"
      }
    }, "Bufferbloat"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-label": v.load?.gAria,
      style: {
        width: "52px",
        height: "52px",
        boxSizing: "border-box",
        borderRadius: "var(--radius-lg)",
        border: `1px ${v.load?.gStyle ?? ""} ${v.load?.gBd ?? ""}`,
        background: v.load?.gBg,
        color: v.load?.gFg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: "600",
        fontSize: "24px",
        letterSpacing: "-0.02em",
        flex: "none"
      }
    }, v.load?.grade), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        display: "flex",
        gap: "2px"
      }
    }, (v.load?.scale || []).map((gs, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "17px",
        height: "17px",
        borderRadius: "var(--radius-xs)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: gs?.w,
        background: gs?.bg,
        color: gs?.c
      }
    }, gs?.g)))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        lineHeight: "1.3"
      }
    }, v.load?.gText)))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "999 1 260px",
        display: "flex",
        flexDirection: "column",
        minWidth: "0"
      }
    }, (v.load?.rows || []).map((r, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "7px 0",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: r?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: r?.icon,
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
        flex: "1"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg)"
      }
    }, r?.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, r?.sub)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-lg)",
        fontWeight: "500",
        color: r?.nc,
        whiteSpace: "nowrap"
      }
    }, r?.num, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        fontWeight: "400"
      }
    }, r?.unit))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        paddingTop: "10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex",
        marginTop: "2px"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "gauge",
      size: "14",
      stroke: "2"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        color: "var(--fg)",
        lineHeight: "1.4",
        textWrap: "pretty"
      }
    }, "HTTP loaded responsiveness \u2014 connection sharing not verifiable"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        lineHeight: "1.4"
      }
    }, v.load?.resp?.note)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "6px",
        alignItems: "center",
        flex: "none"
      }
    }, v.load?.resp?.tag ? /*#__PURE__*/React.createElement("span", {
      className: "pill warn",
      style: {
        height: "18px",
        padding: "0 7px",
        fontSize: "10px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "d"
    }), v.load?.resp?.tag) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-muted)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xs)",
        padding: "1px 6px",
        whiteSpace: "nowrap"
      }
    }, v.load?.resp?.proto))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 18px",
        paddingLeft: "24px"
      }
    }, (v.load?.resp?.dirs || []).map((rd, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: rd?.ic,
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: rd?.icon,
      size: "12",
      stroke: "2.25"
    })), rd?.num ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-lg)",
        fontWeight: "500",
        color: rd?.nc,
        whiteSpace: "nowrap"
      }
    }, rd?.num, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)",
        fontWeight: "400"
      }
    }, rd?.unit)) : null, rd?.text ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, rd?.text) : null))))))) : null, v.fit ? /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: v.L?.fitSpan,
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "inset 0 1px 0 var(--card-highlight)",
        padding: v.L?.tilePad,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)",
        marginBottom: "4px"
      }
    }, "Good for"), (v.fit || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "36px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: f?.icon,
      size: "16"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)",
        flex: "1"
      }
    }, f?.label), f?.rating ? /*#__PURE__*/React.createElement("span", {
      className: f?.cls
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: f?.ricon,
      size: "13",
      stroke: "2"
    }), f?.rating) : null, f?.none ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)"
      }
    }, f?.none) : null))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)",
        lineHeight: "1.4"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "info",
      size: "12"
    }), "Upper bound: packet loss is not measured")) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: v.metaSpan,
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "inset 0 1px 0 var(--card-highlight)",
        padding: v.L?.tilePad,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--fg-subtle)",
        marginBottom: "4px"
      }
    }, v.metaTitle), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: v.metaCols,
        columnGap: "24px"
      }
    }, (v.meta || []).map((mr, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "36px",
        borderBottom: "1px solid var(--border-subtle)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-subtle)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: mr?.icon,
      size: "15"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-sm)"
      }
    }, mr?.label), mr?.sub ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, mr?.sub) : null), mr?.na ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flex: "none"
      }
    }, /*#__PURE__*/React.createElement("span", {
      title: "Browsers can't see packet loss over TCP",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-full)",
        padding: "2px 8px",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "circle-dashed",
      size: "12"
    }), "Not measured"), /*#__PURE__*/React.createElement("a", {
      href: "#",
      title: "Browsers can't see packet loss over TCP",
      style: {
        fontSize: "var(--text-caption)",
        fontWeight: "600",
        color: "var(--primary-text)",
        textDecoration: "none"
      }
    }, "Why?")) : null, mr?.value ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
        color: mr?.vc,
        whiteSpace: "nowrap"
      }
    }, mr?.value) : null)))))), v.lastLine ? /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        alignSelf: "flex-start",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 10px",
        fontSize: "var(--text-caption)",
        color: "var(--fg-subtle)",
        textDecoration: "none"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "history",
      size: "13"
    }), "Last test 2 h ago · ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        color: "var(--fg-muted)"
      }
    }, "\u2193 612 \xB7 \u2191 438 Mbit/s \xB7 3.1 ms"), " · Home Wi-Fi", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "600"
      }
    }, "View")) : null) : null, v.navMobile ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "auto",
        position: "sticky",
        bottom: "0",
        zIndex: "var(--z-nav)"
      }
    }, /*#__PURE__*/React.createElement(Nav, {
      variant: "mobile-bottom",
      active: "test",
      v01: v.v01,
      status: v.srvStatus
    })) : null, v.shareOpen ? /*#__PURE__*/React.createElement("div", {
      onClick: v.closeShare,
      style: {
        position: "absolute",
        inset: "0",
        zIndex: "60",
        background: "var(--scrim)",
        backdropFilter: "blur(2px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: v.SD?.pad,
        boxSizing: "border-box"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "share-title",
      onClick: v.stopProp,
      style: {
        width: "540px",
        maxWidth: "100%",
        maxHeight: "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mh"
    }, /*#__PURE__*/React.createElement("div", {
      className: "mi primary"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "share-2",
      size: "18"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "1",
        minWidth: "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "mt",
      id: "share-title"
    }, "Share result"), /*#__PURE__*/React.createElement("div", {
      className: "md"
    }, "Speeds and latency only. Your IP address and notes are never included.")), /*#__PURE__*/React.createElement("button", {
      className: "btn ghost sm icon",
      "aria-label": "Close",
      onClick: v.closeShare,
      style: {
        alignSelf: "flex-start",
        margin: "-4px -6px 0 0"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "x",
      size: "16"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "image",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Share image"), /*#__PURE__*/React.createElement("span", {
      className: "right",
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        color: "var(--fg-subtle)"
      }
    }, "1200 \xD7 630 PNG")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      "data-theme": "dark",
      "aria-label": "Share image preview",
      style: {
        aspectRatio: "1200/630",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-base)",
        border: "1px solid var(--border-default)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        color: "var(--fg)",
        boxSizing: "border-box"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        fontWeight: "600"
      }
    }, /*#__PURE__*/React.createElement("bg-logo", {
      size: "15",
      style: {
        color: "var(--fg)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        letterSpacing: "var(--tracking-tight)"
      }
    }, "Bit", /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary-text)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Gauge")), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontWeight: "400",
        fontSize: "9px",
        color: "var(--fg-subtle)"
      }
    }, v.share?.head)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "18px",
        alignItems: "flex-end"
      }
    }, (v.share?.blocks || []).map((b, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-cond)",
        fontSize: "8px",
        letterSpacing: ".08em",
        color: b?.c,
        fontWeight: "600"
      }
    }, b?.k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "26px",
        fontWeight: "500",
        lineHeight: "1"
      }
    }, b?.n, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-sans)",
        fontSize: "10px",
        color: "var(--fg-muted)",
        marginLeft: "3px"
      }
    }, b?.u)))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "12px",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        color: "var(--fg-muted)"
      }
    }, (v.share?.foot || []).map((f, $index) => /*#__PURE__*/React.createElement(React.Fragment, {
      key: $index
    }, /*#__PURE__*/React.createElement("span", null, f))), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        color: "var(--fg-subtle)"
      }
    }, "Basement NAS"))), /*#__PURE__*/React.createElement("label", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "var(--text-sm)",
        color: v.incC,
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: v.incLabel,
      disabled: v.incDis,
      onChange: v.toggleInc,
      style: {
        width: "16px",
        height: "16px",
        margin: "0",
        accentColor: "var(--primary)"
      }
    }), " Include label ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-caption)",
        color: "var(--fg-muted)"
      }
    }, v.incNote)))), /*#__PURE__*/React.createElement("section", {
      className: "card",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-h"
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "file-text",
      size: "15"
    }), /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, "Text summary")), /*#__PURE__*/React.createElement("pre", {
      style: {
        margin: "0",
        padding: "12px 16px",
        background: "var(--term-bg)",
        color: "var(--term-fg)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-micro)",
        lineHeight: "1.65",
        whiteSpace: "pre-wrap"
      }
    }, v.share?.text))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: v.SD?.dir,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: "8px",
        padding: "16px 20px 18px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost",
      title: "Opens the system share sheet. Shown only when the browser supports it.",
      style: {
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "share",
      size: "15"
    }), "Share via\u2026"), /*#__PURE__*/React.createElement("button", {
      className: "btn secondary",
      style: {
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "copy",
      size: "15"
    }), "Copy summary"), /*#__PURE__*/React.createElement("button", {
      className: "btn primary",
      style: {
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("bg-icon", {
      name: "download",
      size: "15"
    }), "Download image")))) : null);
  }
}
window.TestScreen = TestScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/TestScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/bg-lib.js
try { (() => {
/* BitGauge design helpers: <bg-icon> (Lucide glyphs), number formatting, gauge + chart geometry.
   Production: lucide-vue-next for icons; the math below ports 1:1 to a composable. */
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
      static get observedAttributes() {
        return ['name', 'size', 'stroke'];
      }
      connectedCallback() {
        this.r();
      }
      attributeChangedCallback() {
        this.r();
      }
      r() {
        if (!this.shadowRoot) this.attachShadow({
          mode: 'open'
        });
        const s = this.getAttribute('size') || 16,
          w = this.getAttribute('stroke') || 1.75;
        this.setAttribute('aria-hidden', 'true');
        this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;flex:none;line-height:0;vertical-align:middle}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${G[this.getAttribute('name')] || '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="2 2"/>'}</svg>`;
      }
    });
  }

  // ---------- formatting ----------
  function rate(bps, unit) {
    const bytes = unit === 'bytes';
    const v = bytes ? bps / 8 : bps;
    const U = bytes ? ['kB/s', 'MB/s', 'GB/s'] : ['kbit/s', 'Mbit/s', 'Gbit/s'];
    const sig = x => x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x).toString();
    if (v < 1e6) {
      const k = v / 1e3;
      return {
        n: k < 10 ? k.toFixed(1) : Math.round(k).toString(),
        u: U[0]
      };
    }
    if (v < 1e9) return {
      n: sig(v / 1e6),
      u: U[1]
    };
    return {
      n: (v / 1e9).toFixed(2),
      u: U[2]
    };
  }
  const rateStr = (b, u) => {
    const r = rate(b, u);
    return r.n + ' ' + r.u;
  };
  const ms = v => v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v).toString();
  // Jitter: one decimal below 10 ms, whole ms at/above 10, "< 1" below the timer resolution (res in ms).
  const jit = (v, res = 0.1) => v < res ? '< ' + (res >= 1 ? Math.round(res) : res.toFixed(1)) : v < 10 ? v.toFixed(1) : Math.round(v).toString();
  const bytes = b => b < 1e6 ? (b / 1e3).toFixed(0) + ' kB' : b < 1e9 ? (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB' : (b / 1e9).toFixed(2) + ' GB';
  const tickLabel = v => v >= 1e9 ? v / 1e9 + 'G' : v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(v);

  // ---------- gauge (270° log arc) ----------
  const A0 = 135,
    SW = 270;
  const pt = (cx, cy, r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  function arc(cx, cy, r, f0, f1) {
    f0 = Math.max(0, Math.min(1, f0));
    f1 = Math.max(f0 + 0.0005, Math.min(1, f1));
    const a0 = A0 + SW * f0,
      a1 = A0 + SW * f1,
      p0 = pt(cx, cy, r, a0),
      p1 = pt(cx, cy, r, a1);
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
    const by = o.unit === 'bytes',
      kMin = by ? 3 : 4,
      kMax = 6,
      hold = o.hold ?? 2;
    let k = o.k0 ?? (by ? 5 : 6),
      dir = 0,
      since = null;
    const shifts = [],
      ks = [];
    for (const [t, raw] of pts) {
      const v = by ? raw / 8 : raw;
      const d = v < Math.pow(10, k + 1) && k > kMin ? -1 : v > Math.pow(10, k + 3) && k < kMax ? 1 : 0;
      if (d !== dir) {
        dir = d;
        since = t;
      }
      if (d && t - since >= hold - 1e-9) {
        shifts.push({
          t,
          from: k,
          to: k + d,
          held: [since, t]
        });
        k += d;
        dir = 0;
        since = null;
      }
      ks.push([t, k]);
    }
    const tl = pts.length ? pts[pts.length - 1][0] : 0;
    return {
      k,
      lo: Math.pow(10, k),
      hi: Math.pow(10, k + 4),
      shifts,
      ks,
      dir,
      holdFor: dir ? tl - since : 0
    };
  }
  const decStr = (e, unit) => {
    const U = unit === 'bytes' ? ['kB/s', 'MB/s', 'GB/s'] : ['kbit/s', 'Mbit/s', 'Gbit/s'];
    const i = Math.max(0, Math.min(2, Math.floor((e - 3) / 3)));
    return Math.pow(10, e - 3 - 3 * i) + ' ' + U[i];
  };
  const winLabel = (k, unit) => 'log scale · ' + decStr(k, unit) + ' – ' + decStr(k + 4, unit) + ' · auto';
  // Shift tween: 280 ms ease-out in log space (pass a fractional k mid-shift). Reduced motion: jump.
  const SHIFT_MS = 280;

  // mode: 'rate' | 'ms'. lo/hi come from the engine (track); default 1 Mbit/s–10 Gbit/s, ms fixed 1–1000.
  // Out-of-range values pin the needle at the start or end; the readout stays exact.
  function gauge({
    size,
    value,
    lo,
    hi,
    mode = 'rate',
    bandLo,
    bandHi,
    peak,
    inner
  }) {
    const cx = size / 2,
      cy = size / 2,
      r = size / 2 - 10;
    if (lo == null) {
      if (mode === 'ms') {
        lo = 1;
        hi = 1000;
      } else {
        lo = 1e6;
        hi = 1e10;
      }
    }
    const L0 = Math.log10(lo),
      L1 = Math.log10(hi);
    const f = v => (Math.log10(Math.min(Math.max(v, lo), hi)) - L0) / (L1 - L0);
    const ticks = [],
      labels = [];
    for (let d = Math.floor(L0 + 1e-9); d <= Math.ceil(L1 - 1e-9); d++) {
      const base = Math.pow(10, d);
      [1, 2, 5].forEach(m => {
        const v = base * m;
        if (v > hi * 1.0001 || v < lo * 0.9999) return;
        const major = m === 1,
          fr = f(v),
          a = A0 + SW * fr;
        const p1 = pt(cx, cy, r - 14, a),
          p2 = pt(cx, cy, r - (major ? 22 : 18), a);
        ticks.push({
          x1: p1[0].toFixed(1),
          y1: p1[1].toFixed(1),
          x2: p2[0].toFixed(1),
          y2: p2[1].toFixed(1),
          w: major ? 1.5 : 1,
          o: major ? 1 : 0.6
        });
        if (major) {
          const pl = pt(cx, cy, r - 36, a);
          labels.push({
            x: pl[0].toFixed(1),
            y: (pl[1] + 4).toFixed(1),
            t: mode === 'ms' ? String(v) : tickLabel(v)
          });
        }
      });
    }
    const out = {
      size,
      vb: `0 0 ${size} ${size}`,
      track: arc(cx, cy, r, 0, 1),
      ticks,
      labels,
      fill: '',
      band: '',
      hasValue: value != null,
      dot: null,
      peak: null,
      pinned: value == null ? null : value < lo ? 'start' : value > hi ? 'end' : null
    };
    if (value != null) {
      const fv = f(value);
      out.fill = arc(cx, cy, r, 0, fv);
      const d = pt(cx, cy, r, A0 + SW * fv);
      out.dot = {
        x: d[0].toFixed(1),
        y: d[1].toFixed(1)
      };
      if (bandLo != null) out.band = arc(cx, cy, r, f(bandLo), f(bandHi));
      if (inner != null) out.inner = arc(cx, cy, r - 10, 0, f(inner));
      if (peak != null) {
        const a = A0 + SW * f(peak),
          q1 = pt(cx, cy, r + 8, a),
          q2 = pt(cx, cy, r - 8, a);
        out.peak = {
          x1: q1[0].toFixed(1),
          y1: q1[1].toFixed(1),
          x2: q2[0].toFixed(1),
          y2: q2[1].toFixed(1)
        };
      }
    }
    return out;
  }

  // ---------- series + chart ----------
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // throughput ramp: target bit/s, tEnd seconds, step s
  function thr(seed, target, tEnd, step = 0.1, noise = 0.06, tau = 0.5) {
    const R = rng(seed),
      p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, target * (1 - Math.exp(-t / tau)) * (1 + noise * (R() - 0.5) * 2 + 0.02 * Math.sin(t * 2.1))]);
    return p;
  }
  function lat(seed, idle, loaded, tEnd, step = 0.1, noise = 0.18, tau = 1.0) {
    const R = rng(seed),
      p = [];
    for (let t = 0; t <= tEnd + 1e-9; t += step) p.push([t, (idle + (loaded - idle) * (1 - Math.exp(-t / tau))) * (1 + noise * (R() - 0.5) * 2)]);
    return p;
  }
  function niceMax(v) {
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
    return 10 * e;
  }
  // opts: {w,h,xMax, series:[pts], yMax?, lat?:pts, latMax?, unit:'bits'|'bytes', xLabel?:fn}
  function chart(o) {
    const all = o.series.flat();
    const ym = o.yMax || niceMax(Math.max(...all.map(p => p[1])) * 1.08);
    // Axis label gutters grow to fit the longest label (e.g. "1.00 Gbit/s") so it is never clipped.
    const lab = f => {
      const v = ym * f,
        r = o.ms ? {
          n: ms(v),
          u: 'ms'
        } : rate(v, o.unit);
      return f === 0 ? '0' : r.n + (f === 1 ? ' ' + r.u : '');
    };
    const CH = 6.7,
      fit = (min, s) => Math.max(min, Math.ceil(s.length * CH) + 14);
    const pl = o.padL ?? fit(44, lab(1));
    let lm0 = 0;
    if (o.lat) lm0 = o.latMax || niceMax(Math.max(...o.lat.map(p => p[1])) * 1.9);
    const pr = o.lat ? o.padR ?? fit(40, Math.round(lm0) + ' ms') : 12,
      pt_ = 10,
      pb = 22,
      W = o.w - pl - pr,
      H = o.h - pt_ - pb;
    const X = t => pl + W * t / o.xMax,
      Y = v => pt_ + H * (1 - v / ym);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const v = ym * f;
      return {
        y: Y(v).toFixed(1),
        x1: pl,
        x2: pl + W,
        t: lab(f),
        ly: (Y(v) + 3.5).toFixed(1),
        lx: pl - 8
      };
    });
    const xt = [];
    const stepX = o.xStep || niceMax(o.xMax / 6);
    for (let t = 0; t <= o.xMax + 1e-9; t += stepX) xt.push({
      x: X(t).toFixed(1),
      y: (o.h - 6).toFixed(1),
      t: o.xLabel ? o.xLabel(t) : Math.round(t * 10) / 10 + 's'
    });
    const line = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    const series = o.series.map(pts => {
      const l = line(pts);
      const last = pts[pts.length - 1];
      return {
        line: l,
        area: l + `L${X(last[0]).toFixed(1)} ${Y(0)}L${X(pts[0][0]).toFixed(1)} ${Y(0)}Z`,
        endX: X(last[0]).toFixed(1),
        endY: Y(last[1]).toFixed(1)
      };
    });
    let latOut = null;
    if (o.lat) {
      const lm = lm0;
      const LY = v => pt_ + H * (1 - v / lm);
      latOut = {
        line: o.lat.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + LY(p[1]).toFixed(1)).join(''),
        ticks: [0, 0.5, 1].map(f => ({
          y: (LY(lm * f) + 3.5).toFixed(1),
          x: pl + W + 8,
          t: Math.round(lm * f) + (f === 1 ? ' ms' : '')
        }))
      };
    }
    const seps = (o.seps || []).map(q => ({
      x: X(q.t).toFixed(1),
      lx: (X(q.t) + 6).toFixed(1),
      ly: pt_ + 12,
      t: q.label,
      y1: pt_,
      y2: pt_ + H
    }));
    const wins = (o.wins || []).map(q => ({
      x: X(q.t0).toFixed(1),
      w: (X(q.t1) - X(q.t0)).toFixed(1),
      y: pt_,
      h: H,
      t: q.label,
      lx: (X(q.t0) + 4).toFixed(1),
      ly: pt_ + H - 8
    }));
    const marks = (o.marks || []).map(q => ({
      x: X(q.t).toFixed(1),
      y1: pt_,
      y2: pt_ + H,
      t: q.label,
      lx: (X(q.t) - 6).toFixed(1),
      ly: pt_ + 12
    }));
    return {
      vb: `0 0 ${o.w} ${o.h}`,
      w: o.w,
      h: o.h,
      grid,
      seps,
      wins,
      marks,
      xt,
      series,
      lat: latOut,
      plotL: pl,
      plotR: pl + W,
      plotT: pt_,
      plotB: pt_ + H,
      nowX: o.now != null ? X(o.now).toFixed(1) : null
    };
  }
  function spark(pts, w, h, yMax) {
    const xm = pts[pts.length - 1][0] || 1,
      ym = yMax || Math.max(...pts.map(p => p[1])) * 1.1;
    return pts.map((p, i) => (i ? 'L' : 'M') + (w * p[0] / xm).toFixed(1) + ' ' + (h - 2 - (h - 4) * p[1] / ym).toFixed(1)).join('');
  }
  const GRADES = {
    'A+': {
      tone: 'ok',
      text: 'Minimal bufferbloat'
    },
    A: {
      tone: 'ok',
      text: 'Low bufferbloat'
    },
    B: {
      tone: 'ok',
      text: 'Mild bufferbloat'
    },
    C: {
      tone: 'warn',
      text: 'Moderate bufferbloat'
    },
    D: {
      tone: 'warn',
      text: 'High bufferbloat'
    },
    F: {
      tone: 'danger',
      text: 'Severe bufferbloat'
    }
  };
  const QUALITY = {
    Great: {
      tone: 'ok',
      icon: 'circle-check'
    },
    Good: {
      tone: 'ok',
      icon: 'check'
    },
    Average: {
      tone: 'warn',
      icon: 'circle-minus'
    },
    Poor: {
      tone: 'warn',
      icon: 'circle-alert'
    },
    Bad: {
      tone: 'danger',
      icon: 'circle-x'
    }
  };
  window.BG = {
    rate,
    rateStr,
    ms,
    jit,
    bytes,
    gauge,
    track,
    winLabel,
    decStr,
    SHIFT_MS,
    arc,
    thr,
    lat,
    chart,
    spark,
    niceMax,
    rng,
    GRADES,
    QUALITY,
    glyphs: Object.keys(G)
  };
  window.dispatchEvent(new Event('bg-lib-ready'));
})();

/* <bg-logo size="28" variant="color|mono">: BitGauge mark (1f Three series).
   color: --series-download / --series-upload / --series-latency (dashed). mono: every arc in currentColor.
   size <= 20 switches to the favicon geometry: two heavier arcs, no dashed latency arc. */
(function () {
  if (customElements.get('bg-logo')) return;
  const FULL = (d, u, l) => '<path d="M14.32 53.68 A25 25 0 1 1 49.68 53.68" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>' + '<path d="M14.32 53.68 A25 25 0 1 1 53.65 23.5" fill="none" style="stroke:' + d + '" stroke-width="5" stroke-linecap="round"/>' + '<path d="M19.98 48.02 A17 17 0 0 1 32 19" fill="none" style="stroke:' + u + '" stroke-width="5" stroke-linecap="round"/>' + '<path d="M25.64 42.36 A9 9 0 0 1 27.5 28.21" fill="none" style="stroke:' + l + '" stroke-width="4" stroke-dasharray="2.6 3"/>';
  const SMALL = (d, u) => '<path d="M15.03 48.97 A24 24 0 1 1 48.97 48.97" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="7" stroke-linecap="round"/>' + '<path d="M15.03 48.97 A24 24 0 1 1 54.35 23.24" fill="none" style="stroke:' + d + '" stroke-width="7" stroke-linecap="round"/>' + '<path d="M23.51 40.49 A12 12 0 0 1 32 20" fill="none" style="stroke:' + u + '" stroke-width="7" stroke-linecap="round"/>';
  class BgLogo extends HTMLElement {
    static get observedAttributes() {
      return ['size', 'variant', 'geometry'];
    }
    connectedCallback() {
      this.render();
    }
    attributeChangedCallback() {
      this.render();
    }
    render() {
      const s = this.getAttribute('size') || '28',
        mono = this.getAttribute('variant') === 'mono';
      const g = this.getAttribute('geometry') || (parseFloat(s) <= 20 ? 'small' : 'full');
      const c = mono ? ['currentColor', 'currentColor', 'currentColor'] : ['var(--series-download)', 'var(--series-upload)', 'var(--series-latency)'];
      // Shadow root: React owns this element's light-DOM children.
      if (!this.shadowRoot) this.attachShadow({
        mode: 'open'
      });
      this.shadowRoot.innerHTML = '<style>:host{display:inline-flex;flex:none;line-height:0}svg{display:block}</style><svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true">' + (g === 'small' ? SMALL(c[0], c[1]) : FULL(...c)) + '</svg>';
    }
  }
  customElements.define('bg-logo', BgLogo);
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/bg-lib.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Notice = __ds_scope.Notice;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.SkeletonRows = __ds_scope.SkeletonRows;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.Gauge = __ds_scope.Gauge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.MetricTile = __ds_scope.MetricTile;

__ds_ns.PhaseStep = __ds_scope.PhaseStep;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.StatusPill = __ds_scope.StatusPill;

})();
