import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { Chip } from '../status/Chip.jsx';
const ST = { saved: ['circle-check', 'ok'], kept: ['circle-check', 'ok'], complete: ['circle-check', 'ok'], unsaved: ['circle-minus', 'muted'] };
export function SaveBar({ status = 'saved', title, time, message, label, actions }) {
  const s = ST[status] || ST.saved;
  return <section className="card savebar" aria-label="Result status">
    <span className="sb-st" role="status"><span className={'ic ' + s[1]}><Icon name={s[0]} size={16} /></span>{title}{time ? <span className="tm">{time}</span> : null}</span>
    {message ? <span className="sb-msg">{message}</span> : null}
    {label ? <>
      <label className="input sb-in"><Icon name="tag" size={14} /><input aria-label="Result label" value={label.value || ''} placeholder={label.placeholder || 'Add a label, e.g. Home Wi-Fi'} onChange={label.onChange} /></label>
      {label.suggestions && label.suggestions.length ? <div className="sb-chips" role="group" aria-label="Suggested labels">{label.suggestions.map(c => <Chip key={c} size="sm" onClick={() => label.onSuggest && label.onSuggest(c)}>{c}</Chip>)}</div> : null}
    </> : null}
    {actions ? <div className="sb-act">{actions}</div> : null}
  </section>;
}
