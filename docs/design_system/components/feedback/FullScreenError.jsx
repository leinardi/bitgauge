import React from 'react';
import { Icon } from '../brand/Icon.jsx';
import { Logo } from '../brand/Logo.jsx';
// Full-screen error (base path mismatch): nothing else loads, so it carries its own wordmark.
export function FullScreenError({ eyebrow = 'Deployment error', title, children, facts, hint, actions, compact = false }) {
  return <main role="alert" aria-labelledby="fse-title" className={'fse' + (compact ? ' compact' : '')}>
    <div className="fse-in">
      <Logo size={22} wordmark />
      <div className="fse-h">
        <span className="ds-eyebrow fse-eb"><Icon name="circle-alert" size={13} stroke={2.25} />{eyebrow}</span>
        <h1 id="fse-title" className="fse-t">{title}</h1>
        {children ? <p className="fse-d">{children}</p> : null}
      </div>
      {facts}
      {hint}
      {actions ? <div className="fse-a">{actions}</div> : null}
    </div>
  </main>;
}
