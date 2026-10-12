#!/usr/bin/env node
/**
 * capture.mjs - 自写的最小 CDP 客户端 + Codex Desktop 参考端采集器。
 * 零第三方依赖：只用 Node >= 22 内置的全局 WebSocket / fetch。
 *
 * 设计要点
 *  - 所有「页面内探针」都写成普通函数，用 fn.toString() 注入执行，避免转义地狱。
 *  - 每次采集都落盘 JSON（元素选择器 + rect + 全部相关 computed style + 文本 + 出处），
 *    这样 SPEC.md 里的每个数值都能由 captures/*.json 复算。
 *
 * 用法
 *   node tools/codex-ref/capture.mjs ping                 [--port 9222]
 *   node tools/codex-ref/capture.mjs tokens               [--port 9222] [--out DIR]
 *   node tools/codex-ref/capture.mjs eval "<表达式>"       [--port 9222]
 *   node tools/codex-ref/capture.mjs view --name shell --selector "..." [--port 9222] [--out DIR]
 *   node tools/codex-ref/capture.mjs views --spec views.json
 *   node tools/codex-ref/capture.mjs shot --out x.png      [--port 9222]
 *   node tools/codex-ref/capture.mjs tree --depth 6        [--port 9222]
 *   node tools/codex-ref/capture.mjs click --text "Settings" | --selector "..."
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DEFAULT_OUT = path.join(REPO, 'evidence', 'codex-desktop', 'captures');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) === '--') {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === '--') { flags[key] = true; }
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional: positional, flags: flags };
}

/* ------------------------------ CDP 客户端 ------------------------------ */
class CDP {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); this.events = []; }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise(function (res, rej) {
      ws.addEventListener('open', function () { res(); }, { once: true });
      ws.addEventListener('error', function () { rej(new Error('WebSocket 连接失败: ' + wsUrl)); }, { once: true });
    });
    const c = new CDP(ws);
    ws.addEventListener('message', function (ev) {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && c.pending.has(msg.id)) {
        const p = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.method + ' -> ' + JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else { c.events.push(msg); }
    });
    return c;
  }
  send(method, params, timeoutMs) {
    const id = ++this.seq;
    const self = this;
    const budget = timeoutMs || 20000;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        if (self.pending.has(id)) { self.pending.delete(id); reject(new Error(method + ' 超时 (' + budget + 'ms)，渲染进程没有响应帧')); }
      }, budget);
      self.pending.set(id, {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); },
      });
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function listTargets(port) {
  const res = await fetch('http://127.0.0.1:' + port + '/json/list');
  return await res.json();
}

function pickTarget(list, want) {
  const pages = list.filter(function (t) { return t.type === 'page' && t.webSocketDebuggerUrl; });
  if (!pages.length) return null;
  if (want) {
    const hit = pages.filter(function (t) { return (t.url + ' ' + t.title).indexOf(want) >= 0; });
    if (hit.length) return hit[0];
  }
  const app = pages.filter(function (t) { return t.url.indexOf('app://') === 0; });
  return app.length ? app[0] : pages[0];
}

