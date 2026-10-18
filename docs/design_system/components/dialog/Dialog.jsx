import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { useModal } from './Modal.jsx';
let n = 0;
export function Dialog({ open = true, inline = false, tone = 'primary', icon, title, children, body, scope, footer, footerStack = false, wide = false, size, flush = false, onClose, closeLabel = 'Close', align = 'center' }) {
  const [id] = React.useState(() => 'bg-dlg-' + (++n));
  const ref = React.useRef(null);
  useModal(ref, open && !inline);
  if (!open) return null;
  const box = <div ref={ref} className={'modal' + (wide || size === 'wide' ? ' wide' : '') + (size === 'xl' ? ' xl' : '') + (inline ? ' static' : '')} role={tone === 'danger' ? 'alertdialog' : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-labelledby={id + '-t'} aria-describedby={children ? id + '-d' : undefined} onClick={e => e.stopPropagation()}>
    <div className="mh">{icon ? <div className={'mi ' + tone}><Icon name={icon} size={18} /></div> : null}
      <div className="mtx"><h2 className="mt" id={id + '-t'}>{title}</h2>{children ? <div className="md" id={id + '-d'}>{children}</div> : null}</div>
      {onClose ? <button type="button" className="btn ghost sm icon mx" aria-label={closeLabel} onClick={onClose}><Icon name="x" size={16} /></button> : null}
    </div>
    {body ? <div className={'mbody' + (flush ? ' flush' : '')}>{body}</div> : null}
    {scope ? <div className="scope"><span className="ico"><Icon name="shield" size={14} /></span>{scope}</div> : null}
    {footer ? <div className={'mf' + (footerStack ? ' stack' : '')}>{footer}</div> : null}
  </div>;
  if (inline) return box;
  return <div className={'dlg-layer' + (align === 'top' ? ' top' : '')} onClick={onClose} onKeyDown={e => { if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); } }}>
    <div className="scrim"></div>{box}
  </div>;
}
