"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { createPortal } from "react-dom";

import { CodexArrowLeft, CodexArrowRight, CodexSidebar, CodexSidebarHidden } from "@/components/icons/codex";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";

/* ============================================================================
 * Codex Desktop 顶部 36px 应用程序菜单栏（R3 · shared shell module）
 *
 * 参考端是 Electron 原生菜单（文件/编辑/视图/帮助），ARTEX 关掉了原生菜单
 * （desktop/main.js: Menu.setApplicationMenu(null)），所以在渲染层 1:1 重画：
 *
 *   参考端 _ApplicationMenuTopBar_  = [0,0,1276,36]，padding 0 0 0 6px（实测）
 *   返回/前进/隐藏侧边栏按钮        = 28×28 @ x=6 / 40 / 74，y=4，圆角 9.375px，
 *                                     svg 16×16，前景 rgba(255,255,255,.498)
 *   菜单区 div[role=menubar]        = [108,6.33,215.33,23.33]，gap 2px，
 *                                     padding 0 8px 0 4px
 *   菜单项 button[role=menuitem]    = 49.33×23.33，圆角 10px，padding 4px 10px，
 *                                     字号 14px · 字重 400 · 行高 1
 *   （出处：evidence/codex-desktop/captures/tree-topbar.json + 参考端样式普查）
 *
 * 菜单内容接 ARTEX 自己的动作（重载 / 缩放 / 全屏 / 关于…），不假装有 OpenAI 的功能。
 * ========================================================================== */

// SPEC §5：顶部下拉的 y 恒为 30（= 菜单栏 36 − 6）
const MENU_POPUP_TOP = 30;

const ZOOM_STORAGE_KEY = "artex_zoom_level";
const ZOOM_MIN = -5;
const ZOOM_MAX = 5;
// Electron 的 setZoomLevel 就是 ×1.2 一档；这里用 CSS zoom 复现同样的档位。
const ZOOM_BASE = 1.2;

type DesktopBridge = {
  invoke?: (action: string, payload?: unknown) => Promise<unknown>;
};

function desktopInvoke(action: string, payload?: unknown) {
  const bridge = (window as Window & { artexDesktop?: DesktopBridge }).artexDesktop;
  if (!bridge?.invoke) return false;
  void bridge.invoke(action, payload);
  return true;
}

function currentZoomFactor() {
  const raw = document.documentElement.style.getPropertyValue("zoom");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function applyZoomLevel(level: number) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level)));
  const root = document.documentElement;
  if (clamped === 0) {
    root.style.removeProperty("zoom");
  } else {
    root.style.setProperty("zoom", String(ZOOM_BASE ** clamped));
  }
  root.dataset.zoomLevel = String(clamped);
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped));
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return clamped;
}

function readStoredZoom() {
  try {
    const raw = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    if (Number.isFinite(raw)) return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(raw)));
  } catch {
    /* ignore */
  }
  return 0;
}

/** 编辑菜单：走 document.execCommand（Chromium 仍支持，且不需要额外权限）。 */
function execEdit(command: string) {
  try {
    document.execCommand(command);
  } catch {
    /* 无焦点可编辑元素时忽略 */
  }
}

