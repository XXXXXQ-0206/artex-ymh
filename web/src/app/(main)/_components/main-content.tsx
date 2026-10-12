"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// 任务详情页保持原样：它自带头部/Tabs 与内边距，这里不再叠加全局头部和 padding。
//
// ⚠️ 判定必须**精确到详情段**，不能用 `startsWith("/function/tasks/")`：
// 静态导出开了 trailingSlash，列表页的 pathname 是 "/function/tasks/"（带尾斜杠），
// 于是列表页也被当成全出血页 ⇒ 既不叠加页头、也拿不到让开 288px 面板的内边距，
// 结果整页内容被面板压住（2026-10-12 实测：页面根 [53,45,1222,481]，工具条顶到 x=53）。
function isFullBleed(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  // 只认详情页：/function/tasks/detail 或 /function/tasks/detail/…
  return /^\/function\/tasks\/detail(\/|$)/.test(p);
}

export function MainContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { open, isMobile } = useSidebar();

  // 左侧 288px 面板是「浮」在主表面之上的，不占布局宽度（Codex 实测几何）。
  // 所以主内容必须自己让开这段宽度，否则每页左侧 288px 会被面板盖住。
  const panelOpen = open && !isMobile;
  // 注意：带 data-content-padding=false 的页面（如 /chat）会被 `md:has-data-[...]:p-0` 把
  // 内边距整体清零，而它的变体数比 `md:pl-*` 多、在 Tailwind 里排在后面 —— 所以
  // 让开面板这件事必须两种形态都写一遍，否则 chat 路由上会被 p-0 吃掉。
  const padForPanel = panelOpen
    ? "md:pl-[var(--sidebar-width)] md:has-data-[content-padding=false]:pl-[var(--sidebar-width)]"
    : undefined;

  if (isFullBleed(pathname)) {
    return <>{children}</>;
  }

  const settingsPage = pathname.startsWith("/system/settings");

  return (
    <>
      {/* 主表面里**没有** ARTEX 自造的全局页头：官方的等价入口各自在正确的位置 ——
          面板开关：菜单栏「视图 → 显示/隐藏侧边栏」+ Ctrl/Cmd+Shift+S（ShellShortcuts）
          搜索：面板头右上的搜索图标 + Ctrl/Cmd+J（SearchDialog 自己绑）
          外观/主题/字体/布局：设置页「外观」分区（AppearanceControls）
          账户：52px 导轨底部的人像按钮
          版本/更新：设置页「版本与更新」卡片
          见 docs：2026-10-12 的页头撤销说明。 */}
      <div
        data-codex-settings-scroll={settingsPage ? "true" : undefined}
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0",
          // 设置页的顶部留白与内容列位置由 codex-settings.css 统一控制，
          // 以压过 md:p-6 的变体优先级。
          "transition-[padding-left] duration-300 ease-[cubic-bezier(.19,1,.22,1)]",
          padForPanel,
        )}
      >
        {children}
      </div>
    </>
  );
}
