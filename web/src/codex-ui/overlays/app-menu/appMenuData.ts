/**
 * Codex Desktop 应用菜单（文件 / 编辑 / 视图 / 帮助）的**官方全量文案 + 快捷键**
 *
 * 官方来源（都是真实参考端 CDP 实测，非推测）：
 *   evidence/codex-desktop/captures/menu-file.json  / menu-edit.json
 *   evidence/codex-desktop/captures/menu-view.json  / menu-help.json
 *   evidence/codex-desktop/captures/views-app-menu-{file,edit,view,help}.json
 *   evidence/codex-desktop/SPEC.md §5（第 154-179 行）
 *   evidence/codex-desktop/reconstruct/overlays/raw/app-menu-rows.json（本目录脚本导出）
 *
 * 实测几何（SPEC §5）：容器 220×(254/282/338) 或 300×539；条目 212×28（视图 292×28）；
 * 条目 padding 5px 16px；步进 28px；分隔线满宽×1px（视觉 0.5px），上下各 8px 外边距。
 */

export interface AppMenuEntry {
  id: string;
  label: string;
  /** 快捷键文本，与标签同行右对齐（官方：<span class="ms-2 shrink-0 text-xs text-text/75">）*/
  shortcut?: string;
  disabled?: boolean;
}

export type AppMenuRow = AppMenuEntry | { separator: true; id: string };

export type AppMenuId = "file" | "edit" | "view" | "help";

export const APP_MENU_FILE: AppMenuRow[] = [
  { id: "new-window", label: "新建窗口" },
  { id: "new-chat", label: "新聊天", shortcut: "Ctrl+N" },
  { id: "new-temporary-chat", label: "新建临时聊天", shortcut: "Ctrl+Shift+N" },
  { separator: true, id: "sep-1" },
  { id: "open-folder", label: "打开文件夹", shortcut: "Ctrl+O" },
  { separator: true, id: "sep-2" },
  { id: "close", label: "关闭", shortcut: "Ctrl+W" },
  { separator: true, id: "sep-3" },
  { id: "sign-out", label: "退出登录" },
  { id: "quit", label: "退出 ChatGPT", shortcut: "Ctrl+Q" },
];

export const APP_MENU_EDIT: AppMenuRow[] = [
  { id: "undo", label: "撤销", shortcut: "Ctrl+Z" },
  { id: "redo", label: "重做", shortcut: "Ctrl+Y" },
  { separator: true, id: "sep-1" },
  { id: "cut", label: "剪切", shortcut: "Ctrl+X" },
  { id: "copy", label: "复制", shortcut: "Ctrl+C" },
  { id: "paste", label: "粘贴", shortcut: "Ctrl+V" },
  { id: "delete", label: "删除" },
  { separator: true, id: "sep-2" },
  { id: "select-all", label: "全选", shortcut: "Ctrl+A" },
  { separator: true, id: "sep-3" },
  { id: "settings", label: "设置", shortcut: "Ctrl+," },
];

export const APP_MENU_VIEW: AppMenuRow[] = [
  { id: "toggle-sidebar", label: "显示/隐藏侧边栏", shortcut: "Ctrl+Shift+S" },
  { id: "toggle-bottom-panel", label: "显示/隐藏底部面板", shortcut: "Ctrl+J" },
  { id: "toggle-pinned-summary", label: "切换置顶摘要" },
  { id: "open-terminal", label: "打开终端", shortcut: "Ctrl+`" },
  { id: "toggle-navigation-panel", label: "显示/隐藏导航面板", shortcut: "Ctrl+Shift+E" },
  { id: "switch-chat-tabs", label: "Switch between Chat and tabs", shortcut: "Alt+Ctrl+B" },
  { separator: true, id: "sep-1" },
  { id: "browser", label: "浏览器" },
  { separator: true, id: "sep-2" },
  { id: "find", label: "查找", shortcut: "Ctrl+F" },
  { separator: true, id: "sep-3" },
  { id: "previous-chat", label: "上一个聊天", shortcut: "Ctrl+Shift+[" },
  { id: "next-chat", label: "下一个聊天", shortcut: "Ctrl+Shift+]" },
  { id: "back", label: "返回", shortcut: "Ctrl+[" },
  { id: "forward", label: "前进" },
  { separator: true, id: "sep-4" },
  { id: "zoom-in", label: "放大", shortcut: "Ctrl+Shift+=" },
  { id: "zoom-out", label: "缩小", shortcut: "Ctrl+-" },
  { id: "zoom-reset", label: "实际大小", shortcut: "Ctrl+0" },
  { separator: true, id: "sep-5" },
  { id: "toggle-fullscreen", label: "切换全屏", shortcut: "F11" },
];

