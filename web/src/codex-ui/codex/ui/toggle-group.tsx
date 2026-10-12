"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./toggle-group.css";

/**
 * 钮组。
 *
 * ⚠️ **官方无对应组件**；官方最接近的是**分段控件**，其 token 组完整存在
 *   （`--segmented-control-*`，与复制层 tabs 同源）。本件是该组 token 的直译，
 *   逐条映射见 `toggle-group.css` 头注释，无字面量数值。
 * API 与 `@/components/ui/toggle-group` 一致：`ToggleGroup / ToggleGroupItem`。
 */

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn("cx-toggle-group", className)} data-slot="toggle-group" {...props} />;
}

export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return <ToggleGroupPrimitive.Item className={cn("cx-toggle-group__item", className)} data-slot="toggle-group-item" {...props} />;
}