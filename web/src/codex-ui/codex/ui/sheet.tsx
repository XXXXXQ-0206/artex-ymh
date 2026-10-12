import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import "./sheet.css";

/**
 * 侧边抽屉（Sheet）。
 *
 * ⚠️ **官方无对应组件**：壳 `src/ui/**` 里没有 Sheet/Drawer；官方 CSS 里 `sheet` 只出现在
 *   `--modal-sheet-fade-shadow`（overlays.css:102）与移动断点写法中。
 *   官方唯一有完整 CSS 的浮层面板是 **Modal**（raw/ovjjw.css，SPEC-OVERLAYS §13）：
 *     桌面 `max-width: var(--modal-max-width,450px)` / `border-radius: var(--modal-radius)` /
 *     `box-shadow: var(--modal-backdrop-dim-shadow)`；移动档 `width:100%; max-height:92%;`
 *     贴底 + `background: var(--color-surface-elevated)`；遮罩 `--modal-backdrop-background`；
 *     fade 档再叠 `backdrop-filter: var(--modal-backdrop-fade-filter)`；
 *     Header 50 高 / 0 20px / 下边框 1px `--color-border`；Footer 16px 20px；
 *     标题 18px/semibold；描述 `--color-text-secondary`/14px。
 *
 * 本件 = 把这套官方 Modal 几何直译成四边抽屉。token 出处与逐条对应写在 `sheet.css` 头注释。
 * z-index 沿用复制层弹层阶梯：遮罩 45 / 面板 46（`.cx-dialog__overlay` / `.cx-dialog__content`）。
 *
 * 键盘/关闭行为沿用 Radix Dialog（Esc 关闭、焦点归还触发元素、`asChild` 单 child）。
 */

export type SheetSide = "top" | "right" | "bottom" | "left";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export interface SheetOverlayProps extends ComponentProps<typeof SheetPrimitive.Overlay> {
  /** 官方 `_ModalBackdrop_` 两档：dim（默认 `--modal-backdrop-background`）/ fade（再叠 blur(1px)） */
  backdrop?: "dim" | "fade";
}

export function SheetOverlay({ className, backdrop, ...props }: SheetOverlayProps) {
  return (
    <SheetPrimitive.Overlay
      className={cn("cx-sheet__overlay", "cx-anim", className)}
      data-backdrop={backdrop === "fade" ? "fade" : undefined}
      data-slot="sheet-overlay"
      {...props}
    />
  );
}

export interface SheetContentProps extends ComponentProps<typeof SheetPrimitive.Content> {
  side?: SheetSide;
  showCloseButton?: boolean;
  /** 传给遮罩的官方档位（dim 默认 / fade 叠 blur(1px)） */
  backdrop?: "dim" | "fade";
}

export function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  backdrop,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay backdrop={backdrop} />
      <SheetPrimitive.Content
        className={cn("cx-sheet__content", "cx-anim", className)}
        data-side={side}
        data-slot="sheet-content"
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close asChild>
            <Button aria-label="关闭" className="cx-sheet__close" size="xs" uniform variant="ghost">
              <X aria-hidden size={16} />
            </Button>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-sheet__header", className)} data-slot="sheet-header" {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-sheet__footer", className)} data-slot="sheet-footer" {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title className={cn("cx-sheet__title", className)} data-slot="sheet-title" {...props} />
  );
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("cx-sheet__description", className)}
      data-slot="sheet-description"
      {...props}
    />
  );
}