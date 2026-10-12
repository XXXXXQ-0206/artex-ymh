import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./empty.css";

/**
 * 空状态族。
 *
 * ⚠️ **官方无对应组件**。本件按官方 token 直译（逐条映射见 empty.css 头注释）。
 * API 与 `@/components/ui/empty` 一致：
 * `Empty / EmptyHeader / EmptyMedia / EmptyTitle / EmptyDescription / EmptyContent`。
 */

export function Empty({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-empty", className)} data-slot="empty" {...props} />;
}

export function EmptyHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-empty__header", className)} data-slot="empty-header" {...props} />;
}

export interface EmptyMediaProps extends ComponentProps<"div"> {
  variant?: "default" | "icon";
}

export function EmptyMedia({ className, variant = "default", ...props }: EmptyMediaProps) {
  return <div className={cn("cx-empty__media", className)} data-slot="empty-media" data-variant={variant} {...props} />;
}

export function EmptyTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-empty__title", className)} data-slot="empty-title" {...props} />;
}

export function EmptyDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("cx-empty__description", className)} data-slot="empty-description" {...props} />;
}

export function EmptyContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-empty__content", className)} data-slot="empty-content" {...props} />;
}