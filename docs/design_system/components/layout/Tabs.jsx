import React from 'react';
import { Icon } from '../brand/Icon.jsx';
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">
    {tabs.map(t => { const tab = typeof t === 'string' ? { value: t, label: t } : t; const on = tab.value === value;
      return <button key={tab.value} type="button" role="tab" aria-selected={on} className={'tab' + (on ? ' active' : '')} onClick={() => onChange && onChange(tab.value)}>{tab.icon ? <Icon name={tab.icon} size={15} /> : null}{tab.label}</button>; })}
  </div>;
}
