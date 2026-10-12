(function(){
  var out = {};
  var tb = document.querySelector('div[class*=ApplicationMenuTopBar]');
  var shellRoot = tb ? tb.parentElement : null;
  out.shellRoot = shellRoot ? { cls: shellRoot.className, padding: getComputedStyle(shellRoot).padding, rect: (function(){var r=shellRoot.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})() } : null;
  out.bodyPadding = getComputedStyle(document.body).padding;
  out.htmlPadding = getComputedStyle(document.documentElement).padding;
  var wrap = tb ? tb.parentElement.parentElement : null;
  out.topbarParent = wrap ? { cls: wrap.className, padding: getComputedStyle(wrap).padding, rect: (function(){var r=wrap.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})() } : null;
  var ps = document.querySelector('div[class*=PageSurface]');
  if (ps) { var pc = getComputedStyle(ps); var pr = ps.getBoundingClientRect();
    out.pageSurface = { rect: {x:pr.x,y:pr.y,w:pr.width,h:pr.height}, background: pc.backgroundColor, borderRadius: pc.borderRadius, cornerShape: pc.getPropertyValue('corner-shape'), boxShadow: pc.boxShadow, margin: pc.margin, padding: pc.padding, zIndex: pc.zIndex }; }
  var hdr = document.querySelector('header[class*=z-30]');
  if (hdr) { var hc = getComputedStyle(hdr); var hr = hdr.getBoundingClientRect();
    out.header = { rect:{x:hr.x,y:hr.y,w:hr.width,h:hr.height}, appShellHeaderHeight: hc.getPropertyValue('--app-shell-header-height'), heightToken: hc.getPropertyValue('--height-toolbar'), height: hc.height, padding: hc.padding }; }
  var tb2 = document.querySelector('div[class*=Toolbar_]');
  if (tb2) { var tc = getComputedStyle(tb2); var tr = tb2.getBoundingClientRect();
    out.toolbar = { cls: tb2.className.slice(0,80), rect:{x:tr.x,y:tr.y,w:tr.width,h:tr.height}, height: tc.height, padding: tc.padding, gap: tc.gap, appShellHeaderHeight: tc.getPropertyValue('--app-shell-header-height') }; }
  var panel = document.querySelector('#app-shell-sidebar > div > div:nth-child(2)');
  if (panel) { var pc2 = getComputedStyle(panel); var pr2 = panel.getBoundingClientRect();
    out.panel = { rect:{x:pr2.x,y:pr2.y,w:pr2.width,h:pr2.height}, background: pc2.backgroundColor, borderRadius: pc2.borderRadius, cornerShape: pc2.getPropertyValue('corner-shape'), boxShadow: pc2.boxShadow, backdropFilter: pc2.backdropFilter, border: pc2.borderRight + ' | ' + pc2.borderLeft }; }
  var convo = document.querySelector('[class*=thread-scroll-container]');
  if (convo) { var cc = getComputedStyle(convo); var cr = convo.getBoundingClientRect();
    out.threadScroll = { rect:{x:cr.x,y:cr.y,w:cr.width,h:cr.height}, padding: cc.padding, overflowY: cc.overflowY, scrollbarWidth: cc.scrollbarWidth }; }
  var mask = document.querySelector('[class*=sidebar-scroll-mask], [class*=ScrollMask]');
  out.scrollMask = mask ? getComputedStyle(mask).maskImage : null;
  out.scrollbarCss = Array.from(document.styleSheets).some(function(s){ try { return Array.from(s.cssRules).some(function(r){ return r.selectorText && r.selectorText.indexOf('scrollbar') >= 0; }); } catch(e){ return false; } });
  return JSON.stringify(out);
})()