async function connect(flags) {
  const port = Number(flags.port || 9222);
  const list = await listTargets(port);
  const t = pickTarget(list, flags.target);
  if (!t) throw new Error('端口 ' + port + ' 上找不到 page target');
  const cdp = await CDP.connect(t.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  return { cdp: cdp, target: t, port: port };
}

async function evaluate(cdp, fnOrExpr, arg) {
  const src = typeof fnOrExpr === 'function'
    ? '(' + fnOrExpr.toString() + ')(' + JSON.stringify(arg === undefined ? null : arg) + ')'
    : fnOrExpr;
  const r = await cdp.send('Runtime.evaluate', {
    expression: src, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

/* ------------------------------ 页面内探针 ------------------------------ */
function probeInfo() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return {
    href: location.href,
    title: document.title,
    visibility: document.visibilityState,
    innerWidth: innerWidth,
    innerHeight: innerHeight,
    devicePixelRatio: devicePixelRatio,
    htmlClass: root.className,
    bodyClass: document.body ? document.body.className : null,
    colorScheme: cs.colorScheme,
    rootColor: cs.color,
    rootBackground: cs.backgroundColor,
    rootFont: cs.fontFamily + ' / ' + cs.fontSize + ' / ' + cs.lineHeight,
    zoom: cs.getPropertyValue('--codex-window-zoom').trim(),
    userAgent: navigator.userAgent,
  };
}

function probeRuntimeTokens() {
  function collect(rule, acc) {
    try {
      if (rule.style) {
        for (let i = 0; i < rule.style.length; i++) {
          const p = rule.style[i];
          if (p.slice(0, 2) === '--') acc.add(p);
        }
      }
      if (rule.cssRules) {
        for (let j = 0; j < rule.cssRules.length; j++) collect(rule.cssRules[j], acc);
      }
    } catch (e) { /* 跨域 sheet */ }
  }
  const names = new Set();
  const sheets = Array.from(document.styleSheets);
  let readable = 0, blocked = 0;
  for (const s of sheets) {
    try {
      const rs = s.cssRules;
      if (!rs) { blocked++; continue; }
      readable++;
      for (let i = 0; i < rs.length; i++) collect(rs[i], names);
    } catch (e) { blocked++; }
  }
  const rootCs = getComputedStyle(document.documentElement);
  const bodyCs = document.body ? getComputedStyle(document.body) : null;
  const onRoot = {}, onBody = {}, differing = {};
  for (const n of names) {
    const rv = rootCs.getPropertyValue(n).trim();
    const bv = bodyCs ? bodyCs.getPropertyValue(n).trim() : '';
    if (rv !== '' || bv !== '') onRoot[n] = rv;
    if (bv !== '' && bv !== rv) { onBody[n] = bv; differing[n] = { html: rv, body: bv }; }
  }
  // 组件级覆盖：扫描真实节点，找出在非 html/body 元素上被重新定义的 token
  const scoped = {};
  const all = document.querySelectorAll('*');
  const limit = Math.min(all.length, 600);
  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const ecs = getComputedStyle(el);
    for (const n of names) {
      const v = ecs.getPropertyValue(n).trim();
      if (v === '' || v === onRoot[n]) continue;
      if (!scoped[n]) scoped[n] = [];
      if (scoped[n].length < 12) {
        scoped[n].push({
          value: v,
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 120),
          path: (function () {
            const parts = [];
            let cur = el;
            while (cur && cur !== document.body && parts.length < 4) {
              let s = cur.tagName.toLowerCase();
              if (cur.id) s += '#' + cur.id;
              else if (cur.className && typeof cur.className === 'string') s += '.' + cur.className.trim().split(/\s+/).slice(0, 2).join('.');
              parts.unshift(s);
              cur = cur.parentElement;
            }
            return parts.join('>');
          })(),
        });
      }
    }
  }
  return {
    sheetsTotal: sheets.length, sheetsReadable: readable, sheetsBlocked: blocked,
    tokenCount: names.size,
    tokens: onRoot,
    tokensOnBodyDiffering: differing,
    tokensScopedOnElements: scoped,
    semantic: {
      color: rootCs.color, backgroundColor: rootCs.backgroundColor,
      fontFamily: rootCs.fontFamily, fontSize: rootCs.fontSize,
      fontWeight: rootCs.fontWeight, lineHeight: rootCs.lineHeight,
      letterSpacing: rootCs.letterSpacing,
    },
  };
}

function probeTree(arg) {
  const depth = arg && arg.depth ? arg.depth : 6;
  const maxNodes = arg && arg.maxNodes ? arg.maxNodes : 400;
  let count = 0;
  function walk(el, d, pfx) {
    if (count >= maxNodes) return null;
    count++;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const node = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: typeof el.className === 'string' ? el.className : undefined,
      role: el.getAttribute('role') || undefined,
      dataAttrs: (function () {
        const o = {};
        for (const a of Array.from(el.attributes)) if (a.name.slice(0, 5) === 'data-') o[a.name] = a.value.slice(0, 80);
        return Object.keys(o).length ? o : undefined;
      })(),
      rect: { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 },
      display: cs.display,
      overflow: cs.overflow,
      text: el.children.length === 0 ? String(el.textContent || '').trim().slice(0, 80) : undefined,
      children: [],
    };
    if (d > 0) {
      for (const c of Array.from(el.children)) {
        const n = walk(c, d - 1, pfx + '  ');
        if (n) node.children.push(n);
      }
    }
    return node;
  }
  const rootEl = (arg && arg.root) ? document.querySelector(arg.root) : document.body;
  if (!rootEl) return { error: 'root not found: ' + (arg && arg.root) };
  return walk(rootEl, depth, '');
}



