import type { ReactNode } from "react";

import type { Metadata } from "next";

import { CodexHostNavBridge } from "@/codex-host";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      data-codex-window-type="electron"
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
        {/* Codex 官方按窗口类型切换样式（browser: / electron: 变体）。
            桌面端 SSR 默认 electron；用浏览器直接开 8787 时在首屏前切回 browser。 */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 需要在首屏前同步执行，不能等 hydration
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!window.artexDesktop)document.documentElement.setAttribute('data-codex-window-type','browser')}catch(e){}",
          }}
        />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <TooltipProvider>
          <PreferencesStoreProvider
            themeMode={theme_mode}
            themePreset={theme_preset}
            contentLayout={content_layout}
            navbarStyle={navbar_style}
            font={font}
          >
            {children}
            <Toaster />
            {/* Codex 外壳宿主桥：仅在「被外壳托管」时激活（独立打开本控制台时完全惰性，
                不发任何消息、不抛异常）。协议见 src/codex-host/protocol.ts。
                用 NavBridge 变体：它同时把 codex-host:navigate 接到应用路由 ——
                托管态下外壳的导轨就是靠这条通道驱动本控制台的（2026-10-13）。 */}
            <CodexHostNavBridge />
          </PreferencesStoreProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}