"use client";

import { type ReactNode, useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountSwitcher } from "./sidebar/account-switcher";
import { LayoutControls } from "./sidebar/layout-controls";
import { SearchDialog } from "./sidebar/search-dialog";
import { ThemeSwitcher } from "./sidebar/theme-switcher";
import { UpdateBadge } from "./update-badge";

// 任务详情页保持原样：它自带头部/Tabs 与内边距，这里不再叠加全局头部和 padding。
function isFullBleed(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  return p.startsWith("/function/tasks/");
}

// /chat 是 Codex 的对话面：参考端主表面上方没有 ARTEX 式全局头部
// （搜索框 / 版本徽标 / 主题与布局开关 / 头像），整块不渲染，避免多出一条工具栏。
function isHeaderless(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  // 设置页与对话页一样使用 Codex 的整面布局：主表面没有 ARTEX 全局头部，
  // 面板顶部保留「设置 / 搜索」自己的导航头。
  return p.startsWith("/chat") || p.startsWith("/system/settings");
}

// Codex 工作区页（任务 / 发现 / 内网）的顶栏是 52px，内容从它下面开始；
// 这与对话页/设置页的整面布局不同。
function isWorkspacePage(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  return p.startsWith("/function/tasks") || p.startsWith("/function/findings") || p.startsWith("/intranet");
}

export function MainContent({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const pathname = usePathname();
  const { open, isMobile } = useSidebar();
  const [version, setVersion] = useState("");

  // 左侧 288px 面板是「浮」在主表面之上的，不占布局宽度（Codex 实测几何）。
  // 所以主内容必须自己让开这段宽度，否则每页左侧 288px 会被面板盖住。
  const panelOpen = open && !isMobile;
  // 注意：带 data-content-padding=false 的页面（如 /chat）会被 `md:has-data-[...]:p-0` 把
  // 内边距整体清零，而它的变体数比 `md:pl-*` 多、在 Tailwind 里排在后面 —— 所以
  // 让开面板这件事必须两种形态都写一遍，否则 chat 路由上会被 p-0 吃掉。
  const padForPanel = panelOpen
    ? "md:pl-[var(--sidebar-width)] md:has-data-[content-padding=false]:pl-[var(--sidebar-width)]"
    : undefined;

  useEffect(() => {
    api
      .health()
      .then((h) => setVersion((h.version ?? "").replace(/^v(?=\d)/, "")))
      .catch(() => setVersion(""));
  }, []);

  if (isFullBleed(pathname)) {
    return <>{children}</>;
  }

  const headerless = isHeaderless(pathname);
  const settingsPage = pathname.startsWith("/system/settings");
  const workspacePage = isWorkspacePage(pathname);

  return (
    <>
      {!headerless && (
        <header
          className={cn(
            "flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear",
            workspacePage
              ? "h-[52px] group-has-data-[collapsible=icon]/sidebar-wrapper:h-[52px]"
              : "h-12 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
            // 顶部工具栏属于主表面；打开面板时让它从面板右缘开始，避免压在面板头上。
            panelOpen && "md:ml-[var(--sidebar-width)]",
          )}
        >
          <div className={cn("flex w-full items-center justify-between", workspacePage ? "px-2" : "px-4 lg:px-6")}>
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <SearchDialog />
            </div>
            <div className="flex items-center gap-2">
              {version && (
                <span className="font-medium text-muted-foreground text-xs tabular-nums">版本 · {version}</span>
              )}
              <UpdateBadge />
              <LayoutControls />
              <ThemeSwitcher />
              <AccountSwitcher users={[currentUser]} />
            </div>
          </div>
        </header>
      )}
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
