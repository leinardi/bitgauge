import React from 'react';
// Modal behaviour shared by Dialog, Popover and custom full-screen dialogs (i18n-a11y.md §2, screens.md §3).
const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])';
const SKIP = /^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT)$/;
const HAS_INERT = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
const tabbables = el => [...el.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[inert]') && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const exempt = n => !!(n && n.closest && n.closest('[data-modal-exempt]'));
// While `active`: everything outside the element is inert (every sibling of the element and of each ancestor up to
// <body>; aria-hidden where `inert` is unsupported), focus moves inside and Tab / Shift+Tab wrap within it. On
// deactivation both are restored and focus returns to the control that had it. Elements marked data-modal-exempt
// (kit debug scaffolding) are left alone. `onOutside` fires on a click outside the element.
export function useModal(ref, active = true, { onOutside } = {}) {
  const cb = React.useRef(null); cb.current = onOutside;
  React.useEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    const prev = document.activeElement, hidden = [];
    for (let n = el; n.parentElement && n !== document.body; n = n.parentElement) {
      for (const s of n.parentElement.children) {
        if (s === n || SKIP.test(s.tagName) || s.hasAttribute('data-modal-exempt') || s.inert || s.getAttribute('aria-hidden') === 'true') continue;
        if (HAS_INERT) s.inert = true; else s.setAttribute('aria-hidden', 'true');
        hidden.push(s);
      }
    }
    const into = (last) => { const t = tabbables(el); const f = last ? t[t.length - 1] : t[0];
      if (f) f.focus({ preventScroll: true }); else { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } };
    if (!el.contains(document.activeElement)) into(false);
    const key = e => {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const a = document.activeElement;
      if (exempt(a)) return;
      const t = tabbables(el);
      if (!el.contains(a) || !t.length) { e.preventDefault(); into(e.shiftKey); return; }
      if (e.shiftKey && (a === t[0] || a === el)) { e.preventDefault(); t[t.length - 1].focus(); }
      else if (!e.shiftKey && a === t[t.length - 1]) { e.preventDefault(); t[0].focus(); }
    };
    const click = e => { if (cb.current && !el.contains(e.target) && !exempt(e.target)) cb.current(e); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('click', click, true);
      hidden.forEach(s => { if (HAS_INERT) s.inert = false; else s.removeAttribute('aria-hidden'); });
      const a = document.activeElement;
      if (prev && prev.isConnected && prev.focus && (!a || a === document.body || el.contains(a))) prev.focus({ preventScroll: true });
    };
  }, [active]);
}
// Non-modal dismissal: `onOutside` fires on a click outside the element while `active` (non-modal Popover).
export function useDismiss(ref, active, onOutside) {
  const cb = React.useRef(null); cb.current = onOutside;
  React.useEffect(() => {
    if (!active) return undefined;
    const click = e => { const el = ref.current; if (cb.current && el && !el.contains(e.target) && !exempt(e.target)) cb.current(e); };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, [active]);
}
// Element form of useModal for custom dialogs (e.g. a full-screen mobile sheet). Set role / aria-modal / a label on it.
export function Modal({ as = 'div', active = true, onOutside, children, ...rest }) {
  const ref = React.useRef(null);
  useModal(ref, active, { onOutside });
  return React.createElement(as, Object.assign({ ref }, rest), children);
}
