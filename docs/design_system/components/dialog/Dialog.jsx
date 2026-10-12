import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Dialog({ open = true, inline = false, tone = 'primary', icon, title, children, scope, footer, wide = false, onClose }) {
  if (!open) return null;
  const box = <div className={'modal' + (wide ? ' wide' : '')} role={tone === 'danger' ? 'alertdialog' : 'dialog'} aria-modal={inline ? undefined : 'true'} style={inline ? { opacity: 1, transform: 'none', animation: 'none' } : undefined}>
    <div className="mh">{icon ? <div className={'mi ' + tone}><Icon name={icon} size={18} /></div> : null}<div><div className="mt">{title}</div>{children ? <div className="md">{children}</div> : null}</div></div>
    {scope ? <div className="scope"><span className="ico"><Icon name="shield" size={14} /></span>{scope}</div> : null}
    {footer ? <div className="mf">{footer}</div> : null}
  </div>;
  if (inline) return box;
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-overlay)' }}>
    <div className="scrim" onClick={onClose}></div>{box}
  </div>;
}