type MenuItemDef = {
  type: "item";
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

type MenuEntry = MenuItemDef | { type: "separator"; id: string };

type MenuDef = {
  id: string;
  label: string;
  items: MenuEntry[];
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Alt", label: "聚焦菜单栏" },
  { keys: "← →", label: "在菜单之间切换" },
  { keys: "↑ ↓", label: "在菜单项之间移动" },
  { keys: "Enter", label: "执行当前菜单项" },
  { keys: "Esc", label: "关闭菜单 / 弹层" },
  { keys: "Ctrl+B", label: "显示 / 隐藏对话面板" },
  { keys: "Ctrl+=", label: "放大" },
  { keys: "Ctrl+-", label: "缩小" },
  { keys: "Ctrl+0", label: "实际大小" },
  { keys: "F11", label: "切换全屏" },
];

export function AppMenuBar() {
  const router = useRouter();
  const { open, toggleSidebar } = useSidebar();

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const hoverOpenedRef = React.useRef<string | null>(null);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [overlay, setOverlay] = React.useState<"about" | "shortcuts" | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);

  const zoom = React.useCallback((delta: number) => {
    applyZoomLevel(readStoredZoom() + delta);
  }, []);

  const menus = React.useMemo<MenuDef[]>(
    () => [
      {
        id: "file",
        label: "文件",
        items: [
          { type: "item", id: "new-window", label: "新建窗口", run: () => window.open("/chat/", "_blank", "noopener") },
          { type: "item", id: "new-chat", label: "新聊天", shortcut: "Ctrl+N", run: () => router.push("/chat/") },
          { type: "item", id: "new-temporary-chat", label: "新建临时聊天", shortcut: "Ctrl+Shift+N", disabled: true, run: () => undefined },
          { type: "separator", id: "file-s1" },
          { type: "item", id: "open-folder", label: "打开文件夹", shortcut: "Ctrl+O", run: () => desktopInvoke("openFolder") },
          { type: "separator", id: "file-s2" },
          {
            type: "item",
            id: "close-window",
            label: "关闭",
            shortcut: "Ctrl+W",
            run: () => {
              if (!desktopInvoke("close")) window.close();
            },
          },
          { type: "separator", id: "file-s3" },
          { type: "item", id: "sign-out", label: "退出登录", run: () => router.push("/login/") },
          { type: "item", id: "quit", label: "退出 ChatGPT", shortcut: "Ctrl+Q", run: () => desktopInvoke("quit") },
        ],
      },
      {
        id: "edit",
        label: "编辑",
        items: [
          { type: "item", id: "undo", label: "撤销", shortcut: "Ctrl+Z", run: () => execEdit("undo") },
          { type: "item", id: "redo", label: "重做", shortcut: "Ctrl+Y", run: () => execEdit("redo") },
          { type: "separator", id: "edit-s1" },
          { type: "item", id: "cut", label: "剪切", shortcut: "Ctrl+X", run: () => execEdit("cut") },
          { type: "item", id: "copy", label: "复制", shortcut: "Ctrl+C", run: () => execEdit("copy") },
          { type: "item", id: "paste", label: "粘贴", shortcut: "Ctrl+V", run: () => execEdit("paste") },
          { type: "item", id: "delete", label: "删除", run: () => execEdit("delete") },
          { type: "separator", id: "edit-s2" },
          { type: "item", id: "select-all", label: "全选", shortcut: "Ctrl+A", run: () => execEdit("selectAll") },
          { type: "separator", id: "edit-s3" },
          { type: "item", id: "settings", label: "设置", shortcut: "Ctrl+,", run: () => router.push("/system/settings/") },
        ],
      },
      {
        id: "view",
        label: "视图",
        items: [
          {
            type: "item",
            id: "toggle-sidebar",
            label: "显示/隐藏侧边栏",
            shortcut: "Ctrl+Shift+S",
            run: toggleSidebar,
          },
          { type: "item", id: "toggle-bottom-panel", label: "显示/隐藏底部面板", shortcut: "Ctrl+J", disabled: true, run: () => undefined },
          { type: "item", id: "toggle-pinned-summary", label: "切换置顶摘要", disabled: true, run: () => undefined },
          { type: "item", id: "open-terminal", label: "打开终端", shortcut: "Ctrl+`", disabled: true, run: () => undefined },
          { type: "item", id: "toggle-navigation-panel", label: "显示/隐藏导航面板", shortcut: "Ctrl+Shift+E", disabled: true, run: () => undefined },
          { type: "item", id: "switch-chat-tabs", label: "Switch between Chat and tabs", shortcut: "Alt+Ctrl+B", disabled: true, run: () => undefined },
          { type: "separator", id: "view-s0" },
          { type: "item", id: "browser", label: "浏览器", disabled: true, run: () => undefined },
          { type: "separator", id: "view-s1" },
          {
            type: "item",
            id: "find",
            label: "查找",
            shortcut: "Ctrl+F",
            run: () => (window as Window & { find?: (text: string) => boolean }).find?.(""),
          },
          { type: "separator", id: "view-s2" },
          { type: "item", id: "previous-chat", label: "上一个聊天", shortcut: "Ctrl+Shift+[", disabled: true, run: () => undefined },
          { type: "item", id: "next-chat", label: "下一个聊天", shortcut: "Ctrl+Shift+]", disabled: true, run: () => undefined },
          { type: "item", id: "back", label: "返回", shortcut: "Ctrl+[", run: () => router.back() },
          { type: "item", id: "forward", label: "前进", run: () => router.forward() },
          { type: "separator", id: "view-s3" },
          { type: "item", id: "zoom-in", label: "放大", shortcut: "Ctrl+=", run: () => zoom(1) },
          { type: "item", id: "zoom-out", label: "缩小", shortcut: "Ctrl+-", run: () => zoom(-1) },
          { type: "item", id: "zoom-reset", label: "实际大小", shortcut: "Ctrl+0", run: () => applyZoomLevel(0) },
          { type: "separator", id: "view-s4" },
          {
            type: "item",
            id: "fullscreen",
            label: fullscreen ? "退出全屏" : "切换全屏",
            shortcut: "F11",
            run: () => desktopInvoke("toggleFullScreen"),
          },
        ],
      },
      {
        id: "help",
        label: "帮助",
        items: [
          { type: "item", id: "docs", label: "文档", disabled: true, run: () => undefined },
          { type: "item", id: "shortcuts", label: "显示键盘快捷键", shortcut: "Ctrl+/", run: () => setOverlay("shortcuts") },
          { type: "item", id: "whats-new", label: "新功能", disabled: true, run: () => undefined },
          { type: "separator", id: "help-s1" },
          { type: "item", id: "troubleshooting", label: "故障排除", disabled: true, run: () => undefined },
          { type: "item", id: "system-status", label: "系统状态", disabled: true, run: () => undefined },
          { type: "item", id: "feedback", label: "反馈", disabled: true, run: () => undefined },
          { type: "separator", id: "help-s2" },
          { type: "item", id: "task-manager", label: "任务管理器", disabled: true, run: () => undefined },
          { type: "item", id: "start-performance-trace", label: "开始性能跟踪", disabled: true, run: () => undefined },
          { type: "separator", id: "help-s3" },
          { type: "item", id: "check-for-updates", label: "检查更新…", run: () => router.push("/system/settings/") },
          { type: "item", id: "about", label: "关于 ChatGPT", run: () => setOverlay("about") },
        ],
      },
    ],
    [router, zoom, fullscreen, open, toggleSidebar],
  );

  const close = React.useCallback(
    (refocus = false) => {
      hoverOpenedRef.current = null;
      if (refocus && openId) {
        const index = menus.findIndex((m) => m.id === openId);
        if (index >= 0) triggerRefs.current[index]?.focus();
      }
      setOpenId(null);
    },
    [openId, menus],
  );

  const openMenu = React.useCallback(
    (index: number, focusFirst = false) => {
      const trigger = triggerRefs.current[index];
      const target = menus[index];
      if (!trigger || !target) return;
      const rect = trigger.getBoundingClientRect();
      // SPEC §5 实测：下拉的 x = 触发按钮 x，y 恒为 30（= 36 − 6，向上叠 6px）。
      // zoom ≠ 1 时 getBoundingClientRect 已按 zoom 缩放，fixed 定位同样在缩放坐标系里。
      const factor = currentZoomFactor();
      setPosition({ left: rect.left / factor, top: MENU_POPUP_TOP });
      setOpenId(target.id);
      if (focusFirst) {
        window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
      }
    },
    [menus],
  );

  /* 视图菜单的「切换全屏」文案跟随全屏状态 */
  React.useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* 恢复上次的缩放档位（静态导出，放 effect 里避免水合不一致） */
  React.useEffect(() => {
    const level = readStoredZoom();
    if (level !== 0) applyZoomLevel(level);
  }, []);

  /* Alt 聚焦菜单栏（Windows 菜单栏惯例） */
  React.useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || event.ctrlKey || event.shiftKey || event.metaKey) return;
      if (openId) return;
      const first = triggerRefs.current[0];
      if (!first) return;
      first.focus();
      event.preventDefault();
    };
    window.addEventListener("keyup", onKeyUp);
    return () => window.removeEventListener("keyup", onKeyUp);
  }, [openId]);

  /* 全局加速键：Ctrl+= / Ctrl+- / Ctrl+0（原生菜单被移除后没人接管） */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoom(1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoom(-1);
      } else if (event.key === "0") {
        event.preventDefault();
        applyZoomLevel(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoom]);

  /* 打开时：点击外部 / Esc / 窗口尺寸变化都关掉 */
  React.useEffect(() => {
    if (!openId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popupRef.current?.contains(target)) return;
      if (barRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenId(null);
      }
    };
    const onResize = () => setOpenId(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [openId]);

  const openIndex = menus.findIndex((m) => m.id === openId);
  const activeMenu = openIndex >= 0 ? menus[openIndex] : null;

  const focusItem = (delta: number | "first" | "last") => {
    if (!activeMenu) return;
    const enabled = activeMenu.items
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.type === "item" && !entry.disabled)
      .map(({ index }) => index);
    if (enabled.length === 0) return;
    const currentIndex = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement | null);
    let next: number;
    if (delta === "first") {
      next = enabled[0];
    } else if (delta === "last") {
      next = enabled[enabled.length - 1];
    } else {
      const at = enabled.indexOf(currentIndex);
      if (at === -1) {
        next = delta > 0 ? enabled[0] : enabled[enabled.length - 1];
      } else {
        next = enabled[(at + delta + enabled.length) % enabled.length];
      }
    }
    itemRefs.current[next]?.focus();
  };

  const onTriggerKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = menus.length - 1;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        triggerRefs.current[index === last ? 0 : index + 1]?.focus();
        if (openId) openMenu(index === last ? 0 : index + 1, true);
        break;
      case "ArrowLeft":
        event.preventDefault();
        triggerRefs.current[index === 0 ? last : index - 1]?.focus();
        if (openId) openMenu(index === 0 ? last : index - 1, true);
        break;
      case "ArrowDown":
      case "Enter":
      case " ":
        event.preventDefault();
        openMenu(index, true);
        break;
      case "Escape":
        event.preventDefault();
        setOpenId(null);
        break;
      default:
        break;
    }
  };

  const onPopupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = menus.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(-1);
        break;
      case "Home":
        event.preventDefault();
        focusItem("first");
        break;
      case "End":
        event.preventDefault();
        focusItem("last");
        break;
      case "ArrowRight":
        event.preventDefault();
        openMenu(openIndex === last ? 0 : openIndex + 1, true);
        break;
      case "ArrowLeft":
        event.preventDefault();
        openMenu(openIndex === 0 ? last : openIndex - 1, true);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpenId(null);
        break;
      default:
        break;
    }
  };

  const runItem = (item: MenuItemDef) => {
    close(true);
    item.run();
  };

  return (
    <>
      <div ref={barRef} className="codex-app-menu-bar">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="返回"
              title="返回"
              className="codex-app-menu-icon"
              onClick={() => router.back()}
            >
              <CodexArrowLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="前进"
              title="前进"
              className="codex-app-menu-icon"
              onClick={() => router.forward()}
            >
              <CodexArrowRight size={16} />
            </button>
          </div>
          <div className="me-1.5 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="隐藏侧边栏"
              title="隐藏侧边栏"
              className="codex-app-menu-icon"
              onClick={toggleSidebar}
            >
              {open ? <CodexSidebarHidden size={16} /> : <CodexSidebar size={16} />}
            </button>
          </div>
        </div>

        <div role="menubar" aria-label="应用程序菜单" className="flex items-center gap-0.5 ps-1 pe-2">
          {menus.map((menu, index) => (
            <button
              key={menu.id}
              type="button"
              role="menuitem"
              id={`application-menu-trigger-${menu.id}-menu`}
              data-state={openId === menu.id ? "open" : "closed"}
              aria-haspopup="menu"
              aria-expanded={openId === menu.id}
              ref={(el) => {
                triggerRefs.current[index] = el;
              }}
              className="codex-app-menu-trigger"
              onClick={() => {
                // Pointer movement between open menus opens the next menu before
                // the click event arrives. Keep that menu open on the click;
                // clicking the already active trigger still toggles it closed.
                if (hoverOpenedRef.current === menu.id) {
                  hoverOpenedRef.current = null;
                  return;
                }
                if (openId === menu.id) close();
                else openMenu(index);
              }}
              onPointerEnter={() => {
                if (openId && openId !== menu.id) {
                  hoverOpenedRef.current = menu.id;
                  openMenu(index);
                }
              }}
              onKeyDown={onTriggerKeyDown(index)}
            >
              {menu.label}
            </button>
          ))}
          {/* 参考端有一个不可见的定位锚（button#application-menu-content-anchor [112,18,0,0]），
              结构对齐用；这里用 div 承载以避开 a11y 规则（本就不可见、不可聚焦）。 */}
          <div
            aria-hidden="true"
            className="pointer-events-none invisible fixed"
            id="application-menu-content-anchor"
          />
        </div>
      </div>

      {activeMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popupRef}
            role="menu"
            aria-label={activeMenu.label}
            data-state="open"
            className="codex-app-menu-popup"
            style={{ left: position.left, top: position.top }}
            onKeyDown={onPopupKeyDown}
          >
            {activeMenu.items.map((entry, index) =>
              entry.type === "separator" ? (
                <hr key={entry.id} className="codex-app-menu-separator" />
              ) : (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  data-disabled={entry.disabled ? "true" : undefined}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  className="codex-app-menu-item"
                  onClick={() => runItem(entry)}
                >
                  <span className="truncate">{entry.label}</span>
                  {entry.shortcut ? <span className="codex-app-menu-shortcut">{entry.shortcut}</span> : null}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}

      <Dialog open={overlay === "shortcuts"} onOpenChange={(next) => setOverlay(next ? "shortcuts" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>键盘快捷键</DialogTitle>
            <DialogDescription>ARTEX 桌面端当前可用的快捷键。</DialogDescription>
          </DialogHeader>
          <dl className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
            {SHORTCUTS.map((row) => (
              <div key={row.keys} className="flex items-center justify-between gap-4 py-1.5 text-[13px]">
                <dt className="text-[color:var(--color-text-tertiary)]">{row.label}</dt>
                <dd className="font-mono text-[12px] text-[color:var(--color-text-tertiary)]">{row.keys}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <Dialog open={overlay === "about"} onOpenChange={(next) => setOverlay(next ? "about" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>关于 ARTEX</DialogTitle>
            <DialogDescription>本地优先的攻击面测绘与协作工作台。</DialogDescription>
          </DialogHeader>
          <p className="text-[13px] text-[color:var(--color-text-tertiary)]">
            外壳按 Codex Desktop 的实测几何复刻：52px 图标导轨 + 288px 对话面板 + 顶部 36px 菜单栏。
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AppMenuBar;
