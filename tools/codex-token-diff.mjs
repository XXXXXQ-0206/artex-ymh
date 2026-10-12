#!/usr/bin/env node
// 令牌级一致性验证 v2：ARTEX 运行时 token vs 参考端 tokens.runtime.json
//   node tools/codex-token-diff.mjs [--port 9333] [--ref <tokens.runtime.json>] [--out <report.json>]
//
// v2 的关键改进：**规范化后比较**，而不是字符串比较。
// 同一个值在 CSS 里可以有多种等价写法（lab(100% 0 0/.042) == rgba(255,255,255,.042)；
// .75rem == 12px；calc(.25rem*1.25) == 5px）。做法是把两边的值都丢进浏览器里
// 用真实 CSS 引擎求值：能当颜色就取 computed color，能当长度就取 computed px，
// 否则退回字符串归一化。这样的一致性数字才可信。
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9333");
const refPath = arg("--ref", "C:/artex-ymh/evidence/codex-desktop/captures/tokens.runtime.json");
const outPath = arg("--out", "C:/artex-ymh/evidence/codex-desktop/verify/token-diff.json");

const ref = JSON.parse(fs.readFileSync(refPath, "utf8"));
const refTokens = (ref.runtime && ref.runtime.tokens) || ref.tokens || {};

const CORE = [
  "--radius-", "--spacing", "--corner-radius-scale", "--codex-corner-shape",
  "--color-surface", "--color-text", "--color-border", "--color-background", "--color-token-border",
  "--gray-", "--blue-", "--red-", "--green-", "--orange-", "--yellow-", "--purple-", "--white", "--black",
  "--font-", "--text-", "--tracking-", "--blur-",
  "--cubic-", "--transition-duration", "--ease-", "--animate-",
  "--shadow", "--elevation-",
  "--menu-", "--dialog-", "--modal-", "--popover-", "--tooltip-", "--alert-",
  "--composer-", "--thread-", "--home-",
  "--height-", "--padding-", "--control-", "--alpha-", "--app-shell-", "--app-color-",
];
const isCore = (k) => CORE.some((p) => k.startsWith(p));
const coreRef = Object.fromEntries(Object.entries(refTokens).filter(([k]) => isCore(k)));
const names = Object.keys(coreRef);

const getJson = (p) => new Promise((res, rej) => {
  const rq = http.get({ host: "127.0.0.1", port, path: p, timeout: 8000 }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); });
  rq.on("error", rej); rq.on("timeout", () => rq.destroy(new Error("timeout")));
});

const list = (await getJson("/json/list")).filter((t) => t.type === "page");
if (!list.length) { console.error("no page target on " + port); process.exit(1); }
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };

const tpl = fs.readFileSync(fileURLToPath(new URL("./codex-token-page.js", import.meta.url)), "utf8");
const PAGE = tpl.replace("__NAMES__", JSON.stringify(names)).replace("__EXPECTED__", JSON.stringify(coreRef));

const ev = await send("Runtime.evaluate", { expression: PAGE, returnByValue: true, awaitPromise: true });
if (ev.exceptionDetails) { console.error(JSON.stringify(ev.exceptionDetails).slice(0, 1500)); process.exit(2); }
const rows = JSON.parse(ev.result.value);

const pass = rows.filter((r) => r.ok).length;
const fail = rows.length - pass;
const report = {
  generatedAt: new Date().toISOString(),
  comparator: "browser-canonicalized: color->computed rgb, length->computed px, else normalized string",
  port, refFile: refPath,
  refHref: ref.info?.href,
  refViewport: [ref.info?.innerWidth, ref.info?.innerHeight],
  total: rows.length, pass, fail,
  passRate: rows.length ? +(pass / rows.length).toFixed(4) : 0,
  mismatches: rows.filter((r) => !r.ok),
};
fs.mkdirSync(outPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

console.log("== ARTEX vs 参考端 · 核心 token 一致性（规范化后比较）==");
console.log("对照 " + rows.length + " 条 | 一致 " + pass + " | 不一致 " + fail + " | 一致率 " + (report.passRate * 100).toFixed(2) + "%");
if (fail) {
  const byPrefix = {};
  for (const r of report.mismatches) { const k = r.token.split("-").slice(0, 3).join("-"); byPrefix[k] = (byPrefix[k] || 0) + 1; }
  console.log("");
  console.log("-- 不一致 TOP 前缀 --");
  for (const [k, v] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log("  " + String(v).padStart(3) + "  " + k);
  console.log("");
  console.log("-- 明细（最多 40 条）--");
  for (const r of report.mismatches.slice(0, 40)) console.log("  " + r.token + "\n      参考: " + r.expected + "\n      ARTEX: " + (r.actual || "(未定义)"));
}
console.log("");
console.log("报告 -> " + outPath);
ws.close(); process.exit(0);
