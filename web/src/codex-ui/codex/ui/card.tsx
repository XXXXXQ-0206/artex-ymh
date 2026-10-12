import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./card.css";

/**
 * 卡片。
 *
 * ⚠️ **官方无对应组件**：壳 `src/ui/**` 里没有 Card；官方 CSS 里没有 `_Card_` 类名，
 *   token 层也没有 `--card-*` 组（只有表面色 `--color-surface-card` 与 `--shadow-card`）。
 *   参考端实测的设置卡片是 bg `rgb(35,35,35)` / 圆角 `20px`（FIDELITY-AUDIT #95）。
 *
 * 本件 = 官方 token 直译（逐条对应写在 `card.css` 头注释），**无字面量尺寸/颜色**：
 *   表面 `--color-surface-card` · 前景 `--color-text` · 圆角 `--radius-xl` ·
 *   发丝描边 `--border-width-hairline` + `--color-border` · 阴影 `--shadow-card` ·
 *   内距走 `--spacing` 阶梯 · 描述文字 `--color-text-secondary`。
 *
 * API 与 `@/components/ui/card` 同名同参，迁移时只需换 import 路径。
 */

export interface CardProps extends ComponentProps<"div"> {
  size?: "default" | "sm";
}

export function Card({ className, size = "default", ...props }: CardProps) {
  return <div className={cn("cx-card", className)} data-size={size} data-slot="card" {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__header", className)} data-slot="card-header" {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__title", className)} data-slot="card-title" {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__description", className)} data-slot="card-description" {...props} />;
}

export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__action", className)} data-slot="card-action" {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__content", className)} data-slot="card-content" {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-card__footer", className)} data-slot="card-footer" {...props} />;
}