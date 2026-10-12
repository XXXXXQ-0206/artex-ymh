#!/usr/bin/env node
// Lead 自用极简 CDP 量测器
//   node tools/codex-measure.mjs <port> <expr|exprFile> [--nav url] [--wait ms]
// 用 node:http 而不是 fetch —— 本机环境设了 HTTP 代理，fetch 会被 EnvHttpProxyAgent 劫持而挂住。
import fs from "node:fs";
import http from "node:http";

const port = process.argv[2] ?? "9223";
const exprArg = process.argv[3];
const navIdx = process.argv.indexOf("--nav");
const nav = navIdx > 0 ? process.argv[navIdx + 1] : null;
const waitIdx = process.argv.indexOf("--wait");
const wait = waitIdx > 0 ? Number(process.argv[waitIdx + 1]) : 3000;
const expr = exprArg && fs.existsSync(exprArg) ? fs.readFileSync(exprArg, "utf8") : exprArg;

const getJson = (pathname) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname, timeout: 8000 }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => resolve(JSON.parse(b)));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });

const list = (await getJson("/json/list")).filter((t) => t.type === "page");
if (!list.length) { console.error("no page target on " + port); process.exit(1); }
const target = list[0];

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error("ws error")); });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};

if (nav) { await send("Page.enable"); await send("Page.navigate", { url: nav }); await new Promise((r) => setTimeout(r, wait)); }

const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
if (res.exceptionDetails) { console.error("EXCEPTION: " + JSON.stringify(res.exceptionDetails).slice(0, 2000)); process.exit(2); }
const v = res.result.value;
console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
ws.close();
process.exit(0);
