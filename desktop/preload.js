// ARTEX 桌面端 preload：把主进程能力以最小面暴露给渲染层。
// 渲染层据此实现 Codex 式自绘菜单栏（文件/编辑/视图/帮助），在浏览器里则自动降级。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("artexDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  /** 自绘菜单栏用的动作；每个都返回 Promise<boolean> */
  invoke: (action, payload) => ipcRenderer.invoke("artex:menu", action, payload),
  /** 窗口状态变化（最大化/全屏）时通知渲染层刷新菜单勾选态 */
  onWindowState: (cb) => {
    const h = (_e, state) => cb(state);
    ipcRenderer.on("artex:window-state", h);
    return () => ipcRenderer.removeListener("artex:window-state", h);
  },
  openExternal: (url) => ipcRenderer.invoke("artex:open-external", url),
});
