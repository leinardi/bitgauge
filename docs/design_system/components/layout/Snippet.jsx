import React from 'react';
import { Icon } from '../brand/Icon.jsx';
// Code / config snippet on the terminal surface, with an optional copy button. Lines never wrap: a long line
// scrolls horizontally inside the block (keyboard-focusable), so a copied command reads as it runs.
export function Snippet({ lines = [], caption, copyLabel, onCopy }) {
  return <div className="snip">
    {caption ? <span className="snip-cap">{caption}</span> : null}
    <div className="snip-box">
      <pre className={copyLabel ? 'has-copy' : undefined} tabIndex={0} aria-label={caption || copyLabel || undefined}>{lines.map((l, i) => { const o = typeof l === 'string' ? { t: l } : l; return <span key={i} className={o.kind ? 'k-' + o.kind : undefined}>{o.t}</span>; })}</pre>
      {copyLabel ? <button type="button" className="btn ghost sm icon snip-copy" aria-label={copyLabel} onClick={onCopy}><Icon name="copy" size={14} /></button> : null}
    </div>
  </div>;
}
