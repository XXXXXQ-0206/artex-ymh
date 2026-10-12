"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./progress.css";

/**
 * 进度条。
 *
 * ⚠️ **官方无对应组件**（无 `_Progress_` 类名；token 层也没有 `--progress-*` 组，
 *   只有 `--transition-duration-relaxed` 与一个 donut 动画 keyframes）。
 *   本件按官方**通用交互 token** 直译，逐条映射写在 `progress.css` 头注释：
 *   轨道底 `--color-background-primary-soft-alpha`（与 Card 脚 / Badge 默认档同源）、
 *   指示条 `--color-background-primary-solid`（官方实心档，dark #dfdfdf，与主按钮同源）、
 *   高度走 `--spacing` 阶梯、圆角 `--radius-full`、过渡 `--transition-duration-basic`。
 *
 * API 与 `@/components/ui/progress` 一致（`value: number`，0–100）。
 */

export function Progress({ className, value, ...props }: ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root className={cn("cx-progress", className)} data-slot="progress" {...props}>
      <ProgressPrimitive.Indicator
        className="cx-progress__indicator"
        data-slot="progress-indicator"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}