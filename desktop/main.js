// ARTEX 桌面端（Electron 外壳）——参考 dsh-desktop 的组织方式：
//   主进程负责拉起本机后端 + 一个窗口展示**界面** + 托盘图标，单实例。
// 语义与托盘启动器一致：托盘图标存在 ⇔ ARTEX 在跑；退出时回收后端（只停自己拉起的库）。
//
// 界面 = **codex 壳**（codex-desktop-src 的构建产物，见 desktop/shell/）：
//   壳提供顶栏/导轨/288 面板/圆角主表面与它自己的页面；ARTEX 控制台作为**被托管的访客**
//   用 iframe 挂在壳的 /artex 路由里（协议见 web/src/codex-host/）。
//   本进程只做三件事：抬起后端、把壳的静态产物用一个回环静态服务器喂给窗口、托盘与回收。
const { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, session, shell, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const backend = require("./lib/backend");
const { startShellServer } = require("./lib/shell-server");

const CONSOLE_URL = "http://127.0.0.1:8787/"; // 控制台（访客）
const SHELL_DIR = path.join(__dirname, "shell"); // codex 壳产物（构建期从 codex-desktop-src 同步）
let shellServer = null;
let URL = CONSOLE_URL; // 壳起来之后换成 http://127.0.0.1:<port>/artex?artex=<控制台>
const SILENT = process.argv.includes("--silent"); // 开机自启：只亮托盘，不弹窗
const ICON_RUNNING = path.join(__dirname, "assets", "artex_running.ico");
const ICON_STOPPED = path.join(__dirname, "assets", "artex_stopped.ico");

let win = null;
let tray = null;
let quitting = false;
let downTicks = 0;
let everUp = false;
let ctrl = null;
let tickTimer = null;

// 主题首帧：桌面端有自己的配置目录（%APPDATA%\ARTEX），拿不到系统浏览器里存的偏好，
// 所以首次运行必须自己播种 —— 否则默认值 light 会让深色系统的用户每次装完都是白屏。
// 用户以后在界面里改过的值优先（存在 theme_mode cookie 里，Electron 会持久化）。
async function seedThemeFromSystem() {
  const url = "http://127.0.0.1:8787/";
  try {
    const ses = session.defaultSession;
    const existing = await ses.cookies.get({ url, name: "theme_mode" });
    if (existing && existing.length > 0) {
      log(`[theme] keep existing theme_mode=${existing[0].value}`);
      return existing[0].value;
    }
    const value = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    await ses.cookies.set({
      url,
      name: "theme_mode",
      value,
      expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    });
    log(`[theme] seeded theme_mode=${value} (systemDark=${nativeTheme.shouldUseDarkColors})`);
    return value;
  } catch (err) {
    log("[theme] seed failed: " + err.message);
    return null;
  }
}

function log(msg) {
  try {
    const dir = path.join(app.getPath("userData"));
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "desktop.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignore */
  }
}

// 起壳：把 codex 壳的静态产物用回环静态服务器喂给窗口，并把窗口 URL 指到壳的 /artex
// （访客 = 本机控制台）。壳缺失/起不来就**回退**成直接开控制台，不让用户白屏。
async function startShell() {
  try {
    if (!fs.existsSync(path.join(SHELL_DIR, "index.html"))) {
      log("[shell] 没有壳产物（desktop/shell），回退到控制台直连");
      return;
    }
    const s = await startShellServer(SHELL_DIR);
    shellServer = s;
    URL = `http://127.0.0.1:${s.port}/artex?artex=${encodeURIComponent(CONSOLE_URL)}`;
    log(`[shell] serving ${SHELL_DIR} on 127.0.0.1:${s.port} → ${URL}`);
  } catch (err) {
    log("[shell] 启动失败，回退到控制台直连：" + err.message);
    URL = CONSOLE_URL;
  }
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    // 与 Codex Desktop 同色：官方主进程窗口底 = 深色 #000000 / 浅色 #f9f9f9
    // （codex-desktop-src electron/windows/window-options.ts 的 OPAQUE_BACKGROUND_* 常量；
    //   页面里导轨/顶栏/外壳 4px 留白露出的就是这层，所以必须与页面配色一致，
    //   否则加载瞬间会先闪一下另一种底色）
    backgroundColor: dark ? "#000000" : "#f9f9f9",
    title: "ARTEX",
    icon: ICON_RUNNING,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // 窗口被遮挡/最小化时 Chromium 会停掉出帧，CDP 截图会挂住。
      // 桌面端本来就常驻托盘，关掉后台节流既符合常驻语义，也让自动化截图稳定。
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => {
    if (!SILENT) win.show();
  });
  for (const ev of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    win.on(ev, pushWindowState);
  }
  // 关窗口 = 收进托盘（与 dsh-desktop 一致），真正退出走托盘菜单
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  // 外链走系统浏览器，不在壳里开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://127.0.0.1:8787")) shell.openExternal(url);
    return { action: "deny" };
  });
  // 自证：页面加载完成后回报实际生效的主题（免得"看起来是浅色"只能靠肉眼判断）
  win.webContents.on("did-finish-load", async () => {
    try {
      const state = await win.webContents.executeJavaScript(
        "({href: location.href, mode: document.documentElement.getAttribute('data-theme-mode'), dark: document.documentElement.classList.contains('dark')})",
        true,
      );
      log("[theme] window state " + JSON.stringify(state));
    } catch (err) {
      log("[theme] probe failed: " + err.message);
    }
  });
  return win;
}

