"use client";

import type { ReactElement } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  CodexGearLg,
  CodexRailHome,
  CodexRailHomeActive,
  CodexRailReview,
  CodexRailScheduled,
  // 官方 globe-light-20（20 画布）；组件名 CodexTranslate 是它在官方 UI 里的另一处用途
  CodexTranslate,
} from "@/components/icons/codex";
import { AccountRailButton } from "@/app/(main)/_components/sidebar/nav-user";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

/* ============================================================================
 * Codex Desktop 左侧 52px 图标导轨（R3 · shared shell module）
 *
 * 参考端 nav[aria-label=应用导航] = [0,44,52,768]，padding 8px 8px 4px，gap 8px；
 * 条目 button = 36×36、圆角 12.5px、svg 20×20 @ x=16，x=8；
 * 顶部品牌位 y=52，导航条目依次 y=96 / 140 / 184（步进 44 = 36 + 8），
 * 底部账户按钮贴底（y=772，底边 = 812 − 4）。
 * 出处：evidence/codex-desktop/captures/tree-aside.json + 参考端样式普查。
 *
 * 图标全部来自官方图标集 web/src/components/icons/codex（task-2 产出，官方原 path）。
 * 语义映射：对话→RailHome / 任务→RailScheduled / 发现→RailReview /
 *           内网→globe-light-20 / 设置→GearLg / 账户→PersonCircle / 品牌位→Blossom。
 * ========================================================================== */

type IconComponent = (props: { size?: number; className?: string }) => ReactElement;

const RAIL_ITEMS: { href: string; label: string; icon: IconComponent; activeIcon?: IconComponent }[] = [
  {
    href: "/chat",
    label: "对话",
    icon: CodexRailHome as IconComponent,
    activeIcon: CodexRailHomeActive as IconComponent,
  },
  { href: "/function/tasks", label: "任务", icon: CodexRailScheduled as IconComponent },
  { href: "/function/findings", label: "发现", icon: CodexRailReview as IconComponent },
  { href: "/intranet", label: "内网", icon: CodexTranslate as IconComponent },
];

export function CodexRail() {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/system");
  const currentUser = useCurrentUser();

  return (
    <nav aria-label="应用导航" className="codex-rail fixed inset-y-0 start-0 z-30 flex flex-col items-center">
      {/* 导轨没有品牌位：官方品牌（花标）在顶部 36px 菜单栏里（[6,4,28,28]），
          导轨第一个条目就是**当前页**（y=52，36×36，选中态底 rgba(255,255,255,.08)）。
          曾在这里放花标，导致所有条目整体下移 44px。 */}

      {/* 中部导航：参考端 y=52 / 96 / 140 / 184（步进 44 = 36 + 8） */}
      <div className="flex flex-col items-center gap-2">
        {RAIL_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = active && item.activeIcon ? item.activeIcon : item.icon;
          return (
            <Link
              key={item.href}
              prefetch={false}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn("codex-rail-item shrink-0", active && "codex-rail-item-active")}
            >
              <Icon size={20} />
            </Link>
          );
        })}
      </div>

      {/* 底部账户 / 设置：参考端贴底（y=772，底边 = 812 − 4） */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <Link
          prefetch={false}
          href="/system/settings"
          title="设置"
          aria-label="设置"
          aria-current={settingsActive ? "page" : undefined}
          className={cn("codex-rail-item shrink-0", settingsActive && "codex-rail-item-active")}
        >
          <CodexGearLg size={20} />
        </Link>
        {/* 账户：官方这里打开的是账户菜单（不是再跳一次设置页） */}
        <AccountRailButton user={currentUser} />
      </div>
    </nav>
  );
}
