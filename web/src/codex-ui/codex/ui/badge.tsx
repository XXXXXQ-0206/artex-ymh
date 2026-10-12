import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./badge.css";

/** 官方 --badge-size-{sm,md,lg} = 20 / 22 / 24 px（official-tokens.css 原文）。 */
export type BadgeSize = "sm" | "md" | "lg";
/** 全部落在官方语义 token 上；默认档就是 --color-background-primary-soft-alpha（白 12%）。 */
export type BadgeTone = "neutral" | "muted" | "danger";

export interface BadgeProps extends ComponentProps<"span"> {
  size?: BadgeSize;
  tone?: BadgeTone;
  /** 前置指示点（官方 --badge-indicator-size-*）；传 true 用 currentcolor 画一个圆点。 */
  indicator?: boolean;
}

/**
 * 徽标。
 *
 * ⚠️ **官方无对应组件**：壳的 `src/ui/**` 与官方抽取出的 CSS 里都查不到 Badge 实现
 *   （`ui.css` 全文无 badge 规则，112 个 CSS module 哈希里也没有 Badge 类名）。
 *   因此本件不是「逐字节复制」，而是**官方 --badge-* token 组的直译**：
 *     token 出处 web/src/styles/codex/official-tokens.css（官方原文 @layer theme）
 *       --badge-size-{sm,md,lg}      = 20 / 22 / 24 px
 *       --badge-gutter-{sm,md,lg}    = 5 / 6 / 8 px
 *       --badge-radius-{sm,md,lg}    = 5 / 5 / 7.5 px
 *       --badge-font-size-{sm,md,lg} = 12 / 13 / 13 px
 *       --badge-font-weight-*        = 600
 *       --badge-tracking-{sm,md,lg}  = wide / normal / normal
 *       --badge-icon-font-size-* / --badge-indicator-size-*
 *   底色与文字色走官方语义 token（--color-background-primary-soft-alpha /
 *   --color-background-danger-soft-alpha / --color-text-danger / --color-text-tertiary）。
 *   本文件里**没有任何手写尺寸/字号/字重/颜色**，全部经 badge.css 引官方 token。
 */
export function Badge({ className, size = "sm", tone = "neutral", indicator, children, ...props }: BadgeProps) {
  return (
    <span className={cn("cx-badge", "cx-anim", className)} data-size={size} data-tone={tone} {...props}>
      {indicator ? <span aria-hidden className="cx-badge__indicator" /> : null}
      {children}
    </span>
  );
}