// ── 自绘菜单栏（Codex 的 ApplicationMenuTopBar 是 DOM，不是 Electron 原生菜单）──
// 渲染层通过 preload 暴露的 window.artexDesktop.invoke(action) 调用这里。
function windowState() {
  if (!win || win.isDestroyed()) return { maximized: false, fullscreen: false };
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
}

function pushWindowState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("artex:window-state", windowState());
}

ipcMain.handle("artex:menu", async (_e, action, payload) => {
  if (!win || win.isDestroyed()) return false;
  const wc = win.webContents;
  switch (action) {
    case "state":
      return windowState();
    case "getContentSize": {
      const b = win.getContentBounds();
      return { width: b.width, height: b.height };
    }
    case "setContentSize": {
      const w = Math.round(Number(payload?.width));
      const h = Math.round(Number(payload?.height));
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 320 || h < 240) return false;
      // setContentSize 用 DIP，与 CSS px 1:1，不会踩 DPI 缩放的坑
      win.setContentSize(w, h);
      return true;
    }
    case "reload":
      wc.reload();
      return true;
    case "forceReload":
      wc.reloadIgnoringCache();
      return true;
    case "toggleDevTools":
      wc.toggleDevTools();
      return true;
    case "resetZoom":
      wc.setZoomLevel(0);
      return true;
    case "zoomIn":
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
      return true;
    case "zoomOut":
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
      return true;
    case "toggleFullScreen":
      win.setFullScreen(!win.isFullScreen());
      return true;
    case "minimize":
      win.minimize();
      return true;
    case "maximize":
      win.isMaximized() ? win.unmaximize() : win.maximize();
      return true;
    case "close":
      win.close();
      return true;
    case "restart":
      await restart();
      return true;
    case "about":
      return {
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      };
    case "quit":
      quit();
      return true;
    case "log":
      log("[menu] " + String(payload ?? ""));
      return true;
    default:
      return false;
  }
});

ipcMain.handle("artex:open-external", async (_e, url) => {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (!win.webContents.getURL()) return; // 还没加载，等 OnTick 里加载
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function loadUI() {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.getURL() === URL) return;
  win.loadURL(URL).catch((err) => log("[window] load failed: " + err.message));
}

function rebuildTray(up) {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  const icon = nativeImage.createFromPath(up ? ICON_RUNNING : ICON_STOPPED);
  tray = new Tray(icon);
  tray.setToolTip(up ? "ARTEX 正在运行" : "ARTEX 已停止");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开", click: () => showWindow() },
      { label: "重启", click: () => restart() },
      { type: "separator" },
      { label: "退出", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
  tray.on("double-click", () => showWindow());
}

async function restart() {
  log("[lifecycle] restart requested");
  if (win && !win.isDestroyed()) {
    win.webContents.loadURL("about:blank").catch(() => {});
  }
  ctrl.stop();
  downTicks = 0;
  everUp = false;
  rebuildTray(false);
  const ok = await ctrl.ensureRunning();
  log("[lifecycle] restart backend ok=" + ok);
  if (ok) {
    loadUI();
  }
}

function quit() {
  if (quitting) return;
  quitting = true;
  log("[lifecycle] quit requested");
  try {
    ctrl?.stop();
  } catch (err) {
    log("[lifecycle] stop failed: " + err.message);
  }
  if (tickTimer) clearInterval(tickTimer);
  try {
    shellServer?.close();
  } catch {
    /* 关不掉也不阻塞退出 */
  }
  tray?.destroy();
  tray = null;
  app.quit();
}

async function tick() {
  if (quitting) return;
  const up = await ctrl.isUp();
  if (up) {
    downTicks = 0;
    if (!everUp) {
      everUp = true;
      rebuildTray(true);
      loadUI();
      log("[lifecycle] backend up, window loaded");
    }
  } else {
    if (everUp) {
      downTicks += 1;
      if (downTicks >= 2) {
        // 后端真的没了：按"图标存在 ⇔ ARTEX 在跑"的约定收摊
        log("[lifecycle] backend down twice, quitting");
        quit();
      }
    }
  }
}

// ---- 单实例 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("window-all-closed", (e) => {
    // 托盘常驻：不因关窗退出
    e.preventDefault?.();
  });
  app.on("before-quit", () => {
    quitting = true;
  });

  app.whenReady().then(async () => {
    const execPath = app.isPackaged ? process.execPath : path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
    const installDir = backend.resolveInstallDir(execPath);
    ctrl = backend.createController(installDir, log);
    log(`[boot] installDir=${installDir} silent=${SILENT}`);

    await seedThemeFromSystem();
    await startShell();
    createWindow();
    rebuildTray(false);
    tickTimer = setInterval(tick, 2000);

    const ok = await ctrl.ensureRunning();
    log("[boot] ensureRunning ok=" + ok);
    if (ok) {
      everUp = true;
      rebuildTray(true);
      loadUI();
    } else if (!SILENT) {
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<body style="font:14px system-ui;background:#0b0b0c;color:#e5e5e5;padding:32px">
               <h2>ARTEX 后端没起来</h2>
               <p>找不到 artex.exe，或端口 8787 起不来。</p>
               <p>请确认安装目录（可用 ARTEX_HOME 指定），然后从托盘菜单「重启」。</p>
             </body>`,
          ),
      );
      win.show();
    }
  });
}
