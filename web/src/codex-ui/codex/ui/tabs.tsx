"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./tabs.css";

/**
 * 标签页。
 *
 * ⚠️ **官方无对应组件**（壳 `src/ui/**` 无此件、官方 CSS 无 `_Tab_` 类名）。
 *   官方最接近的实现是**分段控件 / 标签条**，其 token 组完整存在于
 *   `web/src/styles/codex/official-tokens.css`：`--segmented-control-*`（轨道底 / 2px 间距 /
 *   2px 内距 / 选中底 / 选中阴影 / 文字 600 / 1px 高亮内缩），标签条内距另有
 *   `codex-ui/styles/shell.css` 的 `._TabStripInset_11q0v_2`。
 *
 * 本件 = 那组 token 的直译，逐条映射写在 `tabs.css` 头注释，**没有字面量控件数值**。
 * 键盘/语义沿用 Radix Tabs。
 *
 * API 与 `@/components/ui/tabs` 同名同参（`TabsList` 的 `variant: default | line` 保留），
 * 迁移时只需换 import 路径。
 */

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps extends ComponentProps<typeof TabsPrimitive.List> {
  variant?: "default" | "line";
}

export function TabsList({ className, variant = "default", ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn("cx-tabs__list", className)}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("cx-tabs__trigger", className)} data-slot="tabs-trigger" {...props} />;
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("cx-tabs__content", className)} data-slot="tabs-content" {...props} />;
}