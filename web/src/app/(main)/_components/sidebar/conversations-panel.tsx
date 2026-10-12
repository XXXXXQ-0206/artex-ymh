"use client";

import * as React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <Link
          prefetch={false}
          href="/chat"
          className="flex h-[30px] w-full items-center gap-2 rounded-[12.5px] bg-[rgb(255_255_255_/_0.08)] px-2 text-[14px] leading-5 text-[color:var(--codex-text-strong)] hover:bg-[rgb(255_255_255_/_0.12)]"
        >
          <CodexPlus size={16} />
          新聊天
        </Link>
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
