"use client";

import type { ReactNode } from "react";
import * as React from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";

/**
 * 嵌入布局（/embed/**）：只保留 Provider 与登录闸门，**不含任何外壳 chrome**。
 *
 * 为什么需要它：ARTEX 控制台自带一层 codex 外壳（(main)/layout.tsx 里的 AppMenuBar /
 * CodexRail / AppSidebar / SidebarInset）。当内容面要被 **codex 壳层客户端**（artex-desktop
 * 的 src/shell）托管时，如果整页塞进去就会**套两层壳** —— 这一层就是用来把外壳摘掉的：
 * 客户端负责壳，控制台只出内容。
 *
 * 保留的东西必须与 (main)/layout.tsx 对齐，否则页面会缺上下文或漏掉鉴权：
 *   · SidebarProvider —— 对话页用 useSidebar()（toggleSidebar 等），缺了它组件直接抛错；
 *   · 登录闸门 —— 与 (main) 同一套逻辑：无 token 就清 cookie 并跳 /login，
 *     否则静态导出下没有任何东西挡住未登录访问。
 */
export default function EmbedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    if (auth.getToken()) {
      setAuthed(true);
    } else {
      auth.clearToken();
      window.location.href = "/login";
    }
  }, []);

  if (!authed) return null;

  return (
    <SidebarProvider className="min-h-0 flex-1 flex-col">
      {children}
    </SidebarProvider>
  );
}
