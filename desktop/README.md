# ARTEX 桌面端（Electron）

参考 `dsh-desktop`（DeepSeek Harness 桌面版）的组织方式：Electron 主进程 + 一个窗口展示本机 Web 控制台 +
系统托盘 + 单实例。与 `C:\artex-ymh\launcher`（C# 托盘启动器）的区别只是"UI 在哪"：
启动器用系统浏览器打开，桌面端把 UI 装进窗口并常驻托盘。

## 行为

| 项 | 说明 |
| --- | --- |
| 启动 | 解析安装目录（`ARTEX_HOME` → exe 同级/上级 → `C:\artex-ymh`）→ 按需拉起 PostgreSQL → 拉起 `artex.exe` → 端口 8787 就绪后加载控制台 |
| 托盘 | 图标存在 ⇔ ARTEX 在跑；右键 `打开 / 重启 / 退出`；单击切回窗口；后端停掉后两个心跳周期自动收摊 |
| 窗口 | 关窗 = 收进托盘（不退出）；外链走系统浏览器 |
| 退出 | 停 ARTEX（进程树 + 端口占用者兜底）→ **只停自己拉起的 PostgreSQL** |
| 单实例 | `app.requestSingleInstanceLock()`，第二次启动只是把已有窗口调到前台 |
| 静默自启 | `ARTEX.exe --silent` 只亮托盘、不弹窗 |

## 开发与打包

```powershell
cd C:\artex-ymh\desktop
npm install                    # electron 43.1.0 命中本机缓存 %LOCALAPPDATA%\electron\Cache
npm start                      # 本地跑（热启动）
npm run pack                   # @electron/packager 出 dist\ARTEX-win32-x64\ARTEX.exe
```

产物是自包含的 Electron 应用（约 250 MB，和 dsh-desktop 同级），不再依赖系统浏览器；
如果只想要"极简常驻 + 用浏览器看"，用 `C:\artex-ymh\launcher\dist\ArtexLauncher.exe`（约 0.2 MB、私有内存 11 MB）。

## 为什么是 Electron

`dsh-desktop` 本身就是 Electron（`AppData\Local\Programs\DeepSeek Harness` 下有 `LICENSE.electron.txt`、
`icudtl.dat`、`v8_context_snapshot.bin`，主程序 233 MB）。本机已有 `electron-v43.1.0-win32-x64.zip` 缓存，
照它的形态做，成本最低、行为最接近。

## 界面拓扑（2026-10-13 起：codex 壳托管 ARTEX 控制台）

窗口里装的**不是**控制台本体，而是 **codex 壳**（`codex-desktop-src` 的构建产物，随本目录的 `shell/` 一起提交）
加一个被托管的 ARTEX 控制台 iframe：

| 层 | 由谁画 | 位置（1280×816 实测） |
| --- | --- | --- |
| 窗口留白（右/下 4px） | Electron 窗口底（`setBackgroundColor`） | 右侧/底部各 4px |
| 36px 应用菜单栏（文件/编辑/视图/帮助） | 壳 | `[0,0,1276,36]` |
| 52px 图标导轨（对话/任务/发现/内网 + 底部设置） | 壳（托管档下的条目来自 `RAIL_HOST_ITEMS`） | `[0,44,52,768]` |
| 宿主容器（iframe） | 壳的 `/artex` 路由 | `[52,44,1224,768]` |
| 288px 对话/设置面板、圆角主表面、页面内容 | **被托管的控制台自己画** | 面板 `[52,44,288,768]`、主表面 `[52,44,1224,768]`、主内容面 `[340,44,936,768]` |

壳与访客之间的通道见 `web/src/codex-host/`（协议 v1，postMessage）：
主题下发、访客上报路由/标题、以及**外壳导轨点击 → `codex-host:navigate` → 访客自己的 Next 路由**。
壳侧只保留「窗口 chrome」，把面板与主表面让给访客，是因为控制台面板里的对话列表与设置导航是**真实数据**；
壳再画一层就会得到双层面板 + 嵌套主表面（实测会把 iframe 从 1224 压到 647 宽）。

> 架构口径与验证台见 `codex-desktop-src/docs/HOST-INTEGRATION.md`；壳的托管档在 `src/shell/page-layouts.ts` 的 `HOST` 常量。
