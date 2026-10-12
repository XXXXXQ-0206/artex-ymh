#!/usr/bin/env node
/**
 * extract-tokens.mjs - 从 Codex Desktop 官方渲染层 CSS 提取 design token。
 *
 * 为什么需要它：官方 CSS 是 1.2MB 单行压缩文件（2 行），无法直接读进上下文。
 * 本脚本把每个 CSS 文件「确定性美化」成一行一条声明，再做解析，
 * 于是每个 token 都能给出可复现的 <文件>:<行号> 出处。
 *
 * 用法: node tools/codex-ref/extract-tokens.mjs [--out <dir>] [--ref-root <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const REF_ROOT = arg('ref-root',
  'C:\\Users\\熊骞\\Documents\\Codex\\2026-10-09\\codex-desktop-unpack\\outputs\\codex-desktop-electron');
const WEBVIEW_ROOT = arg('webview-root',
  'D:\\文件\\学习\\大三下\\美术鉴赏与艺术体验\\demo-web\\public\\codex-webview');
const OUT = arg('out', path.join(REPO, 'evidence', 'codex-desktop', 'captures'));

const SOURCES = [
  { label: 'shell-shared', file: path.join(REF_ROOT, 'src/renderer/assets/app-shared-f2d570e85ceb.css') },
  { label: 'shell-primary', file: path.join(REF_ROOT, 'src/renderer/assets/app-primary-c7f956fe5bad.css') },
  { label: 'shell-initial', file: path.join(REF_ROOT, 'src/renderer/assets/app-initial-c43288484373.css') },
  { label: 'webview', file: path.join(WEBVIEW_ROOT, 'assets/index-B8iKrQC-.css') },
];

/* 1. 确定性美化：一行一条声明 / 一条选择器 */
function prettify(css) {
  const out = [];
  let depth = 0;
  let i = 0;
  const n = css.length;
  let lastNL = true;
  const pad = () => '  '.repeat(Math.max(0, depth));
  const push = (s) => { out.push(s); lastNL = false; };
  const nl = () => {
    while (out.length && /[ \t]$/.test(out[out.length - 1])) out.pop();
    if (!lastNL) { out.push('\n'); lastNL = true; }
  };
  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (css[j] === '\\') { j += 2; continue; }
        if (css[j] === ch) { j++; break; }
        j++;
      }
      push(css.slice(i, j));
      i = j;
      continue;
    }
    if ((ch === 'u' || ch === 'U') && /^url\(/i.test(css.slice(i, i + 4))) {
      let j = i + 4, d = 1;
      while (j < n && d > 0) {
        if (css[j] === '\\') { j += 2; continue; }
        if (css[j] === '(') d++;
        else if (css[j] === ')') d--;
        j++;
      }
      push(css.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '{') { push('{'); depth++; nl(); push(pad()); i++; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); nl(); push(pad() + '}'); nl(); push(pad()); i++; continue; }
    if (ch === ';') { push(';'); nl(); push(pad()); i++; continue; }
    if (ch === '\n' || ch === '\r') { i++; continue; }
    push(ch);
    i++;
  }
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* 2. 解析美化后的 CSS */
function parseRules(pretty) {
  const lines = pretty.split('\n');
  const rules = [];
  const stack = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const t = lines[idx].trim();
    if (!t) continue;
    if (t === '}') { stack.pop(); continue; }
    if (t.endsWith('{')) { stack.push(t.slice(0, -1).trim()); continue; }
    if (t.startsWith('@')) continue; // 无块 at-rule（@import / @charset 等）
    const body = t.endsWith(';') ? t.slice(0, -1) : t;
    const colon = body.indexOf(':');
    if (colon < 0) continue;
    const prop = body.slice(0, colon).trim();
    const value = body.slice(colon + 1).trim();
    const selectors = stack.length ? stack[stack.length - 1] : '';
    const context = stack.slice(0, -1).join(' | ');
    let rule = null;
    for (let k = rules.length - 1; k >= 0; k--) {
      if (rules[k].selectors === selectors && rules[k].context === context) { rule = rules[k]; break; }
      if (rules[k].line < lineNo - 1) break;
    }
    if (!rule) { rule = { selectors: selectors, context: context, decls: [], line: lineNo }; rules.push(rule); }
    rule.decls.push({ prop: prop, value: value, line: lineNo });
  }
  return rules;
}

/* 3. 分类 */
const CATEGORIES = [
  ['spacing', /^--spacing/],
  ['radius', /^--radius/],
  ['corner-shape', /corner/i],
  ['height', /^--height/],
  ['width', /^--width/],
  ['size', /^--size/],
  ['dialog', /dialog/i],
  ['menu', /menu/i],
  ['modal', /modal/i],
  ['popover', /popover/i],
  ['tooltip', /tooltip/i],
  ['toast', /toast/i],
  ['font-family', /^--font-(sans|serif|mono|text|display|codex|ui)/],
  ['font-size', /(^--(text|font)[a-z0-9-]*(size|line-height))|(^--text-)/],
  ['font-weight', /font-weight|^--weight/],
  ['easing', /cubic|ease|--easing/],
  ['duration', /duration|^--animate/],
  ['transition', /^--transition/],
  ['shadow', /shadow|elevation|blur/],
  ['layout-metric', /thread-content-max-width|--app-shell|gutter|inset|content-width|max-width/],
  ['color-app', /^--app-color/],
  ['color-scale', /^--color-|^--gray-|^--alpha-|^--slate-|^--zinc-|^--neutral-|^--stone-/],
  ['color-semantic', /^--(background|foreground|border|input|ring|primary|secondary|accent|destructive|muted|card|popover)-/],
  ['sidebar', /sidebar/],
  ['scrollbar', /scrollbar/],
  ['z-index', /^--z-/],
];
function categorize(name) {
  const hit = [];
  for (const c of CATEGORIES) if (c[1].test(name)) hit.push(c[0]);
  return hit.length ? hit : ['other'];
}

