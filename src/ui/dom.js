// Tiny DOM helper: h(tag, className, [attrs], children)
export function h(tag, cls = '', a, b) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  let attrs = null, kids = null;
  if (a && typeof a === 'object' && !Array.isArray(a) && !(a instanceof Node)) { attrs = a; kids = b; } else kids = a;
  if (attrs) for (const k in attrs) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'style') el.style.cssText = attrs[k];
    else if (k === 'disabled') el.disabled = !!attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  if (kids != null) for (const c of [].concat(kids)) if (c !== '' && c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
