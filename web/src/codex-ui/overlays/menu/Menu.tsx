/**
 * Codex Desktop 官方 Menu 体系 —— 1:1 重建
 *
 * 官方类名（CSS-module 哈希 \`12y2s\`，原文规则见 web/src/codex-ui/styles/overlays.css）：
 *   _Menu_12y2s_2 / _MenuList_12y2s_2 / _MenuItem_12y2s_2 / _MenuItemContent_12y2s_2 /
 *   _PressableInner_12y2s_2 / _ItemActions_12y2s_2 / _Separator_12y2s_2 / _SubMenuItem_12y2s_2 /
 *   _SubTriggerIcon_12y2s_2 / _CheckboxItem_12y2s_2 / _RadioItem_12y2s_2 /
 *   _CheckboxIndicator_12y2s_2 / _CheckmarkIndicator_12y2s_2 / _CheckboxCircle_12y2s_2 /
 *   _RadioIndicator_12y2s_2 / _RadioIndicatorActive_12y2s_2 / _SwitchIndicator_12y2s_2 / _SwitchThumb_12y2s_2
 *
 * 官方来源：codex-desktop-electron/src/renderer/assets/app-initial-25361a10f2bf.js
 *   模块 xes()（类名常量表）+ 模块 gns()（完整组件实现，含每个 props 解构与 DOM 层级）
 *   CSS 原文：app-initial-c43288484373.css（.12y2s 段，60 条）
 *
 * 与官方的差异（诚实标注）：
 *   1. 官方基于 Radix（DropdownMenu / ContextMenu / Menubar / RadioGroup / Checkbox）。
 *      本实现零依赖，用 React context + 受控 state + createPortal 复刻同一套 DOM/属性。
 *      radix 专属属性（data-radix-collection-item 等）按官方原样输出，方便逐像素对照。
 *   2. 键盘导航（方向键/typeahead）、focus trap、碰撞检测简化：只用锚点 rect + 视口夹取。
 *   3. 动效状态机 data-entering / data-entering-active / data-exiting / data-exiting-active
 *      由 useTransitionState 近似（官方是 useTransition 组件，时长 150ms 进 / 100ms 出，与官方一致）。
 *   4. SubMenu 的 hover 延迟开合用 100ms 定时器近似。
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ── 官方类名常量表（照抄 bundle 里的 t3 对象）────────────────────────────── */
export const menuClass = {
  MenuList: "_MenuList_12y2s_2",
  Menu: "_Menu_12y2s_2",
  MenuItemContent: "_MenuItemContent_12y2s_2",
  MenuItem: "_MenuItem_12y2s_2",
  ItemActions: "_ItemActions_12y2s_2",
  PressableInner: "_PressableInner_12y2s_2",
  CheckboxItem: "_CheckboxItem_12y2s_2",
  RadioItem: "_RadioItem_12y2s_2",
  SubMenuItem: "_SubMenuItem_12y2s_2",
  Separator: "_Separator_12y2s_2",
  SubTriggerIcon: "_SubTriggerIcon_12y2s_2",
  RadioIndicatorActive: "_RadioIndicatorActive_12y2s_2",
  RadioIndicator: "_RadioIndicator_12y2s_2",
  CheckboxIndicator: "_CheckboxIndicator_12y2s_2",
  CheckmarkIndicator: "_CheckmarkIndicator_12y2s_2",
  CheckboxCircle: "_CheckboxCircle_12y2s_2",
  SwitchIndicator: "_SwitchIndicator_12y2s_2",
  SwitchThumb: "_SwitchThumb_12y2s_2",
} as const;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── 上下文 ───────────────────────────────────────────────────────────────── */
interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  compact: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
}
const MenuContext = createContext<MenuContextValue | null>(null);
const useMenuContext = (): MenuContextValue => {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu components must be wrapped in <Menu />");
  return ctx;
};

interface SubContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}
const SubContext = createContext<SubContextValue | null>(null);
const useSubContext = (): SubContextValue => {
  const ctx = useContext(SubContext);
  if (!ctx) throw new Error("Submenu components must be wrapped in <Menu.Sub />");
  return ctx;
};