function probeView(arg) {
  // 注入页面执行，必须自包含（不能引用模块作用域常量）
  const STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'inset',
    'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'flex',
    'alignItems', 'alignSelf', 'justifyContent', 'justifyItems', 'placeItems', 'placeContent',
    'gap', 'rowGap', 'columnGap', 'order',
    'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow',
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'aspectRatio',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderWidth', 'borderStyle', 'borderColor', 'borderTopColor', 'borderBottomColor',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
    'cornerShape', 'boxSizing', 'boxShadow', 'outline', 'outlineColor', 'outlineOffset', 'outlineWidth', 'outlineStyle',
    'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundClip',
    'color', 'caretColor', 'accentColor',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariationSettings', 'fontFeatureSettings',
    'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecoration', 'textOverflow', 'textIndent',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'textWrap',
    'overflow', 'overflowX', 'overflowY', 'scrollbarWidth', 'scrollbarGutter', 'scrollbarColor',
    'opacity', 'filter', 'backdropFilter', 'mixBlendMode', 'isolation',
    'zIndex', 'transform', 'transformOrigin', 'translate', 'rotate', 'scale', 'willChange',
    'transition', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
    'animation', 'animationName', 'animationDuration', 'animationTimingFunction', 'animationIterationCount',
    'cursor', 'pointerEvents', 'userSelect', 'visibility', 'contentVisibility', 'contain',
    'verticalAlign', 'listStyle', 'objectFit', 'appearance', 'resize', 'tableLayout', 'borderCollapse',
    'WebkitLineClamp', 'WebkitFontSmoothing', 'WebkitOverflowScrolling', 'WebkitTextFillColor', 'WebkitBoxOrient',
  ];
  const selector = arg.selector;
  const maxCustom = arg.maxCustom || 400;
  const els = Array.from(document.querySelectorAll(selector));
  const out = [];
  for (let i = 0; i < Math.min(els.length, arg.limit || 12); i++) {
    const el = els[i];
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const style = {};
    for (const p of STYLE_PROPS) style[p] = cs.getPropertyValue(p.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); })).trim();
    const custom = {};
    let n = 0;
    for (let k = 0; k < cs.length && n < maxCustom; k++) {
      const p = cs[k];
      if (p.slice(0, 2) === '--') { custom[p] = cs.getPropertyValue(p).trim(); n++; }
    }
    const pseudo = {};
    for (const ps of ['::before', '::after', '::placeholder', '::selection']) {
      const pcs = getComputedStyle(el, ps);
      if (pcs && pcs.content && pcs.content !== 'none') {
        pseudo[ps] = { content: pcs.content, width: pcs.width, height: pcs.height, background: pcs.backgroundColor, color: pcs.color, borderRadius: pcs.borderRadius, position: pcs.position, inset: pcs.inset, opacity: pcs.opacity };
      }
    }
    out.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: typeof el.className === 'string' ? el.className : null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      dataAttrs: (function () { const o = {}; for (const a of Array.from(el.attributes)) if (a.name.slice(0, 5) === 'data-') o[a.name] = a.value.slice(0, 120); return o; })(),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      html: el.outerHTML.slice(0, 1200),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left },
      scroll: { scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight },
      style: style,
      customProps: custom,
      pseudo: pseudo,
      childrenSummary: Array.from(el.children).slice(0, 40).map(function (c) {
        const cr = c.getBoundingClientRect();
        const ccs = getComputedStyle(c);
        return {
          tag: c.tagName.toLowerCase(),
          cls: typeof c.className === 'string' ? c.className.slice(0, 120) : null,
          text: String(c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          rect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
          display: ccs.display, background: ccs.backgroundColor, color: ccs.color,
          fontSize: ccs.fontSize, fontWeight: ccs.fontWeight, borderRadius: ccs.borderRadius, padding: ccs.padding, gap: ccs.gap,
        };
      }),
      animations: el.getAnimations ? el.getAnimations().map(function (a) {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        return { name: a.animationName || (a.constructor && a.constructor.name), duration: t.duration, easing: t.easing, delay: t.delay, iterations: t.iterations, playState: a.playState };
      }) : [],
    });
  }
  return { selector: selector, matched: els.length, viewport: { w: innerWidth, h: innerHeight }, elements: out };
}

