// 壳产物（codex-desktop-src 的 dist）的本地静态服务器。
//
// 为什么需要它：壳是 Vite 单页应用（BrowserRouter），Electron 里直接 loadFile 会
// 让 /artex 这类深路由 404，而且它的 CSP / 访客 iframe 都按 http(s) 源设计。
// 所以在主进程里起一个只监听回环的极简服务器：
//   · 命中文件就发文件（带正确 MIME）；
//   · 其它路径回落 index.html（SPA 深链接）；
//   · 只绑 127.0.0.1、不带目录穿越。
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

/**
 * @param {string} root 壳产物目录（含 index.html）
 * @returns {Promise<{ port: number, close: () => void }>}
 */
function startShellServer(root) {
  const indexFile = path.join(root, "index.html");
  const serve = (res, file) => {
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent((req.url ?? "/").split("?")[0].split("#")[0]);
    } catch {
      res.writeHead(400).end("bad request");
      return;
    }
    const abs = path.resolve(root, rel.replace(/^\/+/, ""));
    if (abs.startsWith(root)) {
      try {
        if (fs.statSync(abs).isFile()) return serve(res, abs);
      } catch {
        /* 落回 index.html */
      }
    }
    // SPA：深链接（/artex、/settings/…）一律回 index.html
    serve(res, indexFile);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // 端口交给系统分配（0），避免与用户机器上别的东西撞端口
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ port, close: () => server.close() });
    });
  });
}

module.exports = { startShellServer };
