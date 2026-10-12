"use client";

import * as React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/codex-ui/codex/ui";
import { CodexPlus } from "@/components/icons/codex";
import { api } from "@/lib/api";
import type { Conversation } from "@/lib/types";

import { PageList } from "./page-list";

/**
 * 面板里的对话列表（非 chat 路由）。
 *
 * 官方面板在 /plugins、/explore 这类页面上放的就是**对话列表**（新聊天 + 项目 + 最近），
 * 而不是全站导航 —— 导航只在 52px 导轨上（对照 shell-plugins.png）。
 * chat 路由的面板列表由对话页自己 portal（它要管选中态），所以这里用 data-chat-list 排除，
 * 避免同一份列表出现两次。
 */
export function ConversationsPanel() {
  const pathname = usePathname();
  const [convs, setConvs] = React.useState<Conversation[]>([]);

  React.useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .conversations()
        .then((list) => {
          if (alive) setConvs(list ?? []);
        })
        .catch(() => {
          /* 拉不到就保持空列表：面板不是关键路径 */
        });
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return (
    <PageList
      action={
        /* 最小验证点（goal ②）：这里改用逐字节复制来的壳 Button，并且是 `asChild` 档 ——
           它正是之前整页崩的那条 Slot 路径。样式（高 30 / 圆角 12.5 / 8% 底 / 14·430）
           全部由壳的 .cx-btn[data-size] 承担，页面不再自写数值。 */
        <Button asChild block size="md" variant="soft">
          <Link prefetch={false} href="/chat">
            <CodexPlus size={16} />
            新聊天
          </Link>
        </Button>
      }
      items={convs.slice(0, 80).map((c) => ({
        key: String(c.id),
        title: c.title?.trim() || "新对话",
        meta: c.agent_key ? `Agent · ${c.agent_key}` : undefined,
        href: `/chat?c=${c.id}`,
      }))}
      empty="暂无对话"
    />
  );
}