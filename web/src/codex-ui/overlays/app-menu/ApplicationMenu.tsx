/**
 * Codex Desktop 应用菜单下拉 —— 1:1 重建（文件 / 编辑 / 视图 / 帮助）
 *
 * 官方类名（逐字来自 captures/views-app-menu-*.json 的 cls 字段）：
 *   容器  no-drag bg-codex-application-menu text-default shadow-application-menu z-50
 *         flex select-none flex-col overflow-y-auto rounded-sm py-1
 *   条目  text-default outline-hidden rounded-sm mx-1 px-4 py-[var(--padding-row-y)]
 *         text-xs leading-normal font-normal hover:bg-primary-ghost-hover
 *         focus:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover
 *         cursor-interaction data-[disabled]:cursor-default data-[disabled]:opacity-60
 *         data-[disabled]:hover:bg-transparent
 *   分隔线 my-2 h-[0.5px] shrink-0 bg-border-strong
 *   触发按钮 no-drag rounded-md border border-transparent px-2.5 py-1 text-base
 *         font-normal leading-none outline-none text-tertiary hover:bg-text/5
 *         hover:text-codex-description focus-visible:bg-text/5 focus-visible:text-codex-description
 *
 * 官方 DOM（views-app-menu-view.json 原样）：
 *   <div data-radix-popper-content-wrapper style="position:fixed;left:0;top:0;
 *        transform:translate(214.667px,30px);min-width:max-content;
 *        --radix-popper-transform-origin:0% 0px;will-change:transform;z-index:50">
 *     <div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical"
 *          data-state="open" data-radix-menu-content data-radix-menubar-content dir="ltr"
 *          id="application-menu-content" aria-labelledby="application-menu-trigger-view-menu"
 *          class="..." tabindex="-1" data-orientation="vertical" style="outline:none;max-width:…;max-height:…;min-width:…">
 *       <div role="menuitem" class="…" tabindex="-1" data-orientation="vertical" data-radix-collection-item>
 *         <div class="flex w-full items-center">
 *           <span class="min-w-0 flex-1 truncate">显示/隐藏侧边栏</span>
 *           <span class="ms-2 shrink-0 text-xs text-text/75">Ctrl+Shift+S</span>
 *         </div>
 *       </div>
 *       <div role="separator" aria-orientation="horizontal" class="my-2 h-[0.5px] shrink-0 bg-border-strong"></div>
 *     </div>
 *   </div>
 *
 * 实测值（SPEC §5）：
 *   定位 x = 触发按钮 x；y = 30（= 顶栏 36 − 6）；容器 220×253.5 / 220×281.5 / 300×538.5 / 220×337.5
 *   bg rgb(31,31,31)；圆角 7.5px；corner-shape superellipse(1)（圆角，不是超椭圆）；padding 4px 0；
 *   无边框；无 backdrop-filter；阴影 rgba(0,0,0,.42) 0 4px 12px 0
 *   条目 212×28（视图 292×28）；padding 5px 16px；圆角 7.5px；字体 12px/18px/400；色 rgb(223,223,223)
 *   分隔线满宽×1px（视觉 0.5px），上下各 8px 外边距
 *
 * 与官方的差异（诚实标注）：
 *   1. 官方是 Radix Menubar（hover 自动在已展开的菜单间切换、方向键漫游、typeahead、focus 归还）。
 *      本实现只保证 DOM/类名/属性/几何一致，键盘漫游简化为 Esc 关闭 + 点击外部关闭。
 *   2. 官方 style 里的 max-width/max-height/min-width 用了 radix 运行时变量
 *      --radix-menubar-content-available-width / -height，本实现同样输出这些变量并给到等价值，
 *      但不会像 radix 那样随窗口实时重算。
 *   3. 折叠项（overlay 滚动）由容器自身 overflow-y-auto 承担，不做 peekMenuItems 高度截断。
 */
"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  APP_MENU_CONTENT_OFFSET_Y,
  APP_MENUS,
  appMenuClass,
  type AppMenuId,
  type AppMenuRow,
} from "./appMenuData";

export interface ApplicationMenuProps {
  /** 哪一份菜单（决定文案与 id：application-menu-content / …-{id}-menu）*/
  menuId: AppMenuId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 触发按钮元素（用于取 x 与 aria-labelledby / aria-expanded）*/
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** 没有 anchorRef 时可直接给 x（实测 文件112 / 编辑163.33 / 视图214.67 / 帮助266）*/
  anchorX?: number;
  /** 覆盖文案（默认用官方实测全量菜单，见 appMenuData.ts）*/
  rows?: AppMenuRow[];
  /** 点击条目回调；官方会同时关闭菜单 */
  onSelect?: (id: string) => void;
  className?: string;
  /** 挂载节点，默认 document.body */
  container?: HTMLElement | null;
}

