(function(){
  var m = document.querySelector('[role=menu]');
  if (!m) return JSON.stringify({ error: 'no open menu' });
  var mr = m.getBoundingClientRect();
  var mc = getComputedStyle(m);
  var rows = Array.from(m.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=separator],hr')).map(function(el){
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var kbd = el.querySelector('kbd,[class*=shortcut],[class*=Shortcut]');
    return {
      role: el.getAttribute('role'),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      shortcut: kbd ? kbd.textContent.trim() : null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, padding: cs.padding, gap: cs.gap,
      fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight, color: cs.color,
      background: cs.backgroundColor, borderRadius: cs.borderRadius,
      gridTemplateColumns: cs.gridTemplateColumns,
      html: el.outerHTML.slice(0, 240)
    };
  });
  return JSON.stringify({
    menu: { id: m.id, role: m.getAttribute('role'), rect: { x: mr.x, y: mr.y, w: mr.width, h: mr.height },
      background: mc.backgroundColor, borderRadius: mc.borderRadius, cornerShape: mc.getPropertyValue('corner-shape'),
      padding: mc.padding, boxShadow: mc.boxShadow, backdropFilter: mc.backdropFilter, border: mc.border, zIndex: mc.zIndex,
      fontFamily: mc.fontFamily.split(',')[0], fontSize: mc.fontSize, lineHeight: mc.lineHeight, color: mc.color,
      html: m.outerHTML.slice(0, 700) },
    rowCount: rows.length, rows: rows });
})()