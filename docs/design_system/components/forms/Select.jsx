import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Select — combobox button in the Input shell (36 px; sm 28) whose listbox opens on demand (Reka UI Select).
// Options: strings or { value, label }. Controlled with value, or uncontrolled from defaultValue.
// onValueChange(value); onChange gets { target: { value } } so native-style handlers keep working.
export function Select({ icon, options = [], size = 'md', mono = false, className, style, value, defaultValue, onChange, onValueChange, disabled = false, placeholder, id, ...rest }) {
  const opts = options.map(o => typeof o === 'object' ? o : { value: o, label: o });
  const uid = React.useId(), lid = (id || uid) + '-lb';
  const [inner, setInner] = React.useState(defaultValue !== undefined ? defaultValue : opts[0] && opts[0].value);
  const cur = value !== undefined ? value : inner;
  const selIdx = Math.max(0, opts.findIndex(o => String(o.value) === String(cur)));
  const [open, setOpen] = React.useState(false), [act, setAct] = React.useState(selIdx);
  const wrap = React.useRef(null), btn = React.useRef(null), list = React.useRef(null), typed = React.useRef({ s: '', t: 0 });
  const show = i => { setAct(i == null ? selIdx : i); setOpen(true); };
  const close = refocus => { setOpen(false); if (refocus && btn.current) btn.current.focus(); };
  const pick = i => { const o = opts[i]; if (!o) return; close(true); if (String(o.value) === String(cur)) return; if (value === undefined) setInner(o.value); onValueChange && onValueChange(o.value); onChange && onChange({ target: { value: o.value }, currentTarget: { value: o.value } }); };
  React.useEffect(() => {
    if (!open) return;
    const off = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  React.useEffect(() => {
    if (!open || !list.current) return;
    const el = list.current.children[act];
    if (el) { const l = list.current; if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop; else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight; }
  }, [open, act]);
  const ahead = ch => { const t = typed.current, now = Date.now(); t.s = (now - t.t > 600 ? '' : t.s) + ch.toLowerCase(); t.t = now;
    const from = open ? act : selIdx, n = opts.length;
    const start = t.s.length > 1 ? from : from + 1;
    for (let k = 0; k < n; k++) { const j = (start + k) % n; if (String(opts[j].label).toLowerCase().startsWith(t.s)) return j; }
    return -1; };
  const onKey = e => {
    const n = opts.length, k = e.key;
    if (!open) {
      if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); show(); }
      else if (k.length === 1 && /\S/.test(k)) { const j = ahead(k); if (j >= 0) pick(j); }
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); setAct(Math.min(n - 1, act + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setAct(Math.max(0, act - 1)); }
    else if (k === 'Home') { e.preventDefault(); setAct(0); }
    else if (k === 'End') { e.preventDefault(); setAct(n - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(act); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === 'Tab') setOpen(false);
    else if (k.length === 1 && /\S/.test(k)) { const j = ahead(k); if (j >= 0) setAct(j); }
  };
  const curOpt = opts[selIdx];
  return <div ref={wrap} className="sel-wrap" style={style}>
    <button ref={btn} type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={lid} aria-activedescendant={open ? lid + '-' + act : undefined} disabled={disabled}
      className={'input select' + (size === 'sm' ? ' sm' : '') + (mono ? ' mono' : '') + (className ? ' ' + className : '')}
      onClick={() => open ? close(false) : show()} onKeyDown={onKey} {...rest}>
      {icon ? <Icon name={icon} size={14} /> : null}
      <span className={'sel-v' + (curOpt ? '' : ' ph')}>{curOpt ? curOpt.label : placeholder}</span>
      <Icon name="chevron-down" size={14} />
    </button>
    {open ? <ul ref={list} id={lid} role="listbox" aria-label={rest['aria-label']} aria-labelledby={rest['aria-labelledby']} tabIndex={-1} className="menu sel-list">
      {opts.map((o, i) => <li key={o.value} id={lid + '-' + i} role="option" aria-selected={i === selIdx} className={'menu-item' + (i === act ? ' act' : '')}
        onPointerDown={e => e.preventDefault()} onPointerEnter={() => setAct(i)} onClick={() => pick(i)}>
        <span className="lb">{o.label}</span>
        <span className="ck" aria-hidden="true">{i === selIdx ? <Icon name="check" size={14} stroke={2.5} /> : null}</span>
      </li>)}
    </ul> : null}
  </div>;
}