function ContentShell({
  menuId,
  open,
  onOpenChange,
  anchorRef,
  anchorX,
  rows,
  onSelect,
  className,
  container,
}: ApplicationMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [x, setX] = useState<number>(anchorX ?? 0);
  const contentId = `application-menu-content`;
  const triggerId = `application-menu-trigger-${menuId}-menu`;
  const data = APP_MENUS[menuId];
  const list = rows ?? data.rows;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHost(container ?? document.body);
  }, [container]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = anchorRef?.current;
      if (el) setX(el.getBoundingClientRect().left);
      else if (anchorX !== undefined) setX(anchorX);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef, anchorX]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        anchorRef?.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, anchorRef]);

  if (!open || !host) return null;

  const wrapperStyle: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    transform: `translate(${x}px, ${APP_MENU_CONTENT_OFFSET_Y}px)`,
    minWidth: "max-content",
    ["--radix-popper-transform-origin" as string]: "0% 0px",
    willChange: "transform",
    zIndex: 50,
    ["--radix-menubar-content-available-width" as string]: "1268px",
    ["--radix-menubar-content-available-height" as string]: "780.33px",
  };
  const contentStyle: CSSProperties = {
    outline: "none",
    maxWidth: "min(calc(var(--radix-menubar-content-available-width) / 1), calc((100vw - 16px) / 1))",
    maxHeight: "calc(-12px + 100vh)",
    minWidth:
      "min(220px, min(calc(var(--radix-menubar-content-available-width) / 1), calc((100vw - 16px) / 1)))",
  };

  return createPortal(
    <div ref={ref} data-radix-popper-content-wrapper="" dir="ltr" style={wrapperStyle}>
      <div
        data-side="bottom"
        data-align="start"
        role="menu"
        aria-orientation="vertical"
        data-state="open"
        data-radix-menu-content=""
        dir="ltr"
        id={contentId}
        aria-labelledby={triggerId}
        data-radix-menubar-content=""
        className={[appMenuClass.content, className].filter(Boolean).join(" ")}
        tabIndex={-1}
        data-orientation="vertical"
        style={contentStyle}
      >
        {list.map((row, index) =>
          "separator" in row ? (
            <div
              key={row.id}
              role="separator"
              aria-orientation="horizontal"
              className={appMenuClass.separator}
            />
          ) : (
            <div
              key={row.id}
              role="menuitem"
              className={appMenuClass.item}
              tabIndex={-1}
              data-orientation="vertical"
              data-radix-collection-item=""
              data-disabled={row.disabled ? "" : undefined}
              aria-disabled={row.disabled || undefined}
              onClick={() => {
                if (row.disabled) return;
                onSelect?.(row.id);
                onOpenChange(false);
              }}
            >
              <div className={appMenuClass.itemRow}>
                <span className={appMenuClass.itemLabel}>{row.label}</span>
                {row.shortcut ? (
                  <span className={appMenuClass.itemShortcut}>{row.shortcut}</span>
                ) : null}
              </div>
              {/* eslint-disable-next-line no-restricted-syntax */}
              <span hidden data-row-index={index} />
            </div>
          ),
        )}
      </div>
    </div>,
    host,
  );
}

/**
 * 应用菜单下拉本体。受控组件：open / onOpenChange 由调用方（外壳顶栏）持有。
 */
export function ApplicationMenu(props: ApplicationMenuProps) {
  return <ContentShell {...props} />;
}

/**
 * 顶栏触发按钮（SPEC §4：49×23，r 10px，cs SE1.5，padding 4px 10px，14px/14px/400）。
 * R3 外壳可以只用它，也可以自己画按钮 —— 类名必须保持一致。
 */
export interface ApplicationMenuTriggerProps {
  menuId: AppMenuId;
  open?: boolean;
  onClick?: () => void;
  onPointerEnter?: () => void;
  className?: string;
}
export function ApplicationMenuTrigger({
  menuId,
  open,
  onClick,
  onPointerEnter,
  className,
}: ApplicationMenuTriggerProps) {
  const id = `application-menu-trigger-${menuId}-menu`;
  return (
    <button
      type="button"
      id={id}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? "application-menu-content" : undefined}
      data-state={open ? "open" : "closed"}
      className={[open ? appMenuClass.triggerOpen : appMenuClass.trigger, className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
    >
      {APP_MENUS[menuId].title}
    </button>
  );
}

/**
 * 四个触发按钮组成的 [role=menubar] 簇（SPEC §4：108,6 215×23；padding 0 8px 0 4px；gap 2px）。
 * 官方在 hover 已展开菜单时会自动切换，这里按同一行为实现。
 */
export interface ApplicationMenuBarProps {
  active: AppMenuId | null;
  onActiveChange: (menu: AppMenuId | null) => void;
  className?: string;
}
export function ApplicationMenuBar({ active, onActiveChange, className }: ApplicationMenuBarProps) {
  const ids: AppMenuId[] = ["file", "edit", "view", "help"];
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && active) {
        e.preventDefault();
        onActiveChange(null);
      }
    },
    [active, onActiveChange],
  );
  return (
    <div
      role="menubar"
      aria-orientation="horizontal"
      className={[appMenuClass.menubar, className].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
    >
      {ids.map((id) => (
        <ApplicationMenuTrigger
          key={id}
          menuId={id}
          open={active === id}
          onClick={() => onActiveChange(active === id ? null : id)}
          onPointerEnter={() => {
            if (active && active !== id) onActiveChange(id);
          }}
        />
      ))}
    </div>
  );
}

/** 一个「菜单 id + 打开状态」的自包含组合，方便外壳直接落一句 */
export function useApplicationMenu(initial: AppMenuId | null = null) {
  const [active, setActive] = useState<AppMenuId | null>(initial);
  const refs = useMemo(
    () => ({
      file: { current: null as HTMLElement | null },
      edit: { current: null as HTMLElement | null },
      view: { current: null as HTMLElement | null },
      help: { current: null as HTMLElement | null },
    }),
    [],
  );
  const uid = useId();
  void uid;
  return { active, setActive, refs };
}