function probeClickText(arg) {
  const t = String(arg.text).toLowerCase();
  const all = Array.from(document.querySelectorAll('*'));
  const hits = [];
  for (const el of all) {
    const s = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const low = s.toLowerCase();
    const isExact = low === t;
    if (!isExact && low.indexOf(t) < 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    hits.push({ el: el, exact: isExact ? 1 : 0, area: r.width * r.height });
  }
  if (!hits.length) return null;
  hits.sort(function (a, b) { return (b.exact - a.exact) || (a.area - b.area); });
  const best = hits[0];
  const target = best.el.closest('button,a,[role="menuitem"],[role="button"],[role="tab"],[role="option"],[role="link"]') || best.el;
  const tr = target.getBoundingClientRect();
  return {
    x: tr.x + tr.width / 2, y: tr.y + tr.height / 2,
    tag: target.tagName.toLowerCase(), cls: String(target.className || '').slice(0, 140),
    text: String(target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    exact: !!best.exact, area: Math.round(best.area), candidates: hits.length,
  };
}


function probeBlocks(arg) {
  // 注入页面执行，必须自包含
  function pathOf(el, stop) {
    const parts = [];
    let cur = el;
    while (cur && cur !== stop && parts.length < 5) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) s += '#' + cur.id;
      else if (typeof cur.className === 'string' && cur.className.trim()) s += '.' + cur.className.trim().split(/\s+/).slice(0, 3).join('.');
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  const root = arg.root ? document.querySelector(arg.root) : document.body;
  if (!root) return { error: 'root not found: ' + arg.root };
  const minArea = arg.minArea || 400;
  const out = [];
  const all = [root].concat(Array.from(root.querySelectorAll('*')));
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.width * r.height < minArea) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    out.push({
      path: pathOf(el, root),
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className : null,
      id: el.id || null,
      role: el.getAttribute('role') || null,
      aria: el.getAttribute('aria-label') || null,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      childCount: el.children.length,
      s: {
        display: cs.display, position: cs.position, flexDirection: cs.flexDirection, alignItems: cs.alignItems, justifyContent: cs.justifyContent,
        gap: cs.gap, padding: cs.padding, margin: cs.margin,
        width: cs.width, height: cs.height, maxWidth: cs.maxWidth, minHeight: cs.minHeight,
        backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage.slice(0, 120),
        color: cs.color, border: cs.border, borderTop: cs.borderTop, borderRadius: cs.borderRadius, cornerShape: cs.getPropertyValue('corner-shape'),
        boxShadow: cs.boxShadow.slice(0, 200), filter: cs.filter, backdropFilter: cs.backdropFilter, opacity: cs.opacity,
        fontFamily: cs.fontFamily.split(',')[0], fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign,
        overflow: cs.overflow, zIndex: cs.zIndex, transition: cs.transition.slice(0, 200), cursor: cs.cursor,
      },
    });
  }
  return { root: arg.root, viewport: { w: innerWidth, h: innerHeight }, count: out.length, blocks: out };
}
/* ------------------------------ 子命令 ------------------------------ */
const { positional, flags } = parseArgs(process.argv.slice(2));
const cmd = positional[0];
const OUT = flags.out && flags.out !== true ? flags.out : DEFAULT_OUT;