/* ── 进场/退场状态机（官方 enterDuration 150 / exitDuration 100）────────────── */
type Phase = "idle" | "entering" | "entering-active" | "exiting" | "exiting-active";
function useTransitionState(open: boolean, enterDuration = 150, exitDuration = 100) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase("entering");
      const raf = requestAnimationFrame(() => setPhase("entering-active"));
      return () => cancelAnimationFrame(raf);
    }
    if (!mounted) return;
    setPhase("exiting");
    const raf = requestAnimationFrame(() => setPhase("exiting-active"));
    const t = window.setTimeout(() => {
      setPhase("idle");
      setMounted(false);
    }, exitDuration);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [open, mounted, exitDuration]);
  void enterDuration;
  return { mounted, phase };
}

function phaseAttrs(phase: Phase): Record<string, string> {
  switch (phase) {
    case "entering":
      return { "data-entering": "" };
    case "entering-active":
      return { "data-entering-active": "" };
    case "exiting":
      return { "data-exiting": "" };
    case "exiting-active":
      return { "data-exiting-active": "" };
    default:
      return {};
  }
}

/* ── 定位：官方用 radix popper，这里用锚点 rect + fixed + 碰撞夹取 ─────────── */
interface Placement {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: { top: number; right: number; bottom: number; left: number };
}
function usePopperStyle(
  anchor: React.RefObject<HTMLElement | null>,
  active: boolean,
  placement: Placement,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;
    const el = anchor.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const side = placement.side ?? "bottom";
      const align = placement.align ?? "start";
      const sideOffset = placement.sideOffset ?? 5;
      const alignOffset = placement.alignOffset ?? (align === "center" ? 0 : -5);
      let x = align === "end" ? r.right : align === "center" ? r.left + r.width / 2 : r.left;
      let y = r.bottom;
      if (side === "top") y = r.top;
      if (side === "right") x = r.right;
      if (side === "left") x = r.left;
      setStyle({
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate(${Math.round((x + (side === "top" || side === "bottom" ? alignOffset : sideOffset)) * 100) / 100}px, ${Math.round((y + (side === "top" ? -sideOffset : side === "bottom" ? sideOffset : alignOffset)) * 100) / 100}px)`,
        minWidth: "max-content",
        zIndex: 50,
        willChange: "transform",
        ["--radix-popper-transform-origin" as string]: "0% 0px",
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor, active, placement.side, placement.align, placement.sideOffset, placement.alignOffset]);
  return style;
}

/* ── Portal（官方：menu.Portal forceMount + container）───────────────────── */
export function MenuPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  return createPortal(children, host);
}

/* ── Root ────────────────────────────────────────────────────────────────── */
export interface MenuProps {
  children: ReactNode;
  /** 官方 props.compact → _MenuList_ 上的 data-compact，去掉条目两端额外内缩 */
  compact?: boolean;
  forceOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  modal?: boolean;
}
export function Menu({ children, compact = false, forceOpen, onOpen, onClose, modal }: MenuProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = forceOpen ?? uncontrolled;
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next);
      if (next) onOpenRef.current?.();
      else onCloseRef.current?.();
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  const value = useMemo<MenuContextValue>(
    () => ({ open, setOpen, compact, triggerRef, contentId }),
    [open, setOpen, compact, contentId],
  );
  void modal;
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

/* ── Trigger ─────────────────────────────────────────────────────────────── */
export interface MenuTriggerProps {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}
export function MenuTrigger({ children, disabled, className }: MenuTriggerProps) {
  const { open, setOpen, triggerRef } = useMenuContext();
  return (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      className={className}
      data-state={open ? "open" : "closed"}
      data-disabled={disabled ? "" : undefined}
      onClick={() => !disabled && setOpen(!open)}
      style={{ display: "contents" }}
    >
      {children}
    </span>
  );
}

/* ── Content ─────────────────────────────────────────────────────────────── */
export interface MenuContentProps {
  children: ReactNode;
  className?: string;
  width?: string;
  minWidth?: string;
  maxHeight?: string;
  side?: Placement["side"];
  align?: Placement["align"];
  sideOffset?: number;
  alignOffset?: number;
  /** 官方：toe.pressable 为 false 时给 --scale:1（关闭按下缩放）*/
  pressableScaleOne?: boolean;
  onCloseAutoFocus?: (e: Event) => void;
}
export function MenuContent({
  children,
  className,
  width = "auto",
  minWidth = "auto",
  maxHeight,
  side,
  align,
  sideOffset = 5,
  alignOffset,
  pressableScaleOne,
  onCloseAutoFocus,
}: MenuContentProps) {
  const { open, compact, triggerRef, contentId } = useMenuContext();
  const { mounted, phase } = useTransitionState(open);
  const popperStyle = usePopperStyle(triggerRef, open, { side, align, sideOffset, alignOffset });
  void onCloseAutoFocus;
  if (!mounted) return null;
  const style: CSSProperties = {
    ...popperStyle,
    ...(pressableScaleOne ? ({ ["--scale" as string]: "1" } as CSSProperties) : null),
    ["--menu-width" as string]: width,
    ["--menu-min-width" as string]: minWidth,
    ...(maxHeight ? ({ ["--menu-max-height" as string]: maxHeight } as CSSProperties) : null),
  };
  return (
    <MenuPortal>
      <div className={menuClass.Menu} {...phaseAttrs(phase)}>
        <div
          id={contentId}
          role="menu"
          data-side={side ?? "bottom"}
          data-align={align ?? "start"}
          data-state={open ? "open" : "closed"}
          data-radix-menu-content=""
          data-orientation="vertical"
          dir="ltr"
          tabIndex={-1}
          className={cx(menuClass.MenuList, className)}
          data-compact={compact ? "" : undefined}
          style={style}
        >
          {children}
        </div>
      </div>
    </MenuPortal>
  );
}

/* ── Item ────────────────────────────────────────────────────────────────── */
export interface MenuItemProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  color?: "danger";
  onSelect?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void;
}
export function MenuItem({
  children,
  className,
  disabled,
  color,
  onSelect,
  onClick,
  onPointerMove,
  onPointerLeave,
}: MenuItemProps) {
  const { open, setOpen } = useMenuContext();
  const [highlighted, setHighlighted] = useState(false);
  const interactive = Boolean(onSelect || onClick);
  const guard = (e: React.MouseEvent | React.PointerEvent) => {
    if (!open) e.preventDefault();
  };
  if (!interactive) {
    /* 官方：无 onSelect/onClick 时退化成纯展示的 MenuItemContent */
    return <div className={cx(menuClass.MenuItemContent, className)}>{children}</div>;
  }
  return (
    <div
      role="menuitem"
      className={cx(menuClass.MenuItem, className)}
      data-color={color}
      data-disabled={disabled ? "" : undefined}
      data-highlighted={highlighted ? "" : undefined}
      data-orientation="vertical"
      data-radix-collection-item=""
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onPointerMove={(e) => {
        guard(e);
        setHighlighted(true);
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        guard(e);
        setHighlighted(false);
        onPointerLeave?.(e);
      }}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        onSelect?.(e);
        setOpen(false);
      }}
    >
      <div className={menuClass.PressableInner}>{children}</div>
    </div>
  );
}

export function MenuItemContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(menuClass.MenuItemContent, className)}>{children}</div>;
}

export function MenuItemActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(menuClass.ItemActions, className)}>{children}</div>;
}

/** 官方 Menu.ItemAction：ghost/secondary/sm 的通用按钮（_Button_eg66f_2 原语）*/
export interface MenuItemActionProps {
  children: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}
export function MenuItemAction({ children, onClick, className }: MenuItemActionProps) {
  const { setOpen } = useMenuContext();
  return (
    <button
      type="button"
      className={cx("_Button_eg66f_2", className)}
      data-color="secondary"
      data-variant="ghost"
      data-size="sm"
      data-icon-size="sm"
      data-uniform=""
      onClick={(e) => {
        e.stopPropagation();
        setOpen(false);
        onClick?.(e);
      }}
    >
      <span className="_ButtonInner_eg66f_2">{children}</span>
    </button>
  );
}

/* ── Link ────────────────────────────────────────────────────────────────── */
export interface MenuLinkProps {
  children: ReactNode;
  className?: string;
  href?: string;
  disabled?: boolean;
  target?: string;
  rel?: string;
}
export function MenuLink({ children, className, href, disabled, target, rel }: MenuLinkProps) {
  const { open } = useMenuContext();
  const external = !href || /^https?:\/\//.test(href);
  const guard = (e: React.MouseEvent) => {
    if (!open) e.preventDefault();
  };
  return (
    <div
      className={cx(menuClass.MenuItem, className)}
      data-disabled={disabled ? "" : undefined}
      role="menuitem"
      data-orientation="vertical"
      data-radix-collection-item=""
    >
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : rel}
        onPointerMove={external ? undefined : guard}
        onPointerLeave={external ? undefined : guard}
        className={menuClass.PressableInner}
        style={{ display: "flex", textDecoration: "none", color: "inherit" }}
      >
        {children}
      </a>
    </div>
  );
}

/* ── Separator ───────────────────────────────────────────────────────────── */
export function MenuSeparator({ className }: { className?: string }) {
  return <div role="separator" aria-orientation="horizontal" className={cx(menuClass.Separator, className)} />;
}

/* ── Sub ─────────────────────────────────────────────────────────────────── */
export function MenuSub({
  children,
  forceOpen,
  onOpen,
  onClose,
}: {
  children: ReactNode;
  forceOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = forceOpen ?? uncontrolled;
  const triggerRef = useRef<HTMLElement | null>(null);
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next);
      if (next) onOpen?.();
      else onClose?.();
    },
    [onOpen, onClose],
  );
  const value = useMemo(() => ({ open, setOpen, triggerRef }), [open, setOpen]);
  return <SubContext.Provider value={value}>{children}</SubContext.Provider>;
}

const ChevronRight = (props: { width?: string; height?: string; className?: string }) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path
      fillRule="evenodd"
      d="M8.293 4.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L14.586 12 8.293 5.707a1 1 0 0 1 0-1.414Z"
      clipRule="evenodd"
    />
  </svg>
);

export function MenuSubTrigger({
  children,
  className,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { open } = useMenuContext();
  const { open: subOpen, setOpen: setSubOpen, triggerRef } = useSubContext();
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const guard = (e: React.PointerEvent) => {
    if (!open) e.preventDefault();
  };
  return (
    <div
      ref={triggerRef as React.RefObject<HTMLDivElement>}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={subOpen}
      data-state={subOpen ? "open" : "closed"}
      data-disabled={disabled ? "" : undefined}
      data-orientation="vertical"
      data-radix-collection-item=""
      tabIndex={-1}
      className={cx(menuClass.MenuItem, menuClass.SubMenuItem, className)}
      onPointerEnter={() => {
        clear();
        timer.current = window.setTimeout(() => setSubOpen(true), 100);
      }}
      onPointerMove={guard}
      onPointerLeave={(e) => {
        clear();
        guard(e);
      }}
    >
      <div className={menuClass.PressableInner}>
        {children}
        <ChevronRight width="16" height="16" className={menuClass.SubTriggerIcon} />
      </div>
    </div>
  );
}

export function MenuSubContent({
  children,
  className,
  sideOffset = 4,
  alignOffset = -6,
  width = "auto",
  minWidth = "auto",
  maxHeight,
}: {
  children: ReactNode;
  className?: string;
  sideOffset?: number;
  alignOffset?: number;
  width?: string;
  minWidth?: string;
  maxHeight?: string;
}) {
  const { compact } = useMenuContext();
  const { open, triggerRef } = useSubContext();
  const { mounted, phase } = useTransitionState(open);
  const popperStyle = usePopperStyle(triggerRef, open, {
    side: "right",
    align: "start",
    sideOffset,
    alignOffset,
  });
  if (!mounted) return null;
  return (
    <MenuPortal>
      <div className={menuClass.Menu} {...phaseAttrs(phase)}>
        <div
          role="menu"
          data-state={open ? "open" : "closed"}
          data-orientation="vertical"
          tabIndex={-1}
          data-compact={compact ? "" : undefined}
          className={cx(menuClass.MenuList, className)}
          style={{
            ...popperStyle,
            ["--menu-width" as string]: width,
            ["--menu-min-width" as string]: minWidth,
            ...(maxHeight ? ({ ["--menu-max-height" as string]: maxHeight } as CSSProperties) : null),
          }}
        >
          {children}
        </div>
      </div>
    </MenuPortal>
  );
}

/* ── RadioGroup / RadioItem ──────────────────────────────────────────────── */
interface RadioGroupContextValue {
  value?: string;
  onChange?: (value: string) => void;
}
const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export function MenuRadioGroup({
  children,
  value,
  onChange,
  indicatorPosition = "end",
}: {
  children: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  indicatorPosition?: "start" | "end";
}) {
  return (
    <RadioGroupContext.Provider value={{ value, onChange }}>
      <div role="radiogroup" data-indicator-position={indicatorPosition}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface MenuRadioItemProps {
  children: ReactNode;
  value: string;
  className?: string;
  disabled?: boolean;
  indicatorVariant?: "radio" | "checkmark";
  onSelect?: () => void;
}
export function MenuRadioItem({
  children,
  value,
  className,
  disabled,
  indicatorVariant = "radio",
  onSelect,
}: MenuRadioItemProps) {
  const { setOpen } = useMenuContext();
  const group = useContext(RadioGroupContext);
  const checked = group?.value === value;
  return (
    <div
      role="menuitemradio"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      data-disabled={disabled ? "" : undefined}
      data-orientation="vertical"
      data-radix-collection-item=""
      tabIndex={-1}
      className={cx(menuClass.MenuItem, menuClass.RadioItem, className)}
      onPointerMove={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).setAttribute("data-highlighted", "");
      }}
      onPointerLeave={(e) => (e.currentTarget as HTMLElement).removeAttribute("data-highlighted")}
      onClick={() => {
        if (disabled) return;
        group?.onChange?.(value);
        onSelect?.();
        setOpen(false);
      }}
    >
      <div className={menuClass.PressableInner}>
        {indicatorVariant === "checkmark" ? (
          <div className={menuClass.CheckmarkIndicator}>
            {checked ? <CheckIcon className="size-4" /> : null}
          </div>
        ) : (
          <div className={menuClass.RadioIndicator}>
            {checked ? (
              <span className={menuClass.RadioIndicatorActive} aria-hidden="true" />
            ) : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── CheckboxItem ────────────────────────────────────────────────────────── */
export interface MenuCheckboxItemProps {
  children: ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  variant?: "checkbox" | "switch";
  indicatorPosition?: "start" | "end";
  indicatorVariant?: "solid" | "ghost";
}
export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  className,
  disabled,
  variant = "checkbox",
  indicatorPosition = "end",
  indicatorVariant = "solid",
}: MenuCheckboxItemProps) {
  const { setOpen } = useMenuContext();
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      data-variant={variant}
      data-indicator-position={indicatorPosition}
      data-indicator-variant={indicatorVariant}
      data-disabled={disabled ? "" : undefined}
      data-orientation="vertical"
      data-radix-collection-item=""
      tabIndex={-1}
      className={cx(menuClass.MenuItem, menuClass.CheckboxItem, className)}
      onClick={() => {
        if (disabled) return;
        onCheckedChange?.(!checked);
        setOpen(false);
      }}
    >
      <div className={menuClass.PressableInner}>
        {variant === "switch" ? (
          <div className={menuClass.SwitchIndicator} aria-hidden="true">
            <div className={menuClass.SwitchThumb} />
          </div>
        ) : (
          <div className={menuClass.CheckboxIndicator}>
            {checked ? (
              indicatorVariant === "ghost" ? (
                <CheckIcon className="size-4" />
              ) : (
                <div className={menuClass.CheckboxCircle}>
                  <CheckIcon className="size-4" />
                </div>
              )
            ) : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20 6 9 17l-5-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* ── 组装（对齐官方 Menu.Item / Menu.Content 等静态挂载）─────────────────── */
export const MenuNamespace = Object.assign(Menu, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  ItemContent: MenuItemContent,
  ItemActions: MenuItemActions,
  ItemAction: MenuItemAction,
  Link: MenuLink,
  Separator: MenuSeparator,
  Sub: MenuSub,
  SubTrigger: MenuSubTrigger,
  SubContent: MenuSubContent,
  CheckboxItem: MenuCheckboxItem,
  RadioGroup: MenuRadioGroup,
  RadioItem: MenuRadioItem,
  Portal: MenuPortal,
});

export default MenuNamespace;
