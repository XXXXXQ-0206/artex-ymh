
import fs from 'node:fs';
import path from 'node:path';
const src = process.argv[2];
const out = process.argv[3];
const css = fs.readFileSync(src, 'utf8');
function parseRules(text) {
  const res = []; let i = 0, start = 0, stack = [], inStr = null;
  while (i < text.length) {
    const c = text[i];
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === '{') { stack.push(text.slice(start, i).trim()); start = i + 1; i++; continue; }
    if (c === '}') { const body = text.slice(start, i); const sel = stack.pop() || ''; res.push({ sel, body, parents: stack.slice() }); start = i + 1; i++; continue; }
    i++;
  }
  return res;
}
const rules = parseRules(css);
const emit = (r) => {
  const tag = r.parents.filter((p) => /^@(media|supports|container|layer)/.test(p));
  let t = r.sel + '{' + r.body + '}';
  for (const p of tag.slice().reverse()) { if (/^@layer/.test(p)) continue; t = p + '{' + t + '}'; }
  return t;
};
const hashed = [];
const kf = [];
for (const r of rules) {
  if (/^@keyframes/.test(r.sel)) { kf.push(r.sel + '{' + r.body + '}'); continue; }
  if (/^@/.test(r.sel)) continue;
  if (/_([a-z0-9]{5})_\d+/.test(r.sel) || /\[data-slot=/.test(r.sel) && false) hashed.push(emit(r));
}
const header = '/* ============================================================================\n * Codex 官方**共享组件**样式（原样搬用，用户已授权）\n * 来源：codex-desktop-electron/src/renderer/assets/app-shared-f2d570e85ceb.css\n *\n * 这一层是 app-initial 之外、被各组件共同依赖的原语，最重要的是：\n *   _Button_eg66f_2 / _ButtonInner_eg66f_2 / _ButtonLoader_eg66f_2\n *     —— 通用按钮原语（导轨按钮、面板头图标按钮、顶栏图标按钮、x-chat/x-overlays 的所有按钮）\n *   通过 [data-size=\"3xs\"|\"2xs\"|…] 派生 --button-size / --button-gutter / --button-radius / --button-icon-size\n *\n * 依赖的 --control-size-* / --control-gutter-* / --radius-* / --color-* 均已在\n * web/src/styles/codex/official-tokens.css 中提供。\n * ========================================================================== */\n\n';
fs.writeFileSync(out, header + hashed.join('\n'), 'utf8');
console.log('hashed rules', hashed.length, '->', (fs.statSync(out).size/1024).toFixed(1)+'KB', '| keyframes', kf.length);
// 报告包含哪些组件族
const groups = new Map();
for (const r of hashed) { const m = [...r.matchAll(/_([A-Za-z0-9]+)_([a-z0-9]{5})_/g)]; for (const x of m) { if (!groups.has(x[2])) groups.set(x[2], new Set()); groups.get(x[2]).add(x[1]); } }
for (const [h, names] of [...groups.entries()].sort((a,b)=>b[1].size-a[1].size).slice(0, 12)) console.log('  .' + h, '(' + names.size + '):', [...names].slice(0,8).join(', '));