function writeJson(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

async function withCdp(fn) {
  const { cdp, target, port } = await connect(flags);
  try { return await fn(cdp, target, port); } finally { cdp.close(); }
}

try {
  if (cmd === 'ping') {
    const r = await withCdp(async function (cdp, target, port) {
      return { port: port, target: { id: target.id, title: target.title, url: target.url }, info: await evaluate(cdp, probeInfo) };
    });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'tokens') {
    const r = await withCdp(async function (cdp) {
      return { info: await evaluate(cdp, probeInfo), runtime: await evaluate(cdp, probeRuntimeTokens) };
    });
    const p = writeJson('tokens.runtime.json', r);
    console.log(JSON.stringify({ out: p, tokenCount: r.runtime.tokenCount, sheets: [r.runtime.sheetsReadable, r.runtime.sheetsTotal], viewport: [r.info.innerWidth, r.info.innerHeight], zoom: r.info.zoom }, null, 2));
  } else if (cmd === 'info') {
    console.log(JSON.stringify(await withCdp(function (cdp) { return evaluate(cdp, probeInfo); }), null, 2));
  } else if (cmd === 'eval') {
    const expr = positional.slice(1).join(' ');
    console.log(JSON.stringify(await withCdp(function (cdp) { return evaluate(cdp, expr); }), null, 2));
  } else if (cmd === 'tree') {
    const r = await withCdp(function (cdp) {
      return evaluate(cdp, probeTree, { depth: Number(flags.depth || 6), maxNodes: Number(flags.maxNodes || 400), root: flags.root && flags.root !== true ? String(flags.root) : null });
    });
    const p = writeJson((flags.name || 'tree') + '.json', r);
    console.log(p);
  } else if (cmd === 'view') {
    const spec = {
      name: flags.name || 'view',
      selectors: String(flags.selector || '').split('|').filter(Boolean),
      limit: Number(flags.limit || 12),
      maxCustom: Number(flags.maxCustom || 400),
    };
    const r = await withCdp(async function (cdp) {
      const info = await evaluate(cdp, probeInfo);
      const views = [];
      for (const s of spec.selectors) views.push(await evaluate(cdp, probeView, { selector: s, limit: spec.limit, maxCustom: spec.maxCustom }));
      return { name: spec.name, capturedAt: new Date().toISOString(), info: info, views: views };
    });
    const p = writeJson('view-' + spec.name + '.json', r);
    console.log(p);
  } else if (cmd === 'views') {
    const specPath = flags.spec;
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const r = await withCdp(async function (cdp) {
      const info = await evaluate(cdp, probeInfo);
      const groups = [];
      for (const g of spec.groups) {
        const views = [];
        for (const s of g.selectors) views.push(await evaluate(cdp, probeView, { selector: s, limit: g.limit || 12, maxCustom: 400 }));
        groups.push({ name: g.name, note: g.note, views: views });
      }
      return { spec: specPath, capturedAt: new Date().toISOString(), info: info, groups: groups };
    });
    const p = writeJson((flags.name || 'views') + '.json', r);
    console.log(p);
  } else if (cmd === 'click') {
    const r = await withCdp(async function (cdp) {
      let pos = null;
      if (flags.text) {
        pos = await evaluate(cdp, probeClickText, { text: String(flags.text) });
        if (!pos) throw new Error('找不到文本: ' + flags.text);
      } else if (flags.selector) {
        pos = await evaluate(cdp, function (sel) {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 120) };
        }, String(flags.selector));
        if (!pos) throw new Error('找不到选择器: ' + flags.selector);
      } else if (flags.xy) {
        const xy = String(flags.xy).split(',').map(Number);
        pos = { x: xy[0], y: xy[1] };
      }
      if (!pos) throw new Error('click 需要 --text / --selector / --xy');
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type: type, x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
      }
      await new Promise(function (r2) { setTimeout(r2, Number(flags.wait || 900)); });
      return { pos: pos, after: await evaluate(cdp, probeInfo) };
    });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'key') {
    const r = await withCdp(async function (cdp) {
      const keys = String(flags.keys || '').split('+');
      const mods = keys.slice(0, -1).map(function (k) { return k === 'ctrl' ? 2 : k === 'alt' ? 1 : k === 'shift' ? 8 : k === 'meta' ? 4 : 0; }).reduce(function (a, b) { return a | b; }, 0);
      const key = keys[keys.length - 1];
      const codeMap = { Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ArrowDown: 'ArrowDown', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ' ': 'Space' };
      const code = codeMap[key] || ('Key' + key.toUpperCase());
      const vk = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, ' ': 32 }[key] || key.toUpperCase().charCodeAt(0);
      const base = { modifiers: mods, key: key, code: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: key.length === 1 && mods === 0 ? key : undefined };
      await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base));
      await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
      await new Promise(function (r2) { setTimeout(r2, Number(flags.wait || 900)); });
      return { keys: keys, after: await evaluate(cdp, probeInfo) };
    });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'blocks') {
    const r = await withCdp(function (cdp) {
      return evaluate(cdp, probeBlocks, { root: flags.root && flags.root !== true ? String(flags.root) : null, minArea: Number(flags.minArea || 400) });
    });
    const p2 = writeJson((flags.name || 'blocks') + '.json', r);
    console.log(p2 + '  blocks=' + r.count);
  } else if (cmd === 'shot') {
    await withCdp(async function (cdp) {
      // Page.bringToFront would activate the OS window and steal focus, which the user forbade.
      // The shell paints transparent surfaces (--codex-window-type=electron leaves body/html
      // background transparent; the visible colour comes from BrowserWindow.backgroundColor,
      // which equals --app-color-background-shell = rgb(40,40,40)). Fill it in explicitly so
      // the PNG is not transparent-white.
      // The Electron shell paints body/html transparent; the visible colour comes from
      // BrowserWindow.backgroundColor = --app-color-background-shell = rgb(40,40,40).
      // setDefaultBackgroundColorOverride alone still yields alpha pixels with fromSurface,
      // so paint the colour onto html/body for the duration of the grab and restore after.
      const useBg = !!(flags.bg && flags.bg !== true);
      const bg = useBg ? String(flags.bg).split(',').map(Number) : null;
      if (useBg) {
        await evaluate(cdp, function (c) {
          const h = document.documentElement, b = document.body;
          window.__prevShotBg = { h: h.style.background, b: b ? b.style.background : null };
          h.style.background = c;
          if (b) b.style.background = c;
          return true;
        }, 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')');
        await new Promise(function (r) { setTimeout(r, 400); });
      }
      await new Promise(function (r) { setTimeout(r, 250); });
      const params = { format: 'png', fromSurface: flags.fromSurface !== 'false', captureBeyondViewport: flags.beyond === 'true' };
      if (flags.clip && flags.clip !== true) {
        const c = String(flags.clip).split(',').map(Number);
        params.clip = { x: c[0], y: c[1], width: c[2], height: c[3], scale: Number(flags.scale || 1) };
      } else if (flags.scale) {
        params.clip = { x: 0, y: 0, width: 0, height: 0, scale: Number(flags.scale) };
        delete params.clip;
      }
      const res = await cdp.send('Page.captureScreenshot', params);
      const p = flags.out && flags.out !== true ? flags.out : path.join(REPO, 'evidence', 'codex-desktop', 'screenshots', 'shot.png');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
      if (useBg) {
        await evaluate(cdp, function () {
          const prev = window.__prevShotBg || {};
          document.documentElement.style.background = prev.h || '';
          if (document.body) document.body.style.background = prev.b || '';
          delete window.__prevShotBg;
          return true;
        });
      }
      console.log(p);
    });
  } else {
    console.log('用法: node capture.mjs <ping|info|tokens|tree|view|views|eval|click|key|shot> [--port 9222] [--out DIR]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error('FAILED: ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
}