/* main */
fs.mkdirSync(path.join(OUT, 'css-pretty'), { recursive: true });
const sources = [];
const allTokens = new Map();
for (const src of SOURCES) {
  if (!fs.existsSync(src.file)) { sources.push({ label: src.label, file: src.file, exists: false }); continue; }
  const raw = fs.readFileSync(src.file, 'utf8');
  const sha = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const pretty = prettify(raw);
  const prettyPath = path.join(OUT, 'css-pretty', src.label + '.css');
  fs.writeFileSync(prettyPath, pretty);
  const rules = parseRules(pretty);
  let declCount = 0;
  for (const r of rules) {
    for (const d of r.decls) {
      declCount++;
      if (d.prop.indexOf('--') !== 0) continue;
      if (!allTokens.has(d.prop)) allTokens.set(d.prop, []);
      allTokens.get(d.prop).push({ value: d.value, line: d.line, selectors: r.selectors, context: r.context, label: src.label, file: src.file });
    }
  }
  sources.push({ label: src.label, file: src.file, exists: true, bytes: raw.length, sha256_16: sha,
    prettyFile: path.relative(REPO, prettyPath).replace(/\\/g, '/'), prettyLines: pretty.split('\n').length, rules: rules.length, declarations: declCount });
}

const rootTokens = {};
for (const [name, defs] of allTokens) {
  const roots = defs.filter((d) => /^(:root|html)$/.test(d.selectors.trim()));
  const pick = (roots.length ? roots : defs).slice().sort((a, b) => a.line - b.line);
  const last = pick[pick.length - 1];
  rootTokens[name] = {
    effective: last.value,
    effectiveSource: last.label + ':' + last.line,
    definitions: pick.map((d) => ({ value: d.value, line: d.line, selectors: d.selectors, label: d.label })),
    totalDefinitions: defs.length,
    inRoot: roots.length > 0,
  };
}

const categories = {};
for (const c of CATEGORIES) categories[c[0]] = [];
categories['other'] = [];
for (const [name] of allTokens) for (const cat of categorize(name)) categories[cat].push(name);
for (const k of Object.keys(categories)) categories[k].sort();

const tokensJson = {
  generatedAt: new Date().toISOString(),
  generator: 'tools/codex-ref/extract-tokens.mjs',
  refRoot: REF_ROOT,
  sources: sources,
  totalUniqueTokens: allTokens.size,
  categoryIndex: categories,
  rootTokens: rootTokens,
  definitions: Object.fromEntries([...allTokens.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((kv) => [kv[0], kv[1].map((d) => ({ value: d.value, file: d.label, line: d.line, selectors: d.selectors, context: d.context }))])),
};
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify(tokensJson, null, 2));

const WANT = ['spacing','radius','corner-shape','height','width','size','dialog','menu','modal','popover','tooltip','toast','font-family','font-size','font-weight','easing','duration','transition','shadow','layout-metric','sidebar','scrollbar','z-index'];
const md = [];
md.push('# Codex Desktop 官方 CSS design token（自动生成，勿手改）');
md.push('');
md.push('生成器: tools/codex-ref/extract-tokens.mjs - ' + tokensJson.generatedAt);
md.push('');
md.push('| 源文件 | 字节 | sha256(16) | 美化后行数 | 规则数 | 声明数 |');
md.push('|---|---|---|---|---|---|');
for (const s of sources) {
  md.push('| ' + (s.exists ? s.file : s.file + ' (MISSING)') + ' | ' + (s.bytes || '-') + ' | ' + (s.sha256_16 || '-') + ' | ' + (s.prettyLines || '-') + ' | ' + (s.rules || '-') + ' | ' + (s.declarations || '-') + ' |');
}
md.push('');
md.push('唯一 token 总数: **' + tokensJson.totalUniqueTokens + '**');
md.push('');
md.push('> 出处写法 label:line 指向 captures/css-pretty/<label>.css 的行号（该文件由官方 CSS 确定性美化而来，可重跑复算）。');
md.push('');
for (const cat of WANT) {
  const names = categories[cat] || [];
  if (!names.length) continue;
  md.push('## ' + cat + ' (' + names.length + ')');
  md.push('');
  md.push('| token | 生效值 | 出处 | 定义数 |');
  md.push('|---|---|---|---|');
  for (const nm of names) {
    const r = rootTokens[nm];
    let v = (r.effective || '').replace(/\|/g, '\\|');
    if (v.length > 160) v = v.slice(0, 160) + '...';
    md.push('| `' + nm + '` | `' + v + '` | ' + r.effectiveSource + ' | ' + r.totalDefinitions + ' |');
  }
  md.push('');
}
fs.writeFileSync(path.join(OUT, 'tokens.generated.md'), md.join('\n'));

console.log(JSON.stringify({ out: OUT, sources: sources.map((s) => ({ label: s.label, exists: s.exists, bytes: s.bytes, prettyLines: s.prettyLines, rules: s.rules })), uniqueTokens: tokensJson.totalUniqueTokens, categoryCounts: Object.fromEntries(Object.entries(categories).map((kv) => [kv[0], kv[1].length])) }, null, 2));
