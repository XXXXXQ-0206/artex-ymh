#!/usr/bin/env node
/**
 * resolve-tokens.mjs - merge the static official-CSS token dump with the live computed values
 * from the running reference app, and emit a single table where every row carries BOTH
 *   - the effective runtime value (authored value after @supports / theme / inline-style overrides)
 *   - the static declaration site (file:line into captures/css-pretty/*.css)
 * plus an explicit note when the runtime value differs from the static one, which is exactly
 * where a naive copy of the CSS would get the replica wrong.
 *
 * Usage: node tools/codex-ref/resolve-tokens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CAP = path.join(REPO, 'evidence', 'codex-desktop', 'captures');
const stat = JSON.parse(fs.readFileSync(path.join(CAP, 'tokens.json'), 'utf8'));
const rtPath = path.join(CAP, 'tokens.runtime.json');
const rt = fs.existsSync(rtPath) ? JSON.parse(fs.readFileSync(rtPath, 'utf8')) : null;
const runtime = rt ? rt.runtime.tokens : {};
const GROUPS = [
  ['间距', /^--spacing/],
  ['圆角', /^--radius/],
  ['圆角形状', /corner/i],
  ['高度', /^--height/],
  ['对话框 dialog', /^--dialog-/],
  ['菜单 menu', /^--menu-/],
  ['模态 modal', /^--modal-/],
  ['气泡 popover', /^--popover-/],
  ['提示 tooltip', /^--tooltip-/],
  ['动效缓动', /^--cubic-|^--ease-/],
  ['动效时长', /^--transition-duration|^--default-transition-duration|^--animation-duration|^--modal-(enter|exit)-duration/],
  ['阴影', /^--shadow/],
  ['模糊', /^--blur-/],
  ['字号 font-text-*', /^--font-text-.*-(size|line-height|weight|tracking)$/],
  ['字号 text-* (Tailwind)', /^--text-[a-z0-9]+(-\-.*)?$/],
  ['字重/字距', /^--font-weight-|^--tracking-/],
  ['语义色', /^--color-(text|background|border|surface)/],
  ['灰阶', /^--gray-/],
  ['透明阶', /^--alpha-/],
  ['侧栏', /sidebar/],
  ['滚动条', /scrollbar/],
  ['应用外壳', /^--app-shell-/],
];
const rows = [];
const seen = new Set();
for (const [label, re] of GROUPS) {
  const names = Object.keys(stat.definitions).filter((n) => re.test(n)).sort();
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    const defs = stat.definitions[n];
    const root = stat.rootTokens[n] || {};
    const rtv = runtime[n];
    const staticEffective = root.effective;
    rows.push({
      group: label, token: n,
      runtime: rtv === undefined ? null : rtv,
      staticEffective: staticEffective === undefined ? null : staticEffective,
      effectiveSource: root.effectiveSource || (defs[0] ? defs[0].file + ':' + defs[0].line : null),
      kind: (function () {
        if (rtv === undefined) return 'no-runtime';
        if (staticEffective === undefined) return 'runtime-only';
        if (rtv === staticEffective) return 'identical';
        const fn = (s) => /var\(|calc\(|color-mix\(|lightningcss/.test(String(s || ''));
        if (!fn(staticEffective) && !fn(rtv)) return 'literal-override';
        if (fn(staticEffective) && !fn(rtv)) return 'resolved';
        if (fn(staticEffective) && fn(rtv)) return 'formula-both';
        return 'override';
      })(),

      definitions: defs,
    });
  }
}
const out = {
  generatedAt: new Date().toISOString(),
  generator: 'tools/codex-ref/resolve-tokens.mjs',
  note: 'runtime = 参考端 getComputedStyle(document.documentElement) 实测生效值（含 @supports / 主题 / JS inline style 覆盖）；staticEffective = 官方 CSS 里 :root 级别的最后一条声明；overridden=true 表示两者不同，照抄静态 CSS 会错。',
  runtimeAvailable: !!rt,
  runtimeInfo: rt ? rt.info : null,
  count: rows.length,
  kindCounts: rows.reduce((a, r) => { a[r.kind] = (a[r.kind] || 0) + 1; return a; }, {}),

  rows: rows,
};
fs.writeFileSync(path.join(CAP, 'tokens.resolved.json'), JSON.stringify(out, null, 2));
const md = [];
md.push('# Codex Desktop token 对照表（运行时实测 vs 官方 CSS 原文）');
md.push('');
md.push('生成器 `tools/codex-ref/resolve-tokens.mjs`，' + out.generatedAt);
md.push('');
md.push('- `runtime` = 参考端实测生效值（`getComputedStyle(document.documentElement)`，1280x816 / dpr1.5 / dark）');
md.push('- `静态出处` = 官方 CSS 确定性美化后的 `captures/css-pretty/<label>.css` 行号');
md.push('- ⚠️ = `literal-override` / `override`：两边都是字面量却不同，说明被 @supports / `[data-codex-window-type]` / JS inline style 真正覆盖，**照抄官方 CSS 会错**');
md.push('- `resolved` = 静态是 `var()/calc()/color-mix()` 公式，runtime 是代入后的结果（正常，不算覆盖）');
md.push('');
md.push('共 ' + out.count + ' 条。分类统计: `' + JSON.stringify(out.kindCounts) + '`');
md.push('');
let cur = null;
for (const r of rows) {
  if (r.group !== cur) { cur = r.group; md.push(''); md.push('## ' + cur); md.push(''); md.push('| token | runtime 实测 | 静态原文 | 出处 | 差异 |'); md.push('|---|---|---|---|---|'); }
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/\|/g, '\\|');
  md.push('| `' + r.token + '` | ' + ((r.kind === 'literal-override' || r.kind === 'override') ? '⚠️ ' : '') + '`' + esc(r.runtime) + '` | `' + esc(r.staticEffective) + '` | ' + r.effectiveSource + ' |');
}
fs.writeFileSync(path.join(CAP, 'tokens.resolved.md'), md.join('\n'));
console.log(JSON.stringify({ out: path.join(CAP, 'tokens.resolved.json'), rows: out.count, kinds: out.kindCounts, runtimeAvailable: out.runtimeAvailable }, null, 2));