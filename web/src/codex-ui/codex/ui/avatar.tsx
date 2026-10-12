"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./avatar.css";

/**
 * 头像。
 *
 * ⚠️ **官方无 Avatar 组件**（壳 src/ui/** 无此件），但 **token 组完整**：
 *   `--avatar-size`(28px) · `--avatar-radius`(--radius-full) · `--avatar-font-size-scaling`(.5)
 *   · `--avatar-image-border-color`（官方 --alpha-04 / --alpha-15 双档）· `--avatar-group-*`。
 *   本件 = 该 token 组的直译（`avatar.css` 头注释有逐条映射），无字面量尺寸/颜色。
 *
 * API 与 `@/components/ui/avatar` 一致（`Avatar` / `AvatarImage` / `AvatarFallback`）。
 */

export const Avatar = ({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) => (
  <AvatarPrimitive.Root className={cn("cx-avatar", className)} data-slot="avatar" {...props} />
);

export const AvatarImage = ({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) => (
  <AvatarPrimitive.Image className={cn("cx-avatar__image", className)} data-slot="avatar-image" {...props} />
);

export const AvatarFallback = ({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Fallback>) => (
  <AvatarPrimitive.Fallback className={cn("cx-avatar__fallback", className)} data-slot="avatar-fallback" {...props} />
);