"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useShallow } from "zustand/react/shallow";

import { CodexBell, CodexChevronDown, CodexSearch, CodexWordmark } from "@/components/icons/codex";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { SettingsNav } from "./settings-nav";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { sidebarVariant, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  // Codex 参考端是 offcanvas：288px 面板整体滑出，52px 导轨保留。
  // icon 模式会把面板压到 70px，让标题/导航/对话列表挤在一起。
  const collapsible = "offcanvas";

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      {/* 面板头：参考端 [52,44,288,90]，内部导航头 264×52 @ x=68（ms-2）padding-right 4px：
          左「应用名 ⌄」+ 右侧两个 24×24 图标按钮（通知 / 搜索）。 */}
      <SidebarHeader>
        <div className="flex h-[52px] shrink-0 items-center ps-2 pe-1">
          <Link prefetch={false} href="/chat" aria-label="ARTEX" className="flex min-w-0 items-center gap-1">
            <CodexWordmark size={18} />
            <CodexChevronDown size={16} />
          </Link>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="通知"
              title="通知"
              className="codex-panel-icon-button"
              onClick={() => router.push("/system/intercept/approvals/")}
            >
              <CodexBell size={16} />
            </button>
            <button
              type="button"
              aria-label="搜索"
              title="搜索"
              className="codex-panel-icon-button"
              onClick={() => {
                // 复用 ARTEX 已有的全局搜索弹层（SearchDialog 监听 Ctrl/Cmd+J）
                document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
              }}
            >
              <CodexSearch size={16} />
            </button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Codex 式外壳：面板主体是「对话列表」（由 /chat 页 portal 渲染进来）；
            导航已经在 52px 导轨上，故 chat 路由下隐藏这里的 NavMain（见 globals.css 的
            html[data-chat-list="on"] 规则），其余路由仍用它。 */}
        <div id="chat-conversations-slot" className="flex min-h-0 min-w-0 flex-1 flex-col" />
        {/* Codex 页面范式：面板放**当前页的列表**（任务/发现/内网…各自 portal 进来）。
            打开 html[data-page-list="on"] 时隐藏下面的全站导航，见 codex-shell.css。 */}
        <div id="page-list-slot" className="flex min-h-0 min-w-0 flex-1 flex-col" />
        {/* Codex 设置页会把面板换成"设置导航"（搜索 + 分组 + 条目），见 globals.css 的
            html[data-settings-nav="on"] 规则：该属性下隐藏主导航。 */}
        <div data-slot="sidebar-settings-nav" className="hidden min-h-0 min-w-0 flex-1 flex-col">
          <SettingsNav />
        </div>
        <div data-slot="sidebar-nav-main" className="codex-app-nav">
          <NavMain items={sidebarItems} />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