export const APP_MENU_HELP: AppMenuRow[] = [
  { id: "docs", label: "文档" },
  { id: "keyboard-shortcuts", label: "显示键盘快捷键", shortcut: "Ctrl+/" },
  { id: "whats-new", label: "新功能" },
  { separator: true, id: "sep-1" },
  { id: "troubleshooting", label: "故障排除" },
  { id: "system-status", label: "系统状态" },
  { id: "feedback", label: "反馈" },
  { separator: true, id: "sep-2" },
  { id: "task-manager", label: "任务管理器" },
  { id: "start-performance-trace", label: "开始性能跟踪" },
  { separator: true, id: "sep-3" },
  { id: "check-for-updates", label: "检查更新…" },
  { id: "about", label: "关于 ChatGPT" },
];

export const APP_MENUS: Record<AppMenuId, { title: string; rows: AppMenuRow[] }> = {
  file: { title: "文件", rows: APP_MENU_FILE },
  edit: { title: "编辑", rows: APP_MENU_EDIT },
  view: { title: "视图", rows: APP_MENU_VIEW },
  help: { title: "帮助", rows: APP_MENU_HELP },
};

/** 官方类名原文（captures/views-app-menu-*.json 的 cls 字段，逐字照抄）*/
export const appMenuClass = {
  /** #application-menu-content —— role=menu 的下拉本体 */
  content:
    "no-drag bg-codex-application-menu text-default shadow-application-menu z-50 flex select-none flex-col overflow-y-auto rounded-sm py-1",
  /** role=menuitem 条目 */
  item:
    "text-default outline-hidden rounded-sm mx-1 px-4 py-[var(--padding-row-y)] text-xs leading-normal font-normal hover:bg-primary-ghost-hover focus:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover cursor-interaction data-[disabled]:cursor-default data-[disabled]:opacity-60 data-[disabled]:hover:bg-transparent",
  itemRow: "flex w-full items-center",
  itemLabel: "min-w-0 flex-1 truncate",
  itemShortcut: "ms-2 shrink-0 text-xs text-text/75",
  /** role=separator */
  separator: "my-2 h-[0.5px] shrink-0 bg-border-strong",
  /** 顶栏触发按钮 · 未打开 */
  trigger:
    "no-drag rounded-md border border-transparent px-2.5 py-1 text-base font-normal leading-none outline-none text-tertiary hover:bg-text/5 hover:text-codex-description focus-visible:bg-text/5 focus-visible:text-codex-description",
  /** 顶栏触发按钮 · 打开态（官方用 bg-[var(--color-codex-application-menu-selection)]）*/
  triggerOpen:
    "no-drag rounded-md border border-transparent px-2.5 py-1 text-base font-normal leading-none outline-none bg-[var(--color-codex-application-menu-selection)] text-[var(--color-text)]",
  /** [role=menubar] 簇（SPEC §4：padding 0 8px 0 4px；gap 2px）*/
  menubar: "no-drag flex items-center gap-[2px] ps-1 pe-2",
} as const;

/** 官方 popper 包装的定位：x = 触发按钮 x；y = 30（= 36 顶栏 − 6 上叠）*/
export const APP_MENU_CONTENT_OFFSET_Y = 30;
