"use client";

import * as React from "react";

import { EllipsisVertical, KeyRound, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CodexPersonCircle } from "@/components/icons/codex";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/utils";

import { ChangePasswordDialog } from "./change-password-dialog";

type AccountUser = {
  readonly name: string;
  readonly email: string;
  readonly avatar: string;
};

// 账户菜单的「行为」集中在这里，面板里那行与导轨底部那个图标按钮共用同一份逻辑。
function useAccountActions() {
  const [pwOpen, setPwOpen] = React.useState(false);

  function handleLogout() {
    // 先吊销服务端 refresh token(F6),再清本地登录态;refresh 已失效也照常登出。
    void api
      .logout()
      .catch(() => {
        // refresh 已失效也照常登出,本地清理在 finally 里完成。
      })
      .finally(() => {
        auth.clearToken();
        // 硬跳转：让浏览器用已清除的 cookie 发起全新请求，
        // middleware 才能正确读到空标记并放行 /login
        window.location.href = "/login";
      });
  }

  return { pwOpen, setPwOpen, handleLogout };
}

function AccountMenuContent({
  user,
  isMobile,
  onPassword,
  onLogout,
}: {
  user: AccountUser;
  isMobile: boolean;
  onPassword: () => void;
  onLogout: () => void;
}) {
  return (
    <DropdownMenuContent
      className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
      side={isMobile ? "bottom" : "right"}
      align="end"
      sideOffset={4}
    >
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user.avatar || undefined} alt={user.name} />
            <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-muted-foreground text-xs">{user.email}</span>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onPassword}>
        <KeyRound />
        修改密码
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
        <LogOut />
        退出登录
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

export function NavUser({ user }: { readonly user: AccountUser }) {
  const { isMobile } = useSidebar();
  const account = useAccountActions();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <AccountMenuContent
            user={user}
            isMobile={isMobile}
            onPassword={() => account.setPwOpen(true)}
            onLogout={account.handleLogout}
          />
        </DropdownMenu>
      </SidebarMenuItem>
      <ChangePasswordDialog open={account.pwOpen} onOpenChange={account.setPwOpen} />
    </SidebarMenu>
  );
}

/**
 * 导轨底部的账户入口（官方 rail 底部第二个图标就是它）。
 *
 * 为什么要有这个：官方面板里**没有账户行**（账户在导轨底部），面板底部那行是 ARTEX 自己的。
 * 把面板 footer 收掉（见 codex-shell.css 的 html[data-chat-list="on"] 规则）后，
 * 账户菜单必须还有入口，于是这里复用同一份菜单内容与登出/改密逻辑。
 */
export function AccountRailButton({ user, label = "账户" }: { user: AccountUser; label?: string }) {
  const { isMobile } = useSidebar();
  const account = useAccountActions();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" title={label} aria-label={label} className="codex-rail-item shrink-0">
            <CodexPersonCircle size={20} />
          </button>
        </DropdownMenuTrigger>
        <AccountMenuContent
          user={user}
          isMobile={isMobile}
          onPassword={() => account.setPwOpen(true)}
          onLogout={account.handleLogout}
        />
      </DropdownMenu>
      <ChangePasswordDialog open={account.pwOpen} onOpenChange={account.setPwOpen} />
    </>
  );
}
