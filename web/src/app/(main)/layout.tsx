"use client";

import type { ReactNode } from "react";
import * as React from "react";

import { AppSidebar } from "@/app/(main)/_components/sidebar/app-sidebar";
import { AppMenuBar, CodexRail } from "@/codex-ui/shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { getClientCookie } from "@/lib/cookie.client";
import { cn } from "@/lib/utils";

import { MainContent } from "./_components/main-content";

// 外壳 chrome 的样式（导轨 / 面板 / 顶部菜单栏），只作用于 (main) 分组
import "@/codex-ui/shell/codex-shell.css";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  // Client-side auth gate — replaces the Next proxy/middleware that static export
  // disables. No token → bounce to /login; render nothing until confirmed so no
  // protected UI (or its API calls) flashes for a logged-out visitor.
  const [authed, setAuthed] = React.useState(false);
  React.useEffect(() => {
    if (auth.getToken()) {
      setAuthed(true);
    } else {
      // 客户端守卫认为未登录时，必须同时清掉 cookie：否则 proxy.ts 仅凭
      // “cookie 存在”就把我们从 /login 又重定向回主界面，与本守卫来回弹跳
      // 形成无限重定向 → 白屏（cookie 与 localStorage 不一致时触发）。
      auth.clearToken();
      window.location.href = "/login";
    }
  }, []);

  // 是否被**宿主壳层**托管（artex-desktop 客户端的 src/shell 用 iframe 装这一页）。
  //
  // 为什么必须判：客户端自己就是一层 codex 壳（导轨/面板/菜单栏）。如果这里再渲染一遍，
  // 画面上就会**叠两层壳** —— 而且登录后控制台硬编码跳 /function/tasks（login/page.tsx:50,73），
  // 那个路由同样带着这套 chrome，光靠「有没有走 /embed 布局」挡不住。
  //
  // 判定用 window.self !== window.top：它只看「我是不是被嵌在别人的文档里」，与具体路由无关，
  // 所以任何路由（含登录回跳后的 /function/tasks）都不会再叠第二层壳。
  const [embedded, setEmbedded] = React.useState(false);
  React.useEffect(() => {
    try {
      setEmbedded(window.self !== window.top);
    } catch {
      // 跨源访问 window.top 被拒 ⇒ 一定在别人的文档里
      setEmbedded(true);
    }
  }, []);

  const defaultOpen = typeof document === "undefined" ? true : getClientCookie("sidebar_state") !== "false";

  if (!authed) return null;

  // 被托管时：只给上下文（对话页要用 useSidebar），不渲染任何 chrome —— 壳由宿主提供。
  if (embedded) {
    return <SidebarProvider className="min-h-0 flex-1 flex-col">{children}</SidebarProvider>;
  }

  // Codex Desktop 复刻（参考端 1280×816 实测几何）：
  //   _Layout_          = flex-col，padding 0 4px 4px 0
  //   _ApplicationMenuTopBar_ = [0,0,1276,36]  ← 顶部 36px 应用程序菜单栏
  //   行容器            = [0,36,1276,776]      ← flex-1
  //   图标导轨          = [0,44,52,768]（行容器内再留 8px 上边距）
  //   主表面            = [52,44,1224,768]，圆角 12 12 4 0
  //   对话面板          = [52,44,288,768]，浮在主表面之上（不占布局宽度）
  return (
    // codex-shell-root：窗口底色 = 官方 --app-color-background-shell(rgb(40,40,40))，
    // 覆盖 _Layout_ 的 4px 右/下留白（参考端 (2,812) 采样）。
    <div className="codex-shell-root flex h-svh flex-col pr-[4px] pb-[4px]">
      <SidebarProvider defaultOpen={defaultOpen} className="min-h-0 flex-1 flex-col">
        <AppMenuBar />
        <div className="relative flex max-h-full min-h-0 w-full flex-1">
          <CodexRail />
          <AppSidebar
            resizable
            variant="floating"
            collapsible="offcanvas"
          />
          <SidebarInset
            className={cn(
              "codex-surface mt-2 ml-[3.25rem]",
              "[html[data-content-layout=centered]_&>*]:mx-auto",
              "[html[data-content-layout=centered]_&>*]:w-full",
              "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
              "[--dashboard-header-height:--spacing(12)]",
              "min-w-0 overflow-x-hidden",
            )}
          >
            <MainContent>{children}</MainContent>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
