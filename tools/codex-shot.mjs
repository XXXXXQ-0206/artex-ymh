#!/usr/bin/env node
// 截图：node tools/codex-shot.mjs <port> <out.png> [--nav url] [--wait ms] [--scale 1]
import fs from "node:fs";
import http from "node:http";

const port = process.argv[2];
const out = process.argv[3];
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const nav = arg("--nav", null);
const wait = Number(arg("--wait", 6000));
const scale = Number(arg("--scale", 0));

const getJson = (p) => new Promise((res, rej) => {
  const rq = http.get({ host: "127.0.0.1", port, path: p, timeout: 8000 }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); });
  rq.on("error", rej); rq.on("timeout", () => rq.destroy(new Error("timeout")));
});

const list = (await getJson("/json/list")).filter((t) => t.type === "page");
if (!list.length) { console.error("no page"); process.exit(1); }
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };

await send("Page.enable");
if (nav) { await send("Page.navigate", { url: nav }); await new Promise((r) => setTimeout(r, wait)); }
else { await new Promise((r) => setTimeout(r, 800)); }

if (scale > 0) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 816, deviceScaleFactor: scale, mobile: false });
  await new Promise((r) => setTimeout(r, 900));
}
try { await send("Page.bringToFront"); } catch {}
await new Promise((r) => setTimeout(r, 600));
const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("CDP timeout: " + tag)), ms))]);
const r = await withTimeout(send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }), 25000, "captureScreenshot");
fs.writeFileSync(out, Buffer.from(r.data, "base64"));
const info = await send("Runtime.evaluate", { expression: "JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,url:location.href})", returnByValue: true });
console.log("shot -> " + out + " " + info.result.value);
ws.close(); process.exit(0);
