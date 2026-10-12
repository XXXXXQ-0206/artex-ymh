"use client";

import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import type { ComponentProps } from "react";

/**
 * 折叠面板。
 *
 * ⚠️ **官方无对应组件**，且**不需要任何样式**：官方折叠（如设置分区）由使用方的
 *   按钮与行件承载，Radix 只提供 aria/键盘行为。故本件不引入 css 文件，
 *   也不写任何数值 —— 与 shadcn 同名同参。
 */

export function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger(props: ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

export function CollapsibleContent(props: ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />;
}