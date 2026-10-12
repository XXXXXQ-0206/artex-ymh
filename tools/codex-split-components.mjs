
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const outDir = process.argv[3];
const css = fs.readFileSync(src, 'utf8');

// 顶层规则解析（处理嵌套 @media/@supports/@layer）
function parseRules(text) {
  const out = [];
  let i = 0, start = 0, stack = [], inStr = null;
  while (i < text.length) {
    const c = text[i];
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === '{') { stack.push(text.slice(start, i).trim()); start = i + 1; i++; continue; }
    if (c === '}') { const body = text.slice(start, i); const sel = stack.pop() || ''; out.push({ sel, body, parents: stack.slice() }); start = i + 1; i++; continue; }
    i++;
  }
  return out;
}

const rules = parseRules(css);
console.log('总规则数', rules.length);

const GROUPS = {
  shell: ['yl8z4','cpwja','1uxfp','bomwa','11q0v','1aoop','169qv','192x7','uo71q','1hrlq'],
  composer: ['15oep','4w1os','1bdwx','u07j5','1cdoa','97tn8','14r1d','1xdu0','12lxn','1jl81'],
  markdown: ['176oq','snnl5','292xh','ym4jk','1qt3f','1fe33','1ebbz'],
  overlays: ['12y2s','ovjjw','1d00n','b9jvu','1cofb','zsre1','14ans','wvhrh','8f5hs','1rxrl','sm7xw','1mw3n','1crq2','8z3bn','deoic','8mxdx','1hoj5','or5n7','1u6c1','1oxlz','a3okg','fdsqj','eg66f','ubz2o','1bdwx','1q7e3','8iuk0','mjipm','14jtc','g5dvy','uttcz','va20p','vyuj8','jg414','nbx58','ouwj8','tp8lz','77ve5','1ny4d','g5d78','crsxh','1d00n','1hoj5','1mh5o','1t2mv'],
};
const hashOf = (sel) => { const m = sel.match(/_([a-z0-9]{5})_\d+/); return m ? m[1] : null; };

const buckets = {};
for (const g of Object.keys(GROUPS)) buckets[g] = [];
const misc = [];
const keyframes = [];
const fontfaces = [];

const emit = (r) => {
  const tag = r.parents.filter((p) => /^@(media|supports|container|layer)/.test(p));
  let t = r.sel + '{' + r.body + '}';
  for (const p of tag.slice().reverse()) { if (/^@layer/.test(p)) continue; t = p + '{' + t + '}'; }
  return t;
};

for (const r of rules) {
  if (/^@keyframes/.test(r.sel)) { keyframes.push(r.sel + '{' + r.body + '}'); continue; }
  if (/^@font-face/.test(r.sel)) { fontfaces.push('@font-face{' + r.body + '}'); continue; }
  if (/^@/.test(r.sel)) continue;
  const h = hashOf(r.sel);
  let placed = false;
  if (h) {
    for (const [g, hs] of Object.entries(GROUPS)) {
      if (hs.includes(h)) { buckets[g].push(emit(r)); placed = true; break; }
    }
  }
  if (!placed) {
    // 无哈希的工具类规则：只有出现组件类名才收进 misc
    if (/_([a-z0-9]{5})_\d+/.test(r.sel)) misc.push(emit(r));
  }
}

fs.mkdirSync(outDir, { recursive: true });
const header = (title, note) => '/* ============================================================================\n * ' + title + '\n * ' + note + '\n * 来源：OpenAI Codex Desktop 解包渲染层样式表（用户已授权直接复制进本仓库）\n *   src/renderer/assets/app-initial-c43288484373.css\n * 本文件为**官方规则原文**，按 CSS-module 哈希分组抽离，未做任何改写。\n * ========================================================================== */\n\n';

for (const [g, list] of Object.entries(buckets)) {
  const f = path.join(outDir, g + '.css');
  fs.writeFileSync(f, header(g + '.css', '组件族：' + GROUPS[g].join(', ')) + list.join('\n'), 'utf8');
  console.log(g.padEnd(10), list.length, 'rules ->', (fs.statSync(f).size/1024).toFixed(1) + 'KB');
}
fs.writeFileSync(path.join(outDir, 'keyframes.css'), '/* Codex 官方 @keyframes 原文（组件动画依赖） */\n\n' + keyframes.join('\n'), 'utf8');
console.log('keyframes', keyframes.length);
if (misc.length) { fs.writeFileSync(path.join(outDir, 'misc-components.css'), '/* 未归类的 CSS-module 规则 */\n\n' + misc.join('\n'), 'utf8'); console.log('misc', misc.length); }
console.log('fontfaces', fontfaces.length);