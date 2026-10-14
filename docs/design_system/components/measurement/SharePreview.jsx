import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { Logo } from '../brand/Logo.jsx';
import { GRADES } from './LoadCard.jsx';
// share-panel.md — preview of the 1200×630 share image (always dark). Sizes are the image scaled into the card.
export function SharePreview({ head, blocks = [], grade, foot = [], where, label = 'Share image preview' }) {
  const G = grade ? GRADES[grade] : null;
  return <div data-theme="dark" className="sharep" role="img" aria-label={label}>
    <div className="sharep-h"><Logo size={15} wordmark /><span className="hd">{head}</span></div>
    <div className="sharep-b">{blocks.map((b, i) => <div key={i}><span className="k" style={{ color: b.color }}>{b.label}</span><span className="n">{b.value}<span className="u">{b.unit}</span></span></div>)}
      {G ? <span className="sharep-g"><span className={'grade-l ' + G.tone}>{grade}</span><span className="w"><b>{G.text.split(' ')[0]}</b><span>bufferbloat</span></span></span> : null}</div>
    <div className="sharep-f">{foot.map((f, i) => <span key={i}>{f}</span>)}<span className="w">{where}</span></div>
  </div>;
}
// The idle-state "last result" line: when, headline numbers, label, link to its detail (screens.md §1).
export function LastResult({ when, values, label, href = '#' }) {
  return <a className="lastres" href={href}><Icon name="history" size={13} />{'Last test ' + when + ' · '}<span className="v">{values}</span>{label ? ' · ' + label : ''}<span className="go">View</span></a>;
}
