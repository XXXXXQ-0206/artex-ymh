import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./alert.css";

/**
 * 提示条。
 *
 * ⚠️ **官方无 Alert 组件**，但 token 组完整存在（`--alert-border-radius / -gap / -gutter /
 * `-font-size / -line-height / -title-font-weight`）。本件是该 token 组的直译，
 * 逐条映射见 `alert.css` 头注释。
 * API 与 `@/components/ui/alert` 一致：`Alert / AlertTitle / AlertDescription / AlertAction`。
 * 变体词汇用官方色名：`variant: "default" | "danger"`。
 */

export interface AlertProps extends ComponentProps<"div"> {
  variant?: "default" | "danger";
}

export function Alert({ className, variant = "default", ...props }: AlertProps) {
  return <div className={cn("cx-alert", className)} data-slot="alert" data-variant={variant} role="alert" {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-alert__title", className)} data-slot="alert-title" {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-alert__description", className)} data-slot="alert-description" {...props} />;
}

export function AlertAction({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-alert__action", className)} data-slot="alert-action" {...props} />;
}